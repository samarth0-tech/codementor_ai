import type { Logger } from "../../lib/logger.js";
import { ExecutionError } from "../submissions/executor.js";
import type {
  PistonClient,
  PistonExecuteInput,
  PistonExecuteResult,
  PistonRuntime,
} from "./types.js";

export interface HttpPistonClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  logger?: Logger;
}

export class HttpPistonClient implements PistonClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly logger?: Logger;

  constructor(options: HttpPistonClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.logger = options.logger;
  }

  private buildHeaders(): Headers {
    const headers = new Headers();
    headers.set("content-type", "application/json");
    if (this.apiKey) {
      headers.set(
        "authorization",
        this.apiKey.startsWith("Bearer ") ? this.apiKey : `Bearer ${this.apiKey}`,
      );
    }
    return headers;
  }

  async getRuntimes(): Promise<PistonRuntime[]> {
    const url = `${this.baseUrl}/runtimes`;
    const res = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!res.ok) {
      throw new ExecutionError(
        "UNAVAILABLE",
        `Failed to fetch Piston runtimes (HTTP ${res.status})`,
      );
    }

    try {
      return (await res.json()) as PistonRuntime[];
    } catch {
      throw new ExecutionError("MALFORMED", "Piston runtimes response was not valid JSON");
    }
  }

  async execute(input: PistonExecuteInput): Promise<PistonExecuteResult> {
    const url = `${this.baseUrl}/execute`;
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(input),
    });

    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({}));
      const msg = body.message || `Piston authorization required (HTTP ${res.status})`;
      throw new ExecutionError("AUTH", msg);
    }

    if (res.status === 429) {
      throw new ExecutionError("RATE_LIMITED", "Piston rate limit exceeded (HTTP 429)");
    }

    if (res.status >= 500) {
      throw new ExecutionError("UNAVAILABLE", `Piston service error (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.message || `Piston execution failed (HTTP ${res.status})`;
      throw new ExecutionError("BAD_REQUEST", msg);
    }

    let body: PistonExecuteResult;
    try {
      body = (await res.json()) as PistonExecuteResult;
    } catch {
      throw new ExecutionError("MALFORMED", "Piston execution response was not valid JSON");
    }

    if (body.message && !body.run) {
      throw new ExecutionError("BAD_REQUEST", body.message);
    }

    return body;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new ExecutionError("TIMEOUT", `Piston request timed out after ${this.timeoutMs}ms`);
      }
      throw new ExecutionError(
        "UNAVAILABLE",
        `Cannot connect to Piston at ${this.baseUrl}: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
