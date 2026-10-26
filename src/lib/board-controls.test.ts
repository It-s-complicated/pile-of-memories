import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { cards, labels } = vi.hoisted(() => {
  const query = () => ({
    current: [] as unknown[],
    ready: true,
    done: false,
    error: undefined as { message: string } | undefined,
    reconnect: vi.fn<() => Promise<void>>(),
  });
  return { cards: query(), labels: query() };
});

vi.mock("./cards.remote", () => ({
  getLiveCards: () => cards,
  updateCard: { pending: 0 },
  deleteCard: { pending: 0 },
  updateCardPositions: { pending: 0 },
}));
vi.mock("./labels.remote", () => ({ getLiveLabels: () => labels }));
vi.mock("./capture-navigation", () => ({ openCapture: vi.fn(), closeCapture: vi.fn() }));
vi.mock("./card-collection", () => ({
  openCardCache: async () => ({ close: vi.fn(), replace: vi.fn() }),
}));
vi.mock("$app/state", () => ({ page: { url: new URL("https://memories.example.com") } }));
vi.mock("@tanstack/svelte-db", () => ({
  useLiveQuery: () => ({ data: [], isReady: true }),
}));

import { BoardState } from "./board-controls.svelte";

it("preserves exploration context while reviewing an idea draft", () => {
  const board = new BoardState("owner");
  board.explorationSeedId = "source-card";
  const draft = {
    title: "New possibility",
    body: "An idea inspired by the cards.",
    kind: "idea" as const,
  };
  board.captureIdea(draft);
  expect(board.explorationSeedId).toBe("source-card");
  expect(board.captureDraft).toEqual(draft);
  board.openCapture();
  expect(board.captureDraft).toBeUndefined();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  for (const query of [cards, labels]) {
    query.current = [];
    query.done = false;
    query.error = undefined;
    query.reconnect.mockReset().mockImplementation(async () => {
      query.done = false;
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("backs off after stream handshakes followed by database errors, even with stale ready data", async () => {
  const board = new BoardState("owner");
  cards.done = true;
  board.keepLiveUpdatesFlowing();

  for (const [attempt, delay] of [5_000, 10_000, 20_000, 40_000, 60_000, 60_000].entries()) {
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(cards.reconnect).toHaveBeenCalledTimes(attempt);
    await vi.advanceTimersByTimeAsync(1);
    expect(cards.reconnect).toHaveBeenCalledTimes(attempt + 1);
    expect(labels.reconnect).toHaveBeenCalledTimes(attempt + 1);
    // The HTTP handshake succeeded, but no new query result arrived.
    board.keepLiveUpdatesFlowing();
    cards.error = { message: "Database unavailable" };
    cards.done = true;
    board.keepLiveUpdatesFlowing();
  }
});

it("resets backoff only after both streams yield fresh snapshots", async () => {
  const board = new BoardState("owner");
  cards.done = true;
  board.keepLiveUpdatesFlowing();
  await vi.advanceTimersByTimeAsync(5_000);
  cards.current = [];
  board.keepLiveUpdatesFlowing();
  cards.done = true;
  board.keepLiveUpdatesFlowing();
  await vi.advanceTimersByTimeAsync(10_000);
  cards.current = [];
  labels.current = [];
  board.keepLiveUpdatesFlowing();

  cards.done = true;
  board.keepLiveUpdatesFlowing();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(cards.reconnect).toHaveBeenCalledTimes(3);
});

it.each(["cards", "labels"] as const)(
  "keeps retry deadlines while the other stream updates and %s has ended",
  async (endedStream) => {
    const board = new BoardState("owner");
    const ended = endedStream === "cards" ? cards : labels;
    const live = endedStream === "cards" ? labels : cards;
    let cleanup: (() => void) | void;
    const rerunEffect = () => {
      cleanup?.();
      cleanup = board.keepLiveUpdatesFlowing();
    };

    for (const [attempt, delay] of [5_000, 10_000].entries()) {
      ended.done = true;
      rerunEffect();
      for (let elapsed = 1_000; elapsed < delay; elapsed += 1_000) {
        await vi.advanceTimersByTimeAsync(1_000);
        live.current = [];
        rerunEffect();
        expect(ended.reconnect).toHaveBeenCalledTimes(attempt);
      }
      await vi.advanceTimersByTimeAsync(1_000);
      expect(ended.reconnect).toHaveBeenCalledTimes(attempt + 1);
      expect(live.reconnect).toHaveBeenCalledTimes(attempt + 1);
    }
  },
);

it("cancels a pending retry when both streams recover", async () => {
  const board = new BoardState("owner");
  cards.done = true;
  board.keepLiveUpdatesFlowing();
  await vi.advanceTimersByTimeAsync(5_000);
  cards.done = true;
  board.keepLiveUpdatesFlowing();
  expect(vi.getTimerCount()).toBe(1);

  cards.done = false;
  cards.current = [];
  labels.current = [];
  board.keepLiveUpdatesFlowing();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(cards.reconnect).toHaveBeenCalledTimes(1);
});

it.each(["unmount", "sign out"])(
  "retries rejected handshakes and cancels scheduled work on %s",
  async (action) => {
    const board = new BoardState("owner");
    const unmount = board.mount();
    cards.reconnect.mockRejectedValue(new Error("Connection refused"));
    cards.done = true;
    board.keepLiveUpdatesFlowing();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cards.reconnect).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);

    if (action === "unmount") unmount();
    else await board.clearCache();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cards.reconnect).toHaveBeenCalledTimes(2);
  },
);
