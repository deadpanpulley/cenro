import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertGatewayApproval, buildGatewayContextPack, redactSensitiveText } from "./context-gateway.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "cenro-gateway-context-test-"));
  directories.push(root);
  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const destination = path.join(root, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }));
  return root;
}

describe("Context Gateway provenance and privacy acceptance", () => {
  it("builds a reviewable repository-aware pack while excluding secret paths and redacting inline secrets", async () => {
    const rawOpenAiKey = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
    const rawPrivateKey = "-----BEGIN PRIVATE KEY-----\\nprivate-material-should-never-leave\\n-----END PRIVATE KEY-----";
    const root = await workspace({
      "package.json": JSON.stringify({ name: "safe-project", scripts: { test: "vitest run" } }),
      "src/app.ts": `export const apiKey = \"${rawOpenAiKey}\";\nexport function buildGateway() { return apiKey.length; }\n`,
      "src/app.test.ts": "import { buildGateway } from './app.js';\nvoid buildGateway;\n",
      ".env": `OPENAI_API_KEY=${rawOpenAiKey}`,
      "certs/deploy.pem": rawPrivateKey
    });

    const pack = await buildGatewayContextPack(root, "Fix the app gateway and verify the test", {
      now: () => new Date("2026-07-18T00:00:00.000Z")
    });
    const publicReceipt = JSON.stringify(pack.analysis);
    const cloudWithWorkspace = pack.cloudPrompt(true);
    const cloudWithoutWorkspace = pack.cloudPrompt(false);

    expect(pack.analysis.selectedFiles.some((file) => file.relativePath === "src/app.ts")).toBe(true);
    expect(pack.analysis.exclusions.find((entry) => entry.category === "secret-looking")?.count).toBe(2);
    expect(pack.analysis.redactionsApplied).toBeGreaterThan(0);
    expect(pack.integrity.selectedSlices.every((slice) => /^[a-f0-9]{64}$/.test(slice.sha256) && slice.lineStart >= 1 && slice.lineEnd >= slice.lineStart)).toBe(true);

    // The renderer-safe analysis and full cloud payload must never reproduce
    // raw credentials or secret-path contents.
    expect(publicReceipt).not.toContain(rawOpenAiKey);
    expect(publicReceipt).not.toContain("private-material-should-never-leave");
    expect(cloudWithWorkspace).not.toContain(rawOpenAiKey);
    expect(cloudWithWorkspace).not.toContain("private-material-should-never-leave");
    expect(cloudWithWorkspace).toContain("[CENRO_REDACTED_SECRET]");
    expect(cloudWithWorkspace).not.toContain(".env");
    expect(cloudWithWorkspace).not.toContain("deploy.pem");

    // Refusing workspace sharing must remove both code slices and the
    // repository dossier, leaving only the user request and an honest notice.
    expect(cloudWithoutWorkspace).toContain("Fix the app gateway");
    expect(cloudWithoutWorkspace).not.toContain("src/app.ts");
    expect(cloudWithoutWorkspace).not.toContain("REPOSITORY MAP");
  });

  it("changes the immutable pack digest when selected evidence changes", async () => {
    const root = await workspace({
      "package.json": "{\"name\":\"context-test\"}",
      "src/app.ts": "export function greeting() { return 'first'; }\n"
    });
    const options = { now: () => new Date("2026-07-18T00:00:00.000Z") };
    const first = await buildGatewayContextPack(root, "Update greeting", options);
    await writeFile(path.join(root, "src", "app.ts"), "export function greeting() { return 'second'; }\n", "utf8");
    const second = await buildGatewayContextPack(root, "Update greeting", options);

    expect(first.integrity.packDigest).not.toBe(second.integrity.packDigest);
    expect(first.integrity.sourceDigest).not.toBe(second.integrity.sourceDigest);
    expect(first.analysis.contextPackId).not.toBe(second.analysis.contextPackId);
  });

  it("scrubs known inline credential formats before any package or receipt can be built", () => {
    const source = [
      "const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';",
      "Authorization: Bearer this-token-is-long-enough-to-be-redacted",
      "-----BEGIN PRIVATE KEY-----\\nnever-send-this\\n-----END PRIVATE KEY-----"
    ].join("\\n");
    const redacted = redactSensitiveText(source);

    expect(redacted.redactions).toBeGreaterThanOrEqual(3);
    expect(redacted.content).toContain("[CENRO_REDACTED_SECRET]");
    expect(redacted.content).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(redacted.content).not.toContain("never-send-this");
  });

  it("requires an affirmative consent decision before a cloud-capable run", () => {
    expect(() => assertGatewayApproval({ approved: false })).toThrow(/explicitly approve/i);
    expect(() => assertGatewayApproval({ approved: true })).not.toThrow();
  });

  it("refuses a non-directory as the selected workspace authority", async () => {
    const root = await workspace({ "not-a-workspace.ts": "export {};" });
    await expect(buildGatewayContextPack(path.join(root, "not-a-workspace.ts"), "Inspect this")).rejects.toThrow(/not a folder/i);
  });
});
