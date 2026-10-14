"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { OnMount } from "@monaco-editor/react";

// Monaco is large, so it is loaded only in the browser, only when this component renders.
// (By default it fetches its files from a CDN; keep that in mind if a strict CSP is added.)
const Monaco = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center text-sm text-slate-500">
      Loading editor...
    </div>
  ),
});

const query = "(prefers-color-scheme: dark)";
function subscribeToScheme(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Monaco's id for the language, e.g. "python", "cpp". */
  monacoLanguage: string;
  /** Called on Ctrl/Cmd + Enter. */
  onRun: () => void;
}

export function CodeEditor({ value, onChange, monacoLanguage, onRun }: CodeEditorProps) {
  const dark = useSyncExternalStore(
    subscribeToScheme,
    () => window.matchMedia(query).matches,
    () => false,
  );

  // Monaco registers the shortcut once, so it must call the LATEST onRun, not the first one.
  const runRef = useRef(onRun);
  useEffect(() => {
    runRef.current = onRun;
  });

  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
  };

  return (
    <Monaco
      height="460px"
      language={monacoLanguage}
      value={value}
      theme={dark ? "vs-dark" : "light"}
      onChange={(next) => onChange(next ?? "")}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        tabSize: 4,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 12 },
        ariaLabel: "Code editor",
      }}
    />
  );
}
