<script lang="ts">
  import { getBoardControls } from "../lib/board-controls.svelte.js";
  import { getAccountControls } from "../lib/account-controls.svelte.js";

  const board = getBoardControls();
  const account = getAccountControls();

  const popoverId = $props.id();
  let popover: HTMLDivElement | undefined;

  function closePopover(): void {
    popover?.hidePopover();
  }

  function select(action: () => void | Promise<void>): void {
    closePopover();
    void action();
  }
</script>

<div class="board-tools">
  <button
    type="button"
    class="chip-button board-tools-trigger"
    popovertarget={popoverId}
  >
    Board tools
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>
  {#if !board.browseMode}<span class="board-mode">Arrange mode</span>{/if}
</div>

<div id={popoverId} class="board-tools-popover" popover="auto" role="group" aria-label="Board tools" bind:this={popover}>
  <div class="board-tool-group">
    <button
      type="button"
      class="board-tool"
      onclick={() => select(board.openList)}
      disabled={!board.canOpenMemories}
    >Memory list</button>
    <button
      type="button"
      class="board-tool"
      onclick={() => select(board.openArchive)}
      disabled={!board.canOpenMemories}
    >
      <span>Archive</span>
      <span class="tool-state">{board.archivedCount}</span>
    </button>
    <button
      type="button"
      class="board-tool"
      onclick={() => select(board.openLabels)}
      disabled={!board.canEditBoard}
    >Tags & topics</button>
  </div>
  <div class="board-tool-group">
    <button
      type="button"
      class="board-tool"
      aria-pressed={!board.browseMode}
      title="Arrange: drag cards to move them. Turn off to browse and pan over cards."
      onclick={() => select(board.toggleBrowseMode)}
      disabled={!board.canEditBoard}
    >
      <span>Arrange mode</span>
      <span class="tool-state">{board.browseMode ? "Off" : "On"}</span>
    </button>
    <button
      type="button"
      class="board-tool"
      onclick={() => select(board.previewLayout)}
      disabled={!board.canReorganize}
    >Reorganize</button>
  </div>
  <div class="board-tool-group">
    <a class="board-tool" href="/export" download data-sveltekit-reload onclick={closePopover}>Export memories</a>
    <button
      type="button"
      class="board-tool"
      onclick={() => select(account.signOut)}
      disabled={account.signingOut}
    >{account.signingOut ? "Closing…" : "Sign out"}</button>
  </div>
</div>

<style>
  .board-tools {
    position: absolute;
    z-index: 6;
    top: 4.3rem;
    left: 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .board-tools-trigger {
    min-height: 44px;
    gap: 0.5rem;
  }

  .board-mode {
    font-family: var(--font-label);
    font-size: 0.68rem;
    color: var(--muted);
  }

  .board-tools-popover {
    position: fixed;
    inset: calc(4.3rem + 44px + 0.4rem) auto auto 1rem;
    box-sizing: border-box;
    width: min(16rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 8.5rem);
    overflow-y: auto;
    margin: 0;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.35rem;
    color: var(--text);
    background: var(--paper);
    box-shadow: var(--shadow-slip);
  }

  .board-tool-group {
    display: grid;
  }

  .board-tool-group + .board-tool-group {
    margin-top: 0.35rem;
    border-top: 1px solid var(--hairline);
    padding-top: 0.35rem;
  }

  .board-tool {
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    min-height: 44px;
    gap: 1rem;
    border: 0;
    border-radius: 2px;
    padding: 0.55rem 0.65rem;
    font-size: 0.86rem;
    text-align: left;
    text-decoration: none;
    color: var(--text);
    background: transparent;
    cursor: pointer;
  }

  .board-tool:hover:not(:disabled) {
    background: var(--ink-tint);
  }

  .board-tool:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .tool-state {
    font-family: var(--font-label);
    font-size: 0.68rem;
    color: var(--muted);
  }

  .board-tool[aria-pressed="true"] .tool-state {
    color: var(--theme-ink);
  }

  .board-tools-trigger:focus-visible,
  .board-tool:focus-visible {
    outline: 2px solid var(--theme-ink);
    outline-offset: 3px;
  }
</style>
