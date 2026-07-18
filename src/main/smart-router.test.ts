import { afterEach, describe, expect, it, vi } from "vitest";
import { routeWithLocalSmartModel } from "./smart-router.js";

const baseInput = {
  prompt: "Create a small accessible landing page",
  area: "build" as const,
  preferredWorkerModel: "qwen2.5-coder:3b",
  availableLocalModels: ["qwen3:1.7b", "qwen2.5-coder:3b"],
  availableProviders: [],
  knownPlaybookIds: ["build-polished-app"],
  allowWeb: false,
  workspace: { fileCount: 12, languages: ["typescript", "css"] }
};

afterEach(() => vi.unstubAllGlobals());

describe("local Smart Switch", () => {
  it("keeps a task local when the user has not selected an installed router", async () => {
    const decision = await routeWithLocalSmartModel({ ...baseInput, routerModel: undefined });
    expect(decision).toMatchObject({ route: "local", workerModel: "qwen2.5-coder:3b", source: "fallback", requiresExternalConsent: false });
  });

  it("rejects an unsafe cloud decision and falls back locally", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: {
        content: JSON.stringify({
          route: "cloud",
          workerModel: "qwen2.5-coder:3b",
          providerId: "not-configured",
          requestedTools: ["workspace-context"],
          confidence: 91,
          reason: "Use the cloud",
          requiresExternalConsent: true
        })
      }
    }))));

    const decision = await routeWithLocalSmartModel({ ...baseInput, routerModel: "qwen3:1.7b" });
    expect(decision).toMatchObject({ route: "local", workerModel: "qwen2.5-coder:3b", source: "fallback" });
  });

  it("accepts a schema-valid local route without granting external access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: {
        content: JSON.stringify({
          route: "local",
          workerModel: "qwen2.5-coder:3b",
          requestedTools: ["workspace-context", "project-proposal"],
          confidence: 78,
          reason: "A bounded local implementation is sufficient.",
          requiresExternalConsent: false
        })
      }
    }))));

    const decision = await routeWithLocalSmartModel({ ...baseInput, routerModel: "qwen3:1.7b" });
    expect(decision).toMatchObject({
      route: "local",
      source: "router",
      requiresExternalConsent: false,
      requestedTools: ["workspace-context", "project-proposal"]
    });
  });
});
