# ADR 0001: Authentication architecture

- Status: Accepted
- Date: 2026-10-07

## Context

CodeMentor AI has two separate servers:

- a **Next.js** web app (on Vercel), and
- an **Express** API (on Render) that owns the database and business logic.

They live on different domains. We want login to be simple and secure, and we do not want to
build a custom token system (access tokens, refresh tokens, rotation) for a student project.

The problem: a login cookie belongs to one domain. The browser will not send the Next.js cookie
to the Express domain, and Express cannot read Auth.js's encrypted cookie format. So how does
Express learn who is calling?

## Decision

1. **Auth.js is the only login/session system.** It runs in Next.js and keeps the session in an
   encrypted, httpOnly cookie that lasts 7 days.
2. **The browser never talks to Express.** It talks only to Next.js. A Next.js server route
   (the "backend route", `/api/backend/*`) forwards each request to Express.
3. For every forwarded request, the Next.js server attaches a tiny **signed identity note**: a JWT
   signed with a secret that only Next.js and Express know (`API_SHARED_SECRET`). It says
   "this is user X", expires after **60 seconds**, and is created fresh for each request.
4. **Express verifies the note, then looks the user up in PostgreSQL.** The user's role and
   status always come from the database, never from the note or the cookie.
5. **Express owns users and passwords** (bcrypt). Auth.js's Credentials provider asks Express to
   check an email and password; Express answers with the user's id, name and role. No tokens are
   issued by Express.
6. Express still enforces **role checks and ownership checks** on every protected route.

## An analogy for explaining it

Auth.js is the **reception desk** of an office building. It checks your ID once and gives you a
visitor badge (the session cookie). You never walk into the secure back office yourself. A
receptionist (the Next.js server) goes in for you carrying a **sticky note signed by the
manager** saying "this is employee #42, valid for one minute". The back office (Express) checks
the signature, then looks up #42 in its own records (the database) to confirm the employee still
works here and what they are allowed to do.

## Alternatives considered

| Option                                                 | Why not                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Express decrypts the Auth.js cookie directly           | Depends on Auth.js internals (encryption format and a cookie-name-based salt that differs between development and production). Likely to break on upgrades. |
| Share the cookie across subdomains                     | Needs a custom domain we own. Free `vercel.app` and `onrender.com` domains cannot share cookies.                                                            |
| Give the browser a token to call Express directly      | Brings back token storage, expiry and refresh: the complexity we are avoiding.                                                                              |
| Next.js reads the database directly (Prisma adapter)   | Breaks the rule that only Express touches the database.                                                                                                     |
| Express issues access + refresh tokens (original plan) | Too much custom security code for this project.                                                                                                             |

## Consequences

**Good**

- No refresh tokens, no token tables, no tokens in browser JavaScript.
- No browser CORS setup for Express, because the browser never calls it.
- Suspending a user or changing a role takes effect on their very next request, because Express
  checks the database every time.
- Express stays private to our web app: requests without a valid note are rejected.

**Trade-offs we accept**

- **CSRF matters again.** The browser authenticates to Next.js with a cookie, so the backend route
  must defend against cross-site requests: `SameSite=Lax` cookies, an `Origin` header check on
  state-changing requests, and JSON-only bodies.
- The backend route must never become an open proxy: fixed destination, only `/api/v1/` paths,
  and an allowlist of forwarded headers (otherwise: server-side request forgery).
- No per-device logout. Sessions are bounded to 7 days and suspended users are blocked by the
  database check. A `tokenVersion` column on `User` is the upgrade path.
- One extra network hop (Vercel to Render), and Vercel limits apply to request body size and
  streaming duration (verify current limits when building uploads and interview streaming).
- `API_SHARED_SECRET` is a single point of trust. Treat it like a database password and use
  different values per environment.
- **Auth.js status:** the project is now part of Better Auth. Version 5 is still published under
  the `beta` tag, and the project is in security-maintenance mode (security fixes shipped in
  July 2026). We accept this for a portfolio project and pin an exact version. Because Express
  only depends on the signed note, replacing Auth.js later would not change the API.

## Naming note

Next.js 16 renamed its `middleware.ts` file convention to `proxy.ts`. To avoid confusion with that
feature, our forwarding route is called `/api/backend/*` (earlier drafts called it `/api/proxy/*`).

## What to say in an interview

> "Auth.js manages the login session in Next.js. The browser only talks to Next.js. For each API
> call, the Next.js server adds a 60-second signed identity note and forwards the request to
> Express. Express verifies the signature, then loads the user from the database and enforces
> roles and ownership. This is the Backend-for-Frontend pattern. I chose it over decrypting the
> session cookie in Express because that would couple my API to Auth.js internals, and over
> custom access and refresh tokens because that is a lot of security code to get wrong. The
> trade-offs are that CSRF protection moves to the Next.js layer and there is no per-session
> revocation, which I handle by checking the user's status in the database on every request."
