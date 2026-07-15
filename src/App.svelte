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
  import { untrack } from "svelte";
  import "@xyflow/svelte/dist/style.css";
  import MemoryNodeComponent from "./components/MemoryNode.svelte";
  import { setCardPersistence } from "./lib/card-persistence";
  import { cardsCollection, insertCard, updateCard } from "./lib/cards-collection";
  import {
    DEFAULT_MEMORY_BODY,
    PRIMARY_TAGS,
    TOPIC_TAGS,
    cardToMemoryNode,
    createDemoBoard,
    findOpenMemoryPosition,
    getMemoryBackground,
    getTopicBorder,
    memoryNodeToCard,
    suggestMemoryPlacement,
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

  let { demo = false }: { demo?: boolean } = $props();
  const isDemo = untrack(() => demo);
  const board = isDemo ? createDemoBoard() : { nodes: [] };
  const nodeTypes = { memory: MemoryNodeComponent } satisfies NodeTypes;
  const cardsQuery = useLiveQuery((query) =>
    isDemo ? null : query.from({ card: cardsCollection }),
  );
  setCardPersistence(isDemo ? null : updateCard);

  let primaryColor = $state<string>(getInitialPrimaryColor());
  let nodes = $derived<MemoryNode[]>(
    isDemo ? board.nodes : (cardsQuery.data ?? []).map(cardToMemoryNode),
  );
  let viewport = $state<Viewport>({ x: 32, y: 32, zoom: 1 });
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let newMemoryOpen = $state(false);
  let memoryTitle = $state("");
  let memoryBody = $state("");
  let memoryTags = $state<string[]>([]);
  let memoryTopics = $state<string[]>([]);
  let placementChoice = $state("open");
  let boardReady = $derived(isDemo || cardsQuery.isReady);
  let savingMemory = $state(false);
  let persistenceError = $state("");
  let placement = $derived(
    suggestMemoryPlacement(nodes, { tags: memoryTags, topics: memoryTopics }),
  );

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

  function openNewMemoryDialog() {
    memoryTitle = "";
    memoryBody = "";
    memoryTags = [];
    memoryTopics = [];
    placementChoice = "open";
    newMemoryOpen = true;
  }

  function showModal(dialog: HTMLDialogElement) {
    dialog.showModal();
    return () => dialog.close();
  }

  async function addMemory(event: SubmitEvent) {
    event.preventDefault();
    const id = crypto.randomUUID();
    const openSpace = {
      x: (canvasWidth / 2 - viewport.x) / viewport.zoom - 160,
      y: (canvasHeight / 2 - viewport.y) / viewport.zoom - 90,
    };
    const anchorId = placement.automatic ?? placementChoice;
    const anchor = nodes.find((node) => node.id === anchorId);
    const origin = anchor
      ? { x: anchor.position.x + 360, y: anchor.position.y }
      : openSpace;
    const position = findOpenMemoryPosition(nodes, origin);

    const node: MemoryNode = {
        id,
        type: "memory",
        position,
        data: {
          title: memoryTitle.trim(),
          body: memoryBody.trim() || DEFAULT_MEMORY_BODY,
          tags: memoryTags,
          topics: memoryTopics,
          links: [],
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
    if (isDemo) return;

    persistenceError = "";
    try {
      await Promise.all(
        movedNodes.map((node) => updateCard(node.id, { position: node.position })),
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
      <button
        type="button"
        class="card-button"
        onclick={openNewMemoryDialog}
        disabled={isDemo || !boardReady}
      >
        New Memory
      </button>
    </div>
    {#if persistenceError}
      <p role="alert">{persistenceError}</p>
    {:else if cardsQuery.isError}
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
      nodesDraggable={isDemo || boardReady}
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
    <form method="dialog" onsubmit={addMemory}>
    <header>
      <p>Capture and place</p>
      <h2 id="new-memory-title">New Memory</h2>
    </header>

    <label class="memory-field">
      <span>Title</span>
      <input bind:value={memoryTitle} required />
    </label>
    <label class="memory-field">
      <span>Memory</span>
      <textarea bind:value={memoryBody} rows="4" placeholder={DEFAULT_MEMORY_BODY}></textarea>
    </label>

    <fieldset>
      <legend>Areas</legend>
      <div class="memory-options">
        {#each PRIMARY_TAGS as tag (tag)}
          <label><input type="checkbox" bind:group={memoryTags} value={tag} /> {tag}</label>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Topics</legend>
      <div class="memory-options">
        {#each TOPIC_TAGS as topic (topic)}
          <label><input type="checkbox" bind:group={memoryTopics} value={topic} /> {topic}</label>
        {/each}
      </div>
    </fieldset>

    {#if placement.automatic}
      <p class="placement-note">
        Strong match: this memory will be placed near
        {placement.choices.find((choice) => choice.id === placement.automatic)?.title}.
      </p>
    {:else}
      <fieldset>
        <legend>Placement</legend>
        <div class="placement-options">
          {#each placement.choices as choice (choice.id)}
            <label>
              <input type="radio" bind:group={placementChoice} value={choice.id} />
              Near “{choice.title}”
            </label>
          {/each}
          <label>
            <input type="radio" bind:group={placementChoice} value="open" />
            In open space
          </label>
        </div>
      </fieldset>
    {/if}

      <footer>
        <button type="button" class="demo-button" onclick={() => (newMemoryOpen = false)}>
          Cancel
        </button>
        <button type="submit" class="card-button" disabled={savingMemory}>Create Memory</button>
      </footer>
    </form>
  </dialog>
{/if}
</div>
