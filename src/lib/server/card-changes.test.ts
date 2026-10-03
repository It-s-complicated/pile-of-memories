import { expect, it, vi } from "vite-plus/test";

const { listen, unlisten, end } = vi.hoisted(() => {
  const unlisten = vi.fn(async () => {});
  return {
    unlisten,
    end: vi.fn(async () => {}),
    listen: vi.fn(async (_channel: string, _notify: () => void) => ({ unlisten })),
  };
});
vi.mock("postgres", () => ({ default: () => ({ listen, end }) }));
vi.mock("$app/env/private", () => ({
  DATABASE_LISTEN_CONNECTION_STRING: "test",
}));

import { streamCardSnapshots } from "./card-changes";

it("reads before LISTEN, reconciles the subscription gap and closes on abort", async () => {
  let cards = ["first"];
  const controller = new AbortController();
  const stream = streamCardSnapshots(async () => cards, controller.signal);
  expect((await stream.next()).value).toEqual(["first"]);
  expect(listen).not.toHaveBeenCalled();
  cards = ["changed before subscribing"];
  expect((await stream.next()).value).toEqual(cards);
  expect(listen).toHaveBeenCalledOnce();
  const [, notify] = listen.mock.calls[0];
  for (const title of ["first notification", "second notification"]) {
    const changed = stream.next();
    cards = [title];
    notify();
    expect((await changed).value).toEqual(cards);
  }
  const waiting = stream.next();
  controller.abort();
  expect((await waiting).done).toBe(true);
  expect(unlisten).toHaveBeenCalledOnce();
  expect(end).toHaveBeenCalledOnce();
});
