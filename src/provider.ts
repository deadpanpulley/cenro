import type { ChatMessage, CompletionRequest, CompletionResponse, Provider, ProviderKind } from "./types.js";

interface OpenAiCompatibleOptions {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export class OpenAiCompatibleProvider implements Provider {
  readonly kind: ProviderKind;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;

  constructor(options: OpenAiCompatibleOptions) {
    this.kind = options.kind;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.apiKey = options.apiKey;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: this.model, messages: request.messages, temperature: request.temperature ?? 0.2 })
    });
    if (!response.ok) throw new Error(`${this.kind} provider failed: ${response.status} ${await response.text()}`);

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.kind} provider returned no text response`);
    return { content, model: payload.model ?? this.model, provider: this.kind };
  }
}

export function systemPrompt(): ChatMessage {
  return {
    role: "system",
    content: "You are RelayCode, a careful coding assistant. Inspect relevant files before proposing edits. State assumptions, keep changes small, and never claim commands were run unless tool output was provided."
  };
}
