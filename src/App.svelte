<script lang="ts">
  import {
    Controls,
    MiniMap,
    SvelteFlow,
    type DefaultEdgeOptions,
    type Edge,
    type Node,
    type NodeTypes,
    type Viewport,
  } from "@xyflow/svelte";
  import { resolve } from "$app/paths";
  import "@xyflow/svelte/dist/style.css";
  import MemoryNodeComponent from "./components/MemoryNode.svelte";
  import {
    DEFAULT_MEMORY_BODY,
    SCENE_STORAGE_KEY,
    createDemoScene,
    getMemoryBackground,
    getTopicBorder,
    readScene,
    serializeScene,
    type MemoryNode,
  } from "./lib/scene";

  let { demo = false }: { demo?: boolean } = $props();
  const scene = getInitialScene();
  const nodeTypes = { memory: MemoryNodeComponent } satisfies NodeTypes;
  const defaultEdgeOptions = {
    type: "default",
    style: "stroke: #7c7167; stroke-width: 2",
  } satisfies DefaultEdgeOptions;

  let nodes = $state.raw<MemoryNode[]>(scene.nodes);
  let edges = $state.raw<Edge[]>(scene.edges);
  let viewport = $state<Viewport>({ x: 32, y: 32, zoom: 1 });
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let serializedScene = $derived(serializeScene({ nodes, edges }));

  function getInitialScene() {
    return demo ? createDemoScene() : readScene(localStorage.getItem(SCENE_STORAGE_KEY));
  }

  function getMiniMapFill(node: Node): string {
    return getMemoryBackground((node as MemoryNode).data.tags.slice(0, 1));
  }

  function getMiniMapStroke(node: Node): string {
    return getTopicBorder((node as MemoryNode).data.topics.slice(0, 1));
  }

  function addCard() {
    const id = crypto.randomUUID();
    const position = {
      x: (canvasWidth / 2 - viewport.x) / viewport.zoom - 160,
      y: (canvasHeight / 2 - viewport.y) / viewport.zoom - 90,
    };

    nodes = [
      ...nodes,
      {
        id,
        type: "memory",
        position,
        data: { title: "Memory card", body: DEFAULT_MEMORY_BODY, tags: [], topics: [] },
        focusable: true,
      },
    ];
  }

  $effect(() => {
    if (!demo) localStorage[SCENE_STORAGE_KEY] = serializedScene;
  });
</script>

<div class="app">
  <header class="topbar">
    <div>
      <p>Pile of Memories II</p>
      <h1>{demo ? "Demo canvas" : "Arrange your memories."}</h1>
    </div>
    <div class="topbar-actions">
      <a class="demo-button" href={resolve(demo ? "/" : "/demo")}>
        {demo ? "Back to board" : "Show demo"}
      </a>
      <button type="button" class="card-button" onclick={addCard} disabled={demo}>New card</button>
    </div>
  </header>
  <main
    class="canvas"
    aria-label={demo ? "Demo memory garden" : "Memory garden"}
    bind:clientWidth={canvasWidth}
    bind:clientHeight={canvasHeight}
  >
    <SvelteFlow
      bind:nodes
      bind:edges
      bind:viewport
      {nodeTypes}
      {defaultEdgeOptions}
      minZoom={0.5}
      maxZoom={1.5}
      fitView={demo}
    >
      <Controls showLock={false} fitViewOptions={{ maxZoom: 1 }} />
      <MiniMap nodeColor={getMiniMapFill} nodeStrokeColor={getMiniMapStroke} />
    </SvelteFlow>
  </main>
</div>
