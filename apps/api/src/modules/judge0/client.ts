import { z } from "zod";
import type { Logger } from "../../lib/logger.js";
import { ExecutionError } from "../submissions/executor.js";
import {
  batchResultSchema,
  languageListSchema,
  type Judge0Client,
  type Judge0Language,
  type Judge0Result,
  type Judge0SubmissionInput,
} from "./types.js";

export type Judge0Auth =
  | { kind: "none" }
  /** Self-hosted Judge0: the token goes in the X-Auth-Token header. */
  | { kind: "token"; token: string }
  /** Judge0 on RapidAPI. */
  | { kind: "rapidapi"; key: string; host: string };

export interface HttpJudge0ClientOptions {
  baseUrl: string;
  auth: Judge0Auth;
  /** Per HTTP request. */
  timeoutMs: number;
  /** Total tries for a request that fails with a retryable problem (network, 429, 5xx). */
  maxAttempts: number;
  retryBaseDelayMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

const RESULT_FIELDS = "token,status,stdout,stderr,compile_output,message,time,memory";
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const encode = (text: string) => Buffer.from(text, "utf8").toString("base64");
const decode = (text: string | null | undefined): string | null =>
  text ? Buffer.from(text, "base64").toString("utf8") : null;

const tokenListSchema = z.array(z.object({ token: z.string().min(1) }));

/**
 * Talks to Judge0 over HTTP. Credentials are read here and ONLY here: they are sent as headers
 * and never appear in URLs, logs, error messages or anything returned to a browser.
 */
export class HttpJudge0Client implements Judge0Client {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpJudge0ClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async getLanguages(): Promise<Judge0Language[]> {
    const json = await this.request("GET", "/languages");
    const parsed = languageListSchema.safeParse(json);
    if (!parsed.success)
      throw new ExecutionError("MALFORMED", "Judge0 /languages returned an unexpected shape");
    return parsed.data;
  }

  async createBatch(inputs: Judge0SubmissionInput[]): Promise<string[]> {
    const json = await this.request("POST", "/submissions/batch", {
      query: { base64_encoded: "true" },
      body: {
        submissions: inputs.map((i) => ({
          language_id: i.languageId,
          source_code: encode(i.sourceCode),
          stdin: encode(i.stdin),
          cpu_time_limit: i.cpuTimeLimit,
          wall_time_limit: i.wallTimeLimit,
          memory_limit: i.memoryLimitKb,
          number_of_runs: 1,
          enable_network: false,
        })),
      },
    });
    const parsed = tokenListSchema.safeParse(json);
    if (!parsed.success || parsed.data.length !== inputs.length) {
      throw new ExecutionError(
        "MALFORMED",
        "Judge0 batch creation returned an unexpected response",
      );
    }
    return parsed.data.map((t) => t.token);
  }

  async getBatch(tokens: string[]): Promise<Judge0Result[]> {
    const json = await this.request("GET", "/submissions/batch", {
      query: { tokens: tokens.join(","), base64_encoded: "true", fields: RESULT_FIELDS },
    });
    const parsed = batchResultSchema.safeParse(json);
    if (!parsed.success)
      throw new ExecutionError("MALFORMED", "Judge0 results had an unexpected shape");
    return parsed.data.submissions.map((r) => {
      const seconds = r.time === null || r.time === undefined ? Number.NaN : Number(r.time);
      return {
        token: r.token,
        statusId: r.status.id,
        statusDescription: r.status.description ?? "",
        stdout: decode(r.stdout),
        stderr: decode(r.stderr),
        compileOutput: decode(r.compile_output),
        message: decode(r.message),
        timeMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
        memoryKb: r.memory ?? null,
      };
    });
  }

  // ------------------------------------------------------------------ plumbing

  private headers(): Record<string, string> {
    const base: Record<string, string> = { accept: "application/json" };
    const auth = this.options.auth;
    if (auth.kind === "token") base["x-auth-token"] = auth.token;
    if (auth.kind === "rapidapi") {
      base["x-rapidapi-key"] = auth.key;
      base["x-rapidapi-host"] = auth.host;
    }
    return base;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<unknown> {
    const url = new URL(this.options.baseUrl.replace(/\/+$/, "") + path);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

    let failure: ExecutionError | undefined;
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      let waitMs = this.options.retryBaseDelayMs * 2 ** (attempt - 1);
      let response: Response | undefined;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            ...this.headers(),
            ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : null,
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
      } catch (err) {
        const reason = (err as Error)?.name === "TimeoutError" ? "timed out" : "network error";
        failure = new ExecutionError("UNAVAILABLE", `Judge0 ${method} ${path}: ${reason}`);
      }

      if (response) {
        if (response.ok) {
          try {
            return await response.json();
          } catch {
            throw new ExecutionError(
              "MALFORMED",
              `Judge0 ${method} ${path}: response was not valid JSON`,
            );
          }
        }
        if (response.status === 429) {
          failure = new ExecutionError("RATE_LIMITED", `Judge0 ${method} ${path}: HTTP 429`);
          const retryAfter = Number(response.headers.get("retry-after"));
          if (Number.isFinite(retryAfter) && retryAfter >= 0)
            waitMs = Math.min(retryAfter * 1000, 5000);
        } else if (response.status >= 500) {
          failure = new ExecutionError(
            "UNAVAILABLE",
            `Judge0 ${method} ${path}: HTTP ${response.status}`,
          );
        } else if (response.status === 401 || response.status === 403) {
          // A wrong or missing credential: retrying cannot help. Fix JUDGE0_* settings.
          throw new ExecutionError(
            "AUTH",
            `Judge0 ${method} ${path}: HTTP ${response.status} (check the credentials)`,
          );
        } else {
          const body = (await response.text().catch(() => "")).slice(0, 300);
          throw new ExecutionError(
            "BAD_REQUEST",
            `Judge0 ${method} ${path}: HTTP ${response.status} ${body}`,
          );
        }
      }

      if (attempt < this.options.maxAttempts) {
        this.options.logger?.warn(
          { attempt, kind: failure?.kind, path },
          "Judge0 request failed; retrying",
        );
        await this.sleep(waitMs);
      }
    }
    throw failure ?? new ExecutionError("UNAVAILABLE", `Judge0 ${method} ${path}: failed`);
  }
}
