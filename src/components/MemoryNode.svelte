<script lang="ts">
  import { Handle, Position, type NodeProps, useSvelteFlow } from "@xyflow/svelte";
  import {
    getMemoryBackground,
    getPrimaryTagAccent,
    getTopicBorder,
    getTopicTagColor,
    type MemoryNode,
  } from "../lib/scene";

  let { id, data, isConnectable }: NodeProps<MemoryNode> = $props();
  const { updateNodeData } = useSvelteFlow<MemoryNode>();
  let background = $derived(getMemoryBackground(data.tags));
  let borderBackground = $derived(getTopicBorder(data.topics));

  function update(field: "title" | "body", value: string) {
    updateNodeData(id, { ...data, [field]: value });
  }
</script>

<div class="memory-card" style:background={borderBackground}>
  <article aria-label={`Memory: ${data.title || "Untitled memory"}`} style:background>
    <Handle
      class="memory-handle"
      type="target"
      position={Position.Left}
      {isConnectable}
      aria-label={`Connect into ${data.title || "this memory"}`}
    />
    <label>
      <span>Title</span>
      <input
        class="nodrag"
        value={data.title}
        oninput={(event) => update("title", event.currentTarget.value)}
      />
    </label>
    <label>
      <span>Memory</span>
      <textarea
        class="nodrag nowheel"
        value={data.body}
        oninput={(event) => update("body", event.currentTarget.value)}
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
    <Handle
      class="memory-handle"
      type="source"
      position={Position.Right}
      {isConnectable}
      aria-label={`Connect from ${data.title || "this memory"}`}
    />
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
    background: #5f4b32;
    box-shadow: 0 4px 14px rgb(63 52 43 / 14%);
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
    color: #3f342b;
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
    border: 1px solid #8a765e;
    border-color: var(--topic-color);
    color: var(--topic-color);
    background: #fffaf2;
  }

  input:focus,
  textarea:focus {
    border-color: #5f4b32;
    outline: 2px solid #fffaf2;
  }

  :global(.memory-handle) {
    width: 10px;
    height: 10px;
    border-color: #fffaf2;
    background: #5f4b32;
  }
</style>
