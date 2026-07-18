/**
 * Hardware guidance for the Context Gateway. It deliberately recommends one
 * loaded local model at a time: Cenro's "agent council" is a sequence of
 * roles backed mostly by deterministic local tooling, not seven resident
 * models competing for RAM on a Windows laptop.
 */

export type GatewayHardwareProfile = {
  /** Either field may be supplied by the platform probe; invalid values fall back safely. */
  memoryBytes?: number;
  memoryGb?: number;
  logicalCpuCores?: number;
  gpuVramGb?: number;
  installedModels?: readonly string[];
};

export type GatewayMemoryTier = "below-minimum" | "entry" | "balanced" | "capable" | "high-memory";
export type GatewayModelInstallState = "ready" | "recommended" | "optional" | "not-recommended";

export type GatewayModelRecommendation = {
  role: "context" | "local-review" | "local-research";
  model: string;
  approximateDownloadGb: number;
  state: GatewayModelInstallState;
  label: string;
  reason: string;
};

export type GatewayHardwarePolicy = {
  memoryGb: number;
  memoryTier: GatewayMemoryTier;
  logicalCpuCores?: number;
  gpuVramGb?: number;
  /** Always one by default, even on a powerful machine. */
  maxConcurrentLocalModels: 1;
  /** A product truth the UI can state plainly. */
  localRolesAreSequential: true;
  localRolePlan: Array<"repository-map" | "intent-critic" | "context-critic" | "verifier" | "repair-critic">;
  models: GatewayModelRecommendation[];
  recommendation: string;
  accelerationNote: string;
};

const CONTEXT_MODEL = {
  role: "context" as const,
  model: "qwen3:1.7b",
  approximateDownloadGb: 1.4,
  label: "Local Context Engine"
};

const REVIEW_MODEL = {
  role: "local-review" as const,
  model: "qwen2.5-coder:3b",
  approximateDownloadGb: 1.9,
  label: "Local Review Helper"
};

const RESEARCH_MODEL = {
  role: "local-research" as const,
  model: "qwen3:4b",
  approximateDownloadGb: 2.5,
  label: "Local Research Helper"
};

export function buildGatewayHardwarePolicy(profile: GatewayHardwareProfile = {}): GatewayHardwarePolicy {
  const memoryGb = resolveMemoryGb(profile);
  const installed = new Set((profile.installedModels ?? []).filter((model): model is string => typeof model === "string").map((model) => model.trim().toLowerCase()));
  const base = {
    memoryGb,
    logicalCpuCores: validNonNegativeInteger(profile.logicalCpuCores),
    gpuVramGb: validNonNegativeNumber(profile.gpuVramGb),
    maxConcurrentLocalModels: 1 as const,
    localRolesAreSequential: true as const,
    localRolePlan: ["repository-map", "intent-critic", "context-critic", "verifier", "repair-critic"] as GatewayHardwarePolicy["localRolePlan"],
    accelerationNote: accelerationNote(profile.gpuVramGb)
  };

  if (memoryGb < 8) {
    return {
      ...base,
      memoryTier: "below-minimum",
      models: [
        modelRecommendation(CONTEXT_MODEL, installed, "not-recommended", "Below 8 GB RAM, keep the Context Gateway deterministic and do not load a local LLM by default."),
        modelRecommendation(REVIEW_MODEL, installed, "not-recommended", "A 3B review helper is likely to cause memory pressure on this machine."),
        modelRecommendation(RESEARCH_MODEL, installed, "not-recommended", "Reserve this larger helper for a machine with more memory.")
      ],
      recommendation: "Use the local repository map, redaction, provenance, and verification tools. Add a small Context Engine after upgrading to at least 8 GB RAM."
    };
  }

  if (memoryGb < 12) {
    return {
      ...base,
      memoryTier: "entry",
      models: [
        modelRecommendation(CONTEXT_MODEL, installed, "recommended", "Best fit for intent checks and Context Gateway critique on 8–11 GB RAM."),
        modelRecommendation(REVIEW_MODEL, installed, "optional", "It can be used for focused review, but never alongside the Context Engine."),
        modelRecommendation(RESEARCH_MODEL, installed, "not-recommended", "A 4B helper leaves too little headroom for a Windows coding workspace at this tier.")
      ],
      recommendation: "Install the Local Context Engine first. Cenro runs repository mapping and local roles sequentially, with one model loaded at a time."
    };
  }

  if (memoryGb < 16) {
    return {
      ...base,
      memoryTier: "balanced",
      models: [
        modelRecommendation(CONTEXT_MODEL, installed, "recommended", "Fast local intent/context critic."),
        modelRecommendation(REVIEW_MODEL, installed, "recommended", "Useful for focused local review after the Context Engine unloads."),
        modelRecommendation(RESEARCH_MODEL, installed, "optional", "Install only if deeper local research is worth the slower response time.")
      ],
      recommendation: "Use Context Engine + Local Review Helper sequentially. The cloud lead remains the hard-reasoning worker."
    };
  }

  if (memoryGb < 24) {
    return {
      ...base,
      memoryTier: "capable",
      models: [
        modelRecommendation(CONTEXT_MODEL, installed, "recommended", "Fast local gateway work."),
        modelRecommendation(REVIEW_MODEL, installed, "recommended", "Strong focused local review without replacing the cloud lead."),
        modelRecommendation(RESEARCH_MODEL, installed, "optional", "Good for deeper local analysis when you want it.")
      ],
      recommendation: "This machine can carry the full local support kit, but Cenro still schedules roles sequentially for predictable latency and memory use."
    };
  }

  return {
    ...base,
    memoryTier: "high-memory",
    models: [
      modelRecommendation(CONTEXT_MODEL, installed, "recommended", "Fast local gateway work."),
      modelRecommendation(REVIEW_MODEL, installed, "recommended", "Focused review and repair critique."),
      modelRecommendation(RESEARCH_MODEL, installed, "recommended", "Deeper local architecture and research analysis.")
    ],
    recommendation: "Install the full local support kit. Keep the default one-model schedule: it produces a clearer evidence trail and avoids artificial agent fan-out."
  };
}

function modelRecommendation(
  model: { role: GatewayModelRecommendation["role"]; model: string; approximateDownloadGb: number; label: string },
  installed: ReadonlySet<string>,
  desiredState: Exclude<GatewayModelInstallState, "ready">,
  reason: string
): GatewayModelRecommendation {
  const ready = installed.has(model.model.toLowerCase());
  return {
    ...model,
    state: ready ? "ready" : desiredState,
    reason: ready ? "Already installed. Cenro will still load it only when this sequential role begins." : reason
  };
}

function resolveMemoryGb(profile: GatewayHardwareProfile): number {
  const explicit = validNonNegativeNumber(profile.memoryGb);
  if (explicit !== undefined) return Math.floor(explicit);
  const bytes = validNonNegativeNumber(profile.memoryBytes);
  return bytes === undefined ? 0 : Math.floor(bytes / 1024 ** 3);
}

function validNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function validNonNegativeInteger(value: unknown): number | undefined {
  const number = validNonNegativeNumber(value);
  return number === undefined ? undefined : Math.floor(number);
}

function accelerationNote(gpuVramGb: unknown): string {
  const vram = validNonNegativeNumber(gpuVramGb);
  if (vram === undefined) return "No GPU VRAM estimate is available. Cenro will choose a RAM-safe sequential schedule.";
  if (vram < 6) return "GPU memory is limited, so do not rely on concurrent local model loading. Cenro uses a RAM-safe sequential schedule.";
  return "A capable GPU can accelerate one local worker. Cenro still defaults to one model at a time for a reliable evidence trail.";
}
