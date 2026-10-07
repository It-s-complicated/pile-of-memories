import { error } from "@sveltejs/kit";
import { listCards, listLabels } from "#lib/server/database.js";
import { requirePrivateBoard } from "#lib/server/private-board.js";

export async function GET(): Promise<Response> {
  requirePrivateBoard();

  let memories;
  let vocabulary;
  try {
    [memories, vocabulary] = await Promise.all([listCards(), listLabels()]);
  } catch {
    error(503, "Could not export memories. Please try again.");
  }

  const exportedAt = new Date().toISOString();
  return new Response(
    JSON.stringify(
      {
        version: 2,
        exportedAt,
        memories,
        labels: vocabulary.map(({ id, name, kind, description }) => ({
          id,
          name,
          kind,
          description,
        })),
        tags: vocabulary.filter(({ kind }) => kind === "tag").map(({ name }) => name),
        topics: vocabulary.filter(({ kind }) => kind === "topic").map(({ name }) => name),
      },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="pile-of-memories-${exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
