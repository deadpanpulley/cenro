import { configFromEnv } from "./config.js";
import { OpenAiCompatibleProvider, systemPrompt } from "./provider.js";
import { CostAwareRouter } from "./router.js";

function parseArgs(args: string[]) {
  let force: "local" | "openai" | undefined;
  const prompt: string[] = [];
  for (const arg of args) {
    if (arg === "--local") force = "local";
    else if (arg === "--cloud") force = "openai";
    else prompt.push(arg);
  }
  return { force, prompt: prompt.join(" ") };
}

const { force, prompt } = parseArgs(process.argv.slice(2));
if (!prompt) {
  console.error("Usage: npm run dev -- [--local|--cloud] <coding request>");
  process.exitCode = 1;
} else {
  const config = configFromEnv();
  const router = new CostAwareRouter(config.cloudThreshold, Boolean(config.openAiApiKey));
  const decision = router.decide(prompt, force);
  const provider = decision.provider === "local"
    ? new OpenAiCompatibleProvider({ kind: "local", baseUrl: config.localBaseUrl, model: config.localModel })
    : new OpenAiCompatibleProvider({ kind: "openai", baseUrl: "https://api.openai.com/v1", model: config.openAiModel, apiKey: config.openAiApiKey });

  console.error(`[route] ${decision.provider} (${decision.score.toFixed(2)}): ${decision.reasons.join(", ")}`);
  const result = await provider.complete({ messages: [systemPrompt(), { role: "user", content: prompt }] });
  console.log(result.content);
}
