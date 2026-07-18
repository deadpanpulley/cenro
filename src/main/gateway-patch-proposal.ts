/**
 * A deliberately narrow parser for a cloud lead's review-only file proposal.
 *
 * Cloud output is untrusted. This module only turns a response into a proposal
 * after it satisfies an exact, bounded JSON contract. It never reads or writes
 * a workspace; the main process later binds accepted paths to the selected
 * workspace and captures their review hashes.
 */
import { parseProjectProposal } from "./project-proposal.js";
import type { GatewayPatchProposal, GatewayPatchProposalFile } from "./runtime-types.js";

export type GatewayPatchProposalParseSuccess = {
  ok: true;
  proposal: GatewayPatchProposal;
};

export type GatewayPatchProposalParseFailure = {
  ok: false;
  error: string;
};

export type GatewayPatchProposalParseResult = GatewayPatchProposalParseSuccess | GatewayPatchProposalParseFailure;

/** A small change set keeps a single cloud response reviewable. */
export const MAX_GATEWAY_PATCH_FILES = 12;
export const MAX_GATEWAY_PATCH_CONTENT_BYTES = 500_000;
export const MAX_GATEWAY_PATCH_INPUT_BYTES = 1_500_000;
export const MAX_GATEWAY_PATCH_SUMMARY_LENGTH = 1_500;
export const MAX_GATEWAY_PATCH_REASON_LENGTH = 1_200;
export const MAX_GATEWAY_PATCH_VERIFICATION_STEPS = 12;
export const MAX_GATEWAY_PATCH_VERIFICATION_LENGTH = 600;

type JsonRecord = Record<string, unknown>;

const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * The cloud lead must return exactly:
 * `{ summary, files: [{ path, action, content, reason }], verification }`.
 *
 * Paths and file contents are delegated to the existing project-proposal
 * validator, so cloud proposals inherit its Windows-path, protected-directory,
 * secret-looking path, binary-file, text-file, duplicate-path, and content
 * safeguards. This parser adds the stricter action/reason/verification
 * contract required for the Context Gateway.
 */
export function parseGatewayPatchProposal(raw: unknown): GatewayPatchProposalParseResult {
  try {
    const candidate = parseJsonObject(raw);
    requireOnlyKnownFields(candidate, ["summary", "files", "verification"], "cloud patch proposal");
    const summary = normalizeText(readRequiredString(candidate, "summary", "cloud patch proposal summary"), "cloud patch proposal summary", MAX_GATEWAY_PATCH_SUMMARY_LENGTH);
    const fileValues = candidate.files;
    if (!Array.isArray(fileValues)) throw new ProposalError("The cloud patch proposal files field must be an array.");
    if (fileValues.length === 0) throw new ProposalError("The cloud patch proposal must include at least one file.");
    if (fileValues.length > MAX_GATEWAY_PATCH_FILES) throw new RangeError(`The cloud patch proposal can include at most ${MAX_GATEWAY_PATCH_FILES} files.`);

    let totalContentBytes = 0;
    const modelFiles = fileValues.map((value, index): GatewayPatchProposalFile => {
      const file = requireRecord(value, `Cloud patch proposal file ${index + 1} must be an object.`);
      requireOnlyKnownFields(file, ["path", "action", "content", "reason"], `cloud patch proposal file ${index + 1}`);
      const path = readRequiredString(file, "path", `cloud patch proposal file ${index + 1} path`);
      const content = readRequiredString(file, "content", `cloud patch proposal file ${index + 1} content`);
      const action = file.action;
      if (action !== "create" && action !== "update") {
        throw new ProposalError(`The cloud patch proposal file ${index + 1} action must be \"create\" or \"update\".`);
      }
      const reason = normalizeText(readRequiredString(file, "reason", `cloud patch proposal file ${index + 1} reason`), `cloud patch proposal file ${index + 1} reason`, MAX_GATEWAY_PATCH_REASON_LENGTH);
      totalContentBytes += byteLength(content);
      if (totalContentBytes > MAX_GATEWAY_PATCH_CONTENT_BYTES) {
        throw new RangeError(`The combined cloud patch content exceeds the ${formatBytes(MAX_GATEWAY_PATCH_CONTENT_BYTES)} limit.`);
      }
      return { path, action, content, reason };
    });

    const verificationValues = candidate.verification;
    if (!Array.isArray(verificationValues)) throw new ProposalError("The cloud patch proposal verification field must be an array.");
    if (verificationValues.length === 0) throw new ProposalError("The cloud patch proposal must include at least one verification step.");
    if (verificationValues.length > MAX_GATEWAY_PATCH_VERIFICATION_STEPS) {
      throw new RangeError(`The cloud patch proposal can include at most ${MAX_GATEWAY_PATCH_VERIFICATION_STEPS} verification steps.`);
    }
    const verification = verificationValues.map((value, index) => {
      if (typeof value !== "string") throw new ProposalError(`Cloud patch verification step ${index + 1} must be a string.`);
      return normalizeText(value, `cloud patch verification step ${index + 1}`, MAX_GATEWAY_PATCH_VERIFICATION_LENGTH);
    });

    // Reuse the established project proposal boundary for all filename and
    // complete-text validation. It also normalizes paths to slash-separated
    // workspace-relative form and rejects duplicate paths case-insensitively.
    const compatible = parseProjectProposal({
      summary,
      files: modelFiles.map((file) => ({ path: file.path, action: file.action, content: file.content, summary: file.reason }))
    });
    if (!compatible.ok) throw new ProposalError(compatible.error);
    if (compatible.proposal.files.length !== modelFiles.length) throw new ProposalError("The cloud patch proposal files did not validate.");

    return {
      ok: true,
      proposal: {
        summary: compatible.proposal.summary,
        files: compatible.proposal.files.map((file, index) => {
          const source = modelFiles[index];
          if (file.action !== "create" && file.action !== "update") throw new ProposalError("The cloud patch proposal action did not validate.");
          return { path: file.path, action: file.action, content: file.content, reason: source.reason };
        }),
        verification
      }
    };
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : "The cloud patch proposal is invalid." };
  }
}

/**
 * A malformed or non-patch answer is still useful as an ordinary cloud answer.
 * The caller intentionally receives the original text and no proposal rather
 * than surfacing a validation failure as a failed, already-billed cloud run.
 */
export function parseGatewayPatchOrText(raw: string):
  | { kind: "review-ready"; proposal: GatewayPatchProposal }
  | { kind: "text-only"; response: string } {
  const parsed = parseGatewayPatchProposal(raw);
  return parsed.ok ? { kind: "review-ready", proposal: parsed.proposal } : { kind: "text-only", response: raw };
}

function parseJsonObject(raw: unknown): JsonRecord {
  if (typeof raw === "string") {
    if (byteLength(raw) > MAX_GATEWAY_PATCH_INPUT_BYTES) {
      throw new RangeError(`The cloud patch proposal exceeds the ${formatBytes(MAX_GATEWAY_PATCH_INPUT_BYTES)} input limit.`);
    }
    const json = extractFencedJson(raw);
    if (!json) throw new ProposalError("The cloud patch proposal must contain a JSON object.");
    try {
      return requireRecord(JSON.parse(json) as unknown, "The cloud patch proposal must be a JSON object.");
    } catch (reason) {
      if (reason instanceof ProposalError) throw reason;
      throw new ProposalError("The cloud patch proposal is not valid JSON.");
    }
  }
  return requireRecord(raw, "The cloud patch proposal must be a JSON object.");
}

function extractFencedJson(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const fences = [...value.matchAll(/```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)```/gi)];
  return fences.length === 1 ? fences[0][1].trim() : value;
}

function requireOnlyKnownFields(record: JsonRecord, known: readonly string[], label: string): void {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) throw new ProposalError(`The ${label} contains an unsupported field.`);
  }
}

function requireRecord(value: unknown, message: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ProposalError(message);
  return value as JsonRecord;
}

function readRequiredString(record: JsonRecord, field: string, label: string): string {
  if (!Object.prototype.hasOwnProperty.call(record, field)) throw new ProposalError(`The ${label} is required.`);
  const value = record[field];
  if (typeof value !== "string") throw new ProposalError(`The ${label} must be a string.`);
  return value;
}

function normalizeText(value: string, label: string, maxLength: number): string {
  if (unsafeControlPattern.test(value)) throw new ProposalError(`The ${label} contains unsupported control characters.`);
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) throw new ProposalError(`The ${label} cannot be empty.`);
  if (text.length > maxLength || byteLength(text) > maxLength * 4) throw new RangeError(`The ${label} must be at most ${maxLength} characters.`);
  return text;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1_000)} KB`;
}

class ProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalError";
  }
}
