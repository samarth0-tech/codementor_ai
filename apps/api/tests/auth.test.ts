import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasDb, makeTestContext, note, resetDb, validRegistration } from "./helpers.js";

describe.skipIf(!hasDb)("auth module", () => {
  const { app, prisma } = makeTestContext();

  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  async function registerAsha() {
    return request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", await note())
      .send(validRegistration);
  }

  describe("POST /auth/register", () => {
    it("creates a STUDENT, hashes the password, and never returns the hash", async () => {
      const res = await registerAsha();
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ email: "asha@example.com", role: "STUDENT" });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|correct-horse/);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: "asha@example.com" } });
      expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(stored.passwordHash).not.toContain("correct-horse");
    });

    it("ignores a role sent by the client (no self-promotion to ADMIN)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .set("Authorization", await note())
        .send({ ...validRegistration, role: "ADMIN" });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe("STUDENT");
    });

    it("rejects a duplicate email, case-insensitively, with 409", async () => {
      await registerAsha();
      const res = await request(app)
        .post("/api/v1/auth/register")
        .set("Authorization", await note())
        .send({ ...validRegistration, email: "ASHA@Example.com" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EMAIL_TAKEN");
    });

    it("returns field-level validation errors", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .set("Authorization", await note())
        .send({ name: "", email: "not-an-email", password: "short" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      const paths = res.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(["name", "email", "password"]));
    });

    it("rejects passwords over 72 bytes (bcrypt would silently truncate them)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .set("Authorization", await note())
        .send({ ...validRegistration, password: "a".repeat(73) });
      expect(res.status).toBe(400);
    });

    it("requires an identity note", async () => {
      const res = await request(app).post("/api/v1/auth/register").send(validRegistration);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("MISSING_ASSERTION");
    });
  });

  describe("POST /auth/verify-credentials", () => {
    const login = async (body: object) =>
      request(app)
        .post("/api/v1/auth/verify-credentials")
        .set("Authorization", await note())
        .send(body);

    it("returns the user for correct credentials and records lastLoginAt", async () => {
      await registerAsha();
      const res = await login({ email: "Asha@example.com", password: validRegistration.password });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ email: "asha@example.com", role: "STUDENT" });
      const stored = await prisma.user.findUniqueOrThrow({ where: { email: "asha@example.com" } });
      expect(stored.lastLoginAt).not.toBeNull();
    });

    it("gives the SAME response for a wrong password and an unknown email", async () => {
      await registerAsha();
      const wrongPassword = await login({
        email: "asha@example.com",
        password: "wrong-password-1",
      });
      const unknownEmail = await login({
        email: "nobody@example.com",
        password: "wrong-password-1",
      });
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    });

    it("blocks suspended accounts, but only after the right password", async () => {
      await registerAsha();
      await prisma.user.update({
        where: { email: "asha@example.com" },
        data: { status: "SUSPENDED" },
      });
      const right = await login({
        email: "asha@example.com",
        password: validRegistration.password,
      });
      expect(right.status).toBe(403);
      expect(right.body.error.code).toBe("ACCOUNT_SUSPENDED");
      const wrong = await login({ email: "asha@example.com", password: "wrong-password-1" });
      expect(wrong.status).toBe(401);
    });
  });

  describe("GET /auth/me (identity note -> database lookup)", () => {
    async function createUser(overrides: Record<string, unknown> = {}) {
      return prisma.user.create({
        data: { email: "me@example.com", name: "Me", passwordHash: "x", ...overrides },
      });
    }

    it("returns the user named in the note", async () => {
      const user = await createUser();
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", await note(user.id));
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: user.id,
        email: "me@example.com",
        role: "STUDENT",
      });
    });

    it("rejects an anonymous note (no sub)", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", await note());
      expect(res.status).toBe(401);
    });

    it("rejects a note for a user that does not exist", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", await note("00000000-0000-4000-8000-000000000000"));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("blocks a suspended user on their very next request", async () => {
      const user = await createUser();
      const header = await note(user.id);
      expect((await request(app).get("/api/v1/auth/me").set("Authorization", header)).status).toBe(
        200,
      );
      await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
      const res = await request(app).get("/api/v1/auth/me").set("Authorization", header);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("ACCOUNT_SUSPENDED");
    });

    it("takes the role from the database, so promotions and demotions apply immediately", async () => {
      const user = await createUser({ role: "ADMIN" });
      const header = await note(user.id);
      expect(
        (await request(app).get("/api/v1/auth/me").set("Authorization", header)).body.user.role,
      ).toBe("ADMIN");
      await prisma.user.update({ where: { id: user.id }, data: { role: "STUDENT" } });
      expect(
        (await request(app).get("/api/v1/auth/me").set("Authorization", header)).body.user.role,
      ).toBe("STUDENT");
    });
  });

  describe("rate limiting", () => {
    it("limits repeated login attempts for the same email and IP", async () => {
      const limited = makeTestContext({
        limits: {
          login: { windowMs: 60_000, limit: 2 },
          register: { windowMs: 60_000, limit: 100 },
        },
      });
      const attempt = async () =>
        request(limited.app)
          .post("/api/v1/auth/verify-credentials")
          .set("Authorization", await note())
          .send({ email: "x@example.com", password: "whatever-password" });
      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(401);
      const third = await attempt();
      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe("RATE_LIMITED");
      await limited.prisma.$disconnect();
    });
  });
});
