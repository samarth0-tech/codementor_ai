import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <Card>
        <RegisterForm />
      </Card>
    </div>
  );
}
