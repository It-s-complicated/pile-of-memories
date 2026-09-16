import { error } from "@sveltejs/kit";
import { canonicalizeLabels, PRIMARY_TAGS, TOPIC_TAGS } from "#lib/labels.js";
import { listCards } from "#lib/server/database.js";
import { requirePrivateBoard } from "#lib/server/private-board.js";

export async function GET(): Promise<Response> {
  requirePrivateBoard();

  let memories;
  try {
    memories = await listCards();
  } catch {
    error(503, "Could not export memories. Please try again.");
  }

  const exportedAt = new Date().toISOString();
  return new Response(
    JSON.stringify(
      {
        version: 1,
        exportedAt,
        memories,
        tags: canonicalizeLabels([...PRIMARY_TAGS, ...memories.flatMap((card) => card.tags)]),
        topics: canonicalizeLabels([...TOPIC_TAGS, ...memories.flatMap((card) => card.topics)]),
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
