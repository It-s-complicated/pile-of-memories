import * as z from "zod";
import { cardCreationProvenanceSchema } from "./enrichment-analytics";
import { labelsSchema, partitionLabels } from "./labels";
import { httpUrlSchema, parseMarkdown } from "./markdown";

export const cardIdSchema = z.uuidv4();

export function isCardId(value: unknown): value is string {
  return cardIdSchema.safeParse(value).success;
}

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
export const cardSchema = z.object({
  ...cardInputSchema.in.shape,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Card = z.infer<typeof cardSchema>;

export const memoryListSettingsSchema = z
  .object({
    sort: z.enum([
      "updated-desc",
      "updated-asc",
      "created-desc",
      "created-asc",
      "title-asc",
      "title-desc",
    ]),
    tags: labelsSchema,
  })
  .strict();
export type MemoryListSettings = z.infer<typeof memoryListSettingsSchema>;

export function sortAndFilterCards(cards: Card[], settings: MemoryListSettings): Card[] {
  const selectedTags = new Set(settings.tags.map((tag) => tag.toLowerCase()));
  const filtered = cards.filter(
    (card) =>
      selectedTags.size === 0 ||
      [...card.tags, ...card.topics].some((tag) => selectedTags.has(tag.toLowerCase())),
  );

  return filtered.toSorted((a, b) => {
    switch (settings.sort) {
      case "updated-desc":
        return b.updatedAt.localeCompare(a.updatedAt);
      case "updated-asc":
        return a.updatedAt.localeCompare(b.updatedAt);
      case "created-desc":
        return b.createdAt.localeCompare(a.createdAt);
      case "created-asc":
        return a.createdAt.localeCompare(b.createdAt);
      case "title-desc":
        return b.title.localeCompare(a.title);
      default:
        return a.title.localeCompare(b.title);
    }
  });
}

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

export const updateCardCommandSchema = z
  .object({
    id: cardIdSchema,
    changes: cardChangesSchema,
  })
  .strict();

export const deleteCardCommandSchema = z.object({ id: cardIdSchema }).strict();

const cardPositionUpdateSchema = z.object({ id: cardIdSchema, position: positionSchema }).strict();

export const updateCardPositionsCommandSchema = z
  .object({
    positions: z.array(cardPositionUpdateSchema).min(1),
  })
  .strict()
  .refine(({ positions }) => new Set(positions.map(({ id }) => id)).size === positions.length, {
    message: "Card IDs must be unique",
    path: ["positions"],
  });

export type CardPositionUpdate = z.infer<typeof cardPositionUpdateSchema>;

export function parseCardInput(value: unknown): CardInput | null {
  const result = cardInputSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseCardChanges(value: unknown): CardChanges | null {
  const result = cardChangesSchema.safeParse(value);
  return result.success ? result.data : null;
}
