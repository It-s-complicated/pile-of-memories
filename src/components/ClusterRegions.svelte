<script lang="ts">
  import { useStore, ViewportPortal } from "@xyflow/svelte";
  import { getClusterRegions } from "#lib/cluster-layout.js";
  import { getPrimaryTagAccent, type MemoryNode } from "#lib/scene.js";

  const store = useStore<MemoryNode>();
  const regions = $derived(getClusterRegions(store.nodes));
</script>

<ViewportPortal target="back">
  {#each regions as region (region.key)}
    <div
      class="cluster-region"
      style:left={`${region.x}px`}
      style:top={`${region.y}px`}
      style:width={`${region.width}px`}
      style:height={`${region.height}px`}
      style:--category-ink={getPrimaryTagAccent(region.key)}
    >
      <span>{region.name} · {region.count}</span>
    </div>
  {/each}
</ViewportPortal>

<style>
  .cluster-region {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid color-mix(in oklch, var(--category-ink) 55%, var(--paper));
    border-radius: 4px;
    pointer-events: none;
  }

  span {
    position: absolute;
    top: 12px;
    left: 20px;
    padding: 0 4px;
    color: var(--category-ink);
    background: var(--sheet);
    font-family: var(--font-label);
    font-size: 14px;
  }
</style>
