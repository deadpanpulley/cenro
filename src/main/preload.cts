import { contextBridge, ipcRenderer } from "electron";

type OllamaProgress = { model: string; line: string; status: "running" | "complete" | "error" };

/**
 * Cenro's new runtime bridge. It intentionally contains no generic IPC method
 * and never returns provider keys or raw smart-route workspace contents.
 */
const cenroApi = {
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<{ onboardingComplete: boolean; workspacePath?: string; routerModel?: string; builderModel?: string; researchModel?: string }>,
  updateSettings: (patch: { onboardingComplete?: boolean; routerModel?: string; builderModel?: string; researchModel?: string }) => ipcRenderer.invoke("settings:update", patch) as Promise<{ onboardingComplete: boolean; workspacePath?: string; routerModel?: string; builderModel?: string; researchModel?: string }>,
  completeOnboarding: () => ipcRenderer.invoke("settings:complete-onboarding") as Promise<{ onboardingComplete: boolean; workspacePath?: string; routerModel?: string; builderModel?: string; researchModel?: string }>,
  getOllamaRecommendations: () => ipcRenderer.invoke("ollama:recommendations") as Promise<unknown>,

  listProviderTemplates: () => ipcRenderer.invoke("provider:templates") as Promise<Array<{ kind: "openai" | "anthropic" | "openai-compatible"; label: string; defaultBaseUrl: string; defaultModel?: string; modelHint: string; description: string }>>,
  listProviders: () => ipcRenderer.invoke("provider:list") as Promise<Array<{ id: string; kind: "openai" | "anthropic" | "openai-compatible"; label: string; model: string; baseUrl: string; enabled: boolean; hasApiKey: boolean; createdAt: string; updatedAt: string }>>,
  getProviderSecurity: () => ipcRenderer.invoke("provider:security") as Promise<{ encryptionAvailable: boolean }>,
  saveProvider: (provider: { id?: string; kind: "openai" | "anthropic" | "openai-compatible"; label: string; model: string; baseUrl?: string; enabled?: boolean; pricing?: { inputPerMillionUsd?: number; cachedInputPerMillionUsd?: number; outputPerMillionUsd?: number; reasoningOutputPerMillionUsd?: number }; /** Write-only: never returned. */ apiKey?: string }) => ipcRenderer.invoke("provider:save", provider) as Promise<unknown>,
  setProviderEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke("provider:set-enabled", { id, enabled }) as Promise<unknown>,
  deleteProvider: (id: string) => ipcRenderer.invoke("provider:delete", id) as Promise<boolean>,
  testProvider: (id: string) => ipcRenderer.invoke("provider:test", id) as Promise<{ ok: boolean; message: string; models?: string[] }>,

  /**
   * Context Gateway: source code stays in the main process during analysis;
   * these public responses contain only paths, provenance, token estimates,
   * redaction counts, and consent receipts.
   */
  getContextGatewaySnapshot: (request: { workspacePath?: string; prompt?: string; selectedFile?: string } = {}) => ipcRenderer.invoke("gateway:snapshot", request) as Promise<{
    contextPackId?: string;
    indexState: "ready" | "building" | "unavailable";
    indexedFiles: number;
    indexedSymbols: number;
    candidateFiles: Array<{ path: string; reason?: string; chars?: number }>;
    redactions: Array<{ path: string; reason?: string }>;
    estimatedTokens: { selected?: number; full?: number; cached?: number };
    estimatedCost: { selected?: number; full?: number; currency: "USD"; estimateStatus?: "priced-estimate" | "tokens-only" };
    agents: Array<{ id: string; label: string; status: "ready" | "working" | "waiting" | "blocked"; detail?: string }>;
    worker: { provider?: string; model?: string; ready?: boolean };
  }>,
  analyzeGatewayContext: (request: { prompt: string; providerId?: string; maxOutputTokens?: number; budgetUsd?: number }) => ipcRenderer.invoke("gateway:analyze", request) as Promise<{
    contextPackId: string; createdAt: string; expiresAt: string; promptCharacters: number; contextCharacters: number; estimatedContextTokens: number; redactionsApplied: number;
    repository: { fileCount: number; scannedFileCount: number; scanTruncated: boolean; languages: Array<{ language: string; files: number }>; topLevelDirectories: string[]; manifestFiles: string[]; entrypoints: string[]; testFiles: string[] };
    git: { repository: boolean; branch?: string; changedFiles: Array<{ path: string; status: string }>; changedFilesTruncated: boolean; diffSummary: string };
    selectedFiles: Array<{ relativePath: string; language: string; characters: number; estimatedTokens: number; relevanceScore: number; whySelected: string[]; symbols: string[]; redactions: number }>;
    exclusions: Array<{ category: string; count: number; reason: string }>;
    costPreflight: { inputTokensEstimated: number; maxOutputTokens: number; maximumBillableTokens: number; estimateStatus: "priced-estimate" | "tokens-only"; estimatedInputCostUsd?: number; estimatedMaximumCostUsd?: number; budgetUsd?: number; budgetStatus: "within" | "exceeds" | "not-set" | "unpriced"; note: string };
    localCouncil?: { model?: string; status: "completed" | "degraded" | "unavailable" | "cancelled"; sequential: true; dataBoundary: "user-request-and-repository-metadata-only"; localCallsAttempted: number; stages: Array<{ role: "intent-analyst" | "context-critic"; source: "local" | "fallback"; fallbackReason?: string }>; summary: { acceptanceCriteria: string[]; riskFlags: string[]; searchTerms: string[]; selectionRationale: string } };
  }>,
  researchGatewayWeb: (request: { contextPackId: string; query: string }) => ipcRenderer.invoke("gateway:web-research", request) as Promise<{
    researchId: string; contextPackId: string; query: string; createdAt: string; expiresAt: string;
    sources: Array<{ title: string; url: string; snippet: string; citation: string }>;
    characters: number; estimatedTokens: number; sourceCodeIncluded: false;
  }>,
  createGatewayRun: (request: { prompt: string; contextPackId: string; providerId: string; webResearchId?: string; maxOutputTokens?: number; budgetUsd?: number }) => ipcRenderer.invoke("gateway:create-run", request) as Promise<{
    runId: string; contextPackId: string; createdAt: string; expiresAt: string; provider: { id: string; label: string; model: string; kind: "openai" | "anthropic" | "openai-compatible" };
    dataBoundary: { promptCharacters: number; repositoryMapCharacters: number; selectedFiles: Array<{ relativePath: string; characters: number; estimatedTokens: number; redactions: number }>; councilBrief: { included: boolean; characters: number; estimatedTokens: number; sourceCodeIncluded: false }; webResearch: { included: boolean; query?: string; sourceCount: number; characters: number; estimatedTokens: number; sourceCodeIncluded: false }; contextCharacters: number; secretLookingFilesExcluded: true; sourceCodePersistedLocally: false };
    costPreflight: { inputTokensEstimated: number; maxOutputTokens: number; maximumBillableTokens: number; estimateStatus: "priced-estimate" | "tokens-only"; estimatedInputCostUsd?: number; estimatedMaximumCostUsd?: number; budgetUsd?: number; budgetStatus: "within" | "exceeds" | "not-set" | "unpriced"; note: string };
    externalConsentRequired: true;
  }>,
  approveGatewayRun: (request: { runId: string; approved: boolean; includeWorkspace: boolean }) => ipcRenderer.invoke("gateway:approve-run", request) as Promise<{
    runId: string; status: "completed" | "failed"; model: string; response?: string;
    proposalStatus?: "review-ready" | "text-only";
    /** This is a review object only; no bridge method applies it automatically. */
    proposal?: { summary: string; verification: string[]; files: Array<{ path: string; content: string; originalContent: string; summary: string; reason: string; action: "create" | "update"; baseHash: string; baseExists: boolean; changed: boolean }> };
    error?: string; usage?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; reasoningTokens?: number; totalTokens?: number }; ledgerEntryId: string;
  }>,
  listGatewayLedger: () => ipcRenderer.invoke("gateway:list-ledger") as Promise<Array<{
    id: string; runId: string; providerId: string; providerLabel: string; model: string; status: "completed" | "failed"; createdAt: string; completedAt: string; promptCharacters: number; contextCharacters: number; inputTokensEstimated: number; maxOutputTokens: number;
    usage?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; reasoningTokens?: number; totalTokens?: number }; costStatus: "priced-usage" | "usage-unpriced" | "usage-unavailable"; actualCostUsd?: number; error?: string;
  }>>,

  listPlaybooks: () => ipcRenderer.invoke("playbook:list") as Promise<unknown>,
  savePlaybook: (playbook: { id?: string; baseId?: string; name: string; description: string; category: "build" | "debug" | "explain" | "research" | "learn" | "security"; template: string; variables?: Array<{ name: string; label: string; required: boolean; defaultValue?: string; placeholder?: string }> }) => ipcRenderer.invoke("playbook:save", playbook) as Promise<unknown>,
  deletePlaybook: (id: string) => ipcRenderer.invoke("playbook:delete", id) as Promise<boolean>,
  expandPlaybook: (playbookId: string, values?: Record<string, string>) => ipcRenderer.invoke("playbook:expand", { playbookId, values }) as Promise<unknown>,

  getSmartRecommendation: (request: { prompt: string; area?: "research" | "learn" | "build"; forceRoute?: "local" | "cloud"; preferredWorkerModel?: string; preferredProviderId?: string; requestedPlaybookId?: string; allowWeb?: boolean }) => ipcRenderer.invoke("smart:route", request) as Promise<unknown>,
  executeSmartTask: (request: { prompt: string; receiptId: string; area?: "research" | "learn" | "build"; externalConsent?: { approved: boolean; includeWorkspace?: boolean; allowWeb?: boolean } }) => ipcRenderer.invoke("smart:execute", request) as Promise<unknown>,
  runTeamWorkflow: (request: { prompt: string; model: string; stages?: Array<"researcher" | "planner" | "builder" | "reviewer">; playbookId?: string; playbookValues?: Record<string, string> }) => ipcRenderer.invoke("team:run", request) as Promise<unknown>,

  startTerminal: (input: { cwdRelativePath?: string } = {}) => ipcRenderer.invoke("terminal:start", input) as Promise<{ sessionId: string; cwd: string; shell: string; pty: boolean; workspaceScopedLaunch: true; unrestrictedShell: true }>,
  writeTerminal: (sessionId: string, data: string) => ipcRenderer.invoke("terminal:write", { sessionId, data }) as Promise<void>,
  resizeTerminal: (sessionId: string, columns: number, rows: number) => ipcRenderer.invoke("terminal:resize", { sessionId, columns, rows }) as Promise<{ supported: boolean }>,
  stopTerminal: (sessionId: string) => ipcRenderer.invoke("terminal:stop", sessionId) as Promise<void>,
  proposeTerminalCommand: (input: { command: string; cwdRelativePath?: string; reason?: string; riskLevel?: "low" | "medium" | "high" }) => ipcRenderer.invoke("terminal:propose-command", input) as Promise<{ id: string; command: string; cwd: string; reason: string; riskLevel: "low" | "medium" | "high"; createdAt: string; expiresAt: string; userMustApprove: true; mayAccessOutsideWorkspace: true }>,
  runTerminalProposal: (sessionId: string, proposalId: string) => ipcRenderer.invoke("terminal:run-proposal", { sessionId, proposalId }) as Promise<{ started: true }>,
  rejectTerminalProposal: (proposalId: string) => ipcRenderer.invoke("terminal:reject-proposal", proposalId) as Promise<void>,
  onTerminalData: (callback: (payload: { sessionId: string; data: string }) => void) => subscribe("terminal:data", callback),
  onTerminalExit: (callback: (payload: { sessionId: string; code: number | null; signal: string | null }) => void) => subscribe("terminal:exit", callback),
  onTerminalCommandOutput: (callback: (payload: { sessionId: string; proposalId: string; data?: string; done?: boolean; code?: number | null; error?: string }) => void) => subscribe("terminal:command-output", callback)
};

function subscribe<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("cenro", cenroApi);

contextBridge.exposeInMainWorld("relay", {
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose") as Promise<string | undefined>,
  scanWorkspace: (root: string) => ipcRenderer.invoke("workspace:scan", root) as Promise<Array<{ name: string; relativePath: string; kind: "folder" | "file"; depth: number }>>,
  readWorkspaceFile: (relativePath: string) => ipcRenderer.invoke("workspace:read-file", relativePath) as Promise<{ relativePath: string; content: string; updatedAt: string }>,
  writeWorkspaceFile: (relativePath: string, content: string) => ipcRenderer.invoke("workspace:write-file", { relativePath, content }) as Promise<{ relativePath: string; content: string; updatedAt: string }>,
  searchWorkspace: (query: string) => ipcRenderer.invoke("workspace:search", query) as Promise<Array<{ relativePath: string; snippet: string; score: number }>>,
  getGitSnapshot: () => ipcRenderer.invoke("workspace:git-status") as Promise<unknown>,
  getOllamaStatus: () => ipcRenderer.invoke("ollama:status") as Promise<{ connected: boolean; models: Array<{ name: string; size: number; modified_at: string }> }>,
  pullOllamaModel: (model: string) => ipcRenderer.invoke("ollama:pull", model) as Promise<{ started: boolean; reason?: string }>,
  deleteOllamaModel: (model: string) => ipcRenderer.invoke("ollama:delete", model) as Promise<void>,
  runTask: (request: { prompt: string; model: string; mode: "local" | "smart" | "cloud"; area: "research" | "learn" | "build"; useWeb: boolean }) => ipcRenderer.invoke("task:run", request) as Promise<unknown>,
  proposeEdit: (request: { prompt: string; model: string; relativePath: string }) => ipcRenderer.invoke("edit:propose", request) as Promise<unknown>,
  applyEdit: (request: { relativePath: string; content: string }) => ipcRenderer.invoke("edit:apply", request) as Promise<unknown>,
  sendLocalChat: (request: { model: string; messages: Array<{ role: "user" | "assistant"; content: string; id?: string; createdAt?: string }>; focusedFile?: { relativePath: string; content: string; language?: string } }) => ipcRenderer.invoke("chat:send", request) as Promise<unknown>,
  proposeProject: (request: { prompt: string; model: string }) => ipcRenderer.invoke("project:propose", request) as Promise<unknown>,
  applyProjectFiles: (request: { files: Array<{ path: string; content: string; summary: string; action?: "create" | "update"; baseHash: string; baseExists: boolean }> }) => ipcRenderer.invoke("project:apply", request) as Promise<unknown>,
  listTasks: () => ipcRenderer.invoke("task:list") as Promise<unknown>,
  clearTasks: () => ipcRenderer.invoke("task:clear") as Promise<void>,
  exportTask: (id: string) => ipcRenderer.invoke("task:export", id) as Promise<{ saved: boolean; path?: string }>,
  getSystemProfile: () => ipcRenderer.invoke("system:profile") as Promise<{ memoryGb: number; cores: number; platform: string; architecture: string }>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<{ onboardingComplete: boolean; workspacePath?: string }>,
  completeOnboarding: () => ipcRenderer.invoke("settings:complete-onboarding") as Promise<{ onboardingComplete: boolean }>,
  openOllamaDownload: () => ipcRenderer.invoke("ollama:open-download") as Promise<void>,
  openExternalUrl: (url: string) => ipcRenderer.invoke("shell:open-external", url) as Promise<void>,
  onOllamaProgress: (callback: (event: OllamaProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: OllamaProgress) => callback(payload);
    ipcRenderer.on("ollama:progress", listener);
    return () => ipcRenderer.removeListener("ollama:progress", listener);
  },
  /** Backward-compatible access for screens incrementally moved to Cenro. */
  cenro: cenroApi
});
