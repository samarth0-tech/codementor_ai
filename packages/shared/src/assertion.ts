import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

// The "identity note": a tiny JWT the Next.js server attaches to every call to Express.
// It is NOT a login session. It lives 60 seconds and is created fresh for each request.
// See docs/adr/0001-authentication-architecture.md.

export const ASSERTION_ISSUER = "codementor-web";
export const ASSERTION_AUDIENCE = "codementor-api";
export const ASSERTION_TTL_SECONDS = 60;
export const MIN_SECRET_LENGTH = 32;

const claimsSchema = z.object({
  sub: z.uuid().optional(),
  ip: z.string().max(64).optional(),
});
export type AssertionClaims = z.infer<typeof claimsSchema>;

function toKey(secret: string): Uint8Array {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Shared secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

/** Called by the Next.js server. `sub` is omitted for anonymous (pre-login) calls. */
export async function signAssertion(secret: string, claims: AssertionClaims): Promise<string> {
  const jwt = new SignJWT(claims.ip ? { ip: claims.ip } : {})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ASSERTION_ISSUER)
    .setAudience(ASSERTION_AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${ASSERTION_TTL_SECONDS}s`);
  if (claims.sub) jwt.setSubject(claims.sub);
  return jwt.sign(toKey(secret));
}

/** Called by Express. Throws if the signature, issuer, audience or expiry is wrong. */
export async function verifyAssertion(secret: string, token: string): Promise<AssertionClaims> {
  const { payload } = await jwtVerify(token, toKey(secret), {
    issuer: ASSERTION_ISSUER,
    audience: ASSERTION_AUDIENCE,
    algorithms: ["HS256"],
    clockTolerance: 5,
    maxTokenAge: `${ASSERTION_TTL_SECONDS + 30}s`,
  });
  return claimsSchema.parse({ sub: payload.sub, ip: payload["ip"] });
}
