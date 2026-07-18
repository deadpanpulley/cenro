import { describe, expect, it } from "vitest";
import {
  MAX_GATEWAY_COUNCIL_BRIEF_CHARACTERS,
  councilRepositoryMetadataFromAnalysis,
  formatGatewayCouncilBrief,
  selectInstalledCouncilRouter
} from "./gateway-council-brief.js";
import { createGatewayCostPreflight } from "./cost-ledger.js";
import type { LocalContextCouncilResult } from "./local-context-council.js";
import type { GatewayContextAnalysis } from "./runtime-types.js";

function council(overrides: Partial<LocalContextCouncilResult> = {}): LocalContextCouncilResult {
  return {
    model: "qwen3:1.7b",
    status: "completed",
    sequential: true,
    dataBoundary: "user-request-and-repository-metadata-only",
    localCallsAttempted: 2,
    stages: [
      { role: "intent-analyst", source: "local", output: { acceptanceCriteria: ["Keep the request scoped."], riskFlags: [], searchTerms: ["gateway"], selectionRationale: "The task maps to the gateway entry point." } },
      { role: "context-critic", source: "local", output: { acceptanceCriteria: ["Verify the resulting receipt."], riskFlags: ["Existing changes need review."], searchTerms: ["receipt"], selectionRationale: "The metadata points to the consent boundary." } }
    ],
    summary: {
      acceptanceCriteria: ["Keep the request scoped.", "Verify the resulting receipt."],
      riskFlags: ["Existing changes need review."],
      searchTerms: ["gateway", "receipt"],
      selectionRationale: "The metadata points to the consent boundary."
    },
    ...overrides
  };
}

describe("Gateway Council integration helpers", () => {
  it("uses only the selected router when that exact tag is installed", () => {
    const installed = ["qwen3:1.7b", "qwen2.5-coder:3b"];
    expect(selectInstalledCouncilRouter(undefined, installed)).toBeUndefined();
    expect(selectInstalledCouncilRouter("qwen3:4b", installed)).toBeUndefined();
    expect(selectInstalledCouncilRouter("QWEN3:1.7B", installed)).toBe("qwen3:1.7b");
  });

  it("derives council input from public analysis metadata and strips source-like extras", () => {
    const analysis = {
      repository: {
        fileCount: 3,
        scannedFileCount: 3,
        scanTruncated: false,
        languages: [{ language: "TypeScript", files: 3 }],
        topLevelDirectories: ["src"],
        manifestFiles: ["package.json"],
        entrypoints: ["src/main.ts"],
        testFiles: ["src/main.test.ts"]
      },
      git: { repository: true, changedFiles: [{ path: "src/main.ts", status: "M " }], changedFilesTruncated: false, diffSummary: "1 file changed" },
      selectedFiles: [{ relativePath: "src/main.ts", language: "TypeScript", characters: 100, estimatedTokens: 25, relevanceScore: 10, whySelected: ["Entry point"], symbols: ["start"], redactions: 0, content: "const rawSourceMustNeverReachCouncil = true;" }]
    } as unknown as Pick<GatewayContextAnalysis, "repository" | "git" | "selectedFiles">;

    const metadata = councilRepositoryMetadataFromAnalysis(analysis);
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("rawSourceMustNeverReachCouncil");
    expect(metadata.selectedFiles).toEqual([{ relativePath: "src/main.ts", language: "TypeScript", symbols: ["start"] }]);
  });

  it("omits deterministic-only council fallbacks from the cloud prompt", () => {
    const unavailable = council({ status: "unavailable", localCallsAttempted: 0, stages: council().stages.map((stage) => ({ ...stage, source: "fallback" as const })) });
    const cancelled = council({ status: "cancelled", localCallsAttempted: 1 });
    const allFallback = council({ status: "degraded", stages: council().stages.map((stage) => ({ ...stage, source: "fallback" as const })) });

    expect(formatGatewayCouncilBrief(unavailable)).toEqual({ text: "", characters: 0, estimatedTokens: 0, included: false });
    expect(formatGatewayCouncilBrief(cancelled)).toEqual({ text: "", characters: 0, estimatedTokens: 0, included: false });
    expect(formatGatewayCouncilBrief(allFallback)).toEqual({ text: "", characters: 0, estimatedTokens: 0, included: false });
  });

  it("creates an explicitly bounded, token-accountable cloud brief from a real local result", () => {
    const verbose = council({
      summary: {
        acceptanceCriteria: Array.from({ length: 10 }, (_, index) => `criterion-${index} ${"x".repeat(600)}`),
        riskFlags: Array.from({ length: 10 }, (_, index) => `risk-${index} ${"y".repeat(600)}`),
        searchTerms: Array.from({ length: 20 }, (_, index) => `term-${index}-${"z".repeat(150)}`),
        selectionRationale: "r".repeat(4_000)
      }
    });
    const brief = formatGatewayCouncilBrief(verbose);

    expect(brief.included).toBe(true);
    expect(brief.text.startsWith("\n\nLOCAL CONTEXT COUNCIL")).toBe(true);
    expect(brief.text).toContain("LOCAL CONTEXT COUNCIL");
    expect(brief.characters).toBe(brief.text.length);
    expect(brief.characters).toBeLessThanOrEqual(MAX_GATEWAY_COUNCIL_BRIEF_CHARACTERS);
    expect(brief.estimatedTokens).toBe(Math.ceil(brief.characters / 4));

    const baseInputTokens = 1_000;
    const preflight = createGatewayCostPreflight({
      inputTokensEstimated: baseInputTokens + brief.estimatedTokens,
      maxOutputTokens: 500,
      pricing: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 }
    });
    expect(preflight.inputTokensEstimated).toBe(baseInputTokens + brief.estimatedTokens);
    expect(preflight.maximumBillableTokens).toBe(baseInputTokens + brief.estimatedTokens + 500);
  });
});
