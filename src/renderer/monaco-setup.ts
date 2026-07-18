import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TypeScriptWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

type CenroMonacoEnvironment = {
  getWorker(workerId: string, label: string): Worker;
};

(self as typeof globalThis & { MonacoEnvironment?: CenroMonacoEnvironment }).MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TypeScriptWorker();
    return new EditorWorker();
  }
};

monaco.editor.defineTheme("cenro-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8b8b93" },
    { token: "keyword", foreground: "7b4ab0" },
    { token: "string", foreground: "18794e" },
    { token: "number", foreground: "b36414" },
    { token: "type.identifier", foreground: "1e6599" }
  ],
  colors: {
    "editor.background": "#ffffff",
    "editorGutter.background": "#ffffff",
    "editorLineNumber.foreground": "#a0a0a7",
    "editorLineNumber.activeForeground": "#5a5a62",
    "editor.selectionBackground": "#dce8ff",
    "editor.inactiveSelectionBackground": "#edf3ff",
    "editorCursor.foreground": "#3667cb",
    "editor.lineHighlightBackground": "#f8f9fb",
    "editorIndentGuide.background1": "#eeeeF2",
    "editorWidget.background": "#ffffff",
    "editorWidget.border": "#dfe1e8",
    "diffEditor.insertedLineBackground": "#e6f6ed",
    "diffEditor.removedLineBackground": "#fff0f1",
    "diffEditor.insertedTextBackground": "#cbeed9",
    "diffEditor.removedTextBackground": "#ffd9dd"
  }
});

monaco.editor.defineTheme("cenro-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "738090" },
    { token: "keyword", foreground: "b7a6ff" },
    { token: "string", foreground: "8ce0bd" },
    { token: "number", foreground: "f0bd7a" },
    { token: "type.identifier", foreground: "87b9ff" },
    { token: "delimiter", foreground: "b4bec9" }
  ],
  colors: {
    "editor.background": "#101317",
    "editorGutter.background": "#101317",
    "editorLineNumber.foreground": "#53606d",
    "editorLineNumber.activeForeground": "#a9b8c7",
    "editor.selectionBackground": "#264366",
    "editor.inactiveSelectionBackground": "#1b3049",
    "editorCursor.foreground": "#8ce0bd",
    "editor.lineHighlightBackground": "#151a20",
    "editorIndentGuide.background1": "#202831",
    "editorWidget.background": "#171c23",
    "editorWidget.border": "#2a3542",
    "diffEditor.insertedLineBackground": "#17382d80",
    "diffEditor.removedLineBackground": "#421f2980",
    "diffEditor.insertedTextBackground": "#24593e90",
    "diffEditor.removedTextBackground": "#6b2d3a90"
  }
});

loader.config({ monaco });
