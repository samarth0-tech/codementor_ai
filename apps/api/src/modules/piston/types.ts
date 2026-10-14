export interface PistonRuntime {
  language: string;
  version: string;
  aliases: string[];
  runtime?: string;
}

export interface PistonFile {
  name?: string;
  content: string;
  encoding?: string;
}

export interface PistonExecuteInput {
  language: string;
  version?: string;
  files: PistonFile[];
  stdin?: string;
  args?: string[];
  run_timeout?: number;
  compile_timeout?: number;
  run_memory_limit?: number;
  compile_memory_limit?: number;
}

export interface PistonStageResult {
  stdout: string;
  stderr: string;
  output: string;
  code: number | null;
  signal: string | null;
}

export interface PistonExecuteResult {
  language: string;
  version: string;
  run: PistonStageResult;
  compile?: PistonStageResult;
  message?: string;
}

export interface PistonClient {
  getRuntimes(): Promise<PistonRuntime[]>;
  execute(input: PistonExecuteInput): Promise<PistonExecuteResult>;
}
