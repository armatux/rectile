"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";

function langExt(language: string): Extension {
  switch (language) {
    case "cpp":
    case "c":
      return cpp();
    case "python":
      return python();
    case "rust":
      return rust();
    default:
      return StreamLanguage.define(shell);
  }
}

const hudTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#131318",
      color: "#d8d8e2",
      fontSize: "13px",
      border: "1px solid rgb(255 255 255 / 0.08)",
      borderRadius: "12px",
    },
    "&.cm-focused": { outline: "none", borderColor: "rgb(10 132 255 / 0.5)" },
    ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "#0a84ff" },
    ".cm-cursor": { borderLeftColor: "#0a84ff" },
    ".cm-gutters": {
      backgroundColor: "rgb(255 255 255 / 0.03)",
      color: "rgb(235 235 245 / 0.3)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgb(255 255 255 / 0.04)" },
    ".cm-activeLineGutter": { backgroundColor: "rgb(255 255 255 / 0.06)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgb(10 132 255 / 0.28)",
    },
  },
  { dark: true },
);

export function CodeEditor({
  initial,
  language,
  docRef,
}: {
  initial: string;
  language: string;
  /** live document text, readable by the parent at any time */
  docRef: React.MutableRefObject<string>;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    docRef.current = initial;
    const view = new EditorView({
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          langExt(language),
          hudTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) docRef.current = u.state.doc.toString();
          }),
        ],
      }),
      parent: host.current,
    });
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, language]);

  return <div ref={host} className="max-h-[60vh] overflow-auto rounded-xl" />;
}
