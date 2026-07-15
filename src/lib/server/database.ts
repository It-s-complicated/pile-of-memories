import { env } from "$env/dynamic/private";
import postgres from "postgres";
import type { Card, CardChanges, CardInput } from "../card";

if (!env.DATABASE_CONNECTION_STRING) throw new Error("DATABASE_CONNECTION_STRING is not set");

const sql = postgres(env.DATABASE_CONNECTION_STRING, { ssl: "require" });
let schemaReady: Promise<unknown> | undefined;

type CardRow = {
  id: string;
  title: string;
  body: string;
  x: number;
  y: number;
  tags: string[];
  topics: string[];
  links: string[];
  created_at: Date;
  updated_at: Date;
};

function ensureSchema(): Promise<unknown> {
  // ponytail: bootstrap one table here; add migrations before the second schema change.
  return (schemaReady ??= Promise.resolve(sql`
    CREATE TABLE IF NOT EXISTS cards (
      id uuid PRIMARY KEY,
      title text NOT NULL CHECK (btrim(title) <> ''),
      body text NOT NULL,
      x double precision NOT NULL,
      y double precision NOT NULL,
      tags text[] NOT NULL DEFAULT ARRAY[]::text[],
      topics text[] NOT NULL DEFAULT ARRAY[]::text[],
      links text[] NOT NULL DEFAULT ARRAY[]::text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `));
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    position: { x: row.x, y: row.y },
    tags: row.tags,
    topics: row.topics,
    links: row.links,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function findCard(id: string): Promise<Card | null> {
  const [row] = await sql<CardRow[]>`SELECT * FROM cards WHERE id = ${id}`;
  return row ? toCard(row) : null;
}

export async function listCards(): Promise<Card[]> {
  await ensureSchema();
  const rows = await sql<CardRow[]>`SELECT * FROM cards ORDER BY created_at, id`;
  return rows.map(toCard);
}

export async function insertCard(card: CardInput): Promise<Card> {
  await ensureSchema();
  const [row] = await sql<CardRow[]>`
    INSERT INTO cards (id, title, body, x, y, tags, topics, links)
    VALUES (
      ${card.id}, ${card.title}, ${card.body}, ${card.position.x}, ${card.position.y},
      ${card.tags}, ${card.topics}, ${card.links}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING *
  `;

  const existing = row ? toCard(row) : await findCard(card.id);
  if (!existing) throw new Error("Card disappeared while it was being created");
  return existing;
}

export async function updateCard(id: string, changes: CardChanges): Promise<Card | null> {
  await ensureSchema();
  const values: Record<string, string | number | string[] | Date> = { updated_at: new Date() };

  if (changes.title !== undefined) values.title = changes.title;
  if (changes.body !== undefined) values.body = changes.body;
  if (changes.position !== undefined) {
    values.x = changes.position.x;
    values.y = changes.position.y;
  }
  if (changes.tags !== undefined) values.tags = changes.tags;
  if (changes.topics !== undefined) values.topics = changes.topics;
  if (changes.links !== undefined) values.links = changes.links;

  const [row] = await sql<CardRow[]>`
    UPDATE cards SET ${sql(values)} WHERE id = ${id} RETURNING *
  `;
  return row ? toCard(row) : null;
}

export async function removeCard(id: string): Promise<boolean> {
  await ensureSchema();
  const result = await sql`DELETE FROM cards WHERE id = ${id}`;
  return result.count > 0;
}
