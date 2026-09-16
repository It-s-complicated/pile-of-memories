import { expect, it, vi } from "vite-plus/test";
import {
  boardSnapshotSchema,
  browserStorage,
  createBoardExport,
  createSnapshotBackend,
  type BoardSnapshot,
  type SnapshotStorage,
} from "./board-backend";

it("persists validated CRUD and atomic layouts, preserves failed writes, and reloads browser data", async () => {
  let durable = boardSnapshotSchema.parse([]);
  let displayed = boardSnapshotSchema.parse([]);
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
    const backend = createSnapshotBackend(store, (snapshot) => {
      displayed = snapshot;
    });
    const input = {
      id: crypto.randomUUID(),
      title: "Memory",
      body: "https://example.com",
      tags: ["New area"],
      topics: ["New topic"],
      links: [],
      position: { x: 1.25, y: -2.5 },
      archived: false,
    };
    const second = { ...input, id: crypto.randomUUID() };
    await Promise.all([backend.createCard({ card: input }), backend.createCard({ card: second })]);
    expect(durable.memories).toHaveLength(2);
    expect(durable.memories[0].links).toEqual(["https://example.com"]);
    expect(durable.tags).toContain("New area");
    expect(durable.topics).toContain("New topic");
    await backend.updateCard({ id: input.id, changes: { archived: true } });
    expect(displayed.memories[0].archived).toBe(true);
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
    expect(durable.memories[0].position.x).toBe(10.75);
    await backend.deleteCard({ id: second.id });
    await browserStorage().write(durable);
    expect(await browserStorage().read()).toEqual(durable);
    durable = {
      ...durable,
      memories: [{ ...durable.memories[0], position: { x: NaN, y: 0 } }],
    } as BoardSnapshot;
    await expect(backend.refresh()).rejects.toThrow();
    expect(displayed.memories[0].position.x).toBe(10.75);
    saved.set("pile-of-memories-core-v1", "corrupt");
    await expect(browserStorage().read()).rejects.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("imports the main export format atomically and preserves standalone label vocabulary", async () => {
  let durable = boardSnapshotSchema.parse([]);
  const store: SnapshotStorage = {
    id: "import-test",
    online: true,
    async read() {
      return structuredClone(durable);
    },
    async write(snapshot) {
      durable = structuredClone(snapshot);
    },
  };
  vi.stubGlobal("navigator", { locks: { request: (_key: string, work: () => unknown) => work() } });
  try {
    const backend = createSnapshotBackend(store, () => {});
    const exported = createBoardExport(
      { memories: [], tags: ["Unused area"], topics: ["Unused topic"] },
      "2026-09-16T12:00:00.000Z",
    );
    await expect(backend.replaceBoard(exported)).resolves.toMatchObject({
      tags: ["Unused area"],
      topics: ["Unused topic"],
    });
    const before = structuredClone(durable);
    await expect(backend.replaceBoard({ ...exported, version: 2 })).rejects.toThrow();
    expect(durable).toEqual(before);
  } finally {
    vi.unstubAllGlobals();
  }
});
