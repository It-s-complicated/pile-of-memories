<script lang="ts">
  import { useSvelteFlow, type Viewport } from "@xyflow/svelte";
  import { onMount } from "svelte";

  interface Props {
    stored: { cx: number; cy: number; zoom: number } | null;
  }

  let { stored }: Props = $props();
  const { fitView, getZoom, setCenter, setViewport } = useSvelteFlow();

  export function center(x: number, y: number): void {
    void setCenter(x, y, { zoom: getZoom() });
  }

  export async function fit(): Promise<void> {
    await fitView({ padding: 0.2, maxZoom: 1 });
  }

  export async function restore(viewport: Viewport): Promise<void> {
    await setViewport(viewport);
  }

  // Restore only an explicitly saved viewport; never reframe the board on reload.
  onMount(() => {
    if (stored) void setCenter(stored.cx, stored.cy, { zoom: stored.zoom });
  });
</script>
