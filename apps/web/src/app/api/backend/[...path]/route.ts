import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { backendRequest } from "@/lib/server/backend";
import { getServerEnv } from "@/lib/server/env";
import {
  MAX_BODY_BYTES,
  buildTargetUrl,
  classifyRoute,
  isSameOrigin,
  pickRequestHeaders,
  pickResponseHeaders,
} from "@/lib/server/forward";
import { clientIpFrom } from "@/lib/server/ip";

// The Backend-for-Frontend route. The browser calls /api/backend/<path>; this handler checks the
// session, attaches a 60-second signed identity note, and forwards to Express /api/v1/<path>.
// See docs/adr/0001-authentication-architecture.md.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ path: string[] }> };

function fail(status: number, code: string, message: string, requestId: string) {
  return NextResponse.json({ error: { code, message, requestId } }, { status });
}

async function handle(request: NextRequest, context: Context): Promise<Response> {
  const requestId = crypto.randomUUID();
  const { path } = await context.params;
  const env = getServerEnv();

  const target = buildTargetUrl(env.API_BASE_URL, path, request.nextUrl.search);
  if (!target) return fail(404, "NOT_FOUND", "Route not found", requestId);

  const kind = classifyRoute(request.method, path.join("/"));
  if (kind === "blocked") return fail(404, "NOT_FOUND", "Route not found", requestId);

  const expectedOrigin = env.AUTH_URL ? new URL(env.AUTH_URL).origin : request.nextUrl.origin;
  const originOk = isSameOrigin(
    request.method,
    {
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    expectedOrigin,
  );
  if (!originOk) return fail(403, "CROSS_ORIGIN_BLOCKED", "Cross-site request blocked", requestId);

  let sub: string | undefined;
  if (kind === "private") {
    const session = await auth();
    if (!session?.user?.id) return fail(401, "UNAUTHENTICATED", "Please sign in", requestId);
    sub = session.user.id;
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "DELETE") {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES)
      return fail(413, "PAYLOAD_TOO_LARGE", "Upload too large", requestId);
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return fail(413, "PAYLOAD_TOO_LARGE", "Upload too large", requestId);
    }
  }

  let upstream: Response;
  try {
    upstream = await backendRequest(target, {
      method: request.method,
      body: body ?? null,
      headers: pickRequestHeaders(request.headers, requestId),
      identity: { ...(sub ? { sub } : {}), ip: clientIpFrom(request.headers) },
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return fail(502, "BACKEND_UNAVAILABLE", "The API is unreachable right now", requestId);
  }

  // Stream the body straight back (this is what makes SSE interview streaming work).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: pickResponseHeaders(upstream.headers),
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
