import { estimateTokens } from "./cost-ledger.js";
import { sanitizeCouncilRepositoryMetadata, type ContextCouncilRepositoryMetadata, type LocalContextCouncilResult } from "./local-context-council.js";
import type { GatewayContextAnalysis } from "./runtime-types.js";

/** Keeps the optional planning aid small enough to account for explicitly. */
export const MAX_GATEWAY_COUNCIL_BRIEF_CHARACTERS = 2_400;

export type GatewayCouncilBrief = {
  text: string;
  characters: number;
  estimatedTokens: number;
  included: boolean;
};

/**
 * Council use is opt-in through the Router role assignment. An installed Qwen
 * tag is not silently elected as a router merely because it happens to match a
 * recommendation; the user-selected router must still be installed.
 */
export function selectInstalledCouncilRouter(selectedRouter: string | undefined, availableModels: readonly string[]): string | undefined {
  if (typeof selectedRouter !== "string" || !selectedRouter.trim()) return undefined;
  return availableModels.find((model) => typeof model === "string" && model.toLowerCase() === selectedRouter.toLowerCase());
}

/**
 * Build the only shape the local council may receive. GatewayContextAnalysis is
 * renderer-safe metadata and has no selected source slices; sanitize again so
 * accidental extra fields from a future caller cannot become council input.
 */
export function councilRepositoryMetadataFromAnalysis(analysis: Pick<GatewayContextAnalysis, "repository" | "git" | "selectedFiles">): ContextCouncilRepositoryMetadata {
  return sanitizeCouncilRepositoryMetadata({
    fileCount: analysis.repository.fileCount,
    scannedFileCount: analysis.repository.scannedFileCount,
    scanTruncated: analysis.repository.scanTruncated,
    languages: analysis.repository.languages,
    topLevelDirectories: analysis.repository.topLevelDirectories,
    manifestFiles: analysis.repository.manifestFiles,
    entrypoints: analysis.repository.entrypoints,
    testFiles: analysis.repository.testFiles,
    changedFiles: analysis.git.changedFiles.map((file) => file.path),
    selectedFiles: analysis.selectedFiles.map((file) => ({
      relativePath: file.relativePath,
      language: file.language,
      symbols: file.symbols
    }))
  });
}

/**
 * Converts validated local planning output into a bounded cloud prompt suffix.
 * An unavailable/cancelled council or an all-fallback result is intentionally
 * omitted: its deterministic suggestions would only add redundant tokens.
 */
export function formatGatewayCouncilBrief(council?: LocalContextCouncilResult): GatewayCouncilBrief {
  if (!shouldIncludeCouncilBrief(council)) return { text: "", characters: 0, estimatedTokens: 0, included: false };
  const summary = council.summary;
  const take = (items: readonly string[], limit: number, itemLimit: number) => items
    .slice(0, limit)
    .map((item) => sanitizeBriefText(item, itemLimit))
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
  const criteria = take(summary.acceptanceCriteria, 4, 220);
  const risks = take(summary.riskFlags, 4, 220);
  const terms = summary.searchTerms
    .slice(0, 8)
    .map((item) => sanitizeBriefText(item, 90))
    .filter(Boolean)
    .join(", ");
  const rationale = sanitizeBriefText(summary.selectionRationale, 360);
  const body = [
    "LOCAL CONTEXT COUNCIL (metadata-only planning aid; no workspace source code was sent to the local model):",
    `Status: ${council.status}; sequential roles: intent analyst → context critic; successful local roles: ${council.stages.filter((stage) => stage.source === "local").length}.`,
    criteria ? `Acceptance criteria:\n${criteria}` : "",
    risks ? `Risks to preserve:\n${risks}` : "",
    terms ? `Useful search directions: ${terms}.` : "",
    rationale ? `Selection rationale: ${rationale}` : ""
  ].filter(Boolean).join("\n\n");
  // The suffix is concatenated directly to the redacted source-pack prompt.
  // Preserve an explicit delimiter so a trailing source line cannot fuse with
  // the council heading.
  const unbounded = `\n\n${body}`;
  const text = unbounded.length > MAX_GATEWAY_COUNCIL_BRIEF_CHARACTERS
    ? `${unbounded.slice(0, MAX_GATEWAY_COUNCIL_BRIEF_CHARACTERS - 1)}…`
    : unbounded;
  return { text, characters: text.length, estimatedTokens: estimateTokens(text.length), included: true };
}

function shouldIncludeCouncilBrief(council: LocalContextCouncilResult | undefined): council is LocalContextCouncilResult {
  return Boolean(
    council
    && (council.status === "completed" || council.status === "degraded")
    && council.localCallsAttempted > 0
    && council.stages.some((stage) => stage.source === "local")
  );
}

function sanitizeBriefText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
