import { createContext, tick, untrack } from "svelte";
import { useLiveQuery } from "@tanstack/svelte-db";
import type { Viewport } from "@xyflow/svelte";
import type { RemoteFormEnhanceInstance } from "$app/server";
import { page } from "$app/state";
import * as z from "zod";
import type {
  Card,
  CardChanges,
  CardInput,
  CreateCardFormInput,
  UpdateCardFormInput,
} from "./card";
import { createCardCollection, openCardCache } from "./card-collection";
import { setCardPersistence } from "./card-persistence";
import { deleteCard, getLiveCards, updateCard, updateCardPositions } from "./cards.remote";
import { openCapture, closeCapture } from "./capture-navigation";
import { DEFAULT_CARD_SIZE, findClusterPosition, reflowClusters } from "./cluster-layout";
import { getErrorMessage } from "./errors";
import { getLiveLabels } from "./labels.remote";
import { cardToMemoryNode, type MemoryNode } from "./scene";

export const MIN_ZOOM = 0.1;
// SvelteKit ends a live stream cleanly (rather than erroring) when the server stops or a proxy
// closes the connection, and does not restart it. Retry on a short backoff so a restart does not
// leave the board permanently paused.
const RECONNECT_DELAY_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 60_000;
const VIEWPORT_STORAGE_KEY = "pile-of-memories-viewport";
const MODE_STORAGE_KEY = "pile-of-memories-mode";
const storedViewportSchema = z.object({
  cx: z.number(),
  cy: z.number(),
  zoom: z.number().min(MIN_ZOOM).max(1.5),
});
type StoredViewport = z.infer<typeof storedViewportSchema>;
type CardCache = Awaited<ReturnType<typeof createCardCollection>>;
type ViewportController = {
  center(x: number, y: number): void;
  fit(): Promise<void>;
  restore(viewport: Viewport): Promise<void>;
};

// Store the world-space center so resizing does not change the restored location.
function getStoredViewport(): StoredViewport | null {
  try {
    const parsed = storedViewportSchema.safeParse(
      JSON.parse(localStorage.getItem(VIEWPORT_STORAGE_KEY) ?? ""),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function initialBrowseMode(): boolean {
  try {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "browse" || saved === "arrange") return saved === "browse";
  } catch {
    // Storage can be unavailable in private browsing.
  }
  return window.matchMedia("(pointer: coarse)").matches;
}

export type BoardControls = {
  readonly browseMode: boolean;
  readonly archivedCount: number;
  readonly canOpenMemories: boolean;
  readonly canEditBoard: boolean;
  readonly canReorganize: boolean;
  readonly savingLayout: boolean;
  openList(): void;
  openArchive(): void;
  openLabels(): void;
  toggleBrowseMode(): void;
  previewLayout(): Promise<void>;
  cancelLayout(): Promise<void>;
  applyLayout(): Promise<void>;
};

export const [getBoardControls, setBoardControls] = createContext<BoardControls>();

export class BoardState implements BoardControls {
  readonly cardsQuery = getLiveCards();
  readonly labelsQuery = getLiveLabels();
  readonly storedViewport = getStoredViewport();
  #userId: string;
  #cache = $state.raw<CardCache>();
  #stopped = false;
  #reconnectAttempt = 0;
  #reconnectSnapshots:
    | [typeof this.cardsQuery.current, typeof this.labelsQuery.current]
    | undefined;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #closeCache: (() => Promise<void>) | undefined;
  #opening: Promise<void> = Promise.resolve();
  #cacheToClear: CardCache | undefined;
  #localCards = useLiveQuery((q) =>
    this.#cache ? q.from({ card: this.#cache.collection }) : undefined,
  );
  #cards = $derived(this.#localCards.data ?? []);
  #reorganizeSnapshot = $state.raw<MemoryNode[] | null>(null);
  #reorganizeViewport = $state<Viewport>();

  browseMode = $state(initialBrowseMode());
  cacheWarning = $state("");
  reconnecting = $state(false);
  vocabulary = $derived(this.labelsQuery.current ?? []);
  labelsReady = $derived(this.labelsQuery.ready);
  activeCards = $derived(this.#cards.filter((card) => !card.archived));
  archivedCards = $derived(this.#cards.filter((card) => card.archived));
  nodes = $derived<MemoryNode[]>(this.activeCards.map(cardToMemoryNode));
  viewport = $state<Viewport>({ x: 32, y: 32, zoom: 1 });
  viewportController = $state<ViewportController>();
  canvasWidth = $state(0);
  canvasHeight = $state(0);
  captureOpen = $derived(
    (page.shallow?.url ?? page.url).searchParams.get("action") === "new-memory",
  );
  boardReady = $derived(
    this.#localCards.isReady && (this.#cards.length > 0 || this.cardsQuery.ready),
  );
  captureReady = $derived(this.boardReady && this.cardsQuery.ready && this.labelsReady);
  persistenceError = $state("");
  archiveOpen = $state(false);
  listOpen = $state(false);
  labelsOpen = $state(false);
  archiveError = $state("");
  archiveBusy = $derived(updateCard.pending > 0 || deleteCard.pending > 0);
  savingLayout = $derived(updateCardPositions.pending > 0);
  reorganizeStatus = $state("");
  previewingLayout = $derived(!!this.#reorganizeSnapshot);
  archivedCount = $derived(this.archivedCards.length);
  canOpenMemories = $derived(this.boardReady && !this.previewingLayout);
  canEditBoard = $derived(!this.previewingLayout);
  canReorganize = $derived(this.boardReady && this.nodes.length > 0 && !this.previewingLayout);

  constructor(userId: string) {
    this.#userId = userId;
  }

  mount = (): (() => void) => {
    this.#opening = (async () => {
      try {
        const cache = await openCardCache(this.#userId);
        this.#cacheToClear = cache;
        this.#closeCache = () => cache.close();
        if (!this.#stopped) this.#cache = cache;
      } catch {
        if (this.#stopped) return;
        this.cacheWarning = "Local storage unavailable. Changes still save to the server.";
        const memory = await createCardCollection();
        this.#cacheToClear = memory;
        this.#closeCache = () => memory.collection.cleanup();
        if (!this.#stopped) this.#cache = memory;
      }
    })();
    return () => {
      this.#stopped = true;
      this.#cancelReconnect();
      void this.#opening.then(() => this.#closeCache?.()).catch(console.error);
    };
  };

  private async cacheResult(write: Promise<void> | undefined): Promise<void> {
    try {
      await write;
    } catch {
      this.cacheWarning = "Could not update the local cache. Server saves are unaffected.";
    }
  }

  syncCards = (): void => {
    const snapshot = this.cardsQuery.current;
    const target = this.#cache;
    if (snapshot && target && !this.#stopped) {
      untrack(() => void this.cacheResult(target.replace(snapshot)));
    }
  };

  clearCache = async (): Promise<void> => {
    this.#stopped = true;
    this.#cancelReconnect();
    await this.#opening;
    await this.#cacheToClear?.replace([]);
  };

  private requireOnline(): void {
    if (this.#stopped) throw new Error("The board is closed. Sign in again to save changes.");
    if (!navigator.onLine) throw new Error("Connect to the internet to save changes.");
  }

  saveCard = async (id: string, changes: CardChanges): Promise<void> => {
    this.requireOnline();
    const card = await updateCard({ id, changes });
    if (!this.#stopped) await this.cacheResult(this.#cache?.upsert([card]));
  };

  submitCard = async (
    form: RemoteFormEnhanceInstance<UpdateCardFormInput, Card>,
  ): Promise<boolean> => {
    this.requireOnline();
    // LISTEN/NOTIFY handles live updates; use the returned card for the local cache.
    if (!(await form.submit().updates())) return false;
    if (!this.#stopped && form.result) await this.cacheResult(this.#cache?.upsert([form.result]));
    return true;
  };

  removeCard = async (id: string): Promise<void> => {
    this.requireOnline();
    await deleteCard({ id });
    if (!this.#stopped) await this.cacheResult(this.#cache?.remove(id));
  };

  private async savePositions(
    positions: Parameters<typeof updateCardPositions>[0]["positions"],
  ): Promise<void> {
    this.requireOnline();
    const cards = await updateCardPositions({ positions });
    if (!this.#stopped) await this.cacheResult(this.#cache?.upsert(cards));
  }

  toggleBrowseMode = (): void => {
    this.browseMode = !this.browseMode;
    try {
      localStorage.setItem(MODE_STORAGE_KEY, this.browseMode ? "browse" : "arrange");
    } catch {
      // The mode still works for this visit.
    }
  };

  openList = (): void => {
    this.listOpen = true;
  };
  closeList = (): void => {
    this.listOpen = false;
  };
  openLabels = (): void => {
    this.labelsOpen = true;
  };
  closeLabels = (): void => {
    this.labelsOpen = false;
  };
  openArchive = (): void => {
    this.archiveError = "";
    this.archiveOpen = true;
  };
  closeArchive = (): void => {
    this.archiveOpen = false;
  };
  openCapture = (): void => {
    this.persistenceError = "";
    void openCapture();
  };
  closeCapture = closeCapture;
  reconnectLabels = (): Promise<void> => this.labelsQuery.reconnect().catch(() => {});

  #reconnectQueries = (): Promise<PromiseSettledResult<void>[]> => {
    this.#reconnectSnapshots = [this.cardsQuery.current, this.labelsQuery.current];
    return Promise.allSettled([this.cardsQuery.reconnect(), this.labelsQuery.reconnect()]);
  };

  #cancelReconnect = (): void => {
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
  };

  #scheduleReconnect = (): void => {
    if (this.#stopped || this.#reconnectTimer !== undefined) return;
    // Hide the paused notice on the first attempt; a later retry keeps it visible.
    this.reconnecting = this.#reconnectAttempt === 0;
    const delay = Math.min(
      RECONNECT_DELAY_MS * 2 ** this.#reconnectAttempt,
      RECONNECT_MAX_DELAY_MS,
    );
    this.#reconnectTimer = setTimeout(() => void this.#reclaimStreams(), delay);
  };

  async #reclaimStreams(): Promise<void> {
    this.#reconnectTimer = undefined;
    if (this.#stopped) return;
    this.#reconnectAttempt += 1;
    const results = await this.#reconnectQueries();
    if (this.#stopped) return;
    this.reconnecting = false;
    if (results.some(({ status }) => status === "rejected")) this.#scheduleReconnect();
  }

  /** Restarts SvelteKit's live streams after a clean end, such as a server restart. */
  keepLiveUpdatesFlowing = (): void => {
    const cards = this.cardsQuery.current;
    const labels = this.labelsQuery.current;
    const done = this.cardsQuery.done || this.labelsQuery.done;
    // A successful reconnect() only means the response body opened. Even ready stays
    // true for stale data, so wait for fresh snapshots from both streams before resetting.
    if (
      !done &&
      this.#reconnectSnapshots &&
      cards !== this.#reconnectSnapshots[0] &&
      labels !== this.#reconnectSnapshots[1] &&
      !this.cardsQuery.error &&
      !this.labelsQuery.error
    ) {
      this.#cancelReconnect();
      this.#reconnectAttempt = 0;
      this.#reconnectSnapshots = undefined;
      this.reconnecting = false;
    }
    // Snapshot reruns must not cancel the board's pending retry.
    if (done) this.#scheduleReconnect();
  };

  reconnect = async (): Promise<void> => {
    this.#cancelReconnect();
    this.#reconnectAttempt = 1;
    this.reconnecting = true;
    const results = await this.#reconnectQueries();
    if (this.#stopped) return;
    this.reconnecting = false;
    if (results.every(({ status }) => status === "fulfilled")) return;
    this.#reconnectAttempt = 1;
    this.#scheduleReconnect();
  };

  locateMemory = (card: Card): void => {
    this.listOpen = false;
    this.viewportController?.center(
      card.position.x + DEFAULT_CARD_SIZE.width / 2,
      card.position.y + DEFAULT_CARD_SIZE.height / 2,
    );
  };

  restoreArchived = async (id: string): Promise<void> => {
    this.archiveError = "";
    try {
      await this.saveCard(id, { archived: false });
    } catch (error) {
      this.archiveError = getErrorMessage(error);
    }
  };

  deleteArchived = async (id: string, title: string): Promise<void> => {
    if (!confirm(`Permanently delete “${title}”? This cannot be undone.`)) return;
    this.archiveError = "";
    try {
      await this.removeCard(id);
    } catch (error) {
      this.archiveError = getErrorMessage(error);
    }
  };

  getCapturePosition = (draft: Pick<CardInput, "tags" | "topics">): CardInput["position"] => {
    const openSpace = {
      x:
        (this.canvasWidth / 2 - this.viewport.x) / this.viewport.zoom - DEFAULT_CARD_SIZE.width / 2,
      y:
        (this.canvasHeight / 2 - this.viewport.y) / this.viewport.zoom -
        DEFAULT_CARD_SIZE.height / 2,
    };
    return findClusterPosition(this.nodes, draft, openSpace);
  };

  addMemory = async (
    form: RemoteFormEnhanceInstance<CreateCardFormInput, Card>,
  ): Promise<boolean> => {
    this.requireOnline();
    if (!this.boardReady || !this.cardsQuery.ready)
      throw new Error("The board is still loading. Please try again shortly.");
    if (!(await form.submit().updates()) || !form.result) return false;
    const saved = form.result;
    if (!this.#stopped) await this.cacheResult(this.#cache?.upsert([saved]));
    this.viewportController?.center(
      saved.position.x + DEFAULT_CARD_SIZE.width / 2,
      saved.position.y + DEFAULT_CARD_SIZE.height / 2,
    );
    await tick();
    // Include the confirmed card even if the local cache could not be updated.
    if (!this.nodes.some(({ id }) => id === saved.id)) {
      this.nodes = [...this.nodes, cardToMemoryNode(saved)];
      await tick();
    }
    await this.previewLayout();
    return true;
  };

  saveMovedCards = async ({ nodes: movedNodes }: { nodes: MemoryNode[] }): Promise<void> => {
    this.persistenceError = "";
    this.reorganizeStatus = "";
    try {
      await this.savePositions(movedNodes.map(({ id, position }) => ({ id, position })));
    } catch (error) {
      this.persistenceError = getErrorMessage(error);
      this.nodes = this.activeCards.map(cardToMemoryNode);
      void this.cardsQuery.reconnect().catch(() => {});
    }
  };

  previewLayout = async (): Promise<void> => {
    this.persistenceError = "";
    const preview = reflowClusters(this.nodes);
    const currentPositions = new Map(this.nodes.map(({ id, position }) => [id, position]));
    if (
      preview.every(({ id, position }) => {
        const current = currentPositions.get(id);
        return current?.x === position.x && current.y === position.y;
      })
    ) {
      this.reorganizeStatus = "The board is already organized by similarity.";
      return;
    }
    this.#reorganizeSnapshot = this.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
    }));
    this.#reorganizeViewport = { ...this.viewport };
    this.nodes = preview;
    this.reorganizeStatus = "Previewing related memories. Apply or cancel.";
    await tick();
    await this.viewportController?.fit();
  };

  cancelLayout = async (): Promise<void> => {
    if (!this.#reorganizeSnapshot) return;
    const previousViewport = this.#reorganizeViewport;
    this.nodes = this.#reorganizeSnapshot;
    this.#reorganizeSnapshot = null;
    this.#reorganizeViewport = undefined;
    this.reorganizeStatus = "";
    await tick();
    if (previousViewport) await this.viewportController?.restore(previousViewport);
  };

  applyLayout = async (): Promise<void> => {
    if (!this.#reorganizeSnapshot) return;
    const previousPositions = new Map(
      this.#reorganizeSnapshot.map(({ id, position }) => [id, position]),
    );
    const positions = this.nodes.flatMap(({ id, position }) => {
      const previous = previousPositions.get(id);
      return previous?.x === position.x && previous.y === position.y ? [] : [{ id, position }];
    });
    this.persistenceError = "";
    try {
      await this.savePositions(positions);
      this.#reorganizeSnapshot = null;
      this.#reorganizeViewport = undefined;
      this.reorganizeStatus = "";
      this.saveViewport(undefined, this.viewport);
    } catch (error) {
      this.persistenceError = getErrorMessage(error);
      await this.cancelLayout();
      this.nodes = this.activeCards.map(cardToMemoryNode);
      void this.cardsQuery.reconnect().catch(() => {});
    }
  };

  saveViewport = (_event: unknown, nextViewport: Viewport): void => {
    if (this.previewingLayout) return;
    const stored = {
      cx: (this.canvasWidth / 2 - nextViewport.x) / nextViewport.zoom,
      cy: (this.canvasHeight / 2 - nextViewport.y) / nextViewport.zoom,
      zoom: nextViewport.zoom,
    };
    localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(stored));
  };
}

export function createBoardControls(userId: string): BoardState {
  const board = new BoardState(userId);
  setBoardControls(board);
  setCardPersistence({
    browse: () => board.browseMode,
    save: board.submitCard,
    update: board.saveCard,
    delete: board.removeCard,
  });
  return board;
}
