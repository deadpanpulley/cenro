import { describe, expect, it } from "vitest";
import { CURATED_PLAYBOOKS, expandPlaybook } from "./playbook-service.js";
import type { Playbook } from "./runtime-types.js";

describe("playbook expansion", () => {
  it("expands declared variables and reports missing required values", () => {
    const playbook: Playbook = {
      id: "test-playbook",
      name: "Test",
      description: "Test playbook",
      category: "build",
      template: "Build {{project_name}} with {{stack}}.",
      variables: [
        { name: "project_name", label: "Project", required: true },
        { name: "stack", label: "Stack", required: false, defaultValue: "TypeScript" }
      ],
      builtIn: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };

    const incomplete = expandPlaybook(playbook, {});
    expect(incomplete.missingVariables).toEqual(["project_name"]);
    expect(incomplete.prompt).toContain("with TypeScript");

    const complete = expandPlaybook(playbook, { project_name: "Cenro", stack: "React" });
    expect(complete.missingVariables).toEqual([]);
    expect(complete.prompt).toBe("Build Cenro with React.");
  });

  it("ships the seven curated local playbooks", () => {
    expect(CURATED_PLAYBOOKS.map((playbook) => playbook.id)).toEqual([
      "build-polished-app",
      "create-project",
      "debug-verify",
      "explain-codebase",
      "research-sources",
      "learn-topic",
      "review-security"
    ]);
    expect(CURATED_PLAYBOOKS.every((playbook) => playbook.builtIn)).toBe(true);
  });
});
