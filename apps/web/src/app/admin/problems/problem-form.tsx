"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LANGUAGES,
  type AdminCreateProblemInput,
  type AdminProblemDetail,
  type Difficulty,
  type Language,
  type ProblemStatus,
} from "@codementor/shared";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { api } from "@/lib/api/client";

interface Props {
  initialProblem?: AdminProblemDetail;
}

export function ProblemForm({ initialProblem }: Props) {
  const router = useRouter();
  const isEditing = Boolean(initialProblem);

  const [title, setTitle] = useState(initialProblem?.title ?? "");
  const [slug, setSlug] = useState(initialProblem?.slug ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(initialProblem?.difficulty ?? "MEDIUM");
  const [status, setStatus] = useState<ProblemStatus>(initialProblem?.status ?? "DRAFT");
  const [timeLimitMs, setTimeLimitMs] = useState(initialProblem?.timeLimitMs ?? 2000);
  const [memoryLimitKb, setMemoryLimitKb] = useState(initialProblem?.memoryLimitKb ?? 256000);
  const [topicInput, setTopicInput] = useState(
    initialProblem?.topics.map((t) => t.slug).join(", ") ?? "",
  );

  const [description, setDescription] = useState(initialProblem?.description ?? "");
  const [inputFormat, setInputFormat] = useState(initialProblem?.inputFormat ?? "");
  const [outputFormat, setOutputFormat] = useState(initialProblem?.outputFormat ?? "");
  const [constraints, setConstraints] = useState(initialProblem?.constraints ?? "");

  // Starter Code
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("PYTHON");
  const [starterCode, setStarterCode] = useState<Partial<Record<Language, string>>>(
    initialProblem?.starterCode ?? {
      PYTHON: "def solution():\n    # write your solution here\n    pass\n",
      JAVASCRIPT: "function solution() {\n    // write your solution here\n}\n",
      JAVA: "class Solution {\n    public static void main(String[] args) {\n        // write your solution here\n    }\n}\n",
      CPP: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // write your solution here\n    return 0;\n}\n",
      C: "#include <stdio.h>\n\nint main() {\n    // write your solution here\n    return 0;\n}\n",
    },
  );

  // Test Cases
  const [testCases, setTestCases] = useState<
    Array<{
      id?: string;
      input: string;
      expectedOutput: string;
      isSample: boolean;
      explanation?: string | null;
      weight: number;
    }>
  >(
    initialProblem?.testCases ?? [
      {
        input: "1 2",
        expectedOutput: "3",
        isSample: true,
        explanation: "1 + 2 = 3",
        weight: 1,
      },
    ],
  );

  const [newTcInput, setNewTcInput] = useState("");
  const [newTcExpected, setNewTcExpected] = useState("");
  const [newTcIsSample, setNewTcIsSample] = useState(false);
  const [newTcExplanation, setNewTcExplanation] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleAddTestCase() {
    if (!newTcInput.trim() && !newTcExpected.trim()) return;
    setTestCases((prev) => [
      ...prev,
      {
        input: newTcInput,
        expectedOutput: newTcExpected,
        isSample: newTcIsSample,
        explanation: newTcExplanation.trim() || null,
        weight: 1,
      },
    ]);
    setNewTcInput("");
    setNewTcExpected("");
    setNewTcIsSample(false);
    setNewTcExplanation("");
  }

  function handleRemoveTestCase(index: number) {
    setTestCases((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    const topicSlugs = topicInput
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const payload: AdminCreateProblemInput = {
      title,
      slug: slug.trim() || undefined,
      description,
      inputFormat,
      outputFormat,
      constraints,
      difficulty,
      status,
      timeLimitMs,
      memoryLimitKb,
      topicSlugs,
      starterCode,
      testCases: testCases.map((tc, idx) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isSample: tc.isSample,
        explanation: tc.explanation,
        orderIndex: idx,
        weight: tc.weight,
      })),
    };

    try {
      if (isEditing && initialProblem) {
        await api.put(`/admin/problems/${initialProblem.id}`, payload);
      } else {
        await api.post("/admin/problems", payload);
      }
      router.push("/admin/problems");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save problem";
      setErrorMsg(msg);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {errorMsg && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-xs sm:text-sm text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* 1. General Metadata */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
          Problem Overview
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label
              htmlFor="title"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Problem Title *
            </label>
            <input
              id="title"
              type="text"
              required
              placeholder="e.g. Merge Intervals"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="slug"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Custom Slug (optional, auto-derived if empty)
            </label>
            <input
              id="slug"
              type="text"
              placeholder="e.g. merge-intervals"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="difficulty"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Difficulty *
            </label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="status"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Publication Status *
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProblemStatus)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="DRAFT">Draft (hidden from catalog)</option>
              <option value="PUBLISHED">Published (active in catalog)</option>
              <option value="ARCHIVED">Archived (retired)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="topics"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Topic Tags (comma-separated)
            </label>
            <input
              id="topics"
              type="text"
              placeholder="arrays, two-pointers, sorting"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="timelimit"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Time Limit (ms)
            </label>
            <input
              id="timelimit"
              type="number"
              min={100}
              max={10000}
              value={timeLimitMs}
              onChange={(e) => setTimeLimitMs(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="memlimit"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Memory Limit (KB)
            </label>
            <input
              id="memlimit"
              type="number"
              min={16000}
              max={512000}
              value={memoryLimitKb}
              onChange={(e) => setMemoryLimitKb(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </Card>

      {/* 2. Problem Statement Markdown */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
          Problem Description & Constraints
        </h2>

        <div className="space-y-1">
          <label
            htmlFor="description"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Description (Markdown) *
          </label>
          <textarea
            id="description"
            required
            rows={6}
            placeholder="Explain the problem statement, example scenarios, and goals..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs sm:text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="inputFormat"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Input Format
            </label>
            <textarea
              id="inputFormat"
              rows={3}
              placeholder="e.g. First line contains an integer n..."
              value={inputFormat}
              onChange={(e) => setInputFormat(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="outputFormat"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Output Format
            </label>
            <textarea
              id="outputFormat"
              rows={3}
              placeholder="e.g. Print a single integer representing..."
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="constraints"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Constraints
          </label>
          <textarea
            id="constraints"
            rows={2}
            placeholder="e.g. 1 <= n <= 10^5, -10^9 <= nums[i] <= 10^9"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-mono text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </Card>

      {/* 3. Starter Code Configuration */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Starter Code Templates
          </h2>
          <div className="flex gap-1.5">
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setSelectedLanguage(lang)}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                  selectedLanguage === lang
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="starterCodeEditor"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Boilerplate for {selectedLanguage}
          </label>
          <textarea
            id="starterCodeEditor"
            rows={8}
            value={starterCode[selectedLanguage] ?? ""}
            onChange={(e) =>
              setStarterCode((prev) => ({
                ...prev,
                [selectedLanguage]: e.target.value,
              }))
            }
            className="w-full rounded-lg border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-emerald-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700"
          />
        </div>
      </Card>

      {/* 4. Test Cases Manager */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Test Suite ({testCases.length})
            </h2>
            <p className="text-xs text-slate-500">
              Sample test cases are visible to students; hidden test cases are used for final
              judging.
            </p>
          </div>
        </div>

        {/* Existing test cases list */}
        <div className="space-y-3">
          {testCases.map((tc, idx) => (
            <div
              key={tc.id ?? idx}
              className="flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    Case #{idx + 1}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      tc.isSample
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                    }`}
                  >
                    {tc.isSample ? "Sample" : "Hidden"}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 pt-1 font-mono">
                  <div className="rounded bg-white p-2 border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                    <span className="text-[10px] uppercase text-slate-400 block font-sans">
                      Input:
                    </span>
                    <pre className="whitespace-pre-wrap">{tc.input || "<empty>"}</pre>
                  </div>
                  <div className="rounded bg-white p-2 border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                    <span className="text-[10px] uppercase text-slate-400 block font-sans">
                      Expected Output:
                    </span>
                    <pre className="whitespace-pre-wrap">{tc.expectedOutput || "<empty>"}</pre>
                  </div>
                </div>
                {tc.explanation && (
                  <p className="text-[11px] text-slate-500 italic pt-1">Note: {tc.explanation}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleRemoveTestCase(idx)}
                className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 h-auto p-1 ml-2"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>

        {/* Add new test case form */}
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900/30">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            + Add Test Case
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="newTcInput"
                className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400"
              >
                Input
              </label>
              <textarea
                id="newTcInput"
                rows={2}
                placeholder="Standard input string..."
                value={newTcInput}
                onChange={(e) => setNewTcInput(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="newTcExpected"
                className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400"
              >
                Expected Output
              </label>
              <textarea
                id="newTcExpected"
                rows={2}
                placeholder="Exact expected standard output..."
                value={newTcExpected}
                onChange={(e) => setNewTcExpected(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <label
                htmlFor="newTcIsSample"
                className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <input
                  id="newTcIsSample"
                  type="checkbox"
                  checked={newTcIsSample}
                  onChange={(e) => setNewTcIsSample(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                Is Sample (visible in problem description)
              </label>
              <input
                type="text"
                aria-label="Sample explanation"
                placeholder="Explanation (for sample cases)..."
                value={newTcExplanation}
                onChange={(e) => setNewTcExplanation(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleAddTestCase}
              className="text-xs py-1 px-3 self-end sm:self-auto"
            >
              Add Case
            </Button>
          </div>
        </div>
      </Card>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <ButtonLink href="/admin/problems" variant="secondary" className="text-xs sm:text-sm">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={saving} className="text-xs sm:text-sm">
          {saving ? "Saving..." : isEditing ? "Update Problem" : "Create & Save Problem"}
        </Button>
      </div>
    </form>
  );
}
