import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  ASSERTION_AUDIENCE,
  ASSERTION_ISSUER,
  signAssertion,
  verifyAssertion,
} from "@codementor/shared/assertion";

const SECRET = "a-long-enough-shared-secret-for-tests-123";
const USER_ID = "8f14e45f-ceea-4e67-9d3c-1b2a3c4d5e6f";
const key = (s: string) => new TextEncoder().encode(s);

/** Builds a note by hand so tests can break one rule at a time. */
function forge(opts: { secret?: string; iss?: string; aud?: string; exp?: string | number }) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(opts.iss ?? ASSERTION_ISSUER)
    .setAudience(opts.aud ?? ASSERTION_AUDIENCE)
    .setSubject(USER_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "60s")
    .sign(key(opts.secret ?? SECRET));
}

describe("identity assertion", () => {
  it("round-trips sub and ip", async () => {
    const token = await signAssertion(SECRET, { sub: USER_ID, ip: "1.2.3.4" });
    expect(await verifyAssertion(SECRET, token)).toEqual({ sub: USER_ID, ip: "1.2.3.4" });
  });

  it("supports anonymous notes (no sub)", async () => {
    const token = await signAssertion(SECRET, { ip: "1.2.3.4" });
    const claims = await verifyAssertion(SECRET, token);
    expect(claims.sub).toBeUndefined();
  });

  it("rejects a note signed with a different secret", async () => {
    const token = await forge({ secret: "another-secret-another-secret-another-1" });
    await expect(verifyAssertion(SECRET, token)).rejects.toThrow();
  });

  it("rejects a wrong audience and a wrong issuer", async () => {
    await expect(verifyAssertion(SECRET, await forge({ aud: "someone-else" }))).rejects.toThrow();
    await expect(verifyAssertion(SECRET, await forge({ iss: "someone-else" }))).rejects.toThrow();
  });

  it("rejects an expired note", async () => {
    const past = Math.floor(Date.now() / 1000) - 600;
    await expect(verifyAssertion(SECRET, await forge({ exp: past }))).rejects.toThrow();
  });

  it("rejects a tampered payload", async () => {
    const token = await signAssertion(SECRET, { sub: USER_ID });
    const [h, , s] = token.split(".");
    const evil = Buffer.from(
      JSON.stringify({ sub: "00000000-0000-4000-8000-000000000000" }),
    ).toString("base64url");
    await expect(verifyAssertion(SECRET, `${h}.${evil}.${s}`)).rejects.toThrow();
  });

  it("rejects the 'alg: none' trick", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: USER_ID, iss: ASSERTION_ISSUER, aud: ASSERTION_AUDIENCE }),
    ).toString("base64url");
    await expect(verifyAssertion(SECRET, `${header}.${payload}.`)).rejects.toThrow();
  });

  it("refuses to sign with a short secret", async () => {
    await expect(signAssertion("short", { sub: USER_ID })).rejects.toThrow(/at least 32/);
  });
});
