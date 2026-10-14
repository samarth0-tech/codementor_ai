# CodeMentor AI

An AI-powered coding interview and assessment platform: AI-generated interviews with adaptive
follow-ups, an in-browser code editor with sandboxed execution, AI code review, and performance
analytics.

> Status: phases 1-9 are complete: foundation, authentication, content database, problem library,
> AI interviews with evaluation, the coding editor workspace, and real sandboxed code execution
> through Judge0. See [docs/judge0.md](docs/judge0.md) to connect and verify a Judge0 instance. Features are built phase by
> phase; see [Roadmap](#roadmap).

## Architecture

```
Browser ──cookie──▶ Next.js (Vercel) ──60-second signed note──▶ Express API (Render) ──▶ PostgreSQL
                    Auth.js sessions                              RBAC + business logic    (Prisma)
                    /api/backend/* forwarder                      ├─▶ Claude API (AI)
                                                                  └─▶ Judge0 (code execution)
```

- **Auth.js** owns the login session (encrypted httpOnly cookie, 7 days). The browser only ever
  talks to Next.js.
- The Next.js server forwards API calls through `/api/backend/*`, attaching a **60-second signed
  identity note** (`packages/shared/src/assertion.ts`). Express rejects anything without a valid
  note, then loads the user from PostgreSQL, so **roles and suspensions apply immediately**.
- Express owns users, passwords (bcrypt) and all data access. Secrets (Claude, Judge0) never reach
  the browser.
- Full reasoning and trade-offs: [ADR 0001](docs/adr/0001-authentication-architecture.md).

### AI interviews (phases 6-7)

- The interview logic talks to AI through one small interface (`AiProvider`). `AnthropicProvider`
  calls Claude; `FakeAiProvider` is deterministic and scriptable, so the whole flow is tested
  without an API key. Every AI reply must pass a Zod schema (one automatic repair attempt, then a
  clean failure).
- **The AI judges, the application calculates:** the AI only rates each answer 0-10 on correctness,
  depth and clarity; scores, bands and the interview flow (follow-ups, difficulty, when to finish)
  come from deterministic, unit-tested code (`packages/shared/src/scoring.ts`,
  `apps/api/src/modules/interviews/adaptive.ts`).
- Answers are saved before any AI call, steps are idempotent, and `POST /interviews/:id/retry`
  recovers from an AI outage without losing work.
- Every AI call is recorded (tokens, latency, status, prompt version) in `AiCall`; users have a
  daily quota and per-user rate limits. See [ADR 0002](docs/adr/0002-ai-architecture.md).

### Coding workspace and code execution (phases 8-9)

- Monaco editor with C, C++, Java, Python and JavaScript, starter code, language switcher,
  per-problem drafts and a stopwatch (all remembered in the browser), Run (examples) and Submit
  (all tests), polled results, and submission history.
- Code runs on **Judge0** (a sandbox) through a `CodeExecutor` interface. The API verifies language ids
  against the configured instance, sends one Judge0 job per test case, judges the output itself, and
  handles compile errors, runtime errors, time limits, rate limits, outages and malformed responses
  without ever blaming the student. See [ADR 0003](docs/adr/0003-submission-pipeline.md) and
  [ADR 0004](docs/adr/0004-judge0-execution.md).
- Hidden test inputs and expected outputs never reach the browser, and the Judge0 URL and credentials
  are only ever read by `apps/api` (a test enforces this for the frontend).
- `CODE_EXECUTOR=fake` gives clearly labelled, **simulated** results for local UI work. Nothing is
  run, and it is refused in production. Without `JUDGE0_API_URL`, submitting answers 503.

## Prerequisites

- Node.js 22.12+ (see `.nvmrc`), npm 10+, Git
- PostgreSQL 16 (Docker is the easiest way: `docker compose up -d`)

## Setup

```bash
npm install

# 1. Local database
cp .env.example .env                       # set POSTGRES_PASSWORD
docker compose up -d

# 2. Environment files (then edit them; see the comments inside)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
#   - API_SHARED_SECRET must be IDENTICAL in both files
#   - DATABASE_URL password must match POSTGRES_PASSWORD
#   - for running code: set JUDGE0_API_URL (+ credential) in apps/api/.env, or CODE_EXECUTOR=fake
#     for simulated local runs; see docs/judge0.md and verify with `npm run judge0:check`
#   - for AI interviews: set ANTHROPIC_API_KEY in apps/api/.env, or set AI_PROVIDER=fake to try
#     the interview UI with canned demo answers (never allowed in production)
#   - generate secrets with:
#     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. Create the tables and load the starter problems
npm run db:deploy -w @codementor/api
npm run db:seed -w @codementor/api
#    (optional) to also create the first admin, add SEED_ADMIN_EMAIL and
#    SEED_ADMIN_PASSWORD to apps/api/.env for this one run, then remove them
```

Run the two apps in two terminals:

```bash
npm run dev:api     # http://localhost:4000  (health check: /health)
npm run dev:web     # http://localhost:3000
```

## Scripts (from the repository root)

| Command          | What it does                                                 |
| ---------------- | ------------------------------------------------------------ |
| `npm run check`  | Prettier check + ESLint + TypeScript for every workspace     |
| `npm test`       | All tests (set `TEST_DATABASE_URL`, see below, for DB tests) |
| `npm run build`  | Production build of shared, api and web                      |
| `npm run format` | Auto-format everything                                       |

### Database

- Schema: `apps/api/prisma/schema.prisma`; migrations: `apps/api/prisma/migrations/*`.
- `npm run db:migrate -w @codementor/api` creates a new migration after you change the schema.
- `npm run db:drift-check -w @codementor/api` fails if the database differs from `schema.prisma`
  (run it after `db:deploy`; CI does this on every push).

### Tests

API tests run against a **real PostgreSQL** database that is wiped on every run, so its name must
end in `_test`:

```bash
createdb codementor_test   # or create it in your Docker container
TEST_DATABASE_URL=postgresql://codementor:YOUR_DB_PASSWORD@localhost:5432/codementor_test npm test
```

Without `TEST_DATABASE_URL`, database tests are skipped and the pure unit tests still run.

## Roadmap

Built so far (phases 1-9): scaffold, API foundation, identity-note authentication, content schema
with 10 seeded problems, problem browser and dashboard, AI interviews with adaptive follow-ups and
deterministic scoring, interview reports, the Monaco coding workspace, and real code execution on
Judge0. Next: AI code review (phase 10), resume interviews, analytics, admin, security hardening,
deployment.

## Known notes

- `npm audit` reports a high-severity `braces` issue that comes only from ESLint's Next.js plugin
  (a development tool, never shipped). No patched version exists yet. Do not run
  `npm audit fix --force`: it would downgrade `eslint-config-next` to an old major version.
- Auth.js v5 is still published as a beta (`5.0.0-beta.32`, pinned) and the project is now part of
  Better Auth. See ADR 0001 for why this is acceptable and how it could be swapped.
