<script lang="ts">
  import { useSvelteFlow, ViewportPortal } from "@xyflow/svelte";
  import { getClusterLandmarks } from "../lib/cluster-layout";
  import { getPrimaryTagAccent, type MemoryNode } from "../lib/scene";

  let { nodes }: { nodes: MemoryNode[] } = $props();
  const { getNodesBounds } = useSvelteFlow<MemoryNode>();
  let clusters = $derived(
    getClusterLandmarks(nodes).map(({ members, tag }) => {
      const bounds = getNodesBounds(members);
      return { id: members[0].id, tag, word: tag?.split(/\s+/)[0], bounds };
    }),
  );
</script>

<ViewportPortal target="back">
  {#each clusters as { id, tag, word, bounds } (id)}
    {#if tag && word && bounds.width > 0}
      <div
        class="cluster-label"
        aria-hidden="true"
        style:left={`${bounds.x + bounds.width / 2}px`}
        style:top={`${bounds.y + bounds.height / 2}px`}
        style:font-size={`${Math.min(384, Math.max(128, bounds.width / (word.length * 0.65)))}px`}
      >
        <span style:--tag-color={getPrimaryTagAccent(tag)}>{word}</span>
      </div>
    {/if}
  {/each}
</ViewportPortal>

<style>
  .cluster-label {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    user-select: none;
    font-family: "Archivo Variable", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    line-height: 0.95;
    letter-spacing: -0.02em;
    opacity: 0.24;
    text-align: center;
    white-space: nowrap;
  }

  span {
    display: block;
    color: color-mix(in oklch, var(--tag-color) 24%, var(--muted));
  }
</style>
