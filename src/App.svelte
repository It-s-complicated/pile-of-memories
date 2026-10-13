<script lang="ts">
  import {
    Background,
    BackgroundVariant,
    Controls,
    SvelteFlow,
    type NodeTypes,
    type Viewport,
  } from "@xyflow/svelte";
  import { onMount, tick, untrack } from "svelte";
  import { useLiveQuery } from "@tanstack/svelte-db";
  import { createCardCollection, openCardCache } from "./lib/card-collection";
  import { page } from "$app/state";
  import { openCapture, closeCapture } from "./lib/capture-navigation";
  import * as z from "zod";
  import "@xyflow/svelte/dist/style.css";
  import ClusterLabels from "./components/ClusterLabels.svelte";
  import ClickableMiniMap from "./components/ClickableMiniMap.svelte";
  import MemoryListDialog from "./components/MemoryListDialog.svelte";
  import ViewportStart from "./components/ViewportStart.svelte";
  import MemoryNodeComponent from "./components/MemoryNode.svelte";
  import MiniMapMemoryNode from "./components/MiniMapMemoryNode.svelte";
  import CaptureDialog from "./components/CaptureDialog.svelte";
  import LabelsDialog from "./components/LabelsDialog.svelte";
  import type { RemoteFormEnhanceInstance } from "$app/server";
  import type { Card, CardInput, CreateCardFormInput, UpdateCardFormInput } from "./lib/card";
  import { setCardPersistence } from "./lib/card-persistence";
  import {
    deleteCard,
    getLiveCards,
    updateCard,
    updateCardPositions,
  } from "./lib/cards.remote";
  import { DEFAULT_CARD_SIZE, findClusterPosition, reflowClusters } from "./lib/cluster-layout";
  import { getLiveLabels } from "./lib/labels.remote";
  import { cardToMemoryNode, type MemoryNode } from "./lib/scene";
  import { getErrorMessage } from "./lib/errors";
  import BoardTools from "./components/BoardTools.svelte";
  import CaptureButton from "./components/CaptureButton.svelte";
  import LayoutReview from "./components/LayoutReview.svelte";
  import BoardNotice from "./components/BoardNotice.svelte";
  import ArchiveDialog from "./components/ArchiveDialog.svelte";

  let { userId, onsignout, signingOut }: {
    userId: string;
    onsignout: () => Promise<void>;
    signingOut: boolean;
  } = $props();

  const MIN_ZOOM = 0.1;
  const VIEWPORT_STORAGE_KEY = "pile-of-memories-viewport";
  const storedViewportSchema = z.object({
    cx: z.number(),
    cy: z.number(),
    zoom: z.number().min(MIN_ZOOM).max(1.5),
  });
  type StoredViewport = z.infer<typeof storedViewportSchema>;
  type ViewportController = {
    center(x: number, y: number): void;
    fit(): Promise<void>;
    restore(viewport: Viewport): Promise<void>;
  };

  // The world-space center is stored (not the raw translate) so the owner
  // returns to the same spot even when the window size has changed.
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

  const storedViewport = getStoredViewport();

  function saveViewport(_event: unknown, nextViewport: Viewport): void {
    if (reorganizeSnapshot) return;
    const stored = {
      cx: (canvasWidth / 2 - nextViewport.x) / nextViewport.zoom,
      cy: (canvasHeight / 2 - nextViewport.y) / nextViewport.zoom,
      zoom: nextViewport.zoom,
    };
    localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(stored));
  }

  const nodeTypes = { memory: MemoryNodeComponent } satisfies NodeTypes;
  const cardsQuery = getLiveCards();
  const labelsQuery = getLiveLabels();
  let board = $state.raw<Awaited<ReturnType<typeof createCardCollection>>>();
  let cacheWarning = $state("");
  let stopped = false;
  let closeCache: (() => Promise<void>) | undefined;
  let opening: Promise<void>;
  let cacheToClear: Awaited<ReturnType<typeof createCardCollection>> | undefined;
  const localCards = useLiveQuery((q) => board ? q.from({ card: board.collection }) : undefined);

  onMount(() => {
    opening = (async () => {
      try {
        const cache = await openCardCache(userId);
        cacheToClear = cache;
        closeCache = () => cache.close();
        if (!stopped) board = cache;
      } catch {
        if (stopped) return;
        cacheWarning = "Local storage unavailable. Changes still save to the server.";
        const memory = await createCardCollection();
        cacheToClear = memory;
        closeCache = () => memory.collection.cleanup();
        if (!stopped) board = memory;
      }
    })();
    return () => {
      stopped = true;
      void opening.then(() => closeCache?.()).catch(console.error);
    };
  });

  async function cacheResult(write: Promise<void> | undefined): Promise<void> {
    try {
      await write;
    } catch {
      cacheWarning = "Could not update the local cache. Server saves are unaffected.";
    }
  }

  function syncCards() {
    const snapshot = cardsQuery.current;
    const target = board;
    if (snapshot && target && !stopped) {
      untrack(() => void cacheResult(target.replace(snapshot)));
    }
  }

  export async function clearCache(): Promise<void> {
    stopped = true;
    await opening;
    await cacheToClear?.replace([]);
  }

  function requireOnline(): void {
    if (stopped) throw new Error("The board is closed. Sign in again to save changes.");
    if (!navigator.onLine) throw new Error("Connect to the internet to save changes.");
  }

  async function saveCard(id: string, changes: Parameters<typeof updateCard>[0]["changes"]) {
    requireOnline();
    const card = await updateCard({ id, changes });
    if (!stopped) await cacheResult(board?.upsert([card]));
  }

  async function submitCard(form: RemoteFormEnhanceInstance<UpdateCardFormInput, Card>): Promise<boolean> {
    requireOnline();
    // LISTEN/NOTIFY handles live updates; use the returned card for the local cache.
    if (!await form.submit().updates()) return false;
    if (!stopped && form.result) await cacheResult(board?.upsert([form.result]));
    return true;
  }

  async function removeCard(id: string) {
    requireOnline();
    await deleteCard({ id });
    if (!stopped) await cacheResult(board?.remove(id));
  }

  async function savePositions(positions: Parameters<typeof updateCardPositions>[0]["positions"]) {
    requireOnline();
    const cards = await updateCardPositions({ positions });
    if (!stopped) await cacheResult(board?.upsert(cards));
  }
  const MODE_STORAGE_KEY = "pile-of-memories-mode";
  function initialBrowseMode(): boolean {
    try {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === "browse" || saved === "arrange") return saved === "browse";
    } catch {
      // Storage can be unavailable in private browsing.
    }
    return window.matchMedia("(pointer: coarse)").matches;
  }
  let browseMode = $state(initialBrowseMode());
  function toggleBrowseMode(): void {
    browseMode = !browseMode;
    try {
      localStorage.setItem(MODE_STORAGE_KEY, browseMode ? "browse" : "arrange");
    } catch {
      // The mode still works for this visit.
    }
  }
  setCardPersistence({
    browse: () => browseMode,
    save: submitCard,
    update: saveCard,
    delete: removeCard,
  });

  let cards = $derived(localCards.data ?? []);
  let vocabulary = $derived(labelsQuery.current ?? []);
  let labelsReady = $derived(labelsQuery.ready);
  let activeCards = $derived(cards.filter((card) => !card.archived));
  let nodes = $derived<MemoryNode[]>(activeCards.map(cardToMemoryNode));
  let archivedCards = $derived(cards.filter((card) => card.archived));
  let viewport = $state<Viewport>({ x: 32, y: 32, zoom: 1 });
  let viewportStart = $state<ViewportController>();
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let captureOpen = $derived(
    (page.shallow?.url ?? page.url).searchParams.get("action") === "new-memory",
  );
  let boardReady = $derived(localCards.isReady && (cards.length > 0 || cardsQuery.ready));
  let persistenceError = $state("");
  let archiveOpen = $state(false);
  let listOpen = $state(false);
  let labelsOpen = $state(false);
  let archiveError = $state("");
  let archiveBusy = $derived(updateCard.pending > 0 || deleteCard.pending > 0);
  let reorganizeSnapshot = $state.raw<MemoryNode[] | null>(null);
  let reorganizeViewport = $state<Viewport>();
  let reorganizeSaving = $derived(updateCardPositions.pending > 0);
  let reorganizeStatus = $state("");

  function openArchive(): void {
    archiveError = "";
    archiveOpen = true;
  }

  function locateMemory(card: Card): void {
    listOpen = false;
    viewportStart?.center(
      card.position.x + DEFAULT_CARD_SIZE.width / 2,
      card.position.y + DEFAULT_CARD_SIZE.height / 2,
    );
  }

  async function restoreArchived(id: string): Promise<void> {
    archiveError = "";
    try {
      await saveCard(id, { archived: false });
    } catch (error) {
      archiveError = getErrorMessage(error);
    }
  }

  async function deleteArchived(id: string, title: string): Promise<void> {
    if (!confirm(`Permanently delete “${title}”? This cannot be undone.`)) return;

    archiveError = "";
    try {
      await removeCard(id);
    } catch (error) {
      archiveError = getErrorMessage(error);
    }
  }

  function getCapturePosition(draft: Pick<CardInput, "tags" | "topics">): CardInput["position"] {
    const openSpace = {
      x: (canvasWidth / 2 - viewport.x) / viewport.zoom - DEFAULT_CARD_SIZE.width / 2,
      y: (canvasHeight / 2 - viewport.y) / viewport.zoom - DEFAULT_CARD_SIZE.height / 2,
    };
    return findClusterPosition(nodes, draft, openSpace);
  }

  async function addMemory(form: RemoteFormEnhanceInstance<CreateCardFormInput, Card>): Promise<boolean> {
    requireOnline();
    if (!boardReady || !cardsQuery.ready) throw new Error("The board is still loading. Please try again shortly.");
    if (!await form.submit().updates() || !form.result) return false;
    const saved = form.result;
    if (!stopped) await cacheResult(board?.upsert([saved]));
    viewportStart?.center(
      saved.position.x + DEFAULT_CARD_SIZE.width / 2,
      saved.position.y + DEFAULT_CARD_SIZE.height / 2,
    );
    await tick();
    // Include the confirmed card even if the local cache could not be updated.
    if (!nodes.some(({ id }) => id === saved.id)) {
      nodes = [...nodes, cardToMemoryNode(saved)];
      await tick();
    }
    await previewReorganization();
    return true;
  }

  async function saveMovedCards({ nodes: movedNodes }: { nodes: MemoryNode[] }) {
    persistenceError = "";
    reorganizeStatus = "";
    try {
      await savePositions(movedNodes.map(({ id, position }) => ({ id, position })));
    } catch (error) {
      persistenceError = getErrorMessage(error);
      nodes = activeCards.map(cardToMemoryNode);
      void cardsQuery.reconnect().catch(() => {});
    }
  }

  async function previewReorganization(): Promise<void> {
    persistenceError = "";
    const preview = reflowClusters(nodes);
    const currentPositions = new Map(nodes.map(({ id, position }) => [id, position]));
    if (
      preview.every(({ id, position }) => {
        const current = currentPositions.get(id);
        return current?.x === position.x && current.y === position.y;
      })
    ) {
      reorganizeStatus = "The board is already organized by similarity.";
      return;
    }

    reorganizeSnapshot = nodes.map((node) => ({ ...node, position: { ...node.position } }));
    reorganizeViewport = { ...viewport };
    nodes = preview;
    reorganizeStatus = "Previewing related memories. Apply or cancel.";
    await tick();
    await viewportStart?.fit();
  }

  async function cancelReorganization(): Promise<void> {
    if (!reorganizeSnapshot) return;
    const previousViewport = reorganizeViewport;
    nodes = reorganizeSnapshot;
    reorganizeSnapshot = null;
    reorganizeViewport = undefined;
    reorganizeStatus = "";
    await tick();
    if (previousViewport) await viewportStart?.restore(previousViewport);
  }

  async function applyReorganization(): Promise<void> {
    if (!reorganizeSnapshot) return;

    const previousPositions = new Map(reorganizeSnapshot.map(({ id, position }) => [id, position]));
    const positions = nodes.flatMap(({ id, position }) => {
      const previous = previousPositions.get(id);
      return previous?.x === position.x && previous.y === position.y ? [] : [{ id, position }];
    });

    persistenceError = "";
    try {
      await savePositions(positions);
      reorganizeSnapshot = null;
      reorganizeViewport = undefined;
      reorganizeStatus = "";
      saveViewport(undefined, viewport);
    } catch (error) {
      persistenceError = getErrorMessage(error);
      await cancelReorganization();
      nodes = activeCards.map(cardToMemoryNode);
      void cardsQuery.reconnect().catch(() => {});
    }
  }
</script>

<main
  class="canvas"
  aria-label="Memory board"
  {@attach syncCards}
  bind:clientWidth={canvasWidth}
  bind:clientHeight={canvasHeight}
>
  <SvelteFlow
    bind:nodes
    bind:viewport
    {nodeTypes}
    minZoom={MIN_ZOOM}
    maxZoom={1.5}
    nodesDraggable={boardReady && !browseMode && !reorganizeSnapshot}
    elementsSelectable={!browseMode && !reorganizeSnapshot}
    panOnDrag={true}
    deleteKey={[]}
    onnodedragstop={saveMovedCards}
    onmoveend={saveViewport}
  >
    {#if boardReady}
      <ViewportStart bind:this={viewportStart} stored={storedViewport} />
    {/if}
    <ClusterLabels {nodes} />
    <Background variant={BackgroundVariant.Lines} gap={56} patternColor="var(--hairline)" />
    <Controls position="top-right" showLock={false} fitViewOptions={{ maxZoom: 1 }} />
    <ClickableMiniMap
      position="bottom-left"
      nodeComponent={MiniMapMemoryNode}
      bgColor="var(--paper)"
      width={220}
      height={160}
    />
  </SvelteFlow>

  <div class="drawer-plate">
    <h1>Pile of Memories</h1>
    {#if boardReady}
      <p>
        {nodes.length}
        {nodes.length === 1 ? "memory" : "memories"} · {archivedCards.length} archived
      </p>
    {/if}
  </div>

  <BoardTools
    ready={boardReady}
    empty={nodes.length === 0}
    previewing={!!reorganizeSnapshot}
    {browseMode}
    archivedCount={archivedCards.length}
    {signingOut}
    onlist={() => (listOpen = true)}
    onarchive={openArchive}
    onlabels={() => (labelsOpen = true)}
    onmodechange={toggleBrowseMode}
    onreorganize={previewReorganization}
    {onsignout}
  />

  {#if reorganizeSnapshot}
    <LayoutReview
      saving={reorganizeSaving}
      oncancel={cancelReorganization}
      onapply={applyReorganization}
    />
  {/if}

  <CaptureButton
    disabled={!!reorganizeSnapshot}
    onclick={() => {
      persistenceError = "";
      void openCapture();
    }}
  />

  {#if persistenceError}
    <BoardNotice message={persistenceError} role="alert" />
  {:else if reorganizeStatus}
    <BoardNotice message={reorganizeStatus} />
  {:else if cardsQuery.error && !boardReady}
    <BoardNotice message="Database unavailable" role="alert" />
  {:else if !boardReady}
    <BoardNotice message="Loading board…" />
  {:else if labelsQuery.error}
    <BoardNotice
      message="Tags and topics unavailable."
      role="alert"
      onreconnect={() => labelsQuery.reconnect()}
    />
  {:else if cacheWarning}
    <BoardNotice message={cacheWarning} />
  {:else if !cardsQuery.connected || !labelsQuery.connected}
    <BoardNotice
      message="Live updates paused."
      onreconnect={() => Promise.allSettled([cardsQuery.reconnect(), labelsQuery.reconnect()])}
    />
  {/if}

  {#if boardReady && nodes.length === 0}
    <div class="empty-hint">
      <span class="label">The drawer is empty</span>
      <span class="label">Catalog your first memory with the + button</span>
    </div>
  {/if}
</main>

{#if listOpen}
  <MemoryListDialog
    cards={activeCards}
    onclose={() => (listOpen = false)}
    onlocate={locateMemory}
  />
{/if}

{#if captureOpen}
  <CaptureDialog {vocabulary} {labelsReady} boardReady={boardReady && cardsQuery.ready && labelsReady} oncreate={addMemory} getPosition={getCapturePosition} onclose={closeCapture} />
{/if}

{#if labelsOpen}
  <LabelsDialog
    labels={vocabulary}
    ready={labelsReady}
    loadError={!!labelsQuery.error}
    connected={labelsQuery.connected}
    onreconnect={() => labelsQuery.reconnect().catch(() => {})}
    onclose={() => (labelsOpen = false)}
  />
{/if}

{#if archiveOpen}
  <ArchiveDialog
    cards={archivedCards}
    busy={archiveBusy}
    error={archiveError}
    onrestore={restoreArchived}
    ondelete={deleteArchived}
    onclose={() => (archiveOpen = false)}
  />
{/if}


<style>
  .canvas {
    position: relative;
    height: 100dvh;
  }

  /* The drawer's inner edge: a fixed hairline frame around the sheet. */
  .canvas::after {
    position: absolute;
    z-index: 4;
    inset: 0.6rem;
    border: 1px solid color-mix(in oklch, var(--theme-ink) 42%, var(--sheet));
    border-radius: 4px;
    pointer-events: none;
    content: "";
  }

  /* --- Floating chrome ------------------------------------------------- */

  .drawer-plate {
    position: absolute;
    z-index: 6;
    top: 0.9rem;
    left: 1rem;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.45rem 0.7rem;
    background: var(--paper);
    box-shadow: var(--shadow-slip);
    pointer-events: none;
  }

  .drawer-plate h1 {
    margin: 0;
    font-family: var(--font-label);
    font-size: 0.78rem;
    font-weight: 400;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text);
  }

  .drawer-plate p {
    margin: 0.25rem 0 0;
    font-family: var(--font-label);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .empty-hint {
    position: absolute;
    display: grid;
    gap: 0.4rem;
    z-index: 5;
    top: 50%;
    left: 50%;
    margin: 0;
    pointer-events: none;
    text-align: center;
    transform: translate(-50%, -50%);
  }
</style>
