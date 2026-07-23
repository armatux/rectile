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
      backgroundColor: "rgb(7 4 13 / 0.7)",
      color: "#d9d2ec",
      fontSize: "12.5px",
      border: "1px solid rgb(179 156 245 / 0.18)",
    },
    "&.cm-focused": { outline: "none", borderColor: "rgb(179 156 245 / 0.45)" },
    ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "#b39cf5" },
    ".cm-cursor": { borderLeftColor: "#b39cf5" },
    ".cm-gutters": {
      backgroundColor: "rgb(18 10 34 / 0.6)",
      color: "rgb(217 210 236 / 0.3)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgb(179 156 245 / 0.06)" },
    ".cm-activeLineGutter": { backgroundColor: "rgb(179 156 245 / 0.1)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgb(179 156 245 / 0.25)",
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

  return <div ref={host} className="max-h-[60vh] overflow-auto" />;
}
