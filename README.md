# DevTask Enterprise

A multi-tenant project and task management SaaS portfolio starter built with Next.js, NestJS, PostgreSQL, Prisma, Redis, and Docker.

## Quick start

Requirements: Docker Desktop and Node.js 20+.

1. Copy `.env.example` to `.env` and set `JWT_SECRET` to a long random value.
2. The default `.env.example` sends mail to the local Mailpit inbox. For a real provider, replace `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, and `MAIL_FROM`. Use port 587 with `SMTP_SECURE=false` (STARTTLS) or port 465 with `SMTP_SECURE=true`.
3. Run `docker compose up --build`.
4. Open the web app at http://localhost:3000, API docs at http://localhost:4000/api/docs, and the local email inbox at http://localhost:8025.

The portfolio MVP includes the responsive dashboard UI, registration/login, tenant-scoped project/task APIs, API-backed task comments, organization member and role controls, one-time invitations and acceptance (including registration from an invite), organization switching, task pagination, audit records, OpenAPI, PostgreSQL schema via Prisma, Redis, container definitions, and a build workflow. After connecting through the profile control, the dashboard loads real projects/tasks from the API; without an account it stays in an explicitly local demo state.

## Demo notes

This repository is a substantial portfolio MVP, not a claim that every item in the original 12-week specification has shipped. Docker Compose starts Mailpit and delivers invitation emails to its local inbox by default; production SMTP must be configured with provider credentials. Email verification, password recovery, MFA, general notification delivery, project/task edit and delete controls, production deployment, tracing/metrics backends, and comprehensive unit/integration/end-to-end coverage remain follow-up work. The UI's dashboard totals, deadline and activity panels are illustrative; the task list and create/status-update actions use the API after login.

## Repository

```text
apps/web       Next.js dashboard
apps/api       NestJS REST API
packages/db    Prisma schema and client
```

## Local development

```bash
npm install
docker compose up -d postgres redis mailpit
npm run db:push
npm run dev
```

When running the API directly on the host, set `SMTP_HOST=localhost` and `SMTP_PORT=1025` so it can reach the Mailpit container. In Docker Compose, keep `SMTP_HOST=mailpit`.

For a clean production build outside Docker, run `npm run db:generate` (or `npm run build`, which generates the Prisma client first) before starting the API.

API endpoints are versioned under `/api/v1`; interactive API docs are available at `/api/docs`. Authentication uses signed bearer tokens. The API exposes identity, project CRUD, task CRUD with status/priority/deadline/assignee, comments, organization members, role changes, invitations, organization switching, audit listing, and health check endpoints. Production deployments should use secure, httpOnly cookie sessions and configure a mail provider, rate limiting, secret rotation, TLS, backups, and monitoring before handling real customer data.

## Security

- Organization and membership IDs are checked server-side for every project/task operation.
- Passwords are hashed with bcrypt.
- JWT secret is required from the environment.
- DTO validation rejects unexpected fields.
- Audit events are written for core mutations.

Run `npm run db:push` after schema changes. Do not expose Prisma Studio or development credentials on a public environment.
