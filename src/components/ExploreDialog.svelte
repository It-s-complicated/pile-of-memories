<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Card } from "../lib/card";
  import {
    MAX_EXPLORATION_CARDS,
    relationshipLabels,
    buildIdeaDraft,
    type IdeaDraft,
    type ExplorationSuggestion,
    type ReflectionResult,
  } from "../lib/exploration";
  import { suggestExploration, reflectOnCards } from "../lib/exploration.remote";
  import { trackExplorationEvent } from "../lib/exploration-analytics.remote";
  import type { ExplorationEvent } from "../lib/exploration-analytics";
  import { showModal } from "../lib/dialog";
  import { getErrorMessage } from "../lib/errors";
  import { parseMarkdown } from "../lib/markdown";
  import MemoryMarkdown from "./MemoryMarkdown.svelte";

  let { seedId, cards, onclose, onsave, active = true }: {
    seedId: string;
    cards: Card[];
    onclose: () => void;
    onsave: (draft: IdeaDraft) => void;
    active?: boolean;
  } = $props();

  const dialogId = $props.id();
  const sessionId = crypto.randomUUID();
  const selectionSources: Record<string, "suggested" | "manual"> = {};
  let question = $state("");
  let additionalIds = $state<string[]>([]);
  let search = $state("");
  let expandedSourceId = $state("");
  let suggestions = $state.raw<{
    key: string;
    items: ExplorationSuggestion[];
    scannedCount: number;
    totalCount: number;
  }>();
  let reflection = $state.raw<{ key: string; result: ReflectionResult }>();
  let relatedError = $state<{ key: string; message: string }>();
  let reflectionError = $state<{ key: string; message: string }>();
  let findingKey = $state<string>();
  let reflectingKey = $state<string>();
  let relatedGeneration = 0;
  let reflectionGeneration = 0;
  let mounted = false;

  const seed = $derived(cards.find((card) => card.id === seedId));
  const selectedIds = $derived([seedId, ...additionalIds.filter((id) => id !== seedId)]);
  const selectedCards = $derived(selectedIds.flatMap((id) => {
    const card = cards.find((candidate) => candidate.id === id);
    return card ? [card] : [];
  }));
  const relatedKey = $derived(JSON.stringify([seedId, seed?.updatedAt, seed?.body, question.trim()]));
  const contextKey = $derived(JSON.stringify([
    question.trim(),
    selectedCards.map(({ id, title, body, updatedAt }) => [id, title, body, updatedAt]),
  ]));
  const currentSuggestions = $derived(suggestions?.key === relatedKey ? suggestions : undefined);
  const currentReflection = $derived(reflection?.key === contextKey ? reflection.result : undefined);
  const finding = $derived(findingKey === relatedKey);
  const reflecting = $derived(reflectingKey === contextKey);
  const full = $derived(selectedCards.length >= MAX_EXPLORATION_CARDS);
  const searchMatches = $derived(search.trim() ? cards.filter((card) =>
    !selectedIds.includes(card.id) &&
    [card.title, card.body, ...card.tags, ...card.topics].join(" ").toLowerCase().includes(search.trim().toLowerCase()),
  ) : []);

  onMount(() => {
    mounted = true;
    track("opened", { selectedCardCount: selectedCards.length });
    void findRelated();
    return () => {
      track("closed", { selectedCardCount: selectedCards.length });
      mounted = false;
      relatedGeneration += 1;
      reflectionGeneration += 1;
    };
  });

  function track(event: ExplorationEvent["event"], details: Omit<ExplorationEvent, "sessionId" | "event"> = {}): void {
    void trackExplorationEvent({ sessionId, event, ...details }).catch(() => {});
  }

  function toggleCard(id: string, source: "suggested" | "manual" = "manual"): void {
    if (id === seedId) return;
    if (additionalIds.includes(id)) {
      additionalIds = additionalIds.filter((value) => value !== id);
      track("card_removed", { selectedCardCount: selectedCards.length, selectionSource: selectionSources[id] ?? source });
      delete selectionSources[id];
    } else if (!full) {
      additionalIds = [...additionalIds, id];
      selectionSources[id] = source;
      track("card_added", { selectedCardCount: selectedCards.length, selectionSource: source });
    }
  }

  async function findRelated(): Promise<void> {
    if (!seed || finding) return;
    const key = relatedKey;
    const generation = ++relatedGeneration;
    findingKey = key;
    relatedError = undefined;
    try {
      const result = await suggestExploration({ seedId, question: question.trim(), sessionId });
      if (!mounted || generation !== relatedGeneration || key !== relatedKey) return;
      suggestions = { key, items: result.suggestions, scannedCount: result.scannedCount, totalCount: result.totalCount };
    } catch (caught) {
      if (mounted && generation === relatedGeneration && key === relatedKey) {
        relatedError = { key, message: getErrorMessage(caught, "Related cards could not be found. Try again, or add cards yourself.") };
      }
    } finally {
      if (mounted && generation === relatedGeneration) findingKey = undefined;
    }
  }

  async function reflect(): Promise<void> {
    if (!seed || reflecting || !selectedCards.length) return;
    const key = contextKey;
    const generation = ++reflectionGeneration;
    reflectingKey = key;
    reflectionError = undefined;
    try {
      const result = await reflectOnCards({ cardIds: selectedCards.map(({ id }) => id), question: question.trim(), sessionId });
      if (!mounted || generation !== reflectionGeneration || key !== contextKey) return;
      reflection = { key, result };
    } catch (caught) {
      if (mounted && generation === reflectionGeneration && key === contextKey) {
        reflectionError = { key, message: getErrorMessage(caught, "The reflection could not be completed. Try again.") };
      }
    } finally {
      if (mounted && generation === reflectionGeneration) reflectingKey = undefined;
    }
  }

  async function showSource(id: string): Promise<void> {
    expandedSourceId = id;
    await tick();
    const target = document.getElementById(`${dialogId}-source-${id}`);
    target?.scrollIntoView({ block: "nearest" });
    target?.querySelector("summary")?.focus();
  }

  function selectIdea(idea: ReflectionResult["ideas"][number], ideaIndex: number): void {
    if (!currentReflection) return;
    const origin = {
      sessionId,
      runId: currentReflection.runId,
      ideaIndex,
      sourceCardCount: new Set(idea.sourceIds).size,
    };
    track("draft_selected", { runId: origin.runId, ideaIndex, selectedCardCount: origin.sourceCardCount });
    onsave(buildIdeaDraft(idea, selectedCards, question, origin));
  }
</script>

{#snippet references(ids: string[])}
  <ul class="references" aria-label="Source cards">
    {#each [...new Set(ids)] as id (id)}
      {@const card = selectedCards.find((candidate) => candidate.id === id)}
      {#if card}
        <li><button type="button" class="source-link" onclick={() => showSource(id)}>{card.title}</button></li>
      {/if}
    {/each}
  </ul>
{/snippet}

<dialog
  class="memory-dialog exploration-dialog nodrag nopan nowheel"
  aria-labelledby={`${dialogId}-title`}
  oncancel={(event) => { event.preventDefault(); onclose(); }}
  {@attach active ? showModal : undefined}
>
  <div class="exploration-content">
    <header>
      <p>Explore</p>
      <h2 id={`${dialogId}-title`}>Follow a thought</h2>
      <div class="intro">Bring a few cards together and see what they might inspire.</div>
    </header>

    {#if !seed}
      <p class="error" role="alert">The starting card is no longer on the board. Close this exploration and choose another card.</p>
    {/if}

    <div class="exploration-columns">
      <section class="context" aria-labelledby={`${dialogId}-context`}>
        <div class="section-heading">
          <h3 id={`${dialogId}-context`}>Cards to think with</h3>
          <span class="count">{selectedCards.length} / {MAX_EXPLORATION_CARDS}</span>
        </div>
        <div class="selected-cards">
          {#each selectedCards as card (card.id)}
            <div class="selected-card">
              <details id={`${dialogId}-source-${card.id}`} open={expandedSourceId === card.id}>
                <summary>
                  <span>{card.title}</span>
                  {#if card.id === seedId}<span class="relationship">Starting card</span>{/if}
                </summary>
                <div class="card-body"><MemoryMarkdown parsed={parseMarkdown(card.body)} /></div>
              </details>
              {#if card.id !== seedId}
                <button class="source-link remove" type="button" aria-label={`Remove ${card.title}`} onclick={() => toggleCard(card.id)}>Remove</button>
              {/if}
            </div>
          {/each}
        </div>

        <label class="memory-field question">
          <span>What would you like to explore? <span class="optional">Optional</span></span>
          <textarea bind:value={question} rows="3" maxlength="1000" placeholder="What connects these? What could they become?"></textarea>
        </label>

        <section class="related" aria-labelledby={`${dialogId}-related`}>
          <div class="section-heading">
            <h3 id={`${dialogId}-related`}>Related cards</h3>
            <button type="button" class="source-link" onclick={findRelated} disabled={finding || !seed}>
              {#if finding}Looking…{:else if currentSuggestions}Refresh{:else}Find related{/if}
            </button>
          </div>
          {#if finding}
            <p class="hint" role="status">Looking for useful connections and other perspectives…</p>
          {:else if relatedError?.key === relatedKey}
            <p class="error" role="alert">{relatedError.message}</p>
          {:else if currentSuggestions}
            {#if currentSuggestions.items.length}
              <ul class="suggestions">
                {#each currentSuggestions.items as suggestion (suggestion.cardId)}
                  {@const card = cards.find((candidate) => candidate.id === suggestion.cardId)}
                  {#if card}
                    <li>
                      <label class="suggestion">
                        <input type="checkbox" checked={selectedIds.includes(card.id)} disabled={!selectedIds.includes(card.id) && full} onchange={() => toggleCard(card.id, "suggested")} />
                        <span><span class="suggestion-title">{card.title}</span><span class="relationship">{relationshipLabels[suggestion.relationship]}</span></span>
                      </label>
                    </li>
                  {/if}
                {/each}
              </ul>
            {:else}
              <p class="hint">No strong connections found. Add a card from the pile, or reflect on your starting card.</p>
            {/if}
            {#if currentSuggestions.scannedCount < currentSuggestions.totalCount}
              <p class="hint">Considered {currentSuggestions.scannedCount} of {currentSuggestions.totalCount} other cards. You can add any card below.</p>
            {/if}
          {:else}
            <p class="hint">Find related cards for your question, or choose cards yourself.</p>
          {/if}
        </section>

        <details class="add-cards">
          <summary>Add cards from the pile</summary>
          <label class="memory-field search">
            <span>Search your cards</span>
            <input type="search" bind:value={search} placeholder="Title, text, tag, or topic" />
          </label>
          {#if search.trim()}
            <ul class="manual-cards">
              {#each searchMatches.slice(0, 12) as card (card.id)}
                <li><span>{card.title}</span><button type="button" class="source-link" disabled={full} aria-label={`Add ${card.title}`} onclick={() => toggleCard(card.id)}>Add</button></li>
              {:else}
                <li class="hint">No other cards match this search.</li>
              {/each}
            </ul>
            {#if searchMatches.length > 12}<p class="hint">Showing 12 cards. Narrow your search to find another.</p>{/if}
          {/if}
        </details>
        {#if full}<p class="hint" role="status">You have selected {MAX_EXPLORATION_CARDS} cards. Remove one to make room for another.</p>{/if}
      </section>

      <section class="reflection" aria-labelledby={`${dialogId}-reflection`} aria-busy={reflecting}>
        <h3 id={`${dialogId}-reflection`}>Reflection</h3>
        {#if reflecting}
          <div class="reflection-empty" role="status"><p>Reading your chosen cards together…</p><p class="hint">Looking for common threads, tensions, and possibilities.</p></div>
        {:else if reflectionError?.key === contextKey}
          <p class="error" role="alert">{reflectionError.message}</p>
        {:else if currentReflection}
          <section class="reflection-section">
            <h4>What stands out</h4>
            {#each currentReflection.observations as observation, index (index)}
              <div class="observation"><div class="reflection-prose"><MemoryMarkdown parsed={parseMarkdown(observation.text)} /></div>{@render references(observation.sourceIds)}</div>
            {/each}
          </section>
          <section class="reflection-section">
            <h4>Possibilities to explore</h4>
            <p class="hint">New ideas inspired by these cards.</p>
            {#each currentReflection.ideas as idea, index (index)}
              <article class="idea">
                <h5>{idea.title}</h5>
                <div class="reflection-prose"><MemoryMarkdown parsed={parseMarkdown(idea.body)} /></div>
                {@render references(idea.sourceIds)}
                <button type="button" class="secondary-button" onclick={() => selectIdea(idea, index)}>Save as new card</button>
              </article>
            {/each}
          </section>
          {#if currentReflection.questions.length}
            <section class="reflection-section">
              <h4>Questions to take further</h4>
              <ul class="questions">{#each currentReflection.questions as followUp, index (index)}<li><button type="button" class="source-link" onclick={() => { question = followUp; }}>{followUp}</button></li>{/each}</ul>
            </section>
          {/if}
        {:else}
          <div class="reflection-empty"><p>{reflection ? "Your context has changed." : "A connection can become a new thought."}</p><p class="hint">{reflection ? "Reflect again to work with your current cards and question." : "Choose the cards you want to think with, add a question if you have one, then reflect."}</p></div>
        {/if}
      </section>
    </div>

    <footer>
      <button type="button" class="secondary-button" onclick={onclose}>Close</button>
      <button type="button" class="card-button" onclick={reflect} disabled={reflecting || !seed || !selectedCards.length}>
        {#if reflecting}Reflecting…{:else if selectedCards.length === 1}Reflect on this card{:else}Reflect on {selectedCards.length} cards{/if}
      </button>
    </footer>
  </div>
</dialog>

<style>
  .exploration-dialog { width: min(60rem, calc(100vw - 2rem)); }
  .exploration-content { padding: 1.25rem 1.25rem 0; }
  .intro { max-width: 65ch; margin-top: 0.6rem; color: var(--muted); line-height: 1.5; }
  .exploration-columns { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); margin-top: 1.5rem; }
  .context { min-width: 0; padding-right: 1.5rem; }
  .reflection { min-width: 0; border-left: 1px solid var(--hairline); padding-left: 1.5rem; }
  .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
  h3, h4, h5 { margin: 0; color: var(--text); font-weight: 600; }
  h3 { font-size: 1rem; }
  h4 { font-size: 1rem; }
  h5 { font-size: 1rem; }
  .count, .relationship { color: var(--muted); font-family: var(--font-label); font-size: 0.68rem; }
  .count { white-space: nowrap; }
  .selected-cards { margin-top: 0.65rem; }
  .selected-card { padding: 0.65rem 0; border-bottom: 1px solid var(--hairline); }
  summary { cursor: pointer; line-height: 1.5; overflow-wrap: anywhere; }
  summary .relationship { display: block; margin-left: 1rem; margin-top: 0.2rem; }
  .card-body { max-height: 17rem; overflow: auto; margin-top: 0.75rem; padding-right: 0.35rem; font-size: 0.86rem; line-height: 1.5; overflow-wrap: anywhere; }
  .source-link { border: 0; padding: 0.25rem 0; color: var(--theme-ink); background: transparent; font: inherit; text-align: left; text-decoration: underline; text-underline-offset: 0.18em; cursor: pointer; }
  .source-link:hover:not(:disabled) { color: var(--ink-strong); }
  .source-link:disabled { color: var(--muted); cursor: not-allowed; }
  .source-link:focus-visible, summary:focus-visible, input[type="checkbox"]:focus-visible { outline: 2px solid var(--theme-ink); outline-offset: 3px; }
  .remove { margin-top: 0.35rem; font-size: 0.86rem; }
  .question, .related, .add-cards { margin-top: 1.5rem; }
  .optional { font-family: var(--font-body); text-transform: none; letter-spacing: normal; }
  .hint { margin: 0.6rem 0; color: var(--muted); font-size: 0.86rem; line-height: 1.5; }
  .error { color: var(--danger); line-height: 1.5; }
  .suggestions, .manual-cards, .references { list-style: none; margin: 0; padding: 0; }
  .suggestions li, .manual-cards li { border-bottom: 1px solid var(--hairline); }
  .suggestion { display: flex; align-items: flex-start; gap: 0.65rem; padding: 0.65rem 0; cursor: pointer; }
  .suggestion input { flex: none; margin-top: 0.2rem; accent-color: var(--theme-ink); }
  .suggestion-title, .suggestion .relationship { display: block; }
  .suggestion-title { line-height: 1.4; overflow-wrap: anywhere; }
  .suggestion .relationship { margin-top: 0.25rem; }
  .search { margin-top: 0.75rem; }
  .manual-cards li { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; padding: 0.5rem 0; font-size: 0.86rem; }
  .manual-cards li > span { overflow-wrap: anywhere; }
  .manual-cards button { flex: none; }
  .reflection-empty { padding: 2.5rem 0; max-width: 45ch; line-height: 1.6; }
  .reflection-empty > p:first-child { margin: 0; }
  .reflection-section { margin-top: 1.5rem; }
  .observation { margin-top: 1rem; }
  .reflection-prose { font-size: 1rem; line-height: 1.6; overflow-wrap: anywhere; }
  .reflection-prose :global(p:first-child) { margin-top: 0.5rem; }
  .reflection-prose :global(p:last-child) { margin-bottom: 0.5rem; }
  .references { display: flex; flex-wrap: wrap; gap: 0.2rem 0.75rem; font-size: 0.86rem; }
  .idea { padding-block: 1rem; border-bottom: 1px solid var(--hairline); }
  .idea .secondary-button { margin-top: 0.75rem; }
  .questions { margin: 0.5rem 0 0; padding-left: 1.1rem; }
  .questions li { margin-top: 0.5rem; }
  .questions button { line-height: 1.5; }
  footer { margin-top: 1.5rem; }
  @media (pointer: coarse) { .source-link, summary, .suggestion { min-height: 44px; box-sizing: border-box; } }
  @media (max-width: 700px) {
    .exploration-columns { grid-template-columns: minmax(0, 1fr); }
    .context { padding-right: 0; }
    .reflection { border-left: 0; border-top: 1px solid var(--hairline); margin-top: 1.5rem; padding: 1.5rem 0 0; }
    .reflection-empty { padding: 1.25rem 0; }
  }
  @media (max-width: 520px) {
    .exploration-dialog { width: 100vw; max-width: 100vw; max-height: 100dvh; border: 0; border-radius: 0; }
    .exploration-content { padding: 1rem 1rem 0; }
  }
</style>
