import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <Card>
        <LoginForm
          callbackUrl={callbackUrl}
          notice={error ? "Your session has ended. Please sign in again." : undefined}
        />
      </Card>
    </div>
  );
}
