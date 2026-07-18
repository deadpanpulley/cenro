import { describe, expect, it } from "vitest";
import { selectedWorkspaceScanRoot } from "./workspace-scan-policy.js";

describe("workspace scan authority", () => {
  it("ignores a renderer-supplied root and retains the selected workspace", () => {
    expect(selectedWorkspaceScanRoot("C:\\Projects\\cenro", "C:\\Windows\\System32")).toBe("C:\\Projects\\cenro");
  });

  it("requires an already selected workspace before any scan", () => {
    expect(() => selectedWorkspaceScanRoot("", "C:\\Windows")).toThrow(/Choose a workspace/i);
  });
});
