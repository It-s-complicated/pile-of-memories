import { createHmac } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import type { Card } from "../card";
import {
  buildAttemptStarted,
  buildAttemptSucceeded,
  buildReviewAnalyticsJob,
  hasAnalyticsFingerprintKey,
} from "./enrichment-analytics";

function hmac(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

describe("server enrichment analytics", () => {
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const input = { description: "A private memory" };
  const vocabulary = [
    { id: attemptId, name: "CSS", kind: "topic" as const, description: "" },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Job",
      kind: "tag" as const,
      description: "",
    },
  ];

  it("fingerprints and counts both tags and topics without retaining private text", () => {
    const key = "a-secure-analytics-key-with-32-characters";
    const started = buildAttemptStarted(attemptId, input, vocabulary);
    const output = {
      kind: "note" as const,
      title: " Title ",
      tags: ["Job"],
      topics: ["css", "New"],
    };
    const succeeded = buildAttemptSucceeded(
      started,
      vocabulary,
      output,
      {
        output,
        latencyMs: 125,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, providerCost: null },
      },
      key,
    );
    expect(started.existingTagCount).toBe(2);
    expect(succeeded.generatedTitleFingerprint).toBe(hmac("Title", key));
    expect(succeeded.generatedTagFingerprints).toEqual([
      hmac("job", key),
      hmac("css", key),
      hmac("new", key),
    ]);
    expect(succeeded.generatedTagCount).toBe(3);
    expect(succeeded.vocabularyReuseCount).toBe(2);
    expect(JSON.stringify(succeeded)).not.toContain("A private memory");
  });

  it("degrades to null fingerprints when the key is too short", () => {
    expect(hasAnalyticsFingerprintKey("short")).toBe(false);
    const output = { kind: "note" as const, title: "Title", tags: [], topics: ["CSS"] };
    const succeeded = buildAttemptSucceeded(
      buildAttemptStarted(attemptId, input, vocabulary),
      vocabulary,
      output,
      {
        output,
        latencyMs: 1,
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          providerCost: null,
        },
      },
      "short",
    );
    expect(succeeded.generatedTitleFingerprint).toBeNull();
    expect(succeeded.generatedTagFingerprints).toBeNull();
  });

  it("builds an immutable review job without final private values", () => {
    const key = "another-secure-analytics-key-32-chars";
    const card: Card = {
      kind: "memory",
      id: "00000000-0000-4000-8000-000000000002",
      title: " Final title ",
      body: "Private body",
      position: { x: 0, y: 0 },
      tags: ["Job"],
      topics: ["CSS"],
      links: [],
      archived: false,
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const job = buildReviewAnalyticsJob(
      card,
      {
        enrichmentAttemptId: attemptId,
        resultSource: "ai",
        reviewStartedAt: new Date().toISOString(),
      },
      key,
    );
    expect(job.finalTitleFingerprint).toBe(hmac("Final title", key));
    expect(job.finalTagFingerprints).toEqual([hmac("job", key), hmac("css", key)]);
    expect(job.finalTagCount).toBe(2);
    expect(Object.isFrozen(job)).toBe(true);
    expect(JSON.stringify(job)).not.toContain("Private body");
    expect(JSON.stringify(job)).not.toContain("Final title");
  });
});
