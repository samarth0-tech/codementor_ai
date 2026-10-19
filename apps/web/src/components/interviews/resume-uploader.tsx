"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResumeDetailDto, ResumeSummaryDto } from "@codementor/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { formatFileSize, formatResumeDate } from "@/lib/resume-ui";

interface ResumeUploaderProps {
  selectedResumeId?: string | null;
  onSelectResume: (resume: ResumeDetailDto | ResumeSummaryDto | null) => void;
}

export function ResumeUploader({ selectedResumeId, onSelectResume }: ResumeUploaderProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ resumes: ResumeSummaryDto[] }>({
    queryKey: ["resumes"],
    queryFn: () => apiFetch<{ resumes: ResumeSummaryDto[] }>("/resumes"),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("resume", file);
      return apiFetch<{ resume: ResumeDetailDto }>("/resumes/upload", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: (result) => {
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      onSelectResume(result.resume);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message || "Resume upload failed";
      setUploadError(msg);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File exceeds 5MB limit. Please upload a smaller PDF or DOCX file.");
      return;
    }

    setUploadError(null);
    upload.mutate(file);
  };

  const resumes = data?.resumes ?? [];

  return (
    <div className="space-y-4">
      {uploadError ? <Alert tone="error">{uploadError}</Alert> : null}

      <div className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-center dark:border-slate-700">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          id="resume-file-input"
          onChange={handleFileChange}
          disabled={upload.isPending}
        />
        <label
          htmlFor="resume-file-input"
          className="inline-block cursor-pointer font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
        >
          {upload.isPending
            ? "Uploading and extracting resume..."
            : "Click to upload resume (PDF or DOCX, max 5MB)"}
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Our AI extracts your skills, technologies, and projects to customize interview questions.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading your resumes...</p>
      ) : resumes.length > 0 ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Or select an existing resume:
          </label>
          <div className="grid gap-2">
            {resumes.map((resume) => {
              const isSelected = resume.id === selectedResumeId;
              return (
                <div
                  key={resume.id}
                  onClick={() => onSelectResume(isSelected ? null : resume)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20"
                      : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{resume.fileName}</p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(resume.fileSize)} • Uploaded{" "}
                      {formatResumeDate(resume.createdAt)}
                    </p>
                    {resume.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {resume.skills.slice(0, 5).map((s) => (
                          <span
                            key={s}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {s}
                          </span>
                        ))}
                        {resume.skills.length > 5 ? (
                          <span className="text-[11px] text-slate-500">
                            +{resume.skills.length - 5} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant={isSelected ? "primary" : "secondary"}
                    className="h-8 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectResume(isSelected ? null : resume);
                    }}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
