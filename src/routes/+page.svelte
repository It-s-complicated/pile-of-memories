<script lang="ts">
  import { onMount } from "svelte";
  import type { PageData } from "./$types";
  import { initializeCaptureHistory } from "#lib/capture-navigation.js";
  import { createAccountControls } from "#lib/account-controls.svelte.js";
  import App from "../App.svelte";
  import BoardNotice from "../components/BoardNotice.svelte";

  let { data }: { data: PageData } = $props();
  let boardView = $state<App>();
  const account = createAccountControls(async () => {
    await boardView?.clearCache();
  });

  onMount(() => {
    void initializeCaptureHistory();
    return account.mount();
  });
</script>

<svelte:head><title>Pile of Memories</title></svelte:head>

{#if data.userId && !account.signedOut}
  {#key data.userId}
    <App userId={data.userId} bind:this={boardView} />
  {/key}
  {#if account.authError}<BoardNotice message={account.authError} role="alert" />{/if}
{:else}
  <main class="access-screen">
    <section class="access-slip" aria-labelledby="access-title">
      <p class="catalog-label">Private collection · owner access</p>
      <h1 id="access-title">Pile of Memories</h1>
      <p class="access-copy">
        This drawer belongs to one collector. Continue with the approved GitHub account to open it.
      </p>
      <button class="card-button login-button" type="button" onclick={account.signIn} disabled={account.working}>
        {account.working ? "Redirecting…" : "Continue with GitHub"}
      </button>
      {#if account.authError}
        <p class="access-error" role="alert">
          {account.authError}
        </p>
      {/if}
      <p class="catalog-label access-note">No other GitHub account can access this board.</p>
    </section>
  </main>
{/if}

<style>
  .access-screen {
    display: grid;
    min-height: 100dvh;
    place-items: center;
    padding: 2rem;
    box-sizing: border-box;
    background: var(--sheet);
  }

  .access-screen::after {
    position: fixed;
    inset: 0.6rem;
    border: 1px solid color-mix(in oklch, var(--theme-ink) 42%, var(--sheet));
    border-radius: 4px;
    pointer-events: none;
    content: "";
  }

  .access-slip {
    width: min(100%, 28rem);
    padding: 2.25rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    box-sizing: border-box;
    background: var(--paper);
    box-shadow: var(--shadow-dialog);
  }

  .catalog-label,
  .login-button {
    font-family: var(--font-label);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .catalog-label {
    margin: 0 0 1.1rem;
    color: var(--muted);
  }

  h1 {
    margin: 0;
    color: var(--ink-strong);
    font-size: clamp(1.8rem, 7vw, 2.8rem);
    line-height: 1;
    letter-spacing: -0.03em;
  }

  .access-copy {
    max-width: 34ch;
    margin: 1.25rem 0 1.75rem;
    font-size: 0.95rem;
    line-height: 1.55;
  }

  .login-button {
    width: 100%;
    min-height: 2.8rem;
  }

  .access-note {
    margin: 1rem 0 0;
    line-height: 1.5;
  }

  .access-error {
    margin: 1rem 0 0;
    color: var(--danger);
    font-size: 0.85rem;
  }

  @media (max-width: 520px) {
    .access-screen {
      padding: 1.25rem;
    }

    .access-slip {
      padding: 1.6rem;
    }
  }
</style>
