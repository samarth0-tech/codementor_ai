import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { ApiError } from "./errors";

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("calls /api/backend and parses JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ hello: "world" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await api.get("/ping")).toEqual({ hello: "world" });
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe("/api/backend/ping");
  });

  it("sends JSON bodies with a content-type header", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await api.post("/things", { a: 1 });
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe('{"a":1}');
  });

  it("turns the error envelope into a typed ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "VALIDATION_FAILED", message: "bad", requestId: "r1" },
            }),
            { status: 400 },
          ),
      ),
    );
    await expect(api.get("/x")).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
      requestId: "r1",
    });
  });

  it("reports network failures as ApiError NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    const err = await api.get("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("NETWORK_ERROR");
  });
});
