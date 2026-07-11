<script lang="ts">
  import {
    Controls,
    MiniMap,
    SvelteFlow,
    type DefaultEdgeOptions,
    type Edge,
    type NodeTypes,
    type Viewport,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import MemoryNodeComponent from "./components/MemoryNode.svelte";
  import {
    DEFAULT_MEMORY_BODY,
    SCENE_STORAGE_KEY,
    readScene,
    serializeScene,
    type MemoryNode,
  } from "./lib/scene";

  const scene = readScene(localStorage.getItem(SCENE_STORAGE_KEY));
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
        data: { title: "Memory card", body: DEFAULT_MEMORY_BODY },
        focusable: true,
      },
    ];
  }

  $effect(() => {
    localStorage.setItem(SCENE_STORAGE_KEY, serializeScene({ nodes, edges }));
  });
</script>

<div class="app">
  <header class="topbar">
    <div>
      <p>Pile of Memories II</p>
      <h1>Arrange what is worth keeping.</h1>
    </div>
    <button type="button" class="card-button" onclick={addCard}>New card</button>
  </header>
  <main class="canvas" aria-label="Memory garden" bind:clientWidth={canvasWidth} bind:clientHeight={canvasHeight}>
    <SvelteFlow
      bind:nodes
      bind:edges
      bind:viewport
      {nodeTypes}
      {defaultEdgeOptions}
      minZoom={0.5}
      maxZoom={1.5}
    >
      <Controls showLock={false} fitViewOptions={{ maxZoom: 1 }} />
      <MiniMap />
    </SvelteFlow>
  </main>
</div>
