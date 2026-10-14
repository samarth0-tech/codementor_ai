import pino from "pino";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import type { SubmissionDetail } from "@codementor/shared";
import { createPrisma } from "../src/lib/prisma.js";
import { HttpJudge0Client } from "../src/modules/judge0/client.js";
import { Judge0Executor, type Judge0ExecutorOptions } from "../src/modules/judge0/executor.js";
import { Judge0LanguageDirectory } from "../src/modules/judge0/languages.js";
import type { SubmissionRunner } from "../src/modules/submissions/submission.runner.js";
import { seedDatabase } from "../src/seed/seed.js";
import {
  CLASSIC_LANGUAGES,
  FakeJudge0,
  MODERN_LANGUAGES,
  type FakeLanguage,
} from "./helpers/fake-judge0.js";
import { createUser, hasDb, makeTestContext, resetDb, type TestContext } from "./helpers.js";

const TOKEN = "judge0-secret-token-0123456789";

// A tiny echo "problem": the fake Judge0 prints the input back, so expected output == input.
// The hidden cases carry unique markers so any leak is easy to detect.
const HIDDEN_A = "HIDDEN-IN-5521";
const HIDDEN_B = "HIDDEN-IN-7788";

function capture() {
  const lines: string[] = [];
  const logger = pino({ level: "debug" }, { write: (s: string) => void lines.push(s) });
  return { logger, lines };
}

describe.skipIf(!hasDb)("Phase 9: real execution through a (fake) Judge0 server", () => {
  const cfgPrisma = createPrisma(process.env.DATABASE_URL as string);
  const opened: TestContext[] = [];
  const servers: FakeJudge0[] = [];
  let auth: string;

  beforeEach(async () => {
    await resetDb(cfgPrisma);
    await seedDatabase(cfgPrisma, { bcryptCost: 4 });
    ({ auth } = await createUser(cfgPrisma));
    const problem = await cfgPrisma.problem.create({
      data: {
        slug: "echo",
        title: "Echo",
        description: "Print the input.",
        difficulty: "EASY",
        status: "PUBLISHED",
        testCases: {
          create: [
            { input: "1 2\n", expectedOutput: "1 2", isSample: true, orderIndex: 0 },
            { input: "3 4\n", expectedOutput: "3 4", isSample: true, orderIndex: 1 },
            { input: `${HIDDEN_A}\n`, expectedOutput: HIDDEN_A, isSample: false, orderIndex: 2 },
            { input: `${HIDDEN_B}\n`, expectedOutput: HIDDEN_B, isSample: false, orderIndex: 3 },
          ],
        },
      },
    });
    await cfgPrisma.problemStarterCode.create({
      data: { problemId: problem.id, language: "PYTHON", code: "# starter\n" },
    });
  });
  afterEach(async () => {
    for (const c of opened.splice(0)) await c.prisma.$disconnect();
    for (const s of servers.splice(0)) await s.stop().catch(() => undefined);
  });
  afterAll(() => cfgPrisma.$disconnect());

  async function server(options: ConstructorParameters<typeof FakeJudge0>[0] = {}) {
    const fake = await new FakeJudge0({ token: TOKEN, ...options }).start();
    servers.push(fake);
    return fake;
  }

  /** The real client + executor, pointed at the fake server, inside the real app. */
  function connect(
    fake: FakeJudge0,
    opts: { token?: string; exec?: Partial<Judge0ExecutorOptions>; baseUrl?: string } = {},
  ) {
    const { logger, lines } = capture();
    const client = new HttpJudge0Client({
      baseUrl: opts.baseUrl ?? fake.url,
      auth: { kind: "token", token: opts.token ?? TOKEN },
      timeoutMs: 2000,
      maxAttempts: 3,
      retryBaseDelayMs: 0,
      logger,
    });
    const directory = new Judge0LanguageDirectory({
      client,
      logger,
      configured: async () => {
        const rows = await cfgPrisma.languageConfig.findMany();
        return Object.fromEntries(rows.map((r) => [r.language, r.judge0LanguageId]));
      },
    });
    const executor = new Judge0Executor(client, directory, {
      pollTimeoutMs: 1500,
      pollIntervalMs: 5,
      maxBatch: 20,
      logger,
      ...opts.exec,
    });
    const ctx = makeTestContext({ executor, logger });
    opened.push(ctx);
    return { ctx, app: ctx.app, executor, lines, directory };
  }

  const body = (over: object = {}) => ({
    problem: "echo",
    language: "PYTHON",
    sourceCode: "# FAKE:echo\n",
    mode: "RUN",
    ...over,
  });
  const send = (app: Express, payload: object, header = auth) =>
    request(app).post("/api/v1/submissions").set("Authorization", header).send(payload);
  const drain = (app: Express) => (app.locals["submissionRunner"] as SubmissionRunner).drain();
  async function submit(
    app: Express,
    payload: object = body(),
  ): Promise<{ sub: SubmissionDetail; text: string }> {
    const created = await send(app, payload);
    expect(created.status, JSON.stringify(created.body)).toBe(202);
    await drain(app);
    const res = await request(app)
      .get(`/api/v1/submissions/${created.body.submission.id}`)
      .set("Authorization", auth);
    return { sub: res.body.submission, text: JSON.stringify(res.body) };
  }
  const assertNoSecrets = (fake: FakeJudge0, ...texts: string[]) => {
    for (const t of texts) {
      expect(t).not.toContain(TOKEN);
      expect(t).not.toContain(fake.url);
      expect(t).not.toContain("127.0.0.1");
    }
  };

  describe("successful runs", () => {
    it("RUN executes only the examples, on Judge0, and labels the result as real", async () => {
      const fake = await server();
      const { app } = connect(fake);
      const { sub } = await submit(app);
      expect(sub).toMatchObject({
        status: "COMPLETED",
        verdict: "ACCEPTED",
        passedCount: 2,
        totalCount: 2,
        executor: "judge0",
        errorMessage: null,
      });
      expect(fake.stdins).toEqual(["1 2\n", "3 4\n"]); // hidden inputs were never even sent
      expect(sub.maxTimeMs).toBe(15);
      expect(sub.maxMemoryKb).toBe(3200);
    });

    it("SUBMIT runs every stored test case, hidden ones included, but only on the server side", async () => {
      const fake = await server();
      const { app } = connect(fake);
      const { sub, text } = await submit(app, body({ mode: "SUBMIT" }));
      expect(sub).toMatchObject({ verdict: "ACCEPTED", passedCount: 4, totalCount: 4 });
      expect(fake.stdins).toEqual(["1 2\n", "3 4\n", `${HIDDEN_A}\n`, `${HIDDEN_B}\n`]); // Judge0 DID receive them
      // ...but the browser-facing JSON never contains hidden data:
      expect(text).not.toContain("HIDDEN-IN-");
      const hidden = sub.results.filter((r) => !r.isSample);
      expect(hidden).toHaveLength(2);
      for (const h of hidden) {
        expect(Object.keys(h).sort()).toEqual([
          "index",
          "isSample",
          "memoryKb",
          "passed",
          "timeMs",
          "verdict",
        ]);
      }
      expect(sub.results[0]).toMatchObject({
        isSample: true,
        input: "1 2\n",
        expectedOutput: "1 2",
        stdout: "1 2\n",
      });
    });

    it("sends the right request to Judge0: language id, code, limits, no network, no expected output", async () => {
      const fake = await server();
      const { app } = connect(fake);
      await submit(app, body({ sourceCode: "# FAKE:echo\nprint('héllo')\n" }));
      expect(fake.received[0]).toMatchObject({
        languageId: 71,
        source: "# FAKE:echo\nprint('héllo')\n",
        stdin: "1 2\n",
        cpuTimeLimit: 2,
        wallTimeLimit: 5,
        memoryLimitKb: 256_000,
        enableNetwork: false,
      });
      const create = fake.requests.find((r) => r.method === "POST");
      expect(create?.headers["x-auth-token"]).toBe(TOKEN);
    });

    it("clamps absurd per-problem limits before they reach Judge0", async () => {
      await cfgPrisma.problem.update({
        where: { slug: "echo" },
        data: { timeLimitMs: 600_000, memoryLimitKb: 99_999_999 },
      });
      const fake = await server();
      const { app } = connect(fake);
      await submit(app);
      expect(fake.received[0]).toMatchObject({ cpuTimeLimit: 10, memoryLimitKb: 512_000 });
      expect(fake.received[0]?.wallTimeLimit).toBeLessThanOrEqual(15);
    });

    it("splits large submissions into batches of 20 and keeps every result", async () => {
      const problem = await cfgPrisma.problem.findUniqueOrThrow({ where: { slug: "echo" } });
      await cfgPrisma.testCase.createMany({
        data: Array.from({ length: 41 }, (_, i) => ({
          problemId: problem.id,
          input: `bulk-${i}\n`,
          expectedOutput: `bulk-${i}`,
          orderIndex: 10 + i,
        })),
      });
      const fake = await server();
      const { app } = connect(fake);
      const { sub } = await submit(app, body({ mode: "SUBMIT" }));
      expect(fake.batchPosts).toBe(3); // 45 cases -> 20 + 20 + 5
      expect(sub).toMatchObject({ verdict: "ACCEPTED", passedCount: 45, totalCount: 45 });
    });
  });

  describe("verdicts", () => {
    it("wrong answer", async () => {
      const { app } = connect(await server());
      const { sub } = await submit(app, body({ sourceCode: "# FAKE:out=nope\n", mode: "SUBMIT" }));
      expect(sub).toMatchObject({ verdict: "WRONG_ANSWER", passedCount: 0, totalCount: 4 });
    });

    it("compile error shows the compiler output and no test results", async () => {
      const { app } = connect(await server());
      const { sub } = await submit(app, body({ sourceCode: "# FAKE:ce\n", mode: "SUBMIT" }));
      expect(sub).toMatchObject({ verdict: "COMPILE_ERROR", results: [], passedCount: 0 });
      expect(sub.compileOutput).toContain("expected declaration specifiers");
    });

    it("runtime error shows stderr for examples, never for hidden tests", async () => {
      const { app } = connect(await server());
      const { sub } = await submit(app, body({ sourceCode: "# FAKE:re\n", mode: "SUBMIT" }));
      expect(sub.verdict).toBe("RUNTIME_ERROR");
      expect(sub.results[0]).toMatchObject({
        isSample: true,
        verdict: "RUNTIME_ERROR",
        stderr: "ZeroDivisionError: division by zero",
      });
      const hidden = sub.results.find((r) => !r.isSample);
      expect(hidden).toMatchObject({ verdict: "RUNTIME_ERROR" });
      expect(hidden).not.toHaveProperty("stderr");
    });

    it("time limit exceeded", async () => {
      const { app } = connect(await server());
      const { sub } = await submit(app, body({ sourceCode: "# FAKE:tle\n" }));
      expect(sub).toMatchObject({ verdict: "TIME_LIMIT", passedCount: 0 });
      expect(sub.maxTimeMs).toBe(2000);
    });
  });

  describe("language ids are verified against the instance", () => {
    it("uses the right ids on an instance whose ids differ from our stored ones", async () => {
      const fake = await server({ languages: MODERN_LANGUAGES });
      const { app } = connect(fake);
      for (const language of ["C", "CPP", "JAVA", "JAVASCRIPT", "PYTHON"]) {
        const { sub } = await submit(app, body({ language }));
        expect(sub.verdict, language).toBe("ACCEPTED");
      }
      // stored ids were 50/54/62/63/71; the instance's real ids are below. (RUN sends 2 examples
      // per submission, hence each id twice.)
      expect(fake.received.map((r) => r.languageId)).toEqual([
        103, 103, 105, 105, 91, 91, 93, 93, 100, 100,
      ]);
    });

    it("keeps stored ids that are valid on the instance", async () => {
      const fake = await server({
        languages: [...CLASSIC_LANGUAGES, { id: 92, name: "Python (3.11.2)" }],
      });
      const { app } = connect(fake);
      await submit(app);
      expect(fake.received[0]?.languageId).toBe(71); // the stored id, not merely the newest
    });

    it("rejects, and does not offer, a language the instance cannot run", async () => {
      const noNode: FakeLanguage[] = MODERN_LANGUAGES.filter(
        (l) => !l.name.startsWith("JavaScript"),
      );
      const fake = await server({ languages: noNode });
      const { app } = connect(fake);
      const res = await send(app, body({ language: "JAVASCRIPT" }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("LANGUAGE_NOT_SUPPORTED");
      expect(await cfgPrisma.submission.count()).toBe(0);

      const listed = await request(app).get("/api/v1/languages").set("Authorization", auth);
      const names = listed.body.languages.map((l: { language: string }) => l.language).sort();
      expect(names).toEqual(["CPP", "C", "JAVA", "PYTHON"].sort());
    });

    it("still offers every enabled language when Judge0 cannot be asked", async () => {
      const fake = await server();
      const { app } = connect(fake);
      await fake.stop();
      const listed = await request(app).get("/api/v1/languages").set("Authorization", auth);
      expect(listed.body.languages).toHaveLength(5);
    });
  });

  describe("failures are handled and never blame (or expose anything to) the student", () => {
    async function failed(app: Express, payload: object = body()) {
      const { sub, text } = await submit(app, payload);
      expect(sub).toMatchObject({ status: "FAILED", verdict: "INTERNAL_ERROR", passedCount: 0 });
      expect(sub.errorMessage).toBeTruthy();
      return { sub, text };
    }

    it("wrong credentials: generic message, no secrets in the response or the logs", async () => {
      const fake = await server();
      const { app, lines } = connect(fake, { token: "the-wrong-token-9999" });
      const { sub, text } = await failed(app);
      expect(sub.errorMessage).toBe(
        "Code execution is temporarily unavailable. This is not a problem with your code.",
      );
      assertNoSecrets(fake, text);
      expect(text).not.toContain("403");
      expect(text).not.toContain("the-wrong-token");
      expect(lines.join("")).not.toContain(TOKEN);
      expect(lines.join("")).not.toContain("the-wrong-token");
      expect(lines.join("")).toContain("Code execution failed"); // it IS logged for the operator
    });

    it("Judge0 unreachable", async () => {
      const fake = await server();
      const { app } = connect(fake);
      await fake.stop();
      const { sub, text } = await failed(app); // creating the submission still worked (202)
      expect(sub.errorMessage).toMatch(/unavailable right now/);
      assertNoSecrets(fake, text);
    });

    it("rate limited by Judge0: retries, then succeeds", async () => {
      const fake = await server();
      const { app, executor } = connect(fake);
      await executor.supportedLanguages(); // warm the language cache so the faults hit the batch calls
      fake.failNext(
        { status: 429, headers: { "retry-after": "0" } },
        { status: 429, headers: { "retry-after": "0" } },
      );
      const { sub } = await submit(app);
      expect(sub).toMatchObject({ status: "COMPLETED", verdict: "ACCEPTED" });
    });

    it("rate limited by Judge0 for good: a clear 'busy' message", async () => {
      const fake = await server();
      const { app, executor } = connect(fake);
      await executor.supportedLanguages();
      const tooMany = { status: 429, headers: { "retry-after": "0" } };
      fake.failNext(tooMany, tooMany, tooMany);
      const { sub, text } = await failed(app);
      expect(sub.errorMessage).toMatch(/busy/);
      assertNoSecrets(fake, text);
    });

    it.each([
      ["an HTML error page instead of JSON", { status: 200, body: "<html>Bad gateway</html>" }],
      ["JSON of the wrong shape", { status: 200, body: '{"unexpected":true}' }],
    ])("malformed response (%s) when creating the batch", async (_n, fault) => {
      const fake = await server();
      const { app, executor } = connect(fake);
      await executor.supportedLanguages();
      fake.failNext(fault);
      const { sub, text } = await failed(app);
      expect(sub.errorMessage).toMatch(/not a problem with your code/);
      expect(text).not.toContain("Bad gateway");
    });

    it("malformed response when fetching results", async () => {
      const fake = await server();
      const { app, executor } = connect(fake);
      await executor.supportedLanguages();
      fake.failNextPoll({ status: 200, body: "not json" });
      const { sub, text } = await failed(app);
      expect(sub.errorMessage).toMatch(/not a problem with your code/);
      expect(text).not.toContain("not json");
    });

    it("sandbox internal error: not the student's fault, internals stay in the logs", async () => {
      const fake = await server();
      const { app, lines } = connect(fake);
      const { sub, text } = await failed(app, body({ sourceCode: "# FAKE:ise\n" }));
      expect(sub.errorMessage).toMatch(/unavailable right now/);
      expect(text).not.toContain("rb_sysopen");
      expect(text).not.toContain("/box");
      expect(lines.join("")).toContain("cgroup v1"); // the operator gets the hint
    });

    it("results that never become ready: a 'took too long' message", async () => {
      const fake = await server({ pollsBeforeDone: Number.POSITIVE_INFINITY });
      const { app } = connect(fake, { exec: { pollTimeoutMs: 120 } });
      const { sub } = await failed(app);
      expect(sub.errorMessage).toMatch(/took too long/);
    });

    it("code execution not configured: 503, nothing stored, history still works", async () => {
      const ctx = makeTestContext({ executor: null });
      opened.push(ctx);
      const res = await send(ctx.app, body());
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("CODE_EXECUTION_NOT_CONFIGURED");
      expect(await cfgPrisma.submission.count()).toBe(0);
      expect(
        (await request(ctx.app).get("/api/v1/submissions").set("Authorization", auth)).status,
      ).toBe(200);
    });
  });

  describe("limits on students", () => {
    it("allows at most 3 pending submissions per student, then 429", async () => {
      const fake = await server({ pollsBeforeDone: 6 });
      const { app } = connect(fake, { exec: { pollIntervalMs: 20 } });
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) codes.push((await send(app, body())).status);
      expect(codes).toEqual([202, 202, 202, 429]);
      const blocked = await send(app, body());
      expect(blocked.body.error.code).toBe("TOO_MANY_PENDING");
      await drain(app);
      expect((await send(app, body())).status).toBe(202); // finished ones free the slots
      await drain(app);
    });

    it("the pending limit is per student", async () => {
      const fake = await server({ pollsBeforeDone: 6 });
      const { app } = connect(fake, { exec: { pollIntervalMs: 20 } });
      for (let i = 0; i < 3; i++) await send(app, body());
      const { auth: other } = await createUser(cfgPrisma, "other@example.com", "Other");
      expect((await send(app, body(), other)).status).toBe(202);
      await drain(app);
    });

    it("rejects oversized code before it ever reaches Judge0", async () => {
      const fake = await server();
      const { app } = connect(fake);
      const res = await send(app, body({ sourceCode: "x".repeat(64 * 1024 + 1) }));
      expect(res.status).toBe(400);
      expect(fake.requests.filter((r) => r.path.startsWith("/submissions"))).toHaveLength(0);
    });
  });

  describe("security boundaries", () => {
    it("credentials and the Judge0 address never appear in any API response", async () => {
      const fake = await server();
      const { app } = connect(fake);
      const texts: string[] = [];
      const created = await send(app, body({ mode: "SUBMIT" }));
      texts.push(JSON.stringify(created.body));
      await drain(app);
      texts.push(
        (
          await request(app)
            .get(`/api/v1/submissions/${created.body.submission.id}`)
            .set("Authorization", auth)
        ).text,
      );
      texts.push((await request(app).get("/api/v1/submissions").set("Authorization", auth)).text);
      texts.push((await request(app).get("/api/v1/languages").set("Authorization", auth)).text);
      assertNoSecrets(fake, ...texts);
    });

    it("another student cannot read my submission (404)", async () => {
      const fake = await server();
      const { app } = connect(fake);
      const { sub } = await submit(app, body({ mode: "SUBMIT" }));
      const { auth: other } = await createUser(cfgPrisma, "mallory@example.com", "Mallory");
      expect(
        (await request(app).get(`/api/v1/submissions/${sub.id}`).set("Authorization", other))
          .status,
      ).toBe(404);
    });

    it("the identity note is required: no anonymous submissions", async () => {
      const fake = await server();
      const { app } = connect(fake);
      expect((await request(app).post("/api/v1/submissions").send(body())).status).toBe(401);
      expect(fake.requests).toHaveLength(0);
    });

    it("the client sends the credential only in a header, once per request", async () => {
      const fake = await server();
      const { app } = connect(fake);
      await submit(app);
      for (const r of fake.requests) {
        expect(r.headers["x-auth-token"]).toBe(TOKEN);
        expect(r.path).not.toContain(TOKEN);
      }
    });
  });
});
