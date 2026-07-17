import { createCollection } from "@tanstack/db";
import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { z } from "zod";
import {
  createCard as createCardRequest,
  deleteCard as deleteCardRequest,
  getCards,
  patchCard as patchCardRequest,
  type Card,
  type CardChanges,
  type CardInput,
} from "./card";
import { cardCreationProvenanceSchema, type CardCreationProvenance } from "./enrichment-analytics";

const queryClient = new QueryClient();
const insertMetadataSchema = z.object({ creation: cardCreationProvenanceSchema }).loose();

function toCardInput(card: Card): CardInput {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...input } = card;
  return input;
}

function toCardChanges(card: Card): CardChanges {
  return {
    title: card.title,
    body: card.body,
    position: card.position,
    tags: card.tags,
    topics: card.topics,
    links: card.links,
  };
}

export const cardsCollection = createCollection(
  queryCollectionOptions<Card>({
    id: "cards",
    queryKey: ["cards"],
    queryFn: getCards,
    queryClient,
    getKey: (card) => card.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(({ modified, metadata }) => {
          const parsedMetadata = insertMetadataSchema.safeParse(metadata);
          return createCardRequest(
            toCardInput(modified),
            parsedMetadata.success ? parsedMetadata.data.creation : undefined,
          );
        }),
      );
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(({ key, modified }) =>
          patchCardRequest(key, toCardChanges(modified)),
        ),
      );
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(transaction.mutations.map(({ key }) => deleteCardRequest(key)));
    },
  }),
);

export async function insertCard(
  card: CardInput,
  creation?: CardCreationProvenance,
): Promise<void> {
  const now = new Date().toISOString();
  await cardsCollection.insert(
    { ...card, createdAt: now, updatedAt: now },
    creation ? { metadata: { creation } } : undefined,
  ).isPersisted.promise;
}

export async function updateCard(id: string, changes: CardChanges): Promise<void> {
  await cardsCollection.update(id, (card) => Object.assign(card, changes)).isPersisted.promise;
}

export async function deleteCard(id: string): Promise<void> {
  await cardsCollection.delete(id).isPersisted.promise;
}
