import { z } from "zod";
import { createLogger } from "../lib/logger.js";
import { createPrisma } from "../lib/prisma.js";
import { seedDatabase } from "./seed.js";

// Usage: npm run db:seed -w @codementor/api
// To also create the first admin, set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (10+ characters)
// in apps/api/.env for this run. Admins are never created through public registration.
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    SEED_ADMIN_EMAIL: z.email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(10).max(72).optional(),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  })
  .parse(process.env);

const logger = createLogger("info");
const prisma = createPrisma(env.DATABASE_URL);
try {
  const result = await seedDatabase(prisma, {
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
    bcryptCost: env.BCRYPT_COST,
  });
  logger.info(result, "Seed complete");
} finally {
  await prisma.$disconnect();
}
