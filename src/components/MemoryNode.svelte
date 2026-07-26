<script lang="ts">
  import { type NodeProps, useSvelteFlow } from "@xyflow/svelte";
  import { getCardPersistence } from "#lib/card-persistence.js";
  import { partitionLabels } from "#lib/labels.js";
  import { parseMarkdown } from "#lib/markdown.js";
  import { getPrimaryTagAccent, getTopicTagColor, type MemoryNode } from "#lib/scene.js";
  import MemoryMarkdown from "./MemoryMarkdown.svelte";
  import TagEditor from "./TagEditor.svelte";

  let { id, data }: NodeProps<MemoryNode> = $props();
  const { updateNodeData } = useSvelteFlow<MemoryNode>();
  const cardPersistence = getCardPersistence();
  let parsedBody = $derived(parseMarkdown(data.body));
  let accession = $derived(id.replaceAll("-", "").slice(-4).toUpperCase());
  let updatedDate = $derived(
    new Date(data.updatedAt).toLocaleDateString("en-GB", { dateStyle: "medium" }),
  );
  let editOpen = $state(false);
  let editTitle = $state("");
  let editBody = $state("");
  let editLabels = $state<string[]>([]);
  let saving = $state(false);
  let saveError = $state("");

  function showModal(dialog: HTMLDialogElement) {
    dialog.showModal();
    return () => dialog.close();
  }

  function openEditor(): void {
    editTitle = data.title;
    editBody = data.body;
    editLabels = [...data.tags, ...data.topics];
    saveError = "";
    editOpen = true;
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const title = editTitle.trim() || "Untitled memory";
    const body = editBody;
    const { tags, topics } = partitionLabels(editLabels);
    const links = parseMarkdown(body).links;
    const changes = { title, body, tags, topics, links };

    saving = true;
    saveError = "";
    try {
      await cardPersistence.update(id, changes);
      updateNodeData(id, { ...data, ...changes });
      editOpen = false;
    } catch {
      saveError = "Changes not saved.";
    } finally {
      saving = false;
    }
  }

  async function archive(): Promise<void> {
    saving = true;
    saveError = "";
    try {
      await cardPersistence.update(id, { archived: true });
      editOpen = false;
    } catch {
      saveError = "Memory not archived.";
    } finally {
      saving = false;
    }
  }

  async function remove(): Promise<void> {
    if (!confirm(`Permanently delete “${data.title || "Untitled memory"}”? This cannot be undone.`))
      return;

    saving = true;
    saveError = "";
    try {
      await cardPersistence.delete(id);
      editOpen = false;
    } catch {
      saveError = "Memory not deleted.";
    } finally {
      saving = false;
    }
  }
</script>

<article class="memory-card" aria-label={`Memory: ${data.title || "Untitled memory"}`}>
  <header>
    <p class="card-meta">
      NO. {accession} ·
      <time datetime={data.updatedAt}>Updated {updatedDate}</time>
    </p>
    <h2>{data.title || "Untitled memory"}</h2>
    <button type="button" class="edit-button nodrag" onclick={openEditor}>Edit</button>
  </header>

  <div class="markdown nowheel">
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
    <details class="links nodrag nowheel">
      <summary>Links ({data.links.length})</summary>
      <ul>
        {#each data.links as link (link)}
          <li><a href={link} target="_blank" rel="external noopener noreferrer">{link}</a></li>
        {/each}
      </ul>
    </details>
  {/if}
</article>

{#if editOpen}
  <dialog
    class="memory-dialog nodrag nowheel"
    aria-labelledby={`edit-memory-${id}`}
    onclose={() => (editOpen = false)}
    {@attach showModal}
  >
    <form method="dialog" onsubmit={save}>
      <header>
        <p>Edit memory · № {accession}</p>
        <h2 id={`edit-memory-${id}`}>{data.title || "Untitled memory"}</h2>
      </header>

      <label class="memory-field">
        <span>Title</span>
        <input bind:value={editTitle} required />
      </label>
      <label class="memory-field">
        <span>Memory</span>
        <textarea bind:value={editBody} rows="10"></textarea>
      </label>
      <TagEditor
        id={`edit-memory-tags-${id}`}
        bind:value={editLabels}
        suggestions={data.tagVocabulary}
      />

      {#if saveError}<p class="save-error" role="alert">{saveError}</p>{/if}
      <footer>
        <button type="button" class="danger-button" disabled={saving} onclick={remove}>
          Delete permanently
        </button>
        <button type="button" class="secondary-button" disabled={saving} onclick={archive}>
          Archive
        </button>
        <button type="button" class="secondary-button" onclick={() => (editOpen = false)}>
          Cancel
        </button>
        <button type="submit" class="card-button" disabled={saving}>Save</button>
      </footer>
    </form>
  </dialog>
{/if}

<style>
  .memory-card {
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
</style>
