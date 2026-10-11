<script lang="ts">
  import {
    MAX_LABEL_LENGTH,
    MAX_LABEL_DESCRIPTION_LENGTH,
    type LabelKind,
    type ManagedLabel,
  } from "#lib/labels.js";
  import type { RemoteFormEnhanceInstance } from "$app/server";
  import type { z } from "zod";
  import type { saveLabelSchema } from "#lib/labels.js";
  import { saveLabel, deleteLabel } from "#lib/labels.remote.js";
  import { getErrorMessage } from "#lib/errors.js";
  import { showModal } from "#lib/dialog.js";
  import { getPrimaryTagAccent, getTopicTagColor } from "#lib/scene.js";

  let {
    labels,
    ready,
    loadError,
    connected,
    onreconnect,
    onclose,
  }: {
    labels: ManagedLabel[];
    ready: boolean;
    loadError: boolean;
    connected: boolean;
    onreconnect: () => Promise<void>;
    onclose: () => void;
  } = $props();

  let filter = $state<LabelKind>("tag");
  let editingId = $state<string>();
  let focusName = $state(0);
  let labelForm = $derived(editingId ? saveLabel.for(editingId) : saveLabel);
  let kind = $derived(labelForm.fields.kind.value() ?? filter);
  let saveError = $state("");
  let status = $state("");
  let busy = $derived(labelForm.pending > 0 || deleteLabel.pending > 0);
  let visibleLabels = $derived(labels.filter((label) => label.kind === filter));
  let editingLabel = $derived(labels.find(({ id }) => id === editingId));

  function edit(label?: ManagedLabel): void {
    labelForm.element?.reset();
    editingId = label?.id;
    const fields = labelForm.fields;
    fields.set({
      id: label?.id,
      name: label?.name ?? "",
      kind: label?.kind ?? filter,
      description: label?.description ?? "",
    });
    saveError = "";
    status = "";
    focusName += 1;
  }

  async function save(form: RemoteFormEnhanceInstance<z.input<typeof saveLabelSchema>, ManagedLabel>): Promise<void> {
    if (form.pending > 1 || !ready) return;
    saveError = "";
    status = "";
    try {
      // PostgreSQL notifications update the live catalog; avoid invalidating the whole board.
      if (!await form.submit().updates()) return;
      filter = form.result?.kind ?? kind;
      edit();
      status = "Saved. New enrichment requests will use this definition.";
      if (!connected) await onreconnect();
    } catch (caught) {
      saveError = getErrorMessage(caught, "Could not save. Please try again.");
    }
  }

  async function remove(): Promise<void> {
    if (!editingLabel || busy || !ready) return;
    const label = editingLabel;
    if (!confirm(
      `Delete “${label.name}”? This removes it from ${label.usageCount} cards, including archived cards. The cards themselves are kept. This cannot be undone.`,
    )) return;
    saveError = "";
    status = "";
    try {
      await deleteLabel({ id: label.id });
      edit();
      status = `Deleted “${label.name}”. Its cards were kept.`;
    } catch (caught) {
      saveError = getErrorMessage(caught, "Could not delete. Please try again.");
    }
  }
</script>

<dialog
  class="memory-dialog labels-dialog"
  aria-labelledby="labels-title"
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
  {@attach showModal}
>
  <header class="manager-header">
    <h2 id="labels-title">Tags &amp; topics</h2>
    <p>Tags organize broad areas. Topics describe specific subjects. Define both to guide AI suggestions.</p>
    <button type="button" class="secondary-button" onclick={onclose} disabled={busy}>Done</button>
  </header>

  {#if loadError}
    <p class="load-error" role="alert">
      Could not load your labels.
      <button type="button" class="secondary-button" onclick={onreconnect}>Reconnect</button>
    </p>
  {:else if !ready}
    <p class="load-error" role="status">Loading tags and topics…</p>
  {:else}
    {#if !connected}
      <p class="load-error" role="status">
        Live label updates paused. Showing the last received catalog.
        <button type="button" class="secondary-button" onclick={onreconnect}>Reconnect</button>
      </p>
    {/if}
    <div class="manager-body">
      <section class="catalog" aria-label="Label catalog">
        <div class="catalog-controls" aria-label="Label type">
          <button type="button" class="chip-button" aria-pressed={filter === "tag"} onclick={() => (filter = "tag")}>
            Tags · {labels.filter(({ kind }) => kind === "tag").length}
          </button>
          <button type="button" class="chip-button" aria-pressed={filter === "topic"} onclick={() => (filter = "topic")}>
            Topics · {labels.filter(({ kind }) => kind === "topic").length}
          </button>
          <button type="button" class="secondary-button" onclick={() => edit()} disabled={busy}>New {filter}</button>
        </div>
        {#if visibleLabels.length}
          <ul class="label-list">
            {#each visibleLabels as label (label.id)}
              <li>
                <div>
                  <span class:primary={label.kind === "tag"} class="label-name"
                    style:--label-color={label.kind === "tag" ? getPrimaryTagAccent(label.name) : getTopicTagColor(label.name)}
                  >{label.name}</span>
                  <span class="usage">{label.usageCount} {label.usageCount === 1 ? "card" : "cards"}</span>
                </div>
                <p>{label.description || "No description yet — AI uses the name only."}</p>
                <button type="button" class="secondary-button" aria-label={`Edit ${label.kind} ${label.name}`} onclick={() => edit(label)} disabled={busy}>Edit</button>
              </li>
            {/each}
          </ul>
        {:else}
          <p>No {filter === "tag" ? "tags" : "topics"} yet. Create one to start organizing your cards.</p>
        {/if}
      </section>

      {#key editingId}
      <form class="label-form" {...labelForm.enhance(save)}>
        {#if editingId}<input {...labelForm.fields.id.as("hidden", editingId)} />{/if}
        <h3>{editingId ? "Edit" : "New"} {kind}</h3>
        <fieldset disabled={busy}>
          <label class="memory-field">
            <span>Name</span>
            <input
              {...labelForm.fields.name.as("text")}
              maxlength={MAX_LABEL_LENGTH}
              required
              {@attach (input) => { if (focusName) input.focus(); }}
            />
          </label>
          <label class="memory-field">
            <span>Type</span>
            <select {...labelForm.fields.kind.as("select", filter)}>
              <option value="tag">Tag — broad area</option>
              <option value="topic">Topic — specific subject</option>
            </select>
          </label>
          <label class="memory-field">
            <span>Enrichment description</span>
            <textarea {...labelForm.fields.description.as("text", "")} rows="7" maxlength={MAX_LABEL_DESCRIPTION_LENGTH}
              aria-describedby="label-description-help"
            ></textarea>
          </label>
          <p id="label-description-help" class="field-help">
            Explain what belongs here and what does not. Optional: without a description, AI uses the name only.
          </p>
          {#if editingId}
            <p class="field-help">Renaming or changing type updates every assigned card, including archived cards.</p>
          {/if}
        </fieldset>
        {#each labelForm.fields.allIssues() ?? [] as issue (issue)}
          <p class="error" role="alert">{issue.message}</p>
        {/each}
        {#if saveError}<p class="error" role="alert">{saveError}</p>{/if}
        {#if status}<p class="field-help" role="status">{status}</p>{/if}
        <footer>
          {#if editingId}
            <button type="button" class="danger-button" onclick={remove} disabled={busy}>Delete {editingLabel?.kind ?? kind}</button>
            <button type="button" class="secondary-button" onclick={() => edit()} disabled={busy}>Cancel edit</button>
          {/if}
          <button type="submit" class="card-button" disabled={busy}>
            {busy ? "Saving…" : editingId ? "Save changes" : `Create ${kind}`}
          </button>
        </footer>
      </form>
      {/key}
    </div>
  {/if}
</dialog>

<style>
  .labels-dialog {
    width: min(58rem, calc(100vw - 2rem));
  }
  .manager-header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.65rem 1rem;
    padding: 1.25rem;
    border-bottom: 1px solid var(--hairline);
  }
  .manager-header h2 {
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .manager-header p {
    grid-column: 1 / -1;
    margin: 0;
    max-width: 65ch;
    color: var(--text);
    font-family: var(--font-body);
    font-size: 0.9rem;
    line-height: 1.5;
    letter-spacing: normal;
    text-transform: none;
  }
  .manager-header button {
    grid-column: 2;
    grid-row: 1;
    align-self: start;
  }
  .manager-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 21rem);
    align-items: start;
  }
  .catalog {
    min-width: 0;
    padding: 1.25rem;
  }
  .catalog-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .catalog-controls [aria-pressed="true"] {
    color: var(--paper);
    background: var(--theme-ink);
  }
  .catalog-controls .chip-button {
    box-shadow: none;
  }
  .label-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .label-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--hairline);
    padding-block: 1rem;
  }
  .label-list li:first-child {
    padding-top: 0;
  }
  .label-list li > div {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .label-name {
    border: 1px solid color-mix(in oklch, var(--label-color) 55%, var(--paper));
    border-radius: 2px;
    padding: 0.25rem 0.4rem;
    color: var(--label-color);
    font: 0.68rem var(--font-label);
    overflow-wrap: anywhere;
  }
  .label-name.primary {
    color: var(--paper);
    background: var(--label-color);
    border-color: transparent;
  }
  .usage {
    color: var(--muted);
    font: 0.68rem var(--font-label);
  }
  .label-list p {
    grid-column: 1;
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .label-list button {
    grid-column: 2;
    grid-row: 1 / 3;
    align-self: start;
  }
  .labels-dialog .label-form {
    gap: 0.75rem;
    border-left: 1px solid var(--hairline);
    background: var(--sheet);
  }
  .label-form h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .label-form fieldset {
    display: grid;
    gap: 0.85rem;
    border: 0;
    padding: 0;
  }
  .field-help {
    margin: 0;
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .labels-dialog footer {
    background: var(--sheet);
  }
  .error {
    margin: 0;
    color: var(--danger);
  }
  .load-error {
    padding: 1.25rem;
  }
  @media (max-width: 700px) {
    .manager-body {
      grid-template-columns: 1fr;
    }
    .catalog {
      max-height: 40vh;
      overflow: auto;
    }
    .labels-dialog .label-form {
      border-left: 0;
      border-top: 1px solid var(--hairline);
    }
  }
</style>
