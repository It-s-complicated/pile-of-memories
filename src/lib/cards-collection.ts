import { createCollection } from "@tanstack/db";
import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { z } from "zod";
import type { Card, CardChanges, CardInput } from "./card";
import {
  createCard as createCardRequest,
  deleteCard as deleteCardRequest,
  getCards,
  updateCard as updateCardRequest,
} from "./cards.remote";
import { cardCreationProvenanceSchema, type CardCreationProvenance } from "./enrichment-analytics";

const queryClient = new QueryClient();
const insertMetadataSchema = z.object({ creation: cardCreationProvenanceSchema }).loose();

async function fetchCards(): Promise<Card[]> {
  const cards = getCards();
  if (cards.ready) await cards.refresh();
  const loadedCards = await cards;
  return loadedCards;
}

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
    archived: card.archived,
  };
}

export const cardsCollection = createCollection(
  queryCollectionOptions<Card>({
    id: "cards",
    queryKey: ["cards"],
    queryFn: fetchCards,
    queryClient,
    getKey: (card) => card.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(({ modified, metadata }) => {
          const parsedMetadata = insertMetadataSchema.safeParse(metadata);
          const creation = parsedMetadata.success ? parsedMetadata.data.creation : undefined;
          return createCardRequest({
            card: toCardInput(modified),
            ...(creation ? { creation } : {}),
          });
        }),
      );
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(({ key, modified }) =>
          updateCardRequest({ id: key, changes: toCardChanges(modified) }),
        ),
      );
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(transaction.mutations.map(({ key }) => deleteCardRequest({ id: key })));
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
