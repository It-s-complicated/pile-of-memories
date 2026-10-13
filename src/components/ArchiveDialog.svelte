<script lang="ts">
  import type { Card } from "../lib/card";
  import { showModal } from "../lib/dialog";

  let { cards, busy, error, onrestore, ondelete, onclose }: {
    cards: Card[];
    busy: boolean;
    error: string;
    onrestore: (id: string) => void;
    ondelete: (id: string, title: string) => void;
    onclose: () => void;
  } = $props();
</script>

<dialog
  class="memory-dialog archive-dialog"
  aria-labelledby="archive-title"
  {onclose}
  {@attach showModal}
>
  <form method="dialog">
    <header>
      <p>Archive</p>
      <h2 id="archive-title">Archived memories</h2>
    </header>

    {#if cards.length}
      <ul class="archive-list">
        {#each cards as card (card.id)}
          <li>
            <strong>{card.title}</strong>
            <div>
              <button
                type="button"
                class="secondary-button"
                disabled={busy}
                onclick={() => onrestore(card.id)}
              >Restore</button>
              <button
                type="button"
                class="danger-button"
                disabled={busy}
                onclick={() => ondelete(card.id, card.title)}
              >Delete permanently</button>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p>No archived memories.</p>
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
    <footer>
      <button type="submit" class="card-button">Done</button>
    </footer>
  </form>
</dialog>

<style>
  .archive-list {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .archive-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.75rem;
  }

  .archive-list li div {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
  }
</style>
