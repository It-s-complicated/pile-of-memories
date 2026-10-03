import { DATABASE_LISTEN_CONNECTION_STRING } from "$app/env/private";
import postgres from "postgres";

const CARD_CHANGE_CHANNEL = "cards_changed";

export async function* streamCardSnapshots<T>(
  readSnapshot: () => Promise<T>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  const sql = postgres(DATABASE_LISTEN_CONNECTION_STRING, { ssl: "require", max: 1 });
  let changed = Promise.withResolvers<void>();
  let connected = false;
  const notify = () => changed.resolve();
  signal.addEventListener("abort", notify);

  try {
    if (signal.aborted) return;
    yield await readSnapshot();

    const listener = await sql.listen(CARD_CHANGE_CHANNEL, notify, () => {
      if (connected) notify();
      connected = true;
    });

    try {
      if (signal.aborted) return;
      // Reconcile changes made between the first read and subscribing.
      yield await readSnapshot();

      while (!signal.aborted) {
        await changed.promise;
        changed = Promise.withResolvers<void>();
        if (!signal.aborted) yield await readSnapshot();
      }
    } finally {
      await listener.unlisten();
    }
  } finally {
    signal.removeEventListener("abort", notify);
    await sql.end();
  }
}
