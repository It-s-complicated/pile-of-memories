<script lang="ts">
  import { useInternalNode } from "@xyflow/svelte";
  import { getMinimapColors, type MemoryData } from "#lib/scene.js";

  interface Props {
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }

  let { id, x = 0, y = 0, width = 0, height = 0 }: Props = $props();
  let node = $derived(useInternalNode(id));
  let colors = $derived(getMinimapColors((node.current?.data as MemoryData | undefined)?.tags ?? []));
  let segmentWidth = $derived(width / colors.length);
</script>

<g>
  {#each colors as color, i (color + i)}
    <rect
      x={x + i * segmentWidth}
      {y}
      width={segmentWidth + (i < colors.length - 1 ? 0.5 : 0)}
      {height}
      style:fill={color}
    />
  {/each}
  <rect {x} {y} {width} {height} class="minimap-node-frame" fill="none" />
</g>

<style>
  .minimap-node-frame {
    stroke: color-mix(in oklch, var(--theme-ink) 35%, var(--paper));
    stroke-width: 1;
  }
</style>
