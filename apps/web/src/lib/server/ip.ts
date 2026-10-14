import { isIP } from "node:net";

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). Used for rate limiting. */
export function clientIpFrom(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim();
  return candidate && isIP(candidate) ? candidate : undefined;
}
