import bcrypt from "bcryptjs";
import type { PublicUser, RegisterInput, LoginInput } from "@codementor/shared";
import { AppError } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";

const publicUserSelect = { id: true, email: true, name: true, role: true } as const;

export class AuthService {
  // Used to burn the same CPU time when the email does not exist, so response timing
  // does not reveal which emails are registered.
  private readonly timingEqualizer: Promise<string>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly bcryptCost: number,
  ) {
    this.timingEqualizer = bcrypt.hash("timing-equalizer-not-a-real-password", bcryptCost);
  }

  async register(input: RegisterInput): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(input.password, this.bcryptCost);
    try {
      // Role is NOT taken from input: everyone who registers is a STUDENT.
      return await this.prisma.user.create({
        data: { email: input.email, name: input.name, passwordHash },
        select: publicUserSelect,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw AppError.conflict("An account with this email already exists", "EMAIL_TAKEN");
      }
      throw err;
    }
  }

  /** Returns the user if the credentials are right, or null. Never says WHICH part was wrong. */
  async verifyCredentials(input: LoginInput): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { ...publicUserSelect, passwordHash: true, status: true },
    });

    const hash = user?.passwordHash ?? (await this.timingEqualizer);
    const passwordOk = await bcrypt.compare(input.password, hash);
    if (!user || !user.passwordHash || !passwordOk) return null;

    // Only someone who knows the right password can learn the account is suspended.
    if (user.status !== "ACTIVE") {
      throw AppError.forbidden("This account is suspended", "ACCOUNT_SUSPENDED");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
