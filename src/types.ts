export type ProviderKind = "local" | "openai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  provider: ProviderKind;
}

export interface Provider {
  readonly kind: ProviderKind;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

export interface RouteDecision {
  provider: ProviderKind;
  score: number;
  reasons: string[];
}
