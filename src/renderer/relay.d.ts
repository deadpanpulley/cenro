export {};

declare global {
  type RelayTaskSource = {
    id: string;
    type: "workspace" | "web";
    title: string;
    location: string;
    excerpt: string;
    score?: number;
  };

  type RelayTaskAction = {
    name: string;
    status: "complete" | "skipped" | "error";
    detail: string;
    durationMs?: number;
  };

  type RelayTaskRecord = {
    id: string;
    title: string;
    prompt: string;
    mode: "local" | "smart" | "cloud";
    area: "research" | "learn" | "build";
    model: string;
    status: "complete" | "error";
    createdAt: string;
    completedAt?: string;
    response?: string;
    error?: string;
    sources: RelayTaskSource[];
    actions: RelayTaskAction[];
    metadata?: { webRequested?: boolean; workspacePath?: string; localOnly?: boolean };
  };

  type RelayGitSnapshot = {
    available: boolean;
    branch?: string;
    ahead?: number;
    behind?: number;
    changedFiles: Array<{ path: string; index: string; workingTree: string }>;
    diffSummary?: string;
    message?: string;
  };

  type RelayEditProposal = {
    relativePath: string;
    summary: string;
    content: string;
    originalContent: string;
    changed: boolean;
  };

  type RelayChatMessage = { role: "user" | "assistant"; content: string; id?: string; createdAt?: string };

  type RelayProjectFileChange = {
    path: string;
    content: string;
    originalContent: string;
    summary: string;
    action: "create" | "update";
    baseHash: string;
    baseExists: boolean;
    changed: boolean;
  };

  type RelayProjectProposal = { summary: string; files: RelayProjectFileChange[] };

  /** A cloud-generated change set is inert until the existing Apply review flow is used. */
  type RelayGatewayPatchProposal = {
    summary: string;
    verification: string[];
    files: Array<RelayProjectFileChange & { reason: string }>;
  };

  type RelayGatewayRunResult = {
    runId: string;
    status: "completed" | "failed";
    model: string;
    response?: string;
    proposalStatus?: "review-ready" | "text-only";
    proposal?: RelayGatewayPatchProposal;
    error?: string;
    usage?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; reasoningTokens?: number; totalTokens?: number };
    ledgerEntryId: string;
  };

  interface Window {
    relay: {
      chooseWorkspace(): Promise<string | undefined>;
      scanWorkspace(root: string): Promise<Array<{ name: string; relativePath: string; kind: "folder" | "file"; depth: number }>>;
      readWorkspaceFile(relativePath: string): Promise<{ relativePath: string; content: string; updatedAt: string }>;
      writeWorkspaceFile(relativePath: string, content: string): Promise<{ relativePath: string; content: string; updatedAt: string }>;
      searchWorkspace(query: string): Promise<Array<{ relativePath: string; snippet: string; score: number }>>;
      getGitSnapshot(): Promise<RelayGitSnapshot>;
      getOllamaStatus(): Promise<{ connected: boolean; models: Array<{ name: string; size: number; modified_at: string }> }>;
      pullOllamaModel(model: string): Promise<{ started: boolean; reason?: string }>;
      deleteOllamaModel(model: string): Promise<void>;
      runTask(request: { prompt: string; model: string; mode: "local" | "smart" | "cloud"; area: "research" | "learn" | "build"; useWeb: boolean }): Promise<RelayTaskRecord>;
      proposeEdit(request: { prompt: string; model: string; relativePath: string }): Promise<RelayEditProposal>;
      applyEdit(request: { relativePath: string; content: string }): Promise<{ relativePath: string; content: string; updatedAt: string }>;
      sendLocalChat(request: { model: string; messages: RelayChatMessage[]; focusedFile?: { relativePath: string; content: string; language?: string } }): Promise<{ content: string; model: string; createdAt?: string }>;
      proposeProject(request: { prompt: string; model: string }): Promise<RelayProjectProposal>;
      applyProjectFiles(request: { files: Array<{ path: string; content: string; summary: string; action?: "create" | "update"; baseHash: string; baseExists: boolean }> }): Promise<Array<{ relativePath: string; content: string; updatedAt: string }>>;
      listTasks(): Promise<RelayTaskRecord[]>;
      clearTasks(): Promise<void>;
      exportTask(id: string): Promise<{ saved: boolean; path?: string }>;
      getSystemProfile(): Promise<{ memoryGb: number; cores: number; platform: string; architecture: string }>;
      getSettings(): Promise<{ onboardingComplete: boolean; workspacePath?: string }>;
      completeOnboarding(): Promise<{ onboardingComplete: boolean }>;
      openOllamaDownload(): Promise<void>;
      openExternalUrl(url: string): Promise<void>;
      onOllamaProgress(callback: (event: { model: string; line: string; status: "running" | "complete" | "error" }) => void): () => void;
    };
    cenro?: {
      getSettings?(): Promise<unknown>;
      updateSettings?(settings: unknown): Promise<unknown>;
      listProviderTemplates?(): Promise<unknown[]>;
      listProviders?(): Promise<unknown[]>;
      saveProvider?(provider: unknown): Promise<unknown>;
      testProvider?(id: unknown): Promise<{ ok?: boolean; message?: string; models?: string[] }>;
      deleteProvider?(id: string): Promise<void>;
      setProviderEnabled?(id: string, enabled: boolean): Promise<void>;
      getSmartRecommendation?(request: unknown): Promise<unknown>;
      executeSmartTask?(request: unknown): Promise<unknown>;
      /**
       * Optional local Context Gateway bridge. The renderer deliberately falls
       * back to workspace/Git metadata until this service is available.
       */
      getContextGatewaySnapshot?(request: { workspacePath?: string; prompt?: string; selectedFile?: string }): Promise<unknown>;
      analyzeGatewayContext?(request: { prompt: string; providerId?: string; maxOutputTokens?: number; budgetUsd?: number }): Promise<unknown>;
      researchGatewayWeb?(request: { contextPackId: string; query: string }): Promise<{
        researchId: string; contextPackId: string; query: string; createdAt: string; expiresAt: string;
        sources: Array<{ title: string; url: string; snippet: string; citation: string }>;
        characters: number; estimatedTokens: number; sourceCodeIncluded: false;
      }>;
      createGatewayRun?(request: { prompt: string; contextPackId: string; providerId: string; webResearchId?: string; maxOutputTokens?: number; budgetUsd?: number }): Promise<unknown>;
      approveGatewayRun?(request: { runId: string; approved: boolean; includeWorkspace: boolean }): Promise<RelayGatewayRunResult>;
      listGatewayLedger?(): Promise<unknown[]>;
      listPlaybooks?(): Promise<unknown[]>;
      savePlaybook?(playbook: unknown): Promise<unknown>;
      deletePlaybook?(id: string): Promise<void>;
      expandPlaybook?(playbookId: string, values?: Record<string, string>): Promise<unknown>;
      reset?(): Promise<unknown>;
      runTeamWorkflow?(request: unknown): Promise<unknown>;
      startTerminal?(request?: { cwdRelativePath?: string }): Promise<{ sessionId: string; cwd?: string; shell?: string; pty?: boolean }>;
      writeTerminal?(sessionId: string, data: string): Promise<void>;
      resizeTerminal?(sessionId: string, columns: number, rows: number): Promise<{ supported?: boolean }>;
      stopTerminal?(sessionId: string): Promise<void>;
      proposeTerminalCommand?(request: unknown): Promise<unknown>;
      runTerminalProposal?(sessionId: string, proposalId: string): Promise<unknown>;
      rejectTerminalProposal?(proposalId: string): Promise<void>;
      onTerminalData?(callback: (event: { sessionId: string; data: string }) => void): () => void;
      onTerminalExit?(callback: (event: { sessionId: string; code?: number; signal?: string }) => void): () => void;
      onTerminalCommandOutput?(callback: (event: unknown) => void): () => void;
      onOllamaProgress?(callback: (event: { model: string; line: string; status: "running" | "complete" | "error" }) => void): () => void;
    };
  }
}
