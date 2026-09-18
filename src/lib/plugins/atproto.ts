import { openAirspace, readAirspace, writeAirspace } from "../airspace.remote";
import type { SnapshotStorage } from "../board-backend";

export async function connectAtproto(): Promise<SnapshotStorage | undefined> {
  const result = await openAirspace();
  if (result.id === undefined) {
    window.location.assign(result.authorizationUrl);
    return;
  }
  return { id: result.id, online: true, read: readAirspace, write: writeAirspace };
}
