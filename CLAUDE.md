# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

Never use `// ─── Section Name ───` style section divider comments. Never use em-dash (`—`) in comments — use a regular hyphen (`-`) instead. Both patterns look AI-generated.

## Two Repositories

This project consists of two sibling directories on the Desktop:

- **`phishing-platform/`** — NestJS monorepo backend (this repo)
- **`phishing-dashboard/`** — React frontend

Both must run simultaneously for the app to work.

---

## Commands

```bash
# Run services (each in its own terminal)
npm run start:management   # Management API on port 3001 (hot reload)
npm run start:simulation   # Simulation service on port 3000 (hot reload)

# Build
npm run build:management
npm run build:simulation

# Tests
npm test                   # All unit + e2e tests
npm run test:watch
npm run test:cov

# Run a single test file
npx jest apps/management/src/auth/auth.service.spec.ts
npx jest --testPathPattern="auth"

# TypeScript check (no emit)
npx tsc -p apps/management/tsconfig.app.json --noEmit
npx tsc -p apps/simulation/tsconfig.app.json --noEmit
```

---

## Architecture

### Monorepo layout

```
apps/management/   # Port 3001 — auth, organizations, attempts CRUD + bulk + stats, templates CRUD + seed, campaigns
apps/simulation/   # Port 3000 — email sending via Nodemailer, click tracking
libs/shared/       # AttemptStatus enum (pending|sent|clicked|failed), Winston logger config
```

Shared lib is imported as `@app/shared`. Both `tsconfig.app.json` files set `rootDir: "../.."` and include `../../libs/**/*` to make this work.

### Multi-tenant organizations

Every user belongs to exactly one `Organization`. Registration has two paths:

- `POST /auth/register-org` — creates an `Organization` + first user with role `org_admin`. Generates a random invite code (`INV-XXXXXXXX` via `crypto.randomBytes`).
- `POST /auth/register` — requires a valid `inviteCode`, creates a user with role `member` linked to that org.

The `Organization` schema (`schemas/organization.schema.ts`) stores `name`, `slug` (unique), `inviteCode` (unique), and `smtpConfig` (optional, see below).

Admins can regenerate the invite code via `POST /organizations/invite/regenerate` — the old code is immediately invalidated.

### UserCtx and data isolation

Controllers pass `req.user` (typed as `UserCtx`) to every service method — never just `req.user.username`.

```ts
interface UserCtx {
  username: string;
  role: string;           // 'org_admin' | 'member'
  organizationId: Types.ObjectId;
}
```

`AttemptsService.buildFilter(user)` is the single point of truth for query scoping:
- `org_admin` → `{ organizationId }` — sees all org data
- `member` → `{ organizationId, createdBy }` — sees only own data

The same pattern applies in `TemplatesService` and `CampaignsService`.

### Auth

JWT payload includes `username`, `sub`, `organizationId`, and `role`. Token is stored in an **httpOnly cookie** (`access_token`), not returned in the response body. `cookie-parser` middleware is registered in `main.ts`. `JwtStrategy` extracts the token from `req.cookies.access_token`. `COOKIE_OPTIONS` in `auth.controller.ts` sets `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in production.

`JwtStrategy.validate()` returns `null` (→ 401) if the user has no `organizationId` — guards against pre-migration users and prevents `find({ organizationId: undefined })` from leaking cross-org data.

### Per-org SMTP configuration

Each organization configures its own outgoing mail server via `PUT /organizations/smtp`. The SMTP password is encrypted at rest using **AES-256-GCM** (`common/crypto.util.ts`). The encryption key is `SMTP_ENCRYPTION_KEY` from env (required in production, has a dev default).

`OrganizationService.getSmtpForSend(orgId)` decrypts and returns the SMTP config. It is called by `AttemptsService` and `CampaignsService` before every simulation request — the decrypted config is passed in the payload so Simulation never touches the database.

SMTP endpoints (org_admin only):
- `GET /organizations/smtp` — returns config with `passwordSet: boolean`, never the actual password
- `PUT /organizations/smtp` — saves config, encrypts password
- `POST /organizations/smtp/test` — calls `nodemailer.verify()`, returns `{ success: true }` or throws `BadRequestException`

If no SMTP is configured for an org, Simulation falls back to its own env vars (`SMTP_HOST`, `SMTP_PORT`, etc.).

### Management → Simulation communication

`AttemptsService.createAttempt()` and `CampaignsService.launch()` call `POST /phishing/send` on the Simulation service via Axios with a 5 s timeout. The payload includes `recipientEmail`, `subject`, `content`, `attemptId`, and an optional `smtp` object (decrypted org SMTP config). The `{{TRACKING_LINK}}` placeholder in `content` is replaced by the Simulation service with a real tracking URL before the email is sent.

Bulk operations return per-email results: `{ sent, failed, total, results: [{ email, success, attemptId, error? }] }`.

### Recipients

`Recipient` schema stores `email` (unique per org, lowercased), `firstName`, `lastName`, `department?`, `tags?[]`, `organizationId`, `createdBy`.

Indexes: `{ organizationId, email }` unique, `{ organizationId, department }`, `{ organizationId, createdAt: -1 }`.

Endpoints (all under `JwtAuthGuard`):
- `POST /recipients` — create one (org_admin only, ConflictException on duplicate email)
- `POST /recipients/import` — bulk upsert by email via `bulkWrite` (idempotent, returns `{ created, updated, total }`)
- `POST /recipients/bulk-delete` — delete many by IDs (org_admin only)
- `GET /recipients` — paginated list with `search` (regex on email/firstName/lastName) and `department` filter
- `GET /recipients/departments` — distinct non-empty department values, sorted
- `GET /recipients/:id` — single record, 404 if wrong org
- `PATCH /recipients/:id` — update, checks email uniqueness (org_admin only)
- `DELETE /recipients/:id` — single delete (org_admin only)

`requireAdmin(user)` helper throws ForbiddenException for non-admins. All queries are scoped by `organizationId` — members can read, only admins can mutate.

### User preferences

`User` schema has an embedded `preferences: { theme, language }` field (both nullable). Stored and synced via:
- `GET /auth/profile` — queries DB fresh (not JWT payload), returns full user including preferences and `organizationName`.
- `PATCH /auth/preferences` — partial update via `$set` with dot-notation paths (`preferences.theme`, `preferences.language`). Validated by `UpdatePreferencesDto` (allowed themes: `light|dark|system`; allowed languages: `en|ru|he|es|de|fr`).

### Campaigns

`Campaign` schema stores `subject` and `content` directly — so email body is not duplicated across all attempt documents. `PhishingAttempt.content` is optional: campaign-based attempts omit it, ad-hoc attempts store it.

`Campaign` also has an embedded `stats: { sent, clicked, failed }` doc (default all zeros). It is updated atomically via `$inc` on every status transition in `AttemptsService.updateAttemptStatus()` — the delta depends on the old status (fetched with `{ new: false }`) to correctly handle `sent→opened` (sent--), `sent→clicked` (sent--, clicked++), `opened→clicked` (clicked++ only). Direct network failures in `launch()` are incremented inline.

`GET /campaigns` reads from the denormalized `stats` field — no `$group` aggregation. `clickRate` is computed in JS from `sent + clicked`. `GET /campaigns/:id` injects `campaign.content` into attempts that have none.

### Training after click

When a recipient clicks a phishing link, the Simulation service records the click and redirects them (HTTP 302) to `{TRAINING_BASE_URL}/{attemptId}` (env var, default `http://localhost:5173/training`). The frontend serves a public `/training/:attemptId` page with phishing awareness educational content.

Management exposes two **public** endpoints (no auth — the UUID acts as a capability token):
- `GET /training/:attemptId` → `{ found, alreadyViewed, viewedAt? }` — used by the training page to show completion state
- `POST /training/:attemptId/viewed` → sets `trainingViewedAt` on the attempt document

`PhishingAttempt` schema now has an optional `trainingViewedAt?: Date` field. Silent no-op if the attemptId is unknown (don't leak existence).

### Attempt lifecycle

```
POST /attempts → status: pending → Simulation sends email → status: sent
Recipient opens email → status: opened
Recipient clicks /phishing/click/:id → status: clicked
SMTP failure → status: failed
```

Status updates are pushed to connected frontend clients via SSE (`GET /attempts/events`). The stream is scoped by `organizationId` and role — admins receive all org events, members only their own.

Both services have their own MongoDB database. The Simulation DB tracks click events; the Management DB is the source of truth for attempt records.

### Security

- `InternalGuard` protects internal endpoints (e.g. `PATCH /attempts/internal/:id/status`). In production, requires `x-service-key` header matching `INTERNAL_SECRET`. Without the env var in production, the guard fails closed (denies all).
- `SMTP_ENCRYPTION_KEY` must be 32+ characters. Required in production. Dev default provided.
- `JwtStrategy` null-checks `organizationId` — prevents cross-org data leakage via MongoDB `find({ organizationId: undefined })`.

### Version middleware

`VersionMiddleware` (`common/version.middleware.ts`) attaches `X-App-Version` (from `process.env.APP_VERSION`, default `0.0.1`) to every response. The frontend compares this against `VITE_APP_VERSION` and reloads if there is a mismatch.

### Validation

Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` in both `main.ts` files. All DTOs use class-validator decorators. Env vars validated at startup by a Joi schema in `apps/*/src/config/` — the service refuses to start if required vars are missing.

### Templates seed

`POST /templates/seed` calls `TemplatesService.seedDefaults()` which creates 6 pre-built English phishing templates (IT, HR, Finance, Executive categories). Dedup check is by `name` within the same `organizationId` — safe to call multiple times.

### Tests

Unit specs sit next to source files (`*.spec.ts`). E2e specs are in `apps/*/test/app.e2e-spec.ts`. All MongoDB, SMTP, and nodemailer dependencies are mocked — no real database or SMTP server needed. The Jest config (`jest.config.js`) uses `moduleNameMapper` to resolve `@app/shared`.

Covered service specs: `auth.service`, `attempts.service`, `templates.service`, `organization.service`, `jwt.strategy`.

When adding tests for services that depend on `OrganizationService`, provide a mock: `{ provide: OrganizationService, useValue: { getSmtpForSend: jest.fn().mockResolvedValue(null) } }`.

`AttemptsService` now also injects the `Campaign` model — include `{ provide: getModelToken(Campaign.name), useValue: { updateOne: jest.fn(), findById: jest.fn() } }` in test providers.

### Indexes

`PhishingAttempt`: `{ organizationId, createdAt }`, `{ organizationId, createdBy, createdAt }`, `{ organizationId, status }`, `{ organizationId, email }`, `{ campaignId }`, `{ campaignId, status }`.

`DomainScan`: `{ organizationId, createdAt }` + TTL index on `createdAt` (expireAfterSeconds: 90 days) — completed scans are auto-expired.
