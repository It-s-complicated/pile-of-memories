<script lang="ts">
  import { onDestroy } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import TagEditor from "./TagEditor.svelte";
  import type { CardInput } from "../lib/card";
  import { fallbackTitle } from "../lib/enrichment";
  import type { CardCreationProvenance } from "../lib/enrichment-analytics";
  import { enrichMemory } from "../lib/enrichment.remote";
  import { partitionLabels } from "../lib/labels";
  import { parseMarkdown } from "../lib/markdown";

  let {
    tagVocabulary,
    oncreate,
    onclose,
    boardReady,
  }: {
    tagVocabulary: string[];
    onclose: () => void;
    boardReady: boolean;
    oncreate: (
      draft: Pick<CardInput, "title" | "body" | "tags" | "topics" | "links">,
      creation?: CardCreationProvenance,
    ) => Promise<void>;
  } = $props();

  type CachedEnrichment = {
    attemptId: string;
    title: string;
    tags: string[];
    warning: string;
  };

  const enrichmentCache = new SvelteMap<string, CachedEnrichment>();
  let newMemoryStep = $state<"capture" | "review">("capture");
  let memoryTitle = $state("");
  let memoryBody = $state("");
  let memoryLabels = $state<string[]>([]);
  let enrichmentWarning = $state("");
  let creationProvenance = $state<CardCreationProvenance>();
  let enrichmentGeneration = 0;
  let enrichingMemory = $state(false);
  let savingMemory = $state(false);
  let persistenceError = $state("");

  onDestroy(() => {
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

    const generation = enrichmentGeneration;
    enrichingMemory = true;
    enrichmentWarning = "";
    try {
      let enrichment = enrichmentCache.get(description);
      let resultSource: CardCreationProvenance["resultSource"] = "cache";
      if (!enrichment) {
        try {
          const result = await enrichMemory({
            description,
            existingTags: tagVocabulary,
          });
          enrichment = { ...result, warning: "" };
          enrichmentCache.set(description, enrichment);
          resultSource = "ai";
        } catch {
          enrichment = {
            attemptId: crypto.randomUUID(),
            title: fallbackTitle(memoryBody),
            tags: [],
            warning: "AI suggestions were unavailable. You can finish this memory manually.",
          };
          resultSource = "fallback";
        }
      }

      if (generation !== enrichmentGeneration || memoryBody.trim() !== description) return;

      memoryTitle = enrichment.title;
      memoryLabels = enrichment.tags;
      enrichmentWarning = enrichment.warning;
      creationProvenance = {
        enrichmentAttemptId: enrichment.attemptId,
        resultSource,
        reviewStartedAt: new Date().toISOString(),
      };
      newMemoryStep = "review";
    } finally {
      if (generation === enrichmentGeneration) enrichingMemory = false;
    }
  }

  async function addMemory(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (savingMemory || !boardReady) return;
    const generation = enrichmentGeneration;
    savingMemory = true;
    persistenceError = "";
    try {
      await oncreate(
        {
          title: memoryTitle.trim() || fallbackTitle(memoryBody),
          body: memoryBody,
          ...partitionLabels(memoryLabels),
          links: parseMarkdown(memoryBody).links,
        },
        creationProvenance,
      );
      if (generation === enrichmentGeneration) onclose();
    } catch (error) {
      persistenceError = error instanceof Error ? error.message : "The board could not be saved.";
    } finally {
      savingMemory = false;
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
            disabled={enrichingMemory}
            {@attach focusCapture}
          ></textarea>
        </label>
        <footer>
          <button type="button" class="secondary-button" onclick={onclose}>
            Cancel
          </button>
          <button type="submit" class="card-button" disabled={enrichingMemory}>
            {enrichingMemory ? "Thinking…" : "Continue"}
          </button>
        </footer>
      </form>
    {:else}
      <form method="dialog" onsubmit={addMemory}>
        <header>
          <p>Review</p>
          <h2 id="new-memory-title">New Memory</h2>
        </header>
        {#if enrichmentWarning}<p class="placement-note" role="status">{enrichmentWarning}</p>{/if}
        <label class="memory-field">
          <span>Title</span>
          <input bind:value={memoryTitle} maxlength="80" required />
        </label>
        <TagEditor id="new-memory-tags" bind:value={memoryLabels} suggestions={tagVocabulary} />
        <label class="memory-field">
          <span>Memory</span>
          <textarea bind:value={memoryBody} rows="10" maxlength="8000" required></textarea>
        </label>
        {#if persistenceError}<p role="alert">{persistenceError}</p>{/if}
        <footer>
          <button type="button" class="secondary-button" onclick={() => (newMemoryStep = "capture")}>
            Back
          </button>
          <button type="submit" class="card-button" disabled={savingMemory || !boardReady}>
            {savingMemory ? "Saving…" : boardReady ? "Create Memory" : "Loading board…"}
          </button>
        </footer>
      </form>
    {/if}
  </dialog>
