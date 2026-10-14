import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

// A small imitation of a Judge0 server, speaking the real HTTP protocol (endpoints, base64, status
// ids, polling, X-Auth-Token), so the real HttpJudge0Client and Judge0Executor can be tested
// without a real sandbox. It does NOT run code: source code carries a marker comment that says
// what the "program" does:
//   FAKE:echo       prints its input          FAKE:out=text   prints "text"
//   FAKE:ce         compile error (status 6)  FAKE:re         runtime error (status 11)
//   FAKE:tle        time limit (status 5)     FAKE:ise        internal error (status 13)
//   (no marker)     prints nothing

export interface FakeLanguage {
  id: number;
  name: string;
}

/** A Judge0 1.13.0-era language list (the ids our seed data uses). */
export const CLASSIC_LANGUAGES: FakeLanguage[] = [
  { id: 48, name: "C (GCC 7.4.0)" },
  { id: 50, name: "C (GCC 9.2.0)" },
  { id: 75, name: "C (Clang 7.0.1)" },
  { id: 52, name: "C++ (GCC 7.4.0)" },
  { id: 54, name: "C++ (GCC 9.2.0)" },
  { id: 62, name: "Java (OpenJDK 13.0.1)" },
  { id: 63, name: "JavaScript (Node.js 12.14.0)" },
  { id: 70, name: "Python (2.7.17)" },
  { id: 71, name: "Python (3.8.1)" },
  { id: 74, name: "TypeScript (3.7.4)" },
];

/** A newer instance: different ids for everything (as real instances differ). */
export const MODERN_LANGUAGES: FakeLanguage[] = [
  { id: 103, name: "C (GCC 14.1.0)" },
  { id: 105, name: "C++ (GCC 14.1.0)" },
  { id: 91, name: "Java (JDK 17.0.6)" },
  { id: 93, name: "JavaScript (Node.js 18.15.0)" },
  { id: 92, name: "Python (3.11.2)" },
  { id: 100, name: "Python (3.12.5)" },
  { id: 70, name: "Python (2.7.17)" },
  { id: 101, name: "TypeScript (5.6.2)" },
];

export interface Fault {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

export interface Received {
  languageId: number;
  source: string;
  stdin: string;
  cpuTimeLimit: number;
  wallTimeLimit: number;
  memoryLimitKb: number;
  enableNetwork: unknown;
}

const b64 = (text: string | null) =>
  text === null || text === "" ? null : Buffer.from(text).toString("base64");
const unb64 = (text: unknown) => Buffer.from(String(text ?? ""), "base64").toString("utf8");

export class FakeJudge0 {
  readonly requests: { method: string; path: string; headers: IncomingHttpHeaders }[] = [];
  readonly received: Received[] = [];
  batchPosts = 0;
  url = "";
  languages: FakeLanguage[];
  token: string | undefined;
  /** How many times a result is polled before it leaves "Processing". Infinity = never finishes. */
  pollsBeforeDone: number;

  private readonly port: number;
  private readonly store = new Map<string, { sub: Received; polls: number }>();
  private readonly faults: Fault[] = [];
  private readonly pollFaults: Fault[] = [];
  private readonly server = http.createServer((req, res) => void this.handle(req, res));

  constructor(
    options: {
      token?: string;
      languages?: FakeLanguage[];
      pollsBeforeDone?: number;
      port?: number;
    } = {},
  ) {
    this.port = options.port ?? 0;
    this.token = options.token;
    this.languages = options.languages ?? CLASSIC_LANGUAGES;
    this.pollsBeforeDone = options.pollsBeforeDone ?? 1;
  }

  async start(): Promise<this> {
    await new Promise<void>((resolve) => this.server.listen(this.port, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** The next requests (any endpoint) get these responses instead of the normal behaviour. */
  failNext(...faults: Fault[]): void {
    this.faults.push(...faults);
  }

  /** Like failNext, but only for the next requests that FETCH RESULTS (after a batch was created). */
  failNextPoll(...faults: Fault[]): void {
    this.pollFaults.push(...faults);
  }

  get stdins(): string[] {
    return this.received.map((r) => r.stdin);
  }

  private outcome(sub: Received) {
    const marker = /FAKE:(\w+)(?:=([^\r\n]*))?/.exec(sub.source);
    const mode = marker?.[1] ?? "none";
    const arg = marker?.[2] ?? "";
    const base = {
      stdout: null as string | null,
      stderr: null as string | null,
      compile: null as string | null,
      message: null as string | null,
    };
    switch (mode) {
      case "echo":
        return { ...base, id: 3, desc: "Accepted", stdout: sub.stdin, time: "0.015" };
      case "out":
        return { ...base, id: 3, desc: "Accepted", stdout: `${arg}\n`, time: "0.015" };
      case "ce":
        return {
          ...base,
          id: 6,
          desc: "Compilation Error",
          compile: "main.c:1:11: error: expected declaration specifiers",
          time: null,
        };
      case "re":
        return {
          ...base,
          id: 11,
          desc: "Runtime Error (NZEC)",
          stderr: "ZeroDivisionError: division by zero",
          message: "Exited with error status 1",
          time: "0.020",
        };
      case "tle":
        return { ...base, id: 5, desc: "Time Limit Exceeded", time: String(sub.cpuTimeLimit) };
      case "ise":
        return {
          ...base,
          id: 13,
          desc: "Internal Error",
          message: "No such file or directory @ rb_sysopen - /box/script.py",
          time: null,
        };
      default:
        return { ...base, id: 3, desc: "Accepted", time: "0.010" };
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://fake");
    this.requests.push({ method: req.method ?? "", path: url.pathname, headers: req.headers });
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");

    const fault = this.faults.shift();
    if (fault) return send(fault.status, fault.body ?? "{}", fault.headers);

    if (this.token && req.headers["x-auth-token"] !== this.token) {
      return send(403, { error: "Invalid authentication token" });
    }

    if (req.method === "GET" && url.pathname === "/languages") return send(200, this.languages);

    if (req.method === "POST" && url.pathname === "/submissions/batch") {
      this.batchPosts++;
      let items: Record<string, unknown>[];
      try {
        items = (JSON.parse(raw) as { submissions: Record<string, unknown>[] }).submissions;
      } catch {
        return send(422, { error: "bad body" });
      }
      if (!Array.isArray(items) || items.length > 20) {
        return send(422, {
          error: "number of submissions in a batch should be less than or equal to 20",
        });
      }
      const decode =
        url.searchParams.get("base64_encoded") === "true" ? unb64 : (t: unknown) => String(t ?? "");
      const unknownLanguage = items.find(
        (i) => !this.languages.some((l) => l.id === i["language_id"]),
      );
      if (unknownLanguage) return send(422, [{ language_id: ["language doesn't exist"] }]);
      const tokens = items.map((i) => {
        const sub: Received = {
          languageId: Number(i["language_id"]),
          source: decode(i["source_code"]),
          stdin: decode(i["stdin"]),
          cpuTimeLimit: Number(i["cpu_time_limit"]),
          wallTimeLimit: Number(i["wall_time_limit"]),
          memoryLimitKb: Number(i["memory_limit"]),
          enableNetwork: i["enable_network"],
        };
        this.received.push(sub);
        const token = randomUUID();
        this.store.set(token, { sub, polls: 0 });
        return { token };
      });
      return send(201, tokens);
    }

    if (req.method === "GET" && url.pathname === "/submissions/batch") {
      const pollFault = this.pollFaults.shift();
      if (pollFault) return send(pollFault.status, pollFault.body ?? "{}", pollFault.headers);
      const encode =
        url.searchParams.get("base64_encoded") === "true" ? b64 : (t: string | null) => t;
      const tokens = (url.searchParams.get("tokens") ?? "").split(",").filter(Boolean);
      const submissions = tokens.map((token) => {
        const entry = this.store.get(token);
        if (!entry) return { token, status: { id: 13, description: "Internal Error" } };
        entry.polls++;
        if (entry.polls <= this.pollsBeforeDone) {
          return {
            token,
            status: { id: 2, description: "Processing" },
            stdout: null,
            stderr: null,
            compile_output: null,
            message: null,
            time: null,
            memory: null,
          };
        }
        const o = this.outcome(entry.sub);
        return {
          token,
          status: { id: o.id, description: o.desc },
          stdout: encode(o.stdout),
          stderr: encode(o.stderr),
          compile_output: encode(o.compile),
          message: encode(o.message),
          time: o.time,
          memory: o.id === 6 || o.id === 13 ? null : 3200,
        };
      });
      return send(200, { submissions });
    }

    return send(404, { error: "not found" });
  }
}
