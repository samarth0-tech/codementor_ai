# CodeMentor AI — Production Deployment & DevOps Guide

This guide details the procedures for deploying CodeMentor AI to production environments using Docker Compose, container registries, or managed container platforms (e.g., Render, Railway, AWS ECS, GCP Cloud Run).

---

## 1. Production Architecture

```
Internet ──HTTPS──▶ Reverse Proxy (Caddy / Nginx / Cloudflare)
                     ├─ :3000 ──▶ Web Frontend (Next.js 16 Standalone Container)
                     │             └─ Signed identity assertion (60s TTL) ──┐
                     └─ :4000 ──▶ Express API Container                    │
                                   ├─ Auth verification & RBAC              │
                                   ├─ PostgreSQL 16 (Prisma Pool) ◀────────┘
                                   ├─ Groq / Anthropic API (AI Inference)
                                   └─ Piston Sandbox Engine (Sandboxed Execution)
```

---

## 2. Environment Variables Checklist

All production credentials must be set through environment variables or a secret manager. **Never commit secrets to Git.**

| Variable            | Scope     | Required  | Description                                          | Example / Generation                                                          |
| :------------------ | :-------- | :-------- | :--------------------------------------------------- | :---------------------------------------------------------------------------- |
| `NODE_ENV`          | Global    | Yes       | Environment mode                                     | `production`                                                                  |
| `PORT`              | API       | Yes       | Port for Express API                                 | `4000`                                                                        |
| `PORT`              | Web       | Yes       | Port for Next.js Web                                 | `3000`                                                                        |
| `DATABASE_URL`      | API       | Yes       | Production PostgreSQL connection string              | `postgresql://user:pass@host:5432/dbname`                                     |
| `API_SHARED_SECRET` | API & Web | Yes       | 64+ character secret for signing identity assertions | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_SECRET`       | Web       | Yes       | Auth.js session encryption secret                    | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_URL`          | Web       | Yes       | Public canonical URL of the web application          | `https://codementor.example.com`                                              |
| `API_BASE_URL`      | Web       | Yes       | Internal or public base URL of the Express API       | `http://api:4000` (Docker) or `https://api.example.com`                       |
| `AI_PROVIDER`       | API       | Yes       | AI engine provider (`groq` or `anthropic`)           | `groq`                                                                        |
| `GROQ_API_KEY`      | API       | If Groq   | Secret API key for Groq Cloud                        | `gsk_...`                                                                     |
| `CODE_EXECUTOR`     | API       | Yes       | Code sandbox runner                                  | `piston`                                                                      |
| `PISTON_API_URL`    | API       | If Piston | Internal URL to Piston instance                      | `http://piston:2000/api/v2`                                                   |

---

## 3. Database Migration Strategy

In production, **never** execute `prisma migrate dev` or database-reset commands.

### Applying Migrations Safely

Run the Prisma deployment CLI before container launch or during the CI/CD release phase:

```bash
npm run db:deploy -w @codementor/api
```

This applies pending migrations recorded in `apps/api/prisma/migrations/` sequentially without modifying existing data.

### Seed Starter Problems (Initial Setup Only)

```bash
npm run db:seed -w @codementor/api
```

To provision the first administrator account during the initial seed:

```bash
SEED_ADMIN_EMAIL="admin@yourdomain.com" SEED_ADMIN_PASSWORD="YourStrongPassword123!" npm run db:seed -w @codementor/api
```

---

## 4. Containerized Deployment with Docker Compose

A complete production specification is provided in `docker-compose.prod.yml`.

### Step 1: Prepare `.env.production`

Create `.env.production` with your production variables:

```bash
POSTGRES_USER=codementor
POSTGRES_PASSWORD=<STRONG_RANDOM_PASSWORD>
POSTGRES_DB=codementor_prod
API_SHARED_SECRET=<64_CHAR_SECRET>
AUTH_SECRET=<64_CHAR_SECRET>
AUTH_URL=https://codementor.example.com
GROQ_API_KEY=gsk_...
```

### Step 2: Build and Launch Containers

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### Step 3: Verify Container Health

```bash
docker compose -f docker-compose.prod.yml ps
```

All containers should display `(healthy)` status.

---

## 5. Healthcheck & Monitoring Endpoints

- **API Health Endpoint**: `GET /health`
  - Returns `200 OK` with JSON payload:
    ```json
    { "status": "ok", "db": "connected" }
    ```
- **Web Frontend Probe**: `GET /`
  - Returns `200 OK` on root landing page.

---

## 6. Backup and Disaster Recovery

### Automated PostgreSQL Dumps

Schedule daily database dumps using `pg_dump`:

```bash
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U codementor codementor_prod | gzip > backup_$(date +%F).sql.gz
```

### Restoring from Backup

```bash
gunzip < backup_2026-10-22.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U codementor codementor_prod
```
