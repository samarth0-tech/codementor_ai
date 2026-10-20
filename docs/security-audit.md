# CodeMentor AI Security & Reliability Audit (Phase 16)

This document records the security architecture, threat model, review findings, and reliability hardening measures implemented across CodeMentor AI.

---

## 1. Threat Model & Trust Boundaries

The system is organized into four distinct trust boundaries:

```
[Untrusted Client / Browser]
        |  Cookie (HttpOnly, SameSite=Lax, 7-day session)
        v
[Next.js Server (BFF)]
        |  60-second signed identity note (HMAC-SHA256 JWT, private secret)
        v
[Express API & Database]
        |-- Claude / Groq AI (Prompt-isolated, untrusted data delimiters)
        |-- Judge0 / Piston (Sandboxed code execution)
        `-- PostgreSQL (Role-based access, strict tenant isolation)
```

1. **Browser**: Fully untrusted. Client code and cookies cannot directly contact the internal Express API or third-party execution/AI engines.
2. **Next.js Backend-For-Frontend (BFF)**: Validates session cookies, enforces CSRF origin checks (`isSameOrigin`), strips dangerous request headers, attaches a fresh 60-second HMAC-SHA256 identity assertion (`packages/shared/src/assertion.ts`), and forwards safe traffic to Express.
3. **Express API**: Validates the identity assertion, verifies caller identity in PostgreSQL, and enforces granular role and ownership checks. Express never exposes stack traces or internal secrets in production responses.
4. **Isolated Downstream Services**:
   - **AI Providers (Claude / Groq)**: User text is wrapped in defensive untrusted delimiters (`<candidate_answer>`, `<student_code>`, `<untrusted_candidate_resume>`) to defeat prompt injection.
   - **Code Execution Engines (Judge0 / Piston)**: Runs untrusted code inside isolated container sandboxes with strictly bounded CPU, memory, and wall-clock timeouts.

---

## 2. Authentication, Session & CSRF Hardening

- **Session Ownership**: Managed by Auth.js via encrypted HTTP-only session cookies (`SESSION_MAX_AGE_SECONDS = 7 days`). Passwords use bcrypt with configurable salt cost (`BCRYPT_COST = 12`).
- **Identity Assertions**: The Next.js proxy forwards requests with a short-lived (60s) signed JWT containing `sub` (User UUID) and `ip`. Clock skew tolerance is bounded to 5 seconds. Replay window is strictly constrained.
- **CSRF Defense**: State-changing operations (POST, PATCH, PUT, DELETE) verified against `origin` and `Sec-Fetch-Site` headers via `isSameOrigin()`.
- **SSRF Prevention**: Forwarded path segments in Next.js are checked against a strict regex whitelist (`/^[A-Za-z0-9._~-]+$/`), disallowing path traversal (`.` or `..`).

---

## 3. Authorization & IDOR Protection

All private endpoints enforce ownership by comparing the authenticated identity (`req.user.id`) against database records:

- **Interviews**: `GET /api/v1/interviews/:id`, `/report`, and `POST /answers` ensure the requested interview belongs to `req.user.id`. Requests for other users' interviews return `404 Not Found` (never `403`), preventing user enumeration.
- **Submissions & Reviews**: `GET /api/v1/submissions/:id` and `POST /api/v1/submissions/:id/review` hide foreign submissions with `404 Not Found`. Hidden test cases are never returned to clients.
- **Resumes**: `GET /api/v1/resumes/:id` and `DELETE /api/v1/resumes/:id` strictly enforce `where: { id, userId }`.
- **Notifications**: Reading, updating preferences, and bulk status updates operate strictly on the current user's partition.

---

## 4. Code Execution Sandboxing & Piston Deployment Review

### Sandbox Comparison

| Dimension               | Judge0 (Production Recommended)                             | Local Piston (Development / Sandbox)                                   |
| ----------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Isolation Mechanism** | Isolated cgroups, seccomp profiles, chroot / namespace jail | Docker container process isolation                                     |
| **Network Access**      | Blocked network namespace (`enable_network: false`)         | Isolated container bridge (requires network disabled in Docker config) |
| **Concurrency Control** | Batch queueing (up to 20 jobs/batch, configurable)          | Bounded concurrency (batches of 4 jobs)                                |
| **Timeout Clamping**    | `100ms <= timeLimitMs <= 10,000ms`, wall time capped at 15s | `100ms <= timeLimitMs <= 10,000ms`, compile timeout 10s                |
| **Output Sanitization** | Truncated to 10,000 chars                                   | ANSI escapes stripped, truncated to 10,000 chars                       |

### Piston Security Findings & Guidance

- **Local Deployment Warning**: Piston running via Docker is suitable for local development and controlled testing. For multi-tenant production deployments, Judge0 with hardened seccomp, AppArmor, and dropped capabilities (`CAP_SYS_ADMIN` disabled) is strongly recommended.
- **Resource Clamping**: `PistonExecutor` clamps execution timeouts between 100ms and 10,000ms to prevent infinite CPU consumption.
- **ANSI Escape Neutralization**: Compilers and runtimes may emit ANSI color escape sequences (`\u001b[...]`). The executor strips these before persisting outcomes or presenting them to AI prompt builders.

---

## 5. Input Validation, Document Extraction & Prompt Injection Defenses

### Prompt Injection Defenses

- **Untrusted Wrapping**: User content is enclosed in explicit XML-like delimiters:
  ```xml
  <candidate_answer>
  [user text]
  </candidate_answer>
  ```
- **Tag Closure Defusal**: Any attempt to close the enclosing tag (e.g. `</candidate_answer>`) within user input is replaced with `[tag removed]`.
- **Control Character Stripping**: Null bytes (`\0`) and Unicode bidirectional override characters (`\u202A`–`\u202E`, `\u2066`–`\u2069`) are stripped to prevent visual spoofing (Trojan Source attacks) and parser confusion.
- **System Instructions**: All AI system prompts include `UNTRUSTED_NOTICE`, commanding models to treat user content strictly as passive data and never follow instructions embedded within it.
- **Deterministic Evaluation**: AI models evaluate sub-criteria (correctness, depth, readability), while final numerical scores, score bands, and progression decisions are computed deterministically in tested TypeScript code.

### File Upload Hardening

- **Magic Number Verification**: Resumes must match binary magic signatures (`%PDF` for PDF, `PK\x03\x04` for DOCX). Fake or renamed executable binaries (`MZ`, `ELF`) are rejected with `INVALID_FILE_SIGNATURE`.
- **Size Bounds**: Files capped at 5 MB (`MAX_RESUME_FILE_BYTES`). Extracted text capped at 25,000 characters (`MAX_RESUME_TEXT_CHARS`).
- **Filename Sanitization**: Uploaded filenames are stripped with `path.basename()` and truncated to 150 characters to prevent directory traversal.

---

## 6. HTTP & Browser Security Headers

### Next.js (`apps/web/next.config.ts`)

Configured to serve standard OWASP headers on all routes:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
- `X-DNS-Prefetch-Control: on`

### Express API (`apps/api/src/app.ts`)

- `helmet()` enabled for standard API response header protection.
- `app.disable("x-powered-by")` enabled.
- JSON body payload strictly limited to `256kb` (`express.json({ limit: "256kb" })`).

---

## 7. Dependency Security Audit & Known Advisories

Running `npm audit` identifies the following dependency advisories:

1. **`braces` (High) via `eslint-config-next` / `@next/eslint-plugin-next`**:
   - **Scope**: Development / linting tooling only.
   - **Runtime Impact**: None. This package is never bundled or executed in production.
   - **Remediation Assessment**: Upstream patch is pending in `@next/eslint-plugin-next`. Running `npm audit fix --force` would downgrade ESLint Next configuration to an incompatible version, breaking linting. As noted in `README.md`, forced fixes must not be applied.
2. **`dompurify` (via `monaco-editor`)**:
   - **Scope**: Bundled inside Monaco Editor for browser code editing.
   - **Runtime Impact**: Code editor only renders code in sanitized Monaco frames.
3. **`sprintf-js` (via `mammoth`)**:
   - **Scope**: Used during DOCX text extraction.
   - **Remediation Assessment**: Monitored; protected by input size limit (`MAX_RESUME_FILE_BYTES = 5MB`).
