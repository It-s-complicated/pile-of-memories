<script lang="ts">
  import { canonicalizeLabels, MAX_LABEL_LENGTH } from "$lib/labels";

  interface Props {
    id: string;
    label?: string;
    value?: string[];
    suggestions?: string[];
  }

  let {
    id,
    label = "Tags",
    value = $bindable([]),
    suggestions = [],
  }: Props = $props();
  let input = $state("");
  let availableSuggestions = $derived(
    canonicalizeLabels(suggestions).filter(
      (suggestion) => !value.some((label) => label.toLowerCase() === suggestion.toLowerCase()),
    ),
  );

  function addLabel(label = input): void {
    const next = label.trim();
    if (!next || next.length > MAX_LABEL_LENGTH) return;
    value = canonicalizeLabels([...value, next]);
    input = "";
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement }): void {
    input = event.currentTarget.value;
    if (!input.includes(",")) return;

    const labels = input.split(",");
    input = labels.pop() ?? "";
    for (const label of labels) addLabel(label);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addLabel();
  }
</script>

<div class="tag-editor">
  <label for={id}>{label}</label>
  {#if value.length}
    <ul aria-label="Selected tags">
      {#each value as tag (tag.toLowerCase())}
        <li>
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onclick={() => (value = value.filter((value) => value !== tag))}
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="tag-input">
    <input
      {id}
      list={`${id}-suggestions`}
      value={input}
      maxlength={MAX_LABEL_LENGTH}
      placeholder="Type a tag, then press Enter"
      oninput={handleInput}
      onkeydown={handleKeydown}
    />
    <button type="button" onclick={() => addLabel()}>Add</button>
  </div>
  <datalist id={`${id}-suggestions`}>
    {#each availableSuggestions as suggestion (suggestion.toLowerCase())}
      <option value={suggestion}></option>
    {/each}
  </datalist>
</div>

<style>
  .tag-editor {
    display: grid;
    gap: 0.4rem;
  }

  label {
    font-weight: 700;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    border: 1px solid var(--theme-border);
    border-radius: 999px;
    padding: 0.2rem 0.25rem 0.2rem 0.55rem;
    color: var(--theme-ink);
    background: #fff;
  }

  li button {
    display: grid;
    width: 1.35rem;
    height: 1.35rem;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }

  .tag-input {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.4rem;
  }

  input,
  .tag-input button {
    border: 1px solid var(--theme-border);
    border-radius: 0.4rem;
    padding: 0.65rem;
    color: var(--theme-ink);
    background: #fff;
  }

  .tag-input button {
    cursor: pointer;
  }
</style>
