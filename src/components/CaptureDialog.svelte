<script lang="ts">
  import { onDestroy } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import TagEditor from "./TagEditor.svelte";
  import type { RemoteFormEnhanceInstance } from "$app/server";
  import { createCardFormSchema, cardKindLabels, type Card, type CardInput, type CardKind, type CreateCardFormInput } from "../lib/card";
  import { createCard } from "../lib/cards.remote";
  import { fallbackTitle } from "../lib/enrichment";
  import type { CardCreationProvenance } from "../lib/enrichment-analytics";
  import { enrichMemory } from "../lib/enrichment.remote";
  import type { ManagedLabel } from "../lib/labels";
  import { getErrorMessage } from "../lib/errors";

  let {
    vocabulary,
    labelsReady,
    oncreate,
    getPosition,
    onclose,
    boardReady,
  }: {
    vocabulary: ManagedLabel[];
    labelsReady: boolean;
    onclose: () => void;
    boardReady: boolean;
    oncreate: (form: RemoteFormEnhanceInstance<CreateCardFormInput, Card>) => Promise<boolean>;
    getPosition: (draft: Pick<CardInput, "tags" | "topics">) => CardInput["position"];
  } = $props();

  type CachedEnrichment = {
    kind: CardKind;
    attemptId: string;
    title: string;
    tags: string[];
    topics: string[];
    warning: string;
  };

  const enrichmentCache = new SvelteMap<string, CachedEnrichment>();
  const cardId = crypto.randomUUID();
  const createForm = createCard.preflight(createCardFormSchema);
  let newMemoryStep = $state<"capture" | "review">("capture");
  let memoryTitle = $state("");
  let memoryKind = $state<CardKind>("note");
  let memoryBody = $state("");
  let memoryTags = $state<string[]>([]);
  let memoryTopics = $state<string[]>([]);
  let tagSuggestions = $derived(vocabulary.filter(({ kind }) => kind === "tag").map(({ name }) => name));
  let topicSuggestions = $derived(vocabulary.filter(({ kind }) => kind === "topic").map(({ name }) => name));
  let enrichmentWarning = $state("");
  let creationProvenance = $state<CardCreationProvenance>();
  let enrichmentGeneration = 0;
  let enriching = $derived(enrichMemory.pending > 0);
  let saving = $derived(createForm.pending > 0);
  let position = $derived(getPosition({ tags: memoryTags, topics: memoryTopics }));
  let persistenceError = $state("");

  onDestroy(() => {
    createForm.element?.reset();
    enrichmentGeneration += 1;
  });

  function showModal(dialog: HTMLDialogElement) {
    dialog.showModal();
    return () => dialog.close();
  }

  function focusCapture(textarea: HTMLTextAreaElement): void {
    queueMicrotask(() => textarea.focus());
  }

  async function continueMemory(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const description = memoryBody.trim();
    if (!description) return;

    const cacheKey = JSON.stringify({
      description,
      vocabulary: vocabulary.map(({ id, name, kind, description }) => ({ id, name, kind, description })),
    });
    const generation = enrichmentGeneration;
    enrichmentWarning = "";
    let enrichment = enrichmentCache.get(cacheKey);
    let resultSource: CardCreationProvenance["resultSource"] = "cache";
    if (!enrichment) {
      try {
        const result = await enrichMemory({
          description,
        });
        enrichment = { ...result, warning: "" };
        enrichmentCache.set(cacheKey, enrichment);
        resultSource = "ai";
      } catch {
        enrichment = {
          kind: "note",
          attemptId: crypto.randomUUID(),
          title: fallbackTitle(memoryBody),
          tags: [],
          topics: [],
          warning: "AI suggestions were unavailable. You can finish this memory manually.",
        };
        resultSource = "fallback";
      }
    }

    if (generation !== enrichmentGeneration || memoryBody.trim() !== description) return;

    memoryTitle = enrichment.title;
    memoryKind = enrichment.kind;
    memoryTags = enrichment.tags;
    memoryTopics = enrichment.topics;
    enrichmentWarning = enrichment.warning;
    creationProvenance = {
      enrichmentAttemptId: enrichment.attemptId,
      resultSource,
      reviewStartedAt: new Date().toISOString(),
    };
    createForm.fields.card.set({
      kind: memoryKind,
      title: memoryTitle,
      body: memoryBody,
      tags: memoryTags,
      topics: memoryTopics,
    });
    newMemoryStep = "review";
  }

  async function addMemory(form: RemoteFormEnhanceInstance<CreateCardFormInput, Card>): Promise<void> {
    if (form.pending > 1 || !boardReady) return;
    const generation = enrichmentGeneration;
    persistenceError = "";
    try {
      if (await oncreate(form) && generation === enrichmentGeneration) onclose();
    } catch (error) {
      persistenceError = getErrorMessage(error);
    }
  }
</script>

  <dialog
    class="memory-dialog"
    aria-labelledby="new-memory-title"
    oncancel={(event) => {
      event.preventDefault();
      onclose();
    }}
    {@attach showModal}
  >
    {#if newMemoryStep === "capture"}
      <form method="dialog" onsubmit={continueMemory}>
        <header>
          <p>Capture</p>
          <h2 id="new-memory-title">New Memory</h2>
        </header>
        <label class="memory-field">
          <span>What do you want to remember?</span>
          <textarea
            bind:value={memoryBody}
            rows="12"
            maxlength="8000"
            required
            disabled={enriching}
            {@attach focusCapture}
          ></textarea>
        </label>
        <footer>
          <button type="button" class="secondary-button" onclick={onclose}>
            Cancel
          </button>
          <button type="submit" class="card-button" disabled={enriching || !labelsReady}>
            {enriching ? "Thinking…" : labelsReady ? "Continue" : "Loading labels…"}
          </button>
        </footer>
      </form>
    {:else}
      <form {...createForm.enhance(addMemory)}>
        <input {...createForm.fields.card.id.as("hidden", cardId)} />
        <input {...createForm.fields.card.position.x.as("hidden", position.x)} />
        <input {...createForm.fields.card.position.y.as("hidden", position.y)} />
        {#if creationProvenance}
          {#if creationProvenance.enrichmentAttemptId}
            <input {...createForm.fields.creation.enrichmentAttemptId.as("hidden", creationProvenance.enrichmentAttemptId)} />
          {/if}
          <input {...createForm.fields.creation.resultSource.as("hidden", creationProvenance.resultSource)} />
          {#if creationProvenance.reviewStartedAt}
            <input {...createForm.fields.creation.reviewStartedAt.as("hidden", creationProvenance.reviewStartedAt)} />
          {/if}
        {/if}
        <header>
          <p>Review</p>
          <h2 id="new-memory-title">New Memory</h2>
        </header>
        {#if enrichmentWarning}<p class="placement-note" role="status">{enrichmentWarning}</p>{/if}
        <label class="memory-field">
          <span>Card type</span>
          <select {...createForm.fields.card.kind.as("select")} bind:value={memoryKind}>
            {#each Object.entries(cardKindLabels) as [kind, label] (kind)}
              <option value={kind}>{label}</option>
            {/each}
          </select>
        </label>
        <label class="memory-field">
          <span>Title</span>
          <input {...createForm.fields.card.title.as("text")} bind:value={memoryTitle} maxlength="80" required />
        </label>
        <TagEditor id="new-memory-tags" bind:value={memoryTags} suggestions={tagSuggestions} field={createForm.fields.card.tags} ready={labelsReady} />
        <TagEditor id="new-memory-topics" label="Topics" kind="topic" bind:value={memoryTopics} suggestions={topicSuggestions} field={createForm.fields.card.topics} ready={labelsReady} />
        <label class="memory-field">
          <span>Memory</span>
          <textarea {...createForm.fields.card.body.as("text")} bind:value={memoryBody} rows="10" maxlength="8000" required></textarea>
        </label>
        {#each createForm.fields.allIssues() ?? [] as issue (issue)}
          <p role="alert">{issue.message}</p>
        {/each}
        {#if persistenceError}<p role="alert">{persistenceError}</p>{/if}
        <footer>
          <button type="button" class="secondary-button" disabled={saving} onclick={() => (newMemoryStep = "capture")}>
            Back
          </button>
          <button type="submit" class="card-button" disabled={saving || !boardReady}>
            {saving ? "Saving…" : boardReady ? "Create card" : "Loading board…"}
          </button>
        </footer>
      </form>
    {/if}
  </dialog>
