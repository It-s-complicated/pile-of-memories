import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { selectMemoryLabels } from "./label-selection";

afterEach(() => vi.unstubAllGlobals());

function mockAnswers(probabilities: number[], kind: string = "note") {
  const response = {
    answers: {
      kind: { type: "choice", choice: kind },
      ...Object.fromEntries(
        probabilities.map((probability, index) => [
          `label_${index}`,
          {
            type: "noul",
            noul: probability,
          },
        ]),
      ),
    },
    usage: { input_tokens: 100, output_tokens: 10 },
  };
  const fetchMock = vi.fn().mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("candidate label selection", () => {
  it("batches candidates and keeps the first five ask.if matches without ranking probabilities", async () => {
    const fetchMock = mockAnswers([0.1, 0.51, 0.95, 0.9, 0.85, 1, 0.99, 0.5]);
    const input = {
      description: "A memory about building a personal website",
      existingTags: [
        "Unrelated",
        "Boundary",
        "CSS",
        "Web development",
        "Hosting",
        "Project",
        "AI",
        "Uncertain",
      ],
    };
    const signal = new AbortController().signal;
    const result = await selectMemoryLabels(input, signal);
    expect(result).toEqual({
      kind: "note",
      tags: ["Boundary", "CSS", "Web development", "Hosting", "Project"],
      inputTokens: 100,
      outputTokens: 10,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]![1];
    expect(request.signal).toBe(signal);
    const body = JSON.parse(request.body);
    expect(body.state).toEqual({ memory: input.description });
    expect(Object.keys(body.questions)).toHaveLength(9);
    expect(body.questions.kind.type).toBe("choice");
    expect(Object.keys(body.questions.kind.criteria)).toEqual(["memory", "idea", "note"]);
    expect(body.questions.label_2.instructions).toContain('"CSS"');
    expect(body.questions.label_2.type).toBe("noul");
    expect(body.questions.label_2.instructions).toContain("passing mentions");
  });

  it("uses the default ask.if boolean, excluding 0.5 and accepting just above it", async () => {
    mockAnswers([0.49, 0.5]);
    expect(
      (
        await selectMemoryLabels(
          { description: "Memory", existingTags: ["A", "B"] },
          new AbortController().signal,
        )
      ).tags,
    ).toEqual([]);
    mockAnswers([0.51]);
    expect(
      (
        await selectMemoryLabels(
          { description: "Memory", existingTags: ["A"] },
          new AbortController().signal,
        )
      ).tags,
    ).toEqual(["A"]);
  });

  it.each(["memory", "idea", "note"])(
    "classifies %s even with an empty vocabulary",
    async (kind) => {
      const fetchMock = mockAnswers([], kind);
      expect(
        await selectMemoryLabels(
          { description: "Memory", existingTags: [] },
          new AbortController().signal,
        ),
      ).toEqual({ kind, tags: [], inputTokens: 100, outputTokens: 10 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects an invalid classification", async () => {
    mockAnswers([], "task");
    await expect(
      selectMemoryLabels({ description: "Text", existingTags: [] }, new AbortController().signal),
    ).rejects.toThrow();
  });

  it.each([[], [1.1], [-0.1]])(
    "rejects missing or out-of-range answers: %j",
    async (...probabilities) => {
      mockAnswers(probabilities);
      await expect(
        selectMemoryLabels(
          { description: "Memory", existingTags: ["CSS"] },
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    },
  );

  it("preserves HTTP status for provider error classification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    await expect(
      selectMemoryLabels(
        { description: "Memory", existingTags: ["CSS"] },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
});
