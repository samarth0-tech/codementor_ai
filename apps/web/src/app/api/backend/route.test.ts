import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAssertion } from "@codementor/shared/assertion";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));

const { GET, POST } = await import("./[...path]/route");

const SECRET = process.env.API_SHARED_SECRET as string;
const USER_ID = "8f14e45f-ceea-4e67-9d3c-1b2a3c4d5e6f";
const fetchMock = vi.fn();

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost:3000${url}`, init);

beforeEach(() => {
  authMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("/api/backend forwarding route", () => {
  it("rejects private routes without a session, without contacting the API", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req("/api/backend/interviews"), ctx("interviews"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards signed-in requests with a verifiable note naming the session user", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID, role: "STUDENT" } });
    const res = await GET(
      req("/api/backend/interviews?page=2", {
        headers: { cookie: "authjs.session-token=secret", "x-forwarded-for": "198.51.100.9" },
      }),
      ctx("interviews"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://api.test:4000/api/v1/interviews?page=2");
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBeNull();
    const claims = await verifyAssertion(SECRET, headers.get("authorization")!.slice(7));
    expect(claims).toEqual({ sub: USER_ID, ip: "198.51.100.9" });
  });

  it("lets registration through anonymously (note without sub)", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(
      req("/api/backend/auth/register", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      }),
      ctx("auth", "register"),
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const claims = await verifyAssertion(
      SECRET,
      new Headers(init.headers).get("authorization")!.slice(7),
    );
    expect(claims.sub).toBeUndefined();
  });

  it("hides the service-only credential check from browsers", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    const res = await POST(
      req("/api/backend/auth/verify-credentials", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: "{}",
      }),
      ctx("auth", "verify-credentials"),
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks cross-site state-changing requests (CSRF)", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    const res = await POST(
      req("/api/backend/interviews", {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: "{}",
      }),
      ctx("interviews"),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("CROSS_ORIGIN_BLOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects path traversal attempts", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    const res = await GET(req("/api/backend/x"), ctx("..", "health"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized uploads before forwarding", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    const res = await POST(
      req("/api/backend/resumes", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-length": String(5 * 1024 * 1024) },
        body: "x",
      }),
      ctx("resumes"),
    );
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 with the standard envelope when the API is down", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(req("/api/backend/interviews"), ctx("interviews"));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("BACKEND_UNAVAILABLE");
  });

  it("passes API errors and their status codes straight through", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "nope" } }), {
        status: 404,
        headers: { "content-type": "application/json", "set-cookie": "evil=1" },
      }),
    );
    const res = await GET(req("/api/backend/interviews/abc"), ctx("interviews", "abc"));
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
