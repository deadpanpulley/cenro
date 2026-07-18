import { describe, expect, it } from "vitest";
import { parseAssistantTaskEnvelope } from "./terminal-proposal.js";

describe("AI terminal proposal envelopes", () => {
  it("accepts a bounded command as review-only data", () => {
    const parsed = parseAssistantTaskEnvelope(JSON.stringify({
      response: "I recommend running the test suite before applying changes.",
      terminalProposal: {
        command: "npm test",
        reason: "Run the existing test suite from the selected workspace.",
        riskLevel: "low"
      }
    }));

    expect(parsed).toEqual({
      response: "I recommend running the test suite before applying changes.",
      terminalProposal: {
        command: "npm test",
        reason: "Run the existing test suite from the selected workspace.",
        riskLevel: "low"
      }
    });
  });

  it("rejects malformed or control-character command output before TerminalService sees it", () => {
    expect(parseAssistantTaskEnvelope('{"response":"OK","terminalProposal":{"command":"npm test\\u0000","reason":"Bad"}}')).toBeUndefined();
    expect(parseAssistantTaskEnvelope('{"response":"OK","terminalProposal":{"command":42,"reason":"Bad"}}')).toBeUndefined();
  });
});
