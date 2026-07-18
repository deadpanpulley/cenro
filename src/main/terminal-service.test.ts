import { describe, expect, it } from "vitest";
import { TerminalService } from "./terminal-service.js";

describe("terminal command approval", () => {
  it("keeps a high-risk AI command inert until a user-owned session explicitly runs it", () => {
    const events: unknown[] = [];
    const terminal = new TerminalService((_owner, _event, payload) => events.push(payload));
    const proposal = terminal.createProposal(42, {
      cwd: "C:\\workspace",
      command: "Remove-Item -Recurse -Force build",
      reason: "Clear generated build output"
    });

    expect(proposal.riskLevel).toBe("high");
    expect(proposal.userMustApprove).toBe(true);
    expect(proposal.mayAccessOutsideWorkspace).toBe(true);
    // There is no implicit execution path from a proposal alone.
    expect(events).toEqual([]);
    expect(() => terminal.runProposal(42, "no-session", proposal.id)).toThrow(/session/i);
  });

  it("requires a resolved workspace cwd before an AI command can be proposed", () => {
    const terminal = new TerminalService(() => undefined);
    expect(() => terminal.createProposal(7, { cwd: "", command: "npm test" })).toThrow(/directory/i);
    expect(() => terminal.start(7, "")).toThrow(/workspace/i);
  });
});
