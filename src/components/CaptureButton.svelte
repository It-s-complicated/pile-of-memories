<script lang="ts">
  let { disabled = false, onclick }: {
    disabled?: boolean;
    onclick: () => void;
  } = $props();
</script>

<div class="capture-cluster">
  <button
    type="button"
    class="fab"
    aria-label="New memory"
    title="New memory"
    {onclick}
    {disabled}
  >
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  </button>
</div>

<style>
  .capture-cluster {
    position: absolute;
    z-index: 6;
    right: max(1.25rem, env(safe-area-inset-right));
    bottom: max(1.25rem, env(safe-area-inset-bottom));
  }

  .fab {
    display: grid;
    width: 3.5rem;
    height: 3.5rem;
    place-items: center;
    border: 0;
    border-radius: 50%;
    padding: 0;
    line-height: 1;
    color: var(--paper);
    background: var(--theme-ink);
    box-shadow: var(--shadow-slip);
    cursor: pointer;
  }

  .fab:hover:not(:disabled) {
    background: var(--ink-strong);
  }

  .fab:focus-visible {
    outline: 2px solid var(--theme-ink);
    outline-offset: 3px;
  }

  .fab:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
