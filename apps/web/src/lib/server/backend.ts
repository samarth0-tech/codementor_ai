import { signAssertion, type AssertionClaims } from "@codementor/shared/assertion";
import { ApiError, parseErrorResponse } from "@/lib/api/errors";
import { getServerEnv } from "./env";

// Server-side only. This is where the 60-second signed identity note is created and attached.

export interface BackendRequestOptions {
  method?: string;
  /** Sent as a JSON body. */
  json?: unknown;
  /** Raw body (used by the forwarding route). Ignored when `json` is set. */
  body?: BodyInit | null;
  headers?: HeadersInit;
  /** Who is calling: `sub` for a signed-in user, omitted for anonymous (pre-login) calls. */
  identity: AssertionClaims;
  signal?: AbortSignal;
}

/** `target` is either a URL already checked by the forwarder or an API path like "/auth/me". */
export async function backendRequest(
  target: URL | string,
  options: BackendRequestOptions,
): Promise<Response> {
  const env = getServerEnv();
  const url = typeof target === "string" ? new URL(`/api/v1${target}`, env.API_BASE_URL) : target;
  const token = await signAssertion(env.API_SHARED_SECRET, options.identity);

  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (options.json !== undefined) headers.set("content-type", "application/json");

  return fetch(url, {
    method: options.method ?? (options.json !== undefined ? "POST" : "GET"),
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : (options.body ?? null),
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
}

/** Calls the API and returns parsed JSON, or throws ApiError. */
export async function backendJson<T>(path: string, options: BackendRequestOptions): Promise<T> {
  let res: Response;
  try {
    res = await backendRequest(path, options);
  } catch {
    throw new ApiError(502, "BACKEND_UNAVAILABLE", "The API is unreachable right now.");
  }
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as T;
}
