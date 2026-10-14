# ADR 0004: Real code execution with Judge0

- Status: Accepted
- Date: 2026-10-09

## Context

Phase 8 built the submission pipeline around a `CodeExecutor` interface with a simulated executor.
Phase 9 must run student code for real, safely, without exposing hidden tests or credentials, and
without trusting facts that differ between Judge0 servers (language ids) or that a remote service
could get wrong (response shapes, availability).

## Decision

1. **Implement `CodeExecutor` for Judge0** (`Judge0Executor`) over a small transport interface
   (`Judge0Client`). The pipeline, database, API and UI are unchanged. `HttpJudge0Client` is the only
   code that touches credentials, base64 and HTTP; everything above it uses plain data, so the
   executor is tested with a scripted client and the client is tested with a fake HTTP server.
2. **Verify language ids against the instance.** Ids are not universal. The directory fetches
   `GET /languages`, accepts a stored id only if it exists AND is the right kind of language (name
   patterns, newest version wins, Python 2 / TypeScript / the JavaFX Java build excluded), and
   otherwise auto-detects. Languages the instance lacks are rejected at submit time and not offered
   in the editor. `npm run judge0:check` shows the report, `--apply` stores the ids, `--smoke` runs
   real programs.
3. **The application judges output, not Judge0.** We do not send `expected_output`; Judge0 only says
   whether the program ran. Our `outputsMatch` decides right/wrong, so the rules are one tested
   function, and expected outputs never leave our servers (even toward the sandbox).
4. **Every failure on our side is an `ExecutionError`** with a kind (unavailable, rate limited, auth,
   malformed, timeout, bad request, unsupported language). The runner turns it into
   `FAILED` / `INTERNAL_ERROR` with a short, safe `errorMessage`. Internals (status codes, response
   bodies, sandbox messages) go to the server log only, never to the student. A Judge0 _internal error_
   status is treated as our failure, never as the student's.
5. **Never trust the remote response.** Responses are validated with Zod; results must match the
   submitted tokens; output is truncated (10 000 characters); malformed data fails safely.
6. **Retries are bounded and selective:** network errors, 429 (honouring a capped `Retry-After`) and
   5xx are retried three times; 401/403 and other 4xx are not (they cannot succeed).
7. **Limits at three layers:** per-problem time/memory clamped to 10 s / 512 MB; code size 64 KB;
   per-student rate limit plus at most 3 pending submissions; a global concurrency cap (4) in the runner;
   Judge0's own instance limits on top.
8. **No silent simulation.** `createApp` no longer defaults to the mock executor. With
   `CODE_EXECUTOR=judge0` and no URL, submitting answers 503. `CODE_EXECUTOR=fake` is explicit and
   refused in production; simulated results are labelled in the UI. Results store which engine
   produced them.
9. **Transport security:** remote Judge0 must use https (plain http only for localhost); credentials
   are sent only as headers; frontend code and `NEXT_PUBLIC_` names are scanned by a test.

## Alternatives considered

| Option                                                 | Why not                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Trust the language ids seeded in the database          | They differ per instance; wrong ids silently run the wrong language.                     |
| Let Judge0 compare outputs (`expected_output`)         | Comparison rules would live in a remote service, and expected outputs would be sent out. |
| Judge0 callbacks instead of polling                    | Needs a public URL; complicates local development.                                       |
| One compile per submission (compile once, run many)    | Not supported by Judge0's batch API; accepted cost: each test case compiles separately.  |
| Falling back to the mock when Judge0 is not configured | Simulated results could be mistaken for real ones.                                       |

## Consequences

- Good: swapping or upgrading Judge0 touches one module; failures are explicit and safe; the
  integration is tested end to end against a protocol-accurate fake server without any real credentials.
- Trade-off: a submission with many test cases compiles that many times (Judge0 limitation).
- Trade-off: Judge0 does not distinguish memory-limit kills from other runtime errors, so
  "Memory limit exceeded" is not reported separately.
- Limitation: the integration is verified against a fake server and Judge0's documented protocol.
  Real-instance behaviour must be confirmed with `npm run judge0:check -- --smoke` (docs/judge0.md).
