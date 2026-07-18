import "node:process";

export interface AppConfig {
  localBaseUrl: string;
  localModel: string;
  openAiApiKey?: string;
  openAiModel: string;
  cloudThreshold: number;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function configFromEnv(env = process.env): AppConfig {
  return {
    localBaseUrl: env.LOCAL_BASE_URL ?? "http://localhost:11434/v1",
    localModel: env.LOCAL_MODEL ?? "qwen2.5-coder:7b",
    openAiApiKey: env.OPENAI_API_KEY,
    openAiModel: env.OPENAI_MODEL ?? "gpt-4.1-mini",
    cloudThreshold: numberFromEnv(env.CLOUD_THRESHOLD, 0.7)
  };
}
