import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { storageScopes } from "./airspace-model";
import { boardSnapshotSchema } from "./board-backend";
import { getOAuth } from "./server/auth";
import { connectAtproto } from "./server/atproto";

async function authenticatedSession() {
  const { locals, cookies, url } = getRequestEvent();
  if (!locals.did) error(401, "Sign in with your AT Protocol account.");
  const oauth = await getOAuth(cookies, url);
  const session = await oauth.restore(locals.did);
  const granted = (await session.getTokenInfo()).scope.split(" ");
  return { oauth, session, permitted: storageScopes.every((scope) => granted.includes(scope)) };
}

export const openAirspace = command(async () => {
  const { oauth, session, permitted } = await authenticatedSession();
  if (!permitted) {
    return {
      authorizationUrl: (await oauth.authorize(session.did, { state: "airspace" })).toString(),
    };
  }
  return { id: `pile-of-memories-atproto-${session.did}` };
});

async function storage() {
  const { session, permitted } = await authenticatedSession();
  if (!permitted) error(403, "Reopen Airspace to approve board storage permissions.");
  try {
    return await connectAtproto(session);
  } catch (cause) {
    error(502, cause instanceof Error ? cause.message : "Could not open Airspace.");
  }
}

export const readAirspace = command(async () => (await storage()).read());
export const writeAirspace = command(boardSnapshotSchema, async (snapshot) => {
  await (await storage()).write(snapshot);
});
