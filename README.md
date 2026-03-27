# Phishing Platform

A NestJS monorepo for running internal phishing simulation campaigns. Security teams use it to send test phishing emails to employees, track who clicks the links, and measure awareness across the organization.

## Architecture

```
phishing-platform/
├── apps/
│   ├── management/   # REST API for auth, campaigns, attempt tracking  (port 3001)
│   └── simulation/   # Internal service: sends emails, records clicks   (port 3000)
└── libs/
    └── shared/       # AttemptStatus enum + Winston logger config
```

The two services communicate over HTTP: when a user creates a phishing attempt via the Management API, it calls `POST /phishing/send` on the Simulation service. When a recipient clicks the link in the email, the Simulation service records the event and shows an awareness page.

```
Client → Management (3001) → Simulation (3000) → SMTP server
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

Each service reads from a `.env` file in the project root. Create one before starting:

```bash
cp .env.example .env   # or create manually
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
# Shared / Management
NODE_ENV=development
JWT_SECRET=my-super-secret-key-that-is-at-least-32-chars

# Simulation SMTP
SMTP_USER=you@gmail.com
SMTP_PASS=app-password-here
```

## Running

Open two terminals:

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

All `/attempts` endpoints require a `Bearer <token>` header.

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Register a new user |
| `POST` | `/auth/login` | No | Login, get JWT |
| `GET` | `/auth/profile` | JWT | Get current user info |

**Register**
```http
POST /auth/register
Content-Type: application/json

{
  "username": "alice",          // max 50 chars
  "email": "alice@example.com", // valid email, max 254 chars
  "password": "secret123"       // min 6, max 128 chars
}
```
Response `201`:
```json
{ "access_token": "<jwt>", "user": { "username": "alice", "email": "alice@example.com" } }
```
Errors: `400` validation, `409` username/email taken.

**Login**
```http
POST /auth/login
Content-Type: application/json

{ "username": "alice", "password": "secret123" }
```
Response `201`: same shape as register.
Errors: `400` validation, `401` wrong credentials.

**Rate limit:** 10 requests / 60 s on register and login.

---

#### Attempts

| Method | Path | Description |
|---|---|---|
| `GET` | `/attempts` | List your attempts (paginated) |
| `POST` | `/attempts` | Create attempt + send email |
| `GET` | `/attempts/:id` | Get one attempt |
| `DELETE` | `/attempts/:id` | Delete an attempt |

**List attempts**
```http
GET /attempts?page=1&limit=10
Authorization: Bearer <token>
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

**Create attempt**
```http
POST /attempts
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "target@company.com",      // max 254 chars
  "subject": "Urgent: Reset password", // max 200 chars
  "content": "Click {{TRACKING_LINK}} to verify your account." // max 50 000 chars
}
```
Use `{{TRACKING_LINK}}` as a placeholder — the Simulation service replaces it with a real tracking URL before sending. Response `201` returns the saved attempt document. Errors: `400` validation, `401` no JWT.

**Ownership**: `GET /:id` and `DELETE /:id` return `403` if the attempt belongs to a different user, `404` if it does not exist.

---

#### Health

```http
GET /health
```
Response `200` (healthy):
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

This service is intended to be called internally by the Management service, not by end users.

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
Updates `status → clicked` and `clickedAt` on the attempt, then returns an HTML awareness page ("You clicked on a phishing simulation link…"). Always returns `200` even if the `attemptId` is not found.

---

## Attempt Lifecycle

```
POST /attempts  →  status: pending
                →  Simulation sends email  →  status: sent
Recipient clicks link  →  status: clicked, clickedAt: <timestamp>
Simulation SMTP error  →  status: failed
```

Status values are defined in `libs/shared/src/enums/attempt-status.enum.ts`.

## Testing

```bash
# All unit + e2e tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov
```

Unit specs live alongside source files (`*.spec.ts`). E2e suites are in `apps/*/test/app.e2e-spec.ts`. No real database or SMTP server is needed — all external dependencies are mocked.

## Security Features

| Feature | Detail |
|---|---|
| Helmet | HTTP security headers on every response |
| Rate limiting | Global 100 req / 60 s; stricter limits on auth (10/60 s) and send (20/60 s) |
| JWT auth | RS256-style HMAC, 24 h expiry; all `/attempts` routes require valid token |
| User isolation | Queries and ownership checks scope all data to `createdBy: username` |
| Validation | `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`; all fields have `MaxLength` |
| Env validation | Joi schema validates required vars at startup; service refuses to start if misconfigured |
| Password hashing | bcryptjs with salt rounds |
| Winston logging | Structured JSON in production, colorized in development; no sensitive data logged |
| Graceful shutdown | `enableShutdownHooks()` drains connections on SIGTERM/SIGINT |
| Axios timeout | 5 s timeout on Management → Simulation calls; prevents hanging on SMTP delays |

## Project Structure

```
apps/
  management/
    src/
      auth/           # JWT strategy, guards, register/login
      attempts/       # CRUD + pagination + user isolation
      health/         # /health endpoint (MongoDB + memory)
      common/         # HTTP logger middleware
      config/         # Joi validation schema
      dto/            # auth.dto, phishing-attempt.dto, pagination.dto
      schemas/        # Mongoose: User, PhishingAttempt (+compound index)
    test/             # e2e test suite
  simulation/
    src/
      phishing/       # sendPhishingEmail, trackClick
      health/         # /health endpoint
      config/         # Joi validation schema
      dto/            # send-phishing.dto
      schemas/        # Mongoose: PhishingAttempt
    test/             # e2e test suite
libs/
  shared/
    src/
      enums/          # AttemptStatus (PENDING, SENT, CLICKED, FAILED)
      logger.config   # Shared Winston config used by both services
```

## MongoDB Indexes

The `phishing-attempt` collection in the Management database has a compound index on `{ createdBy: 1, createdAt: -1 }`, which covers the paginated list query (`find({ createdBy }) + sort({ createdAt: -1 })`).

The `phishing-attempt` collection in the Simulation database has a unique index on `attemptId`.
