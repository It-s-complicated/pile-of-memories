<script lang="ts">
  import {
    Background,
    BackgroundVariant,
    Controls,
    SvelteFlow,
    type NodeTypes,
  } from "@xyflow/svelte";
  import { onMount, untrack } from "svelte";
  import "@xyflow/svelte/dist/style.css";
  import { createBoardControls, MIN_ZOOM } from "./lib/board-controls.svelte.js";
  import ClusterLabels from "./components/ClusterLabels.svelte";
  import ClickableMiniMap from "./components/ClickableMiniMap.svelte";
  import MemoryListDialog from "./components/MemoryListDialog.svelte";
  import ViewportStart from "./components/ViewportStart.svelte";
  import MemoryNodeComponent from "./components/MemoryNode.svelte";
  import MiniMapMemoryNode from "./components/MiniMapMemoryNode.svelte";
  import CaptureDialog from "./components/CaptureDialog.svelte";
  import LabelsDialog from "./components/LabelsDialog.svelte";
  import BoardTools from "./components/BoardTools.svelte";
  import CaptureButton from "./components/CaptureButton.svelte";
  import LayoutReview from "./components/LayoutReview.svelte";
  import BoardNotice from "./components/BoardNotice.svelte";
  import ArchiveDialog from "./components/ArchiveDialog.svelte";
  import ExploreDialog from "./components/ExploreDialog.svelte";
  import LinkedMemoryReader from "./components/LinkedMemoryReader.svelte";

  let { userId }: { userId: string } = $props();
  // The page keys this component by user, giving each account its own board model.
  const board = createBoardControls(untrack(() => userId));
  const nodeTypes = { memory: MemoryNodeComponent } satisfies NodeTypes;
  onMount(board.mount);
  // Reclaim live streams that SvelteKit ended cleanly, for example after a server restart.
  $effect(() => board.keepLiveUpdatesFlowing());

  export async function clearCache(): Promise<void> {
    await board.clearCache();
  }
</script>

<main
  class="canvas"
  aria-label="Memory board"
  {@attach board.syncCards}
  bind:clientWidth={board.canvasWidth}
  bind:clientHeight={board.canvasHeight}
>
  <SvelteFlow
    bind:nodes={board.nodes}
    bind:viewport={board.viewport}
    {nodeTypes}
    minZoom={MIN_ZOOM}
    maxZoom={1.5}
    nodesDraggable={board.boardReady && !board.browseMode && !board.previewingLayout}
    elementsSelectable={!board.browseMode && !board.previewingLayout}
    panOnDrag={true}
    deleteKey={[]}
    onnodedragstop={board.saveMovedCards}
    onmoveend={board.saveViewport}
  >
    {#if board.boardReady}
      <ViewportStart bind:this={board.viewportController} stored={board.storedViewport} />
    {/if}
    <ClusterLabels nodes={board.nodes} />
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
    {#if board.boardReady}
      <p>
        {board.nodes.length}
        {board.nodes.length === 1 ? "memory" : "memories"} · {board.archivedCount} archived
      </p>
    {/if}
  </div>

  <BoardTools />

  {#if board.previewingLayout}
    <LayoutReview />
  {/if}

  <CaptureButton disabled={board.previewingLayout} onclick={board.openCapture} />

  {#if board.persistenceError}
    <BoardNotice message={board.persistenceError} role="alert" />
  {:else if board.reorganizeStatus}
    <BoardNotice message={board.reorganizeStatus} />
  {:else if board.cardsQuery.error && !board.boardReady}
    <BoardNotice message="Database unavailable" role="alert" />
  {:else if !board.boardReady}
    <BoardNotice message="Loading board…" />
  {:else if board.labelsQuery.error}
    <BoardNotice
      message="Tags and topics unavailable."
      role="alert"
      onreconnect={board.reconnectLabels}
    />
  {:else if board.cacheWarning}
    <BoardNotice message={board.cacheWarning} />
  {:else if !board.reconnecting && (!board.cardsQuery.connected || !board.labelsQuery.connected)}
    <BoardNotice message="Live updates paused." onreconnect={board.reconnect} />
  {/if}

  {#if board.boardReady && board.nodes.length === 0}
    <div class="empty-hint">
      <span class="label">The drawer is empty</span>
      <span class="label">Catalog your first memory with the + button</span>
    </div>
  {/if}
</main>

{#if board.listOpen}
  <MemoryListDialog
    cards={board.activeCards}
    onclose={board.closeList}
    onlocate={board.locateMemory}
  />
{/if}

{#if board.captureOpen}
  <CaptureDialog
    initialDraft={board.captureDraft}
    vocabulary={board.vocabulary}
    labelsReady={board.labelsReady}
    boardReady={board.captureReady}
    oncreate={board.addMemory}
    getPosition={board.getCapturePosition}
    onclose={board.closeCapture}
  />
{/if}

{#if board.explorationSeedId}
  <ExploreDialog
    active={!board.captureOpen && !board.previewingLayout}
    seedId={board.explorationSeedId}
    cards={board.activeCards}
    onclose={board.closeExploration}
    onsave={board.captureIdea}
  />
{/if}

{#if board.labelsOpen}
  <LabelsDialog
    labels={board.vocabulary}
    ready={board.labelsReady}
    loadError={!!board.labelsQuery.error}
    connected={board.labelsQuery.connected}
    onreconnect={board.reconnectLabels}
    onclose={board.closeLabels}
  />
{/if}

{#if board.archiveOpen}
  <ArchiveDialog
    cards={board.archivedCards}
    busy={board.archiveBusy}
    error={board.archiveError}
    onrestore={board.restoreArchived}
    ondelete={board.deleteArchived}
    onclose={board.closeArchive}
  />
{/if}

<LinkedMemoryReader
  cards={[...board.activeCards, ...board.archivedCards]}
  ready={board.cardsQuery.ready}
  loadError={!!board.cardsQuery.error}
  canExplore={board.canOpenMemories}
  onexplore={board.openExploration}
/>

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
