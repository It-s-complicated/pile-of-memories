import { OPENCODE_GO_API_KEY } from "$app/env/private";
import { chat, type ChatMiddleware, type TokenUsage } from "@tanstack/ai";
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

export const ENRICHMENT_PROVIDER = "opencode-go";
export const ENRICHMENT_MODEL = "deepseek-v4-flash";
export const ENRICHMENT_PROMPT_VERSION = "memory-enrichment-v1";
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
  options: { configurationMissing?: boolean; timedOut?: boolean } = {},
): EnrichmentErrorCode {
  if (options.configurationMissing) return "configuration_missing";
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

  if (!OPENCODE_GO_API_KEY) {
    throw new EnrichmentExecutionError(
      "configuration_missing",
      Date.now() - startedAt,
      reportedUsageSchema.parse({}),
    );
  }

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
      name: ENRICHMENT_PROVIDER,
      baseURL: "https://opencode.ai/zen/go/v1",
      apiKey: OPENCODE_GO_API_KEY,
      models: [ENRICHMENT_MODEL],
    });

    const result = await chat({
      adapter: opencode(ENRICHMENT_MODEL),
      stream: false,
      abortController,
      middleware: [analyticsMiddleware],
      modelOptions: { response_format: { type: "json_object" } },
      systemPrompts: [
        'Return only a JSON object with the keys "title" and "tags". Create a concise title and 1-5 useful labels for a private memory. Reuse the provided board vocabulary when meaningful. Introduce a short new label only when necessary.',
      ],
      messages: [
        {
          role: "user",
          content: `Board vocabulary: ${JSON.stringify(input.existingTags)}\n\nMemory:\n${input.description}`,
        },
      ],
    });

    const output = enrichmentOutputSchema.parse(JSON.parse(result));
    return {
      output,
      latencyMs: Math.max(Date.now() - startedAt, middlewareDurationMs ?? 0),
      usage: reportedUsageSchema.parse(usage ?? {}),
    };
  } catch (error) {
    throw new EnrichmentExecutionError(
      classifyEnrichmentError(error, { timedOut }),
      Math.max(Date.now() - startedAt, middlewareDurationMs ?? 0),
      reportedUsageSchema.parse(usage ?? {}),
    );
  } finally {
    clearTimeout(timeout);
  }
}
