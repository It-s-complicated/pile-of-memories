import { env } from "$env/dynamic/private";
import postgres from "postgres";

export const CARD_CHANGE_COALESCE_MS = 50;
const CARD_CHANGE_CHANNEL = "cards_changed";

type StopListener = () => Promise<void>;
type StartListener = (notify: () => void) => Promise<StopListener>;
type Subscriber = {
  pending: boolean;
  resolve?: (changed: boolean) => void;
};

export type CardChangeSubscription = {
  next: (signal?: AbortSignal) => Promise<boolean>;
  close: () => void;
};

export function createCardChangeHub(
  startListener: StartListener,
  coalesceMs = CARD_CHANGE_COALESCE_MS,
) {
  const subscribers = new Set<Subscriber>();
  let listener: Promise<StopListener> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    timer = undefined;
    for (const subscriber of subscribers) {
      if (subscriber.resolve) {
        const resolve = subscriber.resolve;
        subscriber.resolve = undefined;
        resolve(true);
      } else {
        subscriber.pending = true;
      }
    }
  }

  function notify(): void {
    if (!timer) timer = setTimeout(flush, coalesceMs);
  }

  function stopIfUnused(): void {
    if (subscribers.size > 0) return;
    if (timer) clearTimeout(timer);
    timer = undefined;
    const activeListener = listener;
    listener = undefined;
    void activeListener
      ?.then((stop) => stop())
      .catch((error) => console.error("Failed to stop PostgreSQL card listener", error));
  }

  async function subscribe(signal?: AbortSignal): Promise<CardChangeSubscription> {
    if (signal?.aborted) throw signal.reason;
    const subscriber: Subscriber = { pending: false };
    subscribers.add(subscriber);

    try {
      listener ??= startListener(notify).catch((error) => {
        listener = undefined;
        throw error;
      });
      const activeListener = listener;
      if (signal) {
        const started = await new Promise<boolean>((resolve, reject) => {
          const abort = () => finish(false);
          const finish = (value: boolean) => {
            signal.removeEventListener("abort", abort);
            resolve(value);
          };
          const fail = (error: unknown) => {
            signal.removeEventListener("abort", abort);
            reject(error);
          };
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) finish(false);
          activeListener.then(() => finish(true), fail);
        });
        if (!started) throw signal.reason;
      } else {
        await activeListener;
      }
    } catch (error) {
      subscribers.delete(subscriber);
      stopIfUnused();
      throw error;
    }

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      subscribers.delete(subscriber);
      subscriber.resolve?.(false);
      subscriber.resolve = undefined;
      stopIfUnused();
    };

    return {
      next(signal) {
        if (closed || signal?.aborted) return Promise.resolve(false);
        if (subscriber.pending) {
          subscriber.pending = false;
          return Promise.resolve(true);
        }

        return new Promise((resolve) => {
          const finish = (changed: boolean) => {
            signal?.removeEventListener("abort", abort);
            resolve(changed);
          };
          const abort = () => finish(false);
          subscriber.resolve = finish;
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) abort();
        });
      },
      close,
    };
  }

  return { subscribe };
}

async function startPostgresListener(notify: () => void): Promise<StopListener> {
  const connectionString = env.DATABASE_LISTEN_CONNECTION_STRING || env.DATABASE_CONNECTION_STRING;
  if (!connectionString) throw new Error("A database listener connection string is not set");

  const sql = postgres(connectionString, { ssl: "require", max: 1 });
  let connected = false;

  try {
    const listener = await sql.listen(CARD_CHANGE_CHANNEL, notify, () => {
      if (connected) notify();
      connected = true;
    });
    return async () => {
      try {
        await listener.unlisten();
      } finally {
        await sql.end();
      }
    };
  } catch (error) {
    await sql.end();
    throw error;
  }
}

const cardChangeHub = createCardChangeHub(startPostgresListener);

export const subscribeToCardChanges = cardChangeHub.subscribe;

export async function* streamCardSnapshots<T>(
  readSnapshot: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  subscribe: (signal?: AbortSignal) => Promise<CardChangeSubscription> = subscribeToCardChanges,
): AsyncGenerator<T> {
  if (signal?.aborted) return;

  let subscription: CardChangeSubscription;
  try {
    subscription = await subscribe(signal);
  } catch (error) {
    if (signal?.aborted) return;
    throw error;
  }

  try {
    if (signal?.aborted) return;
    const initial = await readSnapshot(signal);
    if (signal?.aborted) return;
    yield initial;

    while (await subscription.next(signal)) {
      if (signal?.aborted) return;
      const snapshot = await readSnapshot(signal);
      if (signal?.aborted) return;
      yield snapshot;
    }
  } finally {
    subscription.close();
  }
}
