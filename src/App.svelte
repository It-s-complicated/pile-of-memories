<script lang="ts">
  import {
    Background,
    BackgroundVariant,
    Controls,
    SvelteFlow,
    type NodeTypes,
    type Viewport,
  } from "@xyflow/svelte";
  import { tick } from "svelte";
  import { z } from "zod";
  import "@xyflow/svelte/dist/style.css";
  import ClickableMiniMap from "./components/ClickableMiniMap.svelte";
  import ClusterRegions from "./components/ClusterRegions.svelte";
  import MemoryListDialog from "./components/MemoryListDialog.svelte";
  import ViewportStart from "./components/ViewportStart.svelte";
  import MemoryNodeComponent from "./components/MemoryNode.svelte";
  import MiniMapMemoryNode from "./components/MiniMapMemoryNode.svelte";
  import CaptureDialog from "./components/CaptureDialog.svelte";
  import type { Card, CardInput } from "./lib/card";
  import { setCardPersistence } from "./lib/card-persistence";
  import {
    createCard,
    deleteCard,
    getLiveCards,
    updateCard,
    updateCardPositions,
  } from "./lib/cards.remote";
  import { DEFAULT_CARD_SIZE, findClusterPosition, reflowClusters } from "./lib/cluster-layout";
  import type { CardCreationProvenance } from "./lib/enrichment-analytics";
  import { canonicalizeLabels, PRIMARY_TAGS, TOPIC_TAGS } from "./lib/labels";
  import { cardToMemoryNode, memoryNodeToCard, type MemoryNode } from "./lib/scene";

  const VIEWPORT_STORAGE_KEY = "pile-of-memories-viewport";
  const storedViewportSchema = z.object({
    cx: z.number(),
    cy: z.number(),
    zoom: z.number().min(0.5).max(1.5),
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
    async update(id, changes) {
      await updateCard({ id, changes });
    },
    async delete(id) {
      await deleteCard({ id });
    },
  });

  let cards = $derived(cardsQuery.current ?? []);
  let tagVocabulary = $derived(
    canonicalizeLabels([
      ...PRIMARY_TAGS,
      ...TOPIC_TAGS,
      ...cards.flatMap((card) => [...card.tags, ...card.topics]),
    ]),
  );
  let nodes = $derived<MemoryNode[]>(
    cards
      .filter((card) => !card.archived)
      .map((card) => cardToMemoryNode(card, tagVocabulary)),
  );
  let archivedCards = $derived(cards.filter((card) => card.archived));
  let viewport = $state<Viewport>({ x: 32, y: 32, zoom: 1 });
  let viewportStart = $state<ViewportController>();
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let captureDialog = $state<CaptureDialog>();
  let boardReady = $derived(cardsQuery.current !== undefined);
  let persistenceError = $state("");
  let archiveOpen = $state(false);
  let listOpen = $state(false);
  let archiveError = $state("");
  let archiveBusyId = $state("");
  let reorganizeSnapshot = $state.raw<MemoryNode[] | null>(null);
  let reorganizeViewport = $state<Viewport>();
  let reorganizeSaving = $state(false);
  let reorganizeStatus = $state("");

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "The board could not be saved.";
  }

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
    archiveBusyId = id;
    archiveError = "";
    try {
      await updateCard({ id, changes: { archived: false } });
    } catch (error) {
      archiveError = getErrorMessage(error);
    } finally {
      archiveBusyId = "";
    }
  }

  async function deleteArchived(id: string, title: string): Promise<void> {
    if (!confirm(`Permanently delete “${title}”? This cannot be undone.`)) return;

    archiveBusyId = id;
    archiveError = "";
    try {
      await deleteCard({ id });
    } catch (error) {
      archiveError = getErrorMessage(error);
    } finally {
      archiveBusyId = "";
    }
  }

  function showModal(dialog: HTMLDialogElement) {
    dialog.showModal();
    return () => dialog.close();
  }

  async function addMemory(
    draft: Pick<CardInput, "title" | "body" | "tags" | "topics" | "links">,
    creation?: CardCreationProvenance,
  ): Promise<void> {
    const openSpace = {
      x: (canvasWidth / 2 - viewport.x) / viewport.zoom - DEFAULT_CARD_SIZE.width / 2,
      y: (canvasHeight / 2 - viewport.y) / viewport.zoom - DEFAULT_CARD_SIZE.height / 2,
    };
    const position = findClusterPosition(nodes, draft, openSpace);
    const timestamp = new Date().toISOString();
    const node: MemoryNode = {
      id: crypto.randomUUID(),
      type: "memory",
      position,
      data: {
        ...draft,
        createdAt: timestamp,
        updatedAt: timestamp,
        tagVocabulary,
      },
      focusable: true,
    };

    await createCard({
      card: memoryNodeToCard(node),
      ...(creation ? { creation } : {}),
    }).updates(cardsQuery);
    viewportStart?.center(
      position.x + DEFAULT_CARD_SIZE.width / 2,
      position.y + DEFAULT_CARD_SIZE.height / 2,
    );
  }

  async function saveMovedCards({ nodes: movedNodes }: { nodes: MemoryNode[] }) {
    persistenceError = "";
    reorganizeStatus = "";
    try {
      await updateCardPositions({
        positions: movedNodes.map(({ id, position }) => ({ id, position })),
      });
    } catch (error) {
      persistenceError = getErrorMessage(error);
      void cardsQuery.reconnect();
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
      reorganizeStatus = "The board is already organized by category.";
      return;
    }

    reorganizeSnapshot = nodes.map((node) => ({ ...node, position: { ...node.position } }));
    reorganizeViewport = { ...viewport };
    nodes = preview;
    reorganizeStatus = "Previewing category groups. Apply or cancel.";
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

    const previousNodes = reorganizeSnapshot;
    const previousPositions = new Map(previousNodes.map(({ id, position }) => [id, position]));
    const positions = nodes.flatMap(({ id, position }) => {
      const previous = previousPositions.get(id);
      return previous?.x === position.x && previous.y === position.y ? [] : [{ id, position }];
    });

    reorganizeSaving = true;
    persistenceError = "";
    try {
      await updateCardPositions({ positions });
      reorganizeSnapshot = null;
      reorganizeViewport = undefined;
      reorganizeStatus = "";
      saveViewport(undefined, viewport);
    } catch (error) {
      const previousViewport = reorganizeViewport;
      nodes = previousNodes;
      reorganizeSnapshot = null;
      reorganizeViewport = undefined;
      reorganizeStatus = "";
      persistenceError = getErrorMessage(error);
      await tick();
      if (previousViewport) await viewportStart?.restore(previousViewport);
      void cardsQuery.reconnect();
    } finally {
      reorganizeSaving = false;
    }
  }
</script>

<main
  class="canvas"
  aria-label="Memory board"
  bind:clientWidth={canvasWidth}
  bind:clientHeight={canvasHeight}
>
  <SvelteFlow
    bind:nodes
    bind:viewport
    {nodeTypes}
    minZoom={0.5}
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
    <Background variant={BackgroundVariant.Lines} gap={56} patternColor="var(--hairline)" />
    <ClusterRegions />
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

  <div class="capture-cluster">
    <button
      type="button"
      class="chip-button mode-button"
      aria-pressed={browseMode}
      title={browseMode
        ? "Browse: drag anywhere to pan. Switch to Arrange to move cards."
        : "Arrange: drag cards to move them. Switch to Browse to pan over cards."}
      onclick={toggleBrowseMode}
      disabled={!!reorganizeSnapshot}
    >{browseMode ? "Browse" : "Arrange"}</button>
    {#if reorganizeSnapshot}
      <button
        type="button"
        class="chip-button"
        onclick={cancelReorganization}
        disabled={reorganizeSaving}
      >Cancel</button>
      <button
        type="button"
        class="chip-button"
        onclick={applyReorganization}
        disabled={reorganizeSaving}
      >{reorganizeSaving ? "Saving…" : "Apply layout"}</button>
    {:else}
      <button type="button" class="chip-button" onclick={() => (listOpen = true)} disabled={!boardReady}>
        List
      </button>
      <button type="button" class="chip-button" onclick={openArchive} disabled={!boardReady}>
        Archive · {archivedCards.length}
      </button>
      <button
        type="button"
        class="chip-button"
        onclick={previewReorganization}
        disabled={!boardReady || nodes.length === 0}
      >
        Reorganize
      </button>
    {/if}
    <button
      type="button"
      class="fab"
      aria-label="New memory"
      title="New memory"
      onclick={() => {
        persistenceError = "";
        captureDialog?.open();
      }}
      disabled={!boardReady || !!reorganizeSnapshot}
    >+</button>
  </div>

  {#if persistenceError}
    <p class="status-pill" role="alert">{persistenceError}</p>
  {:else if reorganizeStatus}
    <p class="status-pill" role="status">{reorganizeStatus}</p>
  {:else if cardsQuery.error && !boardReady}
    <p class="status-pill" role="alert">Database unavailable</p>
  {:else if !boardReady}
    <p class="status-pill" role="status">Loading board…</p>
  {:else if !cardsQuery.connected}
    <p class="status-pill" role="status">
      Live updates paused.
      <button type="button" onclick={() => cardsQuery.reconnect()}>Reconnect</button>
    </p>
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
    cards={cards.filter((card) => !card.archived)}
    onclose={() => (listOpen = false)}
    onlocate={locateMemory}
  />
{/if}

<CaptureDialog bind:this={captureDialog} {tagVocabulary} oncreate={addMemory} />

{#if archiveOpen}
  <dialog
    class="memory-dialog archive-dialog"
    aria-labelledby="archive-title"
    onclose={() => (archiveOpen = false)}
    {@attach showModal}
  >
    <form method="dialog">
      <header>
        <p>Archive</p>
        <h2 id="archive-title">Archived memories</h2>
      </header>

      {#if archivedCards.length}
        <ul class="archive-list">
          {#each archivedCards as card (card.id)}
            <li>
              <strong>{card.title}</strong>
              <div>
                <button
                  type="button"
                  class="secondary-button"
                  disabled={archiveBusyId !== ""}
                  onclick={() => restoreArchived(card.id)}
                >Restore</button>
                <button
                  type="button"
                  class="danger-button"
                  disabled={archiveBusyId !== ""}
                  onclick={() => deleteArchived(card.id, card.title)}
                >Delete permanently</button>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p>No archived memories.</p>
      {/if}
      {#if archiveError}<p role="alert">{archiveError}</p>{/if}
      <footer>
        <button type="submit" class="card-button">Done</button>
      </footer>
    </form>
  </dialog>
{/if}

<style>
  .canvas {
    position: relative;
    height: 100dvh;
  }

  .empty-hint {
    display: grid;
    gap: 0.4rem;
  }
</style>
