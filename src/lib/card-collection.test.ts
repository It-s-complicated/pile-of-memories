import { createLiveQueryCollection } from "@tanstack/svelte-db";
import { expect, it, vi } from "vite-plus/test";
import { createCardCollection, openCardCache } from "./card-collection";
import type { Card } from "./card";

const cacheResources = vi.hoisted(() => ({ close: vi.fn(), dispose: vi.fn() }));

vi.mock("@tanstack/browser-db-sqlite-persistence", () => ({
  openBrowserWASQLiteOPFSDatabase: async () => ({ close: cacheResources.close }),
  BrowserCollectionCoordinator: class {
    dispose = cacheResources.dispose;
  },
  createBrowserWASQLitePersistence: () => ({}),
  persistedCollectionOptions: (options: object) => options,
}));

it("closes the cache and its resources while a live query is reading cards", async () => {
  const board = await openCardCache("test-user");
  const query = createLiveQueryCollection((q) => q.from({ card: board.collection }));
  await query.preload();

  try {
    await board.close();
    expect(query.status).toBe("cleaned-up");
    expect(board.collection.status).toBe("cleaned-up");
    expect(cacheResources.dispose).toHaveBeenCalledOnce();
    expect(cacheResources.close).toHaveBeenCalledOnce();
  } finally {
    await query.cleanup();
    await board.collection.cleanup({ dependents: true });
  }
});

it("reconciles server snapshots, confirmed writes and deletions without accepting invalid cards", async () => {
  const board = await createCardCollection();
  const card: Card = {
    kind: "memory",
    id: "00000000-0000-4000-8000-000000000001",
    title: "Memory",
    body: "Body",
    position: { x: 10, y: 20 },
    tags: [],
    topics: [],
    links: [],
    archived: false,
    createdAt: "2026-09-08T12:00:00.000Z",
    updatedAt: "2026-09-08T12:00:00.000Z",
  };
  try {
    await board.replace([card]);
    await board.upsert([{ ...card, archived: true, position: { x: 30, y: 40 } }]);
    expect(board.collection.get(card.id)).toMatchObject({
      archived: true,
      position: { x: 30, y: 40 },
    });
    await expect(board.replace([{ ...card, position: { x: NaN, y: 0 } }])).rejects.toThrow();
    expect(board.collection.get(card.id)?.archived).toBe(true);
    await board.replace([]);
    expect(board.collection.size).toBe(0);
    await board.upsert([card]);
    await board.remove(card.id);
    await board.remove(card.id);
    expect(board.collection.size).toBe(0);
  } finally {
    await board.collection.cleanup();
  }
});
