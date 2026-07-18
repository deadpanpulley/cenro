import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGatewayCostLedger, createGatewayCostPreflight, priceProviderUsage } from "./cost-ledger.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "cenro-gateway-ledger-test-"));
  directories.push(directory);
  return directory;
}

describe("Context Gateway cost-accounting acceptance", () => {
  it("uses a conservative output-cap preflight and refuses a budget that cannot cover it", () => {
    const preflight = createGatewayCostPreflight({
      inputTokensEstimated: 1_000_000,
      maxOutputTokens: 2_000_000,
      budgetUsd: 4.99,
      pricing: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 }
    });

    expect(preflight).toMatchObject({
      estimateStatus: "priced-estimate",
      estimatedInputCostUsd: 1,
      estimatedMaximumCostUsd: 5,
      maximumBillableTokens: 3_000_000,
      budgetStatus: "exceeds"
    });
  });

  it("never presents an unpriced provider as a dollar estimate", () => {
    const preflight = createGatewayCostPreflight({
      inputTokensEstimated: 5_000,
      maxOutputTokens: 1_200,
      budgetUsd: 1,
      pricing: { inputPerMillionUsd: 0.5 }
    });

    expect(preflight).toMatchObject({ estimateStatus: "tokens-only", budgetStatus: "unpriced" });
    expect(preflight.estimatedInputCostUsd).toBeUndefined();
    expect(preflight.estimatedMaximumCostUsd).toBeUndefined();
  });

  it("charges cached input separately and charges reasoning exactly once", () => {
    const priced = priceProviderUsage(
      {
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
        outputTokens: 100_000,
        reasoningTokens: 60_000
      },
      {
        inputPerMillionUsd: 1,
        cachedInputPerMillionUsd: 0.1,
        outputPerMillionUsd: 10,
        reasoningOutputPerMillionUsd: 20
      }
    );

    // 600k standard input ($0.60) + 400k cached ($0.04) +
    // 40k ordinary output ($0.40) + 60k reasoning output ($1.20).
    expect(priced).toEqual({ costStatus: "priced-usage", actualCostUsd: 2.24 });
  });

  it("does not bill impossible cached-token counts beyond provider input usage", () => {
    const priced = priceProviderUsage(
      { inputTokens: 10, cachedInputTokens: 99, outputTokens: 0 },
      { inputPerMillionUsd: 1_000_000, cachedInputPerMillionUsd: 0, outputPerMillionUsd: 1 }
    );

    // A provider cannot cache more input than it reports as input. Cenro must
    // cap or reject malformed usage rather than inflate the cost ledger.
    expect(priced).toEqual({ costStatus: "priced-usage", actualCostUsd: 0 });
  });

  it("records no fake actual spend when an API does not return usage", () => {
    expect(priceProviderUsage(undefined, { inputPerMillionUsd: 1, outputPerMillionUsd: 2 }))
      .toEqual({ costStatus: "usage-unavailable" });
  });

  it("persists ledger facts without raw prompt/context or credential-looking error text", async () => {
    const directory = await temporaryDirectory();
    const ledger = createGatewayCostLedger(directory);
    const entry = await ledger.save({
      runId: "run-1",
      providerId: "openai",
      providerLabel: "OpenAI",
      model: "gpt-5.6",
      status: "failed",
      promptCharacters: 42,
      contextCharacters: 800,
      inputTokensEstimated: 211,
      maxOutputTokens: 1_000,
      costStatus: "usage-unavailable",
      error: "Provider said Authorization: Bearer sk-cenro-test-secret"
    });

    const serialized = await readFile(ledger.filePath, "utf8");
    expect(serialized).not.toContain("sk-cenro-test-secret");
    expect(serialized).not.toContain("USER REQUEST:");
    expect(entry.error).not.toContain("sk-cenro-test-secret");
  });
});
