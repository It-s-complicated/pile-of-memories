<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
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
  import { showModal } from "../lib/dialog";
  import type { IdeaDraft } from "../lib/exploration";
  import { trackExplorationEvent } from "../lib/exploration-analytics.remote";

  let {
    vocabulary,
    labelsReady,
    oncreate,
    getPosition,
    onclose,
    boardReady,
    initialDraft,
  }: {
    vocabulary: ManagedLabel[];
    labelsReady: boolean;
    onclose: () => void;
    boardReady: boolean;
    initialDraft?: IdeaDraft;
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
  const draft = untrack(() => initialDraft);
  const cardId = crypto.randomUUID();
  const createForm = createCard.preflight(createCardFormSchema);
  let newMemoryStep = $state<"capture" | "review">(draft ? "review" : "capture");
  let memoryTitle = $state(draft?.title ?? "");
  let memoryKind = $state<CardKind>(draft?.kind ?? "note");
  let memoryBody = $state(draft?.body ?? "");
  let memoryTags = $state<string[]>([]);
  let memoryTopics = $state<string[]>([]);
  let tagSuggestions = $derived(vocabulary.filter(({ kind }) => kind === "tag").map(({ name }) => name));
  let topicSuggestions = $derived(vocabulary.filter(({ kind }) => kind === "topic").map(({ name }) => name));
  let enrichmentWarning = $state("");
  let creationProvenance = $state<CardCreationProvenance>();
  let enrichmentGeneration = 0;
  let enrichmentInFlight = false;
  let cancelled = false;
  let enriching = $state(!!draft);
  let saving = $derived(createForm.pending > 0);
  let position = $derived(getPosition({ tags: memoryTags, topics: memoryTopics }));
  let persistenceError = $state("");

  onMount(() => {
    if (draft) {
      setCardFields();
      void continueMemory();
    }
  });

  onDestroy(() => {
    createForm.element?.reset();
    enrichmentGeneration += 1;
  });

  function focusCapture(textarea: HTMLTextAreaElement): void {
    queueMicrotask(() => textarea.focus());
  }

  function cancelCapture(): void {
    if (saving) return;
    enrichmentGeneration += 1;
    if (draft?.exploration && !cancelled) {
      cancelled = true;
      const { sessionId, runId, ideaIndex, sourceCardCount } = draft.exploration;
      void trackExplorationEvent({ sessionId, runId, ideaIndex, selectedCardCount: sourceCardCount, event: "draft_cancelled" }).catch(() => {});
    }
    onclose();
  }

  function setCardFields(): void {
    createForm.fields.card.set({
      kind: memoryKind,
      title: memoryTitle,
      body: memoryBody,
      tags: memoryTags,
      topics: memoryTopics,
    });
  }

  async function continueMemory(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    const description = memoryBody.trim();
    if (!description || enrichmentInFlight) return;
    enrichmentInFlight = true;
    enriching = true;
    const title = draft ? memoryTitle.trim() : undefined;
    const kind = draft ? memoryKind : undefined;

    const cacheKey = JSON.stringify({
      description,
      title,
      kind,
      sourceIds: draft?.sourceIds,
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
          ...(draft ? { title, kind, sourceIds: draft.sourceIds, exploration: draft.exploration } : {}),
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
          warning: draft
            ? "Tag suggestions were unavailable. You can add them yourself or retry."
            : "AI suggestions were unavailable. You can finish this memory manually.",
        };
        resultSource = "fallback";
      }
    }

    if (generation !== enrichmentGeneration) return;
    enrichmentInFlight = false;
    enriching = false;
    if (memoryBody.trim() !== description) return;

    memoryTitle = title ?? enrichment.title;
    memoryKind = kind ?? enrichment.kind;
    memoryTags = enrichment.tags;
    memoryTopics = enrichment.topics;
    enrichmentWarning = enrichment.warning;
    creationProvenance = {
      enrichmentAttemptId: enrichment.attemptId,
      resultSource,
      reviewStartedAt: new Date().toISOString(),
    };
    setCardFields();
    newMemoryStep = "review";
  }

  async function addMemory(form: RemoteFormEnhanceInstance<CreateCardFormInput, Card>): Promise<void> {
    if (form.pending > 1 || !boardReady || enriching) return;
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
      cancelCapture();
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
          <button type="button" class="secondary-button" onclick={cancelCapture}>
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
        {#if draft?.exploration}
          <input {...createForm.fields.exploration.sessionId.as("hidden", draft.exploration.sessionId)} />
          <input {...createForm.fields.exploration.runId.as("hidden", draft.exploration.runId)} />
          <input {...createForm.fields.exploration.ideaIndex.as("hidden", draft.exploration.ideaIndex)} />
          <input {...createForm.fields.exploration.sourceCardCount.as("hidden", draft.exploration.sourceCardCount)} />
        {/if}
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
          <h2 id="new-memory-title">{draft ? "Keep this idea" : "New Memory"}</h2>
        </header>
        {#if enriching}
          <p class="placement-note" role="status">Finding tags and topics for this idea…</p>
        {:else if enrichmentWarning}
          <p class="placement-note" role="status">{enrichmentWarning}</p>
          {#if draft}<button type="button" class="secondary-button" onclick={() => continueMemory()}>Retry tag suggestions</button>{/if}
        {/if}
        <label class="memory-field">
          <span>Card type</span>
          <select {...createForm.fields.card.kind.as("select")} bind:value={memoryKind} disabled={enriching || saving}>
            {#each Object.entries(cardKindLabels) as [kind, label] (kind)}
              <option value={kind}>{label}</option>
            {/each}
          </select>
        </label>
        <label class="memory-field">
          <span>Title</span>
          <input {...createForm.fields.card.title.as("text")} bind:value={memoryTitle} maxlength="80" required disabled={enriching || saving} />
        </label>
        <TagEditor id="new-memory-tags" bind:value={memoryTags} suggestions={tagSuggestions} field={createForm.fields.card.tags} ready={labelsReady && !enriching} />
        <TagEditor id="new-memory-topics" label="Topics" kind="topic" bind:value={memoryTopics} suggestions={topicSuggestions} field={createForm.fields.card.topics} ready={labelsReady && !enriching} />
        <label class="memory-field">
          <span>Memory</span>
          <textarea {...createForm.fields.card.body.as("text")} bind:value={memoryBody} rows="10" maxlength="8000" required disabled={enriching || saving}></textarea>
        </label>
        {#each createForm.fields.allIssues() ?? [] as issue (issue)}
          <p role="alert">{issue.message}</p>
        {/each}
        {#if persistenceError}<p role="alert">{persistenceError}</p>{/if}
        <footer>
          {#if draft}
            <button type="button" class="secondary-button" disabled={saving} onclick={cancelCapture}>Cancel</button>
          {:else}
            <button type="button" class="secondary-button" disabled={saving} onclick={() => (newMemoryStep = "capture")}>Back</button>
          {/if}
          <button type="submit" class="card-button" disabled={saving || enriching || !boardReady}>
            {saving ? "Saving…" : enriching ? "Finding tags…" : boardReady ? "Create card" : "Loading board…"}
          </button>
        </footer>
      </form>
    {/if}
  </dialog>
