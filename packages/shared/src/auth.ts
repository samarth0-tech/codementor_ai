import { z } from "zod";
import type { Role } from "./constants.js";

// bcrypt only uses the first 72 BYTES of a password, so we reject anything longer
// instead of silently truncating it.
const MAX_PASSWORD_BYTES = 72;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES, {
    message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
  });

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

// Login does not re-apply the password policy (old accounts must still be able to log in),
// but it caps the length so nobody can make us hash a giant string.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
