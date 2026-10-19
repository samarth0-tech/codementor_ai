import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://u@localhost:5432/db",
  API_SHARED_SECRET: "x".repeat(32),
};

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.BCRYPT_COST).toBe(12);
  });

  it("rejects a shared secret shorter than 32 characters", () => {
    expect(() => loadEnv({ ...valid, API_SHARED_SECRET: "short" })).toThrow(/API_SHARED_SECRET/);
  });

  it("rejects a missing DATABASE_URL and lists every problem", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL[\s\S]*API_SHARED_SECRET/);
  });

  it("coerces PORT from a string", () => {
    expect(loadEnv({ ...valid, PORT: "8080" }).PORT).toBe(8080);
  });
});

describe("loadEnv: code execution (Judge0)", () => {
  const base = {
    DATABASE_URL: "postgresql://u@localhost:5432/db",
    API_SHARED_SECRET: "x".repeat(32),
  };

  it("defaults to real execution (judge0) and sensible limits", () => {
    const env = loadEnv(base);
    expect(env.CODE_EXECUTOR).toBe("judge0");
    expect(env.JUDGE0_API_URL).toBeUndefined();
    expect(env.JUDGE0_MAX_BATCH).toBe(20);
    expect(env.JUDGE0_TIMEOUT_MS).toBe(15_000);
  });

  it("refuses the SIMULATED executor in production", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production", CODE_EXECUTOR: "fake" })).toThrow(
      /CODE_EXECUTOR/,
    );
    expect(loadEnv({ ...base, NODE_ENV: "development", CODE_EXECUTOR: "fake" }).CODE_EXECUTOR).toBe(
      "fake",
    );
  });

  it("requires https for remote Judge0, but allows plain http on localhost", () => {
    expect(() => loadEnv({ ...base, JUDGE0_API_URL: "http://judge0.example.com" })).toThrow(
      /https/,
    );
    expect(loadEnv({ ...base, JUDGE0_API_URL: "https://judge0.example.com" }).JUDGE0_API_URL).toBe(
      "https://judge0.example.com",
    );
    expect(loadEnv({ ...base, JUDGE0_API_URL: "http://localhost:2358" }).JUDGE0_API_URL).toBe(
      "http://localhost:2358",
    );
    expect(
      loadEnv({ ...base, JUDGE0_API_URL: "http://127.0.0.1:2358" }).JUDGE0_API_URL,
    ).toBeDefined();
  });

  it("accepts one kind of credential, not both", () => {
    const url = "https://judge0.example.com";
    expect(
      loadEnv({ ...base, JUDGE0_API_URL: url, JUDGE0_AUTH_TOKEN: "t" }).JUDGE0_AUTH_TOKEN,
    ).toBe("t");
    expect(
      loadEnv({ ...base, JUDGE0_API_URL: url, JUDGE0_RAPIDAPI_KEY: "k" }).JUDGE0_RAPIDAPI_KEY,
    ).toBe("k");
    expect(() =>
      loadEnv({ ...base, JUDGE0_API_URL: url, JUDGE0_AUTH_TOKEN: "t", JUDGE0_RAPIDAPI_KEY: "k" }),
    ).toThrow(/not both/);
  });

  it("needs a URL whenever a RapidAPI key is set", () => {
    expect(() => loadEnv({ ...base, JUDGE0_RAPIDAPI_KEY: "k" })).toThrow(/JUDGE0_API_URL/);
  });

  it("bounds the batch size and timeouts", () => {
    expect(() => loadEnv({ ...base, JUDGE0_MAX_BATCH: "21" })).toThrow();
    expect(() => loadEnv({ ...base, JUDGE0_TIMEOUT_MS: "10" })).toThrow();
    expect(loadEnv({ ...base, JUDGE0_MAX_BATCH: "5" }).JUDGE0_MAX_BATCH).toBe(5);
  });
});

describe("loadEnv: code execution (Piston)", () => {
  const base = {
    DATABASE_URL: "postgresql://u@localhost:5432/db",
    API_SHARED_SECRET: "x".repeat(32),
  };

  it("accepts CODE_EXECUTOR=piston and applies defaults", () => {
    const env = loadEnv({ ...base, CODE_EXECUTOR: "piston" });
    expect(env.CODE_EXECUTOR).toBe("piston");
    expect(env.PISTON_API_URL).toBe("https://emkc.org/api/v2/piston");
    expect(env.PISTON_TIMEOUT_MS).toBe(15_000);
  });

  it("allows Piston in production", () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: "production",
      CODE_EXECUTOR: "piston",
      AI_PROVIDER: "anthropic",
    });
    expect(env.CODE_EXECUTOR).toBe("piston");
  });

  it("requires https for remote Piston, but allows plain http on localhost", () => {
    expect(() => loadEnv({ ...base, PISTON_API_URL: "http://piston.example.com" })).toThrow(
      /https/,
    );
    expect(loadEnv({ ...base, PISTON_API_URL: "https://piston.example.com" }).PISTON_API_URL).toBe(
      "https://piston.example.com",
    );
    expect(
      loadEnv({ ...base, PISTON_API_URL: "http://localhost:2000/api/v2" }).PISTON_API_URL,
    ).toBe("http://localhost:2000/api/v2");
  });
});
