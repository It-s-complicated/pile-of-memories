import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { classifyEnrichmentError } from "./enrichment";

describe("enrichment error analytics", () => {
  const invalidOutput = z.string().safeParse(42);
  if (invalidOutput.success) throw new Error("Expected invalid fixture");

  it.each([
    [{}, { configurationMissing: true }, "configuration_missing"],
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
