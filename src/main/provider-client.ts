import type { GatewayUsage, ProviderConnectionResult, ProviderPublicConfig } from "./runtime-types.js";

export type CloudCompletionRequest = {
  system: string;
  prompt: string;
  /** Kept deliberately small for interactive tasks and connection tests. */
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type CloudCompletionResult = {
  content: string;
  model: string;
  /** Provider-reported usage when the endpoint returned it; never estimated. */
  usage?: GatewayUsage;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_ERROR_CHARS = 800;

/**
 * Sends a completion only after the caller has obtained an explicit consent
 * decision. This module never persists a key and is called in the main process
 * only, keeping provider credentials outside renderer JavaScript.
 */
export async function completeWithProvider(provider: ProviderPublicConfig, apiKey: string, request: CloudCompletionRequest): Promise<CloudCompletionResult> {
  if (!apiKey.trim()) throw new Error("This provider has no saved API key.");
  if (provider.kind === "openai") return completeOpenAiResponses(provider, apiKey, request);
  if (provider.kind === "anthropic") return completeAnthropicMessages(provider, apiKey, request);
  return completeOpenAiCompatible(provider, apiKey, request);
}

/**
 * Validates credentials on an explicit Settings action. OpenAI-compatible
 * providers use their model-list endpoint, avoiding a billed test completion.
 * Anthropic has no equivalent generic model-list endpoint, so the deliberate
 * test is a one-token Messages request using the selected model.
 */
export async function testProviderConnection(provider: ProviderPublicConfig, apiKey: string): Promise<ProviderConnectionResult> {
  try {
    if (provider.kind === "anthropic") {
      await completeAnthropicMessages(provider, apiKey, {
        system: "You are a connection check. Reply with OK.",
        prompt: "OK",
        maxOutputTokens: 1
      });
      return { ok: true, message: "Connected. Anthropic confirmed the selected model with a minimal test request." };
    }
    const response = await fetchWithTimeout(`${provider.baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }
    });
    if (!response.ok) throw await providerHttpError(response);
    const payload = await response.json().catch(() => ({})) as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(payload.data)
      ? payload.data.flatMap((entry) => typeof entry?.id === "string" ? [entry.id] : []).slice(0, 100)
      : undefined;
    const selectedModelListed = models?.some((model) => model.toLowerCase() === provider.model.toLowerCase());
    const message = models && !selectedModelListed
      ? `Connected securely, but ${provider.model} was not returned by this account's model list. Choose an available model before a paid Gateway run. No prompt or workspace content was sent.`
      : "Connected securely. No prompt or workspace content was sent.";
    return { ok: true, message, models };
  } catch (reason) {
    return { ok: false, message: `Connection failed: ${humanError(reason)}` };
  }
}

async function completeOpenAiResponses(provider: ProviderPublicConfig, apiKey: string, request: CloudCompletionRequest): Promise<CloudCompletionResult> {
  const response = await fetchWithTimeout(`${provider.baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      instructions: request.system,
      input: request.prompt,
      max_output_tokens: request.maxOutputTokens ?? 2_500,
      // Cloud task data must not be retained by the Responses API.
      store: false
    })
  }, request.signal);
  if (!response.ok) throw await providerHttpError(response, "OpenAI");
  const payload = await response.json().catch(() => undefined);
  const content = responseText(payload);
  if (!content) throw new Error("OpenAI returned no text output.");
  const usage = parseOpenAiUsage(payload);
  return { content, model: typeof payload?.model === "string" ? payload.model : provider.model, ...(usage ? { usage } : {}) };
}

async function completeAnthropicMessages(provider: ProviderPublicConfig, apiKey: string, request: CloudCompletionRequest): Promise<CloudCompletionResult> {
  const response = await fetchWithTimeout(`${provider.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: request.maxOutputTokens ?? 2_500,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }]
    })
  }, request.signal);
  if (!response.ok) throw await providerHttpError(response, "Anthropic");
  const payload = await response.json().catch(() => undefined) as { content?: Array<{ type?: unknown; text?: unknown }>; model?: unknown } | undefined;
  const content = Array.isArray(payload?.content)
    ? payload.content.flatMap((part) => part?.type === "text" && typeof part.text === "string" ? [part.text] : []).join("\n").trim()
    : "";
  if (!content) throw new Error("Anthropic returned no text output.");
  const usage = parseAnthropicUsage(payload);
  return { content, model: typeof payload?.model === "string" ? payload.model : provider.model, ...(usage ? { usage } : {}) };
}

async function completeOpenAiCompatible(provider: ProviderPublicConfig, apiKey: string, request: CloudCompletionRequest): Promise<CloudCompletionResult> {
  const response = await fetchWithTimeout(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt }
      ],
      temperature: 0.2
    })
  }, request.signal);
  if (!response.ok) throw await providerHttpError(response, "Compatible provider");
  const payload = await response.json().catch(() => undefined) as { choices?: Array<{ message?: { content?: unknown } }>; model?: unknown } | undefined;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Compatible provider returned no text output.");
  const usage = parseCompatibleUsage(payload);
  return { content: content.trim(), model: typeof payload?.model === "string" ? payload.model : provider.model, ...(usage ? { usage } : {}) };
}

async function fetchWithTimeout(url: string, init: RequestInit, externalSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (reason) {
    if (controller.signal.aborted) throw new Error("The provider did not respond within two minutes.");
    throw reason;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abort);
  }
}

async function errorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_CHARS);
  } catch {
    return "";
  }
}

async function providerHttpError(response: Response, provider = "Provider"): Promise<Error> {
  // A provider error can echo a request. Do not carry such text into a local
  // task receipt or log where it could reproduce approved workspace context.
  await errorBody(response);
  return new Error(`${provider} returned ${response.status}. Check the provider settings or connection and try again.`);
}

function responseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const source = payload as { output_text?: unknown; output?: unknown };
  if (typeof source.output_text === "string" && source.output_text.trim()) return source.output_text.trim();
  if (!Array.isArray(source.output)) return "";
  const parts: string[] = [];
  for (const item of source.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

function humanError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Unknown provider error.";
}

function parseOpenAiUsage(payload: unknown): GatewayUsage | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as { usage?: unknown };
  if (!source.usage || typeof source.usage !== "object") return undefined;
  const usage = source.usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown };
    output_tokens_details?: { reasoning_tokens?: unknown };
  };
  return compactUsage({
    inputTokens: tokenNumber(usage.input_tokens),
    cachedInputTokens: tokenNumber(usage.input_tokens_details?.cached_tokens),
    outputTokens: tokenNumber(usage.output_tokens),
    reasoningTokens: tokenNumber(usage.output_tokens_details?.reasoning_tokens),
    totalTokens: tokenNumber(usage.total_tokens)
  });
}

function parseAnthropicUsage(payload: unknown): GatewayUsage | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as { usage?: unknown };
  if (!source.usage || typeof source.usage !== "object") return undefined;
  const usage = source.usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    cache_read_input_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
  };
  const inputTokens = tokenNumber(usage.input_tokens);
  const outputTokens = tokenNumber(usage.output_tokens);
  const cachedInputTokens = tokenNumber(usage.cache_read_input_tokens);
  const cacheCreation = tokenNumber(usage.cache_creation_input_tokens);
  return compactUsage({
    inputTokens,
    cachedInputTokens,
    outputTokens,
    ...(inputTokens !== undefined || outputTokens !== undefined ? { totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheCreation ?? 0) } : {})
  });
}

function parseCompatibleUsage(payload: unknown): GatewayUsage | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as { usage?: unknown };
  if (!source.usage || typeof source.usage !== "object") return undefined;
  const usage = source.usage as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown };
    completion_tokens_details?: { reasoning_tokens?: unknown };
  };
  return compactUsage({
    inputTokens: tokenNumber(usage.prompt_tokens),
    cachedInputTokens: tokenNumber(usage.prompt_tokens_details?.cached_tokens),
    outputTokens: tokenNumber(usage.completion_tokens),
    reasoningTokens: tokenNumber(usage.completion_tokens_details?.reasoning_tokens),
    totalTokens: tokenNumber(usage.total_tokens)
  });
}

function tokenNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function compactUsage(value: GatewayUsage): GatewayUsage | undefined {
  const compact = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as GatewayUsage;
  return Object.keys(compact).length ? compact : undefined;
}
