import { expect, it, vi } from "vite-plus/test";
import { browserStorage, createSnapshotBackend, type SnapshotStorage } from "./board-backend";
import type { Card } from "./card";

it("persists validated CRUD and atomic layouts, preserves failed writes, and reloads browser data", async () => {
  let durable: Card[] = [];
  let displayed: Card[] = [];
  let failWrite = false;
  const store: SnapshotStorage = {
    id: "test",
    online: false,
    async read() {
      return structuredClone(durable);
    },
    async write(cards) {
      if (failWrite) throw new Error("Storage full");
      durable = structuredClone(cards);
    },
  };
  vi.stubGlobal("navigator", { locks: { request: (_key: string, work: () => unknown) => work() } });
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
  try {
    const backend = createSnapshotBackend(store, (cards) => {
      displayed = cards;
    });
    const input = {
      id: crypto.randomUUID(),
      title: "Memory",
      body: "https://example.com",
      tags: [],
      topics: [],
      links: [],
      position: { x: 1.25, y: -2.5 },
      archived: false,
    };
    const second = { ...input, id: crypto.randomUUID() };
    await Promise.all([backend.createCard({ card: input }), backend.createCard({ card: second })]);
    expect(durable).toHaveLength(2);
    expect(durable[0].links).toEqual(["https://example.com"]);
    await backend.updateCard({ id: input.id, changes: { archived: true } });
    expect(displayed[0].archived).toBe(true);
    const before = structuredClone(durable);
    await expect(
      backend.updateCardPositions({
        positions: [
          { id: input.id, position: { x: 100, y: 200 } },
          { id: crypto.randomUUID(), position: { x: 0, y: 0 } },
        ],
      }),
    ).rejects.toThrow("Card not found");
    expect(durable).toEqual(before);
    failWrite = true;
    await expect(backend.deleteCard({ id: input.id })).rejects.toThrow("Storage full");
    expect(displayed).toEqual(before);
    failWrite = false;
    await backend.updateCardPositions({
      positions: [{ id: input.id, position: { x: 10.75, y: -3.5 } }],
    });
    expect(durable[0].position.x).toBe(10.75);
    await backend.deleteCard({ id: second.id });
    await browserStorage().write(durable);
    expect(await browserStorage().read()).toEqual(durable);
    durable = [{ ...durable[0], position: { x: NaN, y: 0 } }];
    await expect(backend.refresh()).rejects.toThrow();
    expect(displayed[0].position.x).toBe(10.75);
    saved.set("pile-of-memories-core-v1", "corrupt");
    await expect(browserStorage().read()).rejects.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});
