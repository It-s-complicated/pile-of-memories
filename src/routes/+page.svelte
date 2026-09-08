<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { initializeCaptureHistory } from "#lib/capture-navigation.js";
  import App from "../App.svelte";
  import { authClient } from "#lib/auth-client.js";

  const session = authClient.useSession();
  let working = $state(false);
  let authError = $state("");

  onMount(() => {
    void initializeCaptureHistory();
  });

  async function signIn(): Promise<void> {
    working = true;
    authError = "";
    const url = page.shallow?.url ?? page.url;
    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL: url.pathname + url.search + url.hash,
    });
    if (result.error) {
      authError = result.error.message ?? "GitHub sign-in failed.";
      working = false;
    }
  }

  async function signOut(): Promise<void> {
    working = true;
    authError = "";
    const result = await authClient.signOut();
    if (result.error) authError = result.error.message ?? "Sign-out failed.";
    working = false;
  }
</script>

<svelte:head><title>Pile of Memories</title></svelte:head>

{#if $session.isPending}
  <main class="access-screen" aria-busy="true">
    <p class="catalog-label" role="status">Opening private collection…</p>
  </main>
{:else if $session.data}
  <App />
  <button class="chip-button sign-out" type="button" onclick={signOut} disabled={working}>
    {working ? "Closing…" : "Sign out"}
  </button>
  {#if authError}<p class="status-pill" role="alert">{authError}</p>{/if}
{:else}
  <main class="access-screen">
    <section class="access-slip" aria-labelledby="access-title">
      <p class="catalog-label">Private collection · owner access</p>
      <h1 id="access-title">Pile of Memories</h1>
      <p class="access-copy">
        This drawer belongs to one collector. Continue with the approved GitHub account to open it.
      </p>
      <button class="card-button login-button" type="button" onclick={signIn} disabled={working}>
        {working ? "Redirecting…" : "Continue with GitHub"}
      </button>
      {#if authError || $session.error}
        <p class="access-error" role="alert">
          {authError || $session.error?.message || "Authentication failed."}
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

  .sign-out {
    position: fixed;
    z-index: 7;
    top: 4.3rem;
    left: 1rem;
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
