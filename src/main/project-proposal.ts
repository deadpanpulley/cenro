/**
 * Validation boundary for multi-file projects proposed by an untrusted local
 * model. Parsing a proposal never reads or writes the workspace; callers must
 * still perform canonical-path and symlink checks immediately before applying
 * any accepted file.
 */

/** An optional intent label. The caller decides whether a target exists. */
export type ProjectProposalFileAction = "create" | "update";

export type ProjectProposalFile = {
  /** Slash-normalized, workspace-relative text-file path. */
  path: string;
  /** Complete UTF-8 text for the file. An empty file is permitted. */
  content: string;
  /** Short explanation of this file's role or change. */
  summary: string;
  /** Model-supplied intent only; it is not checked against the filesystem. */
  action?: ProjectProposalFileAction;
};

export type ProjectProposal = {
  /** Short explanation of the proposed project or set of changes. */
  summary: string;
  files: ProjectProposalFile[];
};

export type ProjectProposalParseSuccess = {
  ok: true;
  proposal: ProjectProposal;
};

export type ProjectProposalParseFailure = {
  ok: false;
  error: string;
};

export type ProjectProposalParseResult = ProjectProposalParseSuccess | ProjectProposalParseFailure;

/** At most this many files can be proposed in one operation. */
export const MAX_PROJECT_PROPOSAL_FILES = 30;
/** Sum of all proposed file content, measured as UTF-8 bytes. */
export const MAX_PROJECT_PROPOSAL_CONTENT_BYTES = 1_000_000;
/** A generous input guard before JSON parsing; content remains capped above. */
export const MAX_PROJECT_PROPOSAL_INPUT_BYTES = 8_000_000;
export const MAX_PROJECT_PROPOSAL_PATH_LENGTH = 500;
export const MAX_PROJECT_PROPOSAL_SUMMARY_LENGTH = 1_500;

type JsonRecord = Record<string, unknown>;

const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  ".py", ".java", ".go", ".rs", ".cs", ".cpp", ".c", ".h", ".hpp",
  ".html", ".htm", ".css", ".scss", ".sass", ".less", ".pcss",
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
  ".prettierrc", ".eslintrc", ".babelrc", ".stylelintrc", ".nvmrc"
]);

const binaryExtensions = new Set([
  ".7z", ".a", ".avi", ".bin", ".bmp", ".bz2", ".class", ".db", ".dll", ".dmg",
  ".eot", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".lib", ".mp3",
  ".mp4", ".msi", ".node", ".otf", ".pdf", ".png", ".pyc", ".pyo", ".rar", ".so",
  ".sqlite", ".sqlite3", ".tar", ".tif", ".tiff", ".ttf", ".war", ".wasm", ".wav",
  ".webm", ".webp", ".woff", ".woff2", ".xz", ".zip"
]);

const secretExtensions = new Set([".cer", ".crt", ".key", ".kdbx", ".p12", ".pfx", ".pem"]);
const protectedDirectories = new Set([".aws", ".git", ".gnupg", ".ssh"]);
const reservedWindowsNames = new Set([
  "con", "prn", "aux", "nul", "clock$",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
]);

const secretNamePattern = /(^|[._-])(?:env|secret|secrets|credential|credentials|password|passwd|private|id_rsa|id_ed25519|keystore|vault)(?:[._-]|$)/i;
const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const unsafeFilenameCharacterPattern = /[:*?"<>|]/;

/**
 * Parses a local model response with this exact shape:
 * `{ summary, files: [{ path, content, summary, action? }] }`.
 *
 * A raw object or a JSON string is accepted. Strings may contain one Markdown
 * JSON fence (with optional surrounding prose). Existing paths are deliberately
 * allowed: this module has no filesystem access and does not infer action.
 */
export function parseProjectProposal(raw: unknown): ProjectProposalParseResult {
  try {
    const candidate = parseJsonObject(raw);
    const summary = typeof candidate.summary === "string"
      ? normalizeSummary(candidate.summary, "project proposal summary")
      : "Local project proposal";
    if (!Object.prototype.hasOwnProperty.call(candidate, "files")) {
      throw new ProposalError("The project proposal files field is required.");
    }
    const filesValue = candidate.files;
    if (!Array.isArray(filesValue)) throw new ProposalError("The project proposal files field must be an array.");
    if (filesValue.length === 0) throw new ProposalError("The project proposal must include at least one file.");
    if (filesValue.length > MAX_PROJECT_PROPOSAL_FILES) {
      throw new RangeError(`The project proposal can include at most ${MAX_PROJECT_PROPOSAL_FILES} files.`);
    }

    const paths = new Set<string>();
    const caseInsensitivePaths = new Set<string>();
    let totalContentBytes = 0;
    const files = filesValue.map((value, index) => {
      const file = requireRecord(value, `Project proposal file ${index + 1} must be an object.`);
      const path = normalizePath(readRequiredString(file, "path", `project proposal file ${index + 1} path`));
      const content = normalizeContent(readRequiredString(file, "content", `project proposal file ${index + 1} content`));
      const fileSummary = typeof file.summary === "string"
        ? normalizeSummary(file.summary, `project proposal file ${index + 1} summary`)
        : `Proposed ${path}`;
      const action = normalizeAction(file.action, index + 1);

      const lowerPath = path.toLowerCase();
      if (paths.has(path) || caseInsensitivePaths.has(lowerPath)) {
        throw new ProposalError(`The project proposal contains duplicate file path: ${path}.`);
      }
      paths.add(path);
      caseInsensitivePaths.add(lowerPath);

      totalContentBytes += byteLength(content);
      if (totalContentBytes > MAX_PROJECT_PROPOSAL_CONTENT_BYTES) {
        throw new RangeError(`The combined project file content exceeds the ${formatBytes(MAX_PROJECT_PROPOSAL_CONTENT_BYTES)} limit.`);
      }

      return action === undefined ? { path, content, summary: fileSummary } : { path, content, summary: fileSummary, action };
    });

    return { ok: true, proposal: { summary, files } };
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : "The project proposal is invalid." };
  }
}

function parseJsonObject(raw: unknown): JsonRecord {
  if (typeof raw === "string") {
    if (byteLength(raw) > MAX_PROJECT_PROPOSAL_INPUT_BYTES) {
      throw new RangeError(`The project proposal exceeds the ${formatBytes(MAX_PROJECT_PROPOSAL_INPUT_BYTES)} input limit.`);
    }

    const json = extractFencedJson(raw);
    if (!json) throw new ProposalError("The project proposal must contain a JSON object.");
    try {
      return requireRecord(JSON.parse(json) as unknown, "The project proposal must be a JSON object.");
    } catch (reason) {
      if (reason instanceof ProposalError) throw reason;
      throw new ProposalError("The project proposal is not valid JSON.");
    }
  }

  return requireRecord(raw, "The project proposal must be a JSON object.");
}

function extractFencedJson(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  // Permit exactly one JSON/unspecified Markdown fence, including a brief
  // model preamble, but never concatenate content from multiple fences.
  const fences = [...value.matchAll(/```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)```/gi)];
  if (fences.length === 1) return fences[0][1].trim();
  return value;
}

function readRequiredString(record: JsonRecord, field: string, label: string): string {
  if (!Object.prototype.hasOwnProperty.call(record, field)) {
    throw new ProposalError(`The ${label} is required.`);
  }
  const value = record[field];
  if (typeof value !== "string") throw new ProposalError(`The ${label} must be a string.`);
  return value;
}

function normalizePath(value: string): string {
  const filePath = value.trim().replace(/\\/g, "/");
  if (!filePath) throw new ProposalError("The project proposal file path cannot be empty.");
  if (filePath.length > MAX_PROJECT_PROPOSAL_PATH_LENGTH || byteLength(filePath) > MAX_PROJECT_PROPOSAL_PATH_LENGTH * 4) {
    throw new RangeError(`The project proposal file path must be at most ${MAX_PROJECT_PROPOSAL_PATH_LENGTH} characters.`);
  }
  if (unsafeControlPattern.test(filePath) || unsafeFilenameCharacterPattern.test(filePath)) {
    throw new ProposalError("The project proposal file path contains unsupported characters.");
  }
  if (filePath.startsWith("/") || /^[a-z]:/i.test(filePath) || /^[a-z][a-z0-9+.-]*:/i.test(filePath)) {
    throw new ProposalError("The project proposal file path must be relative to the workspace.");
  }

  const segments = filePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new ProposalError("The project proposal file path cannot contain empty or traversal segments.");
  }
  if (segments.some((segment) => segment.endsWith(".") || segment.endsWith(" "))) {
    throw new ProposalError("The project proposal file path cannot end a segment with a dot or space.");
  }
  if (segments.some((segment) => protectedDirectories.has(segment.toLowerCase()))) {
    throw new ProposalError("The project proposal cannot target protected credential or Git directories.");
  }

  const basename = segments[segments.length - 1];
  const loweredBasename = basename.toLowerCase();
  const extension = extensionOf(loweredBasename);
  const bareWindowsName = loweredBasename.split(".", 1)[0];
  if (reservedWindowsNames.has(bareWindowsName)) {
    throw new ProposalError("The project proposal file path is a reserved Windows device name.");
  }
  if (segments.some((segment) => secretNamePattern.test(segment)) || secretExtensions.has(extension)) {
    throw new ProposalError("The project proposal cannot target files or folders that look like secrets.");
  }
  if (binaryExtensions.has(extension)) {
    throw new ProposalError("The project proposal cannot target a binary file.");
  }
  if (!textExtensions.has(extension) && !textBasenames.has(loweredBasename)) {
    throw new ProposalError("The project proposal file path must target a supported text file.");
  }

  return segments.join("/");
}

function normalizeContent(value: string): string {
  if (unsafeControlPattern.test(value)) {
    throw new ProposalError("The project proposal file content contains unsupported control characters.");
  }
  return value;
}

function normalizeSummary(value: string, label: string): string {
  if (unsafeControlPattern.test(value)) {
    throw new ProposalError(`The ${label} contains unsupported control characters.`);
  }
  const summary = value.replace(/\s+/g, " ").trim();
  if (!summary) throw new ProposalError(`The ${label} cannot be empty.`);
  if (summary.length > MAX_PROJECT_PROPOSAL_SUMMARY_LENGTH || byteLength(summary) > MAX_PROJECT_PROPOSAL_SUMMARY_LENGTH * 4) {
    throw new RangeError(`The ${label} must be at most ${MAX_PROJECT_PROPOSAL_SUMMARY_LENGTH} characters.`);
  }
  return summary;
}

function normalizeAction(value: unknown, index: number): ProjectProposalFileAction | undefined {
  if (value === undefined) return undefined;
  if (value === "create" || value === "update") return value;
  throw new ProposalError(`The project proposal file ${index} action must be \"create\" or \"update\" when supplied.`);
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
