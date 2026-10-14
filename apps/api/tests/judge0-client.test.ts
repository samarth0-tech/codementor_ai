import { describe, expect, it } from "vitest";
import { HttpJudge0Client, type Judge0Auth } from "../src/modules/judge0/client.js";
import { ExecutionError } from "../src/modules/submissions/executor.js";

const SECRET = "tok-SECRET-0123456789";
const BASE = "https://judge.example.com";
const b64 = (s: string) => Buffer.from(s).toString("base64");
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function setup(
  responses: (Response | Error)[],
  auth: Judge0Auth = { kind: "token", token: SECRET },
) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const fetchImpl = (async (url: URL | string, init: RequestInit) => {
    calls.push({ url: new URL(String(url)), init });
    const next = queue.shift() ?? json({});
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  const client = new HttpJudge0Client({
    baseUrl: `${BASE}/`, // trailing slash on purpose
    auth,
    timeoutMs: 1000,
    maxAttempts: 3,
    retryBaseDelayMs: 0,
    fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { client, calls, sleeps };
}
const headersOf = (init: RequestInit) => new Headers(init.headers);
const input = {
  languageId: 71,
  sourceCode: "print(1)",
  stdin: "2 3\n",
  cpuTimeLimit: 2,
  wallTimeLimit: 5,
  memoryLimitKb: 256_000,
};

describe("HttpJudge0Client: requests", () => {
  it("sends the X-Auth-Token header (and joins the URL without a double slash)", async () => {
    const { client, calls } = setup([json([{ id: 1, name: "C (GCC 9.2.0)" }])]);
    expect(await client.getLanguages()).toEqual([{ id: 1, name: "C (GCC 9.2.0)" }]);
    expect(calls[0]?.url.href).toBe(`${BASE}/languages`);
    expect(headersOf(calls[0]!.init).get("x-auth-token")).toBe(SECRET);
  });

  it("sends RapidAPI headers, with the host taken from the configuration", async () => {
    const { client, calls } = setup([json([])], {
      kind: "rapidapi",
      key: SECRET,
      host: "judge0-ce.p.rapidapi.com",
    });
    await client.getLanguages();
    const h = headersOf(calls[0]!.init);
    expect(h.get("x-rapidapi-key")).toBe(SECRET);
    expect(h.get("x-rapidapi-host")).toBe("judge0-ce.p.rapidapi.com");
    expect(h.get("x-auth-token")).toBeNull();
  });

  it("sends no credentials when none are configured", async () => {
    const { client, calls } = setup([json([])], { kind: "none" });
    await client.getLanguages();
    const h = headersOf(calls[0]!.init);
    expect([h.get("x-auth-token"), h.get("x-rapidapi-key")]).toEqual([null, null]);
  });

  it("never puts credentials in the URL", async () => {
    const { client, calls } = setup([json([{ token: "t1" }]), json({ submissions: [] })]);
    await client.createBatch([input]);
    await client.getBatch(["t1"]).catch(() => undefined);
    for (const c of calls) expect(c.url.href).not.toContain(SECRET);
  });

  it("creates a batch with base64 code and input, real limits, no network, and NO expected output", async () => {
    const { client, calls } = setup([json([{ token: "t1" }, { token: "t2" }])]);
    const tokens = await client.createBatch([input, { ...input, stdin: "9 9\n" }]);
    expect(tokens).toEqual(["t1", "t2"]);
    const call = calls[0]!;
    expect(call.init.method).toBe("POST");
    expect(call.url.pathname).toBe("/submissions/batch");
    expect(call.url.searchParams.get("base64_encoded")).toBe("true");
    const body = JSON.parse(String(call.init.body)) as { submissions: Record<string, unknown>[] };
    expect(body.submissions).toHaveLength(2);
    expect(body.submissions[0]).toEqual({
      language_id: 71,
      source_code: b64("print(1)"),
      stdin: b64("2 3\n"),
      cpu_time_limit: 2,
      wall_time_limit: 5,
      memory_limit: 256_000,
      number_of_runs: 1,
      enable_network: false,
    });
    expect(JSON.stringify(body)).not.toContain("expected_output");
  });

  it("preserves non-ASCII source code through base64", async () => {
    const { client, calls } = setup([json([{ token: "t1" }])]);
    await client.createBatch([{ ...input, sourceCode: "print('héllo ✓')" }]);
    const body = JSON.parse(String(calls[0]!.init.body)) as {
      submissions: { source_code: string }[];
    };
    expect(Buffer.from(body.submissions[0]!.source_code, "base64").toString("utf8")).toBe(
      "print('héllo ✓')",
    );
  });

  it("asks for results by token with base64 and a field list", async () => {
    const { client, calls } = setup([json({ submissions: [] })]);
    await client.getBatch(["a", "b"]);
    const url = calls[0]!.url;
    expect(url.searchParams.get("tokens")).toBe("a,b");
    expect(url.searchParams.get("base64_encoded")).toBe("true");
    expect(url.searchParams.get("fields")).toContain("compile_output");
  });
});

describe("HttpJudge0Client: responses", () => {
  it("decodes base64 output and converts time (seconds) to milliseconds", async () => {
    const { client } = setup([
      json({
        submissions: [
          {
            token: "t1",
            status: { id: 3, description: "Accepted" },
            stdout: b64("5\n"),
            stderr: null,
            compile_output: null,
            message: null,
            time: "0.012",
            memory: 3200,
          },
          {
            token: "t2",
            status: { id: 6, description: "Compilation Error" },
            stdout: null,
            stderr: null,
            compile_output: b64("error: x"),
            message: null,
            time: null,
            memory: null,
          },
        ],
      }),
    ]);
    const [ok, ce] = await client.getBatch(["t1", "t2"]);
    expect(ok).toMatchObject({
      token: "t1",
      statusId: 3,
      stdout: "5\n",
      timeMs: 12,
      memoryKb: 3200,
    });
    expect(ce).toMatchObject({
      statusId: 6,
      compileOutput: "error: x",
      stdout: null,
      timeMs: null,
      memoryKb: null,
    });
  });

  it.each([
    ["not JSON at all", new Response("<html>Bad gateway page</html>", { status: 200 })],
    ["JSON of the wrong shape", json({ unexpected: true })],
    ["a status without an id", json({ submissions: [{ token: "t", status: {} }] })],
  ])("rejects %s as MALFORMED", async (_n, response) => {
    const { client } = setup([response]);
    await expect(client.getBatch(["t"])).rejects.toMatchObject({ kind: "MALFORMED" });
  });

  it("rejects a language list of the wrong shape", async () => {
    const { client } = setup([json([{ id: "x" }])]);
    await expect(client.getLanguages()).rejects.toMatchObject({ kind: "MALFORMED" });
  });

  it("rejects a batch response with missing tokens or the wrong count", async () => {
    await expect(
      setup([json([{ token: "t1" }])]).client.createBatch([input, input]),
    ).rejects.toMatchObject({ kind: "MALFORMED" });
    await expect(
      setup([json([{ language_id: ["is invalid"] }])]).client.createBatch([input]),
    ).rejects.toMatchObject({ kind: "MALFORMED" });
  });
});

describe("HttpJudge0Client: failures and retries", () => {
  const rateLimited = () => new Response("{}", { status: 429, headers: { "retry-after": "0" } });

  it("retries a rate limit, honouring a short Retry-After, then succeeds", async () => {
    const { client, calls } = setup([rateLimited(), json([])]);
    await expect(client.getLanguages()).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("caps an excessive Retry-After at 5 seconds", async () => {
    const { client, sleeps } = setup([
      new Response("{}", { status: 429, headers: { "retry-after": "300" } }),
      json([]),
    ]);
    await client.getLanguages();
    expect(sleeps).toEqual([5000]);
  });

  it("gives up after 3 tries: RATE_LIMITED", async () => {
    const { client, calls } = setup([rateLimited(), rateLimited(), rateLimited()]);
    await expect(client.getLanguages()).rejects.toMatchObject({ kind: "RATE_LIMITED" });
    expect(calls).toHaveLength(3);
  });

  it("retries server errors, then reports UNAVAILABLE", async () => {
    const { client, calls } = setup([
      new Response("x", { status: 503 }),
      new Response("x", { status: 500 }),
      new Response("x", { status: 502 }),
    ]);
    await expect(client.getLanguages()).rejects.toMatchObject({ kind: "UNAVAILABLE" });
    expect(calls).toHaveLength(3);
    const recovers = setup([new Response("x", { status: 500 }), json([])]);
    await expect(recovers.client.getLanguages()).resolves.toEqual([]);
  });

  it("reports network failures and timeouts as UNAVAILABLE after retrying", async () => {
    const net = setup([
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
    ]);
    await expect(net.client.getLanguages()).rejects.toMatchObject({ kind: "UNAVAILABLE" });
    expect(net.calls).toHaveLength(3);
    const timeout = Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
    const t = setup([timeout, timeout, timeout]);
    await expect(t.client.getLanguages()).rejects.toThrow(/timed out/);
  });

  it.each([401, 403])("treats HTTP %i as AUTH and does NOT retry", async (status) => {
    const { client, calls } = setup([new Response("{}", { status })]);
    await expect(client.getLanguages()).rejects.toMatchObject({ kind: "AUTH" });
    expect(calls).toHaveLength(1);
  });

  it.each([400, 404, 422])("treats HTTP %i as BAD_REQUEST and does NOT retry", async (status) => {
    const { client, calls } = setup([
      new Response('{"error":"cpu_time_limit too big"}', { status }),
    ]);
    await expect(client.createBatch([input])).rejects.toMatchObject({ kind: "BAD_REQUEST" });
    expect(calls).toHaveLength(1);
  });

  it("never leaks credentials or the service address into errors", async () => {
    const scenarios: Response[][] = [
      [new Response("{}", { status: 403 })],
      [rateLimited(), rateLimited(), rateLimited()],
      [
        new Response("x", { status: 500 }),
        new Response("x", { status: 500 }),
        new Response("x", { status: 500 }),
      ],
      [new Response("not json", { status: 200 })],
    ];
    for (const responses of scenarios) {
      const { client } = setup(responses);
      const err = (await client.getLanguages().catch((e: unknown) => e)) as ExecutionError;
      expect(err).toBeInstanceOf(ExecutionError);
      for (const text of [err.message, err.userMessage]) {
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain("judge.example.com");
      }
    }
  });
});
