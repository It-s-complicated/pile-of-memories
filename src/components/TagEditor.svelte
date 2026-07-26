<script lang="ts">
  import { canonicalizeLabels, MAX_LABEL_LENGTH, PRIMARY_TAGS } from "#lib/labels.js";
  import { getPrimaryTagAccent, getTopicTagColor } from "#lib/scene.js";

  const primaryTagKeys = new Set(PRIMARY_TAGS.map((tag) => tag.toLowerCase()));

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
        {@const primary = primaryTagKeys.has(tag.toLowerCase())}
        <li
          class:primary
          style:--tag-color={primary ? getPrimaryTagAccent(tag) : getTopicTagColor(tag)}
        >
          <span>{tag}</span>
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onclick={() => (value = value.filter((v) => v !== tag))}
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
    font-family: var(--font-label);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
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
    gap: 0.25rem;
    border: 1px solid color-mix(in oklch, var(--tag-color) 55%, var(--paper));
    border-radius: 2px;
    padding: 0.15rem 0.3rem 0.15rem 0.45rem;
    font-family: var(--font-label);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tag-color);
    background: var(--paper);
  }

  li > span {
    text-box: trim-both cap alphabetic;
  }

  li.primary {
    border-color: transparent;
    color: var(--paper);
    background: var(--tag-color);
  }

  li button {
    display: grid;
    width: 1.2rem;
    height: 1.2rem;
    place-items: center;
    border: 0;
    border-radius: 2px;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }

  li button:hover {
    background: color-mix(in oklch, var(--tag-color) 18%, transparent);
  }

  .tag-input {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.4rem;
  }

  input,
  .tag-input button {
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.65rem;
    color: var(--text);
    background: #fff;
  }

  input:focus-visible {
    outline: 2px solid color-mix(in oklch, var(--theme-ink) 55%, var(--paper));
    outline-offset: 1px;
  }

  .tag-input button {
    color: var(--theme-ink);
    cursor: pointer;
  }

  .tag-input button:hover {
    background: var(--ink-tint);
  }
</style>
