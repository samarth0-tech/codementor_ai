"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type FormState } from "../actions";

const initial: FormState = {};

export function LoginForm({ callbackUrl, notice }: { callbackUrl?: string; notice?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </Button>
      <p className="text-center text-sm text-slate-600 dark:text-slate-300">
        New here?{" "}
        <Link href="/register" className="font-medium text-indigo-600 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
