<script lang="ts">
  import {
    Controls,
    SvelteFlow,
    type Node,
    type NodeTypes,
    type Viewport,
  } from "@xyflow/svelte";
  import { onDestroy } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import "@xyflow/svelte/dist/style.css";
  import ClickableMiniMap from "./components/ClickableMiniMap.svelte";
  import MemoryNodeComponent from "./components/MemoryNode.svelte";
  import TagEditor from "./components/TagEditor.svelte";
  import { createCardOverlay } from "./lib/card-overlay.svelte";
  import { setCardPersistence } from "./lib/card-persistence";
  import {
    createCard,
    deleteCard,
    getLiveCards,
    updateCard,
    updateCardPositions,
  } from "./lib/cards.remote";
  import { findClusterPosition, reflowClusters } from "./lib/cluster-layout";
  import { fallbackTitle } from "./lib/enrichment";
  import type { CardCreationProvenance } from "./lib/enrichment-analytics";
  import { enrichMemory } from "./lib/enrichment.remote";
  import { canonicalizeLabels, partitionLabels, PRIMARY_TAGS, TOPIC_TAGS } from "./lib/labels";
  import { parseMarkdown } from "./lib/markdown";
  import {
    cardToMemoryNode,
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

  type CachedEnrichment = {
    attemptId: string;
    title: string;
    tags: string[];
    warning: string;
  };

  const nodeTypes = { memory: MemoryNodeComponent } satisfies NodeTypes;
  const cardsQuery = getLiveCards();
  const overlay = createCardOverlay(
    () => cardsQuery.current ?? [],
    {
      create: createCard,
      update: updateCard,
      updatePositions: updateCardPositions,
      delete: deleteCard,
    },
    () => cardsQuery.reconnect(),
  );
  const enrichmentCache = new SvelteMap<string, CachedEnrichment>();
  setCardPersistence({
    async update(id, changes) {
      try {
        await overlay.update(id, changes);
      } catch (error) {
        persistenceError = getErrorMessage(error);
        throw error;
      }
    },
    async delete(id) {
      try {
        await overlay.delete(id);
      } catch (error) {
        persistenceError = getErrorMessage(error);
        throw error;
      }
    },
  });
  onDestroy(() => overlay.destroy());
  $effect(() => {
    const snapshot = cardsQuery.current;
    if (snapshot) overlay.authoritative = snapshot;
  });

  let cards = $derived(overlay.effectiveCards(cardsQuery.current ?? []));
  let primaryColor = $state<string>(getInitialPrimaryColor());
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
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let newMemoryOpen = $state(false);
  let newMemoryStep = $state<"capture" | "review">("capture");
  let memoryTitle = $state("");
  let memoryBody = $state("");
  let memoryLabels = $state<string[]>([]);
  let enrichmentWarning = $state("");
  let creationProvenance = $state<CardCreationProvenance>();
  let enrichmentGeneration = 0;
  let enrichingMemory = $state(false);
  let boardReady = $derived(cardsQuery.current !== undefined);
  let savingMemory = $state(false);
  let persistenceError = $state("");
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
    enrichmentGeneration += 1;
    memoryTitle = "";
    memoryBody = "";
    memoryLabels = [];
    enrichmentWarning = "";
    creationProvenance = undefined;
    enrichingMemory = false;
    persistenceError = "";
    newMemoryStep = "capture";
    newMemoryOpen = true;
  }

  function closeNewMemoryDialog(): void {
    enrichmentGeneration += 1;
    enrichingMemory = false;
    newMemoryOpen = false;
  }

  function openArchive(): void {
    archiveError = "";
    archiveOpen = true;
  }

  async function restoreArchived(id: string): Promise<void> {
    archiveBusyId = id;
    archiveError = "";
    try {
      await overlay.update(id, { archived: false });
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
      await overlay.delete(id);
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

    const generation = enrichmentGeneration;
    enrichingMemory = true;
    enrichmentWarning = "";
    try {
      let enrichment = enrichmentCache.get(description);
      let resultSource: CardCreationProvenance["resultSource"] = "cache";
      if (!enrichment) {
        try {
          const result = await enrichMemory({
            description,
            existingTags: tagVocabulary,
          });
          enrichment = { ...result, warning: "" };
          enrichmentCache.set(description, enrichment);
          resultSource = "ai";
        } catch {
          enrichment = {
            attemptId: crypto.randomUUID(),
            title: fallbackTitle(memoryBody),
            tags: [],
            warning: "AI suggestions were unavailable. You can finish this memory manually.",
          };
          resultSource = "fallback";
        }
      }

      if (generation !== enrichmentGeneration || memoryBody.trim() !== description) return;

      memoryTitle = enrichment.title;
      memoryLabels = enrichment.tags;
      enrichmentWarning = enrichment.warning;
      creationProvenance = {
        enrichmentAttemptId: enrichment.attemptId,
        resultSource,
        reviewStartedAt: new Date().toISOString(),
      };
      newMemoryStep = "review";
    } finally {
      if (generation === enrichmentGeneration) enrichingMemory = false;
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
      await overlay.create(memoryNodeToCard(node), creationProvenance);
      newMemoryOpen = false;
    } catch (error) {
      persistenceError = getErrorMessage(error);
    } finally {
      savingMemory = false;
    }
  }

  async function saveMovedCards({ nodes: movedNodes }: { nodes: MemoryNode[] }) {
    persistenceError = "";
    try {
      await overlay.updatePositions(
        movedNodes.map(({ id, position }) => ({ id, position })),
      );
    } catch (error) {
      persistenceError = getErrorMessage(error);
    }
  }

  async function reorganizeClusters(): Promise<void> {
    persistenceError = "";
    try {
      await overlay.updatePositions(
        reflowClusters(nodes).map(({ id, position }) => ({ id, position })),
      );
    } catch (error) {
      persistenceError = getErrorMessage(error);
    }
  }
</script>

<div class="theme" style:--primary-color={primaryColor}>
  <div class="app">
    <header class="topbar">
      <div>
        <p>Pile of Memories II</p>
        <h1>Arrange your memories.</h1>
      </div>
      <div class="topbar-actions">
        <select class="theme-select" aria-label="Color theme" value={primaryColor} onchange={selectTheme}>
          {#each THEMES as theme (theme.color)}
            <option value={theme.color}>{theme.label}</option>
          {/each}
        </select>
        <button type="button" class="secondary-button" onclick={openArchive} disabled={!boardReady}>
          Archived ({archivedCards.length})
        </button>
        <button
          type="button"
          class="secondary-button"
          onclick={reorganizeClusters}
          disabled={!boardReady || nodes.length === 0}
        >
          Reorganize clusters
        </button>
        <button
          type="button"
          class="card-button"
          onclick={openNewMemoryDialog}
          disabled={!boardReady}
        >
          New Memory
        </button>
      </div>
      {#if persistenceError}
        <p role="alert">{persistenceError}</p>
      {:else if cardsQuery.error && !boardReady}
        <p role="alert">Database unavailable</p>
      {:else if !boardReady}
        <p role="status">Loading board…</p>
      {:else if !cardsQuery.connected || overlay.stale}
        <p role="status">
          Live updates paused.
          <button type="button" class="edit-button" onclick={() => cardsQuery.reconnect()}>
            Reconnect
          </button>
        </p>
      {/if}
    </header>
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
        nodesDraggable={boardReady}
        deleteKey={[]}
        onnodedragstop={saveMovedCards}
      >
        <Controls showLock={false} fitViewOptions={{ maxZoom: 1 }} />
        <ClickableMiniMap nodeColor={getMiniMapFill} nodeStrokeColor={getMiniMapStroke} />
      </SvelteFlow>
    </main>
  </div>

  {#if newMemoryOpen}
    <dialog
      class="memory-dialog"
      aria-labelledby="new-memory-title"
      onclose={closeNewMemoryDialog}
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
              disabled={enrichingMemory}
              {@attach focusCapture}
            ></textarea>
          </label>
          <footer>
            <button type="button" class="secondary-button" onclick={closeNewMemoryDialog}>
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
            <button type="button" class="secondary-button" onclick={() => (newMemoryStep = "capture")}>
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
</div>
