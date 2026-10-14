import type { Language } from "@codementor/shared";
import { ExecutionError } from "../submissions/executor.js";
import type { Logger } from "../../lib/logger.js";
import type { Judge0Client, Judge0Language } from "./types.js";

// Judge0 language ids are NOT universal: they differ between versions and instances
// ("Python (3.8.1)" is 71 on one server and something else on another). So we never trust the ids
// stored in our own database blindly: we ask the instance for its language list, check that the
// stored id really is the right kind of language, and otherwise pick the newest matching one.

interface Family {
  language: Language;
  /** In order of preference. */
  patterns: RegExp[];
  exclude?: RegExp;
}

const FAMILIES: Family[] = [
  { language: "C", patterns: [/^C \(GCC/i, /^C \(Clang/i] },
  { language: "CPP", patterns: [/^C\+\+ \(GCC/i, /^C\+\+ \(Clang/i] },
  // Judge0 calls it "Java (OpenJDK 13.0.1)" or "Java (JDK 17.0.6)"; skip the JavaFX variant.
  { language: "JAVA", patterns: [/^Java \((Open)?JDK/i], exclude: /\bFX\b/i },
  { language: "PYTHON", patterns: [/^Python \(3\./i] },
  { language: "JAVASCRIPT", patterns: [/^JavaScript \(Node\.js/i] },
];

export const SUPPORTED_FAMILIES: Language[] = FAMILIES.map((f) => f.language);

/** "C (GCC 9.2.0)" -> [9,2,0]; "Python (3.11.2)" -> [3,11,2]. */
export function parseVersion(name: string): number[] {
  const inside = name.slice(name.indexOf("(") + 1);
  const match = /\d+(?:\.\d+)*/.exec(inside);
  return match ? match[0].split(".").map(Number) : [];
}

export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface LanguageResolution {
  language: Language;
  /** The id to send to this Judge0 instance, or null when it cannot run this language. */
  judge0Id: number | null;
  judge0Name: string | null;
  /** The id currently stored in our LanguageConfig table (if any). */
  configuredId: number | null;
  source: "configured" | "auto-detected" | "unsupported";
  note: string;
}

export function resolveLanguages(
  instance: Judge0Language[],
  configured: Partial<Record<Language, number>>,
): LanguageResolution[] {
  return FAMILIES.map((family): LanguageResolution => {
    const configuredId = configured[family.language] ?? null;
    const matches = (name: string) =>
      !family.exclude?.test(name) && family.patterns.some((p) => p.test(name));
    const candidates = instance.filter((l) => matches(l.name));

    const stored = configuredId === null ? undefined : instance.find((l) => l.id === configuredId);
    if (stored && matches(stored.name)) {
      return {
        language: family.language,
        judge0Id: stored.id,
        judge0Name: stored.name,
        configuredId,
        source: "configured",
        note: "stored id is valid on this instance",
      };
    }

    for (const pattern of family.patterns) {
      const best = candidates
        .filter((l) => pattern.test(l.name))
        .sort((a, b) => compareVersions(parseVersion(b.name), parseVersion(a.name)))[0];
      if (best) {
        const why =
          configuredId === null
            ? "no id stored"
            : stored
              ? `stored id ${configuredId} is "${stored.name}", not ${family.language}`
              : `stored id ${configuredId} does not exist on this instance`;
        return {
          language: family.language,
          judge0Id: best.id,
          judge0Name: best.name,
          configuredId,
          source: "auto-detected",
          note: `${why}; using the newest match`,
        };
      }
    }
    return {
      language: family.language,
      judge0Id: null,
      judge0Name: null,
      configuredId,
      source: "unsupported",
      note: "this instance has no matching language",
    };
  });
}

interface DirectoryOptions {
  client: Judge0Client;
  /** Reads the ids stored in our database (LanguageConfig). */
  configured: () => Promise<Partial<Record<Language, number>>>;
  logger?: Logger;
  ttlMs?: number;
  now?: () => number;
}

/** Resolves our five languages against the live instance, caching the answer for a while. */
export class Judge0LanguageDirectory {
  private cache: { at: number; resolutions: LanguageResolution[] } | null = null;
  private loading: Promise<LanguageResolution[]> | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(private readonly options: DirectoryOptions) {
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.now = options.now ?? Date.now;
  }

  invalidate(): void {
    this.cache = null;
  }

  async resolutions(): Promise<LanguageResolution[]> {
    if (this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.resolutions;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async idFor(language: Language): Promise<number> {
    const found = (await this.resolutions()).find((r) => r.language === language);
    if (!found || found.judge0Id === null) {
      throw new ExecutionError("UNSUPPORTED_LANGUAGE", `No Judge0 language for ${language}`);
    }
    return found.judge0Id;
  }

  async supported(): Promise<Language[]> {
    return (await this.resolutions()).filter((r) => r.judge0Id !== null).map((r) => r.language);
  }

  private async load(): Promise<LanguageResolution[]> {
    try {
      const [instance, configured] = await Promise.all([
        this.options.client.getLanguages(),
        this.options.configured(),
      ]);
      const resolutions = resolveLanguages(instance, configured);
      for (const r of resolutions) {
        if (r.source !== "configured") {
          this.options.logger?.warn(
            { language: r.language, judge0Id: r.judge0Id, source: r.source },
            `Judge0 language check: ${r.note}`,
          );
        }
      }
      this.cache = { at: this.now(), resolutions };
      return resolutions;
    } catch (err) {
      // Keep working with the last known answer if the service blips.
      if (this.cache) {
        this.options.logger?.warn(
          { err },
          "Judge0 language refresh failed; using the previous list",
        );
        return this.cache.resolutions;
      }
      throw err;
    }
  }
}
