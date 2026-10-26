<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import type { Card } from "#lib/card.js";
  import { showModal } from "#lib/dialog.js";
  import { parseMarkdown } from "#lib/markdown.js";
  import MemoryMarkdown from "./MemoryMarkdown.svelte";

  let {
    cards,
    ready,
    loadError,
    canExplore,
    onexplore,
  }: {
    cards: Card[];
    ready: boolean;
    loadError: boolean;
    canExplore: boolean;
    onexplore: (id: string) => void;
  } = $props();

  let memoryId = $derived((page.shallow?.url ?? page.url).searchParams.get("memory"));
  let card = $derived(cards.find(({ id }) => id === memoryId));
  let parsedBody = $derived(parseMarkdown(card?.body ?? ""));

  async function closeReader(): Promise<void> {
    const url = new URL((page.shallow?.url ?? page.url).href);
    url.searchParams.delete("memory");
    await goto(url, { shallow: true, replace: true, state: page.state });
  }

  async function explore(id: string): Promise<void> {
    await closeReader();
    onexplore(id);
  }
</script>

{#if memoryId}
  <dialog
    class="memory-dialog"
    aria-labelledby="linked-memory-title"
    oncancel={(event) => {
      event.preventDefault();
      void closeReader();
    }}
    {@attach showModal}
  >
    <form method="dialog" onsubmit={(event) => {
      event.preventDefault();
      void closeReader();
    }}>
      <header>
        {#if card?.archived}<p>Archived memory</p>{/if}
        <h2 id="linked-memory-title">{card?.title || (ready || loadError ? "Memory unavailable" : "Loading memory…")}</h2>
      </header>
      {#if card}
        <div class="read-body"><MemoryMarkdown parsed={parsedBody} /></div>
      {:else if loadError}
        <p>Could not load this memory. Try again when the database is available.</p>
      {:else if ready}
        <p>This memory is no longer available. It may have been deleted.</p>
      {:else}
        <p>Loading memory…</p>
      {/if}
      <footer>
        {#if card && !card.archived}
          <button type="button" class="secondary-button" disabled={!canExplore} onclick={() => void explore(card.id)}>
            Explore from here
          </button>
        {/if}
        <button type="submit" class="card-button">Done</button>
      </footer>
    </form>
  </dialog>
{/if}

<style>
  .read-body {
    overflow-wrap: anywhere;
    font-size: 1rem;
    line-height: 1.6;
  }

  .read-body :global(pre) {
    overflow: auto;
  }
</style>
