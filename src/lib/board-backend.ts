import * as z from "zod";
import {
  cardSchema,
  createCardRequestSchema,
  deleteCardCommandSchema,
  updateCardCommandSchema,
  updateCardPositionsCommandSchema,
  type Card,
} from "./card";
import type { EnrichmentInput, EnrichmentResponse } from "./enrichment";
import {
  canonicalizeLabels,
  labelsSchema,
  normalizeLabelGroups,
  PRIMARY_TAGS,
  TOPIC_TAGS,
} from "./labels";

export type EnrichmentPlugin = (input: EnrichmentInput) => Promise<EnrichmentResponse>;
export type BoardBackend = {
  online: boolean;
  createCard(input: z.input<typeof createCardRequestSchema>): Promise<Card>;
  updateCard(input: z.input<typeof updateCardCommandSchema>): Promise<Card>;
  updateCardPositions(input: z.input<typeof updateCardPositionsCommandSchema>): Promise<Card[]>;
  deleteCard(input: z.input<typeof deleteCardCommandSchema>): Promise<void>;
  replaceBoard(input: unknown): Promise<BoardSnapshot>;
  getLiveBoard(): {
    readonly current: BoardSnapshot | undefined;
    readonly ready: boolean;
    readonly connected: boolean;
    readonly error: unknown;
    reconnect(): Promise<unknown>;
  };
};

const memoriesSchema = cardSchema
  .array()
  .refine(
    (cards) => new Set(cards.map(({ id }) => id)).size === cards.length,
    "Duplicate card IDs",
  );

const storedBoardSchema = z
  .object({
    memories: memoriesSchema,
    tags: labelsSchema,
    topics: labelsSchema,
  })
  .strict()
  .transform(({ memories, tags, topics }) => {
    const labels = normalizeLabelGroups(
      canonicalizeLabels([...tags, ...memories.flatMap((card) => card.tags)]),
      canonicalizeLabels([...topics, ...memories.flatMap((card) => card.topics)]),
    );
    return { memories, ...labels };
  });

export const boardSnapshotSchema = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? { memories: value, tags: [...PRIMARY_TAGS], topics: [...TOPIC_TAGS] }
      : value,
  storedBoardSchema,
);
export type BoardSnapshot = z.infer<typeof boardSnapshotSchema>;

export const boardExportSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    memories: memoriesSchema,
    tags: labelsSchema,
    topics: labelsSchema,
  })
  .strict()
  .transform(({ version, exportedAt, ...snapshot }) => ({
    version,
    exportedAt,
    ...boardSnapshotSchema.parse(snapshot),
  }));

export function createBoardExport(snapshot: BoardSnapshot, exportedAt = new Date().toISOString()) {
  return boardExportSchema.parse({ version: 1, exportedAt, ...snapshot });
}

export function parseBoardImport(value: unknown): BoardSnapshot {
  const {
    version: _version,
    exportedAt: _exportedAt,
    ...snapshot
  } = boardExportSchema.parse(value);
  return snapshot;
}

export type SnapshotStorage = {
  id: string;
  online: boolean;
  read(): Promise<unknown>;
  write(snapshot: BoardSnapshot): Promise<void>;
};

// ponytail: whole-board snapshots suit small piles; use per-card records when size matters.
export function createSnapshotBackend(
  storage: SnapshotStorage,
  changed: (snapshot: BoardSnapshot) => void,
) {
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
  function mutate<T>(change: (snapshot: BoardSnapshot) => T): Promise<T> {
    return run(async () => {
      const snapshot = await read();
      const result = change(snapshot);
      const validated = boardSnapshotSchema.parse(snapshot);
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
    async refresh() {
      return run(async () => changed(await read()));
    },
    createCard(input: z.input<typeof createCardRequestSchema>) {
      const { card } = createCardRequestSchema.parse(input);
      return mutate((snapshot) => {
        const cards = snapshot.memories;
        if (cards.some(({ id }) => id === card.id)) throw new Error("Card already exists.");
        const now = new Date().toISOString();
        const saved = { ...card, createdAt: now, updatedAt: now };
        cards.push(saved);
        return saved;
      });
    },
    updateCard(input: z.input<typeof updateCardCommandSchema>) {
      const { id, changes } = updateCardCommandSchema.parse(input);
      return mutate((snapshot) =>
        Object.assign(find(snapshot.memories, id), changes, {
          updatedAt: new Date().toISOString(),
        }),
      );
    },
    updateCardPositions(input: z.input<typeof updateCardPositionsCommandSchema>) {
      const { positions } = updateCardPositionsCommandSchema.parse(input);
      return mutate((snapshot) =>
        positions.map(({ id, position }) =>
          Object.assign(find(snapshot.memories, id), {
            position,
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
    },
    deleteCard(input: z.input<typeof deleteCardCommandSchema>) {
      const { id } = deleteCardCommandSchema.parse(input);
      return mutate((snapshot) => {
        const cards = snapshot.memories;
        cards.splice(cards.indexOf(find(cards, id)), 1);
      });
    },
    replaceBoard(input: unknown) {
      return run(async () => {
        const snapshot = parseBoardImport(input);
        await storage.write(snapshot);
        changed(snapshot);
        return snapshot;
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
