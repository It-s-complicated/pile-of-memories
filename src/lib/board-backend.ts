import type { z } from "zod";
import {
  cardSchema,
  createCardRequestSchema,
  deleteCardCommandSchema,
  updateCardCommandSchema,
  updateCardPositionsCommandSchema,
  type Card,
} from "./card";
import type { EnrichmentInput, EnrichmentResponse } from "./enrichment";

export type EnrichmentPlugin = (input: EnrichmentInput) => Promise<EnrichmentResponse>;
export type BoardBackend = {
  online: boolean;
  cache: boolean;
  createCard(input: z.input<typeof createCardRequestSchema>): Promise<Card>;
  updateCard(input: z.input<typeof updateCardCommandSchema>): Promise<Card>;
  updateCardPositions(input: z.input<typeof updateCardPositionsCommandSchema>): Promise<Card[]>;
  deleteCard(input: z.input<typeof deleteCardCommandSchema>): Promise<void>;
  getLiveCards(): {
    readonly current: Card[] | undefined;
    readonly ready: boolean;
    readonly connected: boolean;
    readonly error: unknown;
    reconnect(): Promise<unknown>;
  };
};

export const boardSnapshotSchema = cardSchema
  .array()
  .refine(
    (cards) => new Set(cards.map(({ id }) => id)).size === cards.length,
    "Duplicate card IDs",
  );

export type SnapshotStorage = {
  id: string;
  online: boolean;
  read(): Promise<unknown>;
  write(cards: Card[]): Promise<void>;
};

// ponytail: whole-board snapshots suit small piles; use per-card records when size matters.
export function createSnapshotBackend(storage: SnapshotStorage, changed: (cards: Card[]) => void) {
  if (!navigator.locks)
    throw new Error("Open this app over HTTPS or localhost to save memories safely.");
  let pending = Promise.resolve();
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(() => navigator.locks.request(storage.id, operation));
    pending = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  async function read() {
    return boardSnapshotSchema.parse(await storage.read());
  }
  function mutate<T>(change: (cards: Card[]) => T): Promise<T> {
    return run(async () => {
      const cards = await read();
      const result = change(cards);
      const validated = boardSnapshotSchema.parse(cards);
      await storage.write(validated);
      changed(validated); // A failed durable write must never look saved.
      return result;
    });
  }
  function find(cards: Card[], id: string) {
    const card = cards.find((item) => item.id === id);
    if (!card) throw new Error("Card not found. Reload the board and try again.");
    return card;
  }
  return {
    online: storage.online,
    cache: false,
    async refresh() {
      return run(async () => changed(await read()));
    },
    createCard(input: z.input<typeof createCardRequestSchema>) {
      const { card } = createCardRequestSchema.parse(input);
      return mutate((cards) => {
        if (cards.some(({ id }) => id === card.id)) throw new Error("Card already exists.");
        const now = new Date().toISOString();
        const saved = { ...card, createdAt: now, updatedAt: now };
        cards.push(saved);
        return saved;
      });
    },
    updateCard(input: z.input<typeof updateCardCommandSchema>) {
      const { id, changes } = updateCardCommandSchema.parse(input);
      return mutate((cards) =>
        Object.assign(find(cards, id), changes, { updatedAt: new Date().toISOString() }),
      );
    },
    updateCardPositions(input: z.input<typeof updateCardPositionsCommandSchema>) {
      const { positions } = updateCardPositionsCommandSchema.parse(input);
      return mutate((cards) =>
        positions.map(({ id, position }) =>
          Object.assign(find(cards, id), { position, updatedAt: new Date().toISOString() }),
        ),
      );
    },
    deleteCard(input: z.input<typeof deleteCardCommandSchema>) {
      const { id } = deleteCardCommandSchema.parse(input);
      return mutate((cards) => {
        cards.splice(cards.indexOf(find(cards, id)), 1);
      });
    },
  };
}

export function browserStorage(): SnapshotStorage {
  const id = "pile-of-memories-core-v1";
  return {
    id,
    online: false,
    async read() {
      return JSON.parse(localStorage.getItem(id) ?? "[]");
    },
    async write(cards) {
      localStorage.setItem(id, JSON.stringify(cards));
    },
  };
}
