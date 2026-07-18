import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./monaco-setup";
import {
  Activity, Archive, ArrowDownToLine, ArrowRight, BookOpen, Bot, Braces, BrainCircuit, Check, CheckCircle2, ChevronRight,
  Circle, Clock3, Code2, Copy, Cpu, Database, FileCode2, FilePlus2, FolderOpen, Globe2,
  FileDiff, GitBranch, HardDrive, History, Layers3, Link2, LoaderCircle, LockKeyhole, Menu, MoreHorizontal, Network,
  PanelLeft, Plus, RefreshCw, Save, Search, Send, Settings, ShieldAlert, ShieldCheck, Sparkles,
  Terminal, TestTube2, Trash2, TriangleAlert, WandSparkles, Workflow, X
} from "lucide-react";

type View = "workspace" | "editor" | "research" | "learn" | "build" | "terminal" | "history" | "settings";
type Mode = "local" | "smart" | "cloud";
type StudioMode = "plan" | "build" | "polish" | "debug" | "review" | "ask";
type StudioSidePanel = "plan" | "changes";
type StudioDock = "terminal" | undefined;
type Area = "research" | "learn" | "build";
type WorkspaceEntry = { name: string; relativePath: string; kind: "folder" | "file"; depth: number };
type OllamaModel = { name: string; size: number; modified_at: string };
type PullProgress = { line: string; status: "running" | "complete" | "error" };
type CodeTab = { relativePath: string; content: string; baseContent: string; updatedAt?: string; dirty: boolean };
type WorkspacePanel = "chat" | "changes" | "playbooks";
type Playbook = { id: string; title: string; description: string; area: Area; template: string; variables: string[]; icon: "build" | "debug" | "explain" | "research" | "learn" | "security" | "project"; builtIn?: boolean; baseId?: string };
type RouteReceipt = { id?: string; routeReceiptId?: string; route: "local" | "cloud" | "web"; workerModel?: string; provider?: string; playbook?: string; requestedTools?: string[]; confidence?: number; reason?: string; requiresExternalConsent?: boolean; dataBoundary?: { files?: string[]; characterCount?: number; note?: string } };
type PendingTask = { prompt: string; model: string; mode: Mode; area: Area; useWeb: boolean; team: boolean; playbookId?: string };
type ProviderPricing = { inputPerMillionUsd?: number; cachedInputPerMillionUsd?: number; outputPerMillionUsd?: number; reasoningOutputPerMillionUsd?: number };
type CenroProvider = { id: string; name: string; kind: "openai" | "anthropic" | "compatible"; endpoint?: string; model?: string; enabled: boolean; configured?: boolean; pricing?: ProviderPricing };
type TerminalProposal = { id: string; command: string; cwd: string; reason: string; riskLevel: "low" | "medium" | "high" };
type ModelRoles = { routerModel: string; builderModel: string; researchModel: string };
type GatewaySnapshot = {
  indexState?: "ready" | "building" | "unavailable";
  indexedFiles?: number;
  indexedSymbols?: number;
  candidateFiles?: Array<{ path: string; reason?: string; lines?: string; chars?: number }>;
  redactions?: Array<{ path: string; reason?: string }>;
  estimatedTokens?: { selected?: number; full?: number; cached?: number };
  estimatedCost?: { selected?: number; full?: number; currency?: string };
  agents?: Array<{ id: string; label: string; status?: "ready" | "working" | "waiting" | "blocked"; detail?: string }>;
  worker?: { provider?: string; model?: string; ready?: boolean };
};
type GatewayCostPreflight = {
  inputTokensEstimated: number;
  maxOutputTokens: number;
  maximumBillableTokens: number;
  estimateStatus: "priced-estimate" | "tokens-only";
  estimatedInputCostUsd?: number;
  estimatedMaximumCostUsd?: number;
  budgetUsd?: number;
  budgetStatus: "within" | "exceeds" | "not-set" | "unpriced";
  note: string;
};
type GatewayLocalCouncil = {
  model?: string;
  status: "completed" | "degraded" | "unavailable" | "cancelled";
  sequential: true;
  dataBoundary: "user-request-and-repository-metadata-only";
  localCallsAttempted: number;
  stages: Array<{ role: "intent-analyst" | "context-critic"; source: "local" | "fallback"; fallbackReason?: string }>;
  summary: { acceptanceCriteria: string[]; riskFlags: string[]; searchTerms: string[]; selectionRationale: string };
};
type GatewayAnalysis = {
  contextPackId: string;
  createdAt: string;
  expiresAt: string;
  promptCharacters: number;
  contextCharacters: number;
  estimatedContextTokens: number;
  redactionsApplied: number;
  repository: { fileCount: number; scannedFileCount: number; scanTruncated: boolean; languages: Array<{ language: string; files: number }> };
  git: { repository: boolean; branch?: string; changedFiles: Array<{ path: string; status: string }>; changedFilesTruncated: boolean; diffSummary: string };
  selectedFiles: Array<{ relativePath: string; language: string; characters: number; estimatedTokens: number; relevanceScore: number; whySelected: string[]; symbols: string[]; redactions: number }>;
  exclusions: Array<{ category: string; count: number; reason: string }>;
  costPreflight: GatewayCostPreflight;
  /** A source-free, local-only planning receipt that never contains code. */
  localCouncil?: GatewayLocalCouncil;
};
type GatewayRunReceipt = {
  runId: string;
  contextPackId: string;
  createdAt: string;
  expiresAt: string;
  provider: { id: string; label: string; model: string; kind: string };
  dataBoundary: {
    promptCharacters: number;
    repositoryMapCharacters: number;
    selectedFiles: Array<{ relativePath: string; characters: number; estimatedTokens: number; redactions: number }>;
    councilBrief: { included: boolean; characters: number; estimatedTokens: number; sourceCodeIncluded: false };
    webResearch: { included: boolean; query?: string; sourceCount: number; characters: number; estimatedTokens: number; sourceCodeIncluded: false };
    contextCharacters: number;
    secretLookingFilesExcluded: true;
    sourceCodePersistedLocally: false;
  };
  costPreflight: GatewayCostPreflight;
  externalConsentRequired: true;
};
type GatewayWebResearch = {
  researchId: string;
  contextPackId: string;
  query: string;
  createdAt: string;
  expiresAt: string;
  sources: Array<{ title: string; url: string; snippet: string; citation: string }>;
  characters: number;
  estimatedTokens: number;
  sourceCodeIncluded: false;
};
type GatewayHandoff = { request: PendingTask; analysis: GatewayAnalysis; receipt: GatewayRunReceipt };
type StudioPlan = {
  prompt: string;
  /** Exact local-analysis input; the cloud receipt must bind to this string. */
  gatewayPrompt: string;
  mode: StudioMode;
  createdAt: string;
  analysis?: GatewayAnalysis;
  diagnosis: string[];
  direction: string[];
  files: Array<{ path: string; reason: string; characters?: number }>;
  acceptance: string[];
};

const areaCopy: Record<Area, { eyebrow: string; title: string; hint: string }> = {
  research: {
    eyebrow: "EVIDENCE WORKSPACE",
    title: "Turn a question into grounded understanding.",
    hint: "Ask for a brief, comparison, decision memo, or synthesis. Web search is always opt-in."
  },
  learn: {
    eyebrow: "LEARNING STUDIO",
    title: "Learn from your own notes and code.",
    hint: "Ask for a lesson, explanation, study plan, examples, or a quiz."
  },
  build: {
    eyebrow: "BUILD ASSISTANT",
    title: "Plan and make a change with local context.",
    hint: "Ask for implementation guidance, a code review, tests, or a change plan."
  }
};

const defaultPlaybooks: Playbook[] = [
  {
    id: "build-polished-app", title: "Build a polished app", area: "build", icon: "build",
    description: "Turn a product idea into a deliberate, reviewable build brief.", variables: ["project_name", "stack"],
    template: "Build {{project_name}} using {{stack}}. First inspect the workspace and state a concise plan. Then propose a small, coherent set of files. Prioritize accessible, intentional UI, sensible empty states, and verification steps. Do not write files until changes are reviewable.", builtIn: true
  },
  {
    id: "create-project", title: "Create a project here", area: "build", icon: "project",
    description: "Plan a new project within the selected folder, then prepare a multi-file diff.", variables: ["project_name", "stack"],
    template: "Create {{project_name}} in this workspace with {{stack}}. Start with a short architecture and file map. Generate only the files needed for a working first version. Include local run instructions and tests where practical. Return a reviewable multi-file change set.", builtIn: true
  },
  {
    id: "debug-verify", title: "Debug and verify", area: "build", icon: "debug",
    description: "Narrow a defect, propose the least risky fix, and show how to prove it.", variables: ["symptom"],
    template: "Debug this issue: {{symptom}}. Inspect the most relevant code first. State the likely root cause and confidence, propose the smallest safe fix, then give concrete verification commands or test cases. Never apply edits or execute commands without approval.", builtIn: true
  },
  {
    id: "explain-codebase", title: "Explain this codebase", area: "learn", icon: "explain",
    description: "Make a codebase understandable without drowning the reader in detail.", variables: ["focus"],
    template: "Explain this codebase with a focus on {{focus}}. Identify entry points, data flow, key modules, and the safest place to make a change. Use simple language, cite relevant local files, and end with three useful next questions.", builtIn: true
  },
  {
    id: "research-sources", title: "Research with sources", area: "research", icon: "research",
    description: "Create a compact research brief, with web use left to the user.", variables: ["question"],
    template: "Research {{question}}. Separate facts from inferences, compare the strongest viewpoints, call out uncertainty, and provide a concise decision-ready summary. Only use web sources if the user has explicitly enabled them.", builtIn: true
  },
  {
    id: "learn-topic", title: "Learn a topic", area: "learn", icon: "learn",
    description: "Build understanding from first principles with examples and practice.", variables: ["topic", "level"],
    template: "Teach {{topic}} at a {{level}} level. Start with an intuition, build to the important technical details, show a practical example, then finish with a short exercise and answer key. Adapt examples to the current workspace when useful.", builtIn: true
  },
  {
    id: "security-review", title: "Review security", area: "build", icon: "security",
    description: "Review a bounded surface for realistic security risks and fixes.", variables: ["surface"],
    template: "Perform a practical security review of {{surface}}. Identify attack surface, secret handling, authorization, input validation, dependency, and data-exfiltration risks. Rank findings by impact and likelihood. Suggest focused remediations, but do not modify anything automatically.", builtIn: true
  }
];

function expandPlaybook(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => values[key]?.trim() || `[${key.replace(/_/g, " ")}]`);
}

function normalizeProvider(value: unknown): CenroProvider {
  const provider = value as Omit<Partial<CenroProvider>, "kind"> & { label?: string; baseUrl?: string; hasApiKey?: boolean; kind?: string; pricing?: ProviderPricing };
  return {
    id: provider.id ?? crypto.randomUUID(),
    name: provider.name ?? provider.label ?? "Provider",
    kind: provider.kind === "anthropic" ? "anthropic" : provider.kind === "compatible" || provider.kind === "openai-compatible" ? "compatible" : "openai",
    endpoint: provider.endpoint ?? provider.baseUrl,
    model: provider.model,
    enabled: provider.enabled !== false,
    configured: provider.configured ?? provider.hasApiKey,
    pricing: provider.pricing
  };
}

function normalizePlaybook(value: unknown): Playbook {
  const source = value as Omit<Partial<Playbook>, "variables"> & { name?: string; category?: string; variables?: Array<string | { name?: string }>; builtIn?: boolean; baseId?: string };
  const category = source.area ?? (source.category === "research" ? "research" : source.category === "learn" || source.category === "explain" ? "learn" : "build");
  const icon: Playbook["icon"] = source.category === "debug" ? "debug" : source.category === "security" ? "security" : source.category === "research" ? "research" : source.category === "learn" ? "learn" : source.category === "explain" ? "explain" : source.id === "create-project" ? "project" : "build";
  return {
    id: source.id ?? `local-${crypto.randomUUID()}`,
    title: source.title ?? source.name ?? "Untitled playbook",
    description: source.description ?? "A local Cenro prompt brief.",
    area: category,
    template: source.template ?? "",
    variables: Array.isArray(source.variables) ? source.variables.map((variable) => typeof variable === "string" ? variable : variable.name ?? "").filter(Boolean) : [],
    icon,
    builtIn: source.builtIn ?? !(source.id?.startsWith("custom-") || source.id?.startsWith("local-")),
    baseId: source.baseId
  };
}

function isBuiltInPlaybook(playbook: Playbook) {
  return playbook.builtIn === true || (!playbook.id.startsWith("custom-") && !playbook.id.startsWith("local-"));
}

function normalizeRouteReceipt(value: unknown, fallback: RouteReceipt): RouteReceipt {
  const source = value as Partial<RouteReceipt> & { providerId?: string; playbookId?: string; dataBoundary?: { workspaceFiles?: Array<{ relativePath?: string; characters?: number }>; workspaceCharacters?: number; secretLookingFilesExcluded?: boolean; webSearchWillReceivePrompt?: boolean } };
  const files = source.dataBoundary?.workspaceFiles?.map((file) => file.relativePath ?? "workspace file").filter(Boolean) ?? [];
  const workerModel = source.workerModel ?? fallback.workerModel;
  return {
    ...fallback,
    ...source,
    id: source.id ?? source.routeReceiptId ?? fallback.id,
    routeReceiptId: source.id ?? source.routeReceiptId ?? fallback.routeReceiptId,
    route: source.route === "cloud" ? "cloud" : "local",
    workerModel,
    provider: source.provider ?? source.providerId ?? fallback.provider,
    playbook: source.playbook ?? source.playbookId ?? fallback.playbook,
    confidence: typeof source.confidence === "number" ? source.confidence : fallback.confidence,
    dataBoundary: {
      files,
      characterCount: source.dataBoundary?.workspaceCharacters ?? 0,
      note: source.dataBoundary?.secretLookingFilesExcluded ? "Secret-looking files are excluded. Review the selected workspace paths before sharing context." : fallback.dataBoundary?.note
    }
  };
}

function playbookIcon(icon: Playbook["icon"]) {
  if (icon === "research") return Search;
  if (icon === "learn") return BookOpen;
  if (icon === "security") return ShieldCheck;
  if (icon === "debug") return Activity;
  if (icon === "explain") return BrainCircuit;
  if (icon === "project") return FolderOpen;
  return WandSparkles;
}

function formatSize(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function formatTime(value?: string) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function shortTitle(value: string, limit = 56) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function localCouncilReceipt(council?: GatewayLocalCouncil) {
  if (!council) return undefined;
  const localRoles = council.stages.filter((stage) => stage.source === "local").length;
  const criteria = council.summary.acceptanceCriteria.slice(0, 2).join("; ");
  const outcome = council.status === "completed"
    ? `${localRoles}/${council.stages.length} sequential role${council.stages.length === 1 ? "" : "s"} completed locally`
    : `${localRoles}/${council.stages.length} local role${council.stages.length === 1 ? "" : "s"}; metadata-only fallback retained`;
  return {
    name: "Local project understanding",
    status: council.status === "completed" ? "complete" as const : "skipped" as const,
    detail: `${outcome} · ${council.localCallsAttempted} local call${council.localCallsAttempted === 1 ? "" : "s"} · no source code sent to local analysis.${criteria ? ` Focus: ${shortTitle(criteria, 180)}` : ""}`
  };
}

type ContextEngineRecommendation = {
  headline: string;
  detail: string;
  primaryModel: string;
  recommendedRoles: Array<"router" | "builder" | "research">;
};

/**
 * Cenro's local model is a bounded context engine, not a second cloud-sized
 * coding stack. Keep this conservative: RAM is a reliable cross-platform
 * signal before asking someone to download a model.
 */
function contextEngineRecommendation(system?: { memoryGb: number; cores: number }): ContextEngineRecommendation {
  const memoryGb = system?.memoryGb ?? 0;
  if (memoryGb > 0 && memoryGb < 8) {
    return {
      headline: "Lean context kit for this PC.",
      detail: "Download the small router only. It can classify requests, select likely files, and prepare a compact context brief before a cloud coding run.",
      primaryModel: "qwen3:1.7b",
      recommendedRoles: ["router"]
    };
  }
  if (memoryGb < 16) {
    return {
      headline: "Best fit: a small local context engine.",
      detail: "Start with the router for local file triage and context compression. Keep coding in your selected cloud provider; the local coder is an optional offline fallback.",
      primaryModel: "qwen3:1.7b",
      recommendedRoles: ["router"]
    };
  }
  return {
    headline: "Balanced local context kit.",
    detail: "Use the router plus a small context analyst for deeper local codebase summaries. Cenro runs them sequentially before handing a concise brief to a cloud worker.",
    primaryModel: "qwen3:1.7b + qwen3:4b",
    recommendedRoles: ["router", "research"]
  };
}

function initialArea(view: View): Area {
  return view === "learn" ? "learn" : view === "build" ? "build" : "research";
}

function languageForPath(relativePath?: string) {
  const extension = relativePath?.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    json: "json", jsonc: "json", html: "html", htm: "html", css: "css", scss: "scss", md: "markdown", mdx: "markdown",
    py: "python", go: "go", rs: "rust", java: "java", cs: "csharp", sql: "sql", yml: "yaml", yaml: "yaml", xml: "xml", sh: "shell", ps1: "powershell",
    svg: "xml", vue: "html", svelte: "html", astro: "html"
  };
  return extension ? languages[extension] ?? "plaintext" : "plaintext";
}

export function App() {
  const [view, setView] = useState<View>("workspace");
  const [area, setArea] = useState<Area>("build");
  const [mode, setMode] = useState<Mode>("smart");
  const [useWeb, setUseWeb] = useState(false);
  const [workspacePath, setWorkspacePath] = useState<string>();
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>();
  const [openTabs, setOpenTabs] = useState<CodeTab[]>([]);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ relativePath: string; snippet: string; score: number }>>([]);
  const [newFileName, setNewFileName] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [git, setGit] = useState<RelayGitSnapshot>();
  const [ollama, setOllama] = useState<{ connected: boolean; models: OllamaModel[] }>({ connected: false, models: [] });
  const [selectedModel, setSelectedModel] = useState("");
  const [modelRoles, setModelRoles] = useState<ModelRoles>({ routerModel: "", builderModel: "", researchModel: "" });
  const [modelRolesLoaded, setModelRolesLoaded] = useState(false);
  const [newModel, setNewModel] = useState("qwen2.5-coder:3b");
  const [pulls, setPulls] = useState<Record<string, PullProgress>>({});
  const [system, setSystem] = useState<{ memoryGb: number; cores: number; platform: string; architecture: string }>();
  const [onboarding, setOnboarding] = useState(false);
  const [composer, setComposer] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [tasks, setTasks] = useState<RelayTaskRecord[]>([]);
  const [activeTask, setActiveTask] = useState<RelayTaskRecord>();
  const [editPrompt, setEditPrompt] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editProposal, setEditProposal] = useState<RelayEditProposal>();
  const [isProposingEdit, setIsProposingEdit] = useState(false);
  const [chatMessages, setChatMessages] = useState<RelayChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>("chat");
  const [projectPrompt, setProjectPrompt] = useState("");
  const [projectProposal, setProjectProposal] = useState<RelayProjectProposal>();
  const [selectedProjectPaths, setSelectedProjectPaths] = useState<string[]>([]);
  const [selectedChangePath, setSelectedChangePath] = useState<string>();
  const [isProposingProject, setIsProposingProject] = useState(false);
  const [isApplyingProject, setIsApplyingProject] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [playbooks, setPlaybooks] = useState<Playbook[]>(defaultPlaybooks);
  const [activePlaybookId, setActivePlaybookId] = useState(defaultPlaybooks[0].id);
  const [playbookValues, setPlaybookValues] = useState<Record<string, string>>({});
  const [editingPlaybook, setEditingPlaybook] = useState(false);
  const [isDuplicatingPlaybook, setIsDuplicatingPlaybook] = useState(false);
  const [teamEnabled, setTeamEnabled] = useState(false);
  const [routeReceipt, setRouteReceipt] = useState<RouteReceipt>();
  const [pendingTask, setPendingTask] = useState<PendingTask>();
  const [isRouting, setIsRouting] = useState(false);
  const [providers, setProviders] = useState<CenroProvider[]>([]);
  const [providerDraft, setProviderDraft] = useState<CenroProvider>({ id: "", name: "OpenAI", kind: "openai", model: "gpt-4.1", enabled: true });
  // Write-only input: provider keys must never enter React state, history, or task records.
  const providerSecretInputRef = useRef<HTMLInputElement>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState("");
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalSession, setTerminalSession] = useState<string>();
  const [terminalProposal, setTerminalProposal] = useState<TerminalProposal>();
  const [gatewaySnapshot, setGatewaySnapshot] = useState<GatewaySnapshot>();
  const [gatewaySnapshotBusy, setGatewaySnapshotBusy] = useState(false);
  const [gatewayHandoff, setGatewayHandoff] = useState<GatewayHandoff>();
  const [studioMode, setStudioMode] = useState<StudioMode>("plan");
  const [studioPlan, setStudioPlan] = useState<StudioPlan>();
  const [studioPlanning, setStudioPlanning] = useState(false);
  const [studioSidePanel, setStudioSidePanel] = useState<StudioSidePanel>("plan");
  const [studioContextPaths, setStudioContextPaths] = useState<string[]>([]);
  const [studioMenu, setStudioMenu] = useState<"context" | "playbooks">();
  const [studioWeb, setStudioWeb] = useState(false);
  const [studioProviderId, setStudioProviderId] = useState("");
  const [studioWebResearch, setStudioWebResearch] = useState<GatewayWebResearch>();
  const [studioWebResearchDraft, setStudioWebResearchDraft] = useState<{ contextPackId: string; query: string }>();
  const [studioWebResearchBusy, setStudioWebResearchBusy] = useState(false);
  const [studioDock, setStudioDock] = useState<StudioDock>();

  const workspaceName = workspacePath?.split(/[/\\]/).pop() ?? "No workspace selected";
  const activeArea = view === "research" || view === "learn" || view === "build" ? initialArea(view) : area;
  const activeModel = (selectedModel && ollama.models.some((model) => model.name === selectedModel) ? selectedModel : undefined)
    ?? (modelRoles.builderModel && ollama.models.some((model) => model.name === modelRoles.builderModel) ? modelRoles.builderModel : undefined)
    ?? ollama.models[0]?.name
    ?? "";
  const sourceCount = activeTask?.sources.length ?? 0;
  const activeTab = useMemo(() => openTabs.find((tab) => tab.relativePath === selectedFile), [openTabs, selectedFile]);
  const fileContent = activeTab?.content ?? "";
  const fileUpdatedAt = activeTab?.updatedAt;
  const fileDirty = activeTab?.dirty ?? false;
  const activePlaybook = playbooks.find((playbook) => playbook.id === activePlaybookId) ?? playbooks[0];
  const qualityProviders = providers.filter((provider) => provider.enabled && provider.configured !== false);
  const studioProvider = qualityProviders.find((provider) => provider.id === studioProviderId) ?? qualityProviders[0];
  const kitInstalled = {
    router: ollama.models.some((model) => model.name.startsWith("qwen3:1.7b")),
    builder: ollama.models.some((model) => model.name.startsWith("qwen2.5-coder:3b")),
    research: ollama.models.some((model) => model.name.startsWith("qwen3:4b"))
  };

  async function refreshOllama() {
    const result = await window.relay.getOllamaStatus();
    setOllama(result);
    setSelectedModel((current) => result.models.some((model) => model.name === current)
      ? current
      : result.models.find((model) => model.name === modelRoles.builderModel)?.name ?? result.models[0]?.name ?? "");
    return result;
  }

  async function refreshGatewaySnapshot(root = workspacePath) {
    if (!root || !window.cenro?.getContextGatewaySnapshot) {
      setGatewaySnapshot(undefined);
      return;
    }
    setGatewaySnapshotBusy(true);
    try {
      const snapshot = await window.cenro.getContextGatewaySnapshot({
        workspacePath: root,
        prompt: composer.trim() || undefined,
        selectedFile: selectedFile || undefined
      }) as GatewaySnapshot;
      setGatewaySnapshot(snapshot);
    } catch (reason) {
      setGatewaySnapshot({ indexState: "unavailable" });
      setNotice(reason instanceof Error ? `Context engine is still preparing: ${reason.message}` : "Context engine is still preparing in this build.");
    } finally {
      setGatewaySnapshotBusy(false);
    }
  }

  async function loadWorkspace(root: string) {
    const entries = await window.relay.scanWorkspace(root);
    setWorkspacePath(root);
    setWorkspaceFiles(entries);
    setSelectedFile(undefined);
    setOpenTabs([]);
    setSearchResults([]);
    setProjectProposal(undefined);
    setSelectedProjectPaths([]);
    setSelectedChangePath(undefined);
    try { setGit(await window.relay.getGitSnapshot()); } catch { setGit({ available: false, changedFiles: [], message: "Git status could not be read." }); }
    void refreshGatewaySnapshot(root);
  }

  useEffect(() => {
    void Promise.all([
      refreshOllama(),
      window.relay.getSystemProfile().then(setSystem),
      window.relay.listTasks().then((items) => {
        setTasks(items);
        setActiveTask(items[0]);
      }),
      window.relay.getSettings().then((settings) => {
        setOnboarding(!settings.onboardingComplete);
        if (settings.workspacePath) void loadWorkspace(settings.workspacePath).catch(() => setNotice("The last workspace is unavailable. Choose a folder to continue."));
      }),
      (async () => {
        try {
          const value = await window.cenro?.getSettings?.();
          if (!value || typeof value !== "object") return;
          const settings = value as Partial<ModelRoles>;
          setModelRoles({
            routerModel: typeof settings.routerModel === "string" ? settings.routerModel : "",
            builderModel: typeof settings.builderModel === "string" ? settings.builderModel : "",
            researchModel: typeof settings.researchModel === "string" ? settings.researchModel : ""
          });
        } finally {
          setModelRolesLoaded(true);
        }
      })()
    ]).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Cenro could not finish loading."));

    return window.relay.onOllamaProgress((event) => {
      setPulls((current) => ({ ...current, [event.model]: { line: event.line, status: event.status } }));
      if (event.status !== "running") void refreshOllama();
    });
  }, []);

  useEffect(() => {
    if (!modelRolesLoaded || !ollama.models.length) return;
    const available = ollama.models.map((model) => model.name);
    const firstMatching = (pattern: RegExp) => available.find((model) => pattern.test(model));
    const keepIfAvailable = (model: string) => available.includes(model) ? model : "";
    const recommended: ModelRoles = {
      routerModel: keepIfAvailable(modelRoles.routerModel) || firstMatching(/^qwen3:1\.7b/i) || available[0],
      builderModel: keepIfAvailable(modelRoles.builderModel) || firstMatching(/(?:qwen2\.5-)?coder/i) || available[0],
      researchModel: keepIfAvailable(modelRoles.researchModel) || firstMatching(/^qwen3:4b/i) || ""
    };
    const rolesChanged = recommended.routerModel !== modelRoles.routerModel
      || recommended.builderModel !== modelRoles.builderModel
      || recommended.researchModel !== modelRoles.researchModel;
    if (rolesChanged) {
      setModelRoles(recommended);
      void window.cenro?.updateSettings?.(recommended)?.catch(() => undefined);
    }
    setSelectedModel((current) => {
      if (!current || !available.includes(current) || (current === recommended.routerModel && recommended.builderModel !== current)) return recommended.builderModel;
      return current;
    });
  }, [modelRolesLoaded, modelRoles.builderModel, modelRoles.researchModel, modelRoles.routerModel, ollama.models]);

  useEffect(() => {
    let disposed = false;
    try {
      const cached = window.localStorage.getItem("cenro.playbooks.v1");
      if (cached) {
        const parsed = JSON.parse(cached) as Playbook[];
        if (Array.isArray(parsed) && parsed.length) setPlaybooks(parsed);
      }
    } catch { /* A malformed local preference should never block the workspace. */ }

    void window.cenro?.listPlaybooks?.().then((items) => {
      if (!disposed && items.length) setPlaybooks(items.map((item) => normalizePlaybook(item)));
    }).catch(() => undefined);
    void window.cenro?.listProviders?.().then((items) => {
      if (!disposed) setProviders(items.map((item) => normalizeProvider(item)));
    }).catch(() => undefined);

    const stopListening = window.cenro?.onTerminalData?.((event) => {
      if (disposed) return;
      setTerminalOutput((current) => [...current, event.data].slice(-350));
    });
    const stopExitListening = window.cenro?.onTerminalExit?.(() => {
      if (!disposed) setTerminalRunning(false);
    });
    const stopCommandOutput = window.cenro?.onTerminalCommandOutput?.((event) => {
      if (disposed || !event || typeof event !== "object") return;
      const output = event as { data?: unknown; error?: unknown; done?: unknown; code?: unknown };
      const text = typeof output.data === "string" ? output.data : typeof output.error === "string" ? `\r\n[Cenro command error: ${output.error}]\r\n` : output.done ? `\r\n[Reviewed command finished${typeof output.code === "number" ? ` with code ${output.code}` : ""}.]\r\n` : "";
      if (text) setTerminalOutput((current) => [...current, text].slice(-350));
    });
    return () => {
      disposed = true;
      stopListening?.();
      stopExitListening?.();
      stopCommandOutput?.();
    };
  }, []);

  function setModelRole(role: keyof ModelRoles, model: string) {
    const value = model.trim();
    setModelRoles((current) => ({ ...current, [role]: value }));
    if (role === "builderModel") setSelectedModel(value);
    void window.cenro?.updateSettings?.({ [role]: value }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Cenro could not save this model role.");
    });
  }

  useEffect(() => {
    if (view === "research" || view === "learn" || view === "build") setArea(initialArea(view));
  }, [view]);

  async function chooseWorkspace() {
    try {
      const root = await window.relay.chooseWorkspace();
      if (!root) return;
      await loadWorkspace(root);
      setNotice(`Workspace connected: ${root.split(/[/\\]/).pop()}`);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open this workspace.");
    }
  }

  async function openFile(relativePath: string) {
    try {
      const existing = openTabs.find((tab) => tab.relativePath === relativePath);
      if (existing) {
        setSelectedFile(existing.relativePath);
        setEditTarget(existing.relativePath);
        setView("workspace");
        return;
      }
      const file = await window.relay.readWorkspaceFile(relativePath);
      setSelectedFile(file.relativePath);
      setEditTarget(file.relativePath);
      setOpenTabs((current) => [...current, { relativePath: file.relativePath, content: file.content, baseContent: file.content, updatedAt: file.updatedAt, dirty: false }]);
      setError(undefined);
      setView("workspace");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not open that file.");
    }
  }

  async function saveFile() {
    if (!activeTab) return;
    try {
      const saved = await window.relay.writeWorkspaceFile(activeTab.relativePath, activeTab.content);
      setOpenTabs((current) => current.map((tab) => tab.relativePath === saved.relativePath
        ? { ...tab, content: saved.content, baseContent: saved.content, updatedAt: saved.updatedAt, dirty: false }
        : tab));
      setNotice(`Saved ${saved.relativePath}`);
      setError(undefined);
      if (workspacePath) setWorkspaceFiles(await window.relay.scanWorkspace(workspacePath));
      try { setGit(await window.relay.getGitSnapshot()); } catch { /* Git is optional. */ }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not save that file.");
    }
  }

  async function createFile(event: FormEvent) {
    event.preventDefault();
    const target = newFileName.trim().replace(/^[/\\]+/, "");
    if (!target) return;
    try {
      const saved = await window.relay.writeWorkspaceFile(target, "");
      setNewFileName("");
      setCreatingFile(false);
      if (workspacePath) setWorkspaceFiles(await window.relay.scanWorkspace(workspacePath));
      await openFile(saved.relativePath);
      setNotice(`Created ${saved.relativePath}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not create that file.");
    }
  }

  async function searchFiles(event: FormEvent) {
    event.preventDefault();
    if (!workspaceSearch.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      setSearchResults(await window.relay.searchWorkspace(workspaceSearch));
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search failed.");
    }
  }

  function rememberTask(task: RelayTaskRecord, targetArea: Area) {
    setActiveTask(task);
    setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
    setView(targetArea);
  }

  async function executeApprovedTask(request: PendingTask, receipt?: RouteReceipt, includeWorkspace = false) {
    setError(undefined);
    setNotice(undefined);
    setIsRunning(true);
    try {
      let task: RelayTaskRecord;
      let reviewedTerminalProposal: TerminalProposal | undefined;
      if (request.team && window.cenro?.runTeamWorkflow) {
        const team = await window.cenro.runTeamWorkflow({ prompt: request.prompt, model: request.model, stages: ["researcher", "planner", "builder", "reviewer"], playbookId: request.playbookId, playbookValues }) as { model?: string; finalOutput?: string; stages?: Array<{ stage?: string; startedAt?: string; completedAt?: string }> };
        task = {
          id: `team-${Date.now()}`,
          title: `Team workflow: ${shortTitle(request.prompt, 56)}`,
          prompt: request.prompt,
          mode: "smart",
          area: request.area,
          model: team.model ?? request.model,
          status: "complete",
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          response: team.finalOutput ?? "The local team workflow completed without a final response.",
          sources: [],
          actions: (team.stages ?? []).map((stage) => ({ name: stage.stage ?? "team-stage", status: "complete" as const, detail: "Completed sequentially on the selected local model." }))
        };
      } else if ((request.mode === "smart" || request.mode === "cloud") && window.cenro?.executeSmartTask) {
        const result = await window.cenro.executeSmartTask({
          prompt: request.prompt,
          area: request.area,
          receiptId: receipt?.id ?? receipt?.routeReceiptId ?? "",
          externalConsent: receipt?.requiresExternalConsent ? { approved: true, includeWorkspace, allowWeb: request.useWeb } : undefined
        }) as { task?: RelayTaskRecord; terminalProposal?: TerminalProposal };
        if (!result.task) throw new Error("Cenro did not return a task after Smart Switch execution.");
        task = result.task;
        reviewedTerminalProposal = result.terminalProposal;
      } else {
        task = await window.relay.runTask({ prompt: request.prompt, model: request.model, mode: request.mode === "cloud" ? "smart" : request.mode, area: request.area, useWeb: request.useWeb });
      }
      rememberTask(task, request.area);
      if (reviewedTerminalProposal) {
        setTerminalProposal(reviewedTerminalProposal);
        setNotice("Cenro prepared a command for review. Nothing ran—review it in Terminal.");
        setView("terminal");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not complete that task.");
    } finally {
      setIsRunning(false);
    }
  }

  async function requestSmartRoute(request: PendingTask) {
    setIsRouting(true);
    setError(undefined);
    try {
      let recommendation: RouteReceipt = {
        route: "local",
        workerModel: request.model,
        playbook: request.playbookId,
        requestedTools: request.useWeb ? ["web-search"] : [],
        confidence: 0,
        reason: "Smart Switch is unavailable, so Cenro will keep this task on the selected local model.",
        requiresExternalConsent: false,
        dataBoundary: { files: [], characterCount: 0, note: "No workspace code was sent to the router." }
      };
      if (window.cenro?.getSmartRecommendation) {
        const raw = await window.cenro.getSmartRecommendation({ prompt: request.prompt, area: request.area, requestedPlaybookId: request.playbookId, preferredWorkerModel: request.model || undefined, preferredProviderId: request.mode === "cloud" ? providers.find((provider) => provider.enabled && provider.configured !== false)?.id : undefined, forceRoute: request.team ? "local" : request.mode === "cloud" ? "cloud" : undefined, allowWeb: request.useWeb });
        recommendation = normalizeRouteReceipt(raw, recommendation);
        if (recommendation.provider) recommendation = { ...recommendation, provider: providers.find((provider) => provider.id === recommendation.provider)?.name ?? recommendation.provider };
      }
      if (request.mode === "cloud" && !providers.some((provider) => provider.enabled && provider.configured !== false)) {
        throw new Error("Configure and enable a cloud provider in Settings before choosing Cloud.");
      }
      setPendingTask(request);
      setRouteReceipt(recommendation);
      setComposer("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not prepare a route receipt.");
    } finally {
      setIsRouting(false);
    }
  }

  /**
   * The Gateway is deliberately a different route from the legacy Smart
   * Switch. It first creates a local, redacted Context Pack, then renders an
   * immutable cloud receipt. No network call is made in this function.
   */
  async function requestGatewayHandoff(request: PendingTask, provider: CenroProvider, webResearchId?: string, preparedAnalysis?: GatewayAnalysis) {
    if (!window.cenro?.analyzeGatewayContext || !window.cenro.createGatewayRun) {
      await requestSmartRoute(request);
      return;
    }
    setIsRouting(true);
    setError(undefined);
    try {
      const analysis = preparedAnalysis ?? await window.cenro.analyzeGatewayContext({
        prompt: request.prompt,
        providerId: provider.id
      }) as GatewayAnalysis;
      const receipt = await window.cenro.createGatewayRun({
        prompt: request.prompt,
        contextPackId: analysis.contextPackId,
        providerId: provider.id,
        ...(webResearchId ? { webResearchId } : {}),
        maxOutputTokens: analysis.costPreflight.maxOutputTokens
      }) as GatewayRunReceipt;
      setGatewayHandoff({ request, analysis, receipt });
      setComposer("");
      void refreshGatewaySnapshot();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not prepare the Context Gateway handoff.");
    } finally {
      setIsRouting(false);
    }
  }

  async function approveGatewayHandoff() {
    const handoff = gatewayHandoff;
    if (!handoff || !window.cenro?.approveGatewayRun) return;
    setGatewayHandoff(undefined);
    setIsRunning(true);
    setError(undefined);
    try {
      const result = await window.cenro.approveGatewayRun({
        runId: handoff.receipt.runId,
        approved: true,
        includeWorkspace: true
      });
      if (result.status !== "completed" || !result.response) throw new Error(result.error || "The cloud lead did not return an implementation response.");
      const reviewProposal: RelayProjectProposal | undefined = result.proposalStatus === "review-ready" && result.proposal
        ? { summary: result.proposal.summary, files: result.proposal.files.map(({ reason: _reason, ...file }) => file) }
        : undefined;
      const councilAction = localCouncilReceipt(handoff.analysis.localCouncil);
      const usageSummary = result.usage?.totalTokens
        ? `${formatCompactNumber(result.usage.totalTokens)} provider-reported tokens`
        : "Provider usage was not returned; the ledger keeps the preflight estimate separate.";
      const task: RelayTaskRecord = {
        id: `gateway-${result.runId}`,
        title: `Gateway lead: ${shortTitle(handoff.request.prompt, 56)}`,
        prompt: handoff.request.prompt,
        mode: "cloud",
        area: handoff.request.area,
        model: result.model,
        status: "complete",
        createdAt: handoff.receipt.createdAt,
        completedAt: new Date().toISOString(),
        response: result.response,
        sources: handoff.receipt.dataBoundary.selectedFiles.map((file) => ({
          id: `gateway-source-${file.relativePath}`,
          type: "workspace" as const,
          title: file.relativePath,
          location: file.relativePath,
          excerpt: `${file.characters.toLocaleString()} redacted characters · ${file.estimatedTokens.toLocaleString()} estimated tokens${file.redactions ? ` · ${file.redactions} redaction${file.redactions === 1 ? "" : "s"}` : ""}`
        })),
        actions: [
          { name: "Local Context Gateway", status: "complete", detail: `${handoff.analysis.repository.scannedFileCount} local files mapped; ${handoff.analysis.selectedFiles.length} evidence slices prepared.` },
          ...(councilAction ? [councilAction] : []),
          { name: "Cloud lead", status: "complete", detail: `${handoff.receipt.provider.label} · ${result.model} ran only after the reviewed receipt was approved.` },
          ...(reviewProposal ? [{ name: "Review-only patch", status: "complete" as const, detail: `${reviewProposal.files.filter((file) => file.changed).length} change${reviewProposal.files.filter((file) => file.changed).length === 1 ? "" : "s"} prepared for explicit file review; no files were applied.` }] : []),
          { name: "Cost ledger", status: "complete", detail: usageSummary }
        ],
        metadata: { workspacePath, localOnly: false }
      };
      setActiveTask(task);
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      if (reviewProposal) {
        const changed = reviewProposal.files.filter((file) => file.changed);
        setProjectProposal(reviewProposal);
        setSelectedProjectPaths(changed.map((file) => file.path));
        setSelectedChangePath(changed[0]?.path ?? reviewProposal.files[0]?.path);
        setWorkspacePanel("changes");
        setStudioSidePanel("changes");
        setNotice(`Cenro prepared ${changed.length} cloud-proposed file${changed.length === 1 ? "" : "s"} for review. Nothing was applied.`);
        setView("workspace");
      } else {
        setNotice("The cloud lead returned an implementation brief. Review it, then use Files to create or apply only the changes you approve.");
        setView("build");
      }
      void refreshGatewaySnapshot();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not complete the approved Gateway run.");
    } finally {
      setIsRunning(false);
    }
  }

  async function runTask(event: FormEvent) {
    event.preventDefault();
    const prompt = composer.trim();
    if (!prompt || isRunning || isRouting) return;
    const gatewayProvider = view === "workspace" && !teamEnabled && (mode === "smart" || mode === "cloud")
      ? providers.find((provider) => provider.enabled && provider.configured !== false)
      : undefined;
    const canUseGatewayWithoutLocalModel = Boolean(gatewayProvider && window.cenro?.analyzeGatewayContext && window.cenro?.createGatewayRun);
    if (!activeModel && !canUseGatewayWithoutLocalModel && (mode !== "cloud" || teamEnabled)) {
      setError("Install or select a local worker model before running a task. Smart Switch also needs a local Ollama model to make a private route decision.");
      setView("settings");
      return;
    }
    const effectiveMode: Mode = teamEnabled ? "local" : mode;
    const request: PendingTask = { prompt, model: activeModel, mode: effectiveMode, area: activeArea, useWeb: !teamEnabled && effectiveMode === "smart" && useWeb, team: teamEnabled, playbookId: activePlaybook?.id };
    if (gatewayProvider && (effectiveMode === "smart" || effectiveMode === "cloud")) {
      await requestGatewayHandoff(request, gatewayProvider);
      return;
    }
    if (effectiveMode === "smart" || effectiveMode === "cloud" || teamEnabled) {
      await requestSmartRoute(request);
      return;
    }
    setComposer("");
    await executeApprovedTask(request);
  }

  function studioPromptWithPins(prompt = composer.trim()) {
    const pinned = studioContextPaths.length ? `\n\nPinned workspace context (prioritize only if relevant): ${studioContextPaths.join(", ")}` : "";
    const modeInstruction: Record<StudioMode, string> = {
      plan: "First produce an implementation plan. Do not write files until the plan is approved.",
      build: "Implement the approved plan as a small, reviewable change set. Do not apply files automatically.",
      polish: "Assess visual hierarchy, interaction quality, accessibility, and responsive behavior before proposing changes.",
      debug: "Trace the likely failing path, state confidence, and propose the smallest verifiable repair.",
      review: "Review the relevant implementation for correctness, edge cases, security, and maintainability before proposing changes.",
      ask: "Answer concisely using only relevant workspace evidence, and identify uncertainty clearly."
    };
    return `${prompt}\n\nWorking mode: ${studioMode}. ${modeInstruction[studioMode]}${pinned}`;
  }

  async function prepareStudioPlan() {
    const prompt = composer.trim();
    if (!prompt || studioPlanning || isRouting) return;
    setStudioPlanning(true);
    setError(undefined);
    try {
      const gatewayPrompt = studioPromptWithPins();
      let analysis: GatewayAnalysis | undefined;
      if (workspacePath && window.cenro?.analyzeGatewayContext) {
        try {
          analysis = await window.cenro.analyzeGatewayContext({
            prompt: gatewayPrompt,
            providerId: studioProvider?.id
          }) as GatewayAnalysis;
        } catch (reason) {
          setNotice(reason instanceof Error ? `Plan created without local project analysis: ${reason.message}` : "Plan created from workspace metadata; local project analysis was unavailable.");
        }
      }
      const selected = analysis?.selectedFiles ?? workspaceFiles.filter((entry) => entry.kind === "file" && (studioContextPaths.includes(entry.relativePath) || entry.relativePath === selectedFile)).slice(0, 6).map((entry) => ({
        relativePath: entry.relativePath,
        whySelected: entry.relativePath === selectedFile ? ["Currently open file"] : ["Pinned workspace context"],
        characters: undefined
      }));
      const councilAcceptance = analysis?.localCouncil?.summary.acceptanceCriteria?.filter(Boolean) ?? [];
      const modePlan: Record<StudioMode, { diagnosis: string[]; direction: string[]; acceptance: string[] }> = {
        plan: {
          diagnosis: ["Clarify the intended outcome and the smallest coherent surface area.", "Map only the modules that can influence this change before asking the cloud lead to write code."],
          direction: ["Preserve existing conventions unless the plan explicitly calls for a new foundation.", "Produce a reviewable file-by-file proposal, then verify the happy path and one failure path."],
          acceptance: ["The approach is understandable before code is generated.", "Every changed file has a reason and a verification step."]
        },
        build: {
          diagnosis: ["Translate the approved outcome into a bounded file change set.", "Avoid broad refactors unless the repository evidence makes them necessary."],
          direction: ["Ask the quality lead for implementation only after this plan is approved.", "Keep all changes in review until the user explicitly applies selected files."],
          acceptance: ["The feature works from a clean local run.", "The proposed diff is minimal, readable, and testable."]
        },
        polish: {
          diagnosis: ["Inspect visual hierarchy, empty states, feedback, and responsive behavior.", "Separate cosmetic changes from product-flow improvements so the build stays deliberate."],
          direction: ["Improve hierarchy with spacing and typography before adding decoration.", "Define loading, error, keyboard, and compact-width behavior before implementation."],
          acceptance: ["The primary action is obvious at a glance.", "The interface stays coherent at compact widths and with keyboard navigation."]
        },
        debug: {
          diagnosis: ["Trace the smallest path that can reproduce the reported behavior.", "Distinguish the observed symptom from the probable root cause."],
          direction: ["Prefer the smallest safe repair over a rewrite.", "Pair the repair with a concrete check that would have caught the regression."],
          acceptance: ["The reported case is covered by a reproducible verification step.", "The fix does not silently change adjacent behavior."]
        },
        review: {
          diagnosis: ["Identify the change surface and the assumptions it depends on.", "Check error paths, data boundaries, and maintainability—not just the happy path."],
          direction: ["Rank findings by user impact and confidence.", "Turn only high-confidence findings into a focused implementation proposal."],
          acceptance: ["Findings reference a concrete file or behavior.", "Recommendations are actionable and proportionate to the risk."]
        },
        ask: {
          diagnosis: ["Identify the repository evidence needed to answer without guessing.", "Keep discovery separate from a code-changing task."],
          direction: ["Answer from the selected evidence and flag gaps.", "Offer the smallest useful next action rather than inventing implementation work."],
          acceptance: ["The answer names its evidence and uncertainty."]
        }
      };
      const blueprint = modePlan[studioMode];
      setStudioPlan({
        prompt,
        gatewayPrompt,
        mode: studioMode,
        createdAt: new Date().toISOString(),
        analysis,
        diagnosis: blueprint.diagnosis,
        direction: blueprint.direction,
        files: selected.map((file) => ({ path: file.relativePath, reason: file.whySelected[0] ?? "Relevant repository evidence", characters: file.characters })),
        acceptance: Array.from(new Set([...councilAcceptance, ...blueprint.acceptance])).slice(0, 6)
      });
      setStudioWebResearch(undefined);
      setStudioSidePanel("plan");
      setNotice(analysis?.localCouncil?.status === "completed" ? "Local project analysis completed the plan. Review it before building." : "Plan ready. Review it before building.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not prepare a plan.");
    } finally {
      setStudioPlanning(false);
    }
  }

  function proposeStudioWebResearch() {
    const analysis = studioPlan?.analysis;
    if (!analysis) {
      setError("Prepare a local plan before searching the web, so Cenro can keep the search focused.");
      return;
    }
    const terms = analysis.localCouncil?.summary.searchTerms?.slice(0, 4).join(" ");
    const query = `${terms ? `${terms} ` : ""}${studioPlan?.prompt ?? composer}`.replace(/\s+/g, " ").trim().slice(0, 300);
    setStudioWebResearchDraft({ contextPackId: analysis.contextPackId, query });
  }

  async function approveStudioWebResearch(query: string) {
    const draft = studioWebResearchDraft;
    if (!draft || !window.cenro?.researchGatewayWeb || studioWebResearchBusy) return;
    setStudioWebResearchBusy(true);
    setError(undefined);
    try {
      const research = await window.cenro.researchGatewayWeb({ contextPackId: draft.contextPackId, query }) as GatewayWebResearch;
      setStudioWebResearch(research);
      setStudioWebResearchDraft(undefined);
      setNotice(research.sources.length ? `Web research ready: ${research.sources.length} source${research.sources.length === 1 ? "" : "s"}. No workspace code was searched.` : "The web search returned no usable sources. Your plan is still local-only.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not search the web.");
    } finally {
      setStudioWebResearchBusy(false);
    }
  }

  async function buildStudioPlan() {
    if (!studioPlan || studioPlan.prompt !== composer.trim()) {
      await prepareStudioPlan();
      return;
    }
    if (!studioProvider) {
      setError("Connect a quality provider in Settings before building this plan.");
      setView("settings");
      return;
    }
    const request: PendingTask = {
      prompt: studioPlan.gatewayPrompt,
      model: studioProvider.model ?? "configured cloud model",
      mode: "cloud",
      area: "build",
      useWeb: studioWeb,
      team: false,
      playbookId: activePlaybook?.id
    };
    const attachedResearch = studioWebResearch;
    const webResearchId = attachedResearch && attachedResearch.contextPackId === studioPlan.analysis?.contextPackId ? attachedResearch.researchId : undefined;
    await requestGatewayHandoff(request, studioProvider, webResearchId, studioPlan.analysis);
  }

  async function askStudioLocally() {
    const prompt = composer.trim();
    if (!prompt || isChatting) return;
    if (!activeModel) {
      setError("Install or select a local model before using Cenro chat.");
      setView("settings");
      return;
    }
    const userMessage: RelayChatMessage = { role: "user", content: prompt, id: `${Date.now()}-studio-user`, createdAt: new Date().toISOString() };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setComposer("");
    setIsChatting(true);
    setError(undefined);
    try {
      const response = await window.relay.sendLocalChat({
        model: activeModel,
        messages: nextMessages,
        focusedFile: selectedFile ? { relativePath: selectedFile, content: fileContent, language: languageForPath(selectedFile) } : undefined
      });
      setChatMessages((current) => [...current, { role: "assistant", content: response.content, id: `${Date.now()}-studio-assistant`, createdAt: response.createdAt }]);
      setStudioSidePanel("plan");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not answer from the local model.");
    } finally {
      setIsChatting(false);
    }
  }

  async function submitStudioTask(event: FormEvent) {
    event.preventDefault();
    if (studioMode === "ask") await askStudioLocally();
    else if (studioMode === "build") await buildStudioPlan();
    else await prepareStudioPlan();
  }

  async function approveRoute(includeWorkspace: boolean) {
    if (!pendingTask) return;
    const request = pendingTask;
    const receipt = routeReceipt;
    setPendingTask(undefined);
    setRouteReceipt(undefined);
    await executeApprovedTask(request, receipt, includeWorkspace);
  }

  async function pullModel(model = newModel) {
    const candidate = model.trim();
    if (!candidate) return;
    try {
      setPulls((current) => ({ ...current, [candidate]: { line: "Starting download…", status: "running" } }));
      const result = await window.relay.pullOllamaModel(candidate);
      const role = candidate.startsWith("qwen3:1.7b") ? "routerModel" : candidate.startsWith("qwen2.5-coder:3b") ? "builderModel" : candidate.startsWith("qwen3:4b") ? "researchModel" : undefined;
      if (role) setModelRole(role, candidate);
      if (!result.started && result.reason === "already-running") setNotice(`${candidate} is already downloading.`);
      setError(undefined);
    } catch (reason) {
      setPulls((current) => ({ ...current, [candidate]: { line: reason instanceof Error ? reason.message : "Unable to start the download", status: "error" } }));
    }
  }

  async function deleteModel(model: string) {
    if (!window.confirm(`Remove ${model} from Ollama? This deletes the downloaded model from local storage.`)) return;
    try {
      await window.relay.deleteOllamaModel(model);
      await refreshOllama();
      setNotice(`Removed ${model}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not remove that model.");
    }
  }

  async function exportTask(task: RelayTaskRecord) {
    try {
      const result = await window.relay.exportTask(task.id);
      if (!result.saved) return;
      setNotice(`Receipt exported to ${result.path?.split(/[/\\]/).pop() ?? "your chosen file"}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not export that receipt.");
    }
  }

  async function clearHistory() {
    if (!window.confirm("Clear Cenro's saved task history on this device? This cannot be undone.")) return;
    try {
      await window.relay.clearTasks();
      setTasks([]);
      setActiveTask(undefined);
      setNotice("Saved task history cleared.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not clear history.");
    }
  }

  async function proposeEdit() {
    const target = editTarget || selectedFile;
    if (!target) {
      setError("Choose a workspace file before asking Cenro to propose an edit.");
      return;
    }
    if (!editPrompt.trim()) return;
    if (!activeModel) {
      setError("Install or select a local model before proposing an edit.");
      return;
    }
    setIsProposingEdit(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const proposal = await window.relay.proposeEdit({ prompt: editPrompt.trim(), model: activeModel, relativePath: target });
      setEditProposal(proposal);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not produce a safe edit proposal.");
    } finally {
      setIsProposingEdit(false);
    }
  }

  async function applyEdit() {
    if (!editProposal) return;
    if (!window.confirm(`Apply Cenro's proposed edit to ${editProposal.relativePath}? You can review it in the editor and Git before committing.`)) return;
    try {
      const saved = await window.relay.applyEdit({ relativePath: editProposal.relativePath, content: editProposal.content });
      setSelectedFile(saved.relativePath);
      setEditTarget(saved.relativePath);
      setOpenTabs((current) => {
        const next = { relativePath: saved.relativePath, content: saved.content, baseContent: saved.content, updatedAt: saved.updatedAt, dirty: false };
        return current.some((tab) => tab.relativePath === saved.relativePath)
          ? current.map((tab) => tab.relativePath === saved.relativePath ? next : tab)
          : [...current, next];
      });
      setNotice(`Applied reviewed edit to ${saved.relativePath}`);
      setEditProposal(undefined);
      if (workspacePath) setWorkspaceFiles(await window.relay.scanWorkspace(workspacePath));
      try { setGit(await window.relay.getGitSnapshot()); } catch { /* Git is optional. */ }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not apply that edit.");
    }
  }

  function updateActiveFile(value: string) {
    if (!selectedFile) return;
    setOpenTabs((current) => current.map((tab) => tab.relativePath === selectedFile
      ? { ...tab, content: value, dirty: value !== tab.baseContent }
      : tab));
  }

  function closeFileTab(relativePath: string) {
    const tab = openTabs.find((item) => item.relativePath === relativePath);
    if (tab?.dirty && !window.confirm(`Discard unsaved changes in ${relativePath}?`)) return;
    const remaining = openTabs.filter((item) => item.relativePath !== relativePath);
    setOpenTabs(remaining);
    if (selectedFile === relativePath) setSelectedFile(remaining.at(-1)?.relativePath);
  }

  async function sendChat() {
    const prompt = chatInput.trim();
    if (!prompt || isChatting) return;
    if (!activeModel) {
      setError("Install or select a local model before using Cenro chat.");
      setView("settings");
      return;
    }
    const userMessage: RelayChatMessage = { role: "user", content: prompt, id: `${Date.now()}-user`, createdAt: new Date().toISOString() };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatInput("");
    setIsChatting(true);
    setError(undefined);
    try {
      const response = await window.relay.sendLocalChat({
        model: activeModel,
        messages: nextMessages,
        focusedFile: selectedFile ? { relativePath: selectedFile, content: fileContent, language: languageForPath(selectedFile) } : undefined
      });
      setChatMessages((current) => [...current, { role: "assistant", content: response.content, id: `${Date.now()}-assistant`, createdAt: response.createdAt }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not answer from the local model.");
    } finally {
      setIsChatting(false);
    }
  }

  async function proposeProject() {
    const prompt = projectPrompt.trim();
    if (!prompt || isProposingProject) return;
    if (!workspacePath) {
      setError("Choose the folder where Cenro should build the project first.");
      return;
    }
    if (!activeModel) {
      setError("Install or select a local model before generating a project.");
      setView("settings");
      return;
    }
    setIsProposingProject(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const proposal = await window.relay.proposeProject({ prompt, model: activeModel });
      const changed = proposal.files.filter((file) => file.changed);
      setProjectProposal(proposal);
      setSelectedProjectPaths(changed.map((file) => file.path));
      setSelectedChangePath(changed[0]?.path ?? proposal.files[0]?.path);
      setWorkspacePanel("changes");
      setNotice(`Cenro prepared ${changed.length} reviewable file${changed.length === 1 ? "" : "s"}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not generate a project proposal.");
    } finally {
      setIsProposingProject(false);
    }
  }

  function toggleProjectFile(relativePath: string) {
    setSelectedProjectPaths((current) => current.includes(relativePath)
      ? current.filter((path) => path !== relativePath)
      : [...current, relativePath]);
  }

  async function applyProjectFiles() {
    if (!projectProposal) return;
    const files = projectProposal.files.filter((file) => file.changed && selectedProjectPaths.includes(file.path));
    if (!files.length) {
      setError("Select at least one proposed file to apply.");
      return;
    }
    if (!window.confirm(`Apply ${files.length} reviewed file${files.length === 1 ? "" : "s"} to this workspace?`)) return;
    setIsApplyingProject(true);
    try {
      const saved = await window.relay.applyProjectFiles({ files: files.map(({ path, content, summary, action, baseHash, baseExists }) => ({ path, content, summary, action, baseHash, baseExists })) });
      setOpenTabs((current) => {
        const savedByPath = new Map(saved.map((file) => [file.relativePath, file]));
        const updated = current.map((tab) => {
          const file = savedByPath.get(tab.relativePath);
          return file ? { relativePath: file.relativePath, content: file.content, baseContent: file.content, updatedAt: file.updatedAt, dirty: false } : tab;
        });
        for (const file of saved) if (!updated.some((tab) => tab.relativePath === file.relativePath)) updated.push({ relativePath: file.relativePath, content: file.content, baseContent: file.content, updatedAt: file.updatedAt, dirty: false });
        return updated;
      });
      if (saved[0]) {
        setSelectedFile(saved[0].relativePath);
        setEditTarget(saved[0].relativePath);
      }
      if (workspacePath) setWorkspaceFiles(await window.relay.scanWorkspace(workspacePath));
      try { setGit(await window.relay.getGitSnapshot()); } catch { /* Git is optional. */ }
      setProjectProposal(undefined);
      setSelectedProjectPaths([]);
      setSelectedChangePath(undefined);
      setProjectPrompt("");
      setNotice(`Applied ${saved.length} reviewed file${saved.length === 1 ? "" : "s"}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not apply the reviewed project files.");
    } finally {
      setIsApplyingProject(false);
    }
  }

  function persistPlaybooks(next: Playbook[]) {
    setPlaybooks(next);
    try { window.localStorage.setItem("cenro.playbooks.v1", JSON.stringify(next)); } catch { /* local preferences are optional */ }
  }

  async function applyPlaybook(playbook: Playbook) {
    let prompt = expandPlaybook(playbook.template, playbookValues);
    try {
      const expanded = await window.cenro?.expandPlaybook?.(playbook.id, playbookValues) as { prompt?: string; missingVariables?: string[] } | undefined;
      if (expanded?.missingVariables?.length) {
        setNotice(`Add ${expanded.missingVariables.join(", ")} to complete this playbook.`);
        return;
      }
      if (expanded?.prompt) prompt = expanded.prompt;
    } catch { /* Custom local playbooks continue to work without the runtime store. */ }
    setActivePlaybookId(playbook.id);
    setArea(playbook.area);
    setComposer((current) => current.trim() ? `${current.trim()}\n\n${prompt}` : prompt);
    setNotice(`${playbook.title} is ready in the task prompt.`);
  }

  function playbookCategory(playbook: Playbook) {
    return playbook.icon === "debug" ? "debug" : playbook.icon === "security" ? "security" : playbook.icon === "explain" ? "explain" : playbook.area;
  }

  function playbookSaveInput(playbook: Playbook, includeId = true) {
    return {
      ...(includeId ? { id: playbook.id } : {}),
      ...(playbook.baseId ? { baseId: playbook.baseId } : {}),
      name: playbook.title,
      description: playbook.description,
      category: playbookCategory(playbook),
      template: playbook.template,
      variables: playbook.variables.map((name) => ({ name, label: name.replace(/_/g, " "), required: false }))
    };
  }

  function selectPlaybook(id: string) {
    setActivePlaybookId(id);
    setEditingPlaybook(false);
  }

  async function beginEditPlaybook() {
    if (!activePlaybook || isDuplicatingPlaybook) return;
    if (!isBuiltInPlaybook(activePlaybook)) {
      setEditingPlaybook((current) => !current);
      return;
    }

    setIsDuplicatingPlaybook(true);
    try {
      const localCopy: Playbook = {
        ...activePlaybook,
        id: `custom-${crypto.randomUUID()}`,
        title: `${activePlaybook.title} copy`,
        builtIn: false,
        baseId: activePlaybook.id
      };
      let copy = localCopy;
      if (window.cenro?.savePlaybook) {
        const saved = await window.cenro.savePlaybook(playbookSaveInput(localCopy, false));
        copy = { ...normalizePlaybook(saved), builtIn: false, baseId: activePlaybook.id };
      }
      const next = [...playbooks, copy];
      persistPlaybooks(next);
      setActivePlaybookId(copy.id);
      setEditingPlaybook(true);
      setNotice(`Created ${copy.title}. Your custom copy is now saved locally.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not duplicate this playbook.");
    } finally {
      setIsDuplicatingPlaybook(false);
    }
  }

  function updateActivePlaybook(patch: Partial<Playbook>) {
    if (!activePlaybook || isBuiltInPlaybook(activePlaybook)) return;
    const next = playbooks.map((playbook) => playbook.id === activePlaybook.id ? { ...playbook, ...patch, builtIn: false } : playbook);
    persistPlaybooks(next);
    const updated = next.find((playbook) => playbook.id === activePlaybook.id);
    if (updated?.id.startsWith("custom-")) void window.cenro?.savePlaybook?.(playbookSaveInput(updated)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Cenro could not save this custom playbook."));
  }

  async function resetPlaybooks() {
    persistPlaybooks(defaultPlaybooks);
    setActivePlaybookId(defaultPlaybooks[0].id);
    setEditingPlaybook(false);
    setIsDuplicatingPlaybook(false);
    try { await window.cenro?.reset?.(); } catch { /* The local fallback is already restored. */ }
  }

  async function saveProvider() {
    if (!window.cenro?.saveProvider) {
      setError("Provider settings are unavailable in this build. Local Ollama remains ready to use.");
      return;
    }
    if (!providerDraft.name.trim()) {
      setError("Give this provider a name before saving it.");
      return;
    }
    setProviderBusy(true);
    try {
      const apiKey = providerSecretInputRef.current?.value || undefined;
      // A draft may outlive a deleted provider (or an older renderer session).
      // Only send an id when it still maps to a loaded provider; otherwise this
      // is a first-time create rather than an invalid update.
      const existingProviderId = providers.some((provider) => provider.id === providerDraft.id)
        ? providerDraft.id
        : undefined;
      const saved = normalizeProvider(await window.cenro.saveProvider({
        id: existingProviderId,
        kind: providerDraft.kind === "compatible" ? "openai-compatible" : providerDraft.kind,
        label: providerDraft.name,
        model: providerDraft.model || undefined,
        baseUrl: providerDraft.endpoint || undefined,
        enabled: providerDraft.enabled,
        pricing: providerDraft.pricing,
        apiKey
      }));
      setProviders((current) => [saved, ...current.filter((provider) => provider.id !== saved.id)]);
      setProviderDraft(saved);
      if (providerSecretInputRef.current) providerSecretInputRef.current.value = "";
      setNotice(`${saved.name} is saved. Its API key is kept in Windows encrypted storage.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not save this provider.");
    } finally {
      setProviderBusy(false);
    }
  }

  async function removeProviderKey() {
    if (!window.cenro?.saveProvider) {
      setError("Provider settings are unavailable in this build. Local Ollama remains ready to use.");
      return;
    }
    if (!providerDraft.id || providerDraft.configured === false) {
      setNotice("This provider does not have a stored key to remove.");
      return;
    }
    if (!window.confirm(`Remove the encrypted API key for ${providerDraft.name}? Cloud runs through this provider will stop until you add a new key.`)) return;
    setProviderBusy(true);
    try {
      const saved = normalizeProvider(await window.cenro.saveProvider({
        id: providerDraft.id,
        kind: providerDraft.kind === "compatible" ? "openai-compatible" : providerDraft.kind,
        label: providerDraft.name,
        model: providerDraft.model || undefined,
        baseUrl: providerDraft.endpoint || undefined,
        enabled: providerDraft.enabled,
        pricing: providerDraft.pricing,
        apiKey: ""
      }));
      setProviders((current) => [saved, ...current.filter((provider) => provider.id !== saved.id)]);
      setProviderDraft(saved);
      if (providerSecretInputRef.current) providerSecretInputRef.current.value = "";
      setNotice(`${saved.name}'s encrypted API key was removed from this device.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not remove this provider key.");
    } finally {
      setProviderBusy(false);
    }
  }

  async function testProvider() {
    if (!window.cenro?.testProvider) {
      setError("Provider testing is unavailable in this build.");
      return;
    }
    if (!providerDraft.id) {
      setError("Save this provider once before testing the stored connection.");
      return;
    }
    setProviderBusy(true);
    try {
      const result = await window.cenro.testProvider(providerDraft.id);
      setNotice(result.ok === false ? result.message || "Provider connection failed." : result.message || "Provider connection succeeded.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not reach this provider.");
    } finally {
      setProviderBusy(false);
    }
  }

  async function deleteProvider(id: string) {
    if (!window.confirm("Delete this provider configuration from this device?")) return;
    try {
      await window.cenro?.deleteProvider?.(id);
      setProviders((current) => current.filter((provider) => provider.id !== id));
      setNotice("Provider removed from this device.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not remove this provider.");
    }
  }

  async function toggleProvider(provider: CenroProvider) {
    try {
      const enabled = !provider.enabled;
      if (window.cenro?.setProviderEnabled) await window.cenro.setProviderEnabled(provider.id, enabled);
      setProviders((current) => current.map((item) => item.id === provider.id ? { ...item, enabled } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not update this provider.");
    }
  }

  async function startTerminal() {
    if (!window.cenro?.startTerminal) {
      setError("The integrated terminal service is not available in this build yet.");
      return undefined;
    }
    try {
      const started = await window.cenro.startTerminal({});
      const id = started.sessionId;
      setTerminalSession(id);
      setTerminalRunning(true);
      setTerminalOutput((current) => current.length ? current : [`PowerShell · ${workspacePath ?? "workspace"}\r\n`]);
      return id;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not start the terminal.");
      return undefined;
    }
  }

  async function sendTerminalCommand() {
    const command = terminalCommand.trim();
    if (!command) return;
    let sessionId = terminalSession;
    if (!terminalRunning || !sessionId) sessionId = await startTerminal();
    if (!sessionId || !window.cenro?.writeTerminal) return;
    try {
      await window.cenro.writeTerminal(sessionId, `${command}\r`);
      setTerminalCommand("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not write to the terminal.");
    }
  }

  async function writeTerminalData(data: string) {
    const sessionId = terminalSession;
    if (!terminalRunning || !sessionId) {
      setNotice("Start the terminal before typing into the interactive shell.");
      return;
    }
    if (!sessionId || !window.cenro?.writeTerminal) return;
    try {
      await window.cenro.writeTerminal(sessionId, data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not write to the terminal.");
    }
  }

  function resizeTerminal(columns: number, rows: number) {
    if (!terminalSession || !window.cenro?.resizeTerminal) return;
    void window.cenro.resizeTerminal(terminalSession, columns, rows).catch(() => undefined);
  }

  async function createTerminalProposal() {
    const command = terminalCommand.trim();
    if (!command) return;
    if (!window.cenro?.proposeTerminalCommand) {
      setError("Command review cards are unavailable in this build.");
      return;
    }
    try {
      const proposal = await window.cenro.proposeTerminalCommand({ command, reason: "Review before running this terminal command.", riskLevel: "medium" }) as TerminalProposal;
      setTerminalProposal(proposal);
      setTerminalCommand("");
      setNotice("Command review card created. It will not run until you approve it.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not create a command review card.");
    }
  }

  async function runTerminalProposal() {
    if (!terminalProposal || !window.cenro?.runTerminalProposal) return;
    let sessionId = terminalSession;
    if (!terminalRunning || !sessionId) sessionId = await startTerminal();
    if (!sessionId) return;
    try {
      await window.cenro.runTerminalProposal(sessionId, terminalProposal.id);
      setTerminalProposal(undefined);
      setNotice("Reviewed command was sent to your PowerShell session.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not run this reviewed command.");
    }
  }

  async function rejectTerminalProposal() {
    if (!terminalProposal) return;
    try { await window.cenro?.rejectTerminalProposal?.(terminalProposal.id); } catch { /* A local dismissal is still safe. */ }
    setTerminalProposal(undefined);
    setNotice("Command proposal rejected.");
  }

  async function stopTerminal() {
    try {
      if (terminalSession) await window.cenro?.stopTerminal?.(terminalSession);
      setTerminalRunning(false);
      setTerminalSession(undefined);
      setTerminalOutput((current) => [...current, "\nTerminal session ended.\n"]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cenro could not stop the terminal.");
    }
  }

  async function finishOnboarding() {
    await window.relay.completeOnboarding();
    setOnboarding(false);
  }

  function chooseTaskMode(next: Mode) {
    if (teamEnabled && next !== "local") setTeamEnabled(false);
    setMode(next);
    if (next !== "smart") setUseWeb(false);
  }

  function toggleTeamWorkflow(enabled: boolean) {
    setTeamEnabled(enabled);
    if (enabled) {
      setMode("local");
      setUseWeb(false);
    }
  }

  const fileLabel = selectedFile?.split(/[/\\]/).pop() ?? "Choose a file";

  return <div className="relay-app cenro-v2">
    <aside className="sidebar">
      <button className="brand" onClick={() => { setArea("build"); setView("workspace"); }} aria-label="Cenro home"><CenroMark /><span>Cenro</span></button>
      <nav className="primary-nav" aria-label="Cenro sections">
        <NavItem active={view === "workspace"} onClick={() => { setArea("build"); setView("workspace"); }} icon={Sparkles} label="Studio" />
        <NavItem active={view === "history"} onClick={() => setView("history")} icon={History} label="History" />
      </nav>
      <div className="sidebar-foot">
        <button className="workspace-quick" onClick={chooseWorkspace} title="Choose workspace"><FolderOpen size={16} /><span>{workspaceName}</span><ChevronRight size={14} /></button>
        <NavItem active={view === "settings"} onClick={() => setView("settings")} icon={Settings} label="Settings" compact />
      </div>
    </aside>

    <main className="main-shell">
      <header className="app-header">
        <div className="header-context"><span className="header-eyebrow">CONTEXT-LED BUILD WORKSPACE</span><strong>{view === "workspace" || view === "editor" ? workspaceName : view[0].toUpperCase() + view.slice(1)}</strong></div>
        <div className="header-flow"><span className={studioPlan ? "ready" : ""}>{studioPlan ? "Plan ready" : "Plan before build"}</span><ChevronRight size={14} /><span>{studioProvider ? `${studioProvider.name} quality lead` : "Connect a quality lead"}</span></div>
        <button className={`runtime-status ${ollama.connected ? "online" : "offline"}`} onClick={() => setView("settings")}><span /><div><strong>{ollama.connected ? "Local runtime ready" : "Ollama unavailable"}</strong><small>{ollama.connected ? `${ollama.models.length} model${ollama.models.length === 1 ? "" : "s"} available` : "Open settings"}</small></div><Cpu size={16} /></button>
      </header>

      {(notice || error) && <div className={`toast ${error ? "error" : ""}`} role="status">{error ? <TriangleAlert size={15} /> : <CheckCircle2 size={15} />}<span>{error ?? notice}</span><button onClick={() => { setError(undefined); setNotice(undefined); }} aria-label="Dismiss"><X size={15} /></button></div>}

      <section className="content-shell">
        {view === "workspace" && <CenroStudio
          workspacePath={workspacePath} workspaceName={workspaceName} files={workspaceFiles} selectedFile={selectedFile} fileLabel={fileLabel}
          tabs={openTabs} content={fileContent} dirty={fileDirty} updatedAt={fileUpdatedAt} onChooseWorkspace={chooseWorkspace}
          onOpenFile={(path) => void openFile(path)} onContentChange={updateActiveFile} onSave={saveFile} onCloseTab={closeFileTab} onSelectTab={setSelectedFile}
          search={workspaceSearch} searchResults={searchResults} creatingFile={creatingFile} newFileName={newFileName}
          onSearchChange={setWorkspaceSearch} onSearch={searchFiles} onCreateToggle={() => setCreatingFile((value) => !value)} onCreateNameChange={setNewFileName} onCreate={createFile}
          composer={composer} onComposerChange={setComposer} mode={studioMode} onModeChange={setStudioMode} isPlanning={studioPlanning}
          isRunning={isRunning} isRouting={isRouting} onSubmit={submitStudioTask} onPreparePlan={() => void prepareStudioPlan()} onBuild={() => void buildStudioPlan()}
          plan={studioPlan} sidePanel={studioSidePanel} onSidePanelChange={setStudioSidePanel} contextPaths={studioContextPaths} onContextPathsChange={setStudioContextPaths}
          menu={studioMenu} onMenuChange={setStudioMenu} playbooks={playbooks} activePlaybook={activePlaybook} playbookValues={playbookValues}
          onUsePlaybook={(playbook) => { setActivePlaybookId(playbook.id); setComposer(expandPlaybook(playbook.template, playbookValues)); setStudioMode(playbook.area === "build" ? "plan" : "ask"); setStudioMenu(undefined); }}
          providers={qualityProviders} provider={studioProvider} onProviderChange={setStudioProviderId} localModel={activeModel} ollamaReady={ollama.connected}
          chatMessages={chatMessages} isChatting={isChatting}
          webResearch={studioWebResearch} webResearchBusy={studioWebResearchBusy} onResearchWeb={proposeStudioWebResearch} onOpenUrl={(url) => void window.relay.openExternalUrl(url)}
          dock={studioDock} onDockChange={setStudioDock} terminalCommand={terminalCommand} terminalOutput={terminalOutput} terminalRunning={terminalRunning} terminalSupported={Boolean(window.cenro?.startTerminal)} terminalProposal={terminalProposal}
          onTerminalCommandChange={setTerminalCommand} onTerminalRun={() => void sendTerminalCommand()} onTerminalReview={() => void createTerminalProposal()} onTerminalData={(data) => void writeTerminalData(data)} onTerminalResize={resizeTerminal} onTerminalStart={() => void startTerminal()} onTerminalStop={() => void stopTerminal()} onTerminalClear={() => setTerminalOutput([])} onTerminalApproveProposal={() => void runTerminalProposal()} onTerminalRejectProposal={() => void rejectTerminalProposal()}
          projectProposal={projectProposal} selectedProjectPaths={selectedProjectPaths} selectedChangePath={selectedChangePath}
          onSelectProjectFile={setSelectedChangePath} onToggleProjectFile={toggleProjectFile} onApplyProject={applyProjectFiles} isApplyingProject={isApplyingProject}
          onDiscardProject={() => { setProjectProposal(undefined); setSelectedProjectPaths([]); setSelectedChangePath(undefined); setStudioSidePanel("plan"); }}
        />}
        {view === "editor" && <WorkspaceView
          workspacePath={workspacePath} files={workspaceFiles} selectedFile={selectedFile} fileLabel={fileLabel}
          tabs={openTabs} content={fileContent} dirty={fileDirty} updatedAt={fileUpdatedAt} search={workspaceSearch} searchResults={searchResults}
          creatingFile={creatingFile} newFileName={newFileName} onChooseWorkspace={chooseWorkspace} onOpenFile={openFile}
          onContentChange={updateActiveFile} onSave={saveFile} onCloseTab={closeFileTab} onSelectTab={setSelectedFile} onSearchChange={setWorkspaceSearch}
          onSearch={searchFiles} onCreateToggle={() => setCreatingFile((value) => !value)} onCreateNameChange={setNewFileName} onCreate={createFile}
          panel={workspacePanel} onPanelChange={setWorkspacePanel} chatMessages={chatMessages} chatInput={chatInput} onChatInputChange={setChatInput}
          isChatting={isChatting} onSendChat={sendChat} selectedModel={activeModel} projectPrompt={projectPrompt} onProjectPromptChange={setProjectPrompt}
          isProposingProject={isProposingProject} projectProposal={projectProposal} selectedProjectPaths={selectedProjectPaths} selectedChangePath={selectedChangePath}
          onProposeProject={proposeProject} onSelectProjectFile={setSelectedChangePath} onToggleProjectFile={toggleProjectFile} onApplyProject={applyProjectFiles}
          isApplyingProject={isApplyingProject} onDiscardProject={() => { setProjectProposal(undefined); setSelectedProjectPaths([]); setSelectedChangePath(undefined); }}
          playbooks={playbooks} activePlaybook={activePlaybook} playbookValues={playbookValues} editingPlaybook={editingPlaybook}
          onSelectPlaybook={selectPlaybook} onPlaybookValueChange={(key, value) => setPlaybookValues((current) => ({ ...current, [key]: value }))}
          onApplyPlaybook={applyPlaybook} onEditPlaybook={() => void beginEditPlaybook()} isDuplicatingPlaybook={isDuplicatingPlaybook} onUpdatePlaybook={updateActivePlaybook} onResetPlaybooks={() => void resetPlaybooks()}
        />}
        {(view === "research" || view === "learn") && <TaskView
          area={activeArea} mode={mode} onModeChange={chooseTaskMode} useWeb={useWeb} onUseWebChange={setUseWeb} selectedModel={activeModel}
          models={ollama.models} onModelChange={(model) => setModelRole("builderModel", model)} composer={composer} onComposerChange={setComposer}
          isRunning={isRunning} onSubmit={runTask} activeTask={activeTask} onOpenUrl={(url) => void window.relay.openExternalUrl(url)} onExport={exportTask}
          workspaceName={workspaceName} teamEnabled={teamEnabled} onTeamEnabledChange={toggleTeamWorkflow} providers={providers} isRouting={isRouting}
        />}
        {view === "build" && <BuildView
          workspacePath={workspacePath} files={workspaceFiles} selectedFile={selectedFile} editTarget={editTarget || selectedFile || ""}
          onTargetChange={setEditTarget} prompt={editPrompt} onPromptChange={setEditPrompt} onPropose={proposeEdit} isProposing={isProposingEdit}
          proposal={editProposal} onApply={applyEdit} onDiscard={() => setEditProposal(undefined)} git={git} onRefreshGit={() => void window.relay.getGitSnapshot().then(setGit).catch(() => setGit({ available: false, changedFiles: [], message: "Git status could not be read." }))}
          mode={mode} onModeChange={chooseTaskMode} useWeb={useWeb} onUseWebChange={setUseWeb} selectedModel={activeModel} models={ollama.models} onModelChange={(model) => setModelRole("builderModel", model)}
          composer={composer} onComposerChange={setComposer} isRunning={isRunning} isRouting={isRouting} onSubmit={runTask} activeTask={activeTask}
          providers={providers} onOpenProjectReview={() => { setWorkspacePanel("changes"); setView("editor"); }}
        />}
        {view === "history" && <HistoryView tasks={tasks} activeTask={activeTask} onSelect={setActiveTask} onExport={exportTask} onClear={clearHistory} onOpenUrl={(url) => void window.relay.openExternalUrl(url)} />}
        {view === "terminal" && <TerminalView workspaceName={workspaceName} workspacePath={workspacePath} command={terminalCommand} output={terminalOutput} running={terminalRunning} supported={Boolean(window.cenro?.startTerminal)} proposal={terminalProposal} onCommandChange={setTerminalCommand} onRun={() => void sendTerminalCommand()} onReview={() => void createTerminalProposal()} onTerminalData={(data) => void writeTerminalData(data)} onResize={resizeTerminal} onApproveProposal={() => void runTerminalProposal()} onRejectProposal={() => void rejectTerminalProposal()} onStart={() => void startTerminal()} onStop={() => void stopTerminal()} onClear={() => setTerminalOutput([])} />}
        {view === "settings" && <CenroSettingsView
          ollama={ollama} system={system} selectedModel={activeModel} onModelChange={(model) => setModelRole("builderModel", model)} modelRoles={modelRoles} onModelRoleChange={setModelRole} newModel={newModel} onNewModelChange={setNewModel}
          pulls={pulls} onPull={pullModel} onDelete={deleteModel} onRefresh={() => void refreshOllama()} onOpenDownload={() => void window.relay.openOllamaDownload()}
          kitInstalled={kitInstalled} providers={providers} providerDraft={providerDraft} providerSecretInputRef={providerSecretInputRef} providerBusy={providerBusy}
          onProviderDraftChange={setProviderDraft} onSaveProvider={() => void saveProvider()} onTestProvider={() => void testProvider()}
          onRemoveProviderKey={() => void removeProviderKey()} onDeleteProvider={(id) => void deleteProvider(id)} onToggleProvider={(provider) => void toggleProvider(provider)}
        />}
      </section>
    </main>

    {onboarding && <CenroProviderOnboarding
      connected={ollama.connected} models={ollama.models} system={system} kitInstalled={kitInstalled} pulls={pulls}
      providers={providers} providerDraft={providerDraft} providerSecretInputRef={providerSecretInputRef} providerBusy={providerBusy}
      onProviderDraftChange={setProviderDraft} onSaveProvider={() => void saveProvider()} onTestProvider={() => void testProvider()} onOpenSettings={() => { setOnboarding(false); setView("settings"); }}
      onCheck={() => void refreshOllama()} onDownload={() => void window.relay.openOllamaDownload()} onPull={(model) => void pullModel(model)} onFinish={() => void finishOnboarding()}
    />}
    {studioWebResearchDraft && <GatewayWebResearchModal draft={studioWebResearchDraft} busy={studioWebResearchBusy} onCancel={() => setStudioWebResearchDraft(undefined)} onApprove={(query) => void approveStudioWebResearch(query)} />}
    {gatewayHandoff && <GatewayHandoffModal handoff={gatewayHandoff} onCancel={() => setGatewayHandoff(undefined)} onApprove={() => void approveGatewayHandoff()} />}
    {routeReceipt && pendingTask && <RouteReceiptModal receipt={routeReceipt} request={pendingTask} onCancel={() => { setRouteReceipt(undefined); setPendingTask(undefined); }} onApprove={(includeWorkspace) => void approveRoute(includeWorkspace)} />}
  </div>;
}

function CenroMark({ compact = false }: { compact?: boolean }) {
  return <svg className={`cenro-mark ${compact ? "compact" : ""}`} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M5.5 8.2 13.2 16l-7.7 7.8" stroke="currentColor" strokeWidth="3.15" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m26.5 8.2-7.7 7.8 7.7 7.8" stroke="currentColor" strokeWidth="3.15" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="16" r="3.35" fill="currentColor" />
  </svg>;
}

function NavItem({ active, onClick, icon: Icon, label, compact = false }: { active: boolean; onClick: () => void; icon: typeof Braces; label: string; compact?: boolean }) {
  return <button className={`nav-item ${active ? "active" : ""} ${compact ? "compact" : ""}`} onClick={onClick}><Icon size={18} /><span>{label}</span></button>;
}

function CenroStudio({
  workspacePath, workspaceName, files, selectedFile, fileLabel, tabs, content, dirty, updatedAt, onChooseWorkspace, onOpenFile,
  onContentChange, onSave, onCloseTab, onSelectTab, search, searchResults, creatingFile, newFileName, onSearchChange, onSearch, onCreateToggle, onCreateNameChange, onCreate, composer, onComposerChange, mode, onModeChange, isPlanning, isRunning,
  isRouting, onSubmit, onPreparePlan, onBuild, plan, sidePanel, onSidePanelChange, contextPaths, onContextPathsChange, menu,
  onMenuChange, playbooks, activePlaybook, playbookValues, onUsePlaybook, providers, provider, onProviderChange, localModel,
  ollamaReady, chatMessages, isChatting, webResearch, webResearchBusy, onResearchWeb, onOpenUrl, dock, onDockChange, terminalCommand, terminalOutput, terminalRunning, terminalSupported, terminalProposal, onTerminalCommandChange, onTerminalRun, onTerminalReview, onTerminalData, onTerminalResize, onTerminalStart, onTerminalStop, onTerminalClear, onTerminalApproveProposal, onTerminalRejectProposal, projectProposal, selectedProjectPaths, selectedChangePath, onSelectProjectFile, onToggleProjectFile,
  onApplyProject, isApplyingProject, onDiscardProject
}: {
  workspacePath?: string; workspaceName: string; files: WorkspaceEntry[]; selectedFile?: string; fileLabel: string; tabs: CodeTab[];
  content: string; dirty: boolean; updatedAt?: string; onChooseWorkspace: () => void; onOpenFile: (path: string) => void;
  onContentChange: (value: string) => void; onSave: () => void; onCloseTab: (path: string) => void; onSelectTab: (path: string) => void;
  search: string; searchResults: Array<{ relativePath: string; snippet: string; score: number }>; creatingFile: boolean; newFileName: string;
  onSearchChange: (value: string) => void; onSearch: (event: FormEvent) => void; onCreateToggle: () => void; onCreateNameChange: (value: string) => void; onCreate: (event: FormEvent) => void;
  composer: string; onComposerChange: (value: string) => void; mode: StudioMode; onModeChange: (mode: StudioMode) => void;
  isPlanning: boolean; isRunning: boolean; isRouting: boolean; onSubmit: (event: FormEvent) => void; onPreparePlan: () => void; onBuild: () => void;
  plan?: StudioPlan; sidePanel: StudioSidePanel; onSidePanelChange: (panel: StudioSidePanel) => void; contextPaths: string[];
  onContextPathsChange: (paths: string[]) => void; menu?: "context" | "playbooks"; onMenuChange: (menu?: "context" | "playbooks") => void;
  playbooks: Playbook[]; activePlaybook?: Playbook; playbookValues: Record<string, string>; onUsePlaybook: (playbook: Playbook) => void;
  providers: CenroProvider[]; provider?: CenroProvider; onProviderChange: (id: string) => void; localModel: string; ollamaReady: boolean;
  chatMessages: RelayChatMessage[]; isChatting: boolean;
  webResearch?: GatewayWebResearch; webResearchBusy: boolean; onResearchWeb: () => void; onOpenUrl: (url: string) => void;
  dock: StudioDock; onDockChange: (dock: StudioDock) => void; terminalCommand: string; terminalOutput: string[]; terminalRunning: boolean; terminalSupported: boolean; terminalProposal?: TerminalProposal;
  onTerminalCommandChange: (value: string) => void; onTerminalRun: () => void; onTerminalReview: () => void; onTerminalData: (data: string) => void; onTerminalResize: (columns: number, rows: number) => void; onTerminalStart: () => void; onTerminalStop: () => void; onTerminalClear: () => void; onTerminalApproveProposal: () => void; onTerminalRejectProposal: () => void;
  projectProposal?: RelayProjectProposal; selectedProjectPaths: string[]; selectedChangePath?: string; onSelectProjectFile: (path: string) => void;
  onToggleProjectFile: (path: string) => void; onApplyProject: () => void; isApplyingProject: boolean; onDiscardProject: () => void;
}) {
  const reviewedFile = projectProposal?.files.find((file) => file.path === selectedChangePath) ?? projectProposal?.files[0];
  const changedFiles = projectProposal?.files.filter((file) => file.changed) ?? [];
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const visibleFiles = files.filter((entry) => entry.kind === "file");
  const planModeLabel: Record<StudioMode, string> = { plan: "Plan", build: "Build", polish: "Polish", debug: "Debug", review: "Review", ask: "Ask" };
  const toggleContext = (path: string) => onContextPathsChange(contextPaths.includes(path) ? contextPaths.filter((item) => item !== path) : [...contextPaths, path]);
  const isHiddenByCollapsedFolder = (entry: WorkspaceEntry) => collapsedFolders.some((folder) => entry.relativePath.startsWith(`${folder}/`));
  const toggleFolder = (path: string) => setCollapsedFolders((current) => current.includes(path) ? current.filter((folder) => folder !== path) : [...current, path]);

  if (!workspacePath) return <section className="studio-empty-shell">
    <div className="studio-empty-mark"><CenroMark /></div>
    <span className="header-eyebrow">CENRO STUDIO</span>
    <h1>Bring an outcome. Start with a plan.</h1>
    <p>Choose a project folder and Cenro will map the relevant parts locally before a quality model writes a single line.</p>
    <button className="primary-button" onClick={onChooseWorkspace}><FolderOpen size={16} /> Open a workspace</button>
  </section>;

  return <section className={`cenro-studio ${inspectorOpen ? "" : "inspector-closed"}`}>
    <aside className="studio-files" aria-label="Workspace files">
      <div className="studio-pane-title"><div><span className="header-eyebrow">EXPLORER</span><strong>{workspaceName}</strong></div><div className="studio-pane-actions"><button onClick={onChooseWorkspace} title="Choose workspace"><FolderOpen size={15} /></button><button onClick={onCreateToggle} title="Create file"><FilePlus2 size={15} /></button></div></div>
      {creatingFile && <form className="studio-new-file" onSubmit={onCreate}><input autoFocus value={newFileName} onChange={(event) => onCreateNameChange(event.target.value)} placeholder="src/new-file.ts" aria-label="New file path" /><button type="submit" title="Create file"><Check size={13} /></button><button type="button" onClick={onCreateToggle} title="Cancel"><X size={13} /></button></form>}
      <form className="studio-file-search" onSubmit={onSearch}><Search size={13} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Find in workspace" aria-label="Search workspace" /><button type="submit" title="Search"><ArrowRight size={13} /></button></form>
      <div className="studio-file-list">{searchResults.length ? <div className="studio-search-results">{searchResults.map((result) => <button key={result.relativePath} onClick={() => onOpenFile(result.relativePath)}><FileCode2 size={13} /><span><strong>{result.relativePath}</strong><small>{result.snippet}</small></span></button>)}</div> : files.length ? files.filter((entry) => !isHiddenByCollapsedFolder(entry)).map((entry) => entry.kind === "folder"
        ? <button key={entry.relativePath} type="button" className={`studio-folder ${collapsedFolders.includes(entry.relativePath) ? "collapsed" : ""}`} style={{ paddingLeft: `${12 + entry.depth * 13}px` }} onClick={() => toggleFolder(entry.relativePath)} aria-expanded={!collapsedFolders.includes(entry.relativePath)}><ChevronRight size={13} />{entry.name}</button>
        : <button key={entry.relativePath} className={`studio-file ${selectedFile === entry.relativePath ? "selected" : ""} ${contextPaths.includes(entry.relativePath) ? "pinned" : ""}`} style={{ paddingLeft: `${14 + entry.depth * 13}px` }} onClick={() => onOpenFile(entry.relativePath)} title={entry.relativePath}><FileCode2 size={13} /><span>{entry.name}</span>{contextPaths.includes(entry.relativePath) && <span className="pin-dot" />}</button>
      ) : <p className="studio-file-empty">No readable files found.</p>}</div>
      <div className="studio-file-foot"><button onClick={() => selectedFile && toggleContext(selectedFile)} disabled={!selectedFile}><Plus size={14} /> {selectedFile ? "Pin open file" : "Open a file"}</button></div>
    </aside>

    <main className="studio-canvas">
      <div className="studio-canvas-head">
        <div className="studio-tabs" role="tablist" aria-label="Open files">
          {tabs.length ? tabs.map((tab) => <div className={`studio-tab ${selectedFile === tab.relativePath ? "active" : ""}`} key={tab.relativePath} role="tab" aria-selected={selectedFile === tab.relativePath}>
            <button onClick={() => onSelectTab(tab.relativePath)} title={tab.relativePath}><FileCode2 size={12} />{tab.relativePath.split(/[/\\]/).pop()}{tab.dirty && <i />}</button>
            <button onClick={() => onCloseTab(tab.relativePath)} aria-label={`Close ${tab.relativePath}`}><X size={12} /></button>
          </div>) : <span>Plan canvas</span>}
        </div>
        {selectedFile && <div className="studio-file-actions"><span>{dirty ? "Unsaved" : updatedAt ? `Saved ${formatTime(updatedAt)}` : "Local file"}</span><button onClick={onSave} disabled={!dirty}><Save size={13} /> Save</button></div>}
      </div>

      <div className="studio-main-content">
        {sidePanel === "changes" && reviewedFile ? <section className="studio-change-canvas">
          <div className="studio-change-head"><div><span className="header-eyebrow">REVIEW PROPOSAL</span><h2>{reviewedFile.path}</h2><p>{reviewedFile.summary}</p></div><span className={reviewedFile.action}>{reviewedFile.action === "create" ? "NEW" : "MODIFIED"}</span></div>
          <div className="studio-diff"><DiffEditor height="100%" language={languageForPath(reviewedFile.path)} original={reviewedFile.originalContent} modified={reviewedFile.content} theme="cenro-dark"
            originalModelPath={`inmemory://cenro/studio/original/${encodeURIComponent(reviewedFile.path)}`} modifiedModelPath={`inmemory://cenro/studio/modified/${encodeURIComponent(reviewedFile.path)}`}
            options={{ automaticLayout: true, readOnly: true, minimap: { enabled: false }, renderSideBySide: true, fontSize: 12, lineHeight: 19, scrollBeyondLastLine: false }} />
          </div>
        </section> : mode === "ask" && chatMessages.length ? <section className="studio-local-chat" aria-live="polite">
          <div className="studio-chat-head"><span className="studio-plan-orb"><Bot size={17} /></span><div><span className="header-eyebrow">LOCAL CHAT</span><strong>{localModel || "Local model"}</strong></div><span>Never sent to a provider</span></div>
          <div className="studio-chat-thread">{chatMessages.map((message) => <article className={`studio-chat-message ${message.role}`} key={message.id ?? `${message.role}-${message.createdAt}`}><small>{message.role === "assistant" ? "CENRO · LOCAL" : "YOU"}</small><p>{message.content}</p></article>)}{isChatting && <article className="studio-chat-message assistant loading"><small>CENRO · LOCAL</small><p><LoaderCircle className="spin" size={14} /> Thinking with {localModel}…</p></article>}</div>
        </section> : selectedFile ? <div className="studio-editor"><Editor
          height="100%" path={`inmemory://cenro/studio/${encodeURIComponent(selectedFile)}`} language={languageForPath(selectedFile)} value={content} theme="cenro-dark"
          onChange={(value) => onContentChange(value ?? "")} options={{ automaticLayout: true, fontSize: 13, lineHeight: 21, minimap: { enabled: false }, padding: { top: 20, bottom: 20 }, scrollBeyondLastLine: false, smoothScrolling: true }}
          onMount={(editor, monaco) => editor.addAction({ id: "cenro.studio.save", label: "Save file", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => onSave() })} />
        </div> : plan ? <section className="studio-plan-canvas">
          <div className="studio-plan-kicker"><span className="studio-plan-orb"><Sparkles size={17} /></span><span>{planModeLabel[plan.mode]} brief · {formatTime(plan.createdAt)}</span></div>
          <h1>{plan.prompt}</h1>
          <p className="studio-plan-lead">A bounded plan is ready. Cenro used local repository metadata{plan.analysis?.localCouncil?.status === "completed" ? " and local project understanding" : ""}; no source code has been sent to a provider.</p>
          <div className="studio-plan-columns">
            <section><span className="header-eyebrow">WHAT CENRO WILL CHECK</span><ul>{plan.diagnosis.map((item) => <li key={item}><CheckCircle2 size={15} />{item}</li>)}</ul></section>
            <section><span className="header-eyebrow">IMPLEMENTATION DIRECTION</span><ul>{plan.direction.map((item) => <li key={item}><ArrowRight size={15} />{item}</li>)}</ul></section>
          </div>
          <div className="studio-plan-actions"><button className="small-button" onClick={onPreparePlan} disabled={isPlanning}><RefreshCw size={14} /> Refine plan</button><button className="primary-button" onClick={onBuild} disabled={isRouting || isRunning}>{isRouting ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />} Build this plan</button></div>
        </section> : <section className="studio-welcome">
          <div className="studio-welcome-orb"><CenroMark /></div><span className="header-eyebrow">CENRO STUDIO</span><h1>What do you want to make?</h1><p>Describe the outcome, then Cenro maps the repository locally and gives you a plan before any cloud model is asked to write.</p>
          <div className="studio-suggestion-grid">
            {[
              ["Make this interface feel premium", "polish"], ["Plan a new project in this folder", "plan"], ["Find and fix a bug", "debug"], ["Review this code before I ship", "review"]
            ].map(([label, nextMode]) => <button key={label} onClick={() => { onComposerChange(label); onModeChange(nextMode as StudioMode); }}><ArrowRight size={15} /><span>{label}</span></button>)}
          </div>
        </section>}
      </div>

      {dock === "terminal" && <StudioTerminalDock
        workspaceName={workspaceName} ready={terminalSupported} running={terminalRunning} command={terminalCommand} output={terminalOutput} proposal={terminalProposal}
        onClose={() => onDockChange(undefined)} onCommandChange={onTerminalCommandChange} onRun={onTerminalRun} onReview={onTerminalReview}
        onData={onTerminalData} onResize={onTerminalResize} onStart={onTerminalStart} onStop={onTerminalStop} onClear={onTerminalClear}
        onApproveProposal={onTerminalApproveProposal} onRejectProposal={onTerminalRejectProposal}
      />}
      <form className="studio-composer" onSubmit={onSubmit}>
        {menu === "context" && <div className="studio-popover studio-context-popover"><div><span className="header-eyebrow">PINNED CONTEXT</span><strong>Choose relevant files</strong></div>{visibleFiles.length ? visibleFiles.map((entry) => <label key={entry.relativePath}><input type="checkbox" checked={contextPaths.includes(entry.relativePath)} onChange={() => toggleContext(entry.relativePath)} /><FileCode2 size={13} /><span>{entry.relativePath}</span></label>) : <p>Open a workspace to pin context.</p>}</div>}
        {menu === "playbooks" && <div className="studio-popover studio-playbook-popover"><div><span className="header-eyebrow">PLAYBOOKS</span><strong>Start with a better brief</strong></div>{playbooks.map((playbook) => <button key={playbook.id} onClick={() => onUsePlaybook(playbook)} type="button"><span><Sparkles size={14} /></span><div><strong>{playbook.title}</strong><small>{playbook.description}</small></div><ChevronRight size={14} /></button>)}</div>}
        <textarea value={composer} onChange={(event) => onComposerChange(event.target.value)} onFocus={() => onMenuChange(undefined)} placeholder="Describe the outcome, not the implementation…" aria-label="Describe what you want Cenro to plan or build" />
        <div className="studio-composer-foot">
          <div className="studio-composer-tools">
            <button type="button" className={contextPaths.length ? "active" : ""} onClick={() => onMenuChange(menu === "context" ? undefined : "context")} title="Pin workspace context"><Plus size={16} /><span>{contextPaths.length ? `${contextPaths.length} context` : "Context"}</span></button>
            <button type="button" className={activePlaybook ? "active" : ""} onClick={() => onMenuChange(menu === "playbooks" ? undefined : "playbooks")} title="Choose a playbook"><span className="tool-at">/</span><span>{activePlaybook?.title ?? "Playbooks"}</span></button>
            <button type="button" className={dock === "terminal" ? "active" : ""} onClick={() => onDockChange(dock === "terminal" ? undefined : "terminal")} title="Toggle integrated terminal"><Terminal size={15} /><span>Terminal</span></button>
            <select value={mode} onChange={(event) => onModeChange(event.target.value as StudioMode)} aria-label="Task mode">{(Object.keys(planModeLabel) as StudioMode[]).map((item) => <option key={item} value={item}>{planModeLabel[item]}</option>)}</select>
            <select value={provider?.id ?? ""} onChange={(event) => onProviderChange(event.target.value)} aria-label="Quality lead"><option value="">{providers.length ? "Auto quality" : "Connect quality model"}</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model ?? "select model"}</option>)}</select>
          </div>
          <div className="studio-composer-action"><span title={ollamaReady ? `Local planner: ${localModel || "choose a model"}` : "Local planner unavailable"} className={ollamaReady ? "local-ready" : ""}><Bot size={14} />{ollamaReady ? "Local context" : "No local planner"}</span><button type="submit" aria-label={mode === "build" ? "Build approved plan" : "Create plan"} disabled={!composer.trim() || isPlanning || isRunning || isRouting}>{isPlanning || isRunning || isRouting ? <LoaderCircle className="spin" size={17} /> : mode === "build" ? <WandSparkles size={17} /> : <ArrowUpIcon />} </button></div>
        </div>
      </form>
    </main>

    <aside className="studio-inspector" aria-label="Assistant drawer">
      <div className="studio-inspector-tabs" role="tablist" aria-label="Assistant drawer"><button className={sidePanel === "plan" ? "active" : ""} onClick={() => { setInspectorOpen(true); onSidePanelChange("plan"); }}>Context</button><button className={sidePanel === "changes" ? "active" : ""} onClick={() => { setInspectorOpen(true); onSidePanelChange("changes"); }}>Changes{changedFiles.length ? <span>{changedFiles.length}</span> : null}</button><button className="studio-inspector-toggle" onClick={() => setInspectorOpen((value) => !value)} title={inspectorOpen ? "Collapse assistant drawer" : "Open assistant drawer"} aria-label={inspectorOpen ? "Collapse assistant drawer" : "Open assistant drawer"}><PanelLeft size={15} /></button></div>
      {sidePanel === "plan" ? <div className="studio-inspector-body">
        {plan ? <>
          <section><span className="header-eyebrow">EVIDENCE</span><strong>{plan.analysis ? `${plan.analysis.repository.scannedFileCount} files mapped locally` : "Workspace context not yet mapped"}</strong><p>{plan.analysis?.localCouncil?.summary.selectionRationale ?? "Pin the files that matter most, then refine this plan."}</p></section>
          <section><span className="header-eyebrow">LIKELY FILES</span>{plan.files.length ? <ul className="studio-file-reasons">{plan.files.map((file) => <li key={file.path}><FileCode2 size={14} /><div><strong>{file.path}</strong><small>{file.reason}{file.characters ? ` · ${file.characters.toLocaleString()} chars` : ""}</small></div></li>)}</ul> : <p>No source files are required for this first pass.</p>}</section>
          <section className="studio-web-evidence"><div className="studio-web-evidence-head"><span className="header-eyebrow">OPTIONAL WEB RESEARCH</span><button className="small-button" onClick={onResearchWeb} disabled={!plan.analysis || webResearchBusy}>{webResearchBusy ? <LoaderCircle className="spin" size={13} /> : <Globe2 size={13} />}{webResearch ? "Refresh" : "Search docs"}</button></div>{webResearch ? <><p><ShieldCheck size={12} /> {webResearch.sources.length} source{webResearch.sources.length === 1 ? "" : "s"} found · no workspace code searched</p><ul className="studio-web-sources">{webResearch.sources.map((source) => <li key={source.url}><button onClick={() => onOpenUrl(source.url)} title={source.url}><Globe2 size={13} /><div><strong>{source.title}</strong><small>{source.snippet || source.url}</small></div><ChevronRight size={13} /></button></li>)}</ul></> : <p>Need current documentation? Cenro shows the exact search first, then adds only useful source snippets to this task.</p>}</section>
          <section><span className="header-eyebrow">DONE WHEN</span><ul className="studio-checklist">{plan.acceptance.map((item) => <li key={item}><Circle size={12} />{item}</li>)}</ul></section>
        </> : <div className="studio-inspector-empty"><Sparkles size={20} /><strong>Your plan will show up here.</strong><p>It is a brief you can inspect before any provider call or code edit.</p></div>}
      </div> : sidePanel === "changes" ? <div className="studio-inspector-body studio-change-list">
        {projectProposal ? <><div className="studio-change-summary"><strong>{projectProposal.summary}</strong><button onClick={onDiscardProject} title="Discard proposed changes"><X size={14} /></button></div>{projectProposal.files.map((file) => <div className={`studio-change-row ${selectedChangePath === file.path ? "selected" : ""}`} key={file.path}><label><input type="checkbox" checked={file.changed && selectedProjectPaths.includes(file.path)} disabled={!file.changed} onChange={() => onToggleProjectFile(file.path)} /><span /></label><button onClick={() => onSelectProjectFile(file.path)}><span className={file.action}>{file.action === "create" ? "A" : "M"}</span><div><strong>{file.path}</strong><small>{file.summary}</small></div></button></div>)}<div className="studio-apply-row"><span>{selectedProjectPaths.length} selected</span><button className="primary-button" onClick={onApplyProject} disabled={!selectedProjectPaths.length || isApplyingProject}>{isApplyingProject ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{isApplyingProject ? "Applying" : "Apply"}</button></div></> : <div className="studio-inspector-empty"><FileDiff size={20} /><strong>No changes proposed.</strong><p>Build an approved plan to create a reviewable diff. Files are never applied automatically.</p></div>}
      </div> : null}
    </aside>
  </section>;
}

function ArrowUpIcon() {
  return <ArrowRight size={17} style={{ transform: "rotate(-90deg)" }} />;
}

function GatewayView({
  workspacePath, workspaceName, files, git, selectedFile, tabs, composer, onComposerChange, onSubmit, isRunning, isRouting,
  providers, selectedModel, routerModel, system, snapshot, snapshotBusy, onChooseWorkspace, onOpenEditor, onOpenSettings,
  onOpenTerminal, onOpenChanges, onRefreshContext, onSelectMode, mode, onOpenFile
}: {
  workspacePath?: string; workspaceName: string; files: WorkspaceEntry[]; git?: RelayGitSnapshot; selectedFile?: string; tabs: CodeTab[];
  composer: string; onComposerChange: (value: string) => void; onSubmit: (event: FormEvent) => void; isRunning: boolean; isRouting: boolean;
  providers: CenroProvider[]; selectedModel: string; routerModel: string; system?: { memoryGb: number; cores: number; platform: string; architecture: string };
  snapshot?: GatewaySnapshot; snapshotBusy: boolean; onChooseWorkspace: () => void; onOpenEditor: () => void; onOpenSettings: () => void;
  onOpenTerminal: () => void; onOpenChanges: () => void; onRefreshContext: () => void; onSelectMode: (mode: Mode) => void; mode: Mode; onOpenFile: (path: string) => void;
}) {
  const [rightPanel, setRightPanel] = useState<"artifacts" | "changes" | "terminal">("artifacts");
  const localFiles = files.filter((entry) => entry.kind === "file");
  const configuredProvider = providers.find((provider) => provider.enabled && provider.configured !== false);
  const runtimeAvailable = Boolean(window.cenro?.getContextGatewaySnapshot);
  const changedCandidates = git?.changedFiles.slice(0, 5).map((file) => ({ path: file.path, reason: "Recent Git change" })) ?? [];
  const candidateFiles: Array<{ path: string; reason?: string; lines?: string; chars?: number }> = snapshot?.candidateFiles?.length
    ? snapshot.candidateFiles
    : [...tabs.map((tab) => ({ path: tab.relativePath, reason: tab.dirty ? "Open · unsaved evidence" : "Open for inspection" })), ...changedCandidates, ...(selectedFile ? [{ path: selectedFile, reason: "Focused file" }] : [])]
      .filter((candidate, index, all) => all.findIndex((item) => item.path === candidate.path) === index)
      .slice(0, 6);
  const redactions = snapshot?.redactions?.length ? snapshot.redactions : [
    { path: ".env*", reason: "secret-shaped file" },
    { path: "*.pem · *.key", reason: "credential material" },
    { path: "node_modules", reason: "generated dependency tree" }
  ];
  const gatewayAgents = snapshot?.agents?.length ? snapshot.agents : [
    { id: "intent", label: "Intent analyst", status: "ready" as const, detail: "Turns the request into acceptance criteria." },
    { id: "map", label: "Repository mapper", status: "waiting" as const, detail: "Maps symbols, imports, tests, and blast radius." },
    { id: "critic", label: "Plan critic", status: "waiting" as const, detail: "Checks the cloud plan against local evidence." },
    { id: "verify", label: "Verifier", status: "waiting" as const, detail: "Runs approved checks and reports only evidence." }
  ];
  const selectedTokens = snapshot?.estimatedTokens?.selected;
  const selectedCost = snapshot?.estimatedCost?.selected;
  const pendingChanges = git?.changedFiles.length ?? 0;
  const contextWorker = snapshot?.worker?.model || configuredProvider?.model || "No provider";
  const canDispatch = Boolean(configuredProvider && composer.trim());
  const indexedFiles = snapshot?.indexedFiles ?? localFiles.length;

  if (!workspacePath) return <section className="gateway-empty">
    <div className="gateway-empty-orb"><CenroMark /></div>
    <span className="header-eyebrow">CONTEXT GATEWAY</span>
    <h1>Connect the codebase before you call the cloud.</h1>
    <p>Cenro builds local repository awareness first, then gives a frontier worker precise evidence, tools, and verification—not a blind file dump.</p>
    <div className="gateway-empty-actions"><button className="gateway-primary" onClick={onChooseWorkspace}><FolderOpen size={16} /> Choose repository</button><button className="gateway-secondary" onClick={onOpenSettings}><Settings size={15} /> Set up a cloud worker</button></div>
    <small><LockKeyhole size={13} /> Local context stays local until you approve a handoff.</small>
  </section>;

  return <section className="gateway-view">
    <header className="gateway-titlebar">
      <div>
        <span className="header-eyebrow">CONTEXT GATEWAY <i /> LIVE EVIDENCE</span>
        <h1>Make the cloud worker feel like it already knows this codebase.</h1>
        <p>Local agents gather architecture, intent, Git history, and verification signals. The cloud worker gets a defensible brief—not a blind file dump.</p>
      </div>
      <div className="gateway-title-actions"><button className="gateway-quiet-button" onClick={onOpenEditor}><Code2 size={15} /> Open files</button><button className="gateway-quiet-button" onClick={onRefreshContext} disabled={!runtimeAvailable || snapshotBusy}>{snapshotBusy ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{runtimeAvailable ? "Refresh signal" : "Engine pending"}</button></div>
    </header>

    <section className="gateway-flow" aria-label="Cenro execution flow">
      <GatewayStage index="01" icon={Database} label="Local scan" detail={`${indexedFiles || "—"} files · ${snapshot?.indexedSymbols ?? "symbols pending"}`} active />
      <ArrowRight className="gateway-flow-arrow" size={17} />
      <GatewayStage index="02" icon={Layers3} label="Context capsule" detail={`${candidateFiles.length || "No"} evidence slices · ${redactions.length} protected`} active={Boolean(snapshot?.candidateFiles?.length)} />
      <ArrowRight className="gateway-flow-arrow" size={17} />
      <GatewayStage index="03" icon={Sparkles} label="Cloud worker" detail={configuredProvider ? `${configuredProvider.name} · ${contextWorker}` : "Connect OpenAI to enable"} active={Boolean(configuredProvider)} cloud />
      <ArrowRight className="gateway-flow-arrow" size={17} />
      <GatewayStage index="04" icon={TestTube2} label="Verify" detail={`${pendingChanges} change${pendingChanges === 1 ? "" : "s"} · diff before write`} active={Boolean(git?.available)} />
    </section>

    {!runtimeAvailable && <div className="gateway-runtime-note"><Activity size={15} /><div><strong>Context engine UI is ready; the local index bridge is still connecting.</strong><span>Until it lands, Cenro shows workspace, Git, and open-file evidence only. No cloud handoff is fabricated.</span></div></div>}

    <section className="gateway-composer-card">
      <div className="gateway-composer-heading"><div><span className="header-eyebrow">OUTCOME BRIEF</span><strong>What should the lead engineer make true?</strong></div><span className="gateway-privacy-pill"><ShieldCheck size={13} /> Context review first</span></div>
      <form onSubmit={onSubmit}>
        <textarea value={composer} onChange={(event) => onComposerChange(event.target.value)} placeholder="Example: Add a workspace-aware search command. Preserve the existing keyboard flow, cover errors, and prove it with tests." aria-label="Describe the outcome you want to build" />
        <div className="gateway-composer-footer">
          <div className="gateway-route-picker" role="group" aria-label="Task route">
            <button type="button" className={mode === "local" ? "selected" : ""} onClick={() => onSelectMode("local")}><LockKeyhole size={13} /> Local proof</button>
            <button type="button" className={mode === "smart" ? "selected" : ""} onClick={() => onSelectMode("smart")}><Workflow size={13} /> Gateway</button>
            <button type="button" className={mode === "cloud" ? "selected" : ""} onClick={() => onSelectMode("cloud")}><Globe2 size={13} /> Cloud lead</button>
          </div>
          <div className="gateway-composer-actions">
            <span>{routerModel || selectedModel ? <><Cpu size={13} /> Local context ready</> : <><TriangleAlert size={13} /> Local model optional</>}</span>
            {configuredProvider ? <button className="gateway-primary" type="submit" disabled={!canDispatch || isRunning || isRouting}>{isRunning || isRouting ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{isRouting ? "Preparing brief" : isRunning ? "Working" : "Review handoff"}</button> : <button type="button" className="gateway-primary" onClick={onOpenSettings}><Sparkles size={15} /> Connect cloud worker</button>}
          </div>
        </div>
      </form>
    </section>

    <div className="gateway-workbench">
      <section className="gateway-capsule-card">
        <div className="gateway-card-heading"><div><span className="header-eyebrow">CONTEXT CAPSULE</span><strong>Evidence the worker can trust.</strong></div><span className="gateway-badge">{candidateFiles.length} selected</span></div>
        <p className="gateway-card-copy">This is not a lossy repo summary. Cenro keeps a local map, then names the exact redacted evidence included in the receipt before a worker can receive it.</p>
        <div className="gateway-file-stack">
          {candidateFiles.length ? candidateFiles.map((file) => <button key={file.path} className="gateway-file-row" onClick={() => onOpenFile(file.path)}><FileCode2 size={14} /><span><strong>{file.path}</strong><small>{file.reason || file.lines || "Local evidence slice"}</small></span><ChevronRight size={14} /></button>) : <div className="gateway-file-empty"><FileSearchIcon /><span>Open a file, change a branch, or prepare a task to surface a first evidence set.</span></div>}
        </div>
        <div className="gateway-tools-row"><span><Search size={13} /> symbol map</span><span><FileCode2 size={13} /> exact sources</span><span><GitBranch size={13} /> Git evidence</span><span><TestTube2 size={13} /> verify plan</span></div>
      </section>

      <section className="gateway-ledger-card">
        <div className="gateway-card-heading"><div><span className="header-eyebrow">CONTEXT LEDGER</span><strong>Every cloud-bound byte is accountable.</strong></div><ShieldCheck size={17} /></div>
        <div className="gateway-ledger-grid">
          <LedgerMetric label="Repository reach" value={`${indexedFiles || "—"} files`} detail={snapshot?.indexState === "ready" ? "Index ready" : "Workspace scan"} />
          <LedgerMetric label="Selected context" value={selectedTokens ? `${formatCompactNumber(selectedTokens)} tok` : "Measuring"} detail={candidateFiles.length ? `${candidateFiles.length} evidence slices` : "No slices selected"} />
          <LedgerMetric label="Cloud preflight" value={selectedCost !== undefined ? formatCurrency(selectedCost) : "Awaiting key"} detail={configuredProvider ? `${configuredProvider.name} · estimate` : "No provider connected"} />
          <LedgerMetric label="Full repository" value="Stays local" detail={`${indexedFiles || "—"} files mapped on-device`} />
        </div>
        <div className="gateway-redactions"><div><span className="header-eyebrow">AUTOMATIC EXCLUSIONS</span><strong>{redactions.length} protected path{redactions.length === 1 ? "" : "s"}</strong></div><ul>{redactions.slice(0, 4).map((item) => <li key={item.path}><ShieldAlert size={12} /><span>{item.path}</span><small>{item.reason}</small></li>)}</ul></div>
      </section>

      <aside className="gateway-artifact-card">
        <div className="gateway-artifact-tabs" role="tablist" aria-label="Gateway artifacts"><button className={rightPanel === "artifacts" ? "active" : ""} onClick={() => setRightPanel("artifacts")} role="tab" aria-selected={rightPanel === "artifacts"}>Artifacts</button><button className={rightPanel === "changes" ? "active" : ""} onClick={() => setRightPanel("changes")} role="tab" aria-selected={rightPanel === "changes"}>Changes{pendingChanges ? <span>{pendingChanges}</span> : null}</button><button className={rightPanel === "terminal" ? "active" : ""} onClick={() => setRightPanel("terminal")} role="tab" aria-selected={rightPanel === "terminal"}>Terminal</button></div>
        {rightPanel === "artifacts" ? <div className="gateway-artifact-body"><div className="gateway-worker-card"><span className={configuredProvider ? "ready" : ""}>{configuredProvider ? <Check size={14} /> : <Globe2 size={14} />}</span><div><small>CLOUD LEAD</small><strong>{configuredProvider ? contextWorker : "No worker connected"}</strong><p>{configuredProvider ? `${configuredProvider.name} is consent-gated for every run.` : "Add a provider to prepare a reviewed handoff."}</p></div></div><div className="gateway-agent-list">{gatewayAgents.map((agent) => <div className="gateway-agent" key={agent.id}><span className={agent.status ?? "waiting"}><Bot size={13} /></span><div><strong>{agent.label}</strong><small>{agent.detail}</small></div><em>{agent.status === "ready" ? "ready" : agent.status === "working" ? "working" : "queued"}</em></div>)}</div></div> : rightPanel === "changes" ? <div className="gateway-artifact-body"><div className="gateway-mini-heading"><span className="header-eyebrow">REVIEW QUEUE</span><strong>{pendingChanges ? `${pendingChanges} local change${pendingChanges === 1 ? "" : "s"}` : "No pending local changes"}</strong></div>{git?.changedFiles.length ? <div className="gateway-change-list">{git.changedFiles.slice(0, 5).map((file) => <button key={file.path} onClick={onOpenChanges}><FileDiff size={13} /><span>{file.path}</span><b>{file.workingTree || file.index || "M"}</b></button>)}</div> : <p className="gateway-empty-copy">Cloud output is shown as a response first; files remain untouched until you create and apply a reviewed diff.</p>}<button className="gateway-link-button" onClick={onOpenChanges}>Open review surface <ArrowRight size={13} /></button></div> : <div className="gateway-artifact-body"><div className="gateway-terminal-preview"><span>$</span><code>{workspaceName}&gt; _</code></div><p className="gateway-empty-copy">The terminal stays yours. Agents can propose a command card, never execute one silently.</p><button className="gateway-link-button" onClick={onOpenTerminal}>Open reviewed terminal <ArrowRight size={13} /></button></div>}
      </aside>
    </div>
  </section>;
}

function GatewayStage({ index, icon: Icon, label, detail, active, cloud = false }: { index: string; icon: typeof Database; label: string; detail: string; active?: boolean; cloud?: boolean }) {
  return <div className={`gateway-stage ${active ? "active" : ""} ${cloud ? "cloud" : ""}`}><span className="gateway-stage-icon"><Icon size={15} /></span><div><small>{index}</small><strong>{label}</strong><p>{detail}</p></div>{active && <i />}</div>;
}

function LedgerMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="gateway-ledger-metric"><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>;
}

function FileSearchIcon() {
  return <Search size={16} />;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 1_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: value < 1 ? 3 : 2, maximumFractionDigits: value < 1 ? 3 : 2 }).format(value);
}

function WorkspaceView({
  workspacePath, files, selectedFile, fileLabel, tabs, content, dirty, updatedAt, search, searchResults, creatingFile, newFileName,
  onChooseWorkspace, onOpenFile, onContentChange, onSave, onCloseTab, onSelectTab, onSearchChange, onSearch, onCreateToggle, onCreateNameChange, onCreate,
  panel, onPanelChange, chatMessages, chatInput, onChatInputChange, isChatting, onSendChat, selectedModel,
  projectPrompt, onProjectPromptChange, isProposingProject, projectProposal, selectedProjectPaths, selectedChangePath,
  onProposeProject, onSelectProjectFile, onToggleProjectFile, onApplyProject, isApplyingProject, onDiscardProject,
  playbooks, activePlaybook, playbookValues, editingPlaybook, isDuplicatingPlaybook, onSelectPlaybook, onPlaybookValueChange, onApplyPlaybook, onEditPlaybook, onUpdatePlaybook, onResetPlaybooks
}: {
  workspacePath?: string; files: WorkspaceEntry[]; selectedFile?: string; fileLabel: string; content: string; dirty: boolean; updatedAt?: string;
  tabs: CodeTab[];
  search: string; searchResults: Array<{ relativePath: string; snippet: string; score: number }>; creatingFile: boolean; newFileName: string;
  onChooseWorkspace: () => void; onOpenFile: (path: string) => void; onContentChange: (value: string) => void; onSave: () => void;
  onCloseTab: (path: string) => void; onSelectTab: (path: string) => void; onSearchChange: (value: string) => void; onSearch: (event: FormEvent) => void; onCreateToggle: () => void; onCreateNameChange: (value: string) => void; onCreate: (event: FormEvent) => void;
  panel: WorkspacePanel; onPanelChange: (panel: WorkspacePanel) => void; chatMessages: RelayChatMessage[]; chatInput: string; onChatInputChange: (value: string) => void; isChatting: boolean; onSendChat: () => void; selectedModel: string;
  projectPrompt: string; onProjectPromptChange: (value: string) => void; isProposingProject: boolean; projectProposal?: RelayProjectProposal; selectedProjectPaths: string[]; selectedChangePath?: string;
  onProposeProject: () => void; onSelectProjectFile: (path: string) => void; onToggleProjectFile: (path: string) => void; onApplyProject: () => void; isApplyingProject: boolean; onDiscardProject: () => void;
  playbooks: Playbook[]; activePlaybook?: Playbook; playbookValues: Record<string, string>; editingPlaybook: boolean; isDuplicatingPlaybook: boolean; onSelectPlaybook: (id: string) => void; onPlaybookValueChange: (key: string, value: string) => void; onApplyPlaybook: (playbook: Playbook) => void; onEditPlaybook: () => void; onUpdatePlaybook: (patch: Partial<Playbook>) => void; onResetPlaybooks: () => void;
}) {
  if (!workspacePath) return <section className="empty-state large"><div className="empty-icon"><FolderOpen size={28} /></div><span className="header-eyebrow">YOUR LOCAL SPACE</span><h1>Start with a workspace folder.</h1><p>Cenro reads only the folder you choose. You can search, open, and edit text files without giving the renderer direct filesystem access.</p><button className="primary-button" onClick={onChooseWorkspace}><FolderOpen size={16} /> Choose workspace</button></section>;

  const reviewedFile = projectProposal?.files.find((file) => file.path === selectedChangePath) ?? projectProposal?.files[0];
  const reviewableCount = projectProposal?.files.filter((file) => file.changed).length ?? 0;

  return <section className="workspace-layout">
    <aside className="file-pane">
      <div className="pane-heading"><div><span className="header-eyebrow">FILES</span><strong>{workspacePath.split(/[/\\]/).pop()}</strong></div><div><button onClick={onChooseWorkspace} title="Choose another folder"><FolderOpen size={15} /></button><button onClick={onCreateToggle} title="Create file"><FilePlus2 size={15} /></button></div></div>
      {creatingFile && <form className="new-file-form" onSubmit={onCreate}><input autoFocus value={newFileName} onChange={(event) => onCreateNameChange(event.target.value)} placeholder="notes/idea.md" /><button type="submit" aria-label="Create file"><Check size={14} /></button><button type="button" onClick={onCreateToggle} aria-label="Cancel"><X size={14} /></button></form>}
      <form className="file-search" onSubmit={onSearch}><Search size={14} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search workspace" /><button type="submit" aria-label="Search"><ChevronRight size={14} /></button></form>
      {searchResults.length > 0 ? <div className="search-results">{searchResults.map((result) => <button key={result.relativePath} onClick={() => onOpenFile(result.relativePath)}><strong>{result.relativePath}</strong><span>{result.snippet}</span></button>)}</div> : <div className="file-tree">{files.length ? files.map((entry) => <button key={entry.relativePath} className={`file-row ${entry.kind} ${selectedFile === entry.relativePath ? "selected" : ""}`} style={{ paddingLeft: `${12 + entry.depth * 14}px` }} onClick={() => entry.kind === "file" && onOpenFile(entry.relativePath)} disabled={entry.kind === "folder"}><span>{entry.kind === "folder" ? <ChevronRight size={14} /> : <FileCode2 size={14} />}</span>{entry.name}</button>) : <p>No readable files found in this folder.</p>}</div>}
    </aside>
    <section className="editor-pane">
      <div className="editor-tabs" role="tablist" aria-label="Open files">
        {tabs.length ? tabs.map((tab) => <div className={`editor-tab ${selectedFile === tab.relativePath ? "active" : ""}`} role="tab" aria-selected={selectedFile === tab.relativePath} key={tab.relativePath}>
          <button onClick={() => onSelectTab(tab.relativePath)} title={tab.relativePath}><FileCode2 size={13} /><span>{tab.relativePath.split(/[/\\]/).pop()}</span>{tab.dirty && <i />}</button>
          <button className="tab-close" onClick={() => onCloseTab(tab.relativePath)} aria-label={`Close ${tab.relativePath}`}><X size={12} /></button>
        </div>) : <span className="empty-tabs">No file open</span>}
      </div>
      <div className="editor-bar"><div><FileCode2 size={15} /><strong>{fileLabel}</strong>{dirty && <span className="dirty-dot" title="Unsaved changes" />}</div><div>{updatedAt && <small>Updated {formatTime(updatedAt)}</small>}{selectedFile && <button className="save-button" onClick={onSave} disabled={!dirty}><Save size={14} /> Save</button>}</div></div>
      {selectedFile ? <div className="code-editor-host"><Editor
        height="100%" path={`inmemory://relay/workspace/${encodeURIComponent(selectedFile)}`} language={languageForPath(selectedFile)} value={content}
        theme="cenro-dark" onChange={(value) => onContentChange(value ?? "")}
        options={{ automaticLayout: true, fontSize: 13, lineHeight: 21, minimap: { enabled: false }, padding: { top: 15, bottom: 15 }, scrollBeyondLastLine: false, smoothScrolling: true, wordWrap: "off" }}
        onMount={(editor, monaco) => { editor.addAction({ id: "relay.save-active-file", label: "Save file", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => onSave() }); }}
      /></div> : <div className="empty-state"><div className="empty-icon"><PanelLeft size={24} /></div><h2>Open a file to inspect or edit it.</h2><p>Open any text file from the workspace. Cenro keeps edits local until you press Save.</p></div>}
    </section>
    <aside className="assistant-pane">
      <div className="assistant-tabs" role="tablist" aria-label="Assistant panel">
        <button className={`assistant-tab ${panel === "chat" ? "active" : ""}`} onClick={() => onPanelChange("chat")} role="tab" aria-selected={panel === "chat"}>Chat</button>
        <button className={`assistant-tab ${panel === "changes" ? "active" : ""}`} onClick={() => onPanelChange("changes")} role="tab" aria-selected={panel === "changes"}>Changes{reviewableCount > 0 && <span>{reviewableCount}</span>}</button>
        <button className={`assistant-tab ${panel === "playbooks" ? "active" : ""}`} onClick={() => onPanelChange("playbooks")} role="tab" aria-selected={panel === "playbooks"}>Playbooks</button>
      </div>
      {panel === "chat" ? <>
        <div className="chat-thread" aria-live="polite">
          {chatMessages.length ? chatMessages.map((message) => <article className={`chat-message ${message.role}`} key={message.id ?? `${message.role}-${message.createdAt}-${message.content.slice(0, 20)}`}><small>{message.role === "assistant" ? "CENRO · LOCAL" : "YOU"}</small><p>{message.content}</p></article>) : <div className="empty-side-pane"><CenroMark /><strong>Ask alongside your code.</strong><p>{selectedFile ? `Cenro can use ${fileLabel} and safe workspace excerpts.` : "Open a file, then ask Cenro to explain, debug, or plan a change."}</p></div>}
          {isChatting && <article className="chat-message assistant loading"><small>CENRO · LOCAL</small><p><LoaderCircle className="spin" size={14} /> Thinking with {selectedModel || "your local model"}…</p></article>}
        </div>
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); onSendChat(); }}>
          <textarea value={chatInput} onChange={(event) => onChatInputChange(event.target.value)} placeholder={selectedFile ? `Ask about ${fileLabel}…` : "Ask Cenro anything about this workspace…"} aria-label="Ask Cenro about your workspace" />
          <div><span><ShieldCheck size={13} /> Local only</span><button type="submit" disabled={!chatInput.trim() || isChatting || !selectedModel}>{isChatting ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}</button></div>
        </form>
      </> : panel === "changes" ? <div className="changes-panel">
        {!projectProposal ? <form className="project-composer" onSubmit={(event) => { event.preventDefault(); onProposeProject(); }}>
          <span className="header-eyebrow">CREATE IN THIS FOLDER</span><h3>Describe what you want to build.</h3><p>Cenro will prepare a multi-file change set. You inspect each file before anything is written.</p>
          <textarea value={projectPrompt} onChange={(event) => onProjectPromptChange(event.target.value)} placeholder="Make me a clean portfolio website, a study app, or a new API…" aria-label="Project request" />
          <button className="primary-button" type="submit" disabled={!projectPrompt.trim() || isProposingProject || !selectedModel}>{isProposingProject ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}{isProposingProject ? "Preparing changes" : "Generate changes"}</button>
          <small><ShieldCheck size={13} /> Files are only proposed here. Apply is always explicit.</small>
        </form> : <>
          <div className="changes-summary"><div><span className="header-eyebrow">REVIEW CHANGES</span><strong>{projectProposal.summary}</strong></div><button className="small-button" onClick={onDiscardProject}><X size={13} /> Discard</button></div>
          <div className="change-list">{projectProposal.files.map((file) => <div className={`change-row ${selectedChangePath === file.path ? "selected" : ""}`} key={file.path}>
            <label className="change-checkbox"><input type="checkbox" checked={file.changed && selectedProjectPaths.includes(file.path)} disabled={!file.changed} onChange={() => onToggleProjectFile(file.path)} /><span /></label>
            <button onClick={() => onSelectProjectFile(file.path)}><span className={file.action}>{file.action === "create" ? "A" : "M"}</span><div><strong>{file.path}</strong><small>{file.summary}</small></div></button>
          </div>)}</div>
          {reviewedFile ? <section className="change-review"><div><div><span className="header-eyebrow">{reviewedFile.action === "create" ? "NEW FILE" : "MODIFIED FILE"}</span><strong>{reviewedFile.path}</strong></div><small>{reviewedFile.summary}</small></div><div className="review-diff"><DiffEditor
            height="100%" language={languageForPath(reviewedFile.path)} original={reviewedFile.originalContent} modified={reviewedFile.content} theme="cenro-dark"
            originalModelPath={`inmemory://relay/review/original/${encodeURIComponent(reviewedFile.path)}`} modifiedModelPath={`inmemory://relay/review/modified/${encodeURIComponent(reviewedFile.path)}`}
            options={{ automaticLayout: true, readOnly: true, minimap: { enabled: false }, renderSideBySide: true, fontSize: 11, lineHeight: 18, scrollBeyondLastLine: false }}
          /></div></section> : <div className="empty-side-pane"><FileDiff size={20} /><strong>No file changes were proposed.</strong><p>Try a more specific project request.</p></div>}
          <div className="review-actions"><span><ShieldCheck size={13} /> {selectedProjectPaths.length} selected</span><button className="primary-button" onClick={onApplyProject} disabled={!selectedProjectPaths.length || isApplyingProject}>{isApplyingProject ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{isApplyingProject ? "Applying" : "Apply selected"}</button></div>
        </>}
      </div> : <PlaybooksPanel playbooks={playbooks} activePlaybook={activePlaybook} values={playbookValues} editing={editingPlaybook} isDuplicating={isDuplicatingPlaybook} onSelect={onSelectPlaybook} onValueChange={onPlaybookValueChange} onApply={onApplyPlaybook} onEdit={onEditPlaybook} onUpdate={onUpdatePlaybook} onReset={onResetPlaybooks} />}
    </aside>
  </section>;
}

function PlaybooksPanel({
  playbooks, activePlaybook, values, editing, isDuplicating, onSelect, onValueChange, onApply, onEdit, onUpdate, onReset
}: {
  playbooks: Playbook[]; activePlaybook?: Playbook; values: Record<string, string>; editing: boolean; isDuplicating: boolean; onSelect: (id: string) => void; onValueChange: (key: string, value: string) => void; onApply: (playbook: Playbook) => void; onEdit: () => void; onUpdate: (patch: Partial<Playbook>) => void; onReset: () => void;
}) {
  if (!activePlaybook) return <div className="empty-side-pane"><BookOpen size={20} /><strong>No playbooks yet.</strong><p>Reset the library to restore Cenro’s local starter playbooks.</p></div>;
  const Icon = playbookIcon(activePlaybook.icon);
  const builtIn = isBuiltInPlaybook(activePlaybook);
  return <section className="playbooks-panel">
    <div className="playbooks-head"><div><span className="header-eyebrow">PROMPT LIBRARY</span><strong>Use a proven starting point.</strong></div><button className="text-button" onClick={onReset}>Reset</button></div>
    <div className="playbook-list" role="listbox" aria-label="Cenro playbooks">
      {playbooks.map((playbook) => {
        const PlaybookIcon = playbookIcon(playbook.icon);
        return <button className={`playbook-row ${activePlaybook.id === playbook.id ? "selected" : ""}`} key={playbook.id} onClick={() => onSelect(playbook.id)} role="option" aria-selected={activePlaybook.id === playbook.id}><span><PlaybookIcon size={14} /></span><div><strong>{playbook.title}</strong><small>{isBuiltInPlaybook(playbook) ? `built-in · ${playbook.area}` : `custom · ${playbook.area}`}</small></div><ChevronRight size={14} /></button>;
      })}
    </div>
    <div className="playbook-detail">
      <div className="playbook-title"><span><Icon size={16} /></span><div><strong>{activePlaybook.title}</strong><p>{activePlaybook.description}</p>{builtIn && <small className="playbook-origin">Built-in playbook · duplicate it to customize</small>}</div></div>
      {editing ? <>
        <label className="playbook-field">Title<input value={activePlaybook.title} onChange={(event) => onUpdate({ title: event.target.value })} /></label>
        <label className="playbook-field">Structured brief<textarea value={activePlaybook.template} onChange={(event) => onUpdate({ template: event.target.value })} /></label>
      </> : <>
        {activePlaybook.variables.map((variable) => <label className="playbook-field" key={variable}>{variable.replace(/_/g, " ")}<input value={values[variable] ?? ""} onChange={(event) => onValueChange(variable, event.target.value)} placeholder={`Add ${variable.replace(/_/g, " ")}`} /></label>)}
        <div className="playbook-preview"><span>STRUCTURED BRIEF</span><p>{expandPlaybook(activePlaybook.template, values)}</p></div>
      </>}
      <div className="playbook-actions"><button className="small-button" onClick={onEdit} disabled={isDuplicating}>{isDuplicating ? <><LoaderCircle className="spin" size={13} /> Duplicating</> : builtIn ? "Duplicate & edit" : editing ? "Done" : "Edit"}</button>{!editing && <button className="primary-button" onClick={() => onApply(activePlaybook)}><Sparkles size={14} /> Use in task</button>}</div>
    </div>
  </section>;
}

function TaskView({
  area, mode, onModeChange, useWeb, onUseWebChange, selectedModel, models, onModelChange, composer, onComposerChange, isRunning, onSubmit, activeTask, onOpenUrl, onExport, workspaceName, teamEnabled, onTeamEnabledChange, providers, isRouting
}: {
  area: Area; mode: Mode; onModeChange: (mode: Mode) => void; useWeb: boolean; onUseWebChange: (enabled: boolean) => void; selectedModel: string; models: OllamaModel[]; onModelChange: (model: string) => void;
  composer: string; onComposerChange: (value: string) => void; isRunning: boolean; onSubmit: (event: FormEvent) => void; activeTask?: RelayTaskRecord; onOpenUrl: (url: string) => void; onExport: (task: RelayTaskRecord) => void; workspaceName: string; teamEnabled: boolean; onTeamEnabledChange: (enabled: boolean) => void; providers: CenroProvider[]; isRouting: boolean;
}) {
  const copy = areaCopy[area];
  const supportsWeb = mode === "smart" && !teamEnabled;
  const cloudReady = providers.some((provider) => provider.enabled && provider.configured !== false);
  const canRun = Boolean(composer.trim() && (teamEnabled ? selectedModel : mode === "cloud" ? cloudReady : selectedModel));
  return <section className="task-layout">
    <div className="task-intro"><span className="header-eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.hint}</p></div>
    <form className="task-composer" onSubmit={onSubmit}>
      <textarea value={composer} onChange={(event) => onComposerChange(event.target.value)} placeholder={area === "build" ? "Describe the change you want help with…" : area === "learn" ? "What do you want to understand?" : "What should Cenro investigate?"} aria-label="Task request" />
      <div className="task-controls">
        <div className="segmented" aria-label="Task route"><button type="button" className={mode === "local" ? "selected" : ""} onClick={() => { onModeChange("local"); onUseWebChange(false); }}><LockKeyhole size={13} /> Local</button><button type="button" className={`${mode === "smart" ? "selected" : ""} ${teamEnabled ? "disabled" : ""}`} disabled={teamEnabled} title={teamEnabled ? "Team workflow is always local" : "Use the local Smart Switch"} onClick={() => onModeChange("smart")}><WandSparkles size={13} /> Smart</button><button type="button" className={`${mode === "cloud" ? "selected" : ""} ${cloudReady && !teamEnabled ? "" : "disabled"}`} disabled={!cloudReady || teamEnabled} title={teamEnabled ? "Team workflow is always local" : cloudReady ? "Prepare a consent-gated cloud route with your configured provider" : "Configure a provider in Settings first"} onClick={() => { onModeChange("cloud"); onUseWebChange(false); }}><Globe2 size={13} /> Cloud</button></div>
        <label className={`web-toggle ${supportsWeb ? "" : "disabled"}`} title={supportsWeb ? "Allow an opt-in web search for this task" : "Smart mode enables opt-in web research"}><input type="checkbox" checked={supportsWeb && useWeb} disabled={!supportsWeb} onChange={(event) => onUseWebChange(event.target.checked)} /><span /> Use web sources</label>
        <label className="team-toggle" title="Runs locally: Researcher, Planner, Builder, then Reviewer one at a time"><input type="checkbox" checked={teamEnabled} onChange={(event) => { const enabled = event.target.checked; onTeamEnabledChange(enabled); if (enabled) { onModeChange("local"); onUseWebChange(false); } }} /><span><Workflow size={13} /> Team</span></label>
        <select value={selectedModel} onChange={(event) => onModelChange(event.target.value)} aria-label="Local worker model" disabled={mode === "cloud"}>{models.length ? models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>) : <option value="">No local model</option>}</select>
        <button className="run-button" type="submit" disabled={isRunning || isRouting || !canRun}>{isRunning || isRouting ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}{isRouting ? "Checking route" : isRunning ? "Working" : "Review route"}</button>
      </div>
      <p className="boundary-note"><ShieldCheck size={14} /> {teamEnabled ? "Team is a local-only sequential workflow: Researcher → Planner → Builder → Reviewer. It never uses Cloud or web tools." : mode === "local" ? "Local mode: prompt and workspace excerpts stay on this device." : mode === "cloud" ? "Cloud mode: Cenro prepares a provider route and shows the exact boundary before any request leaves this device." : useWeb ? "Smart mode: Cenro will request web research for this task; private workspace excerpts remain local unless you opt in on the receipt." : "Smart mode: a local router prepares a visible route receipt before work starts."}</p>
    </form>
    <div className="task-grid">
      <section className="response-card"><div className="card-heading"><div><span className="header-eyebrow">CENRO RESPONSE</span><strong>{activeTask ? shortTitle(activeTask.title) : "Ready when you are"}</strong></div>{activeTask && <span className={`status-chip ${activeTask.status}`}>{activeTask.status === "complete" ? <Check size={12} /> : <TriangleAlert size={12} />}{activeTask.status}</span>}</div>{activeTask ? <><article className={`markdown-response ${activeTask.status === "error" ? "error-text" : ""}`}>{activeTask.response ?? activeTask.error ?? "No response was recorded."}</article><div className="response-footer"><span><Clock3 size={13} /> {formatTime(activeTask.completedAt ?? activeTask.createdAt)}</span><button onClick={() => void navigator.clipboard.writeText(activeTask.response ?? activeTask.error ?? "")}><Copy size={13} /> Copy</button><button onClick={() => onExport(activeTask)}><ArrowDownToLine size={13} /> Export receipt</button></div></> : <div className="empty-response"><CenroMark /><p>Every task creates a local run record with its model, sources, and actions.</p></div>}</section>
      <TaskReceipt task={activeTask} onOpenUrl={onOpenUrl} workspaceName={workspaceName} />
    </div>
  </section>;
}

function TaskReceipt({ task, onOpenUrl, workspaceName }: { task?: RelayTaskRecord; onOpenUrl: (url: string) => void; workspaceName: string }) {
  return <aside className="receipt-card"><div className="card-heading"><div><span className="header-eyebrow">TASK RECEIPT</span><strong>Evidence and actions</strong></div><ShieldCheck size={18} /></div>{task ? <><div className="receipt-summary"><div><small>MODEL</small><strong>{task.model}</strong></div><div><small>ROUTE</small><strong>{task.mode}</strong></div><div><small>SOURCES</small><strong>{task.sources.length}</strong></div></div><section className="receipt-section"><h3>Sources</h3>{task.sources.length ? task.sources.map((source) => <button className="source-row" key={source.id} onClick={() => source.type === "web" ? onOpenUrl(source.location) : undefined} disabled={source.type !== "web"}><span className={source.type}>{source.type === "web" ? <Globe2 size={13} /> : <FileCode2 size={13} />}</span><div><strong>{source.title}</strong><small>{source.type === "web" ? source.location : `${workspaceName}/${source.location}`}</small></div>{source.type === "web" && <ChevronRight size={14} />}</button>) : <p>No source excerpts were needed for this task.</p>}</section><section className="receipt-section"><h3>Actions</h3>{task.actions.map((action, index) => <div className="action-row" key={`${action.name}-${index}`}><span className={action.status}><CheckCircle2 size={13} /></span><div><strong>{action.name}</strong><small>{action.detail}</small></div>{action.durationMs !== undefined && <time>{Math.max(1, Math.round(action.durationMs / 1000))}s</time>}</div>)}</section></> : <div className="empty-receipt"><LockKeyhole size={22} /><p>Run a task to see its data boundary, evidence, model, and action log.</p></div>}</aside>;
}

function GatewayWebResearchModal({ draft, busy, onCancel, onApprove }: { draft: { contextPackId: string; query: string }; busy: boolean; onCancel: () => void; onApprove: (query: string) => void }) {
  const [query, setQuery] = useState(draft.query);
  const [approved, setApproved] = useState(false);
  return <div className="route-backdrop" role="presentation"><section className="route-modal gateway-web-modal" role="dialog" aria-modal="true" aria-label="Approve web research">
    <div className="route-title"><span className="route-orb external"><Globe2 size={18} /></span><div><span className="header-eyebrow">WEB RESEARCH RECEIPT</span><h2>Approve this exact web query.</h2></div><button className="route-close" onClick={onCancel} aria-label="Cancel web research"><X size={17} /></button></div>
    <p className="route-reason">Cenro will send only this query to DuckDuckGo and keep up to five citation snippets in memory for this plan. No workspace file, local path, API key, or code is part of this search.</p>
    <label className="gateway-web-query">Search query<textarea value={query} onChange={(event) => setQuery(event.target.value.slice(0, 300))} aria-label="Web research query" /><small>{query.length}/300 characters</small></label>
    <div className="gateway-web-boundary"><ShieldCheck size={16} /><div><strong>External search is separate from the cloud coding call.</strong><p>After research returns, you can inspect its sources. A later cloud receipt will list any selected source snippets attached to the coding brief.</p></div></div>
    <label className="workspace-consent gateway-workspace-consent"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span><strong>I approve sending this exact query to the web search provider.</strong><small>This does not send workspace code. Search snippets are treated as untrusted evidence, never instructions.</small></span></label>
    <div className="route-actions"><button className="small-button" onClick={onCancel} disabled={busy}>Cancel</button><button className="primary-button" disabled={!approved || !query.trim() || busy} onClick={() => onApprove(query)}>{busy ? <LoaderCircle className="spin" size={15} /> : <Globe2 size={15} />}{busy ? "Searching" : "Approve & search"}</button></div>
  </section></div>;
}

function GatewayHandoffModal({ handoff, onCancel, onApprove }: { handoff: GatewayHandoff; onCancel: () => void; onApprove: () => void }) {
  const { analysis, receipt } = handoff;
  const [includeWorkspace, setIncludeWorkspace] = useState(false);
  const preflight = receipt.costPreflight;
  const maxCost = preflight.estimatedMaximumCostUsd;
  const excluded = analysis.exclusions.reduce((total, item) => total + item.count, 0);
  const budgetBlocked = preflight.budgetStatus === "exceeds";
  const council = analysis.localCouncil;
  const councilLocalRoles = council?.stages.filter((stage) => stage.source === "local").length ?? 0;
  const councilBrief = receipt.dataBoundary.councilBrief;
  const webResearch = receipt.dataBoundary.webResearch;
  const visibleContextTokens = analysis.estimatedContextTokens + councilBrief.estimatedTokens + webResearch.estimatedTokens;
  return <div className="route-backdrop" role="presentation"><section className="route-modal gateway-handoff-modal" role="dialog" aria-modal="true" aria-label="Context Gateway cloud handoff receipt">
    <div className="route-title"><span className="route-orb external"><Globe2 size={18} /></span><div><span className="header-eyebrow">CONTEXT GATEWAY HANDOFF</span><h2>Approve this exact cloud boundary.</h2></div><button className="route-close" onClick={onCancel} aria-label="Cancel Gateway handoff"><X size={17} /></button></div>
    <p className="route-reason">Cenro mapped the repository locally, redacted known secret formats, and selected evidence for this outcome. Nothing has left this device.</p>
    <div className="route-facts gateway-handoff-facts"><div><small>PROVIDER</small><strong>{receipt.provider.label}</strong></div><div><small>MODEL</small><strong>{receipt.provider.model}</strong></div><div><small>CONTEXT</small><strong>{visibleContextTokens.toLocaleString()} est. tokens</strong></div></div>
    <div className="gateway-handoff-boundary">
      <div className="gateway-handoff-boundary-head"><ShieldCheck size={17} /><div><strong>These redacted local sources are eligible to leave your device.</strong><p>{receipt.dataBoundary.contextCharacters.toLocaleString()} context characters · {receipt.dataBoundary.selectedFiles.length} selected source{receipt.dataBoundary.selectedFiles.length === 1 ? "" : "s"} · {excluded} protected item{excluded === 1 ? "" : "s"} excluded before packaging.</p></div></div>
      <ul className="gateway-handoff-files">{receipt.dataBoundary.selectedFiles.slice(0, 10).map((file) => <li key={file.relativePath}><FileCode2 size={13} /><span>{file.relativePath}</span><small>{file.characters.toLocaleString()} chars · {file.estimatedTokens.toLocaleString()} tok{file.redactions ? ` · ${file.redactions} redacted` : ""}</small></li>)}</ul>
      {receipt.dataBoundary.selectedFiles.length > 10 && <small className="gateway-handoff-more">+ {receipt.dataBoundary.selectedFiles.length - 10} more source{receipt.dataBoundary.selectedFiles.length - 10 === 1 ? "" : "s"} in this receipt</small>}
      {councilBrief.included && <small className="gateway-handoff-more">+ {councilBrief.characters.toLocaleString()} local project analysis characters ({councilBrief.estimatedTokens.toLocaleString()} est. tokens); no source code is included in this planning brief.</small>}
      {webResearch.included && <small className="gateway-handoff-more">+ {webResearch.sourceCount} separately-consented web citation{webResearch.sourceCount === 1 ? "" : "s"} ({webResearch.characters.toLocaleString()} characters · {webResearch.estimatedTokens.toLocaleString()} est. tokens). No workspace code was used to search the web.</small>}
    </div>
    <section className="gateway-preflight"><span className="header-eyebrow">COST PREFLIGHT</span><div><strong>{maxCost === undefined ? `${preflight.maximumBillableTokens.toLocaleString()} tokens maximum` : `${formatCurrency(maxCost)} maximum estimate`}</strong><small>{preflight.estimateStatus === "priced-estimate" ? "Estimate only—not actual spend. Actual usage is recorded only if the provider returns it." : "No price card is configured, so Cenro will record provider usage without inventing a dollar amount."}</small></div></section>
    {council && <section className="gateway-preflight gateway-council-receipt"><span className="header-eyebrow">LOCAL PROJECT ANALYSIS</span><div><strong>{council.status === "completed" ? `${councilLocalRoles} sequential local role${councilLocalRoles === 1 ? "" : "s"} prepared this receipt` : "Metadata-only local fallback retained"}</strong><small>{council.model ? `${council.model} made ${council.localCallsAttempted} local call${council.localCallsAttempted === 1 ? "" : "s"}. ` : "No installed local analysis model was used. "}No source code was sent to local analysis. {shortTitle(council.summary.selectionRationale, 180)}</small></div></section>}
    <label className="workspace-consent gateway-workspace-consent"><input type="checkbox" checked={includeWorkspace} onChange={(event) => setIncludeWorkspace(event.target.checked)} /><span><strong>I approve sending the listed redacted context to {receipt.provider.label}.</strong><small>This consent is single-use and expires at {formatTime(receipt.expiresAt)}. Changing the task, provider, model, or context requires a new receipt.</small></span></label>
    {budgetBlocked && <p className="gateway-budget-warning"><TriangleAlert size={14} /> This run exceeds its configured budget cap. Create a smaller receipt or raise the cap before approving.</p>}
    <div className="route-actions"><button className="small-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={!includeWorkspace || budgetBlocked} onClick={onApprove}><ShieldCheck size={15} /> Approve &amp; call cloud lead</button></div>
  </section></div>;
}

function RouteReceiptModal({ receipt, request, onCancel, onApprove }: { receipt: RouteReceipt; request: PendingTask; onCancel: () => void; onApprove: (includeWorkspace: boolean) => void }) {
  const external = receipt.requiresExternalConsent || receipt.route === "cloud" || receipt.route === "web";
  const model = receipt.workerModel || request.model || "selected provider model";
  const [includeWorkspace, setIncludeWorkspace] = useState(false);
  return <div className="route-backdrop" role="presentation"><section className="route-modal" role="dialog" aria-modal="true" aria-label="Smart Switch route receipt">
    <div className="route-title"><span className={`route-orb ${external ? "external" : ""}`}>{external ? <Globe2 size={18} /> : <CenroMark />}</span><div><span className="header-eyebrow">SMART SWITCH RECEIPT</span><h2>{external ? "Review the external boundary." : "Your task stays local."}</h2></div><button className="route-close" onClick={onCancel} aria-label="Cancel task"><X size={17} /></button></div>
    <p className="route-reason">{receipt.reason || "Cenro selected the least-expensive route that can complete this request."}</p>
    <div className="route-facts"><div><small>WORKER</small><strong>{model}</strong></div><div><small>ROUTE</small><strong>{receipt.route}</strong></div><div><small>CONFIDENCE</small><strong>{typeof receipt.confidence === "number" ? `${Math.round(receipt.confidence)}%` : "Fallback"}</strong></div></div>
    <div className="route-boundary"><ShieldCheck size={17} /><div><strong>{external ? "Nothing is sent until you approve." : "Private workspace context stays here."}</strong><p>{receipt.dataBoundary?.note || (external ? `${receipt.dataBoundary?.characterCount ?? 0} characters${receipt.dataBoundary?.files?.length ? ` from ${receipt.dataBoundary.files.length} selected file${receipt.dataBoundary.files.length === 1 ? "" : "s"}` : ""} are eligible for this route.` : "The routing model only received your request and safe workspace metadata.")}</p>{receipt.dataBoundary?.files?.length ? <ul>{receipt.dataBoundary.files.slice(0, 4).map((file) => <li key={file}>{file}</li>)}</ul> : null}</div></div>
    {external && receipt.dataBoundary?.files?.length ? <label className="workspace-consent"><input type="checkbox" checked={includeWorkspace} onChange={(event) => setIncludeWorkspace(event.target.checked)} /><span><strong>Include the listed workspace excerpts</strong><small>Off by default. If left off, Cenro sends no workspace code to the external provider.</small></span></label> : null}
    {receipt.requestedTools?.length ? <div className="route-tools"><span>REQUESTED TOOLS</span>{receipt.requestedTools.map((tool) => <b key={tool}>{tool.replace(/-/g, " ")}</b>)}</div> : null}
    {request.team && <div className="team-stages"><span className="header-eyebrow">SEQUENTIAL TEAM</span><div><b>1</b> Researcher <ChevronRight size={13} /><b>2</b> Planner <ChevronRight size={13} /><b>3</b> Builder <ChevronRight size={13} /><b>4</b> Reviewer</div></div>}
    <div className="route-actions"><button className="small-button" onClick={onCancel}>Cancel</button><button className="primary-button" onClick={() => onApprove(includeWorkspace)}>{external ? <><ShieldCheck size={15} /> Approve & continue</> : <><Send size={15} /> Run locally</>}</button></div>
  </section></div>;
}

function StudioTerminalDock({ workspaceName, ready, running, command, output, proposal, onClose, onCommandChange, onRun, onReview, onData, onResize, onStart, onStop, onClear, onApproveProposal, onRejectProposal }: {
  workspaceName: string; ready: boolean; running: boolean; command: string; output: string[]; proposal?: TerminalProposal;
  onClose: () => void; onCommandChange: (value: string) => void; onRun: () => void; onReview: () => void;
  onData: (data: string) => void; onResize: (columns: number, rows: number) => void; onStart: () => void; onStop: () => void; onClear: () => void;
  onApproveProposal: () => void; onRejectProposal: () => void;
}) {
  return <section className="studio-terminal-dock" aria-label="Integrated PowerShell terminal">
    <header className="studio-terminal-head">
      <div><span className={`terminal-dot ${running ? "online" : ""}`} /><strong>PowerShell</strong><small>{workspaceName}</small></div>
      <div><button type="button" onClick={onClear} title="Clear terminal output">Clear</button>{running
        ? <button type="button" onClick={onStop}>Stop</button>
        : <button type="button" onClick={onStart} disabled={!ready}><Terminal size={13} /> Start</button>}<button type="button" onClick={onClose} title="Close terminal"><X size={14} /></button></div>
    </header>
    <div className="studio-terminal-screen"><XtermSurface output={output} supported={ready} onData={onData} onResize={onResize} /></div>
    {proposal && <div className={`studio-terminal-proposal ${proposal.riskLevel}`}>
      <div><ShieldCheck size={14} /><strong>AI command review</strong><span>{proposal.riskLevel} risk</span></div>
      <code>{proposal.command}</code><p>{proposal.reason}</p>
      <div className="studio-terminal-proposal-actions"><button type="button" onClick={onRejectProposal}>Reject</button><button type="button" onClick={() => void navigator.clipboard.writeText(proposal.command)}><Copy size={13} /> Copy</button><button type="button" onClick={onApproveProposal}><Check size={13} /> Run reviewed</button></div>
    </div>}
    <form className="studio-terminal-input" onSubmit={(event) => { event.preventDefault(); onRun(); }}>
      <span>›</span><input value={command} onChange={(event) => onCommandChange(event.target.value)} disabled={!ready} placeholder={ready ? "Type a PowerShell command" : "Terminal service unavailable"} aria-label="Terminal command" />
      <button type="button" onClick={onReview} disabled={!ready || !command.trim()} title="Turn this into a review card"><ShieldCheck size={14} /> Review</button>
      <button type="submit" disabled={!ready || !command.trim()} title="Run your command"><Send size={14} /></button>
    </form>
  </section>;
}

function TerminalView({ workspaceName, workspacePath, command, output, running, supported, proposal, onCommandChange, onRun, onReview, onTerminalData, onResize, onApproveProposal, onRejectProposal, onStart, onStop, onClear }: {
  workspaceName: string; workspacePath?: string; command: string; output: string[]; running: boolean; supported: boolean; proposal?: TerminalProposal; onCommandChange: (value: string) => void; onRun: () => void; onReview: () => void; onTerminalData: (data: string) => void; onResize: (columns: number, rows: number) => void; onApproveProposal: () => void; onRejectProposal: () => void; onStart: () => void; onStop: () => void; onClear: () => void;
}) {
  const ready = supported && Boolean(workspacePath);
  return <section className="terminal-layout">
    <div className="task-intro"><span className="header-eyebrow">YOUR TERMINAL</span><h1>Use PowerShell without giving up control.</h1><p>This is your interactive terminal. Type and run your own commands normally. Cenro may propose a command, but it can never run one without a visible review and your click.</p></div>
    <div className="terminal-shell">
      <header><div><span className={`terminal-dot ${running ? "online" : ""}`} /><strong>PowerShell</strong><small>{workspacePath ? workspaceName : "Choose a workspace to set a working folder"}</small></div><div><button className="small-button" onClick={onClear}>Clear</button>{running ? <button className="small-button" onClick={onStop}>Stop</button> : <button className="primary-button" onClick={onStart} disabled={!ready}><Terminal size={14} /> Start</button>}</div></header>
      <XtermSurface output={output} supported={supported} onData={onTerminalData} onResize={onResize} />
      <form className="terminal-input" onSubmit={(event) => { event.preventDefault(); onRun(); }}><span>›</span><input value={command} onChange={(event) => onCommandChange(event.target.value)} placeholder={!supported ? "Terminal service unavailable" : workspacePath ? "Type a PowerShell command" : "Choose a workspace first"} disabled={!ready} aria-label="Terminal command" /><button className="terminal-review" type="button" title="Create a review card instead of running this command" onClick={onReview} disabled={!ready || !command.trim()}><ShieldCheck size={14} /> Review</button><button type="submit" disabled={!ready || !command.trim()}><Send size={15} /></button></form>
    </div>
    {proposal && <section className={`terminal-proposal ${proposal.riskLevel}`}><div className="terminal-proposal-head"><span><ShieldCheck size={15} /></span><div><span className="header-eyebrow">COMMAND REVIEW</span><strong>{proposal.riskLevel} risk · {proposal.cwd}</strong></div></div><pre>{proposal.command}</pre><p>{proposal.reason}</p><div><button className="small-button" onClick={onRejectProposal}>Reject</button><button className="small-button" onClick={() => void navigator.clipboard.writeText(proposal.command)}><Copy size={13} /> Copy</button><button className="primary-button" onClick={onApproveProposal}><Check size={14} /> Run reviewed command</button></div></section>}
    <div className="terminal-safety"><ShieldCheck size={16} /><div><strong>AI command proposals are review-only.</strong><p>Each proposal must name its working folder and risk. You choose Run, Copy, or Reject; Cenro never presses Enter for you. Approved commands run in your PowerShell session and can affect paths outside this workspace.</p></div></div>
  </section>;
}

function XtermSurface({ output, supported, onData, onResize }: { output: string[]; supported: boolean; onData: (data: string) => void; onResize: (columns: number, rows: number) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const outputLengthRef = useRef(0);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);

  useEffect(() => { onDataRef.current = onData; }, [onData]);
  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);

  useEffect(() => {
    if (!supported || !hostRef.current) return;
    const terminal = new XtermTerminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Cascadia Code, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      theme: { background: "#111316", foreground: "#dfe7e3", cursor: "#8ce0bd", black: "#111316", brightBlack: "#6c756f", green: "#8ce0bd", brightGreen: "#b5f4d4", blue: "#8aafff", brightBlue: "#b2c9ff", red: "#ff9ca4", brightRed: "#ffc1c7", white: "#dfe7e3", brightWhite: "#ffffff" },
      convertEol: true,
      allowProposedApi: false
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(hostRef.current);
    const fitTerminal = () => {
      fit.fit();
      onResizeRef.current(terminal.cols, terminal.rows);
    };
    fitTerminal();
    terminalRef.current = terminal;
    const disposable = terminal.onData((data) => onDataRef.current(data));
    const resize = () => fitTerminal();
    window.addEventListener("resize", resize);
    return () => {
      disposable.dispose();
      window.removeEventListener("resize", resize);
      terminal.dispose();
      terminalRef.current = null;
      outputLengthRef.current = 0;
    };
  }, [supported]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (output.length < outputLengthRef.current) {
      terminal.reset();
      outputLengthRef.current = 0;
    }
    const newOutput = output.slice(outputLengthRef.current).join("");
    if (newOutput) terminal.write(newOutput);
    outputLengthRef.current = output.length;
  }, [output]);

  if (!supported) return <pre className="terminal-output" aria-live="polite">Terminal service unavailable in this build. The workspace and AI remain unable to execute shell commands.{"\n"}</pre>;
  return <div className="xterm-host" ref={hostRef} aria-label="Interactive PowerShell terminal" />;
}

function BuildRouteComposer({
  mode, onModeChange, useWeb, onUseWebChange, selectedModel, models, onModelChange, composer, onComposerChange, isRunning, isRouting, onSubmit, providers, activeTask, onOpenProjectReview
}: {
  mode: Mode; onModeChange: (mode: Mode) => void; useWeb: boolean; onUseWebChange: (enabled: boolean) => void; selectedModel: string; models: OllamaModel[]; onModelChange: (model: string) => void;
  composer: string; onComposerChange: (value: string) => void; isRunning: boolean; isRouting: boolean; onSubmit: (event: FormEvent) => void; providers: CenroProvider[]; activeTask?: RelayTaskRecord; onOpenProjectReview: () => void;
}) {
  const supportsWeb = mode === "smart";
  const cloudReady = providers.some((provider) => provider.enabled && provider.configured !== false);
  const canRun = Boolean(composer.trim() && (mode === "cloud" ? cloudReady : selectedModel));
  const buildTask = activeTask?.area === "build" ? activeTask : undefined;
  return <section className="build-route-card">
    <div className="card-heading">
      <div><span className="header-eyebrow">CODING ASSISTANT</span><strong>Ask, route, then review the work.</strong></div>
      <button type="button" className="small-button" onClick={onOpenProjectReview}><FolderOpen size={14} /> Multi-file project</button>
    </div>
    <form className="build-route-composer" onSubmit={onSubmit}>
      <textarea value={composer} onChange={(event) => onComposerChange(event.target.value)} placeholder="Plan a feature, review a change, explain an error, or design a project…" aria-label="Coding task request" />
      <div className="task-controls build-route-controls">
        <div className="segmented" aria-label="Coding task route">
          <button type="button" className={mode === "local" ? "selected" : ""} onClick={() => { onModeChange("local"); onUseWebChange(false); }}><LockKeyhole size={13} /> Local</button>
          <button type="button" className={mode === "smart" ? "selected" : ""} onClick={() => onModeChange("smart")}><WandSparkles size={13} /> Smart</button>
          <button type="button" className={`${mode === "cloud" ? "selected" : ""} ${cloudReady ? "" : "disabled"}`} disabled={!cloudReady} title={cloudReady ? "Prepare a consent-gated cloud route" : "Configure a provider in Settings first"} onClick={() => { onModeChange("cloud"); onUseWebChange(false); }}><Globe2 size={13} /> Cloud</button>
        </div>
        <label className={`web-toggle ${supportsWeb ? "" : "disabled"}`} title={supportsWeb ? "Allow an opt-in web search for this task" : "Smart mode enables opt-in web research"}><input type="checkbox" checked={supportsWeb && useWeb} disabled={!supportsWeb} onChange={(event) => onUseWebChange(event.target.checked)} /><span /> Use web sources</label>
        <select value={selectedModel} onChange={(event) => onModelChange(event.target.value)} aria-label="Local builder model" disabled={mode === "cloud"}>{models.length ? models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>) : <option value="">No local model</option>}</select>
        <button className="run-button" type="submit" disabled={isRunning || isRouting || !canRun}>{isRunning || isRouting ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}{isRouting ? "Checking route" : isRunning ? "Working" : "Review route"}</button>
      </div>
      <p className="boundary-note"><ShieldCheck size={14} /> {mode === "local" ? "Local planning and code context stay on this device. File changes still require a reviewed diff." : mode === "cloud" ? "Cloud use always shows the provider, model, selected paths, and character count before anything leaves this device." : useWeb ? "Smart Switch will request web research; private workspace code stays local unless you opt in on the receipt." : "Smart Switch uses your local router and shows a route receipt before work starts."}</p>
    </form>
    {buildTask && <div className="build-route-result"><div><span className="header-eyebrow">LAST CODING RESPONSE</span><strong>{shortTitle(buildTask.title)}</strong></div><p>{shortTitle(buildTask.response ?? buildTask.error ?? "No response was recorded.", 260)}</p><button type="button" onClick={() => void navigator.clipboard.writeText(buildTask.response ?? buildTask.error ?? "")}><Copy size={13} /> Copy</button></div>}
  </section>;
}

function BuildView({
  workspacePath, files, selectedFile, editTarget, onTargetChange, prompt, onPromptChange, onPropose, isProposing, proposal, onApply, onDiscard, git, onRefreshGit,
  mode, onModeChange, useWeb, onUseWebChange, selectedModel, models, onModelChange, composer, onComposerChange, isRunning, isRouting, onSubmit, activeTask, providers, onOpenProjectReview
}: {
  workspacePath?: string; files: WorkspaceEntry[]; selectedFile?: string; editTarget: string; onTargetChange: (value: string) => void; prompt: string; onPromptChange: (value: string) => void; onPropose: () => void; isProposing: boolean; proposal?: RelayEditProposal; onApply: () => void; onDiscard: () => void; git?: RelayGitSnapshot; onRefreshGit: () => void;
  mode: Mode; onModeChange: (mode: Mode) => void; useWeb: boolean; onUseWebChange: (enabled: boolean) => void; selectedModel: string; models: OllamaModel[]; onModelChange: (model: string) => void; composer: string; onComposerChange: (value: string) => void; isRunning: boolean; isRouting: boolean; onSubmit: (event: FormEvent) => void; activeTask?: RelayTaskRecord; providers: CenroProvider[]; onOpenProjectReview: () => void;
}) {
  const editableFiles = files.filter((item) => item.kind === "file");
  if (!workspacePath) return <section className="empty-state large"><div className="empty-icon"><Code2 size={28} /></div><span className="header-eyebrow">SAFE BUILD LOOP</span><h1>Choose a workspace before proposing an edit.</h1><p>Cenro needs one explicit project folder and one explicit target file. It will never apply an edit without showing you the change first.</p></section>;
  return <section className="build-layout">
    <div className="task-intro"><span className="header-eyebrow">SAFE BUILD LOOP</span><h1>Plan with any route. Write only through review.</h1><p>Use the coding assistant for local, Smart, or consent-gated cloud work. When it is time to change files, Cenro still presents a one-file or multi-file diff for your approval.</p></div>
    <BuildRouteComposer mode={mode} onModeChange={onModeChange} useWeb={useWeb} onUseWebChange={onUseWebChange} selectedModel={selectedModel} models={models} onModelChange={onModelChange} composer={composer} onComposerChange={onComposerChange} isRunning={isRunning} isRouting={isRouting} onSubmit={onSubmit} providers={providers} activeTask={activeTask} onOpenProjectReview={onOpenProjectReview} />
    <div className="build-grid">
      <section className="edit-studio"><div className="card-heading"><div><span className="header-eyebrow">PROPOSE AN EDIT</span><strong>One file at a time</strong></div><FileDiff size={18} /></div><div className="edit-form"><label>Target file<select value={editTarget} onChange={(event) => onTargetChange(event.target.value)}>{!editTarget && <option value="">Choose a file</option>}{editableFiles.map((file) => <option key={file.relativePath} value={file.relativePath}>{file.relativePath}</option>)}</select></label><label>What should change?<textarea value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={selectedFile ? `For ${selectedFile}, describe the change…` : "Describe the change you want Cenro to make…"} /></label><button className="run-button" onClick={onPropose} disabled={!editTarget || !prompt.trim() || isProposing}>{isProposing ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}{isProposing ? "Preparing proposal" : "Generate reviewed edit"}</button><p><ShieldCheck size={13} /> Cenro cannot change another file, run a command, or save this proposal until you review and apply it.</p></div></section>
      <GitCard git={git} onRefresh={onRefreshGit} />
    </div>
    {proposal ? <section className="proposal-card"><div className="card-heading"><div><span className="header-eyebrow">REVIEWED PROPOSAL</span><strong>{proposal.relativePath}</strong></div><div className="proposal-actions"><button className="small-button" onClick={onDiscard}><X size={14} /> Discard</button><button className="primary-button" onClick={onApply} disabled={!proposal.changed}><Check size={14} /> {proposal.changed ? "Apply edit" : "No changes"}</button></div></div><p className="proposal-summary">{proposal.summary}</p><div className="build-diff-host"><DiffEditor height="100%" language={languageForPath(proposal.relativePath)} original={proposal.originalContent} modified={proposal.content} theme="cenro-dark" originalModelPath={`inmemory://cenro/single-review/original/${encodeURIComponent(proposal.relativePath)}`} modifiedModelPath={`inmemory://cenro/single-review/modified/${encodeURIComponent(proposal.relativePath)}`} options={{ automaticLayout: true, readOnly: true, minimap: { enabled: false }, renderSideBySide: true, fontSize: 12, lineHeight: 19, scrollBeyondLastLine: false }} /></div><div className="proposal-footer"><ShieldCheck size={14} /><span>Nothing is written until you choose <strong>Apply edit</strong>.</span></div></section> : <section className="build-empty"><GitBranch size={23} /><div><strong>Review comes before write.</strong><p>Generate an edit for a selected file, compare the old and new contents, then apply it explicitly.</p></div></section>}
  </section>;
}

function GitCard({ git, onRefresh }: { git?: RelayGitSnapshot; onRefresh: () => void }) {
  return <section className="git-card"><div className="card-heading"><div><span className="header-eyebrow">REPOSITORY</span><strong>{git?.available ? git.branch ?? "Git repository" : "Git status"}</strong></div><button className="icon-refresh" onClick={onRefresh} title="Refresh Git status"><RefreshCw size={14} /></button></div>{git?.available ? <><div className="git-summary"><div><small>CHANGED</small><strong>{git.changedFiles.length}</strong></div><div><small>AHEAD</small><strong>{git.ahead ?? 0}</strong></div><div><small>BEHIND</small><strong>{git.behind ?? 0}</strong></div></div><div className="git-files">{git.changedFiles.length ? git.changedFiles.slice(0, 8).map((file) => <div key={file.path}><span>{file.index}{file.workingTree}</span><strong>{file.path}</strong></div>) : <p><CheckCircle2 size={14} /> No uncommitted changes.</p>}</div>{git.diffSummary && <pre className="git-diff-summary">{git.diffSummary}</pre>}</> : <div className="git-unavailable"><GitBranch size={22} /><p>{git?.message ?? "Choose a workspace to check whether it is a Git repository."}</p></div>}</section>;
}

function HistoryView({ tasks, activeTask, onSelect, onExport, onClear, onOpenUrl }: { tasks: RelayTaskRecord[]; activeTask?: RelayTaskRecord; onSelect: (task: RelayTaskRecord) => void; onExport: (task: RelayTaskRecord) => void; onClear: () => void; onOpenUrl: (url: string) => void }) {
  return <section className="history-layout"><div className="history-list"><div className="view-heading"><div><span className="header-eyebrow">LOCAL HISTORY</span><h1>Every run, kept on your device.</h1></div>{tasks.length > 0 && <button className="ghost-danger" onClick={onClear}><Trash2 size={14} /> Clear history</button>}</div>{tasks.length ? tasks.map((task) => <button className={`history-item ${activeTask?.id === task.id ? "selected" : ""}`} key={task.id} onClick={() => onSelect(task)}><span className={`history-status ${task.status}`}>{task.status === "complete" ? <Check size={13} /> : <TriangleAlert size={13} />}</span><div><strong>{shortTitle(task.title, 70)}</strong><small>{task.area} · {task.model} · {formatTime(task.createdAt)}</small></div><ChevronRight size={16} /></button>) : <div className="empty-state"><Archive size={25} /><h2>No saved runs yet.</h2><p>Run a local task and its response, sources, and receipt will appear here.</p></div>}</div><div className="history-detail">{activeTask ? <><div className="card-heading"><div><span className="header-eyebrow">SELECTED RUN</span><strong>{shortTitle(activeTask.title)}</strong></div><button className="small-button" onClick={() => onExport(activeTask)}><ArrowDownToLine size={14} /> Export</button></div><article className="markdown-response">{activeTask.response ?? activeTask.error}</article><TaskReceipt task={activeTask} onOpenUrl={onOpenUrl} workspaceName="workspace" /></> : <div className="empty-state"><History size={25} /><h2>Select a task to inspect its receipt.</h2></div>}</div></section>;
}

function ProviderPricingFields({ pricing, onChange }: { pricing?: ProviderPricing; onChange: (pricing: ProviderPricing | undefined) => void }) {
  const fields: Array<{ key: keyof ProviderPricing; label: string; hint: string }> = [
    { key: "inputPerMillionUsd", label: "Input", hint: "regular input" },
    { key: "cachedInputPerMillionUsd", label: "Cached input", hint: "optional" },
    { key: "outputPerMillionUsd", label: "Output", hint: "regular output" },
    { key: "reasoningOutputPerMillionUsd", label: "Reasoning output", hint: "optional" }
  ];
  function update(key: keyof ProviderPricing, raw: string) {
    const next = { ...(pricing ?? {}) };
    const value = raw.trim() === "" ? undefined : Number(raw);
    if (value === undefined || !Number.isFinite(value) || value < 0) delete next[key];
    else next[key] = value;
    onChange(Object.keys(next).length ? next : undefined);
  }
  return <fieldset className="provider-pricing"><legend>Optional price card <small>USD / 1M tokens · used for estimates only</small></legend><div>{fields.map((field) => <label key={field.key}>{field.label}<input type="number" min="0" step="any" inputMode="decimal" value={pricing?.[field.key] ?? ""} onChange={(event) => update(field.key, event.target.value)} placeholder={field.hint} /></label>)}</div></fieldset>;
}

function CenroSettingsView({
  ollama, system, selectedModel, onModelChange, modelRoles, onModelRoleChange, newModel, onNewModelChange, pulls, onPull, onDelete, onRefresh, onOpenDownload,
  kitInstalled, providers, providerDraft, providerSecretInputRef, providerBusy, onProviderDraftChange, onSaveProvider, onTestProvider, onRemoveProviderKey, onDeleteProvider, onToggleProvider
}: {
  ollama: { connected: boolean; models: OllamaModel[] }; system?: { memoryGb: number; cores: number; platform: string; architecture: string }; selectedModel: string; onModelChange: (value: string) => void; modelRoles: ModelRoles; onModelRoleChange: (role: keyof ModelRoles, value: string) => void; newModel: string; onNewModelChange: (value: string) => void; pulls: Record<string, PullProgress>; onPull: (model?: string) => void; onDelete: (model: string) => void; onRefresh: () => void; onOpenDownload: () => void;
  kitInstalled: { router: boolean; builder: boolean; research: boolean }; providers: CenroProvider[]; providerDraft: CenroProvider; providerSecretInputRef: RefObject<HTMLInputElement | null>; providerBusy: boolean; onProviderDraftChange: (provider: CenroProvider) => void; onSaveProvider: () => void; onTestProvider: () => void; onRemoveProviderKey: () => void; onDeleteProvider: (id: string) => void; onToggleProvider: (provider: CenroProvider) => void;
}) {
  const recommendation = contextEngineRecommendation(system);
  const modelKit = [
    { key: "router" as const, tag: "qwen3:1.7b", role: "Context Router", description: "Classifies work and builds a compact local context brief", size: "~1.4 GB", recommended: recommendation.recommendedRoles.includes("router") },
    { key: "builder" as const, tag: "qwen2.5-coder:3b", role: "Offline fallback", description: "Optional local coding and review when cloud is unavailable", size: "~1.9 GB", recommended: recommendation.recommendedRoles.includes("builder") },
    { key: "research" as const, tag: "qwen3:4b", role: "Context Analyst", description: "Optional deeper local codebase summaries", size: "~2.5 GB", recommended: recommendation.recommendedRoles.includes("research") }
  ];
  const roleRows: Array<{ field: keyof ModelRoles; title: string; hint: string; optional?: boolean }> = [
    { field: "routerModel", title: "Context router", hint: "Private task decisions and file triage" },
    { field: "builderModel", title: "Offline fallback", hint: "Optional local coding and review" },
    { field: "researchModel", title: "Context analyst", hint: "Optional deeper local summaries", optional: true }
  ];
  const draft = providerDraft;
  return <section className="cenro-settings">
    <div className="view-heading"><div><span className="header-eyebrow">CONTROL CENTER</span><h1>Models, routing, and your data boundary.</h1><p>Cenro starts local. Connections to a provider are encrypted by Windows and require a per-task consent receipt before workspace context can leave this device.</p></div><button className="small-button" onClick={onRefresh}><RefreshCw size={14} /> Refresh</button></div>
    <section className="settings-card gateway-price-card">
      <div className="card-heading"><div><span className="header-eyebrow">GATEWAY COST CARD</span><strong>Optional provider pricing</strong></div><Activity size={18} /></div>
      <p>Attach a price card to the selected provider draft to unlock a maximum-cost estimate. If you leave it empty, Cenro shows tokens only and never invents dollars.</p>
      <ProviderPricingFields pricing={draft.pricing} onChange={(pricing) => onProviderDraftChange({ ...draft, pricing })} />
      <small>Applies to <strong>{draft.name || "this provider"}</strong> when you choose <strong>Save provider</strong> below.</small>
    </section>
    <div className="settings-grid cenro-settings-grid">
      <section className="settings-card runtime-card"><div className="card-heading"><div><span className="header-eyebrow">LOCAL RUNTIME</span><strong>{ollama.connected ? "Ollama is connected" : "Ollama is not running"}</strong></div><span className={`live-dot ${ollama.connected ? "online" : ""}`} /></div><p>{ollama.connected ? `${ollama.models.length} local model${ollama.models.length === 1 ? "" : "s"} are available over localhost.` : "Install Ollama once, then reopen this workspace. Cenro does not bundle or host a model service."}</p>{!ollama.connected && <button className="primary-button" onClick={onOpenDownload}><HardDrive size={15} /> Get Ollama for Windows</button>}<div className="system-stats"><div><small>MEMORY</small><strong>{system ? `${system.memoryGb} GB` : "—"}</strong></div><div><small>CPU</small><strong>{system ? `${system.cores} cores` : "—"}</strong></div><div><small>PLATFORM</small><strong>{system?.platform ?? "—"}</strong></div></div></section>
      <section className="settings-card model-kit-card">
        <div className="card-heading"><div><span className="header-eyebrow">LOCAL CONTEXT ENGINE</span><strong>{recommendation.headline}</strong></div><BrainCircuit size={18} /></div>
        <p>{recommendation.detail}</p>
        <div className="hardware-recommendation" role="status"><Cpu size={15} /><div><span>{system ? `${system.memoryGb} GB RAM - ${system.cores} CPU cores` : "Checking this device"}</span><strong>Download: {recommendation.primaryModel}</strong></div></div>
        <div className="model-role-map" aria-label="Smart Switch model roles">
          <span className="model-role-label">LOCAL CONTEXT ROLE MAP</span>
          {roleRows.map((role) => {
            const selected = modelRoles[role.field];
            const unavailable = Boolean(selected && !ollama.models.some((model) => model.name === selected));
            return <label className="model-role-row" key={role.field}>
              <div><strong>{role.title}</strong><small>{role.hint}</small></div>
              <select value={selected} onChange={(event) => onModelRoleChange(role.field, event.target.value)} disabled={!ollama.models.length} aria-label={`${role.title} model`}>
                <option value="">{role.optional ? "Not assigned" : "Choose a model"}</option>
                {unavailable && <option value={selected}>{selected} (not installed)</option>}
                {ollama.models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
              </select>
            </label>;
          })}
        </div>
        <div className="model-kit-list">{modelKit.map((item) => <div className="model-kit-row" key={item.key}><span className={kitInstalled[item.key] ? "ready" : ""}>{kitInstalled[item.key] ? <Check size={13} /> : <Cpu size={13} />}</span><div><strong>{item.role}</strong><small>{item.tag} · {item.size}<br />{item.description}</small></div>{kitInstalled[item.key] ? <em>Ready</em> : <button className="small-button" onClick={() => onPull(item.tag)}>Download</button>}</div>)}</div>
      </section>
      <section className="settings-card model-manager-card"><div className="card-heading"><div><span className="header-eyebrow">LOCAL MODELS</span><strong>Your Ollama library</strong></div><Cpu size={18} /></div><div className="model-list">{ollama.models.length ? ollama.models.map((model) => <div className="managed-model" key={model.name}><span className="model-avatar"><Bot size={15} /></span><div><strong>{model.name}</strong><small>{formatSize(model.size)} · updated {formatTime(model.modified_at)}</small></div><label className="model-radio"><input type="radio" checked={selectedModel === model.name} onChange={() => onModelChange(model.name)} /><span>Default worker</span></label><button onClick={() => onDelete(model.name)} title={`Remove ${model.name}`}><Trash2 size={14} /></button></div>) : <p className="muted">No local model is installed yet.</p>}</div><form className="add-model" onSubmit={(event) => { event.preventDefault(); onPull(); }}><input value={newModel} onChange={(event) => onNewModelChange(event.target.value)} placeholder="Any Ollama model tag" /><button type="submit"><Plus size={14} /> Download</button></form>{Object.entries(pulls).filter(([, value]) => value.status !== "complete").map(([model, progress]) => <div className={`pull-progress ${progress.status}`} key={model}><LoaderCircle className={progress.status === "running" ? "spin" : ""} size={14} /><span><strong>{model}</strong>{progress.line}</span></div>)}</section>
      <section className="settings-card providers-card"><div className="card-heading"><div><span className="header-eyebrow">CLOUD PROVIDERS</span><strong>Bring your own API.</strong></div><Globe2 size={18} /></div><p>Keys are stored with Windows encryption. They are never rendered again, saved to history, or exported.</p><div className="provider-kind"><button className={draft.kind === "openai" ? "selected" : ""} onClick={() => onProviderDraftChange({ ...draft, kind: "openai", name: draft.name || "OpenAI" })}>OpenAI</button><button className={draft.kind === "anthropic" ? "selected" : ""} onClick={() => onProviderDraftChange({ ...draft, kind: "anthropic", name: draft.name || "Anthropic" })}>Anthropic</button><button className={draft.kind === "compatible" ? "selected" : ""} onClick={() => onProviderDraftChange({ ...draft, kind: "compatible", name: draft.name || "Compatible API" })}>Compatible</button></div><div className="provider-form"><label>Label<input value={draft.name} onChange={(event) => onProviderDraftChange({ ...draft, name: event.target.value })} placeholder="OpenAI" /></label><label>Model<input value={draft.model ?? ""} onChange={(event) => onProviderDraftChange({ ...draft, model: event.target.value })} placeholder={draft.kind === "openai" ? "gpt-5.4 (if available to your account)" : "Choose a model"} /></label>{draft.kind === "compatible" && <label>Base URL<input value={draft.endpoint ?? ""} onChange={(event) => onProviderDraftChange({ ...draft, endpoint: event.target.value })} placeholder="https://api.example.com/v1" /></label>}<label>API key<input ref={providerSecretInputRef} type="password" placeholder="Stored only after Save" autoComplete="off" /></label><div className="provider-actions"><button className="small-button" type="button" onClick={onTestProvider} disabled={providerBusy || !draft.id}>{providerBusy ? <LoaderCircle className="spin" size={13} /> : <Activity size={13} />} Test</button><button className="primary-button" type="button" onClick={onSaveProvider} disabled={providerBusy || !draft.name.trim() || !draft.model?.trim()}>{providerBusy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Save provider</button></div></div>{providers.length ? <div className="provider-list">{providers.map((provider) => <div className="provider-row" key={provider.id}><span className={provider.enabled ? "provider-live" : ""}>{provider.kind === "openai" ? <Sparkles size={13} /> : provider.kind === "anthropic" ? <BrainCircuit size={13} /> : <Network size={13} />}</span><div><strong>{provider.name}</strong><small>{provider.model || "No model chosen"} · {provider.configured === false ? "needs key" : provider.enabled ? "enabled" : "disabled"}</small></div><button className="text-button" onClick={() => onToggleProvider(provider)}>{provider.enabled ? "Disable" : "Enable"}</button><button className="icon-delete" onClick={() => onDeleteProvider(provider.id)} aria-label={`Delete ${provider.name}`}><Trash2 size={13} /></button></div>)}</div> : <div className="provider-empty"><LockKeyhole size={15} /> No cloud provider configured.</div>}</section>
      <section className="settings-card boundary-card"><div className="card-heading"><div><span className="header-eyebrow">DATA BOUNDARY</span><strong>Visible before every handoff.</strong></div><ShieldCheck size={18} /></div><ul className="boundary-list"><li><LockKeyhole size={14} /><span><strong>Local</strong> keeps prompts, files, playbooks, and task receipts on this device.</span></li><li><BrainCircuit size={14} /><span><strong>Smart Switch</strong> only receives your request and safe workspace metadata—not raw code.</span></li><li><Globe2 size={14} /><span><strong>Cloud</strong> shows the provider, model, eligible files, character count, and a consent button each time.</span></li></ul></section>
      {draft.id && draft.configured !== false && <section className="settings-card provider-key-card"><div className="card-heading"><div><span className="header-eyebrow">KEY CONTROL</span><strong>Remove the encrypted credential.</strong></div><LockKeyhole size={18} /></div><p>Remove this provider’s key without deleting its saved model and endpoint settings. Cloud use through this provider stops immediately.</p><button className="text-button provider-key-remove" type="button" onClick={onRemoveProviderKey} disabled={providerBusy}>Remove stored key</button></section>}
    </div>
  </section>;
}

function SettingsView({ ollama, system, selectedModel, onModelChange, newModel, onNewModelChange, pulls, onPull, onDelete, onRefresh, onOpenDownload }: {
  ollama: { connected: boolean; models: OllamaModel[] }; system?: { memoryGb: number; cores: number; platform: string; architecture: string }; selectedModel: string; onModelChange: (value: string) => void; newModel: string; onNewModelChange: (value: string) => void; pulls: Record<string, PullProgress>; onPull: () => void; onDelete: (model: string) => void; onRefresh: () => void; onOpenDownload: () => void;
}) {
  return <section className="settings-layout"><div className="view-heading"><div><span className="header-eyebrow">CONTROL CENTER</span><h1>Local runtime and data boundaries.</h1><p>Cenro communicates with Ollama over the local loopback address. It does not upload your workspace by default.</p></div><button className="small-button" onClick={onRefresh}><RefreshCw size={14} /> Refresh</button></div><div className="settings-grid"><section className="settings-card runtime-card"><div className="card-heading"><div><span className="header-eyebrow">OLLAMA</span><strong>{ollama.connected ? "Connected locally" : "Not detected"}</strong></div><span className={`live-dot ${ollama.connected ? "online" : ""}`} /></div><p>{ollama.connected ? "Your installed models are available to Cenro through localhost." : "Install Ollama, start it, then refresh this panel."}</p>{!ollama.connected && <button className="primary-button" onClick={onOpenDownload}><HardDrive size={15} /> Get Ollama for Windows</button>}<div className="system-stats"><div><small>MEMORY</small><strong>{system ? `${system.memoryGb} GB` : "—"}</strong></div><div><small>CPU</small><strong>{system ? `${system.cores} cores` : "—"}</strong></div><div><small>PLATFORM</small><strong>{system?.platform ?? "—"}</strong></div></div></section><section className="settings-card"><div className="card-heading"><div><span className="header-eyebrow">MODEL MANAGER</span><strong>Installed local models</strong></div><Cpu size={18} /></div><div className="model-list">{ollama.models.length ? ollama.models.map((model) => <div className="managed-model" key={model.name}><span className="model-avatar"><Bot size={15} /></span><div><strong>{model.name}</strong><small>{formatSize(model.size)} · updated {formatTime(model.modified_at)}</small></div><label className="model-radio"><input type="radio" checked={selectedModel === model.name} onChange={() => onModelChange(model.name)} /><span>Default</span></label><button onClick={() => onDelete(model.name)} title={`Remove ${model.name}`}><Trash2 size={14} /></button></div>) : <p className="muted">No models are installed yet.</p>}</div><form className="add-model" onSubmit={(event) => { event.preventDefault(); onPull(); }}><input value={newModel} onChange={(event) => onNewModelChange(event.target.value)} placeholder="Model tag, e.g. qwen2.5-coder:3b" /><button type="submit"><Plus size={14} /> Download</button></form>{Object.entries(pulls).filter(([, value]) => value.status !== "complete").map(([model, progress]) => <div className={`pull-progress ${progress.status}`} key={model}><LoaderCircle className={progress.status === "running" ? "spin" : ""} size={14} /><span><strong>{model}</strong>{progress.line}</span></div>)}</section><section className="settings-card"><div className="card-heading"><div><span className="header-eyebrow">DATA BOUNDARY</span><strong>Transparent routing</strong></div><ShieldCheck size={18} /></div><ul className="boundary-list"><li><LockKeyhole size={14} /><span><strong>Local</strong> keeps prompts and selected workspace excerpts on-device.</span></li><li><Network size={14} /><span><strong>Smart</strong> runs locally unless you explicitly enable web research for one task.</span></li><li><Globe2 size={14} /><span><strong>Cloud</strong> stays disabled until you intentionally configure a provider.</span></li></ul></section></div></section>;
}

function CenroProviderOnboarding({
  connected, models, system, kitInstalled, pulls, providers, providerDraft, providerSecretInputRef, providerBusy,
  onProviderDraftChange, onSaveProvider, onTestProvider, onOpenSettings, onCheck, onDownload, onPull, onFinish
}: {
  connected: boolean; models: OllamaModel[]; system?: { memoryGb: number; cores: number }; kitInstalled: { router: boolean; builder: boolean; research: boolean }; pulls: Record<string, PullProgress>;
  providers: CenroProvider[]; providerDraft: CenroProvider; providerSecretInputRef: RefObject<HTMLInputElement | null>; providerBusy: boolean;
  onProviderDraftChange: (provider: CenroProvider) => void; onSaveProvider: () => void; onTestProvider: () => void; onOpenSettings: () => void;
  onCheck: () => void; onDownload: () => void; onPull: (model: string) => void; onFinish: () => void;
}) {
  const starter = [
    { id: "router" as const, model: "qwen3:1.7b", title: "Project mapper", copy: "Builds a private repository brief before a cloud call." },
    { id: "builder" as const, model: "qwen2.5-coder:3b", title: "Offline fallback", copy: "Keeps basic coding and review available without a provider." }
  ];
  const coreReady = kitInstalled.router && kitInstalled.builder;
  const providerReady = providers.some((provider) => provider.enabled && provider.configured !== false);
  const providerDefaults: Record<CenroProvider["kind"], { name: string; model: string; endpoint?: string }> = {
    openai: { name: "OpenAI", model: "gpt-4.1" },
    anthropic: { name: "Anthropic", model: "claude-sonnet-4-5" },
    compatible: { name: "Compatible provider", model: "", endpoint: "https://" }
  };
  function selectProviderKind(kind: CenroProvider["kind"]) {
    const defaults = providerDefaults[kind];
    onProviderDraftChange({
      id: providerDraft.kind === kind ? providerDraft.id : "",
      name: defaults.name,
      kind,
      model: providerDraft.kind === kind ? providerDraft.model : defaults.model,
      endpoint: kind === "compatible" ? providerDraft.kind === kind ? providerDraft.endpoint : defaults.endpoint : undefined,
      enabled: true,
      pricing: providerDraft.kind === kind ? providerDraft.pricing : undefined
    });
    if (providerSecretInputRef.current) providerSecretInputRef.current.value = "";
  }
  return <div className="onboarding-backdrop"><section className="onboarding cenro-onboarding cenro-provider-onboarding" role="dialog" aria-modal="true" aria-label="Set up Cenro">
    <div className="onboarding-logo"><CenroMark /></div>
    <span className="header-eyebrow">WELCOME TO CENRO</span>
    <h1>Connect the model that will write your code.</h1>
    <p>Cenro understands the repository on your machine first. Then your chosen provider receives a focused Context Pack, proposes the work, and you review every file before it changes.</p>

    <section className="onboarding-provider" aria-label="Connect a coding provider">
      <div className="onboarding-step-heading"><span>01</span><div><strong>Connect your coding provider</strong><small>Bring your own account. The API key is write-only and encrypted by Windows.</small></div>{providerReady && <em><CheckCircle2 size={13} /> Ready</em>}</div>
      <div className="onboarding-provider-kind" role="tablist" aria-label="Provider type">
        {(["openai", "anthropic", "compatible"] as const).map((kind) => <button key={kind} type="button" className={providerDraft.kind === kind ? "selected" : ""} onClick={() => selectProviderKind(kind)}>{kind === "openai" ? "OpenAI" : kind === "anthropic" ? "Anthropic" : "Compatible"}</button>)}
      </div>
      <div className="onboarding-provider-grid">
        <label>Provider name<input value={providerDraft.name} onChange={(event) => onProviderDraftChange({ ...providerDraft, name: event.target.value })} placeholder="OpenAI" /></label>
        <label>Model<input value={providerDraft.model ?? ""} onChange={(event) => onProviderDraftChange({ ...providerDraft, model: event.target.value })} placeholder="A model available to your account" /></label>
        {providerDraft.kind === "compatible" && <label className="provider-endpoint">Base URL<input value={providerDraft.endpoint ?? ""} onChange={(event) => onProviderDraftChange({ ...providerDraft, endpoint: event.target.value })} placeholder="https://api.example.com/v1" /></label>}
        <label className="provider-secret">API key<input ref={providerSecretInputRef} type="password" autoComplete="new-password" spellCheck={false} placeholder={providerReady ? "Paste a new key to replace the saved key" : "Paste your API key"} /></label>
      </div>
      <div className="onboarding-provider-actions"><button className="primary-button" type="button" onClick={onSaveProvider} disabled={providerBusy}>{providerBusy ? <LoaderCircle className="spin" size={14} /> : <LockKeyhole size={14} />}{providerDraft.id && providerDraft.configured !== false ? "Update secure connection" : "Save secure connection"}</button><button className="small-button" type="button" onClick={onTestProvider} disabled={providerBusy || !providerDraft.id || providerDraft.configured === false}>Test connection</button><button className="text-button" type="button" onClick={onOpenSettings}>Advanced settings</button></div>
      <p className="onboarding-provider-note"><ShieldCheck size={13} /> Cenro never shows the key again, puts it in history, or includes it in a Context Pack.</p>
    </section>

    <div className="onboarding-local-heading"><span>02</span><div><strong>Optional local intelligence</strong><small>Useful for private repository mapping and offline fallbacks. It is not required to use your provider.</small></div></div>
    <div className="setup-row"><span className={connected ? "setup-ok" : ""}>{connected ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span><div><strong>{connected ? "Ollama is connected" : "Install the local runtime"}</strong><small>{connected ? `${models.length} installed model${models.length === 1 ? "" : "s"} - ${system?.memoryGb ?? "Your"} GB memory detected` : "Cenro talks to Ollama on your own machine."}</small></div>{!connected && <div><button className="small-button" onClick={onDownload}>Get Ollama</button><button className="text-button" onClick={onCheck}>Check again</button></div>}</div>
    {connected && <div className="starter-models"><div className="starter-heading"><div><strong>Suggested local kit</strong><small>{system && system.memoryGb <= 8 ? "Recommended for this machine. Cenro runs the roles one at a time." : "Add this only if you want local context mapping and offline fallbacks."}</small></div><span>{coreReady ? "Ready" : "Optional"}</span></div>{starter.map((item) => { const busy = pulls[item.model]?.status === "running"; return <div className="starter-model" key={item.id}><span className={kitInstalled[item.id] ? "ready" : ""}>{kitInstalled[item.id] ? <Check size={14} /> : <Cpu size={14} />}</span><div><strong>{item.title}</strong><small>{item.copy}</small></div>{kitInstalled[item.id] ? <em>Installed</em> : <button className="small-button" onClick={() => onPull(item.model)} disabled={busy}>{busy ? <LoaderCircle className="spin" size={13} /> : "Download"}</button>}</div>; })}</div>}
    <div className="onboarding-actions"><span><ShieldCheck size={14} /> Your provider only receives repository context after you approve it.</span><button className="primary-button" onClick={onFinish}>{providerReady ? "Open your workspace" : "Explore Cenro first"}<ChevronRight size={15} /></button></div>
  </section></div>;
}

function CenroOnboarding({ connected, models, system, kitInstalled, pulls, onCheck, onDownload, onPull, onFinish }: {
  connected: boolean; models: OllamaModel[]; system?: { memoryGb: number; cores: number }; kitInstalled: { router: boolean; builder: boolean; research: boolean }; pulls: Record<string, PullProgress>; onCheck: () => void; onDownload: () => void; onPull: (model: string) => void; onFinish: () => void;
}) {
  const starter = [
    { id: "router" as const, model: "qwen3:1.7b", title: "Smart Switch", copy: "Routes tasks locally · ~1.4 GB" },
    { id: "builder" as const, model: "qwen2.5-coder:3b", title: "Builder", copy: "Writes and reviews code · ~1.9 GB" },
    { id: "research" as const, model: "qwen3:4b", title: "Research (optional)", copy: "Deeper research on capable PCs · ~2.5 GB" }
  ];
  const contextOnlyMachine = (system?.memoryGb ?? 8) < 12;
  const starterRecommendation = system && system.memoryGb <= 8
    ? "8 GB detected: start with Smart Switch. Add Builder when you want local code work; Cenro runs roles one at a time."
    : "Any installed Ollama model can be selected later.";
  const coreReady = contextOnlyMachine ? kitInstalled.router : kitInstalled.router && kitInstalled.builder;
  return <div className="onboarding-backdrop"><section className="onboarding cenro-onboarding" role="dialog" aria-modal="true" aria-label="Set up Cenro"><div className="onboarding-logo"><CenroMark /></div><span className="header-eyebrow">WELCOME TO CENRO</span><h1>Your workspace. Your models. Your choice.</h1><p>Start with local AI, then decide when a task deserves the web or a cloud provider. Cenro makes each boundary visible.</p><div className="setup-row"><span className={connected ? "setup-ok" : ""}>{connected ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span><div><strong>{connected ? "Ollama is connected" : "Install the local runtime"}</strong><small>{connected ? `${models.length} installed model${models.length === 1 ? "" : "s"} · ${system?.memoryGb ?? "Your"} GB memory detected` : "Cenro talks to Ollama on your own machine."}</small></div>{!connected && <div><button className="small-button" onClick={onDownload}>Get Ollama</button><button className="text-button" onClick={onCheck}>Check again</button></div>}</div>{connected && <div className="starter-models"><div className="starter-heading"><div><strong>Choose a starter kit</strong><small>{starterRecommendation}</small></div><span>{coreReady ? "Gateway ready" : "Local-first"}</span></div>{starter.map((item) => { const busy = pulls[item.model]?.status === "running"; return <div className="starter-model" key={item.id}><span className={kitInstalled[item.id] ? "ready" : ""}>{kitInstalled[item.id] ? <Check size={14} /> : <Cpu size={14} />}</span><div><strong>{item.title}</strong><small>{item.copy}</small></div>{kitInstalled[item.id] ? <em>Installed</em> : <button className="small-button" onClick={() => onPull(item.model)} disabled={busy}>{busy ? <LoaderCircle className="spin" size={13} /> : "Download"}</button>}</div>; })}</div>}<div className="onboarding-actions"><span><ShieldCheck size={14} /> No telemetry. Cloud use always asks first.</span><button className="primary-button" onClick={onFinish}>{coreReady ? "Open Cenro" : connected ? "Continue with my models" : "Continue without a model"}<ChevronRight size={15} /></button></div></section></div>;
}

function Onboarding({ connected, models, system, onCheck, onDownload, onFinish }: { connected: boolean; models: OllamaModel[]; system?: { memoryGb: number; cores: number }; onCheck: () => void; onDownload: () => void; onFinish: () => void }) {
  return <div className="onboarding-backdrop"><section className="onboarding" role="dialog" aria-modal="true" aria-label="Set up Cenro"><div className="onboarding-logo"><Sparkles size={21} /></div><span className="header-eyebrow">WELCOME TO CENRO</span><h1>Your local intelligence workspace.</h1><p>Research, learn, build, and edit files with your private workspace staying on this machine by default.</p><div className="setup-row"><span className={connected ? "setup-ok" : ""}>{connected ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span><div><strong>{connected ? "Ollama is connected" : "Connect the local runtime"}</strong><small>{connected ? `${models.length} model${models.length === 1 ? "" : "s"} available` : "Install Ollama once, then recheck Cenro."}</small></div>{!connected && <div><button className="small-button" onClick={onDownload}>Download Ollama</button><button className="text-button" onClick={onCheck}>Check again</button></div>}</div>{connected && <div className="setup-row"><span className={models.length ? "setup-ok" : ""}>{models.length ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span><div><strong>{models.length ? "A local model is ready" : "Choose a model in Settings"}</strong><small>{models.length ? models[0].name : `With ${system?.memoryGb ?? "your"} GB RAM, start with a compact 3B coding model.`}</small></div></div>}<div className="onboarding-actions"><span><ShieldCheck size={14} /> Local-first and explicit about web use.</span><button className="primary-button" onClick={onFinish}>{connected ? "Open Cenro" : "Continue without a model"}<ChevronRight size={15} /></button></div></section></div>;
}
