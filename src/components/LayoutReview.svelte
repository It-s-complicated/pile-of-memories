<script lang="ts">
  let { saving, oncancel, onapply }: {
    saving: boolean;
    oncancel: () => void;
    onapply: () => void;
  } = $props();
</script>

<div class="layout-review" role="group" aria-label="Layout preview">
  <button
    type="button"
    class="chip-button"
    onclick={oncancel}
    disabled={saving}
  >Cancel</button>
  <button
    type="button"
    class="card-button"
    onclick={onapply}
    disabled={saving}
  >{saving ? "Saving…" : "Apply layout"}</button>
</div>

<style>
  .layout-review {
    position: absolute;
    z-index: 6;
    left: 50%;
    bottom: max(1.25rem, env(safe-area-inset-bottom));
    display: flex;
    gap: 0.5rem;
    transform: translateX(-50%);
  }

  .layout-review button {
    min-height: 44px;
  }

  @media (max-width: 520px) {
    .layout-review {
      right: 1rem;
      bottom: max(8.5rem, calc(env(safe-area-inset-bottom) + 7.25rem));
      left: 1rem;
      justify-content: flex-end;
      transform: none;
    }
  }
</style>
