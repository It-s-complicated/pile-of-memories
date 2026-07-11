<script lang="ts">
  import { Handle, Position, type NodeProps, useSvelteFlow } from "@xyflow/svelte";
  import type { MemoryNode } from "../lib/scene";

  let { id, data, isConnectable }: NodeProps<MemoryNode> = $props();
  const { updateNodeData } = useSvelteFlow<MemoryNode>();

  function update(field: "title" | "body", value: string) {
    updateNodeData(id, { ...data, [field]: value });
  }
</script>

<article aria-label={`Memory: ${data.title || "Untitled memory"}`}>
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
  <Handle
    class="memory-handle"
    type="source"
    position={Position.Right}
    {isConnectable}
    aria-label={`Connect from ${data.title || "this memory"}`}
  />
</article>

<style>
  article {
    box-sizing: border-box;
    width: 320px;
    height: 180px;
    padding: 1rem 1.1rem;
    border: 1px solid #5f4b32;
    border-radius: 0.75rem;
    background: #fff3bf;
    box-shadow: 0 4px 14px rgb(63 52 43 / 14%);
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
    height: 100px;
    padding: 0.35rem;
    line-height: 1.4;
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
