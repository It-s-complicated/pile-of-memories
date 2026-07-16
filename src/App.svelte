<script lang="ts">
  import {
    Controls,
    MiniMap,
    SvelteFlow,
    type Node,
    type NodeTypes,
    type Viewport,
  } from "@xyflow/svelte";
  import { useLiveQuery } from "@tanstack/svelte-db";
  import { resolve } from "$app/paths";
  import { SvelteMap } from "svelte/reactivity";
  import "@xyflow/svelte/dist/style.css";
  import MemoryNodeComponent from "./components/MemoryNode.svelte";
  import TagEditor from "./components/TagEditor.svelte";
  import { setCardPersistence } from "./lib/card-persistence";
  import { cardsCollection, deleteCard, insertCard, updateCard } from "./lib/cards-collection";
  import {
    findClusterPosition,
    reflowClusters,
    restorePositions,
    snapshotPositions,
  } from "./lib/cluster-layout";
  import { fallbackTitle, requestEnrichment } from "./lib/enrichment";
  import { canonicalizeLabels, partitionLabels, PRIMARY_TAGS, TOPIC_TAGS } from "./lib/labels";
  import { parseMarkdown } from "./lib/markdown";
  import {
    cardToMemoryNode,
    createDemoBoard,
    getMemoryBackground,
    getTopicBorder,
    memoryNodeToCard,
    type MemoryNode,
  } from "./lib/scene";

  const THEME_STORAGE_KEY = "pile-of-memories-primary-color";
  const THEMES = [
    { label: "Brown", color: "#3f342b" },
    { label: "Teal", color: "#0f766e" },
    { label: "Indigo", color: "#4f46e5" },
    { label: "Berry", color: "#b4235a" },
    { label: "Blue", color: "#2563eb" },
    { label: "Forest", color: "#2f6b4f" },
  ] as const;

  type CachedEnrichment = { title: string; tags: string[]; warning: string };
  type Positions = Record<string, { x: number; y: number }>;

  let { demo = false }: { demo?: boolean } = $props();
  let isDemo = $derived(demo);
  const board = createDemoBoard();
  const nodeTypes = { memory: MemoryNodeComponent } satisfies NodeTypes;
  const cardsQuery = useLiveQuery((query) => query.from({ card: cardsCollection }));
  const enrichmentCache = new SvelteMap<string, CachedEnrichment>();
  setCardPersistence({
    get canManage() {
      return !isDemo;
    },
    async update(id, changes) {
      if (isDemo) return;
      try {
        await updateCard(id, changes);
      } catch (error) {
        persistenceError = getErrorMessage(error);
        throw error;
      }
    },
    async delete(id) {
      if (isDemo) return;
      try {
        await deleteCard(id);
      } catch (error) {
        persistenceError = getErrorMessage(error);
        throw error;
      }
    },
  });

  let primaryColor = $state<string>(getInitialPrimaryColor());
  let tagVocabulary = $derived(
    canonicalizeLabels([
      ...PRIMARY_TAGS,
      ...TOPIC_TAGS,
      ...(cardsQuery.data ?? []).flatMap((card) => [...card.tags, ...card.topics]),
    ]),
  );
  let nodes = $derived<MemoryNode[]>(
    isDemo
      ? board.nodes
      : (cardsQuery.data ?? [])
          .filter((card) => !card.archived)
          .map((card) => cardToMemoryNode(card, tagVocabulary)),
  );
  let archivedCards = $derived((cardsQuery.data ?? []).filter((card) => card.archived));
  let viewport = $state<Viewport>({ x: 32, y: 32, zoom: 1 });
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let newMemoryOpen = $state(false);
  let newMemoryStep = $state<"capture" | "review">("capture");
  let memoryTitle = $state("");
  let memoryBody = $state("");
  let memoryLabels = $state<string[]>([]);
  let enrichmentWarning = $state("");
  let enrichingMemory = $state(false);
  let boardReady = $derived(isDemo || cardsQuery.isReady);
  let savingMemory = $state(false);
  let persistenceError = $state("");
  let reflowSnapshot = $state.raw<Positions | null>(null);
  let archiveOpen = $state(false);
  let archiveError = $state("");
  let archiveBusyId = $state("");

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "The board could not be saved.";
  }

  function getInitialPrimaryColor(): string {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.find(({ color }) => color === stored)?.color ?? THEMES[0].color;
  }

  function selectTheme(event: Event & { currentTarget: HTMLSelectElement }): void {
    primaryColor = event.currentTarget.value;
    localStorage.setItem(THEME_STORAGE_KEY, primaryColor);
  }

  function getMiniMapFill(node: Node): string {
    return getMemoryBackground((node as MemoryNode).data.tags.slice(0, 1));
  }

  function getMiniMapStroke(node: Node): string {
    return getTopicBorder((node as MemoryNode).data.topics.slice(0, 1));
  }

  function openNewMemoryDialog(): void {
    memoryTitle = "";
    memoryBody = "";
    memoryLabels = [];
    enrichmentWarning = "";
    persistenceError = "";
    newMemoryStep = "capture";
    newMemoryOpen = true;
  }

  function openArchive(): void {
    archiveError = "";
    archiveOpen = true;
  }

  async function restoreArchived(id: string): Promise<void> {
    archiveBusyId = id;
    archiveError = "";
    try {
      await updateCard(id, { archived: false });
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
      await deleteCard(id);
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

  function focusCapture(textarea: HTMLTextAreaElement): void {
    queueMicrotask(() => textarea.focus());
  }

  async function continueMemory(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const description = memoryBody.trim();
    if (!description) return;

    enrichingMemory = true;
    enrichmentWarning = "";
    try {
      let enrichment = enrichmentCache.get(description);
      if (!enrichment) {
        try {
          const result = await requestEnrichment({ description, existingTags: tagVocabulary });
          enrichment = { ...result, warning: "" };
          enrichmentCache.set(description, enrichment);
        } catch {
          enrichment = {
            title: fallbackTitle(memoryBody),
            tags: [],
            warning: "AI suggestions were unavailable. You can finish this memory manually.",
          };
        }
      }

      memoryTitle = enrichment.title;
      memoryLabels = enrichment.tags;
      enrichmentWarning = enrichment.warning;
      newMemoryStep = "review";
    } finally {
      enrichingMemory = false;
    }
  }

  async function addMemory(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const { tags, topics } = partitionLabels(memoryLabels);
    const openSpace = {
      x: (canvasWidth / 2 - viewport.x) / viewport.zoom - 160,
      y: (canvasHeight / 2 - viewport.y) / viewport.zoom - 110,
    };
    const position = findClusterPosition(nodes, { tags, topics }, openSpace);
    const links = parseMarkdown(memoryBody).links;
    const node: MemoryNode = {
      id: crypto.randomUUID(),
      type: "memory",
      position,
      data: {
        title: memoryTitle.trim() || fallbackTitle(memoryBody),
        body: memoryBody,
        tags,
        topics,
        links,
        tagVocabulary,
      },
      focusable: true,
    };

    savingMemory = true;
    persistenceError = "";
    try {
      await insertCard(memoryNodeToCard(node));
      newMemoryOpen = false;
    } catch (error) {
      persistenceError = getErrorMessage(error);
    } finally {
      savingMemory = false;
    }
  }

  async function saveMovedCards({ nodes: movedNodes }: { nodes: MemoryNode[] }) {
    if (isDemo || reflowSnapshot) return;

    persistenceError = "";
    try {
      await Promise.all(
        movedNodes.map((node) => updateCard(node.id, { position: node.position })),
      );
    } catch (error) {
      persistenceError = getErrorMessage(error);
    }
  }

  function previewReflow(): void {
    reflowSnapshot = snapshotPositions(nodes);
    nodes = reflowClusters(nodes);
  }

  function restoreReflow(): void {
    if (!reflowSnapshot) return;
    nodes = restorePositions(nodes, reflowSnapshot);
    reflowSnapshot = null;
  }

  async function applyReflow(): Promise<void> {
    if (!reflowSnapshot) return;
    const snapshot = reflowSnapshot;
    const changed = nodes.filter((node) => {
      const original = snapshot[node.id];
      return original && (original.x !== node.position.x || original.y !== node.position.y);
    });

    persistenceError = "";
    try {
      await Promise.all(changed.map((node) => updateCard(node.id, { position: node.position })));
      reflowSnapshot = null;
    } catch (error) {
      await Promise.allSettled(
        changed.map((node) => updateCard(node.id, { position: snapshot[node.id] })),
      );
      nodes = restorePositions(nodes, snapshot);
      reflowSnapshot = null;
      persistenceError = getErrorMessage(error);
    }
  }
</script>

<div class="theme" style:--primary-color={primaryColor}>
  <div class="app">
    <header class="topbar">
      <div>
        <p>Pile of Memories II</p>
        <h1>{isDemo ? "Demo canvas" : "Arrange your memories."}</h1>
      </div>
      <div class="topbar-actions">
        <select class="theme-select" aria-label="Color theme" value={primaryColor} onchange={selectTheme}>
          {#each THEMES as theme (theme.color)}
            <option value={theme.color}>{theme.label}</option>
          {/each}
        </select>
        <a class="demo-button" href={resolve(isDemo ? "/" : "/demo")}>
          {isDemo ? "Back to board" : "Show demo"}
        </a>
        {#if !isDemo}
          <button type="button" class="demo-button" onclick={openArchive} disabled={!boardReady}>
            Archived ({archivedCards.length})
          </button>
        {/if}
        {#if reflowSnapshot}
          <button type="button" class="demo-button" onclick={restoreReflow}>Cancel reflow</button>
          <button type="button" class="card-button" onclick={applyReflow}>Apply reflow</button>
        {:else}
          <button
            type="button"
            class="demo-button"
            onclick={previewReflow}
            disabled={isDemo || !boardReady || nodes.length === 0}
          >
            Reorganize clusters
          </button>
          <button
            type="button"
            class="card-button"
            onclick={openNewMemoryDialog}
            disabled={isDemo || !boardReady}
          >
            New Memory
          </button>
        {/if}
      </div>
      {#if persistenceError}
        <p role="alert">{persistenceError}</p>
      {:else if !isDemo && cardsQuery.isError}
        <p role="alert">Database unavailable</p>
      {:else if !boardReady}
        <p role="status">Loading board…</p>
      {/if}
    </header>
    <main
      class="canvas"
      aria-label={isDemo ? "Demo memory board" : "Memory board"}
      bind:clientWidth={canvasWidth}
      bind:clientHeight={canvasHeight}
    >
      <SvelteFlow
        bind:nodes
        bind:viewport
        {nodeTypes}
        minZoom={0.5}
        maxZoom={1.5}
        fitView={isDemo}
        nodesDraggable={(isDemo || boardReady) && !reflowSnapshot}
        deleteKey={[]}
        onnodedragstop={saveMovedCards}
      >
        <Controls showLock={false} fitViewOptions={{ maxZoom: 1 }} />
        <MiniMap nodeColor={getMiniMapFill} nodeStrokeColor={getMiniMapStroke} />
      </SvelteFlow>
    </main>
  </div>

  {#if newMemoryOpen}
    <dialog
      class="memory-dialog"
      aria-labelledby="new-memory-title"
      onclose={() => (newMemoryOpen = false)}
      {@attach showModal}
    >
      {#if newMemoryStep === "capture"}
        <form method="dialog" onsubmit={continueMemory}>
          <header>
            <p>Capture</p>
            <h2 id="new-memory-title">New Memory</h2>
          </header>
          <label class="memory-field">
            <span>What do you want to remember?</span>
            <textarea
              bind:value={memoryBody}
              rows="12"
              maxlength="8000"
              required
              {@attach focusCapture}
            ></textarea>
          </label>
          <footer>
            <button type="button" class="demo-button" onclick={() => (newMemoryOpen = false)}>
              Cancel
            </button>
            <button type="submit" class="card-button" disabled={enrichingMemory}>
              {enrichingMemory ? "Thinking…" : "Continue"}
            </button>
          </footer>
        </form>
      {:else}
        <form method="dialog" onsubmit={addMemory}>
          <header>
            <p>Review</p>
            <h2 id="new-memory-title">New Memory</h2>
          </header>
          {#if enrichmentWarning}<p class="placement-note" role="status">{enrichmentWarning}</p>{/if}
          <label class="memory-field">
            <span>Title</span>
            <input bind:value={memoryTitle} maxlength="80" required />
          </label>
          <TagEditor id="new-memory-tags" bind:value={memoryLabels} suggestions={tagVocabulary} />
          <label class="memory-field">
            <span>Memory</span>
            <textarea bind:value={memoryBody} rows="10" maxlength="8000" required></textarea>
          </label>
          {#if persistenceError}<p role="alert">{persistenceError}</p>{/if}
          <footer>
            <button type="button" class="demo-button" onclick={() => (newMemoryStep = "capture")}>
              Back
            </button>
            <button type="submit" class="card-button" disabled={savingMemory}>Create Memory</button>
          </footer>
        </form>
      {/if}
    </dialog>
  {/if}

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
                    class="demo-button"
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
</div>
