// Pure helper functions for the /api/backend/* forwarding route. Kept free of Next.js imports
// so they are easy to unit test. These rules stop the route from becoming an open proxy (SSRF)
// or a CSRF target.

export const MAX_BODY_BYTES = 2.5 * 1024 * 1024; // below Vercel's request body limit

const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

/**
 * Builds the Express URL for a forwarded request, or returns null if the path is not allowed.
 * - Destination host is ALWAYS the configured API (the browser cannot choose it).
 * - Path is ALWAYS under /api/v1/.
 */
export function buildTargetUrl(baseUrl: string, segments: string[], search: string): URL | null {
  if (segments.length === 0) return null;
  if (!segments.every((s) => SAFE_SEGMENT.test(s) && s !== "." && s !== "..")) return null;
  const base = new URL(baseUrl);
  const url = new URL(`/api/v1/${segments.join("/")}`, base);
  url.search = search;
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/v1/")) return null;
  return url;
}

export type RouteKind = "public" | "blocked" | "private";

/**
 * - blocked: service-to-service endpoints the browser must never reach.
 * - public: callable without a session (only registration).
 * - private: everything else; needs a signed-in user.
 */
export function classifyRoute(method: string, path: string): RouteKind {
  if (path === "auth/verify-credentials") return "blocked";
  if (method === "POST" && path === "auth/register") return "public";
  return "private";
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing requests must come from our
 * own site. (SameSite=Lax cookies are the first layer; this is the second.)
 */
export function isSameOrigin(
  method: string,
  headers: { origin: string | null; secFetchSite: string | null },
  expectedOrigin: string,
): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (headers.origin) return headers.origin === expectedOrigin;
  return headers.secFetchSite === "same-origin";
}

const FORWARD_REQUEST_HEADERS = ["content-type", "accept"] as const;
const FORWARD_RESPONSE_HEADERS = ["content-type", "x-request-id", "retry-after"] as const;

/** Only a short allowlist of headers is forwarded. Cookies and auth headers never are. */
export function pickRequestHeaders(source: Headers, requestId: string): Headers {
  const out = new Headers({ "x-request-id": requestId });
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = source.get(name);
    if (value) out.set(name, value);
  }
  return out;
}

export function pickResponseHeaders(source: Headers): Headers {
  const out = new Headers({ "cache-control": "no-store" });
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = source.get(name);
    if (value) out.set(name, value);
  }
  return out;
}
