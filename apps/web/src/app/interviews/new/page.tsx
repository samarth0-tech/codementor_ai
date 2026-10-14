import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { RubricPanel } from "@/components/rubric-panel";
import { NewInterviewForm } from "./new-interview-form";

export const metadata: Metadata = { title: "New interview" };

export default function NewInterviewPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Start an AI interview</h1>
      <Card>
        <NewInterviewForm />
      </Card>
      <RubricPanel />
    </div>
  );
}
