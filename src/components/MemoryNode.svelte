<script lang="ts">
  import { type NodeProps, useSvelteFlow } from "@xyflow/svelte";
  import {
    getMemoryBackground,
    getPrimaryTagAccent,
    getTopicBorder,
    getTopicTagColor,
    type MemoryNode,
  } from "../lib/scene";
  import { getCardPersistence } from "../lib/card-persistence";

  let { id, data }: NodeProps<MemoryNode> = $props();
  const { updateNodeData } = useSvelteFlow<MemoryNode>();
  const persistCard = getCardPersistence();
  let background = $derived(getMemoryBackground(data.tags));
  let borderBackground = $derived(getTopicBorder(data.topics));
  let saveError = $state("");

  function update(field: "title" | "body", value: string) {
    updateNodeData(id, { ...data, [field]: value });
  }

  async function save(field: "title" | "body", value: string) {
    if (!persistCard) return;

    const normalized = field === "title" ? value.trim() || "Untitled memory" : value;
    update(field, normalized);
    saveError = "";

    try {
      await persistCard(id, { [field]: normalized });
    } catch {
      saveError = "Changes not saved.";
    }
  }
</script>

<div class="memory-card" style:background={borderBackground}>
  <div class="drag-handle" aria-hidden="true"></div>
  <article aria-label={`Memory: ${data.title || "Untitled memory"}`} style:background>
    <label>
      <span>Title</span>
      <input
        class="nodrag"
        value={data.title}
        oninput={(event) => update("title", event.currentTarget.value)}
        onchange={(event) => save("title", event.currentTarget.value)}
      />
    </label>
    <label>
      <span>Memory</span>
      <textarea
        class="nodrag nowheel"
        value={data.body}
        oninput={(event) => update("body", event.currentTarget.value)}
        onchange={(event) => save("body", event.currentTarget.value)}
      ></textarea>
    </label>
    {#if data.tags.length || data.topics.length}
      <ul class="tags" aria-label="Tags">
        {#each data.tags as tag (tag)}
          <li style:--tag-color={getPrimaryTagAccent(tag)}>{tag}</li>
        {/each}
        {#each data.topics as topic (topic)}
          <li class="topic" style:--topic-color={getTopicTagColor(topic)}>
            {topic}
          </li>
        {/each}
      </ul>
    {/if}
    {#if saveError}<p class="save-error" role="alert">{saveError}</p>{/if}
  </article>
</div>

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
    box-shadow:
      0.45rem 0,
      0 0.45rem,
      0.45rem 0.45rem,
      0 0.9rem,
      0.45rem 0.9rem;
    content: "";
    transform: translate(-0.225rem, -0.45rem);
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  article {
    box-sizing: border-box;
    width: 100%;
    min-height: 176px;
    padding: 1rem 1.1rem;
    border-radius: calc(0.75rem - 2px);
    background: #fff3bf;
  }

  label {
    display: block;
  }

  label > span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  input,
  textarea {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid transparent;
    border-radius: 0.35rem;
    color: var(--theme-ink);
    background: transparent;
    resize: none;
  }

  input {
    margin-bottom: 0.45rem;
    padding: 0.2rem 0.3rem;
    font-size: 1.05rem;
    font-weight: 700;
  }

  textarea {
    height: 90px;
    padding: 0.35rem;
    line-height: 1.4;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0.45rem 0 0;
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
    border: 1px solid var(--topic-color);
    color: var(--topic-color);
    background: #fffaf2;
  }

  .save-error {
    margin: 0.45rem 0 0;
    color: #9f1239;
    font-size: 0.72rem;
  }

  input:focus,
  textarea:focus {
    border-color: var(--primary-color);
    outline: 2px solid #fffaf2;
  }
</style>
