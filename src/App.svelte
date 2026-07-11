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
    createDemoScene,
    readScene,
    serializeScene,
    type MemoryNode,
    type SceneSnapshot,
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
  let demoMode = $state(false);
  let boardScene: SceneSnapshot = scene;
  let boardViewport: Viewport = { x: 32, y: 32, zoom: 1 };
  let serializedScene = $derived(serializeScene({ nodes, edges }));

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

  function toggleDemo() {
    if (demoMode) {
      nodes = boardScene.nodes;
      edges = boardScene.edges;
      viewport = boardViewport;
      demoMode = false;
      return;
    }

    boardScene = { nodes, edges };
    boardViewport = { ...viewport };

    const demo = createDemoScene();
    demoMode = true;
    nodes = demo.nodes;
    edges = demo.edges;
    viewport = { x: 24, y: 24, zoom: 0.65 };
  }

  $effect(() => {
    if (!demoMode) localStorage[SCENE_STORAGE_KEY] = serializedScene;
  });
</script>

<div class="app">
  <header class="topbar">
    <div>
      <p>Pile of Memories II</p>
      <h1>{demoMode ? "Demo canvas" : "Arrange your memories."}</h1>
    </div>
    <div class="topbar-actions">
      <button type="button" class="demo-button" onclick={toggleDemo}>
        {demoMode ? "Back to board" : "Show demo"}
      </button>
      <button type="button" class="card-button" onclick={addCard} disabled={demoMode}>New card</button>
    </div>
  </header>
  <main
    class="canvas"
    aria-label={demoMode ? "Demo memory garden" : "Memory garden"}
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
    >
      <Controls showLock={false} fitViewOptions={{ maxZoom: 1 }} />
      <MiniMap />
    </SvelteFlow>
  </main>
</div>
