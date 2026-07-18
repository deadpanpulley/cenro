import { LOCAL_OLLAMA_API, isValidOllamaModelName } from "./thread-service.js";
import type { ProviderPublicConfig, SmartRouteDecision, SmartTool } from "./runtime-types.js";

export type LocalSmartRouterInput = {
  prompt: string;
  area: "research" | "learn" | "build";
  /** User-selected small local model that plans but does not perform the task. */
  routerModel?: string;
  preferredWorkerModel?: string;
  availableLocalModels: string[];
  availableProviders: ProviderPublicConfig[];
  knownPlaybookIds: string[];
  requestedPlaybookId?: string;
  allowWeb: boolean;
  /** Deliberately metadata only: never raw file contents. */
  workspace: { fileCount: number; languages: string[] };
};

type RawRouterDecision = {
  route?: unknown;
  workerModel?: unknown;
  providerId?: unknown;
  playbookId?: unknown;
  requestedTools?: unknown;
  confidence?: unknown;
  reason?: unknown;
  requiresExternalConsent?: unknown;
};

const ROUTER_TIMEOUT_MS = 30_000;
const MAX_ROUTER_PROMPT_CHARS = 16_000;
const validTools = new Set<SmartTool>(["workspace-context", "web-search", "project-proposal", "team-workflow", "terminal-proposal"]);

/**
 * Routes with a local Ollama model. It gives the router the user's request and
 * safe metadata only; raw workspace content is intentionally unavailable at
 * this stage. Any unsafe/malformed result falls back to the local worker.
 */
export async function routeWithLocalSmartModel(input: LocalSmartRouterInput): Promise<SmartRouteDecision> {
  const fallback = fallbackDecision(input, input.routerModel ? "The Smart Switch could not produce a safe route, so Cenro kept this task local." : "Choose a local Router model in Settings to enable Smart Switch. Cenro kept this task local.");
  if (!input.routerModel || !isValidOllamaModelName(input.routerModel) || !input.availableLocalModels.includes(input.routerModel)) return fallback;

  const workerModels = input.availableLocalModels.filter(isValidOllamaModelName);
  if (!workerModels.length) return fallback;
  try {
    const response = await fetch(`${LOCAL_OLLAMA_API}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS),
      body: JSON.stringify({
        model: input.routerModel,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: routerSystemPrompt() },
          { role: "user", content: routerUserPrompt(input, workerModels) }
        ]
      })
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as { message?: { content?: unknown } };
    const raw = parseRouterJson(payload.message?.content);
    if (!raw) return fallback;
    return validateDecision(raw, input, workerModels) ?? fallback;
  } catch {
    return fallback;
  }
}

function routerSystemPrompt(): string {
  return [
    "You are Cenro Smart Switch, a small LOCAL routing model. You do not answer the task and you never execute tools.",
    "Choose a route based only on the user request and the listed safe metadata. Raw workspace contents are unavailable by design.",
    "Prefer local. Choose cloud only when an enabled provider with a saved key is listed and the task clearly benefits from it. Cloud and web always require explicit user consent.",
    "Return ONLY JSON with exactly: route ('local'|'cloud'), workerModel, providerId (optional), playbookId (optional), requestedTools (array of workspace-context|web-search|project-proposal|team-workflow|terminal-proposal), confidence (0-100 integer), reason (short string), requiresExternalConsent (boolean).",
    "Never request terminal execution. terminal-proposal only means a visible, user-approved command card may be useful."
  ].join("\n");
}

function routerUserPrompt(input: LocalSmartRouterInput, workerModels: string[]): string {
  const providers = input.availableProviders
    .filter((provider) => provider.enabled && provider.hasApiKey)
    .map((provider) => ({ id: provider.id, kind: provider.kind, model: provider.model, label: provider.label }));
  const safePrompt = input.prompt.trim().slice(0, MAX_ROUTER_PROMPT_CHARS);
  return JSON.stringify({
    task: safePrompt,
    area: input.area,
    preferredWorkerModel: input.preferredWorkerModel,
    availableLocalWorkers: workerModels,
    availableCloudProviders: providers,
    playbooks: input.knownPlaybookIds,
    userSelectedPlaybook: input.requestedPlaybookId,
    webResearchEnabled: input.allowWeb,
    workspaceMetadata: input.workspace
  });
}

function parseRouterJson(value: unknown): RawRouterDecision | undefined {
  if (typeof value !== "string" || value.length > 20_000) return undefined;
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
  try {
    const candidate = JSON.parse(fenced) as unknown;
    return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as RawRouterDecision : undefined;
  } catch {
    return undefined;
  }
}

function validateDecision(raw: RawRouterDecision, input: LocalSmartRouterInput, workerModels: string[]): SmartRouteDecision | undefined {
  if (raw.route !== "local" && raw.route !== "cloud") return undefined;
  if (typeof raw.workerModel !== "string" || !workerModels.includes(raw.workerModel)) return undefined;
  if (!Array.isArray(raw.requestedTools) || raw.requestedTools.length > validTools.size) return undefined;
  const requestedTools: SmartTool[] = [];
  for (const tool of raw.requestedTools as unknown[]) {
    if (typeof tool !== "string" || !validTools.has(tool as SmartTool) || requestedTools.includes(tool as SmartTool)) return undefined;
    requestedTools.push(tool as SmartTool);
  }
  const confidence = raw.confidence;
  if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) return undefined;
  if (typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 280 || /[\u0000-\u001f\u007f]/.test(raw.reason)) return undefined;
  if (typeof raw.requiresExternalConsent !== "boolean") return undefined;

  let providerId: string | undefined;
  if (raw.route === "cloud") {
    if (typeof raw.providerId !== "string") return undefined;
    const provider = input.availableProviders.find((entry) => entry.id === raw.providerId && entry.enabled && entry.hasApiKey);
    if (!provider) return undefined;
    providerId = provider.id;
  } else if (raw.providerId !== undefined && raw.providerId !== null) {
    return undefined;
  }

  let playbookId: string | undefined;
  if (raw.playbookId !== undefined && raw.playbookId !== null) {
    if (typeof raw.playbookId !== "string" || !input.knownPlaybookIds.includes(raw.playbookId)) return undefined;
    playbookId = raw.playbookId;
  }
  if (input.requestedPlaybookId && input.knownPlaybookIds.includes(input.requestedPlaybookId)) playbookId = input.requestedPlaybookId;

  // The contract is non-negotiable: any external operation remains consented.
  const requiresExternalConsent = raw.route === "cloud" || requestedTools.includes("web-search");
  if (raw.route === "cloud" && !raw.requiresExternalConsent) return undefined;
  if (requestedTools.includes("web-search") && !input.allowWeb) return undefined;
  return {
    route: raw.route,
    workerModel: raw.workerModel,
    ...(providerId ? { providerId } : {}),
    ...(playbookId ? { playbookId } : {}),
    requestedTools,
    confidence,
    reason: raw.reason.trim(),
    requiresExternalConsent,
    source: "router"
  };
}

function fallbackDecision(input: LocalSmartRouterInput, reason: string): SmartRouteDecision {
  const workers = input.availableLocalModels.filter(isValidOllamaModelName);
  const workerModel = input.preferredWorkerModel && workers.includes(input.preferredWorkerModel)
    ? input.preferredWorkerModel
    : workers[0] ?? input.routerModel ?? "";
  return {
    route: "local",
    workerModel,
    ...(input.requestedPlaybookId && input.knownPlaybookIds.includes(input.requestedPlaybookId) ? { playbookId: input.requestedPlaybookId } : {}),
    requestedTools: ["workspace-context"],
    confidence: 0,
    reason,
    requiresExternalConsent: false,
    source: "fallback"
  };
}
