import { z } from "zod";

// What we send to / get back from Judge0, as plain data. All base64 handling lives in the HTTP
// client, so everything above it works with ordinary strings.

export interface Judge0Language {
  id: number;
  name: string;
}

export interface Judge0SubmissionInput {
  languageId: number;
  sourceCode: string;
  stdin: string;
  /** Seconds of CPU time. */
  cpuTimeLimit: number;
  /** Seconds of wall-clock time. */
  wallTimeLimit: number;
  /** Kilobytes. */
  memoryLimitKb: number;
}

export interface Judge0Result {
  token: string;
  statusId: number;
  statusDescription: string;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  message: string | null;
  timeMs: number | null;
  memoryKb: number | null;
}

/** The transport the executor depends on. Tests replace it with a scripted fake. */
export interface Judge0Client {
  getLanguages(): Promise<Judge0Language[]>;
  /** Creates one submission per input and returns their tokens, in the same order. */
  createBatch(inputs: Judge0SubmissionInput[]): Promise<string[]>;
  /** Returns the current state of each token, in the same order. */
  getBatch(tokens: string[]): Promise<Judge0Result[]>;
}

// ---- wire formats, validated with Zod: we never trust a remote service's JSON shape ----

export const languageListSchema = z.array(z.object({ id: z.number().int(), name: z.string() }));

export const batchResultSchema = z.object({
  submissions: z.array(
    z.object({
      token: z.string().min(1),
      status: z.object({ id: z.number().int(), description: z.string().optional() }),
      stdout: z.string().nullish(),
      stderr: z.string().nullish(),
      compile_output: z.string().nullish(),
      message: z.string().nullish(),
      time: z.union([z.string(), z.number()]).nullish(),
      memory: z.number().nullish(),
    }),
  ),
});
