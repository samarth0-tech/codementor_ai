import { describe, expect, it } from "vitest";
import {
  buildTargetUrl,
  classifyRoute,
  isSameOrigin,
  pickRequestHeaders,
  pickResponseHeaders,
} from "./forward";

const BASE = "http://api.test:4000";

describe("buildTargetUrl", () => {
  it("maps segments under /api/v1 and keeps the query string", () => {
    expect(buildTargetUrl(BASE, ["problems", "two-sum"], "?x=1")?.href).toBe(
      "http://api.test:4000/api/v1/problems/two-sum?x=1",
    );
  });

  it.each([
    [[]],
    [[".."]],
    [["problems", ".."]],
    [["."]],
    [["a/b"]],
    [["a\\b"]],
    [["%2e%2e"]],
    [["http:", "", "evil.com"]],
    [[""]],
    [["a b"]],
  ])("rejects unsafe path %j", (segments) => {
    expect(buildTargetUrl(BASE, segments, "")).toBeNull();
  });

  it("can never leave the configured host", () => {
    const url = buildTargetUrl(BASE, ["@evil.com"], "");
    expect(url).toBeNull();
  });
});

describe("classifyRoute", () => {
  it("blocks the service-only credential check", () => {
    expect(classifyRoute("POST", "auth/verify-credentials")).toBe("blocked");
    expect(classifyRoute("GET", "auth/verify-credentials")).toBe("blocked");
  });
  it("allows only POST auth/register without a session", () => {
    expect(classifyRoute("POST", "auth/register")).toBe("public");
    expect(classifyRoute("GET", "auth/register")).toBe("private");
  });
  it("treats everything else as private", () => {
    expect(classifyRoute("GET", "interviews")).toBe("private");
    expect(classifyRoute("POST", "admin/problems")).toBe("private");
  });
});

describe("isSameOrigin (CSRF defence)", () => {
  const origin = "https://app.example.com";
  it("always allows safe methods", () => {
    expect(isSameOrigin("GET", { origin: null, secFetchSite: null }, origin)).toBe(true);
  });
  it("requires a matching Origin for state-changing methods", () => {
    expect(isSameOrigin("POST", { origin, secFetchSite: null }, origin)).toBe(true);
    expect(isSameOrigin("POST", { origin: "https://evil.com", secFetchSite: null }, origin)).toBe(
      false,
    );
    expect(isSameOrigin("DELETE", { origin: "null", secFetchSite: null }, origin)).toBe(false);
  });
  it("falls back to Sec-Fetch-Site when Origin is absent", () => {
    expect(isSameOrigin("POST", { origin: null, secFetchSite: "same-origin" }, origin)).toBe(true);
    expect(isSameOrigin("POST", { origin: null, secFetchSite: "cross-site" }, origin)).toBe(false);
    expect(isSameOrigin("POST", { origin: null, secFetchSite: null }, origin)).toBe(false);
  });
});

describe("header allowlists", () => {
  it("never forwards cookies or authorization from the browser", () => {
    const h = pickRequestHeaders(
      new Headers({
        cookie: "authjs.session-token=secret",
        authorization: "Bearer forged",
        "content-type": "application/json",
        "x-forwarded-for": "6.6.6.6",
      }),
      "req-1",
    );
    expect(h.get("cookie")).toBeNull();
    expect(h.get("authorization")).toBeNull();
    expect(h.get("x-forwarded-for")).toBeNull();
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("x-request-id")).toBe("req-1");
  });

  it("does not leak upstream set-cookie and forces no-store caching", () => {
    const h = pickResponseHeaders(
      new Headers({
        "set-cookie": "x=1",
        "content-type": "application/json",
        "x-request-id": "abc",
      }),
    );
    expect(h.get("set-cookie")).toBeNull();
    expect(h.get("cache-control")).toBe("no-store");
    expect(h.get("x-request-id")).toBe("abc");
  });
});
