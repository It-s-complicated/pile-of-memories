import { createAirspace } from "airspace";
import type { OAuthSession } from "airspace/oauth";
import { workspace } from "../airspace-model";
import { boardSnapshotSchema, type SnapshotStorage } from "../board-backend";

export async function connectAtproto(session: OAuthSession): Promise<SnapshotStorage> {
  const client = createAirspace({
    identity: session.did,
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
      return record
        ? boardSnapshotSchema.parse(JSON.parse(record.value.snapshot))
        : boardSnapshotSchema.parse([]);
    },
    async write(board) {
      await requirePrivateSpace();
      const snapshot = JSON.stringify(boardSnapshotSchema.parse(board));
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
