import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { Card, CardChanges, CardInput, CardPositionUpdate } from "./card";
import type { CardCreationProvenance } from "./enrichment-analytics";

export const CARD_RECONCILIATION_TIMEOUT_MS = 5_000;

type Commands = {
  create: (input: { card: CardInput; creation?: CardCreationProvenance }) => Promise<Card>;
  update: (input: { id: string; changes: CardChanges }) => Promise<Card>;
  updatePositions: (input: { positions: CardPositionUpdate[] }) => Promise<Card[]>;
  delete: (input: { id: string }) => Promise<void>;
};

type PendingCard = {
  token: number;
  kind: "card";
  changes: Partial<Card>;
  expectedUpdatedAt?: string;
};

type PendingDelete = {
  token: number;
  kind: "delete";
  acknowledged: boolean;
};

type Pending = PendingCard | PendingDelete;
type PendingInput = Omit<PendingCard, "token"> | Omit<PendingDelete, "token">;
type Token = { id: string; token: number };

export function createCardOverlay(
  snapshot: () => Card[],
  commands: Commands,
  reconnect: () => Promise<void>,
  timeoutMs = CARD_RECONCILIATION_TIMEOUT_MS,
) {
  const pending = new SvelteMap<string, Pending[]>();
  const sequences = new SvelteMap<string, number>();
  const commandQueues = new SvelteMap<string, Promise<void>>();
  const timers = new SvelteSet<ReturnType<typeof setTimeout>>();
  let stale = $state(false);
  let destroyed = false;

  function addPending(id: string, change: PendingInput): Token {
    const token = (sequences.get(id) ?? 0) + 1;
    sequences.set(id, token);
    pending.set(id, [...(pending.get(id) ?? []), { ...change, token } as Pending]);
    return { id, token };
  }

  function findPending({ id, token }: Token): Pending | undefined {
    return pending.get(id)?.find((change) => change.token === token);
  }

  function removePending({ id, token }: Token): void {
    const changes = pending.get(id)?.filter((change) => change.token !== token) ?? [];
    if (changes.length) pending.set(id, changes);
    else pending.delete(id);
  }

  function replacePending(token: Token, change: Pending): void {
    const changes = pending.get(token.id);
    const index = changes?.findIndex((candidate) => candidate.token === token.token) ?? -1;
    if (!changes || index < 0) return;
    pending.set(token.id, changes.toSpliced(index, 1, change));
  }

  async function queueCommand<T>(ids: string[], command: () => Promise<T>): Promise<T> {
    const previous = ids.map((id) => commandQueues.get(id) ?? Promise.resolve());
    let release!: () => void;
    const queued = new Promise<void>((resolve) => (release = resolve));
    for (const id of ids) commandQueues.set(id, queued);

    await Promise.all(previous);
    try {
      return await command();
    } finally {
      release();
      for (const id of ids) if (commandQueues.get(id) === queued) commandQueues.delete(id);
    }
  }

  function isConfirmed(change: Pending, card: Card | undefined): boolean {
    return (
      (change.kind === "delete" && change.acknowledged && !card) ||
      (change.kind === "card" &&
        change.expectedUpdatedAt !== undefined &&
        card?.updatedAt === change.expectedUpdatedAt &&
        Object.entries(change.changes).every(
          ([key, value]) => JSON.stringify(card[key as keyof Card]) === JSON.stringify(value),
        ))
    );
  }

  function expire(tokens: Token[]): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      const cards = new SvelteMap(snapshot().map((card) => [card.id, card]));
      let expired = false;
      for (const token of tokens) {
        const change = findPending(token);
        if (!change) continue;
        removePending(token);
        if (!isConfirmed(change, cards.get(token.id))) expired = true;
      }
      if (expired && !stale && !destroyed) {
        stale = true;
        void reconnect().catch(() => {});
      }
    }, timeoutMs);
    timers.add(timer);
  }

  function effectiveCards(authoritative: Card[]): Card[] {
    const cards = new SvelteMap(authoritative.map((card) => [card.id, card]));
    for (const [id, changes] of pending) {
      for (const change of changes) {
        if (change.kind === "delete") cards.delete(id);
        else {
          const current = cards.get(id);
          if (current) cards.set(id, { ...current, ...change.changes });
          else cards.set(id, change.changes as Card);
        }
      }
    }
    return [...cards.values()];
  }

  function currentCard(id: string): Card {
    const card = effectiveCards(snapshot()).find((candidate) => candidate.id === id);
    if (!card) throw new Error("Card not found");
    return card;
  }

  function reconcile(authoritative: Card[]): void {
    const cards = new SvelteMap(authoritative.map((card) => [card.id, card]));
    for (const [id, changes] of pending) {
      const confirmed = changes.findLastIndex((change) => isConfirmed(change, cards.get(id)));
      if (confirmed < 0) continue;
      const remaining = changes.slice(confirmed + 1);
      if (remaining.length) pending.set(id, remaining);
      else pending.delete(id);
    }
    stale = false;
  }

  async function create(card: CardInput, creation?: CardCreationProvenance): Promise<Card> {
    const result = await commands.create({ card, ...(creation ? { creation } : {}) });
    if (destroyed) return result;
    const token = addPending(result.id, {
      kind: "card",
      changes: result,
      expectedUpdatedAt: result.updatedAt,
    });
    reconcile(snapshot());
    if (findPending(token)) expire([token]);
    return result;
  }

  async function update(id: string, changes: CardChanges): Promise<Card> {
    currentCard(id);
    const token = addPending(id, { kind: "card", changes });

    try {
      const result = await queueCommand([id], () => commands.update({ id, changes }));
      if (findPending(token)) {
        replacePending(token, {
          token: token.token,
          kind: "card",
          changes,
          expectedUpdatedAt: result.updatedAt,
        });
        reconcile(snapshot());
        if (findPending(token)) expire([token]);
      }
      return result;
    } catch (error) {
      removePending(token);
      throw error;
    }
  }

  async function updatePositions(positions: CardPositionUpdate[]): Promise<Card[]> {
    if (positions.length === 0) return [];
    for (const { id } of positions) currentCard(id);
    const tokens = positions.map(({ id, position }) =>
      addPending(id, { kind: "card", changes: { position } }),
    );

    try {
      const results = await queueCommand(
        positions.map(({ id }) => id),
        () => commands.updatePositions({ positions }),
      );
      const cards = new SvelteMap(results.map((card) => [card.id, card]));
      for (const token of tokens) {
        const card = cards.get(token.id);
        const change = findPending(token);
        if (card && change?.kind === "card") {
          replacePending(token, {
            ...change,
            expectedUpdatedAt: card.updatedAt,
          });
        }
      }
      reconcile(snapshot());
      const currentTokens = tokens.filter((token) => findPending(token));
      if (currentTokens.length) expire(currentTokens);
      return results;
    } catch (error) {
      for (const token of tokens) removePending(token);
      throw error;
    }
  }

  async function remove(id: string): Promise<void> {
    currentCard(id);
    const token = addPending(id, { kind: "delete", acknowledged: false });

    try {
      await queueCommand([id], () => commands.delete({ id }));
      if (findPending(token)) {
        replacePending(token, { token: token.token, kind: "delete", acknowledged: true });
        reconcile(snapshot());
        if (findPending(token)) expire([token]);
      }
    } catch (error) {
      removePending(token);
      throw error;
    }
  }

  function destroy(): void {
    destroyed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    pending.clear();
  }

  return {
    get stale() {
      return stale;
    },
    effectiveCards,
    reconcile,
    set authoritative(cards: Card[]) {
      reconcile(cards);
    },
    create,
    update,
    updatePositions,
    delete: remove,
    destroy,
  };
}
