import { spawn } from "node:child_process";
import path from "node:path";

/** A single entry reported by `git status --porcelain`. */
export interface GitChangedFile {
  /** Path relative to the workspace root, using Git's path separators. */
  path: string;
  /** The two-character porcelain status, for example `M `, ` M`, or `??`. */
  xy: string;
  /** Index-side status character from `xy`. */
  indexStatus: string;
  /** Working-tree-side status character from `xy`. */
  worktreeStatus: string;
  /** Original path for rename/copy records, when Git reports one. */
  originalPath?: string;
}

/** A deliberately small, bounded summary of tracked file changes. */
export interface GitDiffSummary {
  /** Human-readable `git diff --shortstat` output, limited to a small string. */
  text: string;
  /** Number reported by Git, or the visible changed-file count when unavailable. */
  filesChanged: number;
  /** Number of added lines reported by Git when available. */
  insertions: number;
  /** Number of deleted lines reported by Git when available. */
  deletions: number;
  /** Untracked files are counted from status because they have no diff yet. */
  untrackedFiles: number;
  /** True when Git output was capped or the summary could not be fully read. */
  truncated: boolean;
}

/**
 * A read-only view of Git state for a Cenro workspace. No field requires a
 * repository: callers can render this object directly for ordinary folders.
 */
export interface GitSnapshot {
  /** Whether the Git executable could be started. */
  available: boolean;
  /** Whether the requested folder is inside a non-bare Git working tree. */
  repository: boolean;
  /** Resolved workspace path when valid, otherwise the supplied display value. */
  workspaceRoot: string;
  /** Current branch name. Undefined for detached or unborn HEADs without a name. */
  branch?: string;
  /** Whether HEAD is detached. */
  detached: boolean;
  /** Configured upstream ref, when the branch has one. */
  upstream?: string;
  /** Commits present locally but absent from the upstream. */
  ahead?: number;
  /** Commits present on the upstream but absent locally. */
  behind?: number;
  /** Changed paths, capped to keep large repositories responsive. */
  changedFiles: GitChangedFile[];
  /** True when the changed-file list was limited by the output or entry cap. */
  changedFilesTruncated: boolean;
  /** Bounded line-change statistics for tracked files. */
  diff: GitDiffSummary;
  /** A safe, user-facing explanation when a snapshot is unavailable or partial. */
  message?: string;
}

type GitCommandResult = {
  ok: boolean;
  code: number | null;
  stdout: Buffer;
  stderr: Buffer;
  timedOut: boolean;
  outputLimited: boolean;
  spawnError?: unknown;
};

type ParsedStatus = {
  files: GitChangedFile[];
  truncated: boolean;
};

type ParsedShortStat = {
  text: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
};

const COMMAND_TIMEOUT_MS = 8_000;
const VERSION_TIMEOUT_MS = 2_000;
const STATUS_OUTPUT_LIMIT_BYTES = 512 * 1024;
const DIFF_OUTPUT_LIMIT_BYTES = 32 * 1024;
const DEFAULT_OUTPUT_LIMIT_BYTES = 16 * 1024;
const MAX_CHANGED_FILES = 500;
const MAX_SUMMARY_TEXT_LENGTH = 600;

/**
 * Inspect a workspace without mutating it. The helper only runs read-only Git
 * commands, disables optional Git locks, never uses a shell, and turns every
 * failure into an inspectable snapshot rather than throwing.
 */
export async function getGitSnapshot(workspaceRoot: string): Promise<GitSnapshot> {
  const requestedRoot = typeof workspaceRoot === "string" ? workspaceRoot : "";
  const root = resolveWorkspaceRoot(requestedRoot);
  const displayRoot = root ?? requestedRoot;
  const empty = createEmptySnapshot(displayRoot);

  try {
    const version = await runGit(undefined, ["--version"], VERSION_TIMEOUT_MS, DEFAULT_OUTPUT_LIMIT_BYTES);
    if (!version.ok) {
      return {
        ...empty,
        message: version.timedOut
          ? "Git did not respond before the timeout."
          : "Git is not available on this computer."
      };
    }

    if (!root) {
      return {
        ...empty,
        available: true,
        message: "Choose a valid workspace folder to inspect Git status."
      };
    }

    const repositoryCheck = await runGit(
      root,
      ["rev-parse", "--is-inside-work-tree"],
      COMMAND_TIMEOUT_MS,
      DEFAULT_OUTPUT_LIMIT_BYTES
    );
    if (!repositoryCheck.ok || repositoryCheck.stdout.toString("utf8").trim() !== "true") {
      return {
        ...empty,
        available: true,
        message: repositoryCheck.timedOut
          ? "Git did not finish checking this folder before the timeout."
          : "This folder is not a Git working tree."
      };
    }

    const [statusResult, branchResult, upstreamResult, headResult, diffResult] = await Promise.all([
      runGit(
        root,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"],
        COMMAND_TIMEOUT_MS,
        STATUS_OUTPUT_LIMIT_BYTES
      ),
      runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], COMMAND_TIMEOUT_MS, DEFAULT_OUTPUT_LIMIT_BYTES),
      runGit(
        root,
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        COMMAND_TIMEOUT_MS,
        DEFAULT_OUTPUT_LIMIT_BYTES
      ),
      runGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"], COMMAND_TIMEOUT_MS, DEFAULT_OUTPUT_LIMIT_BYTES),
      runGit(
        root,
        ["diff", "--no-ext-diff", "--shortstat", "HEAD", "--"],
        COMMAND_TIMEOUT_MS,
        DIFF_OUTPUT_LIMIT_BYTES
      )
    ]);

    const parsedStatus = parsePorcelainStatus(statusResult.stdout, statusResult.outputLimited || statusResult.timedOut);
    const branch = readSingleLine(branchResult.stdout);
    const upstream = upstreamResult.ok ? readSingleLine(upstreamResult.stdout) : undefined;
    const detached = !branch && headResult.ok;

    let relative: GitCommandResult | undefined;
    if (upstream) {
      relative = await runGit(
        root,
        ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        COMMAND_TIMEOUT_MS,
        DEFAULT_OUTPUT_LIMIT_BYTES
      );
    }

    const aheadBehind = relative?.ok ? parseAheadBehind(relative.stdout) : undefined;
    const diff = await createDiffSummary(root, diffResult, headResult.ok, parsedStatus);
    const messages = collectPartialMessages({ statusResult, diffResult, relative, upstream });

    return {
      available: true,
      repository: true,
      workspaceRoot: displayRoot,
      branch,
      detached,
      upstream,
      ahead: aheadBehind?.ahead,
      behind: aheadBehind?.behind,
      changedFiles: parsedStatus.files,
      changedFilesTruncated: parsedStatus.truncated,
      diff,
      message: messages.length ? messages.join(" ") : undefined
    };
  } catch {
    // Keep UI code safe even if a future Node/Git edge case escapes a command.
    return {
      ...empty,
      available: true,
      message: "Git status could not be read for this workspace."
    };
  }
}

async function createDiffSummary(
  root: string,
  initialResult: GitCommandResult,
  hasHead: boolean,
  status: ParsedStatus
): Promise<GitDiffSummary> {
  const untrackedFiles = status.files.filter((file) => file.xy === "??").length;

  if (initialResult.ok) {
    return buildDiffSummary(parseShortStat(initialResult.stdout), initialResult, status, untrackedFiles);
  }

  // `git diff HEAD` is intentionally unavailable before a repository's first
  // commit. In that case, report staged and unstaged stats independently and
  // combine their line totals into the same bounded summary.
  if (!hasHead) {
    const [stagedResult, unstagedResult] = await Promise.all([
      runGit(root, ["diff", "--no-ext-diff", "--cached", "--shortstat", "--"], COMMAND_TIMEOUT_MS, DIFF_OUTPUT_LIMIT_BYTES),
      runGit(root, ["diff", "--no-ext-diff", "--shortstat", "--"], COMMAND_TIMEOUT_MS, DIFF_OUTPUT_LIMIT_BYTES)
    ]);
    const staged = stagedResult.ok ? parseShortStat(stagedResult.stdout) : undefined;
    const unstaged = unstagedResult.ok ? parseShortStat(unstagedResult.stdout) : undefined;
    return buildInitialRepositoryDiffSummary(staged, unstaged, stagedResult, unstagedResult, status, untrackedFiles);
  }

  return buildDiffSummary(undefined, initialResult, status, untrackedFiles);
}

function buildDiffSummary(
  parsed: ParsedShortStat | undefined,
  result: GitCommandResult,
  status: ParsedStatus,
  untrackedFiles: number
): GitDiffSummary {
  const text = parsed?.text || (result.ok ? "No tracked file changes." : "Tracked diff statistics are unavailable.");
  return {
    text,
    filesChanged: parsed?.filesChanged ?? status.files.length,
    insertions: parsed?.insertions ?? 0,
    deletions: parsed?.deletions ?? 0,
    untrackedFiles,
    truncated: Boolean(result.outputLimited || result.timedOut || status.truncated)
  };
}

function buildInitialRepositoryDiffSummary(
  staged: ParsedShortStat | undefined,
  unstaged: ParsedShortStat | undefined,
  stagedResult: GitCommandResult,
  unstagedResult: GitCommandResult,
  status: ParsedStatus,
  untrackedFiles: number
): GitDiffSummary {
  const summaries = [
    staged?.text ? `Staged: ${staged.text}` : "",
    unstaged?.text ? `Unstaged: ${unstaged.text}` : ""
  ].filter(Boolean);
  return {
    text: trimSummaryText(summaries.join(" · ") || "No tracked file changes."),
    filesChanged: status.files.length,
    insertions: (staged?.insertions ?? 0) + (unstaged?.insertions ?? 0),
    deletions: (staged?.deletions ?? 0) + (unstaged?.deletions ?? 0),
    untrackedFiles,
    truncated: Boolean(
      stagedResult.outputLimited ||
        stagedResult.timedOut ||
        unstagedResult.outputLimited ||
        unstagedResult.timedOut ||
        status.truncated
    )
  };
}

function parsePorcelainStatus(output: Buffer, alreadyTruncated: boolean): ParsedStatus {
  const records = output.toString("utf8").split("\0");
  const files: GitChangedFile[] = [];
  let truncated = alreadyTruncated;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.length < 4 || record[2] !== " ") {
      // The final partial record can be cut off when the process output cap is
      // reached. Ignore it rather than exposing a malformed pathname.
      truncated = true;
      continue;
    }

    const xy = record.slice(0, 2);
    const file: GitChangedFile = {
      xy,
      indexStatus: xy[0],
      worktreeStatus: xy[1],
      path: record.slice(3)
    };
    if (!file.path) {
      truncated = true;
      continue;
    }

    if (xy[0] === "R" || xy[0] === "C" || xy[1] === "R" || xy[1] === "C") {
      const originalPath = records[index + 1];
      if (originalPath) {
        // With porcelain v1 + -z Git writes destination first, then source.
        file.originalPath = originalPath;
        index += 1;
      } else {
        truncated = true;
      }
    }

    if (files.length < MAX_CHANGED_FILES) {
      files.push(file);
    } else {
      truncated = true;
      break;
    }
  }

  return { files, truncated };
}

function parseShortStat(output: Buffer): ParsedShortStat | undefined {
  const text = trimSummaryText(output.toString("utf8").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim());
  if (!text) return { text: "No tracked file changes.", filesChanged: 0, insertions: 0, deletions: 0 };

  return {
    text,
    filesChanged: readStatNumber(text, /(\d+) files? changed/i),
    insertions: readStatNumber(text, /(\d+) insertions?\(\+\)/i),
    deletions: readStatNumber(text, /(\d+) deletions?\(-\)/i)
  };
}

function parseAheadBehind(output: Buffer): { ahead: number; behind: number } | undefined {
  const match = /^(\d+)\s+(\d+)\s*$/.exec(output.toString("utf8"));
  if (!match) return undefined;
  const ahead = Number.parseInt(match[1], 10);
  const behind = Number.parseInt(match[2], 10);
  return Number.isSafeInteger(ahead) && Number.isSafeInteger(behind) ? { ahead, behind } : undefined;
}

function readStatNumber(text: string, pattern: RegExp): number | undefined {
  const value = pattern.exec(text)?.[1];
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function readSingleLine(output: Buffer): string | undefined {
  const value = output.toString("utf8").split(/\r?\n/, 1)[0]?.trim();
  return value || undefined;
}

function createEmptySnapshot(workspaceRoot: string): GitSnapshot {
  return {
    available: false,
    repository: false,
    workspaceRoot,
    detached: false,
    changedFiles: [],
    changedFilesTruncated: false,
    diff: {
      text: "No Git diff is available.",
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      untrackedFiles: 0,
      truncated: false
    }
  };
}

function collectPartialMessages(results: {
  statusResult: GitCommandResult;
  diffResult: GitCommandResult;
  relative?: GitCommandResult;
  upstream?: string;
}): string[] {
  const messages: string[] = [];
  if (results.statusResult.timedOut) messages.push("Git status timed out; the file list may be incomplete.");
  else if (results.statusResult.outputLimited) messages.push("Git status was limited; the file list may be incomplete.");

  if (results.diffResult.timedOut) messages.push("Diff statistics timed out.");
  else if (results.diffResult.outputLimited) messages.push("Diff statistics were limited.");

  if (results.upstream && results.relative && !results.relative.ok) {
    messages.push("Upstream comparison is unavailable.");
  }
  return messages;
}

function trimSummaryText(value: string): string {
  if (value.length <= MAX_SUMMARY_TEXT_LENGTH) return value;
  return `${value.slice(0, MAX_SUMMARY_TEXT_LENGTH - 1).trimEnd()}…`;
}

function resolveWorkspaceRoot(workspaceRoot: string): string | undefined {
  if (!workspaceRoot || workspaceRoot.includes("\0")) return undefined;
  try {
    return path.resolve(workspaceRoot);
  } catch {
    return undefined;
  }
}

/**
 * Start Git with no shell and capture only a fixed amount of output. A process
 * that exceeds the time or output limit is terminated and represented as an
 * unsuccessful result instead of rejecting the caller's promise.
 */
function runGit(
  cwd: string | undefined,
  args: readonly string[],
  timeoutMs: number,
  outputLimitBytes: number
): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let capturedBytes = 0;
    let timedOut = false;
    let outputLimited = false;
    let settled = false;
    let child: ReturnType<typeof spawn>;

    const finish = (code: number | null, spawnError?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: code === 0 && !spawnError && !timedOut && !outputLimited,
        code,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
        timedOut,
        outputLimited,
        spawnError
      });
    };

    const stop = (): void => {
      try {
        child.kill();
      } catch {
        // The process can finish between the limit check and kill call.
      }
    };

    const append = (chunks: Buffer[], value: Buffer | string): void => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = outputLimitBytes - capturedBytes;
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      capturedBytes += chunk.byteLength;
      if (capturedBytes > outputLimitBytes && !outputLimited) {
        outputLimited = true;
        stop();
      }
    };

    try {
      child = spawn("git", args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
          LC_ALL: "C",
          LANG: "C"
        }
      });
    } catch (error) {
      resolve({
        ok: false,
        code: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        timedOut: false,
        outputLimited: false,
        spawnError: error
      });
      return;
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    timeout.unref();

    child.stdout?.on("data", (chunk: Buffer) => append(stdoutChunks, chunk));
    child.stderr?.on("data", (chunk: Buffer) => append(stderrChunks, chunk));
    child.once("error", (error) => finish(null, error));
    child.once("close", (code) => finish(code));
  });
}
