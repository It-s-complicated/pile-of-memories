<script lang="ts">
  import { MiniMap, useSvelteFlow } from "@xyflow/svelte";
  import type { ComponentProps } from "svelte";

  let props: ComponentProps<typeof MiniMap> = $props();
  const { getZoom, setCenter } = useSvelteFlow();

  function centerOnClick(event: MouseEvent & { currentTarget: HTMLDivElement }): void {
    const matrix = event.currentTarget.querySelector("svg")?.getScreenCTM();
    if (!matrix) return;

    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    void setCenter(point.x, point.y, { zoom: getZoom() });
  }
</script>

<MiniMap {...props} onclick={centerOnClick} />
