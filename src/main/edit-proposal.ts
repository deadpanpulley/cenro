/**
 * Validation boundary for file replacements proposed by an untrusted model.
 *
 * This module deliberately parses a small, replacement-only schema. Applying a
 * validated proposal is still the caller's responsibility, including a final
 * canonical-path and symlink check at write time.
 */

export type EditProposal = {
  /** Slash-normalized, workspace-relative filename. */
  filename: string;
  /** Complete replacement text. An empty string is a valid replacement. */
  content: string;
  /** Short human-readable explanation of the replacement. */
  summary: string;
};

export type EditProposalParseSuccess = {
  ok: true;
  proposal: EditProposal;
};

export type EditProposalParseFailure = {
  ok: false;
  error: string;
};

export type EditProposalParseResult = EditProposalParseSuccess | EditProposalParseFailure;

/** Maximum UTF-8 payload accepted before JSON parsing. */
export const MAX_EDIT_PROPOSAL_BYTES = 1_000_000;
/** Maximum UTF-8 size of an individual replacement. */
export const MAX_EDIT_CONTENT_BYTES = 750_000;
export const MAX_EDIT_FILENAME_LENGTH = 500;
export const MAX_EDIT_SUMMARY_LENGTH = 1_500;

type JsonRecord = Record<string, unknown>;

const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".java", ".go", ".rs", ".cs", ".cpp", ".c", ".h", ".hpp",
  ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".json", ".jsonc", ".json5", ".md", ".mdx", ".txt", ".rst", ".adoc",
  ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".properties",
  ".xml", ".svg", ".sql", ".sh", ".ps1", ".bat", ".cmd", ".csv", ".tsv",
  ".vue", ".svelte", ".astro", ".php", ".rb", ".swift", ".kt", ".kts",
  ".scala", ".dart", ".lua", ".r", ".pl", ".pm", ".ex", ".exs", ".erl",
  ".hrl", ".fs", ".fsx", ".vb", ".clj", ".cljs", ".groovy", ".gradle",
  ".graphql", ".gql", ".proto", ".prisma", ".tf", ".hcl", ".sol"
]);

const textBasenames = new Set([
  "dockerfile", "makefile", "cmakelists.txt", "readme", "license", "copying",
  ".gitignore", ".gitattributes", ".editorconfig", ".npmignore", ".prettierignore",
  ".prettierrc", ".eslintrc", ".babelrc"
]);

const binaryExtensions = new Set([
  ".7z", ".a", ".avi", ".bin", ".bmp", ".bz2", ".class", ".db", ".dll", ".dmg",
  ".eot", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".lib", ".mp3",
  ".mp4", ".msi", ".node", ".otf", ".pdf", ".png", ".pyc", ".pyo", ".rar", ".so",
  ".sqlite", ".sqlite3", ".tar", ".tif", ".tiff", ".ttf", ".war", ".wasm", ".wav",
  ".webm", ".webp", ".woff", ".woff2", ".xz", ".zip"
]);

const secretExtensions = new Set([".cer", ".crt", ".key", ".kdbx", ".p12", ".pfx", ".pem"]);
const protectedDirectories = new Set([".aws", ".gnupg", ".ssh"]);
const reservedWindowsNames = new Set([
  "con", "prn", "aux", "nul", "clock$",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
]);

const secretNamePattern = /(^|[._-])(?:env|secret|secrets|credential|credentials|password|passwd|private|id_rsa|id_ed25519|keystore|vault)(?:[._-]|$)/i;
const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const unsafeFilenameCharacterPattern = /[:*?"<>|]/;

/**
 * Parse a local model's replacement proposal without ever trusting its target
 * path. `workspaceFiles`, when supplied, is an allow-list of existing relative
 * text files; proposals outside it are rejected.
 *
 * Canonical input uses `{ filename, content, summary }`. A few explicit aliases
 * are accepted so a model can use common labels without weakening validation:
 * `path`/`file`, `replacement`/`replacementContent`, and `description`.
 */
export function parseEditProposal(raw: unknown, workspaceFiles?: readonly string[]): EditProposalParseResult {
  try {
    const candidate = parseJsonObject(raw);
    const filename = normalizeFilename(readAliasedString(candidate, ["filename", "path", "file", "relativePath"], "filename"));
    const content = normalizeContent(readAliasedString(candidate, ["content", "replacement", "replacementContent", "newContent"], "replacement content", true));
    const summary = normalizeSummary(readAliasedString(candidate, ["summary", "description", "reason"], "summary"));
    assertAllowedFilename(filename, workspaceFiles);

    return { ok: true, proposal: { filename, content, summary } };
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : "The edit proposal is invalid." };
  }
}

function parseJsonObject(raw: unknown): JsonRecord {
  if (typeof raw === "string") {
    if (byteLength(raw) > MAX_EDIT_PROPOSAL_BYTES) {
      throw new RangeError(`The edit proposal exceeds the ${formatBytes(MAX_EDIT_PROPOSAL_BYTES)} input limit.`);
    }

    const json = extractFencedJson(raw);
    if (!json) throw new TypeError("The edit proposal must contain a JSON object.");
    try {
      return requireRecord(JSON.parse(json) as unknown, "The edit proposal must be a JSON object.");
    } catch (reason) {
      if (reason instanceof ProposalError) throw reason;
      throw new TypeError("The edit proposal is not valid JSON.");
    }
  }

  return requireRecord(raw, "The edit proposal must be a JSON object.");
}

function extractFencedJson(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  // Permit a single Markdown JSON fence, including a short prose introduction.
  const fences = [...value.matchAll(/```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)```/gi)];
  if (fences.length === 1) {
    const fenced = fences[0][1].trim();
    if (fenced) return fenced;
  }
  return value;
}

function readAliasedString(record: JsonRecord, aliases: readonly string[], label: string, allowEmpty = false): string {
  const present = aliases.filter((alias) => Object.prototype.hasOwnProperty.call(record, alias));
  if (present.length === 0) throw new ProposalError(`The edit proposal ${label} is required.`);

  const values = present.map((alias) => record[alias]);
  if (values.some((value) => typeof value !== "string")) {
    throw new ProposalError(`The edit proposal ${label} must be a string.`);
  }

  const strings = values as string[];
  if (new Set(strings).size > 1) {
    throw new ProposalError(`The edit proposal has conflicting ${label} fields.`);
  }
  if (!allowEmpty && strings[0].trim().length === 0) {
    throw new ProposalError(`The edit proposal ${label} cannot be empty.`);
  }
  return strings[0];
}

function normalizeFilename(value: string): string {
  const filename = value.trim().replace(/\\/g, "/");
  if (!filename) throw new ProposalError("The edit proposal filename cannot be empty.");
  if (filename.length > MAX_EDIT_FILENAME_LENGTH || byteLength(filename) > MAX_EDIT_FILENAME_LENGTH * 4) {
    throw new RangeError(`The edit proposal filename must be at most ${MAX_EDIT_FILENAME_LENGTH} characters.`);
  }
  if (unsafeControlPattern.test(filename) || unsafeFilenameCharacterPattern.test(filename)) {
    throw new ProposalError("The edit proposal filename contains unsupported characters.");
  }
  if (filename.startsWith("/") || /^[a-z]:/i.test(filename) || /^[a-z][a-z0-9+.-]*:/i.test(filename)) {
    throw new ProposalError("The edit proposal filename must be a relative workspace path.");
  }

  const segments = filename.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new ProposalError("The edit proposal filename cannot contain path traversal segments.");
  }
  if (segments.some((segment) => segment.endsWith(".") || segment.endsWith(" "))) {
    throw new ProposalError("The edit proposal filename cannot end a segment with a dot or space.");
  }
  if (segments.some((segment) => protectedDirectories.has(segment.toLowerCase()))) {
    throw new ProposalError("The edit proposal cannot target protected credential directories.");
  }

  const basename = segments[segments.length - 1];
  const loweredBasename = basename.toLowerCase();
  const extension = extensionOf(loweredBasename);
  const bareWindowsName = loweredBasename.split(".", 1)[0];
  if (reservedWindowsNames.has(bareWindowsName)) {
    throw new ProposalError("The edit proposal filename is a reserved Windows device name.");
  }
  if (segments.some((segment) => secretNamePattern.test(segment)) || secretExtensions.has(extension)) {
    throw new ProposalError("The edit proposal cannot target files or folders that look like secrets.");
  }
  if (binaryExtensions.has(extension)) {
    throw new ProposalError("The edit proposal cannot target a binary file.");
  }
  if (!textExtensions.has(extension) && !textBasenames.has(loweredBasename)) {
    throw new ProposalError("The edit proposal filename must target a supported text file.");
  }

  return segments.join("/");
}

function normalizeContent(value: string): string {
  if (unsafeControlPattern.test(value)) {
    throw new ProposalError("The edit proposal replacement content contains unsupported control characters.");
  }
  if (byteLength(value) > MAX_EDIT_CONTENT_BYTES) {
    throw new RangeError(`The edit proposal replacement content exceeds the ${formatBytes(MAX_EDIT_CONTENT_BYTES)} limit.`);
  }
  return value;
}

function normalizeSummary(value: string): string {
  if (unsafeControlPattern.test(value)) {
    throw new ProposalError("The edit proposal summary contains unsupported control characters.");
  }
  const summary = value.replace(/\s+/g, " ").trim();
  if (!summary) throw new ProposalError("The edit proposal summary cannot be empty.");
  if (summary.length > MAX_EDIT_SUMMARY_LENGTH || byteLength(summary) > MAX_EDIT_SUMMARY_LENGTH * 4) {
    throw new RangeError(`The edit proposal summary must be at most ${MAX_EDIT_SUMMARY_LENGTH} characters.`);
  }
  return summary;
}

function assertAllowedFilename(filename: string, workspaceFiles: readonly string[] | undefined): void {
  if (workspaceFiles === undefined) return;
  if (!Array.isArray(workspaceFiles)) {
    throw new TypeError("The workspace file allow-list must be an array of relative filenames.");
  }
  if (workspaceFiles.length > 20_000) {
    throw new RangeError("The workspace file allow-list is too large.");
  }

  const exact = new Set<string>();
  const insensitive = new Set<string>();
  for (const item of workspaceFiles) {
    if (typeof item !== "string") continue;
    try {
      const normalized = normalizeFilename(item);
      exact.add(normalized);
      insensitive.add(normalized.toLowerCase());
    } catch {
      // A malformed caller-provided entry must never make a target permissible.
    }
  }

  if (!exact.has(filename) && !insensitive.has(filename.toLowerCase())) {
    throw new ProposalError("The edit proposal filename is not in the permitted workspace file list.");
  }
}

function extensionOf(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(lastDot) : "";
}

function requireRecord(value: unknown, message: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ProposalError(message);
  return value as JsonRecord;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1_000)} KB`;
}

class ProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalError";
  }
}
