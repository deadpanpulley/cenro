import { describe, expect, it, vi } from "vitest";
import {
  parseContextCouncilOutput,
  runLocalContextCouncil,
  sanitizeCouncilRepositoryMetadata,
  type ContextCouncilRepositoryMetadata
} from "./local-context-council.js";

const repository: ContextCouncilRepositoryMetadata = {
  fileCount: 12,
  scannedFileCount: 12,
  languages: [{ language: "TypeScript", files: 8 }, { language: "Markdown", files: 4 }],
  manifestFiles: ["package.json"],
  entrypoints: ["src/main.ts"],
  testFiles: ["src/main.test.ts"],
  changedFiles: ["src/renderer/app.tsx"],
  selectedFiles: [
    { relativePath: "src/main.ts", language: "TypeScript", symbols: ["startGateway", "safeMap"] },
    { relativePath: "src/renderer/app.tsx", language: "TypeScript", symbols: ["GatewayView"] }
  ]
};

const validOutput = {
  acceptanceCriteria: ["Route the task using the available repository evidence."],
  riskFlags: ["Existing workspace changes need review."],
  searchTerms: ["gateway", "startGateway"],
  selectionRationale: "The metadata identifies the application entry point and a relevant local symbol."
};

describe("local Context Council", () => {
  it("accepts only the exact structured JSON contract", () => {
    expect(parseContextCouncilOutput(JSON.stringify(validOutput))).toEqual(validOutput);
    expect(parseContextCouncilOutput(`\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\``)).toEqual(validOutput);
    expect(parseContextCouncilOutput(JSON.stringify({ ...validOutput, extra: true }))).toBeUndefined();
    expect(parseContextCouncilOutput(JSON.stringify({ ...validOutput, searchTerms: ["gateway", "gateway"] }))).toBeUndefined();
    expect(parseContextCouncilOutput(JSON.stringify({ ...validOutput, acceptanceCriteria: ["Line one\nLine two"] }))).toBeUndefined();
    expect(parseContextCouncilOutput("Here is your JSON: " + JSON.stringify(validOutput))).toBeUndefined();
  });

  it("does not make a network call when no installed model is selected", async () => {
    const request = vi.fn<typeof fetch>();
    const result = await runLocalContextCouncil({
      prompt: "Add a safe context receipt.",
      model: "qwen3:1.7b",
      availableModels: [],
      repository
    }, { fetch: request });

    expect(request).not.toHaveBeenCalled();
    expect(result.status).toBe("unavailable");
    expect(result.localCallsAttempted).toBe(0);
    expect(result.stages).toHaveLength(2);
    expect(result.stages.every((stage) => stage.source === "fallback")).toBe(true);
    expect(result.dataBoundary).toBe("user-request-and-repository-metadata-only");
  });

  it("runs roles in a strict sequence and retains only validated local outputs", async () => {
    let active = 0;
    let maxActive = 0;
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const payload = JSON.parse(body.messages[1].content) as { role: string; repositoryMetadata: Record<string, unknown> };
      // The request envelope contains our safe field selection only, never a
      // hidden content/excerpt property from a loose integration object.
      expect(payload.repositoryMetadata).not.toHaveProperty("content");
      expect(payload.repositoryMetadata).not.toHaveProperty("rawSource");
      await Promise.resolve();
      active -= 1;
      const stageOutput = payload.role === "intent-analyst"
        ? validOutput
        : { ...validOutput, searchTerms: ["gateway", "GatewayView"], selectionRationale: "The prior report and metadata point to a focused context handoff." };
      return new Response(JSON.stringify({ message: { content: JSON.stringify(stageOutput) } }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await runLocalContextCouncil({
      prompt: "Add a safe context receipt.",
      model: "qwen3:1.7b",
      availableModels: ["qwen3:1.7b"],
      repository
    }, { fetch: request });

    expect(request).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
    expect(result.status).toBe("completed");
    expect(result.sequential).toBe(true);
    expect(result.stages.map((stage) => stage.role)).toEqual(["intent-analyst", "context-critic"]);
    expect(result.stages.every((stage) => stage.source === "local")).toBe(true);
    expect(result.summary.searchTerms).toContain("GatewayView");
  });

  it("falls back deterministically when a model response is malformed", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: "not JSON" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: JSON.stringify(validOutput) } }), { status: 200 }));

    const result = await runLocalContextCouncil({
      prompt: "Improve the settings screen.",
      model: "qwen3:1.7b",
      availableModels: ["qwen3:1.7b"],
      repository
    }, { fetch: request });

    expect(result.status).toBe("degraded");
    expect(result.stages[0]).toMatchObject({ role: "intent-analyst", source: "fallback" });
    expect(result.stages[0].fallbackReason).toMatch(/malformed/i);
    expect(result.stages[1].source).toBe("local");
    expect(result.summary.acceptanceCriteria.length).toBeGreaterThan(0);
  });

  it("strips loose source-like fields from repository metadata before model prompt construction", () => {
    const unsafe = {
      ...repository,
      selectedFiles: [{ relativePath: "src/main.ts", language: "TypeScript", symbols: ["startGateway"], content: "const privateSource = 'do not send';" }],
      rawSource: "secret source"
    } as unknown as ContextCouncilRepositoryMetadata;

    const safe = sanitizeCouncilRepositoryMetadata(unsafe);
    expect(JSON.stringify(safe)).not.toContain("privateSource");
    expect(JSON.stringify(safe)).not.toContain("rawSource");
    expect(safe.selectedFiles).toEqual([{ relativePath: "src/main.ts", language: "TypeScript", symbols: ["startGateway"] }]);
  });

  it("does not call local Ollama when the caller has already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn<typeof fetch>();
    const result = await runLocalContextCouncil({
      prompt: "Explain the repository.",
      model: "qwen3:1.7b",
      availableModels: ["qwen3:1.7b"],
      repository,
      signal: controller.signal
    }, { fetch: request });

    expect(request).not.toHaveBeenCalled();
    expect(result.status).toBe("cancelled");
    expect(result.localCallsAttempted).toBe(0);
  });
});
