import { expect, it, vi } from "vite-plus/test";

const { listen, unlisten, end } = vi.hoisted(() => {
  const unlisten = vi.fn(async () => {});
  return { unlisten, end: vi.fn(async () => {}), listen: vi.fn(async () => ({ unlisten })) };
});
vi.mock("postgres", () => ({ default: () => ({ listen, end }) }));
vi.mock("$app/env/private", () => ({
  DATABASE_CONNECTION_STRING: "test",
  DATABASE_LISTEN_CONNECTION_STRING: "",
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
  controller.abort();
  expect((await stream.next()).done).toBe(true);
  expect(unlisten).toHaveBeenCalledOnce();
  expect(end).toHaveBeenCalledOnce();
});
