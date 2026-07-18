import type { TerminalRiskLevel } from "./runtime-types.js";

/** A model-proposed command is data only until TerminalService creates a card. */
export type AssistantTerminalProposal = {
  command: string;
  reason: string;
  riskLevel?: TerminalRiskLevel;
};

export type AssistantTaskEnvelope = {
  response: string;
  terminalProposal?: AssistantTerminalProposal;
};

const MAX_RESPONSE_CHARS = 200_000;
const MAX_COMMAND_CHARS = 12_000;
const MAX_REASON_CHARS = 300;
const unsupportedControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * Adds a constrained, review-only terminal proposal to a normal task answer.
 * The caller still validates it through TerminalService and never executes it.
 */
export const terminalProposalEnvelopeInstruction = [
  "Return ONLY one JSON object with this exact shape:",
  '{"response": string, "terminalProposal": {"command": string, "reason": string, "riskLevel": "low"|"medium"|"high"} | null}.',
  "Use terminalProposal only when one concrete local command would help the user continue or verify work.",
  "The command is an inert review card: do not claim it ran, do not include cd because Cenro supplies the workspace directory, and never include hidden execution, credential access, destructive cleanup, publishing, or a command that downloads and executes remote code.",
  "If no safe useful command is needed, set terminalProposal to null."
].join("\n");

/** Safely parse an optional proposal without trusting model output. */
export function parseAssistantTaskEnvelope(raw: unknown): AssistantTaskEnvelope | undefined {
  const candidate = parseJsonObject(raw);
  if (!candidate) return undefined;
  const response = candidate.response;
  if (typeof response !== "string" || !response.trim() || response.length > MAX_RESPONSE_CHARS || unsupportedControls.test(response)) return undefined;
  const terminalProposal = normalizeProposal(candidate.terminalProposal);
  if (candidate.terminalProposal !== undefined && candidate.terminalProposal !== null && !terminalProposal) return undefined;
  return { response: response.trim(), ...(terminalProposal ? { terminalProposal } : {}) };
}

function parseJsonObject(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || raw.length > MAX_RESPONSE_CHARS + MAX_COMMAND_CHARS + MAX_REASON_CHARS + 4_000) return undefined;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
  try {
    const candidate = JSON.parse(fenced) as unknown;
    return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function normalizeProposal(value: unknown): AssistantTerminalProposal | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const proposal = value as { command?: unknown; reason?: unknown; riskLevel?: unknown };
  if (typeof proposal.command !== "string" || !proposal.command.trim() || proposal.command.length > MAX_COMMAND_CHARS || unsupportedControls.test(proposal.command)) return undefined;
  if (typeof proposal.reason !== "string" || !proposal.reason.trim() || proposal.reason.length > MAX_REASON_CHARS || unsupportedControls.test(proposal.reason)) return undefined;
  if (proposal.riskLevel !== undefined && proposal.riskLevel !== "low" && proposal.riskLevel !== "medium" && proposal.riskLevel !== "high") return undefined;
  return {
    command: proposal.command.trim(),
    reason: proposal.reason.replace(/\s+/g, " ").trim(),
    ...(proposal.riskLevel ? { riskLevel: proposal.riskLevel } : {})
  };
}
