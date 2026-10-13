<script lang="ts">
  let { message, role = "status", onreconnect }: {
    message: string;
    role?: "status" | "alert";
    onreconnect?: () => void;
  } = $props();
</script>

<p class="status-pill" {role}>
  {message}
  {#if onreconnect}
    <button type="button" onclick={onreconnect}>Reconnect</button>
  {/if}
</p>

<style>
  .status-pill {
    position: absolute;
    z-index: 6;
    top: 0.9rem;
    left: 50%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-sizing: border-box;
    width: max-content;
    max-width: calc(100% - 2rem);
    margin: 0;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0.4rem 0.7rem;
    font-family: var(--font-label);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    line-height: 1.5;
    color: var(--text);
    background: var(--paper);
    box-shadow: var(--shadow-slip);
    transform: translateX(-50%);
  }

  .status-pill[role="alert"] {
    border-color: color-mix(in oklch, var(--danger) 45%, var(--paper));
    color: var(--danger);
  }

  .status-pill button {
    border: 0;
    padding: 0;
    font: inherit;
    color: var(--theme-ink);
    background: transparent;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  @media (max-width: 900px) {
    .status-pill {
      top: 8rem;
    }
  }
</style>
