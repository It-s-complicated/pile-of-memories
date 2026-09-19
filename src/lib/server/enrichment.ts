import { OPENCODE_GO_API_KEY } from "$app/env/private";
import { chat, type ChatMiddleware, type TokenUsage, generateMessageId } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { z, ZodError } from "zod";
import {
  enrichmentOutputSchema,
  type EnrichmentInput,
  type EnrichmentOutput,
} from "#lib/enrichment.js";
import {
  enrichmentUsageSchema,
  type EnrichmentErrorCode,
  type EnrichmentUsage,
} from "#lib/enrichment-analytics.js";

import { LABEL_MODEL, selectMemoryLabels } from "./label-selection";

const TITLE_MODEL = "gpt-5.6-luna";
export const ENRICHMENT_PROVIDER = "opencode-go+typesafe";
export const ENRICHMENT_MODEL = `${TITLE_MODEL}+${LABEL_MODEL}`;
export const ENRICHMENT_PROMPT_VERSION = "memory-enrichment-v3";
const PROVIDER_TIMEOUT_MS = 55_000;

export type EnrichmentExecution = {
  output: EnrichmentOutput;
  latencyMs: number;
  usage: EnrichmentUsage;
};

export class EnrichmentExecutionError extends Error {
  readonly errorCode: EnrichmentErrorCode;
  readonly latencyMs: number;
  readonly usage: EnrichmentUsage;

  constructor(errorCode: EnrichmentErrorCode, latencyMs: number, usage: EnrichmentUsage) {
    super("Memory enrichment failed");
    this.name = "EnrichmentExecutionError";
    this.errorCode = errorCode;
    this.latencyMs = latencyMs;
    this.usage = usage;
  }
}

const optionalErrorStringSchema = z.string().optional().catch(undefined);
const optionalErrorNumberSchema = z.number().optional().catch(undefined);
const optionalErrorResponseSchema = z
  .object({ status: optionalErrorNumberSchema })
  .loose()
  .optional()
  .catch(undefined);
const providerErrorSchema = z
  .object({
    name: optionalErrorStringSchema,
    code: optionalErrorStringSchema,
    status: optionalErrorNumberSchema,
    statusCode: optionalErrorNumberSchema,
    response: optionalErrorResponseSchema,
  })
  .loose();

const reportedTokenCountSchema = z.number().int().nonnegative().nullable().catch(null);
const reportedCostSchema = z.number().finite().nonnegative().nullable().catch(null);
const reportedUsageSchema = z
  .object({
    promptTokens: reportedTokenCountSchema,
    completionTokens: reportedTokenCountSchema,
    totalTokens: reportedTokenCountSchema,
    cost: reportedCostSchema,
  })
  .transform(({ cost, ...usage }) => ({ ...usage, providerCost: cost }))
  .pipe(enrichmentUsageSchema);

export function classifyEnrichmentError(
  error: unknown,
  options: { timedOut?: boolean } = {},
): EnrichmentErrorCode {
  if (options.timedOut) return "provider_timeout";

  const providerError = providerErrorSchema.safeParse(error);
  if (providerError.success) {
    const { name, code, status, statusCode, response } = providerError.data;
    if (
      name === "AbortError" ||
      name === "TimeoutError" ||
      code === "ETIMEDOUT" ||
      code === "TIMEOUT"
    ) {
      return "provider_timeout";
    }
    if (status !== undefined || statusCode !== undefined || response?.status !== undefined) {
      return "provider_rejected";
    }
  }

  if (error instanceof SyntaxError) return "invalid_provider_json";
  if (error instanceof ZodError) return "invalid_provider_output";
  return "unknown";
}

export async function enrichMemory(input: EnrichmentInput): Promise<EnrichmentExecution> {
  const startedAt = Date.now();
  let usage: TokenUsage | undefined;
  let middlewareDurationMs: number | undefined;
  let timedOut = false;

  const analyticsMiddleware: ChatMiddleware = {
    name: "memory-enrichment-analytics",
    onUsage: (_context, reportedUsage) => {
      usage = reportedUsage;
    },
    onFinish: (_context, info) => {
      middlewareDurationMs = info.duration;
      usage ??= info.usage;
    },
    onError: (_context, info) => {
      middlewareDurationMs = info.duration;
    },
    onAbort: (_context, info) => {
      middlewareDurationMs = info.duration;
    },
  };

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort("provider_timeout");
  }, PROVIDER_TIMEOUT_MS);

  try {
    const opencode = openaiCompatible({
      name: "opencode-go",
      defaultHeaders: { "x-opencode-session": generateMessageId() },
      baseURL: "https://opencode.ai/zen/go/v1",
      apiKey: OPENCODE_GO_API_KEY,
      models: [TITLE_MODEL],
      // ponytail: gpt-5.6-luna 503s on go chat/completions; go responses works
      api: "responses",
    });

    const [result, labels] = await Promise.all([
      chat({
        adapter: opencode(TITLE_MODEL),
        stream: false,
        abortController,
        middleware: [analyticsMiddleware],
        modelOptions: {
          text: { format: { type: "json_object" } },
          reasoning: { effort: "medium" },
        },
        systemPrompts: [
          'Return only a JSON object with the key "title". Create a concise title of at most 80 characters for a private memory.',
        ],
        messages: [
          {
            role: "user",
            // ponytail: the go proxy only checks the input (not instructions) for the
            // word "json" when text.format is json_object, so restate it in the input
            content: `Respond in JSON. Memory:\n${input.description}`,
          },
        ],
      }),
      selectMemoryLabels(input, abortController.signal),
    ]);

    const title = enrichmentOutputSchema.pick({ title: true }).parse(JSON.parse(result));
    const output = enrichmentOutputSchema.parse({ ...title, tags: labels.tags, kind: labels.kind });
    const titleUsage = reportedUsageSchema.parse(usage ?? {});
    return {
      output,
      latencyMs: Math.max(Date.now() - startedAt, middlewareDurationMs ?? 0),
      usage: {
        promptTokens:
          titleUsage.promptTokens === null ? null : titleUsage.promptTokens + labels.inputTokens,
        completionTokens:
          titleUsage.completionTokens === null
            ? null
            : titleUsage.completionTokens + labels.outputTokens,
        totalTokens:
          titleUsage.totalTokens === null
            ? null
            : titleUsage.totalTokens + labels.inputTokens + labels.outputTokens,
        providerCost: null,
      },
    };
  } catch (error) {
    abortController.abort();
    throw new EnrichmentExecutionError(
      classifyEnrichmentError(error, { timedOut }),
      Math.max(Date.now() - startedAt, middlewareDurationMs ?? 0),
      // A failed combined request cannot report complete usage across both providers.
      reportedUsageSchema.parse({}),
    );
  } finally {
    clearTimeout(timeout);
  }
}
