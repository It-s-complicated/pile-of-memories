import { describe, expect, it, vi } from "vite-plus/test";
import type { Card, CardChanges, CardInput, CardPositionUpdate } from "./card";
import { createCardOverlay } from "./card-overlay.svelte";

const CARD_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_CARD_ID = "00000000-0000-4000-8000-000000000002";

function card(id = CARD_ID, updatedAt = "2026-01-01T00:00:00.000Z"): Card {
  return {
    id,
    title: "Memory",
    body: "Body",
    position: { x: 0, y: 0 },
    tags: [],
    topics: [],
    links: [],
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(initial = [card()]) {
  let authoritative = initial;
  const commands = {
    create: vi.fn(async ({ card: input }: { card: CardInput }) => ({
      ...input,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    })),
    update: vi.fn(async ({ id, changes }: { id: string; changes: CardChanges }) => ({
      ...authoritative.find((item) => item.id === id)!,
      ...changes,
      updatedAt: "2026-01-01T00:00:01.000Z",
    })),
    updatePositions: vi.fn(async ({ positions }: { positions: CardPositionUpdate[] }) =>
      positions.map(({ id, position }) => ({
        ...authoritative.find((item) => item.id === id)!,
        position,
        updatedAt: "2026-01-01T00:00:01.000Z",
      })),
    ),
    delete: vi.fn(async () => {}),
  };
  const reconnect = vi.fn(async () => {});
  const overlay = createCardOverlay(() => authoritative, commands, reconnect, 100);
  return {
    overlay,
    commands,
    reconnect,
    setAuthoritative(cards: Card[]) {
      authoritative = cards;
    },
    getAuthoritative() {
      return authoritative;
    },
  };
}

describe("card overlay", () => {
  it("applies updates immediately and rolls back only a failed command", async () => {
    const context = setup();
    const request = deferred<Card>();
    context.commands.update.mockReturnValueOnce(request.promise);

    const update = context.overlay.update(CARD_ID, { title: "Optimistic" });
    expect(context.overlay.effectiveCards(context.getAuthoritative())[0].title).toBe("Optimistic");

    request.reject(new Error("failed"));
    await expect(update).rejects.toThrow("failed");
    expect(context.overlay.effectiveCards(context.getAuthoritative())[0].title).toBe("Memory");
  });

  it("serializes writes per card and rolls back only the failing delta", async () => {
    const context = setup();
    const first = deferred<Card>();
    const second = deferred<Card>();
    context.commands.update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const firstUpdate = context.overlay.update(CARD_ID, { title: "First" });
    const secondUpdate = context.overlay.update(CARD_ID, { archived: true });
    await vi.waitFor(() => expect(context.commands.update).toHaveBeenCalledOnce());
    expect(context.overlay.effectiveCards(context.getAuthoritative())[0]).toMatchObject({
      title: "First",
      archived: true,
    });

    first.reject(new Error("failed"));
    await expect(firstUpdate).rejects.toThrow("failed");
    expect(context.overlay.effectiveCards(context.getAuthoritative())[0]).toMatchObject({
      title: "Memory",
      archived: true,
    });
    await vi.waitFor(() => expect(context.commands.update).toHaveBeenCalledTimes(2));

    const final = { ...card(CARD_ID, "2026-01-01T00:00:02.000Z"), archived: true };
    second.resolve(final);
    await secondUpdate;
    context.setAuthoritative([final]);
    context.overlay.reconcile([final]);
    expect(context.overlay.effectiveCards([final])).toEqual([final]);
  });

  it("reconciles tokens by their own delta when timestamps collide", async () => {
    const context = setup();
    const first = deferred<Card>();
    const second = deferred<Card>();
    context.commands.update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const firstUpdate = context.overlay.update(CARD_ID, { title: "First" });
    const secondUpdate = context.overlay.update(CARD_ID, { title: "Second" });
    first.resolve({ ...card(CARD_ID, "2026-01-01T00:00:01.000Z"), title: "First" });
    await firstUpdate;
    await vi.waitFor(() => expect(context.commands.update).toHaveBeenCalledTimes(2));
    second.resolve({ ...card(CARD_ID, "2026-01-01T00:00:01.000Z"), title: "Second" });
    await secondUpdate;

    const firstSnapshot = { ...card(CARD_ID, "2026-01-01T00:00:01.000Z"), title: "First" };
    context.setAuthoritative([firstSnapshot]);
    context.overlay.reconcile([firstSnapshot]);
    expect(context.overlay.effectiveCards([firstSnapshot])[0].title).toBe("Second");
  });

  it("retains only the optimistic delta over newer snapshot fields", async () => {
    const context = setup();
    await context.overlay.update(CARD_ID, { title: "Optimistic" });

    const snapshot = { ...card(CARD_ID, "2026-01-01T00:00:02.000Z"), body: "External" };
    context.setAuthoritative([snapshot]);
    context.overlay.reconcile([snapshot]);
    expect(context.overlay.effectiveCards([snapshot])[0]).toMatchObject({
      title: "Optimistic",
      body: "External",
    });
  });

  it("reconciles successful inserts and deletes from snapshots", async () => {
    const context = setup([]);
    const input = card();
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...cardInput } = input;
    const created = await context.overlay.create(cardInput);
    expect(context.overlay.effectiveCards([])).toEqual([created]);

    context.setAuthoritative([created]);
    context.overlay.reconcile([created]);
    const deletion = context.overlay.delete(CARD_ID);
    expect(context.overlay.effectiveCards([created])).toEqual([]);
    await deletion;
    context.setAuthoritative([]);
    context.overlay.reconcile([]);
    expect(context.overlay.effectiveCards([])).toEqual([]);
  });

  it("rolls back a failed position batch as one operation", async () => {
    const cards = [card(), card(SECOND_CARD_ID)];
    const context = setup(cards);
    context.commands.updatePositions.mockRejectedValueOnce(new Error("failed"));

    const update = context.overlay.updatePositions([
      { id: CARD_ID, position: { x: 10, y: 10 } },
      { id: SECOND_CARD_ID, position: { x: 20, y: 20 } },
    ]);
    expect(context.overlay.effectiveCards(cards).map(({ position }) => position.x)).toEqual([
      10, 20,
    ]);
    await expect(update).rejects.toThrow("failed");
    expect(context.overlay.effectiveCards(cards)).toEqual(cards);
  });

  it("does not apply a partial batch when a later card is missing", async () => {
    const cards = [card()];
    const context = setup(cards);

    await expect(
      context.overlay.updatePositions([
        { id: CARD_ID, position: { x: 10, y: 10 } },
        { id: SECOND_CARD_ID, position: { x: 20, y: 20 } },
      ]),
    ).rejects.toThrow("Card not found");
    expect(context.overlay.effectiveCards(cards)).toEqual(cards);
    expect(context.commands.updatePositions).not.toHaveBeenCalled();
  });

  it("expires simultaneous operations with one reconnect", async () => {
    vi.useFakeTimers();
    const cards = [card(), card(SECOND_CARD_ID)];
    const context = setup(cards);

    await Promise.all([
      context.overlay.update(CARD_ID, { title: "First" }),
      context.overlay.update(SECOND_CARD_ID, { title: "Second" }),
    ]);
    await vi.advanceTimersByTimeAsync(100);

    expect(context.overlay.stale).toBe(true);
    expect(context.reconnect).toHaveBeenCalledOnce();
    context.overlay.destroy();
    vi.useRealTimers();
  });

  it("does not recreate pending state when creation finishes after teardown", async () => {
    vi.useFakeTimers();
    const context = setup([]);
    const request = deferred<Card>();
    context.commands.create.mockReturnValueOnce(request.promise);
    const created = card();
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...input } = created;

    const creation = context.overlay.create(input);
    context.overlay.destroy();
    request.resolve(created);
    await expect(creation).resolves.toEqual(created);
    await vi.advanceTimersByTimeAsync(100);

    expect(context.overlay.effectiveCards([])).toEqual([]);
    expect(context.reconnect).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("expires one unconfirmed success and requests one reconnect", async () => {
    vi.useFakeTimers();
    const context = setup();
    await context.overlay.update(CARD_ID, { title: "Unconfirmed" });

    await vi.advanceTimersByTimeAsync(100);
    expect(context.overlay.effectiveCards(context.getAuthoritative())[0].title).toBe("Memory");
    expect(context.overlay.stale).toBe(true);
    expect(context.reconnect).toHaveBeenCalledOnce();

    context.overlay.reconcile(context.getAuthoritative());
    expect(context.overlay.stale).toBe(false);
    context.overlay.destroy();
    vi.useRealTimers();
  });
});
