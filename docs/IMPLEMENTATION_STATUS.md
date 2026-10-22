# Implementation status

This file compares the portfolio MVP with the original v1 brief. It avoids presenting planned items as shipped features.

## Implemented in this repository

- Next.js responsive dashboard with demo mode, account registration/sign-in, API-backed project and task list, task create/status update, project creation, comment panel, team and invitation controls, organization switcher, and task pagination.
- NestJS REST API with OpenAPI, DTO validation, health endpoint, bcrypt password hashing, and 8-hour JWT bearer tokens.
- Prisma/PostgreSQL models for users, organizations, memberships, projects, tasks, comments, invitations, and audit events.
- Tenant-scoped project/task/comment/member/invitation/audit access using the authenticated organization claim.
- Organization switching after verifying the current user's membership.
- Owner role management, member removal, invitations with hashed one-time tokens and seven-day expiry; invitees can join while registering or accept after signing in.
- Task assignee membership validation; developers can update only their assigned task status.
- Project/task search and pagination API parameters.
- SMTP invitation delivery through Nodemailer, with a local Mailpit inbox in Docker Compose and one-time token fallback for development without SMTP.
- Docker Compose for web, API, PostgreSQL, and Redis; GitHub Actions build workflow.

## Still required for the full brief

- Email verification and production mail delivery credentials/provider configuration. Local invitation email flow is implemented through Mailpit.
- Password reset and session revocation. JWTs remain valid until expiry; no server-side session store is implemented.
- MFA setup/recovery and secure secret storage.
- Login throttling, broader abuse controls, CSRF strategy for cookie sessions, and production secret/key rotation.
- Organization settings and complete permission matrix (including project-level memberships/permissions).
- Frontend screens for audit history, editing/deleting projects and tasks, advanced filters, and live deadline/activity views.
- Live API-backed dashboard metrics/activity/deadline widgets; these widgets currently show sample content.
- Redis-backed jobs/notifications, email worker, idempotency/retry policy, and dead-letter handling.
- Versioned Prisma migration history (the starter uses `prisma db push` for local bootstrap).
- Unit, integration, tenant-isolation, and Playwright end-to-end test suites.
- Dependency/secret/container scanning, SBOM generation, OpenTelemetry instrumentation, metrics/log dashboards, runbooks, staging/production deployment and rollback.

## API route map

- `POST /api/v1/auth/register`, `POST /api/v1/auth/register/accept-invitation`, `POST /api/v1/auth/login`, `GET /api/v1/auth/organizations`, `POST /api/v1/auth/switch/:organizationId`
- `GET|POST /api/v1/projects`, `PATCH|DELETE /api/v1/projects/:id`
- `GET|POST /api/v1/projects/:projectId/tasks`, `PATCH|DELETE /api/v1/projects/:projectId/tasks/:id`
- `GET|POST /api/v1/projects/:projectId/tasks/:taskId/comments`
- `GET /api/v1/organization`, `GET /api/v1/organization/members`
- `POST /api/v1/organization/invitations`, `POST /api/v1/organization/invitations/accept`
- `PATCH|DELETE /api/v1/organization/members/:userId`, `GET /api/v1/organization/audit`
- `GET /api/v1/health`

## Build verification

- `apps/api`: `npm run build --workspaces=false` — passed.
- `apps/web`: `npm run build --workspaces=false` — passed after removing standalone tracing, which the restricted Windows filesystem denied during output copying.
- `docker compose config` — passed. A full Docker image build and SMTP delivery through a real external provider were not run.
