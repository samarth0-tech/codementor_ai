"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";
import { loginSchema, registerSchema } from "@codementor/shared";
import { signIn, signOut } from "@/auth";
import { ApiError } from "@/lib/api/errors";
import { backendJson } from "@/lib/server/backend";
import { clientIpFrom } from "@/lib/server/ip";
import { safeRedirectPath } from "@/lib/redirect";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

function signInErrorMessage(error: AuthError): string {
  const code = (error as { code?: string }).code;
  if (code === "suspended") return "This account is suspended. Please contact support.";
  if (code === "rate_limited") return "Too many attempts. Please wait a few minutes and try again.";
  if (error.type === "CredentialsSignin") return "Invalid email or password.";
  return "Sign-in is temporarily unavailable. Please try again.";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: safeRedirectPath(formData.get("callbackUrl")),
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: signInErrorMessage(error) };
    throw error; // Next.js uses a thrown "redirect" to navigate after a successful login
  }
  return {};
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await backendJson("/auth/register", {
      method: "POST",
      json: parsed.data,
      identity: { ip: clientIpFrom(await headers()) },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === "EMAIL_TAKEN") return { fieldErrors: { email: error.message } };
      if (error.code === "VALIDATION_FAILED")
        return { error: "Please check the form and try again." };
      if (error.status === 429) return { error: "Too many sign-ups from your network. Try later." };
    }
    return { error: "We could not create your account right now. Please try again." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Account created. Please sign in." };
    throw error;
  }
  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
