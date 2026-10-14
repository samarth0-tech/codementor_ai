import { describe, expect, it } from "vitest";
import { createDraftStore } from "./drafts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("draft store", () => {
  it("saves, reads and removes drafts under a namespaced key", () => {
    const storage = memoryStorage();
    const store = createDraftStore(storage);
    store.set("answer:1", "hello");
    expect(store.get("answer:1")).toBe("hello");
    expect([...storage.map.keys()]).toEqual(["cm:draft:answer:1"]);
    store.remove("answer:1");
    expect(store.get("answer:1")).toBeNull();
  });

  it("works (as a no-op) when storage is unavailable", () => {
    const store = createDraftStore(null);
    expect(() => store.set("k", "v")).not.toThrow();
    expect(store.get("k")).toBeNull();
    expect(() => store.remove("k")).not.toThrow();
  });

  it("swallows storage errors such as a full disk or blocked access", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createDraftStore(broken);
    expect(() => store.set("k", "v")).not.toThrow();
    expect(store.get("k")).toBeNull();
    expect(() => store.remove("k")).not.toThrow();
  });
});
