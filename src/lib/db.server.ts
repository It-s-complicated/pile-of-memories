import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { DEFAULT_MEMORY_BODY, type MemoryContent } from "./memories";

const dbPath = resolve(process.cwd(), ".data/pile-of-memories.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client);

const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

const starterMemories = [
  ["starter-capture", "Capture"],
  ["starter-arrange", "Arrange"],
  ["starter-connect", "Connect"],
  ["starter-review", "Review"],
] as const;

let schemaReady: Promise<void> | undefined;

function ensureSchema() {
  schemaReady ??= (async () => {
    await db.run(sql`
      create table if not exists memories (
        id text primary key,
        title text not null,
        body text not null,
        created_at integer not null,
        updated_at integer not null
      )
    `);

    const existing = await db.select({ id: memories.id }).from(memories).limit(1);
    if (existing.length > 0) return;

    const now = Date.now();
    await db.insert(memories).values(
      starterMemories.map(([id, title], index) => ({
        id,
        title,
        body: DEFAULT_MEMORY_BODY,
        createdAt: now + index,
        updatedAt: now + index,
      })),
    );
  })();

  return schemaReady;
}

export async function listMemories() {
  await ensureSchema();
  return db.select().from(memories).orderBy(asc(memories.createdAt));
}

export async function createMemory(title = "Memory card", body = DEFAULT_MEMORY_BODY) {
  await ensureSchema();

  const now = Date.now();
  const [memory] = await db
    .insert(memories)
    .values({
      id: crypto.randomUUID(),
      title,
      body,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return memory;
}

export async function updateMemoryContents(contents: MemoryContent[]) {
  await ensureSchema();

  const now = Date.now();
  for (const memory of contents) {
    await db
      .update(memories)
      .set({
        title: memory.title || "Untitled memory",
        body: memory.body,
        updatedAt: now,
      })
      .where(eq(memories.id, memory.id));
  }
}
