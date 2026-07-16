<script lang="ts">
  import { type NodeProps, useSvelteFlow } from "@xyflow/svelte";
  import { getCardPersistence } from "$lib/card-persistence";
  import { partitionLabels } from "$lib/labels";
  import { parseMarkdown } from "$lib/markdown";
  import {
    getMemoryBackground,
    getPrimaryTagAccent,
    getTopicBorder,
    getTopicTagColor,
    type MemoryNode,
  } from "$lib/scene";
  import MemoryMarkdown from "./MemoryMarkdown.svelte";
  import TagEditor from "./TagEditor.svelte";

  let { id, data }: NodeProps<MemoryNode> = $props();
  const { updateNodeData } = useSvelteFlow<MemoryNode>();
  const cardPersistence = getCardPersistence();
  let background = $derived(getMemoryBackground(data.tags));
  let borderBackground = $derived(getTopicBorder(data.topics));
  let parsedBody = $derived(parseMarkdown(data.body));
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

<div class="memory-card" style:background={borderBackground}>
  <div class="drag-handle" aria-hidden="true"></div>
  <article aria-label={`Memory: ${data.title || "Untitled memory"}`} style:background>
    <header>
      <h2>{data.title || "Untitled memory"}</h2>
      <button type="button" class="edit-button nodrag" onclick={openEditor}>Edit</button>
    </header>

    <div class="markdown nowheel">
      <MemoryMarkdown parsed={parsedBody} />
    </div>

    {#if data.tags.length || data.topics.length}
      <ul class="tags" aria-label="Tags">
        {#each data.tags as tag (tag.toLowerCase())}
          <li style:--tag-color={getPrimaryTagAccent(tag)}>{tag}</li>
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
</div>

{#if editOpen}
  <dialog
    class="memory-dialog nodrag nowheel"
    aria-labelledby={`edit-memory-${id}`}
    onclose={() => (editOpen = false)}
    {@attach showModal}
  >
    <form method="dialog" onsubmit={save}>
      <header>
        <p>Edit memory</p>
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
    position: relative;
    box-sizing: border-box;
    width: 320px;
    min-height: 180px;
    padding: 2px;
    border-radius: 0.75rem;
    background: var(--primary-color);
    box-shadow: 0 4px 14px color-mix(in srgb, var(--theme-ink) 14%, transparent);
  }

  .drag-handle {
    position: absolute;
    z-index: 1;
    top: -1rem;
    right: -1rem;
    display: grid;
    width: 2.25rem;
    height: 2.75rem;
    place-items: center;
    border: 1px solid var(--theme-ink);
    border-radius: 0.6rem;
    color: var(--theme-ink);
    background: color-mix(in srgb, #fffaf2 92%, var(--primary-color));
    cursor: grab;
    touch-action: none;
  }

  .drag-handle::before {
    width: 0.25rem;
    height: 0.25rem;
    border-radius: 50%;
    background: currentcolor;
    box-shadow: 0.45rem 0, 0 0.45rem, 0.45rem 0.45rem, 0 0.9rem, 0.45rem 0.9rem;
    content: "";
    transform: translate(-0.225rem, -0.45rem);
  }

  article {
    box-sizing: border-box;
    width: 100%;
    min-height: 176px;
    padding: 1rem 1.1rem;
    border-radius: calc(0.75rem - 2px);
    color: var(--theme-ink);
    background: #fff3bf;
  }

  article > header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .edit-button {
    border: 0;
    padding: 0.15rem;
    color: var(--primary-color);
    background: transparent;
    cursor: pointer;
  }

  .markdown {
    max-height: 13rem;
    overflow: auto;
    overflow-wrap: anywhere;
    font-size: 0.86rem;
    line-height: 1.45;
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
    font-family: ui-monospace, monospace;
    font-size: 0.78rem;
  }

  .markdown :global(pre) {
    overflow: auto;
    border-radius: 0.35rem;
    padding: 0.5rem;
    background: rgb(255 250 242 / 70%);
  }

  .markdown :global(input[type="checkbox"]) {
    margin-right: 0.35rem;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0.55rem 0 0;
    padding: 0;
    list-style: none;
  }

  .tags li {
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--tag-color);
    border-radius: 999px;
    font-size: 0.68rem;
    line-height: 1.25;
    color: #fffaf2;
    background: var(--tag-color);
  }

  .tags .topic {
    border-color: var(--topic-color);
    color: var(--topic-color);
    background: #fffaf2;
  }

  .links {
    margin-top: 0.65rem;
    font-size: 0.72rem;
  }

  .links ul {
    margin: 0.35rem 0 0;
    padding-left: 1rem;
  }

  .links a {
    color: var(--primary-color);
  }

  .save-error {
    margin: 0;
    color: #9f1239;
  }
</style>
