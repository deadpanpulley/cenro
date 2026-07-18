import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderKind, ProviderPricing, ProviderPublicConfig, ProviderTemplate, ProviderUpsertInput } from "./runtime-types.js";

/**
 * Adapter around Electron safeStorage. Keeping this interface small lets the
 * persistence and validation logic be exercised without an Electron process.
 */
export type SecretProtector = {
  isAvailable(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
};

export type StoredProviderSecret = {
  apiKey: string;
};

export type ProviderStore = {
  readonly filePath: string;
  list(): Promise<ProviderPublicConfig[]>;
  get(id: string): Promise<ProviderPublicConfig | undefined>;
  /** Returns the decrypted key only in the main process. */
  getSecret(id: string): Promise<StoredProviderSecret | undefined>;
  save(input: ProviderUpsertInput): Promise<ProviderPublicConfig>;
  setEnabled(id: string, enabled: boolean): Promise<ProviderPublicConfig>;
  delete(id: string): Promise<boolean>;
  securityStatus(): { encryptionAvailable: boolean };
};

type PersistedProvider = Omit<ProviderPublicConfig, "hasApiKey"> & {
  encryptedApiKey?: string;
};

type ProviderDocument = {
  version: 1;
  providers: PersistedProvider[];
};

type UntrustedProviderInput = {
  id?: unknown;
  kind?: unknown;
  label?: unknown;
  model?: unknown;
  baseUrl?: unknown;
  enabled?: unknown;
  pricing?: unknown;
  apiKey?: unknown;
};

const STORE_FILE = "cenro-providers.json";
const MAX_PROVIDERS = 30;
const MAX_API_KEY_LENGTH = 2_000;
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const modelPattern = /^[a-zA-Z0-9._:/@-]{1,200}$/;

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    kind: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    // This is a suggestion only. The provider's explicit model-list test is
    // still the authority for what an individual OpenAI account can use.
    defaultModel: "gpt-4.1",
    modelHint: "GPT-4.1 is the suggested Gateway lead; choose any model available to your account",
    description: "Uses OpenAI's Responses API. Cenro asks before task context leaves this device."
  },
  {
    kind: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    modelHint: "Choose a Claude Messages API model",
    description: "Uses Anthropic's Messages API after explicit external consent."
  },
  {
    kind: "openai-compatible",
    label: "OpenAI-compatible",
    defaultBaseUrl: "https://example.invalid/v1",
    modelHint: "Enter an endpoint and model id",
    description: "For compatible services such as hosted DeepSeek, GLM, OpenRouter, Groq, or self-hosted endpoints."
  }
];

/**
 * Stores public provider metadata in JSON and API keys encrypted with the OS
 * key store. A plaintext fallback is intentionally never implemented.
 */
export function createProviderStore(userDataDir: string, protector: SecretProtector): ProviderStore {
  const filePath = path.join(userDataDir, STORE_FILE);
  let queue = Promise.resolve();

  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation, operation);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function readDocument(): Promise<ProviderDocument> {
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      return normalizeDocument(parsed);
    } catch (error) {
      if (isMissing(error)) return { version: 1, providers: [] };
      // Corrupt provider metadata must not silently erase users' encrypted keys.
      throw new Error("Cenro could not read provider settings. Restore or remove cenro-providers.json before changing providers.");
    }
  }

  async function writeDocument(document: ProviderDocument): Promise<void> {
    await mkdir(userDataDir, { recursive: true });
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, filePath);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  function publicConfig(provider: PersistedProvider): ProviderPublicConfig {
    const { encryptedApiKey: _secret, ...metadata } = provider;
    return { ...metadata, hasApiKey: Boolean(provider.encryptedApiKey) };
  }

  return {
    filePath,
    list: () => serial(async () => (await readDocument()).providers.map(publicConfig).sort((left, right) => left.label.localeCompare(right.label))),
    get: (id) => serial(async () => {
      assertProviderId(id);
      const provider = (await readDocument()).providers.find((entry) => entry.id === id);
      return provider ? publicConfig(provider) : undefined;
    }),
    getSecret: (id) => serial(async () => {
      assertProviderId(id);
      const provider = (await readDocument()).providers.find((entry) => entry.id === id);
      if (!provider?.encryptedApiKey) return undefined;
      if (!protector.isAvailable()) throw new Error("Windows encrypted storage is unavailable, so Cenro cannot unlock this provider key.");
      try {
        const apiKey = protector.decrypt(Buffer.from(provider.encryptedApiKey, "base64"));
        if (!apiKey) throw new Error("empty decrypted key");
        return { apiKey };
      } catch {
        throw new Error("Cenro could not unlock this provider key for the current Windows account. Add the key again in Settings.");
      }
    }),
    save: (input) => serial(async () => {
      if (input.id !== undefined) assertProviderId(input.id);
      if (Object.prototype.hasOwnProperty.call(input, "apiKey") && input.apiKey !== undefined && typeof input.apiKey !== "string") {
        throw new Error("Provider API key is invalid.");
      }
      const document = await readDocument();
      const existing = input.id ? document.providers.find((entry) => entry.id === input.id) : undefined;
      if (input.id && !existing) throw new Error("The provider to update was not found.");
      if (!existing && document.providers.length >= MAX_PROVIDERS) throw new Error(`Cenro supports at most ${MAX_PROVIDERS} configured providers.`);

      const normalized = normalizeInput(input, existing);
      let encryptedApiKey = existing?.encryptedApiKey;
      if (Object.prototype.hasOwnProperty.call(input, "apiKey")) {
        const suppliedKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
        if (suppliedKey) {
          if (suppliedKey.length > MAX_API_KEY_LENGTH) throw new Error("Provider key is too long.");
          if (!protector.isAvailable()) throw new Error("Windows encrypted storage is unavailable. Cenro will not save a provider key in plaintext.");
          encryptedApiKey = protector.encrypt(suppliedKey).toString("base64");
        } else {
          encryptedApiKey = undefined;
        }
      }

      const record: PersistedProvider = { ...normalized, encryptedApiKey };
      if (existing) {
        document.providers = document.providers.map((entry) => entry.id === existing.id ? record : entry);
      } else {
        document.providers.push(record);
      }
      await writeDocument(document);
      return publicConfig(record);
    }),
    setEnabled: (id, enabled) => serial(async () => {
      assertProviderId(id);
      if (typeof enabled !== "boolean") throw new Error("Provider enabled state must be true or false.");
      const document = await readDocument();
      const index = document.providers.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("The provider was not found.");
      const updated: PersistedProvider = { ...document.providers[index], enabled, updatedAt: new Date().toISOString() };
      document.providers[index] = updated;
      await writeDocument(document);
      return publicConfig(updated);
    }),
    delete: (id) => serial(async () => {
      assertProviderId(id);
      const document = await readDocument();
      const next = document.providers.filter((entry) => entry.id !== id);
      if (next.length === document.providers.length) return false;
      document.providers = next;
      await writeDocument(document);
      return true;
    }),
    securityStatus: () => ({ encryptionAvailable: protector.isAvailable() })
  };
}

function normalizeDocument(value: unknown): ProviderDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid provider document");
  const source = value as Partial<ProviderDocument>;
  if (source.version !== 1 || !Array.isArray(source.providers) || source.providers.length > MAX_PROVIDERS) throw new Error("invalid provider document");
  const identifiers = new Set<string>();
  const providers = source.providers.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid provider entry");
    const provider = item as Partial<PersistedProvider>;
    const normalized = normalizeInput({
      id: provider.id,
      kind: provider.kind,
      label: provider.label,
      model: provider.model,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      pricing: provider.pricing
    }, undefined, { createdAt: provider.createdAt, updatedAt: provider.updatedAt });
    if (identifiers.has(normalized.id)) throw new Error("duplicate provider id");
    identifiers.add(normalized.id);
    if (provider.encryptedApiKey !== undefined && (typeof provider.encryptedApiKey !== "string" || provider.encryptedApiKey.length > MAX_API_KEY_LENGTH * 4)) {
      throw new Error("invalid encrypted provider key");
    }
    return provider.encryptedApiKey ? { ...normalized, encryptedApiKey: provider.encryptedApiKey } : normalized;
  });
  return { version: 1, providers };
}

function normalizeInput(input: UntrustedProviderInput, existing?: PersistedProvider, timestamps?: { createdAt?: unknown; updatedAt?: unknown }): Omit<PersistedProvider, "encryptedApiKey"> {
  if (!input || typeof input !== "object") throw new Error("Provider settings are required.");
  const kind = normalizeKind(input.kind);
  const id = existing?.id ?? (typeof input.id === "string" && input.id ? input.id : randomUUID());
  assertProviderId(id);
  const label = normalizeLabel(input.label);
  const model = normalizeModel(input.model);
  const baseUrl = normalizeBaseUrl(input.baseUrl, kind);
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("Provider enabled state must be true or false.");
  const pricing = input.pricing === undefined ? existing?.pricing : normalizePricing(input.pricing);
  const now = new Date().toISOString();
  const createdAt = existing?.createdAt ?? validIso(timestamps?.createdAt) ?? now;
  const updatedAt = now;
  return { id, kind, label, model, baseUrl, enabled: input.enabled !== false, ...(pricing ? { pricing } : {}), createdAt, updatedAt };
}

function normalizePricing(value: unknown): ProviderPricing | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provider price card is invalid.");
  const source = value as Partial<ProviderPricing>;
  const entries: Array<keyof ProviderPricing> = ["inputPerMillionUsd", "cachedInputPerMillionUsd", "outputPerMillionUsd", "reasoningOutputPerMillionUsd"];
  const normalized: ProviderPricing = {};
  for (const key of entries) {
    const rate = source[key];
    if (rate === undefined) continue;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1_000_000) throw new Error("Provider price card rates must be non-negative USD per million tokens.");
    normalized[key] = rate;
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeKind(value: unknown): ProviderKind {
  if (value === "openai" || value === "anthropic" || value === "openai-compatible") return value;
  throw new Error("Choose OpenAI, Anthropic, or an OpenAI-compatible provider.");
}

function normalizeLabel(value: unknown): string {
  if (typeof value !== "string") throw new Error("Provider name is required.");
  const label = value.replace(/\s+/g, " ").trim();
  if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) throw new Error("Provider name must be 1–80 normal characters.");
  return label;
}

function normalizeModel(value: unknown): string {
  if (typeof value !== "string" || !modelPattern.test(value)) throw new Error("Provider model id is invalid.");
  return value;
}

function normalizeBaseUrl(value: unknown, kind: ProviderKind): string {
  const fallback = kind === "openai"
    ? "https://api.openai.com/v1"
    : kind === "anthropic"
      ? "https://api.anthropic.com/v1"
      : undefined;
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (!raw) throw new Error("A base URL is required for an OpenAI-compatible provider.");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Provider base URL is invalid.");
  }
  const localHttp = parsed.protocol === "http:" && isLoopbackHost(parsed.hostname);
  if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Provider endpoints must use HTTPS (or localhost HTTP) and cannot contain credentials, a query, or a fragment.");
  }
  return parsed.href.replace(/\/$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function assertProviderId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error("Provider id is invalid.");
}

function validIso(value: unknown): string | undefined {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}
