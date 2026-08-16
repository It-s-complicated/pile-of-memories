<script module lang="ts">
  const STORAGE_KEY = "pile-of-memories-list-settings";
  const dateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
</script>

<script lang="ts">
  import {
    memoryListSettingsSchema,
    sortAndFilterCards,
    type Card,
    type MemoryListSettings,
  } from "#lib/card.js";
  import { canonicalizeLabels } from "#lib/labels.js";
  import { parseMarkdown } from "#lib/markdown.js";
  import { getPrimaryTagAccent, getTopicTagColor } from "#lib/scene.js";
  import MemoryMarkdown from "./MemoryMarkdown.svelte";

  interface Props {
    cards: Card[];
    onclose: () => void;
    onlocate: (card: Card) => void;
  }

  const defaultSettings = {
    sort: "updated-desc",
    tags: [],
  } satisfies MemoryListSettings;
  let { cards, onclose, onlocate }: Props = $props();
  let settings = $state<MemoryListSettings>(getStoredSettings());
  let visibleCards = $derived(sortAndFilterCards(cards, settings));
  let availableTags = $derived(
    canonicalizeLabels([
      ...settings.tags,
      ...cards.flatMap((card) => [...card.tags, ...card.topics]),
    ]).toSorted((a, b) => a.localeCompare(b)),
  );

  function getStoredSettings(): MemoryListSettings {
    try {
      const parsed = memoryListSettingsSchema.safeParse(
        JSON.parse(localStorage.getItem(STORAGE_KEY) ?? ""),
      );
      return parsed.success ? parsed.data : defaultSettings;
    } catch {
      return defaultSettings;
    }
  }

  function saveSettings(next: MemoryListSettings): void {
    settings = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function changeSort(event: Event & { currentTarget: HTMLSelectElement }): void {
    saveSettings({
      ...settings,
      sort: event.currentTarget.value as MemoryListSettings["sort"],
    });
  }

  function toggleTag(tag: string): void {
    const selected = settings.tags.some((value) => value.toLowerCase() === tag.toLowerCase());
    saveSettings({
      ...settings,
      tags: selected
        ? settings.tags.filter((value) => value.toLowerCase() !== tag.toLowerCase())
        : [...settings.tags, tag],
    });
  }

  function showModal(dialog: HTMLDialogElement) {
    dialog.showModal();
    return () => dialog.close();
  }
</script>

<dialog
  class="memory-dialog list-dialog"
  aria-labelledby="memory-list-title"
  {onclose}
  {@attach showModal}
>
  <form method="dialog">
    <header>
      <h2 id="memory-list-title">Memory list</h2>
      <p>{visibleCards.length} of {cards.length} memories</p>
    </header>

    <div class="list-controls">
      <label class="sort-control">
        <span>Sort</span>
        <select value={settings.sort} onchange={changeSort}>
          <option value="updated-desc">Recently updated</option>
          <option value="updated-asc">Least recently updated</option>
          <option value="created-desc">Newest created</option>
          <option value="created-asc">Oldest created</option>
          <option value="title-asc">Title A–Z</option>
          <option value="title-desc">Title Z–A</option>
        </select>
      </label>

      {#if availableTags.length}
        <fieldset>
          <legend>Filter by tag · matches any</legend>
          <div class="tag-filters">
            {#each availableTags as tag (tag.toLowerCase())}
              <label>
                <input
                  type="checkbox"
                  checked={settings.tags.some(
                    (selected) => selected.toLowerCase() === tag.toLowerCase(),
                  )}
                  onchange={() => toggleTag(tag)}
                />
                <span>{tag}</span>
              </label>
            {/each}
            {#if settings.tags.length}
              <button
                type="button"
                class="clear-filters"
                onclick={() => saveSettings({ ...settings, tags: [] })}
              >Clear filters</button>
            {/if}
          </div>
        </fieldset>
      {/if}
    </div>

    {#if visibleCards.length}
      <ol class="memory-list">
        {#each visibleCards as card (card.id)}
          <li>
            <details>
              <summary>
                <span class="summary-layout">
                  <span class="memory-summary">
                    <strong>{card.title}</strong>
                    <span>
                      Updated <time datetime={card.updatedAt}>{dateFormatter.format(new Date(card.updatedAt))}</time>
                      · Created <time datetime={card.createdAt}>{dateFormatter.format(new Date(card.createdAt))}</time>
                    </span>
                  </span>
                  {#if card.tags.length || card.topics.length}
                    <span class="memory-tags" aria-label={`Tags for ${card.title}`}>
                      {#each card.tags as tag (tag.toLowerCase())}
                        <span class="primary" style:--tag-color={getPrimaryTagAccent(tag)}>{tag}</span>
                      {/each}
                      {#each card.topics as topic (topic.toLowerCase())}
                        <span style:--tag-color={getTopicTagColor(topic)}>{topic}</span>
                      {/each}
                    </span>
                  {/if}
                </span>
              </summary>
              <div class="memory-body">
                {#if card.body}
                  <div class="markdown"><MemoryMarkdown parsed={parseMarkdown(card.body)} /></div>
                {:else}
                  <p class="empty-body">No body text.</p>
                {/if}
                <button type="button" class="secondary-button" onclick={() => onlocate(card)}>
                  Locate on board
                </button>
              </div>
            </details>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="empty-list">
        {cards.length ? "No memories match the selected tags." : "No memories yet."}
      </p>
    {/if}

    <footer>
      <button type="submit" class="card-button">Done</button>
    </footer>
  </form>
</dialog>

<style>
  .memory-dialog.list-dialog {
    width: min(68rem, calc(100vw - 2rem));
  }

  header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  header p {
    font-family: var(--font-label);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .list-controls {
    display: grid;
    grid-template-columns: minmax(12rem, 0.35fr) 1fr;
    gap: 1rem;
  }

  .sort-control {
    display: grid;
    align-content: start;
    gap: 0.35rem;
  }

  .sort-control > span,
  legend {
    font-family: var(--font-label);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  select {
    width: 100%;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.65rem;
    color: var(--text);
    background: var(--paper);
  }

  select:focus-visible,
  input:focus-visible,
  button:focus-visible {
    outline: 2px solid color-mix(in oklch, var(--theme-ink) 55%, var(--paper));
    outline-offset: 2px;
  }

  fieldset {
    min-width: 0;
    margin: 0;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.55rem 0.7rem 0.7rem;
  }

  legend {
    padding: 0 0.35rem;
  }

  .tag-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.8rem;
  }

  .tag-filters label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    font-size: 0.68rem;
  }

  .tag-filters input {
    accent-color: var(--theme-ink);
  }

  .clear-filters {
    border: 0;
    padding: 0;
    color: var(--theme-ink);
    background: transparent;
    cursor: pointer;
    font-size: 0.68rem;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .memory-list {
    margin: 0;
    border-block: 1px solid var(--hairline);
    padding: 0;
    list-style: none;
  }

  .memory-list > li {
    padding: 0;
  }

  .memory-list > li + li {
    border-top: 1px solid var(--hairline);
  }

  summary {
    padding: 0.9rem 0.15rem;
    cursor: pointer;
  }

  summary:hover,
  details[open] > summary {
    background: var(--ink-tint);
  }

  summary:focus-visible {
    outline: 2px solid color-mix(in oklch, var(--theme-ink) 55%, var(--paper));
    outline-offset: -2px;
  }

  .summary-layout {
    display: inline-grid;
    grid-template-columns: minmax(12rem, 0.8fr) minmax(16rem, 1.2fr);
    align-items: center;
    width: calc(100% - 1.5rem);
    gap: 1.25rem;
    margin-left: 0.35rem;
    vertical-align: middle;
  }

  .memory-summary {
    display: grid;
  }

  .memory-summary strong {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .memory-summary > span {
    margin-top: 0.3rem;
    font-family: var(--font-label);
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .memory-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .memory-tags > span {
    border: 1px solid color-mix(in oklch, var(--tag-color) 55%, var(--paper));
    border-radius: 2px;
    padding: 0.25rem 0.4rem;
    font-family: var(--font-label);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tag-color);
  }

  .memory-tags > span.primary {
    border-color: transparent;
    color: var(--paper);
    background: var(--tag-color);
  }

  .memory-body {
    display: grid;
    gap: 1rem;
    border-top: 1px solid var(--hairline);
    padding: 1rem 1.6rem 1.25rem;
  }

  .markdown {
    max-width: 75ch;
    overflow-wrap: anywhere;
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .markdown :global(:first-child) {
    margin-top: 0;
  }

  .markdown :global(:last-child) {
    margin-bottom: 0;
  }

  .markdown :global(a) {
    color: var(--theme-ink);
  }

  .markdown :global(pre),
  .markdown :global(code) {
    font-family: var(--font-label);
    font-size: 0.68rem;
  }

  .markdown :global(pre) {
    overflow: auto;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.5rem;
    background: var(--ink-tint);
  }

  .memory-body > button {
    justify-self: end;
  }

  .empty-body {
    margin: 0;
    color: var(--muted);
  }

  .empty-list {
    display: grid;
    min-height: 12rem;
    margin: 0;
    place-items: center;
    color: var(--muted);
  }

  @media (max-width: 640px) {
    .memory-dialog.list-dialog {
      width: 100vw;
      max-width: none;
      height: 100dvh;
      max-height: none;
      margin: 0;
      border: 0;
      border-radius: 0;
    }

    form {
      grid-template-rows: auto auto 1fr auto;
      min-height: 100%;
    }

    header {
      align-items: start;
    }

    .list-controls,
    .summary-layout {
      grid-template-columns: 1fr;
    }

    .memory-tags {
      justify-content: flex-start;
    }

    .memory-body {
      padding-inline: 1rem;
    }
  }
</style>
