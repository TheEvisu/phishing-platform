# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
apps/management/   # Port 3001 — auth, organizations, attempts CRUD + bulk + stats, templates CRUD + seed
apps/simulation/   # Port 3000 — email sending via Nodemailer, click tracking
libs/shared/       # AttemptStatus enum (pending|sent|clicked|failed), Winston logger config
```

Shared lib is imported as `@app/shared`. Both `tsconfig.app.json` files set `rootDir: "../.."` and include `../../libs/**/*` to make this work.

### Multi-tenant organizations

Every user belongs to exactly one `Organization`. Registration has two paths:

- `POST /auth/register-org` — creates an `Organization` + first user with role `org_admin`. Generates a random invite code (`INV-XXXXXXXX` via `crypto.randomBytes`).
- `POST /auth/register` — requires a valid `inviteCode`, creates a user with role `member` linked to that org.

The `Organization` schema (`schemas/organization.schema.ts`) stores `name`, `slug` (unique), and `inviteCode` (unique). Admins can regenerate the invite code via `POST /organizations/invite/regenerate` — the old code is immediately invalidated.

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

The same pattern applies in `TemplatesService`.

### Auth

JWT payload includes `username`, `sub`, `organizationId`, and `role`. Token is stored in an **httpOnly cookie** (`access_token`), not returned in the response body. `cookie-parser` middleware is registered in `main.ts`. `JwtStrategy` extracts the token from `req.cookies.access_token`. `COOKIE_OPTIONS` in `auth.controller.ts` sets `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in production.

### Management → Simulation communication

`AttemptsService.createAttempt()` calls `POST /phishing/send` on the Simulation service via Axios with a 5 s timeout. The payload requires `recipientEmail`, `subject`, `content`, and `attemptId`. The `{{TRACKING_LINK}}` placeholder in `content` is replaced by the Simulation service with a real tracking URL before the email is sent.

### Attempt lifecycle

```
POST /attempts → status: pending → Simulation sends email → status: sent
Recipient clicks /phishing/click/:id → status: clicked
SMTP failure → status: failed
```

Status updates are pushed to connected frontend clients via SSE (`GET /attempts/events`). The stream is scoped by `organizationId` and role — admins receive all org events, members only their own.

Both services have their own MongoDB database. The Simulation DB tracks click events; the Management DB is the source of truth for attempt records.

### Version middleware

`VersionMiddleware` (`common/version.middleware.ts`) attaches `X-App-Version` (from `process.env.APP_VERSION`, default `0.0.1`) to every response. The frontend compares this against `VITE_APP_VERSION` and reloads if there is a mismatch.

### Validation

Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` in both `main.ts` files. All DTOs use class-validator decorators. Env vars validated at startup by a Joi schema in `apps/*/src/config/` — the service refuses to start if required vars are missing.

### Templates seed

`POST /templates/seed` calls `TemplatesService.seedDefaults()` which creates 6 pre-built English phishing templates (IT, HR, Finance, Executive categories). Dedup check is by `name` within the same `organizationId` — safe to call multiple times.

### Tests

Unit specs sit next to source files (`*.spec.ts`). E2e specs are in `apps/*/test/app.e2e-spec.ts`. All MongoDB and SMTP dependencies are mocked — no real database or SMTP server needed. The Jest config (`jest.config.js`) uses `moduleNameMapper` to resolve `@app/shared`.

Covered service specs: `auth.service`, `attempts.service`, `templates.service`, `organization.service`.
