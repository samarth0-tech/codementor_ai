"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAction, type FormState } from "../actions";

const initial: FormState = {};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Input
        label="Name"
        name="name"
        autoComplete="name"
        required
        error={state.fieldErrors?.name}
      />
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
        autoComplete="new-password"
        required
        minLength={10}
        error={state.fieldErrors?.password}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">At least 10 characters.</p>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account..." : "Create account"}
      </Button>
      <p className="text-center text-sm text-slate-600 dark:text-slate-300">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
