import type { Metadata } from "next";
import Link from "next/link";
import type { InterviewDetail } from "@codementor/shared";
import { serverGet } from "@/lib/server/api";
import { InterviewRoom } from "./interview-room";

export const metadata: Metadata = { title: "Interview" };

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { interview } = await serverGet<{ interview: InterviewDetail }>(`/interviews/${id}`);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/interviews" className="text-sm text-indigo-600 hover:underline">
        &larr; All interviews
      </Link>
      <InterviewRoom initial={interview} />
    </div>
  );
}
