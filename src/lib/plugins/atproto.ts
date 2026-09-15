import { createAirspace, defineCollection, defineSpace, passwordSession } from "airspace";
import { defineLexicons, field, space } from "airspace/lexicon";
import { z } from "zod";
import { boardSnapshotSchema, type SnapshotStorage } from "../board-backend";

export const atprotoSettingsSchema = z.object({
  service: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  }, "Use HTTPS, or HTTP on localhost for a development PDS."),
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

// Experimental namespace, deliberately separate from any published memory lexicon.
const lexicons = defineLexicons("app.pileofmemories.prototype", {
  board: { key: "self", snapshot: field.text({ max: 200_000 }) },
  workspace: space(["board"]),
});
const boards = defineCollection(lexicons.board);
const workspace = defineSpace(lexicons.workspace, { collections: { boards } });

export async function connectAtproto(
  input: z.input<typeof atprotoSettingsSchema>,
): Promise<SnapshotStorage> {
  const { service, identifier, password } = atprotoSettingsSchema.parse(input);
  const session = await passwordSession({ service, identifier, password });
  const client = createAirspace({
    identity: { did: session.did, service },
    session,
    spaces: { workspace },
  });
  if (!(await client.workspace.supported())) {
    throw new Error(
      "This PDS does not support private spaces. Use a spaces-enabled PDS or the browser board.",
    );
  }
  async function requirePrivateSpace() {
    const info = await client.workspace.manage.info();
    if (info && (info.read !== "member-list" || info.write !== "member-list")) {
      throw new Error(
        "The prototype space is not private. Its read and write policies must both be member-list.",
      );
    }
  }
  await requirePrivateSpace();
  await client.workspace.manage.ensure({
    read: "member-list",
    write: "member-list",
    appAccess: "open",
  });
  return {
    id: `pile-of-memories-atproto-${session.did}`,
    online: true,
    async read() {
      await requirePrivateSpace();
      const record = await client.workspace.boards.get();
      return record ? boardSnapshotSchema.parse(JSON.parse(record.value.snapshot)) : [];
    },
    async write(cards) {
      await requirePrivateSpace();
      const snapshot = JSON.stringify(boardSnapshotSchema.parse(cards));
      if (new TextEncoder().encode(snapshot).length > 200_000) {
        throw new Error(
          "This prototype board exceeds 200 KB. Split storage into per-card records before adding more.",
        );
      }
      // ponytail: spaces have no CAS; one active editor across devices until conflict-safe writes exist.
      await client.workspace.boards.put({ snapshot });
    },
  };
}
