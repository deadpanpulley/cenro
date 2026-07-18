import { describe, expect, it } from "vitest";
import { buildGatewayHardwarePolicy } from "./gateway-hardware-policy.js";

describe("Context Gateway hardware policy", () => {
  it("recommends one small Context Engine on an 8 GB machine and never parallel local models", () => {
    const plan = buildGatewayHardwarePolicy({ memoryGb: 8, logicalCpuCores: 16 });
    const context = plan.models.find((model) => model.model === "qwen3:1.7b");
    const reviewer = plan.models.find((model) => model.model === "qwen2.5-coder:3b");

    expect(plan).toMatchObject({ memoryTier: "entry", maxConcurrentLocalModels: 1, localRolesAreSequential: true });
    expect(context?.state).toBe("recommended");
    expect(reviewer?.state).toBe("optional");
  });

  it("does not recommend a local LLM below the minimum memory tier", () => {
    const plan = buildGatewayHardwarePolicy({ memoryBytes: 7.9 * 1024 ** 3 });
    expect(plan.memoryTier).toBe("below-minimum");
    expect(plan.models.every((model) => model.state === "not-recommended")).toBe(true);
  });

  it("unlocks a sequential local reviewer at 12 GB and a research helper at 24 GB", () => {
    const balanced = buildGatewayHardwarePolicy({ memoryGb: 12 });
    const highMemory = buildGatewayHardwarePolicy({ memoryGb: 24, gpuVramGb: 12 });

    expect(balanced.models.find((model) => model.model === "qwen2.5-coder:3b")?.state).toBe("recommended");
    expect(balanced.models.find((model) => model.model === "qwen3:4b")?.state).toBe("optional");
    expect(highMemory.models.find((model) => model.model === "qwen3:4b")?.state).toBe("recommended");
    expect(highMemory.maxConcurrentLocalModels).toBe(1);
  });

  it("does not offer a redundant download for an installed model", () => {
    const plan = buildGatewayHardwarePolicy({ memoryGb: 8, installedModels: ["QWEN3:1.7B"] });
    const context = plan.models.find((model) => model.model === "qwen3:1.7b");

    expect(context).toMatchObject({ state: "ready" });
    expect(context?.reason).toMatch(/already installed/i);
  });
});
