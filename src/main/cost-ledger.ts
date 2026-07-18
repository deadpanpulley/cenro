import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { GatewayCostPreflight, GatewayLedgerEntry, GatewayUsage, ProviderPricing } from "./runtime-types.js";

const STORE_FILE = "cenro-gateway-ledger.json";
const STORE_VERSION = 1;
const MAX_ENTRIES = 1_000;

export type GatewayLedgerWrite = Omit<GatewayLedgerEntry, "id" | "createdAt" | "completedAt"> & {
  id?: string;
  createdAt?: string;
  completedAt?: string;
};

export type GatewayCostLedger = {
  readonly filePath: string;
  list(limit?: number): Promise<GatewayLedgerEntry[]>;
  save(entry: GatewayLedgerWrite): Promise<GatewayLedgerEntry>;
  clear(): Promise<void>;
};

type LedgerDocument = { version: number; entries: GatewayLedgerEntry[] };

/**
 * An intentionally conservative token estimate. It is labelled an estimate in
 * all public contracts and is never substituted for provider-reported usage.
 */
export function estimateTokens(characters: number): number {
  if (!Number.isFinite(characters) || characters <= 0) return 0;
  return Math.max(1, Math.ceil(characters / 4));
}

/**
 * Creates a transparent maximum-cost preflight. Dollar values are emitted only
 * when the user configured an explicit price card for the selected provider.
 */
export function createGatewayCostPreflight(input: {
  inputTokensEstimated: number;
  maxOutputTokens: number;
  pricing?: ProviderPricing;
  budgetUsd?: number;
}): GatewayCostPreflight {
  const inputTokensEstimated = normalizeTokenCount(input.inputTokensEstimated, "Input token estimate");
  const maxOutputTokens = normalizeTokenCount(input.maxOutputTokens, "Output token cap");
  const budgetUsd = input.budgetUsd === undefined ? undefined : normalizeUsd(input.budgetUsd, "Budget");
  const pricing = normalizePricing(input.pricing);
  const maximumBillableTokens = inputTokensEstimated + maxOutputTokens;

  if (!pricing || pricing.inputPerMillionUsd === undefined || pricing.outputPerMillionUsd === undefined) {
    return {
      inputTokensEstimated,
      maxOutputTokens,
      maximumBillableTokens,
      estimateStatus: "tokens-only",
      ...(budgetUsd !== undefined ? { budgetUsd } : {}),
      budgetStatus: budgetUsd === undefined ? "not-set" : "unpriced",
      note: "Token counts are local estimates. Add input and output prices for this provider before Cenro can estimate dollars."
    };
  }

  const estimatedInputCostUsd = roundUsd(inputTokensEstimated / 1_000_000 * pricing.inputPerMillionUsd);
  const estimatedMaximumCostUsd = roundUsd(
    estimatedInputCostUsd + maxOutputTokens / 1_000_000 * pricing.outputPerMillionUsd
  );
  const budgetStatus = budgetUsd === undefined
    ? "not-set"
    : estimatedMaximumCostUsd <= budgetUsd ? "within" : "exceeds";
  return {
    inputTokensEstimated,
    maxOutputTokens,
    maximumBillableTokens,
    estimateStatus: "priced-estimate",
    estimatedInputCostUsd,
    estimatedMaximumCostUsd,
    ...(budgetUsd !== undefined ? { budgetUsd } : {}),
    budgetStatus,
    note: "Dollar figures are a local maximum estimate from this provider's configured price card; provider-reported usage is recorded after completion."
  };
}

/** Prices reported usage only. Missing usage or an incomplete price card stays explicitly unpriced. */
export function priceProviderUsage(usage: GatewayUsage | undefined, pricing?: ProviderPricing): {
  costStatus: GatewayLedgerEntry["costStatus"];
  actualCostUsd?: number;
} {
  if (!usage || !hasUsage(usage)) return { costStatus: "usage-unavailable" };
  const normalized = normalizePricing(pricing);
  if (!normalized || normalized.inputPerMillionUsd === undefined || normalized.outputPerMillionUsd === undefined) {
    return { costStatus: "usage-unpriced" };
  }
  const reportedInput = Math.max(0, usage.inputTokens ?? 0);
  // A malformed provider payload must never make a ledger estimate larger than
  // the reported input. Cached input is a subset of input by definition.
  const cached = Math.min(reportedInput, Math.max(0, usage.cachedInputTokens ?? 0));
  const input = reportedInput - cached;
  const output = Math.max(0, usage.outputTokens ?? 0);
  const reasoning = Math.min(output, Math.max(0, usage.reasoningTokens ?? 0));
  const regularOutput = output - reasoning;
  const price = input / 1_000_000 * normalized.inputPerMillionUsd
    + cached / 1_000_000 * (normalized.cachedInputPerMillionUsd ?? normalized.inputPerMillionUsd)
    + regularOutput / 1_000_000 * normalized.outputPerMillionUsd
    + reasoning / 1_000_000 * (normalized.reasoningOutputPerMillionUsd ?? normalized.outputPerMillionUsd);
  return { costStatus: "priced-usage", actualCostUsd: roundUsd(price) };
}

/**
 * Persists only ledger facts: no prompts, context code, API keys, responses,
 * paths, or provider error bodies. Entries are atomically written and bounded.
 */
export function createGatewayCostLedger(userDataDir: string): GatewayCostLedger {
  const directory = path.resolve(requireDirectory(userDataDir));
  const filePath = path.join(directory, STORE_FILE);
  let queue: Promise<void> = Promise.resolve();

  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    filePath,
    list: (limit?: number) => exclusive(async () => {
      const entries = await readEntries(filePath);
      const max = limit === undefined ? MAX_ENTRIES : normalizeLimit(limit);
      return entries.slice(0, max).map(copyEntry);
    }),
    save: (input) => exclusive(async () => {
      const now = new Date().toISOString();
      const entry = normalizeEntry(input, now);
      const existing = await readEntries(filePath);
      const entries = sortEntries([entry, ...existing.filter((item) => item.id !== entry.id)]).slice(0, MAX_ENTRIES);
      await writeEntries(filePath, entries);
      return copyEntry(entry);
    }),
    clear: () => exclusive(async () => writeEntries(filePath, []))
  };
}

function normalizeEntry(input: GatewayLedgerWrite | GatewayLedgerEntry, now: string): GatewayLedgerEntry {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Gateway ledger entry must be an object.");
  const item = input as Partial<GatewayLedgerEntry>;
  const usage = normalizeUsage(item.usage);
  const createdAt = normalizeTimestamp(item.createdAt) ?? now;
  const completedAt = normalizeTimestamp(item.completedAt) ?? now;
  const status = item.status === "completed" || item.status === "failed" ? item.status : "failed";
  const cost = item.costStatus === "priced-usage" || item.costStatus === "usage-unpriced" || item.costStatus === "usage-unavailable"
    ? item.costStatus
    : "usage-unavailable";
  const actualCostUsd = cost === "priced-usage" && item.actualCostUsd !== undefined ? normalizeUsd(item.actualCostUsd, "Actual cost") : undefined;
  return compact({
    id: validId(item.id) ?? randomUUID(),
    runId: requireText(item.runId, "Run id", 100),
    providerId: requireText(item.providerId, "Provider id", 100),
    providerLabel: requireText(item.providerLabel, "Provider label", 100),
    model: requireText(item.model, "Model", 200),
    status,
    createdAt,
    completedAt,
    promptCharacters: normalizeNonNegative(item.promptCharacters, "Prompt characters"),
    contextCharacters: normalizeNonNegative(item.contextCharacters, "Context characters"),
    inputTokensEstimated: normalizeTokenCount(item.inputTokensEstimated, "Input token estimate"),
    maxOutputTokens: normalizeTokenCount(item.maxOutputTokens, "Output token cap"),
    ...(usage ? { usage } : {}),
    costStatus: cost,
    ...(actualCostUsd !== undefined ? { actualCostUsd } : {}),
    ...(typeof item.error === "string" && item.error.trim() ? { error: safeLedgerErrorCategory(item.error) } : {})
  });
}

function normalizeUsage(value: unknown): GatewayUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<GatewayUsage>;
  const result = compact({
    ...(candidate.inputTokens === undefined ? {} : { inputTokens: normalizeNonNegative(candidate.inputTokens, "Input tokens") }),
    ...(candidate.cachedInputTokens === undefined ? {} : { cachedInputTokens: normalizeNonNegative(candidate.cachedInputTokens, "Cached input tokens") }),
    ...(candidate.outputTokens === undefined ? {} : { outputTokens: normalizeNonNegative(candidate.outputTokens, "Output tokens") }),
    ...(candidate.reasoningTokens === undefined ? {} : { reasoningTokens: normalizeNonNegative(candidate.reasoningTokens, "Reasoning tokens") }),
    ...(candidate.totalTokens === undefined ? {} : { totalTokens: normalizeNonNegative(candidate.totalTokens, "Total tokens") })
  });
  return hasUsage(result) ? result : undefined;
}

function hasUsage(usage: GatewayUsage): boolean {
  return Object.values(usage).some((value) => typeof value === "number");
}

function normalizePricing(value: ProviderPricing | undefined): ProviderPricing | undefined {
  if (!value) return undefined;
  const pricing = compact({
    ...(value.inputPerMillionUsd === undefined ? {} : { inputPerMillionUsd: normalizeUsd(value.inputPerMillionUsd, "Input price") }),
    ...(value.cachedInputPerMillionUsd === undefined ? {} : { cachedInputPerMillionUsd: normalizeUsd(value.cachedInputPerMillionUsd, "Cached input price") }),
    ...(value.outputPerMillionUsd === undefined ? {} : { outputPerMillionUsd: normalizeUsd(value.outputPerMillionUsd, "Output price") }),
    ...(value.reasoningOutputPerMillionUsd === undefined ? {} : { reasoningOutputPerMillionUsd: normalizeUsd(value.reasoningOutputPerMillionUsd, "Reasoning output price") })
  });
  return Object.keys(pricing).length ? pricing : undefined;
}

async function readEntries(filePath: string): Promise<GatewayLedgerEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Partial<LedgerDocument> : undefined;
    if (!source || source.version !== STORE_VERSION || !Array.isArray(source.entries)) return [];
    const entries: GatewayLedgerEntry[] = [];
    const ids = new Set<string>();
    for (const candidate of source.entries.slice(0, MAX_ENTRIES)) {
      try {
        const entry = normalizeEntry(candidate as GatewayLedgerEntry, new Date(0).toISOString());
        if (!ids.has(entry.id)) {
          ids.add(entry.id);
          entries.push(entry);
        }
      } catch {
        // Keep healthy history if an individual line is malformed.
      }
    }
    return sortEntries(entries);
  } catch (error) {
    if (isMissing(error)) return [];
    // A ledger is observability, never a reason to prevent a user from coding.
    return [];
  }
}

async function writeEntries(filePath: string, entries: GatewayLedgerEntry[]): Promise<void> {
  const directory = path.dirname(filePath);
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "w", 0o600);
    await handle.writeFile(`${JSON.stringify({ version: STORE_VERSION, entries: sortEntries(entries).slice(0, MAX_ENTRIES) }, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}

function sortEntries(entries: GatewayLedgerEntry[]): GatewayLedgerEntry[] {
  return [...entries].sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt) || right.id.localeCompare(left.id));
}

function copyEntry(entry: GatewayLedgerEntry): GatewayLedgerEntry {
  return normalizeEntry(entry, entry.createdAt);
}

function normalizeTokenCount(value: unknown, name: string): number {
  const number = normalizeNonNegative(value, name);
  if (number > 10_000_000) throw new RangeError(`${name} is too large.`);
  return number;
}

function normalizeNonNegative(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number.`);
  return Math.floor(value);
}

function normalizeUsd(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000) throw new TypeError(`${name} must be a non-negative finite USD number.`);
  return value;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function requireText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError(`${name} is invalid.`);
  return value.trim();
}

function validId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("Ledger limit must be a non-negative finite number.");
  return Math.min(MAX_ENTRIES, Math.floor(value));
}

/**
 * Provider and network errors can legally echo a request body. Ledger records
 * intentionally keep only a coarse, non-sensitive category; the live UI may
 * show the original error for the active run but it is never persisted here.
 */
function safeLedgerErrorCategory(value: string): string {
  const lowered = value.toLowerCase();
  if (/timeout|timed out|abort/.test(lowered)) return "Provider request timed out.";
  if (/budget|cost cap|spend cap/.test(lowered)) return "Gateway budget policy blocked the run.";
  if (/consent|approve/.test(lowered)) return "Gateway consent was not approved.";
  if (/credential|api key|unauthori[sz]ed|forbidden|\b401\b|\b403\b/.test(lowered)) return "Provider authentication or authorization failed.";
  if (/rate limit|\b429\b/.test(lowered)) return "Provider rate limit blocked the run.";
  return "Provider request failed.";
}

function requireDirectory(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("A user data directory is required.");
  return value;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

function compact<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) if (value[key] === undefined) delete value[key];
  return value;
}
