import type { RouteDecision } from "./types.js";

const CLOUD_SIGNALS: Array<[RegExp, number, string]> = [
  [/\b(architect|design|migration|refactor|trade-?off)\b/i, 0.3, "architecture or broad refactor"],
  [/\b(debug|investigate|root cause|why (does|is))\b/i, 0.2, "diagnostic reasoning"],
  [/\b(security|auth|cryptograph|vulnerabilit)/i, 0.2, "security-sensitive work"],
  [/\b(entire|whole|all files|large codebase|multi[- ]file)\b/i, 0.2, "large codebase scope"],
  [/```[\s\S]{3000,}```/, 0.25, "large pasted context"]
];

const LOCAL_SIGNALS: Array<[RegExp, number, string]> = [
  [/\b(format|rename|explain|comment|boilerplate|simple|small)\b/i, 0.2, "routine coding task"],
  [/\b(private|secret|token|password|customer data|confidential)\b/i, 1, "privacy-sensitive content"]
];

export class CostAwareRouter {
  constructor(private readonly cloudThreshold: number, private readonly cloudAvailable: boolean) {}

  decide(request: string, force?: "local" | "openai"): RouteDecision {
    if (force === "local") return { provider: "local", score: 0, reasons: ["forced by user"] };
    if (force === "openai") {
      if (!this.cloudAvailable) throw new Error("OpenAI was requested but OPENAI_API_KEY is not configured.");
      return { provider: "openai", score: 1, reasons: ["forced by user"] };
    }

    let score = 0;
    const reasons: string[] = [];
    for (const [pattern, weight, reason] of CLOUD_SIGNALS) if (pattern.test(request)) { score += weight; reasons.push(reason); }
    for (const [pattern, weight, reason] of LOCAL_SIGNALS) if (pattern.test(request)) { score -= weight; reasons.push(reason); }
    score = Math.max(0, Math.min(1, score));
    const provider = this.cloudAvailable && score >= this.cloudThreshold ? "openai" : "local";
    reasons.push(provider === "local" ? "kept local to reduce cost and data exposure" : "cloud threshold reached");
    return { provider, score, reasons };
  }
}
