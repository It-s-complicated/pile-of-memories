<script lang="ts">
  import "@fontsource-variable/archivo";
  import "@fontsource/cutive-mono";
  import "../styles.css";

  let { children } = $props();

  const devtools = import.meta.env.DEV ? import("../components/AiDevtools.svelte") : null;
</script>

{@render children()}

{#if devtools}
  {#await devtools then { default: AiDevtools }}
    <AiDevtools />
  {/await}
{/if}
