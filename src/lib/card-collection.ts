import { createCollection, type SyncConfig } from "@tanstack/svelte-db";
import { cardSchema, type Card } from "./card";

export async function createCardCollection() {
  let sync!: Parameters<SyncConfig<Card, string>["sync"]>[0];
  const options = {
    id: "cards",
    getKey: (card: Card) => card.id,
    sync: {
      sync(controls: typeof sync) {
        sync = controls;
        controls.markReady();
      },
    },
  };
  const collection = createCollection<Card, string>(options);
  try {
    await collection.preload();
    cardSchema.array().parse([...collection.values()]);
  } catch (error) {
    await collection.cleanup();
    throw error;
  }

  return {
    collection,
    async replace(snapshot: Card[]) {
      const cards = cardSchema.array().parse(snapshot);
      const ids = new Set(cards.map((card) => card.id));
      sync.begin();
      for (const card of collection.values()) {
        if (!ids.has(card.id)) sync.write({ type: "delete", key: card.id });
      }
      for (const card of cards) {
        const previous = collection.get(card.id);
        if (!previous || JSON.stringify(previous) !== JSON.stringify(card)) {
          sync.write({ type: previous ? "update" : "insert", value: card });
        }
      }
      await sync.commit();
    },
    async upsert(cards: Card[]) {
      const validated = cardSchema.array().parse(cards);
      sync.begin();
      for (const card of validated) {
        sync.write({ type: collection.has(card.id) ? "update" : "insert", value: card });
      }
      await sync.commit();
    },
    async remove(id: string) {
      if (!collection.has(id)) return;
      sync.begin();
      sync.write({ type: "delete", key: id });
      await sync.commit();
    },
  };
}
