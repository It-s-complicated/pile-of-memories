import { http, HttpResponse } from "msw";
import * as z from "zod";

const questionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    instructions: z.string(),
    criteria: z.record(z.string(), z.string().nullable()),
  }),
  z.object({ type: z.literal("score"), instructions: z.string(), criteria: z.array(z.string()) }),
  z.object({ type: z.literal("noul"), instructions: z.string() }),
]);
type Question = z.infer<typeof questionSchema>;

const textSchema = z.object({ title: z.string().default(""), body: z.string().default("") });
// The two states the app sends: a memory to label, or a seed card with candidates to relate.
const stateSchema = z.union([
  z.object({ memory: z.string(), title: z.string().default("") }),
  z.object({ seed: textSchema, question: z.string(), candidates: z.array(textSchema) }),
]);
type State = z.infer<typeof stateSchema>;

const requestSchema = z.object({
  model: z.string(),
  state: stateSchema,
  questions: z.record(z.string(), questionSchema),
});

function mentions(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

function longWords(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{6,}/gu) ?? []);
}

function choose(question: Extract<Question, { type: "choice" }>, choice: string) {
  if (!(choice in question.criteria)) throw new Error(`No option "${choice}" to choose`);
  return {
    type: "choice",
    choice,
    confidence: 1,
    probabilities: Object.fromEntries(
      Object.keys(question.criteria).map((option) => [option, option === choice ? 1 : 0]),
    ),
  };
}

/**
 * Deterministic stand-ins for the model's judgement:
 * - a label fits when its name appears in the memory;
 * - a choice picks the first option named in the memory, otherwise the last option;
 * - a candidate card is related when it shares at least two long words with the seed.
 */
function answer(key: string, question: Question, state: State) {
  if ("memory" in state) {
    const text = `${state.title}\n${state.memory}`;
    if (question.type === "choice") {
      const options = Object.keys(question.criteria);
      return choose(
        question,
        options.find((option) => mentions(text, option)) ?? options.at(-1) ?? "",
      );
    }
    const label = /^Is ("(?:[^"\\]|\\.)*")/.exec(question.instructions)?.[1];
    if (question.type !== "noul" || !label) throw new Error(`Unexpected label question "${key}"`);
    return { type: "noul", noul: mentions(text, z.string().parse(JSON.parse(label))) ? 0.9 : 0.1 };
  }

  const candidate = state.candidates[Number(/^(?:relevance|relationship)_(\d+)$/.exec(key)?.[1])];
  if (!candidate) throw new Error(`Unexpected related-card question "${key}"`);
  const seedWords = longWords(`${state.seed.title} ${state.seed.body} ${state.question}`);
  const shared = [...longWords(`${candidate.title} ${candidate.body}`)].filter((word) =>
    seedWords.has(word),
  ).length;

  if (question.type === "choice")
    return choose(question, shared >= 2 ? "shared_theme" : "unrelated");
  if (question.type !== "score") throw new Error(`Unexpected related-card question "${key}"`);
  const score = Math.min(shared, question.criteria.length - 1);
  return {
    type: "score",
    score,
    confidence: 1,
    legend: Object.fromEntries(question.criteria.map((level, index) => [index, level])),
    probabilities: Object.fromEntries(
      question.criteria.map((_, index) => [index, index === score ? 1 : 0]),
    ),
  };
}

/** TypeSafe's evaluate endpoint. Requests the app does not send today fail instead of guessing. */
export const typesafeHandlers = [
  http.post("https://api.typesafe.ai/v1/systemone", async ({ request }) => {
    try {
      const { model, state, questions } = requestSchema.parse(await request.json());
      return HttpResponse.json({
        model,
        answers: Object.fromEntries(
          Object.entries(questions).map(([key, question]) => [key, answer(key, question, state)]),
        ),
        usage: { input_tokens: 0, output_tokens: 0 },
      });
    } catch (error) {
      return HttpResponse.json(
        { error: `Mock TypeSafe cannot answer this request: ${String(error)}` },
        { status: 400 },
      );
    }
  }),
];
