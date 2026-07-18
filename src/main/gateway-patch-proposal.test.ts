import { describe, expect, it } from "vitest";
import {
  MAX_GATEWAY_PATCH_CONTENT_BYTES,
  MAX_GATEWAY_PATCH_FILES,
  parseGatewayPatchOrText,
  parseGatewayPatchProposal
} from "./gateway-patch-proposal.js";

const validProposal = {
  summary: "Add a focused greeting helper.",
  files: [
    {
      path: "src/greeting.ts",
      action: "create",
      content: "export const greeting = (name: string) => `Hello ${name}`;\n",
      reason: "Keeps the greeting behavior isolated and importable."
    }
  ],
  verification: ["Run npm test.", "Import greeting from the entry point and confirm the output."]
};

describe("Context Gateway cloud patch proposal boundary", () => {
  it("accepts only the explicit review contract and preserves complete replacement text", () => {
    const parsed = parseGatewayPatchProposal(`\`\`\`json\n${JSON.stringify(validProposal)}\n\`\`\``);

    expect(parsed).toMatchObject({
      ok: true,
      proposal: {
        summary: validProposal.summary,
        verification: validProposal.verification,
        files: [{ path: "src/greeting.ts", action: "create", content: validProposal.files[0].content, reason: validProposal.files[0].reason }]
      }
    });
  });

  it("inherits workspace path, secret-path, and content safeguards from the project proposal validator", () => {
    const traversal = parseGatewayPatchProposal({
      ...validProposal,
      files: [{ ...validProposal.files[0], path: "../outside.ts" }]
    });
    const secret = parseGatewayPatchProposal({
      ...validProposal,
      files: [{ ...validProposal.files[0], path: ".env" }]
    });
    const binary = parseGatewayPatchProposal({
      ...validProposal,
      files: [{ ...validProposal.files[0], path: "assets/logo.png" }]
    });

    expect(traversal.ok).toBe(false);
    expect(secret.ok).toBe(false);
    expect(binary.ok).toBe(false);
    if (!secret.ok) expect(secret.error).toMatch(/secret/i);
  });

  it("requires an explicit create/update action, reason, verification, and no unsupported fields", () => {
    const missingAction = parseGatewayPatchProposal({
      ...validProposal,
      files: [{ path: "src/greeting.ts", content: "export {};", reason: "A reason." }]
    });
    const noVerification = parseGatewayPatchProposal({ ...validProposal, verification: [] });
    const extraField = parseGatewayPatchProposal({ ...validProposal, confidence: 99 });

    expect(missingAction.ok).toBe(false);
    expect(noVerification.ok).toBe(false);
    expect(extraField.ok).toBe(false);
  });

  it("bounds a cloud change set before it can become a review proposal", () => {
    const files = Array.from({ length: MAX_GATEWAY_PATCH_FILES + 1 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      action: "create",
      content: "export {};\n",
      reason: "Keeps the test change bounded."
    }));
    const parsed = parseGatewayPatchProposal({ ...validProposal, files });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/at most/i);
  });

  it("rejects oversized complete-file content before it can cross into review", () => {
    const parsed = parseGatewayPatchProposal({
      ...validProposal,
      files: [{ ...validProposal.files[0], content: "x".repeat(MAX_GATEWAY_PATCH_CONTENT_BYTES + 1) }]
    });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/combined cloud patch content/i);
  });

  it("keeps malformed or explanation-only cloud output as text instead of creating a proposal", () => {
    const raw = "I would inspect src/greeting.ts first, then make a small reviewed change.";
    const outcome = parseGatewayPatchOrText(raw);

    expect(outcome).toEqual({ kind: "text-only", response: raw });
  });
});
