import type { Language, Verdict } from "@codementor/shared";

/**
 * The only thing the submission pipeline knows about running code. Phase 8 plugs in a mock;
 * Phase 9 plugs in Judge0 by implementing this same interface.
 */
export interface ExecutionCase {
  testCaseId: string;
  input: string;
  expectedOutput: string;
}

export interface ExecutionRequest {
  language: Language;
  sourceCode: string;
  cases: ExecutionCase[];
  timeLimitMs: number;
  memoryLimitKb: number;
  /**
   * The problem's starter template for this language. Real executors ignore it; the mock uses it
   * to recognise "the student has not written anything yet".
   */
  starterCode?: string | null;
}

export interface CaseOutcome {
  testCaseId: string;
  verdict: Verdict;
  stdout: string | null;
  stderr: string | null;
  timeMs: number | null;
  memoryKb: number | null;
}

export interface ExecutionOutcome {
  /** Set when the code did not compile. Then `results` is empty. */
  compileOutput: string | null;
  results: CaseOutcome[];
}

export interface CodeExecutor {
  /** Stored on every submission so results can be traced to the engine that produced them. */
  readonly name: string;
  execute(request: ExecutionRequest): Promise<ExecutionOutcome>;
  /**
   * Languages this engine can really run right now, or null when that is unknown (e.g. the
   * service cannot be reached). Optional: executors that run everything may omit it.
   */
  supportedLanguages?(): Promise<Language[] | null>;
}

/** Why a run could not be completed ON OUR SIDE (as opposed to a wrong or crashing solution). */
export type ExecutionFailureKind =
  | "UNSUPPORTED_LANGUAGE"
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "AUTH"
  | "MALFORMED"
  | "TIMEOUT"
  | "BAD_REQUEST";

const USER_MESSAGES: Record<ExecutionFailureKind, string> = {
  UNSUPPORTED_LANGUAGE: "This language is not available on the code execution service right now.",
  UNAVAILABLE: "The code execution service is unavailable right now. Please try again in a moment.",
  RATE_LIMITED: "The code execution service is busy. Please try again in a moment.",
  TIMEOUT: "Running your code took too long on our side. Please try again.",
  // Configuration/protocol problems are ours to fix; the student only needs to know it is not them.
  AUTH: "Code execution is temporarily unavailable. This is not a problem with your code.",
  MALFORMED: "Code execution is temporarily unavailable. This is not a problem with your code.",
  BAD_REQUEST: "Code execution is temporarily unavailable. This is not a problem with your code.",
};

/**
 * Thrown by executors when the run could not be completed. `message` is for server logs only;
 * `userMessage` is the only text that may reach the student (it never contains URLs, tokens or
 * response bodies).
 */
export class ExecutionError extends Error {
  constructor(
    readonly kind: ExecutionFailureKind,
    internalMessage: string,
  ) {
    super(internalMessage);
    this.name = "ExecutionError";
  }

  get userMessage(): string {
    return USER_MESSAGES[this.kind];
  }
}
