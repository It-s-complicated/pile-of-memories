<script module lang="ts">
  const compactDateFormatter = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
  });
</script>

<script lang="ts">
  import { type NodeProps } from "@xyflow/svelte";
  import type { RemoteFormEnhanceInstance } from "$app/server";
  import { cardKindLabels, updateCardFormSchema, type Card, type UpdateCardFormInput } from "#lib/card.js";
  import { deleteCard, saveCard, updateCard } from "#lib/cards.remote.js";
  import { getLiveLabels } from "#lib/labels.remote.js";
  import { getCardPersistence } from "#lib/card-persistence.js";
  import { getErrorMessage } from "#lib/errors.js";
  import { showModal } from "#lib/dialog.js";
  import { enrichMemory } from "#lib/enrichment.remote.js";
  import { parseMarkdown } from "#lib/markdown.js";
  import { getPrimaryTagAccent, getTopicTagColor, type MemoryNode } from "#lib/scene.js";
  import MemoryMarkdown from "./MemoryMarkdown.svelte";
  import TagEditor from "./TagEditor.svelte";

  let { id, data }: NodeProps<MemoryNode> = $props();
  const cardPersistence = getCardPersistence();
  let browse = $derived(cardPersistence.browse());
  let readOpen = $state(false);
  let parsedBody = $derived(parseMarkdown(data.body));
  let createdDate = $derived(compactDateFormatter.format(new Date(data.createdAt)));
  let updatedDate = $derived(compactDateFormatter.format(new Date(data.updatedAt)));
  let editOpen = $state(false);
  let editForm = $derived(saveCard.for(id).preflight(updateCardFormSchema));
  const labelsQuery = getLiveLabels();
  let vocabulary = $derived(labelsQuery.current ?? []);
  let labelsReady = $derived(labelsQuery.ready && !labelsQuery.error);
  let tagSuggestions = $derived(vocabulary.filter(({ kind }) => kind === "tag").map(({ name }) => name));
  let topicSuggestions = $derived(vocabulary.filter(({ kind }) => kind === "topic").map(({ name }) => name));
  let enrichmentGeneration = 0;
  let enriching = $derived(enrichMemory.pending > 0);
  let busy = $derived(editForm.pending > 0 || updateCard.pending > 0 || deleteCard.pending > 0);
  let enrichmentStatus = $state("");
  let saveError = $state("");

  function openEditor(): void {
    enrichmentGeneration += 1;
    editForm.element?.reset();
    const fields = editForm.fields;
    fields.set({ id, changes: {
      title: data.title,
      kind: data.kind,
      body: data.body,
      tags: [...data.tags],
      topics: [...data.topics],
    } });
    enrichmentStatus = "";
    saveError = "";
    editOpen = true;
  }

  function closeEditor(): void {
    enrichmentGeneration += 1;
    editOpen = false;
  }

  async function repeatEnrichment(): Promise<void> {
    const description = editForm.fields.changes.body.value()?.trim() ?? "";
    if (!description) {
      saveError = "Add memory text before repeating enrichment.";
      return;
    }

    const generation = ++enrichmentGeneration;
    enrichmentStatus = "";
    saveError = "";
    try {
      const result = await enrichMemory({ description });
      if (generation !== enrichmentGeneration) return;
      const fields = editForm.fields.changes;
      fields.title.set(result.title);
      fields.kind.set(result.kind);
      fields.tags.set(result.tags);
      fields.topics.set(result.topics);
      enrichmentStatus = "Fresh title, type, tags, and topics are ready. Save to keep them.";
    } catch {
      if (generation === enrichmentGeneration) saveError = "Enrichment failed. Try again.";
    }
  }

  async function save(form: RemoteFormEnhanceInstance<UpdateCardFormInput, Card>): Promise<void> {
    if (form.pending > 1) return;
    const generation = enrichmentGeneration;
    saveError = "";
    try {
      if (await cardPersistence.save(form) && generation === enrichmentGeneration) closeEditor();
    } catch (caught) {
      saveError = getErrorMessage(caught, "Changes not saved. Please try again.");
    }
  }

  async function archive(): Promise<void> {
    saveError = "";
    try {
      await cardPersistence.update(id, { archived: true });
      closeEditor();
    } catch {
      saveError = "Memory not archived.";
    }
  }

  async function remove(): Promise<void> {
    if (!confirm(`Permanently delete “${data.title || "Untitled memory"}”? This cannot be undone.`))
      return;

    saveError = "";
    try {
      await cardPersistence.delete(id);
      closeEditor();
    } catch {
      saveError = "Memory not deleted.";
    }
  }
</script>

<article
  class={["memory-card", { browsing: browse }]}
  aria-label={`${cardKindLabels[data.kind]}: ${data.title || "Untitled memory"}`}
>
  <header>
    <div class="card-kind">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if data.kind === "idea"}
          <path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z" />
        {:else if data.kind === "note"}
          <path d="M5 3h10l4 4v14H5ZM15 3v5h4M9 12h6m-6 4h6" />
        {:else}
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l-3 2" />
        {/if}
      </svg>
      {cardKindLabels[data.kind]}
    </div>
    <p class="card-meta">
      <time datetime={data.createdAt}>Created {createdDate}</time>
      ·
      <time datetime={data.updatedAt}>Updated {updatedDate}</time>
    </p>
    <h2>{data.title || "Untitled memory"}</h2>
    {#if !browse}
      <button type="button" class="edit-button nodrag" onclick={openEditor}>Edit</button>
    {/if}
  </header>

  <div class={["markdown", { nowheel: !browse }]} inert={browse}>
    <MemoryMarkdown parsed={parsedBody} />
  </div>

  {#if data.tags.length || data.topics.length}
    <ul class="tags" aria-label="Tags">
      {#each data.tags as tag (tag.toLowerCase())}
        <li class="primary" style:--tag-color={getPrimaryTagAccent(tag)}>{tag}</li>
      {/each}
      {#each data.topics as topic (topic.toLowerCase())}
        <li class="topic" style:--topic-color={getTopicTagColor(topic)}>{topic}</li>
      {/each}
    </ul>
  {/if}

  {#if data.links.length}
    <details class="links nodrag nowheel" inert={browse}>
      <summary>Links ({data.links.length})</summary>
      <ul>
        {#each data.links as link (link)}
          <li><a href={link} target="_blank" rel="external noopener noreferrer">{link}</a></li>
        {/each}
      </ul>
    </details>
  {/if}
  {#if browse}
    <button
      type="button"
      class="read-card"
      aria-label={`Read ${data.title || "Untitled memory"}`}
      onclick={() => (readOpen = true)}
    ></button>
  {/if}
</article>

{#if readOpen}
  <dialog
    class="memory-dialog nodrag nopan nowheel"
    aria-labelledby={`read-memory-${id}`}
    onclose={() => (readOpen = false)}
    {@attach showModal}
  >
    <form method="dialog">
      <header><h2 id={`read-memory-${id}`}>{data.title || "Untitled memory"}</h2></header>
      <div class="read-body"><MemoryMarkdown parsed={parsedBody} /></div>
      <footer>
        <button
          type="button"
          class="secondary-button"
          onclick={() => {
            readOpen = false;
            openEditor();
          }}
        >Edit memory</button>
        <button type="submit" class="card-button">Done</button>
      </footer>
    </form>
  </dialog>
{/if}

{#if editOpen}
  <dialog
    class="memory-dialog nodrag nowheel"
    aria-labelledby={`edit-memory-${id}`}
    onclose={closeEditor}
    {@attach showModal}
  >
    <form {...editForm.enhance(save)}>
      <input {...editForm.fields.id.as("hidden", id)} />
      <header>
        <p>Edit memory</p>
        <h2 id={`edit-memory-${id}`}>{data.title || "Untitled memory"}</h2>
      </header>

      <fieldset class="edit-fields" disabled={busy || enriching}>
        <label class="memory-field">
          <span>Card type</span>
          <select {...editForm.fields.changes.kind.as("select")}>
            {#each Object.entries(cardKindLabels) as [kind, label] (kind)}
              <option value={kind}>{label}</option>
            {/each}
          </select>
        </label>
        <label class="memory-field">
          <span>Title</span>
          <input {...editForm.fields.changes.title.as("text")} maxlength="80" required />
        </label>
        <label class="memory-field">
          <span>Memory</span>
          <textarea {...editForm.fields.changes.body.as("text")} rows="10" maxlength="8000" required></textarea>
        </label>
        <TagEditor
          id={`edit-memory-tags-${id}`}
          bind:value={() => editForm.fields.changes.tags.value()?.filter((tag) => tag !== undefined) ?? [], (value) => { const fields = editForm.fields.changes; fields.tags.set(value); }}
          field={editForm.fields.changes.tags}
          ready={labelsReady}
          suggestions={tagSuggestions}
        />
        <TagEditor
          id={`edit-memory-topics-${id}`}
          label="Topics"
          kind="topic"
          bind:value={() => editForm.fields.changes.topics.value()?.filter((topic) => topic !== undefined) ?? [], (value) => { const fields = editForm.fields.changes; fields.topics.set(value); }}
          field={editForm.fields.changes.topics}
          ready={labelsReady}
          suggestions={topicSuggestions}
        />
      </fieldset>

      <fieldset class="debug-tools">
        <legend>Debug</legend>
        <p>Generate a fresh title, type, tags, and topics from the current card text.</p>
        <button
          type="button"
          class="secondary-button"
          disabled={busy || enriching || !labelsReady}
          onclick={repeatEnrichment}
        >{enriching ? "Enriching…" : "Repeat enrichment"}</button>
      </fieldset>

      {#if enrichmentStatus}<p class="placement-note" role="status">{enrichmentStatus}</p>{/if}
      {#each editForm.fields.allIssues() ?? [] as issue (issue)}
        <p class="save-error" role="alert">{issue.message}</p>
      {/each}
      {#if saveError}<p class="save-error" role="alert">{saveError}</p>{/if}
      <footer>
        <button type="button" class="danger-button" disabled={busy || enriching} onclick={remove}>
          Delete permanently
        </button>
        <button type="button" class="secondary-button" disabled={busy || enriching} onclick={archive}>
          Archive
        </button>
        <button type="button" class="secondary-button" onclick={closeEditor}>
          Cancel
        </button>
        <button type="submit" class="card-button" disabled={busy || enriching}>Save</button>
      </footer>
    </form>
  </dialog>
{/if}

<style>
  .memory-card {
    position: relative;
    box-sizing: border-box;
    width: 320px;
    min-height: 180px;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.9rem 1.1rem 1rem;
    color: var(--text);
    background: var(--paper);
    box-shadow: var(--shadow-slip);
    cursor: grab;
  }

  .browsing .markdown {
    overflow: hidden;
  }

  .read-card {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: grab;
    touch-action: none;
  }

  .read-card:focus-visible {
    outline: 2px solid var(--theme-ink);
    outline-offset: 3px;
  }

  .read-body {
    overflow-wrap: anywhere;
    font-size: 1rem;
    line-height: 1.6;
  }

  .read-body :global(pre) {
    overflow: auto;
  }

  .memory-card > header {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 0.1rem 0.5rem;
  }

  .card-meta {
    grid-column: 1 / -1;
    margin: 0 0 0.15rem;
    font-family: var(--font-label);
    font-size: 0.64rem;
    letter-spacing: 0.14em;
    color: var(--muted);
  }

  .card-meta time {
    letter-spacing: 0.04em;
  }

  .card-kind {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.45rem;
    color: var(--theme-ink);
    font-family: var(--font-label);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .edit-button {
    border: 0;
    padding: 0.15rem;
    font-family: var(--font-label);
    font-size: 0.64rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--theme-ink);
    background: transparent;
    cursor: pointer;
  }

  .edit-button:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .markdown {
    max-height: 13rem;
    overflow: auto;
    overflow-wrap: anywhere;
    font-size: 0.86rem;
    line-height: 1.5;
    cursor: default;
  }

  .markdown :global(h3) {
    margin: 0.7rem 0 0.25rem;
    font-size: 0.95rem;
  }

  .markdown :global(p),
  .markdown :global(ul),
  .markdown :global(ol),
  .markdown :global(blockquote),
  .markdown :global(pre) {
    margin: 0.55rem 0;
  }

  .markdown :global(pre),
  .markdown :global(code) {
    font-family: var(--font-label);
    font-size: 0.78rem;
  }

  .markdown :global(pre) {
    overflow: auto;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.5rem;
    background: var(--ink-tint);
  }

  .markdown :global(input[type="checkbox"]) {
    margin-right: 0.35rem;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
  }

  .tags li {
    border: 1px solid transparent;
    border-radius: 2px;
    padding: 0.4rem 0.5rem;
    font-family: var(--font-label);
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    line-height: 1.4;
    text-box: trim-both cap alphabetic;
    text-transform: uppercase;
  }

  .tags .primary {
    color: var(--paper);
    background: var(--tag-color);
  }

  .tags .topic {
    border-color: color-mix(in oklch, var(--topic-color) 55%, var(--paper));
    color: var(--topic-color);
    background: var(--paper);
  }

  .links {
    margin-top: 0.65rem;
    font-family: var(--font-label);
    font-size: 0.68rem;
  }

  .links summary {
    color: var(--muted);
    cursor: pointer;
  }

  .links ul {
    margin: 0.35rem 0 0;
    padding-left: 1rem;
  }

  .links a {
    color: var(--theme-ink);
  }

  .save-error {
    margin: 0;
    color: var(--danger);
  }

  .edit-fields {
    display: grid;
    gap: 1rem;
    border: 0;
    padding: 0;
  }

  .debug-tools {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .debug-tools p {
    flex: 1;
    margin: 0;
    color: var(--muted);
  }
</style>
