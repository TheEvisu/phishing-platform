# Phishing Platform

A NestJS monorepo for running internal phishing simulation campaigns. Security teams use it to send test phishing emails to employees, track who clicks the links, and measure awareness across the organization.

## Architecture

```
phishing-platform/
├── apps/
│   ├── management/   # REST API for auth, campaigns, templates, attempt tracking  (port 3001)
│   └── simulation/   # Internal service: sends emails, records clicks             (port 3000)
└── libs/
    └── shared/       # AttemptStatus enum + Winston logger config
```

The two services communicate over HTTP: when a user creates a phishing attempt via the Management API, it calls `POST /phishing/send` on the Simulation service. When a recipient clicks the link in the email, the Simulation service records the event and shows an awareness page.

```
Browser → Management (3001) → Simulation (3000) → SMTP server
                                     ↑
                              MongoDB stores attempt,
                              click timestamp, status
```

## Prerequisites

- Node.js 18+
- MongoDB 6+ (local or Atlas)
- SMTP credentials (Gmail, Mailtrap, SendGrid, etc.)

## Installation

```bash
git clone <repo>
cd phishing-platform
npm install
```

## Environment Variables

Create a `.env` file in the project root before starting:

```bash
cp .env.example .env
```

### Management Service

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `production`, or `test` |
| `PORT` | no | `3001` | HTTP port |
| `MONGODB_URI` | no | `mongodb://localhost:27017/phishing-management` | MongoDB connection string |
| `JWT_SECRET` | **yes** | — | Secret for signing JWTs, minimum 32 characters |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Allowed CORS origin (frontend URL) |
| `PHISHING_SIMULATION_URL` | no | `http://localhost:3000` | Internal URL of the Simulation service |

### Simulation Service

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `production`, or `test` |
| `PORT` | no | `3000` | HTTP port |
| `MONGODB_URI` | no | `mongodb://localhost:27017/phishing-simulation` | MongoDB connection string |
| `SMTP_HOST` | no | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | no | `587` | SMTP server port |
| `SMTP_USER` | **yes** | — | SMTP login username |
| `SMTP_PASS` | **yes** | — | SMTP login password / app password |
| `SMTP_FROM` | no | `noreply@phishingtest.com` | Sender address shown in emails |
| `APP_URL` | no | `http://localhost:3000` | Public URL of the Simulation service (used to build tracking links) |

### Example `.env`

```env
NODE_ENV=development
JWT_SECRET=my-super-secret-key-that-is-at-least-32-chars

SMTP_USER=you@gmail.com
SMTP_PASS=app-password-here
```

## Running

```bash
# Terminal 1 – Management service
npm run start:management

# Terminal 2 – Simulation service
npm run start:simulation
```

Both services hot-reload on save via `ts-node-dev`.

## API Reference

### Swagger UI

| Service | URL |
|---|---|
| Management | http://localhost:3001/api/docs |
| Simulation | http://localhost:3000/api/docs |

---

### Management API (port 3001)

#### Authentication

Auth uses **httpOnly cookies**. On login/register the server sets an `access_token` cookie (`httpOnly`, `SameSite=Strict`, `Secure` in production). The browser sends it automatically on every subsequent request — no `Authorization` header needed.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Register a new user, sets auth cookie |
| `POST` | `/auth/login` | No | Login, sets auth cookie |
| `POST` | `/auth/logout` | No | Clears the auth cookie |
| `GET` | `/auth/profile` | Cookie | Get current user info |

**Register / Login request body:**
```json
// POST /auth/register
{
  "username": "alice",           // max 50 chars
  "email": "alice@example.com",  // valid email, max 254 chars
  "password": "secret123"        // min 6, max 128 chars
}

// POST /auth/login
{ "username": "alice", "password": "secret123" }
```

**Response `201`** (register and login return the same shape):
```json
{ "user": { "id": "...", "username": "alice", "email": "alice@example.com", "role": "user" } }
```

The JWT is stored in the `access_token` httpOnly cookie (24 h expiry).

Errors: `400` validation, `401` wrong credentials, `409` username/email taken.
**Rate limit:** 10 requests / 60 s on register and login.

---

#### Attempts

All `/attempts` endpoints require the auth cookie.

| Method | Path | Description |
|---|---|---|
| `GET` | `/attempts` | List your attempts (paginated) |
| `GET` | `/attempts/stats` | Aggregated stats for your attempts |
| `POST` | `/attempts` | Create one attempt + send email |
| `POST` | `/attempts/bulk` | Create up to 500 attempts in one request |
| `GET` | `/attempts/:id` | Get one attempt |
| `DELETE` | `/attempts/:id` | Delete an attempt |

**List attempts**
```http
GET /attempts?page=1&limit=10
```
Response `200`:
```json
{
  "data": [ /* attempt objects */ ],
  "total": 42,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```
`page` defaults to 1, `limit` defaults to 10 (max 100). Only returns attempts created by the authenticated user.

**Stats**
```http
GET /attempts/stats
```
Response `200`:
```json
{ "total": 100, "sent": 90, "clicked": 23, "failed": 10, "clickRate": 25.56 }
```

**Create one attempt**
```http
POST /attempts
Content-Type: application/json

{
  "email": "target@company.com",
  "subject": "Urgent: Reset password",
  "content": "Click {{TRACKING_LINK}} to verify your account."
}
```
Use `{{TRACKING_LINK}}` as a placeholder — the Simulation service replaces it with a real tracking URL before sending. Response `201` returns the saved attempt document.

**Bulk send**
```http
POST /attempts/bulk
Content-Type: application/json

{
  "emails": ["alice@company.com", "bob@company.com"],
  "subject": "Action Required",
  "content": "Click {{TRACKING_LINK}} to verify."
}
```
`emails` array: 1–500 entries. Response `201`:
```json
{ "sent": 2, "failed": 0, "total": 2 }
```

**Ownership**: `GET /:id` and `DELETE /:id` return `403` if the attempt belongs to a different user, `404` if it does not exist.

---

#### Templates

All `/templates` endpoints require the auth cookie.

| Method | Path | Description |
|---|---|---|
| `GET` | `/templates` | List your templates |
| `POST` | `/templates` | Create a template |
| `DELETE` | `/templates/:id` | Delete a template |
| `POST` | `/templates/seed` | Load 6 pre-built convincing phishing templates |

**Create template**
```http
POST /templates
Content-Type: application/json

{
  "name": "Password Expiry Warning",
  "subject": "Action Required: Your Password Expires in 24 Hours",
  "content": "Dear employee,\n\nYour password expires soon. Click {{TRACKING_LINK}} to reset it.",
  "category": "IT"
}
```
`category` must be one of: `IT`, `HR`, `Finance`, `Executive`.

**Seed default templates**
```http
POST /templates/seed
```
Creates 6 pre-built convincing English phishing templates (Password Expiry, Unusual Sign-In, HR Handbook, Invoice Approval, Security Patch, CEO Message). Skips duplicates if already seeded. Response:
```json
{ "created": 6, "skipped": 0 }
```

---

#### Health

```http
GET /health
```
Response `200`:
```json
{
  "status": "ok",
  "info": {
    "mongodb": { "status": "up" },
    "memory_heap": { "status": "up" }
  }
}
```
Returns `503` if MongoDB is unreachable or heap exceeds 300 MB.

---

### Simulation API (port 3000)

This service is called internally by the Management service, not by end users directly.

| Method | Path | Description |
|---|---|---|
| `POST` | `/phishing/send` | Send a phishing email |
| `GET` | `/phishing/click/:attemptId` | Track a link click (recipient lands here) |
| `GET` | `/health` | Health check |

**Send email**
```http
POST /phishing/send
Content-Type: application/json

{
  "recipientEmail": "target@company.com",
  "subject": "Verify your account",
  "content": "Click {{TRACKING_LINK}} now.",
  "attemptId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```
Response `201`: `{ "success": true, "attemptId": "..." }`. Rate limit: 20 requests / 60 s.

**Track click** — called when a recipient clicks the link in the email:
```
GET /phishing/click/:attemptId
```
Updates `status → clicked` and `clickedAt` on the attempt, then returns an HTML awareness page. Always returns `200` even if `attemptId` is unknown.

---

## Attempt Lifecycle

```
POST /attempts       →  status: pending
                     →  Simulation sends email  →  status: sent
Recipient clicks     →  status: clicked, clickedAt: <timestamp>
SMTP error           →  status: failed
```

Status values: `pending | sent | clicked | failed` — defined in `libs/shared/src/enums/attempt-status.enum.ts`.

## Testing

```bash
# All unit + e2e tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov
```

Unit specs live alongside source files (`*.spec.ts`). E2e suites are in `apps/*/test/app.e2e-spec.ts`. All external dependencies (MongoDB, SMTP) are mocked.

## Security

| Feature | Detail |
|---|---|
| httpOnly cookies | JWT stored in `httpOnly + SameSite=Strict` cookie — inaccessible to JavaScript |
| Helmet | HTTP security headers on every response |
| Rate limiting | Global 100 req / 60 s; auth endpoints 10 / 60 s; simulation send 20 / 60 s |
| JWT | HMAC-signed, 24 h expiry |
| User isolation | All queries scoped to `createdBy: username`; ownership enforced on get/delete |
| Validation | `ValidationPipe` with `whitelist + forbidNonWhitelisted`; all fields have `MaxLength` |
| Env validation | Joi schema at startup — service refuses to start if required vars are missing |
| Password hashing | bcryptjs, 12 salt rounds |
| Winston logging | Structured JSON in production, colorized in dev; no sensitive data logged |
| Graceful shutdown | `enableShutdownHooks()` drains connections on SIGTERM/SIGINT |
| Axios timeout | 5 s timeout on Management → Simulation calls |

## Project Structure

```
apps/
  management/
    src/
      auth/           # JWT strategy (cookie-based), guards, register/login/logout
      attempts/       # CRUD, pagination, bulk send, stats, user isolation
      templates/      # CRUD + seed with 6 pre-built templates
      health/         # /health endpoint (MongoDB + memory)
      common/         # HTTP logger middleware
      config/         # Joi env validation schema
      dto/            # auth.dto, phishing-attempt.dto, template.dto, pagination.dto
      schemas/        # Mongoose: User, PhishingAttempt, Template
    test/             # e2e test suite
  simulation/
    src/
      phishing/       # sendPhishingEmail, trackClick
      health/         # /health endpoint
      config/         # Joi env validation schema
      dto/            # send-phishing.dto
      schemas/        # Mongoose: PhishingAttempt
    test/             # e2e test suite
libs/
  shared/
    src/
      enums/          # AttemptStatus (pending, sent, clicked, failed)
      logger.config   # Shared Winston config used by both services
```

## MongoDB Indexes

| Collection (Management DB) | Index | Purpose |
|---|---|---|
| `phishing-attempts` | `{ createdBy: 1, createdAt: -1 }` | Paginated list query |
| `templates` | `{ createdBy: 1, createdAt: -1 }` | Template list query |

| Collection (Simulation DB) | Index | Purpose |
|---|---|---|
| `phishing-attempts` | `{ attemptId: 1 }` unique | Fast click-tracking lookup |
