# Task Enterprise

A multi-tenant project and task management SaaS portfolio starter built with Next.js, NestJS, PostgreSQL, Prisma, Redis, and Docker.

## Quick start

Requirements: Docker Desktop and Node.js 20+.

## Demo notes

This repository is a substantial portfolio MVP, not a claim that every item in the original 12-week specification has shipped. Docker Compose starts Mailpit and delivers invitation emails to its local inbox by default; production SMTP must be configured with provider credentials. Email verification, password recovery, MFA, general notification delivery, project/task edit and delete controls, production deployment, tracing/metrics backends, and comprehensive unit/integration/end-to-end coverage remain follow-up work. The UI's dashboard totals, deadline and activity panels are illustrative; the task list and create/status-update actions use the API after login.

 
## Security

- Organization and membership IDs are checked server-side for every project/task operation.
- Passwords are hashed with bcrypt.
- JWT secret is required from the environment.
- DTO validation rejects unexpected fields.
- Audit events are written for core mutations.

 
