/**
 * Renderer-safe contracts for Cenro's runtime services.
 *
 * These types deliberately exclude API keys and workspace contents. The
 * preload bridge only returns these public shapes to the renderer.
 */

export type ProviderKind = "openai" | "anthropic" | "openai-compatible";

/**
 * Optional per-model pricing supplied by the user. Cenro deliberately does
 * not invent a dollar price when a provider has not supplied one. Rates are
 * USD per one million tokens and never contain credentials.
 */
export type ProviderPricing = {
  inputPerMillionUsd?: number;
  cachedInputPerMillionUsd?: number;
  outputPerMillionUsd?: number;
  reasoningOutputPerMillionUsd?: number;
};

export type ProviderPublicConfig = {
  /** Stable local identifier; never an API key or endpoint credential. */
  id: string;
  kind: ProviderKind;
  label: string;
  model: string;
  /** Normalized endpoint without a trailing slash. */
  baseUrl: string;
  enabled: boolean;
  /** Whether an encrypted API key is available. The key is never returned. */
  hasApiKey: boolean;
  /** Optional user-configured price card used only for transparent estimates. */
  pricing?: ProviderPricing;
  createdAt: string;
  updatedAt: string;
};

/** Input accepted when creating or updating a provider. */
export type ProviderUpsertInput = {
  id?: string;
  kind: ProviderKind;
  label: string;
  model: string;
  baseUrl?: string;
  enabled?: boolean;
  /** Optional public price card. Omit it when the provider price is unknown. */
  pricing?: ProviderPricing;
  /** Optional write-only secret. An empty string intentionally removes it. */
  apiKey?: string;
};

export type ProviderTemplate = {
  kind: ProviderKind;
  label: string;
  defaultBaseUrl: string;
  /** UI starter only; users can always override it. */
  defaultModel?: string;
  modelHint: string;
  description: string;
};

export type ProviderConnectionResult = {
  ok: boolean;
  message: string;
  /** Returned only when the provider has a non-billable model-list endpoint. */
  models?: string[];
};

export type PlaybookCategory = "build" | "debug" | "explain" | "research" | "learn" | "security";

export type PlaybookVariable = {
  /** Used inside the template as `{{name}}`. */
  name: string;
  label: string;
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
};

export type Playbook = {
  id: string;
  name: string;
  description: string;
  category: PlaybookCategory;
  template: string;
  variables: PlaybookVariable[];
  /** Built-ins are immutable; editing one creates a local custom copy. */
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlaybookUpsertInput = {
  id?: string;
  /** A built-in id to clone; it is never overwritten. */
  baseId?: string;
  name: string;
  description: string;
  category: PlaybookCategory;
  template: string;
  variables?: PlaybookVariable[];
};

export type PlaybookExpansion = {
  playbook: Playbook;
  prompt: string;
  /** The UI should collect these before starting a task. */
  missingVariables: string[];
};

export type SmartTool = "workspace-context" | "web-search" | "project-proposal" | "team-workflow" | "terminal-proposal";
export type SmartRoute = "local" | "cloud";

export type SmartRouteDecision = {
  route: SmartRoute;
  /** The model that should do the work, not the lightweight router model. */
  workerModel: string;
  providerId?: string;
  playbookId?: string;
  requestedTools: SmartTool[];
  /** Integer percentage in the range 0–100. */
  confidence: number;
  reason: string;
  requiresExternalConsent: boolean;
  /** A malformed/timed-out router always falls back to a local route. */
  source: "router" | "fallback" | "user";
};

export type SmartContextBoundary = {
  userPromptChars: number;
  /** Files are listed without their contents so users can review before cloud use. */
  workspaceFiles: Array<{ relativePath: string; characters: number }>;
  workspaceCharacters: number;
  secretLookingFilesExcluded: true;
  webSearchWillReceivePrompt: boolean;
};

export type SmartRouteReceipt = SmartRouteDecision & {
  id: string;
  createdAt: string;
  expiresAt: string;
  /** UI-displayable boundary for the consent card. */
  dataBoundary: SmartContextBoundary;
};

export type SmartRouteRequest = {
  prompt: string;
  area?: "research" | "learn" | "build";
  /** Explicit mode selector. Omit it to let the local Smart Router decide. */
  forceRoute?: SmartRoute;
  preferredWorkerModel?: string;
  /** Required for a deterministic cloud choice when several providers exist. */
  preferredProviderId?: string;
  requestedPlaybookId?: string;
  allowWeb?: boolean;
};

export type SmartExecutionConsent = {
  /** Must be true for every web or cloud operation. */
  approved: boolean;
  /** Controls whether the listed workspace excerpts leave the machine. */
  includeWorkspace?: boolean;
  /** Controls whether the prompt is sent to the opt-in web-search provider. */
  allowWeb?: boolean;
};

export type SmartExecutionRequest = {
  prompt: string;
  receiptId: string;
  area?: "research" | "learn" | "build";
  externalConsent?: SmartExecutionConsent;
};

export type TeamStageName = "researcher" | "planner" | "builder" | "reviewer";

export type TeamStageResult = {
  stage: TeamStageName;
  output: string;
  startedAt: string;
  completedAt: string;
};

export type TeamWorkflowRequest = {
  prompt: string;
  model: string;
  stages?: TeamStageName[];
  playbookId?: string;
  playbookValues?: Record<string, string>;
};

export type TeamWorkflowResult = {
  prompt: string;
  model: string;
  stages: TeamStageResult[];
  finalOutput: string;
  /** Team workflow plans/reviews only; it cannot apply workspace edits. */
  applyRequired: true;
};

export type TerminalRiskLevel = "low" | "medium" | "high";

export type TerminalSessionInfo = {
  sessionId: string;
  cwd: string;
  shell: string;
  pty: boolean;
  /** The launch directory is contained in the selected workspace. */
  workspaceScopedLaunch: true;
  /** A real user-approved shell is not an operating-system sandbox. */
  unrestrictedShell: true;
};

export type TerminalCommandProposal = {
  id: string;
  command: string;
  cwd: string;
  reason: string;
  riskLevel: TerminalRiskLevel;
  createdAt: string;
  expiresAt: string;
  /** The card must be explicitly approved; it never runs on model output. */
  userMustApprove: true;
  /** PowerShell can access paths beyond its workspace launch directory. */
  mayAccessOutsideWorkspace: true;
};

export type TerminalDataEvent = { sessionId: string; data: string };
export type TerminalExitEvent = { sessionId: string; code: number | null; signal: string | null };
export type TerminalCommandOutputEvent = { sessionId: string; proposalId: string; data?: string; done?: boolean; code?: number | null; error?: string };

/**
 * The local Context Gateway is a project map plus exact, redacted code slices.
 * It gives cloud workers repository awareness without persisting source code in
 * receipts or pretending an estimate is measured provider usage.
 */
export type GatewayContextAnalysisRequest = {
  prompt: string;
  /** Optional cloud provider used only to produce a transparent cost preflight. */
  providerId?: string;
  /** Output ceiling used for a maximum-cost estimate. */
  maxOutputTokens?: number;
  /** Optional per-run USD ceiling. Cenro refuses approval if the estimate exceeds it. */
  budgetUsd?: number;
};

export type GatewayRepositoryMap = {
  fileCount: number;
  scannedFileCount: number;
  scanTruncated: boolean;
  languages: Array<{ language: string; files: number }>;
  topLevelDirectories: string[];
  manifestFiles: string[];
  entrypoints: string[];
  testFiles: string[];
};

export type GatewaySelectedFile = {
  relativePath: string;
  language: string;
  characters: number;
  estimatedTokens: number;
  relevanceScore: number;
  /** Human-readable, locally-derived reasons—not model claims. */
  whySelected: string[];
  /** Bounded symbol names extracted locally; source code remains in the main process. */
  symbols: string[];
  redactions: number;
};

export type GatewayExclusion = {
  category: "secret-looking" | "unsupported" | "too-large" | "symlink" | "binary" | "scan-limit";
  count: number;
  reason: string;
};

export type GatewayGitMetadata = {
  repository: boolean;
  branch?: string;
  changedFiles: Array<{ path: string; status: string }>;
  changedFilesTruncated: boolean;
  diffSummary: string;
};

export type GatewayCostPreflight = {
  inputTokensEstimated: number;
  maxOutputTokens: number;
  maximumBillableTokens: number;
  /** Dollar figures are estimates from a user-supplied price card, never provider usage. */
  estimateStatus: "priced-estimate" | "tokens-only";
  estimatedInputCostUsd?: number;
  estimatedMaximumCostUsd?: number;
  budgetUsd?: number;
  budgetStatus: "within" | "exceeds" | "not-set" | "unpriced";
  note: string;
};

/** Safe, source-free evidence from the sequential local Context Council. */
export type GatewayLocalCouncilSummary = {
  model?: string;
  status: "completed" | "degraded" | "unavailable" | "cancelled";
  sequential: true;
  dataBoundary: "user-request-and-repository-metadata-only";
  localCallsAttempted: number;
  stages: Array<{ role: "intent-analyst" | "context-critic"; source: "local" | "fallback"; fallbackReason?: string }>;
  summary: { acceptanceCriteria: string[]; riskFlags: string[]; searchTerms: string[]; selectionRationale: string };
};

export type GatewayContextAnalysis = {
  /** Ephemeral, owner-bound id. It never persists raw repository content. */
  contextPackId: string;
  createdAt: string;
  expiresAt: string;
  promptCharacters: number;
  repository: GatewayRepositoryMap;
  git: GatewayGitMetadata;
  selectedFiles: GatewaySelectedFile[];
  exclusions: GatewayExclusion[];
  contextCharacters: number;
  estimatedContextTokens: number;
  redactionsApplied: number;
  costPreflight: GatewayCostPreflight;
  /** Present when the Gateway prepared an optional metadata-only local council brief. */
  localCouncil?: GatewayLocalCouncilSummary;
};

/** An external-search packet that contains citations/snippets only, never code. */
export type GatewayWebResearchRequest = {
  contextPackId: string;
  /** User-visible text that is sent to the search engine after approval. */
  query: string;
};

export type GatewayWebResearchReceipt = {
  researchId: string;
  contextPackId: string;
  query: string;
  createdAt: string;
  expiresAt: string;
  sources: Array<{ title: string; url: string; snippet: string; citation: string }>;
  characters: number;
  estimatedTokens: number;
  /** The search packet is citation text only, not workspace content. */
  sourceCodeIncluded: false;
};

export type GatewayRunCreateRequest = {
  prompt: string;
  contextPackId: string;
  providerId: string;
  /** An owner-bound, short-lived citation packet created after separate web consent. */
  webResearchId?: string;
  maxOutputTokens?: number;
  budgetUsd?: number;
};

export type GatewayRunReceipt = {
  runId: string;
  contextPackId: string;
  createdAt: string;
  expiresAt: string;
  provider: { id: string; label: string; model: string; kind: ProviderKind };
  /** Exactly what can leave the device when the run is approved. */
  dataBoundary: {
    promptCharacters: number;
    repositoryMapCharacters: number;
    selectedFiles: Array<{ relativePath: string; characters: number; estimatedTokens: number; redactions: number }>;
    /** Metadata-only local planning text appended after source-pack creation. */
    councilBrief: { included: boolean; characters: number; estimatedTokens: number; sourceCodeIncluded: false };
    /** Optional, separately-consented external citations included with this run. */
    webResearch: { included: boolean; query?: string; sourceCount: number; characters: number; estimatedTokens: number; sourceCodeIncluded: false };
    contextCharacters: number;
    secretLookingFilesExcluded: true;
    sourceCodePersistedLocally: false;
  };
  costPreflight: GatewayCostPreflight;
  externalConsentRequired: true;
};

export type GatewayRunApprovalRequest = {
  runId: string;
  /** Must be true before any provider request is made. */
  approved: boolean;
  /** Must be true before selected code slices can leave this device. */
  includeWorkspace: boolean;
};

/** The strict, unhydrated schema returned by a cloud lead for a code change. */
export type GatewayPatchProposalFile = {
  path: string;
  action: "create" | "update";
  /** Complete replacement text, never a diff. */
  content: string;
  /** Why this file belongs in the proposed change set. */
  reason: string;
};

export type GatewayPatchProposal = {
  summary: string;
  files: GatewayPatchProposalFile[];
  /** Commands or manual checks to run; Cenro never treats these as completed. */
  verification: string[];
};

/**
 * A locally bound, review-ready proposal. The original text and hash let the
 * existing explicit Apply flow reject a stale workspace; this result alone
 * never writes a file.
 */
export type GatewayPatchReviewFile = GatewayPatchProposalFile & {
  /** Kept compatible with the existing multi-file review UI. */
  summary: string;
  originalContent: string;
  baseHash: string;
  baseExists: boolean;
  changed: boolean;
};

export type GatewayPatchReviewProposal = {
  summary: string;
  files: GatewayPatchReviewFile[];
  verification: string[];
};

export type GatewayRunResult = {
  runId: string;
  status: "completed" | "failed";
  model: string;
  response?: string;
  /** A validated, review-only change set; it is never auto-applied. */
  proposal?: GatewayPatchReviewProposal;
  /** Plain cloud text remains available when the cloud response is not a safe patch contract. */
  proposalStatus?: "review-ready" | "text-only";
  error?: string;
  /** Measured only when the provider returned usage fields. */
  usage?: GatewayUsage;
  ledgerEntryId: string;
};

export type GatewayUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

export type GatewayLedgerEntry = {
  id: string;
  runId: string;
  providerId: string;
  providerLabel: string;
  model: string;
  status: "completed" | "failed";
  createdAt: string;
  completedAt: string;
  promptCharacters: number;
  contextCharacters: number;
  inputTokensEstimated: number;
  maxOutputTokens: number;
  usage?: GatewayUsage;
  /** Measured usage priced with a user-supplied card, or explicitly unavailable. */
  costStatus: "priced-usage" | "usage-unpriced" | "usage-unavailable";
  actualCostUsd?: number;
  error?: string;
};
