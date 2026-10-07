import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { selectMemoryLabels } from "./label-selection";
import type { LabelDefinition, LabelKind } from "../labels";

afterEach(() => vi.unstubAllGlobals());

function vocabulary(names: string[], kind: LabelKind = "topic"): LabelDefinition[] {
  return names.map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name,
    kind,
    description: "",
  }));
}

function mockAnswers(probabilities: number[], kind = "note") {
  const fetchMock = vi.fn().mockImplementation(() =>
    Response.json({
      answers: {
        kind: { type: "choice", choice: kind },
        ...Object.fromEntries(
          probabilities.map((noul, index) => [`label_${index}`, { type: "noul", noul }]),
        ),
      },
      usage: { input_tokens: 100, output_tokens: 10 },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("managed label selection", () => {
  it("batches candidates, keeps the first five matches, and distinguishes tags from topics", async () => {
    const fetchMock = mockAnswers([0.1, 0.51, 0.95, 0.9, 0.85, 1, 0.99, 0.5]);
    const labels = vocabulary([
      "Unrelated",
      "Boundary",
      "CSS",
      "Web development",
      "Hosting",
      "Project",
      "AI",
      "Uncertain",
    ]);
    for (const index of [1, 3, 5]) labels[index]!.kind = "tag";
    const input = { description: "A memory about building a personal website" };
    const signal = new AbortController().signal;
    expect(await selectMemoryLabels(input, labels, signal)).toEqual({
      kind: "note",
      tags: ["Boundary", "Web development", "Project"],
      topics: ["CSS", "Hosting"],
      inputTokens: 100,
      outputTokens: 10,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]![1];
    expect(request.signal).toBe(signal);
    const body = JSON.parse(request.body);
    expect(body.state).toEqual({ memory: input.description });
    expect(Object.keys(body.questions)).toHaveLength(9);
    expect(Object.keys(body.questions.kind.criteria)).toEqual(["memory", "idea", "note"]);
    expect(body.questions.label_2.instructions).toContain('"CSS"');
    expect(body.questions.label_2.type).toBe("noul");
    expect(body.questions.label_2.instructions).toContain("passing mentions");
  });

  it("uses editable definitions for both custom tags and topics", async () => {
    const fetchMock = mockAnswers([0.84, 0.66]);
    const labels = vocabulary(["Professional practice", "Curiosity"]);
    labels[0]!.kind = "tag";
    labels[0]!.description = "Professional roles and approaches to doing good work.";
    labels[1]!.description = "Growth in mindset, asking questions, and staying curious.";
    const input = {
      description: "Product engineers should stay curious rather than just complete tickets.",
    };
    expect(await selectMemoryLabels(input, labels, new AbortController().signal)).toMatchObject({
      tags: ["Professional practice"],
      topics: ["Curiosity"],
    });
    const { questions } = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(questions.label_0.instructions).toContain(labels[0]!.description);
    expect(questions.label_0.instructions).toContain("broad category tag");
    expect(questions.label_1.instructions).toContain(labels[1]!.description);
    expect(questions.label_1.instructions).toContain("specific topic");

    labels[1]!.description = "A revised definition, edited in the app.";
    await selectMemoryLabels(input, labels, new AbortController().signal);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).questions.label_1.instructions).toContain(
      labels[1]!.description,
    );
  });

  it("preserves the default threshold: excludes 0.5 and accepts just above it", async () => {
    mockAnswers([0.49, 0.5, 0.51]);
    expect(
      await selectMemoryLabels(
        { description: "Memory" },
        vocabulary(["A", "B", "C"]),
        new AbortController().signal,
      ),
    ).toMatchObject({ tags: [], topics: ["C"] });
  });

  it.each(["memory", "idea", "note"])("classifies %s with an empty vocabulary", async (kind) => {
    mockAnswers([], kind);
    expect(
      await selectMemoryLabels({ description: "Memory" }, [], new AbortController().signal),
    ).toEqual({ kind, tags: [], topics: [], inputTokens: 100, outputTokens: 10 });
  });

  it("rejects an invalid classification", async () => {
    mockAnswers([], "task");
    await expect(
      selectMemoryLabels({ description: "Text" }, [], new AbortController().signal),
    ).rejects.toThrow();
  });

  it.each([[], [1.1], [-0.1]])(
    "rejects missing or out-of-range answers: %j",
    async (...probabilities) => {
      mockAnswers(probabilities);
      await expect(
        selectMemoryLabels(
          { description: "Memory" },
          vocabulary(["CSS"]),
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    },
  );

  it("preserves HTTP status for provider error classification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    await expect(
      selectMemoryLabels(
        { description: "Memory" },
        vocabulary(["CSS"]),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
});
