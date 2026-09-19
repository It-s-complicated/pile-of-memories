import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as z from "zod";
import { chat } from "@tanstack/ai";
import { classifyEnrichmentError, enrichMemory } from "./enrichment";

vi.mock("$app/env/private", () => ({ OPENCODE_GO_API_KEY: "test", TYPESAFE_API_KEY: "test" }));
vi.mock("@tanstack/ai", () => ({ chat: vi.fn(), generateMessageId: () => "test" }));
afterEach(() => vi.unstubAllGlobals());

it("combines a generated title with only vocabulary-selected labels, including no matches", async () => {
  vi.mocked(chat).mockResolvedValue('{"title":"A CSS note"}');
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Response.json({
        answers: { kind: { type: "choice", choice: "note" }, label_0: { type: "noul", noul: 0.9 } },
        usage: { input_tokens: 10, output_tokens: 1 },
      }),
    ),
  );
  const result = await enrichMemory({ description: "Learning CSS grid", existingTags: ["CSS"] });
  expect(result.output).toEqual({ kind: "note", title: "A CSS note", tags: ["CSS"] });
  expect(result.usage.providerCost).toBeNull();
  expect(
    (await enrichMemory({ description: "Learning CSS grid", existingTags: [] })).output,
  ).toEqual({ kind: "note", title: "A CSS note", tags: [] });
});

it("cancels the other provider on failure so the caller can use its manual fallback", async () => {
  vi.mocked(chat).mockRejectedValue(new SyntaxError("invalid json"));
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, request) => {
      signal = request.signal;
      return new Promise((_resolve, reject) =>
        signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
      );
    }),
  );
  await expect(
    enrichMemory({ description: "Memory", existingTags: ["CSS"] }),
  ).rejects.toMatchObject({ errorCode: "invalid_provider_json" });
  expect(signal?.aborted).toBe(true);
});

describe("enrichment error analytics", () => {
  const invalidOutput = z.string().safeParse(42);
  if (invalidOutput.success) throw new Error("Expected invalid fixture");

  it.each([
    [{ name: "AbortError" }, {}, "provider_timeout"],
    [new DOMException("aborted", "AbortError"), {}, "provider_timeout"],
    [{ status: 429 }, {}, "provider_rejected"],
    [{ status: 429, response: "invalid" }, {}, "provider_rejected"],
    [new SyntaxError("private provider response"), {}, "invalid_provider_json"],
    [invalidOutput.error, {}, "invalid_provider_output"],
    [new Error("private provider error"), {}, "unknown"],
  ] as const)("classifies a safe error category", (error, options, expected) => {
    expect(classifyEnrichmentError(error, options)).toBe(expected);
  });
});
