import { afterEach, describe, expect, it, vi } from "vitest";
import { completeWithProvider, testProviderConnection } from "./provider-client.js";

const provider = {
  id: "openai",
  kind: "openai" as const,
  label: "OpenAI",
  model: "gpt-5.6",
  baseUrl: "https://api.openai.com/v1",
  enabled: true,
  hasApiKey: true,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z"
};

afterEach(() => vi.unstubAllGlobals());

describe("provider usage receipts", () => {
  it("keeps Responses data non-stored and preserves provider-reported cached/reasoning usage", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "gpt-5.6",
      output_text: "Implemented plan.",
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
        input_tokens_details: { cached_tokens: 40 },
        output_tokens_details: { reasoning_tokens: 30 }
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const result = await completeWithProvider(provider, "sk-test-not-a-real-key", {
      system: "system",
      prompt: "user",
      maxOutputTokens: 300
    });

    expect(result).toMatchObject({
      content: "Implemented plan.",
      model: "gpt-5.6",
      usage: { inputTokens: 120, cachedInputTokens: 40, outputTokens: 80, reasoningTokens: 30, totalTokens: 200 }
    });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ store: false, model: "gpt-5.6", max_output_tokens: 300 });
  });

  it("tests the account model list without sending a prompt and flags an unavailable selected model", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "gpt-5.3" }, { id: "gpt-5.4-mini" }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const result = await testProviderConnection({ ...provider, model: "gpt-5.4" }, "sk-test-not-a-real-key");

    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["gpt-5.3", "gpt-5.4-mini"]);
    expect(result.message).toMatch(/gpt-5\.4 was not returned/i);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/models");
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
  });
});
