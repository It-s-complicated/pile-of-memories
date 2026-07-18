import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { Card, CardInput } from "../card";
import { insertCard, listCards, removeCard, updateCard, updateCardPositions } from "./database";
import { streamCardSnapshots } from "./card-changes";

const connectionString = process.env.DATABASE_CONNECTION_STRING;
const runIntegration = process.env.DATABASE_INTEGRATION_TEST === "1" && connectionString;
const describeIntegration = runIntegration ? describe.sequential : describe.skip;
const FIRST_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_ID = "00000000-0000-4000-8000-000000000002";
const MISSING_ID = "00000000-0000-4000-8000-000000000099";
let sql: ReturnType<typeof postgres>;

function input(id: string): CardInput {
  return {
    id,
    title: `Card ${id.at(-1)}`,
    body: "Body",
    position: { x: 0, y: 0 },
    tags: [],
    topics: [],
    links: [],
    archived: false,
  };
}

async function nextSnapshot(snapshots: AsyncGenerator<Card[]>): Promise<Card[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for card snapshot")),
      10_000,
    );
    snapshots.next().then(
      ({ value, done }) => {
        clearTimeout(timer);
        if (done) reject(new Error("Card snapshot stream ended"));
        else resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function listenerCount(): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count FROM pg_stat_activity
    WHERE pid <> pg_backend_pid() AND query ILIKE 'listen%cards_changed%'
  `;
  return row.count;
}

async function waitForListenerCount(expected: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await listenerCount()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${expected} PostgreSQL listeners`);
}

describeIntegration("PostgreSQL card integration", () => {
  beforeAll(async () => {
    sql = postgres(connectionString!, { ssl: "require", max: 1 });
    const migration = await readFile(
      new URL("../../../migrations/0001_cards.sql", import.meta.url),
      "utf8",
    );
    await sql.unsafe(migration);
    await sql`TRUNCATE cards CASCADE`;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("updates a position batch atomically", async () => {
    await insertCard(input(FIRST_ID));
    await insertCard(input(SECOND_ID));

    const updated = await updateCardPositions([
      { id: FIRST_ID, position: { x: 10, y: 20 } },
      { id: SECOND_ID, position: { x: 30, y: 40 } },
    ]);
    expect(updated?.map(({ position }) => position)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);

    await expect(
      updateCardPositions([
        { id: FIRST_ID, position: { x: 99, y: 99 } },
        { id: MISSING_ID, position: { x: 99, y: 99 } },
      ]),
    ).resolves.toBeNull();
    expect((await listCards()).find(({ id }) => id === FIRST_ID)?.position).toEqual({
      x: 10,
      y: 20,
    });
  });

  it("streams authoritative snapshots and releases its listener", async () => {
    await sql`TRUNCATE cards CASCADE`;
    const controller = new AbortController();
    const snapshots = streamCardSnapshots(listCards, controller.signal);

    expect(await nextSnapshot(snapshots)).toEqual([]);
    await waitForListenerCount(1);

    await insertCard(input(FIRST_ID));
    expect(await nextSnapshot(snapshots)).toMatchObject([{ id: FIRST_ID, title: "Card 1" }]);

    await updateCard(FIRST_ID, { title: "Updated", archived: true });
    expect(await nextSnapshot(snapshots)).toMatchObject([
      { id: FIRST_ID, title: "Updated", archived: true },
    ]);

    await removeCard(FIRST_ID);
    expect(await nextSnapshot(snapshots)).toEqual([]);

    const waiting = snapshots.next();
    controller.abort();
    await expect(waiting).resolves.toEqual({ value: undefined, done: true });
    await waitForListenerCount(0);
  });
});
