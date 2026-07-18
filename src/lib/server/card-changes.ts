import { env } from "$env/dynamic/private";
import postgres from "postgres";

const CARD_CHANGE_CHANNEL = "cards_changed";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

export async function* streamCardSnapshots<T>(
  readSnapshot: () => Promise<T>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  const connectionString = env.DATABASE_LISTEN_CONNECTION_STRING || env.DATABASE_CONNECTION_STRING;
  if (!connectionString) throw new Error("A database listener connection string is not set");

  const sql = postgres(connectionString, { ssl: "require", max: 1 });
  let changed = deferred();
  let connected = false;
  const notify = () => changed.resolve();
  signal.addEventListener("abort", notify);

  try {
    const listener = await sql.listen(CARD_CHANGE_CHANNEL, notify, () => {
      if (connected) notify();
      connected = true;
    });

    try {
      if (signal.aborted) return;
      yield await readSnapshot();

      while (!signal.aborted) {
        await changed.promise;
        changed = deferred();
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
