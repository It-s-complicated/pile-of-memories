import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCardChangeHub, streamCardSnapshots } from "./card-changes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe("card change hub", () => {
  it("fans out bounded signals and stops only after the last subscriber closes", async () => {
    vi.useFakeTimers();
    let notify = () => {};
    const stop = vi.fn(async () => {});
    const hub = createCardChangeHub(async (onNotify) => {
      notify = onNotify;
      return stop;
    }, 10);
    const first = await hub.subscribe();
    const second = await hub.subscribe();

    const firstSignal = first.next();
    const secondSignal = second.next();
    notify();
    notify();
    await vi.advanceTimersByTimeAsync(10);
    await expect(firstSignal).resolves.toBe(true);
    await expect(secondSignal).resolves.toBe(true);

    first.close();
    expect(stop).not.toHaveBeenCalled();
    notify();
    await vi.advanceTimersByTimeAsync(10);
    await expect(second.next()).resolves.toBe(true);

    second.close();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });

  it("retains a notification received during an in-flight snapshot read", async () => {
    vi.useFakeTimers();
    let notify = () => {};
    const initial = deferred<string>();
    const readSnapshot = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce("after change");
    const hub = createCardChangeHub(async (onNotify) => {
      notify = onNotify;
      return async () => {};
    }, 10);
    const snapshots = streamCardSnapshots(readSnapshot, undefined, hub.subscribe);

    const first = snapshots.next();
    await vi.waitFor(() => expect(readSnapshot).toHaveBeenCalledOnce());
    notify();
    await vi.advanceTimersByTimeAsync(10);
    initial.resolve("initial");
    await expect(first).resolves.toMatchObject({ value: "initial", done: false });
    await expect(snapshots.next()).resolves.toMatchObject({ value: "after change", done: false });
    expect(readSnapshot).toHaveBeenCalledTimes(2);

    await snapshots.return(undefined);
  });

  it("refreshes on listener reconnect and starts a new listener after cleanup", async () => {
    vi.useFakeTimers();
    const notifies: Array<() => void> = [];
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const hub = createCardChangeHub(async (notify) => {
      notifies.push(notify);
      const stop = vi.fn(async () => {});
      stops.push(stop);
      return stop;
    }, 10);

    const first = await hub.subscribe();
    const reconnectSignal = first.next();
    notifies[0]();
    await vi.advanceTimersByTimeAsync(10);
    await expect(reconnectSignal).resolves.toBe(true);
    first.close();
    await vi.waitFor(() => expect(stops[0]).toHaveBeenCalledOnce());

    const second = await hub.subscribe();
    expect(notifies).toHaveLength(2);
    second.close();
    await vi.waitFor(() => expect(stops[1]).toHaveBeenCalledOnce());
  });

  it("cancels listener startup and stops the listener when startup settles", async () => {
    const started = deferred<() => Promise<void>>();
    const stop = vi.fn(async () => {});
    const hub = createCardChangeHub(async () => started.promise);
    const controller = new AbortController();

    const subscription = hub.subscribe(controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(subscription).rejects.toThrow("cancelled");
    started.resolve(stop);
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });
});

describe("card snapshot stream cancellation", () => {
  it("does not subscribe or read when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const readSnapshot = vi.fn(async () => "snapshot");
    const subscribe = vi.fn();
    const snapshots = streamCardSnapshots(readSnapshot, controller.signal, subscribe);

    await expect(snapshots.next()).resolves.toEqual({ value: undefined, done: true });
    expect(subscribe).not.toHaveBeenCalled();
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("passes cancellation into an in-flight read and closes the subscription", async () => {
    const controller = new AbortController();
    const close = vi.fn();
    const readSnapshot = vi.fn(
      async (signal?: AbortSignal) =>
        new Promise<string>((resolve) =>
          signal?.addEventListener("abort", () => resolve("cancelled"), { once: true }),
        ),
    );
    const subscribe = vi.fn(async () => ({
      next: vi.fn(async () => false),
      close,
    }));
    const snapshots = streamCardSnapshots(readSnapshot, controller.signal, subscribe);

    const first = snapshots.next();
    await vi.waitFor(() => expect(readSnapshot).toHaveBeenCalledWith(controller.signal));
    controller.abort();
    await expect(first).resolves.toEqual({ value: undefined, done: true });
    expect(close).toHaveBeenCalledOnce();
  });
});
