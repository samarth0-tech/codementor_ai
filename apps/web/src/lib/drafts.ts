// Saves unfinished work (an interview answer, code in the editor) in the browser so a refresh or
// a closed tab does not lose it. Storage can be missing (private mode, SSR) or full, so every
// call is wrapped: drafts are a convenience and must never crash the page.

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface DraftStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const PREFIX = "cm:draft:";

export function createDraftStore(storage: StorageLike | null): DraftStore {
  return {
    get(key) {
      try {
        return storage?.getItem(PREFIX + key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage?.setItem(PREFIX + key, value);
      } catch {
        // storage full or blocked: ignore
      }
    },
    remove(key) {
      try {
        storage?.removeItem(PREFIX + key);
      } catch {
        // ignore
      }
    },
  };
}

/** The real browser store (null on the server). */
export const drafts: DraftStore = createDraftStore(
  typeof window === "undefined" ? null : window.localStorage,
);
