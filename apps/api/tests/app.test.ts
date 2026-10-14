import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { hasDb, makeTestContext, note } from "./helpers.js";

describe.skipIf(!hasDb)("app basics", () => {
  const { app, prisma } = makeTestContext();
  afterAll(() => prisma.$disconnect());

  it("GET /health works without any identity note", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /health/ready checks the database", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready" });
  });

  it("returns a request id header and echoes a safe incoming one", async () => {
    const res = await request(app).get("/health").set("x-request-id", "req-abc-12345678");
    expect(res.headers["x-request-id"]).toBe("req-abc-12345678");
    const generated = await request(app).get("/health").set("x-request-id", "bad id with spaces!");
    expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rejects /api/v1 calls without a valid note (the API is private to the web app)", async () => {
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
    const bad = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer not.a.jwt");
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_ASSERTION");
  });

  it("returns the standard error envelope for unknown routes", async () => {
    const res = await request(app)
      .get("/api/v1/nope")
      .set("Authorization", await note());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: "NOT_FOUND" });
    expect(res.body.error.requestId).toBeTruthy();
  });

  it("returns 400 INVALID_JSON for malformed bodies and 413 for oversized ones", async () => {
    const header = await note();
    const bad = await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", header)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_JSON");

    const big = await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", header)
      .send({ name: "x".repeat(300_000) });
    expect(big.status).toBe(413);
  });
});
