# Real code execution with Judge0

CodeMentor AI never runs student code itself. It sends the code to [Judge0](https://ce.judge0.com/),
an open-source sandbox that compiles and runs programs with strict time, memory and network limits.

```
Browser -> Next.js (BFF) -> Express API -> Judge0 -> results
                            |  keeps the Judge0 URL and credentials (server only)
                            |  keeps hidden test inputs and expected outputs (server only)
```

## How a submission is judged

1. The student presses **Run examples** (sample tests) or **Submit** (every stored test, including hidden ones).
2. The API checks the code (size, language), the student's limits (3 pending submissions at a time, plus a
   rate limit) and whether Judge0 can really run that language, then answers `202` and queues the job.
3. The runner sends one Judge0 submission per test case (in batches of up to 20): the code, the test input
   as stdin, and limits taken from the problem (clamped to 10 s CPU, 512 MB, and Judge0's own maximums).
   **Expected outputs are never sent to Judge0**; the application compares the output itself
   (ignoring trailing spaces, CRLF and trailing blank lines) so the rules are identical everywhere.
4. The browser polls the submission until it is `COMPLETED` or `FAILED`.

What the student sees: the verdict, tests passed, time and memory. For **example** tests: input, expected
output and the program's output. For **hidden** tests: only pass/fail, time and memory.

| Situation                                                       | Result                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Output matches                                                  | Accepted                                                                                                             |
| Output differs                                                  | Wrong answer                                                                                                         |
| Code does not compile                                           | Compilation error (compiler message shown)                                                                           |
| Program crashes                                                 | Runtime error (error text shown for examples only)                                                                   |
| Exceeds the time limit                                          | Time limit exceeded                                                                                                  |
| Judge0 down, busy, misconfigured, or sends something unexpected | Failed with a short, safe message; verdict "Internal error (not your fault)". Details are logged on the server only. |

## Choose a Judge0 instance

Language ids differ between Judge0 instances, so the API **asks the instance** which languages it has and
checks that the stored ids are the right kind of language (Python 3, Java, C, C++, Node.js). If a stored id
is wrong it uses the newest matching language, and languages the instance lacks are not offered in the editor.

### Option A: hosted Judge0 on RapidAPI (easiest, recommended for a first test)

1. Subscribe to a Judge0 CE plan on RapidAPI (a free tier may exist; check the current plans and limits).
2. In `apps/api/.env` set the endpoint shown on the RapidAPI page and your key:
   ```
   CODE_EXECUTOR=judge0
   JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
   JUDGE0_RAPIDAPI_KEY=<your key>
   ```
   Use exactly the endpoint host RapidAPI shows for your plan; the `X-RapidAPI-Host` header is derived from it.

### Option B: self-hosted Judge0 on a Linux server

Follow the official instructions (Docker Compose, release v1.13.x) and set `AUTHN_TOKEN` in `judge0.conf`.
Then:

```
JUDGE0_API_URL=https://your-server          # https required (plain http only for localhost)
JUDGE0_AUTH_TOKEN=<the AUTHN_TOKEN value>
```

Important caveats (Judge0 CE 1.13.x, checked against its issue tracker):

- It relies on **cgroup v1**. On hosts that use cgroup v2 (recent Ubuntu/Debian, WSL2, Docker Desktop) every
  run fails with _Internal Error_ and a message about `/box/script.py` or `/box/Main.java` not existing.
  Fix it with a Linux VM/VPS that boots with cgroup v1 (`systemd.unified_cgroup_hierarchy=0`), or use Option A.
- It needs privileged containers, so it **cannot run on platforms like Render or Railway**. Use a VPS.
- Put it behind HTTPS and set `AUTHN_TOKEN`; an open Judge0 lets anyone run code on your server.

### Option C: a local open instance (development only)

`JUDGE0_API_URL=http://localhost:2358` with no credential works for an instance on your own machine
(subject to the cgroup caveat above). Never expose an unauthenticated instance to the internet.

## Verify that real execution works

Run these from the repository root, after setting `JUDGE0_API_URL` (+ credential) in `apps/api/.env`.

1. **Check the languages** (prints stored id vs verified id for C, C++, Java, Python, JavaScript):
   ```bash
   npm run judge0:check -w @codementor/api
   ```
2. **Store the verified ids** in the database (optional; the server already uses them at runtime):
   ```bash
   npm run judge0:check -w @codementor/api -- --apply
   ```
3. **Run real programs** in all five languages, plus a compile-error probe and an infinite-loop probe that
   must be stopped by the time limit:
   ```bash
   npm run judge0:check -w @codementor/api -- --smoke
   ```
   You should see seven `PASS` lines and "All checks passed: real code execution works."
4. **Try it in the browser:** start `npm run dev:api` and `npm run dev:web`, sign in, open a problem
   (e.g. _Two Sum_), write a real solution and press **Submit**. The result must carry **no** yellow
   "Simulated result" banner. Try a deliberate syntax error (compile error), `while True: pass`
   (time limit), and a wrong answer.

### Troubleshooting

| Symptom                                                      | Likely cause                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `503 CODE_EXECUTION_NOT_CONFIGURED` when submitting          | `JUDGE0_API_URL` is not set (or `CODE_EXECUTOR=fake` is wanted for local simulation). |
| Every run fails: "Code execution is temporarily unavailable" | Wrong or missing credential (API log: `kind: AUTH`), or a malformed response.         |
| Failed with "service is unavailable"                         | Judge0 unreachable or returning 5xx. Check the URL, the server and the API logs.      |
| Failed with "busy"                                           | Judge0 is rate limiting you (429). Slow down or upgrade the plan.                     |
| API log mentions an _internal error_ and `cgroup v1`         | Self-hosted Judge0 on a cgroup v2 host (see Option B).                                |
| A language is missing in the editor                          | The instance has no matching language: see `npm run judge0:check`.                    |
| Java always fails to compile                                 | The class must be named `Main` (the starter code does this).                          |

## Security notes

- `JUDGE0_API_URL`, `JUDGE0_AUTH_TOKEN` and `JUDGE0_RAPIDAPI_KEY` are read only by `apps/api`. They are
  sent as request headers, never put in URLs, logs or error messages, and never reach the browser
  (a test fails the build if any frontend file or `NEXT_PUBLIC_` variable names them).
- Hidden test inputs and expected outputs stay on the server. They are sent to Judge0 (your own sandbox) only
  as stdin, and are never part of any API response.
- `CODE_EXECUTOR=fake` runs nothing and is refused in production.
