# ADR 0003: Code submission pipeline and executor interface

- Status: Accepted
- Date: 2026-10-08

## Context

Students run and submit code against test cases. Real execution (Judge0) is Phase 9, but the editor
UI, the results screens, history and access rules had to be built and tested first. Running code
can take seconds, and the data in hidden test cases must never reach the browser.

## Decision

1. **Asynchronous by design.** `POST /submissions` stores the submission as `QUEUED`, returns
   `202 Accepted` immediately, and a background `SubmissionRunner` finishes it. The browser polls
   `GET /submissions/:id` until the status is `COMPLETED` or `FAILED`. A long-lived HTTP request
   would be fragile; a status resource survives refreshes and retries.
2. **One interface for running code: `CodeExecutor`.** Phase 8 ships `MockExecutor`, a clearly
   labelled simulation (it never executes anything). Phase 9 adds a Judge0 executor behind the
   same interface; the pipeline, API, database and UI do not change. Every submission stores which
   executor produced it (`executor: "mock"`), and the UI shows a "simulated result" banner.
3. **RUN vs SUBMIT.** RUN judges only the sample test cases; SUBMIT judges all of them.
4. **Hidden test data never leaves the server.** Result DTOs for hidden cases contain only
   pass/fail, verdict, time and memory: no input, expected output, program output or stderr
   (any of those could leak the test data). This is enforced where results are built and covered
   by tests (including through the history list and the web BFF).
5. **Never blame the student for our failures.** A crashed executor or a run with no results ends
   as `INTERNAL_ERROR`, shown as "not your fault". Unfinished work left by a crash is failed when
   the server boots again (`recoverStale`) instead of staying "running" forever.
6. **Bounded work.** At most 4 submissions run at once; code is limited to 64 KB (measured in
   bytes, since multi-byte characters count more); submissions are rate limited per user.
7. **Ownership in the query.** Submissions are loaded with `WHERE id = ? AND userId = ?`, so
   someone else's id is indistinguishable from a missing one (404).
8. **Drafts live in the browser** (code per problem and language, timer, selected language) so a
   refresh never loses work. They are a convenience only; nothing sensitive is stored there.

## Alternatives considered

| Option                                 | Why not                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Run the code inside the HTTP request   | Slow requests time out and block the server; nothing to poll after a refresh.                                                            |
| Durable queue (BullMQ + Redis) now     | Extra infrastructure before it is needed. The runner is a drop-in replacement point: only `enqueue()` is called by the rest of the code. |
| Execute student code on our own server | Unsafe. A sandbox such as Judge0 is mandatory for untrusted code.                                                                        |
| Judge0 callbacks instead of polling    | Needs a publicly reachable URL, which complicates local development.                                                                     |

## Consequences

- Good: Phase 9 only needs to implement `CodeExecutor`; everything around it is already tested.
- Trade-off: the in-process runner loses queued work if the server restarts (recovered as a failure).
  Moving to a durable queue is the documented upgrade path.
- Trade-off: polling every ~0.8 s is simple but not instant; acceptable for short runs.
