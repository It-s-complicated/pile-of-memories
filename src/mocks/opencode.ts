import { http, HttpResponse } from "msw";
import * as z from "zod";
import type { Reflection } from "#lib/exploration.js";

const contentPartSchema = z.object({ text: z.string().default("") });
const requestSchema = z.object({
  model: z.string(),
  reasoning: z.object({ effort: z.enum(["low", "medium", "high"]) }).optional(),
  stream: z.boolean().default(false),
  input: z.array(
    z.object({
      role: z.string().optional(),
      content: z.union([z.string(), z.array(contentPartSchema)]).default(""),
    }),
  ),
  text: z.object({ format: z.object({ type: z.string() }) }).optional(),
});
const reflectionRequestSchema = z.object({
  question: z.string(),
  cards: z.array(z.object({ id: z.string(), title: z.string() })).min(1),
});

/** The first line of the memory, as a model asked for a short title would roughly give. */
function title(prompt: string): string {
  const memory = prompt.replace(/^Memory:\n/, "");
  const firstLine = memory.split("\n").find((line) => /[\p{L}\p{N}]/u.test(line)) ?? memory;
  const cleaned = firstLine.replace(/^[\s#>*-]+/, "").trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 79).trimEnd()}…` : cleaned || "Untitled memory";
}

/** A reflection that cites every supplied card and says plainly that no model wrote it. */
function reflection(prompt: string): Reflection {
  const { question, cards } = reflectionRequestSchema.parse(JSON.parse(prompt));
  const sourceIds = cards.map((card) => card.id);
  const titles = cards.map((card) => `“${card.title}”`).join(", ");
  return {
    observations: [
      {
        text:
          cards.length === 1
            ? `Mock observation: ${titles} was explored on its own.`
            : `Mock observation: ${titles} were explored together.`,
        sourceIds,
      },
    ],
    ideas: [
      {
        title: `Mock idea: ${cards[0]?.title ?? ""}`.slice(0, 80),
        body: [
          "Mock mode wrote this idea without calling a model.",
          question ? `It was asked: ${question}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        sourceIds,
      },
    ],
    questions: ["What would a real model notice in these cards?"],
  };
}

function completedResponse(model: string, text: string) {
  return {
    id: `resp_mock_${crypto.randomUUID()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [
      {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

function eventStream(model: string, text: string): Response {
  const response = completedResponse(model, text);
  const events = [
    { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
    { type: "response.output_text.delta", item_id: "msg_mock", output_index: 0, delta: text },
    { type: "response.completed", response },
  ];
  return new HttpResponse(
    events
      .map(
        (event, index) =>
          `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: index })}\n\n`,
      )
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

/**
 * OpenCode Zen's Responses API. The app asks it for two things: a plain-text title, and a
 * reflection as structured output. Anything else fails instead of guessing.
 */
export const opencodeHandlers = [
  http.post("https://opencode.ai/inference/openai/v1/responses", async ({ request }) => {
    try {
      const { model, stream, input, text } = requestSchema.parse(await request.json());
      const prompt = input
        .filter((item) => item.role === "user")
        .flatMap(({ content }) =>
          typeof content === "string" ? [content] : content.map((part) => part.text),
        )
        .join("\n");
      const output =
        text?.format.type === "json_schema" ? JSON.stringify(reflection(prompt)) : title(prompt);
      return stream
        ? eventStream(model, output)
        : HttpResponse.json(completedResponse(model, output));
    } catch (error) {
      return HttpResponse.json(
        { error: { message: `Mock OpenCode cannot answer this request: ${String(error)}` } },
        { status: 400 },
      );
    }
  }),
];
