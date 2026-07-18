import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createProviderStore, type SecretProtector } from "./provider-store.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "cenro-provider-test-"));
  directories.push(directory);
  return directory;
}

const protector: SecretProtector = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
  decrypt: (value) => value.toString("utf8").replace(/^encrypted:/, "")
};

describe("encrypted provider settings", () => {
  it("returns metadata only and never persists a plaintext key", async () => {
    const directory = await temporaryDirectory();
    const store = createProviderStore(directory, protector);
    const provider = await store.save({
      kind: "openai",
      label: "OpenAI demo",
      model: "gpt-5.6",
      apiKey: "sk-local-test-secret"
    });

    expect(provider).toMatchObject({ kind: "openai", hasApiKey: true });
    expect(Object.keys(provider)).not.toContain("apiKey");
    expect(await store.getSecret(provider.id)).toEqual({ apiKey: "sk-local-test-secret" });
    const raw = await readFile(store.filePath, "utf8");
    expect(raw).not.toContain("sk-local-test-secret");
    expect(raw).toContain("encryptedApiKey");
  });

  it("refuses to save a key when OS encrypted storage is unavailable", async () => {
    const directory = await temporaryDirectory();
    const unavailable: SecretProtector = { ...protector, isAvailable: () => false };
    const store = createProviderStore(directory, unavailable);
    await expect(store.save({ kind: "openai", label: "OpenAI", model: "gpt-5.6", apiKey: "key" })).rejects.toThrow(/plaintext/i);
  });

  it("removes an encrypted key when settings explicitly save an empty key", async () => {
    const directory = await temporaryDirectory();
    const store = createProviderStore(directory, protector);
    const created = await store.save({ kind: "openai", label: "OpenAI", model: "gpt-5.6", apiKey: "sk-local-test-secret" });

    const cleared = await store.save({ id: created.id, kind: "openai", label: "OpenAI", model: "gpt-5.6", apiKey: "" });

    expect(cleared.hasApiKey).toBe(false);
    expect(await store.getSecret(created.id)).toBeUndefined();
    expect(await readFile(store.filePath, "utf8")).not.toContain("encryptedApiKey");
  });
});
