import { z } from "zod";
import { cardCreationProvenanceSchema, type CardCreationProvenance } from "./enrichment-analytics";
import { labelsSchema, partitionLabels } from "./labels";
import { httpUrlSchema, parseMarkdown } from "./markdown";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const cardIdSchema = z.string().regex(UUID_PATTERN);
const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();

export const cardInputSchema = z
  .object({
    id: cardIdSchema,
    title: z.string().trim().min(1),
    body: z.string(),
    position: positionSchema,
    tags: labelsSchema,
    topics: labelsSchema,
    links: z.array(httpUrlSchema),
    archived: z.boolean(),
  })
  .strict()
  .refine(({ tags, topics }) => tags.length + topics.length <= 200, {
    message: "Too many labels",
    path: ["tags"],
  })
  .transform((value) => ({
    ...value,
    ...partitionLabels([...value.tags, ...value.topics]),
    links: parseMarkdown(value.body).links,
  }));

export type CardInput = z.infer<typeof cardInputSchema>;
export type Card = CardInput & { createdAt: string; updatedAt: string };

export const cardChangesSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    body: z.string().optional(),
    position: positionSchema.optional(),
    tags: labelsSchema.optional(),
    topics: labelsSchema.optional(),
    links: z.array(httpUrlSchema).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one card change is required",
  })
  .refine((value) => value.links === undefined || value.body !== undefined, {
    message: "Links can only be supplied with a body",
    path: ["links"],
  })
  .refine((value) => (value.tags === undefined) === (value.topics === undefined), {
    message: "Tags and topics must be supplied together",
    path: ["tags"],
  })
  .refine((value) => (value.tags?.length ?? 0) + (value.topics?.length ?? 0) <= 200, {
    message: "Too many labels",
    path: ["tags"],
  })
  .transform(({ tags, topics, links: _links, ...value }) => ({
    ...value,
    ...(value.body === undefined ? {} : { links: parseMarkdown(value.body).links }),
    ...(tags && topics ? partitionLabels([...tags, ...topics]) : {}),
  }));

export type CardChanges = z.infer<typeof cardChangesSchema>;

export const createCardRequestSchema = z
  .object({
    card: cardInputSchema,
    creation: cardCreationProvenanceSchema.optional(),
  })
  .strict();

export type CreateCardRequest = z.infer<typeof createCardRequestSchema>;

const errorResponseSchema = z.object({ message: z.string() }).loose();

export function parseCardInput(value: unknown): CardInput | null {
  const result = cardInputSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseCreateCardRequest(value: unknown): CreateCardRequest | null {
  const result = createCardRequestSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseCardChanges(value: unknown): CardChanges | null {
  const result = cardChangesSchema.safeParse(value);
  return result.success ? result.data : null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const parsedBody = errorResponseSchema.safeParse(await response.json().catch(() => null));
    let message = parsedBody.success ? parsedBody.data.message : response.statusText;
    if (response.status >= 500) message = "Database unavailable";
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

export function getCards(): Promise<Card[]> {
  return request("/api/cards");
}

export function createCard(card: CardInput, creation?: CardCreationProvenance): Promise<Card> {
  const body: CreateCardRequest = { card, ...(creation ? { creation } : {}) };
  return request("/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function patchCard(id: string, changes: CardChanges): Promise<Card> {
  return request(`/api/cards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export function deleteCard(id: string): Promise<void> {
  return request(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
}
