import type { Language } from "@codementor/shared";
import type { PistonRuntime } from "./types.js";

export function getJavaFileName(code: string): string {
  const match = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
  return match && match[1] ? `${match[1]}.java` : "Main.java";
}

export interface PistonLanguageMapping {
  pistonLanguage: string;
  getFileName: (code: string) => string;
}

export const LANGUAGE_MAPPINGS: Record<Language, PistonLanguageMapping> = {
  PYTHON: {
    pistonLanguage: "python",
    getFileName: () => "main.py",
  },
  JAVASCRIPT: {
    pistonLanguage: "javascript",
    getFileName: () => "main.js",
  },
  JAVA: {
    pistonLanguage: "java",
    getFileName: (code) => getJavaFileName(code),
  },
  CPP: {
    pistonLanguage: "c++",
    getFileName: () => "main.cpp",
  },
  C: {
    pistonLanguage: "c",
    getFileName: () => "main.c",
  },
};

const RUNTIME_ALIASES: Record<Language, string[]> = {
  PYTHON: ["python", "python3", "py", "py3"],
  JAVASCRIPT: ["javascript", "node-javascript", "node", "js", "node-js"],
  JAVA: ["java"],
  CPP: ["c++", "cpp", "g++"],
  C: ["c", "gcc"],
};

export function getSupportedLanguages(runtimes: PistonRuntime[]): Language[] {
  const available = new Set<string>();
  for (const r of runtimes) {
    available.add(r.language.toLowerCase());
    if (r.runtime) available.add(r.runtime.toLowerCase());
    if (r.aliases) {
      for (const a of r.aliases) available.add(a.toLowerCase());
    }
  }

  const supported: Language[] = [];
  for (const [lang, aliases] of Object.entries(RUNTIME_ALIASES) as [Language, string[]][]) {
    if (aliases.some((a) => available.has(a.toLowerCase()))) {
      supported.push(lang);
    }
  }
  return supported;
}
