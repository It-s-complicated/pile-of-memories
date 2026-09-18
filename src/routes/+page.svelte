<script lang="ts">
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import type { PageData } from "./$types";
  import { page } from "$app/state";
  import { initializeCaptureHistory } from "#lib/capture-navigation.js";

  import { enrichMemory } from "#lib/enrichment.remote.js";
  import { connectAtproto } from "#lib/plugins/atproto.js";
  import BoardLauncher from "../components/BoardLauncher.svelte";

  const AUTH_ERRORS: Record<string, string> = {
    handle: "Enter your handle or DID first.",
    "sign-in": "Could not start sign-in. Check the handle and try again.",
    callback: "Sign-in was rejected. Please try again.",
    denied: "This AT Protocol account is not approved for this board.",
  };

  let mounted = $state(false);
  let { data }: { data: PageData } = $props();
  let signedOut = $state(false);
  let working = $state(false);
  let signOutError = $state("");
  let authError = $derived(
    AUTH_ERRORS[page.url.searchParams.get("auth_error") ?? ""] ?? "",
  );

  onMount(() => {
    mounted = true;
    void initializeCaptureHistory();
    const channel = new BroadcastChannel("pile-of-memories-auth");
    channel.onmessage = () => {
      signedOut = true;
      void invalidateAll();
    };
    return () => channel.close();
  });

  async function signOut(): Promise<void> {
    working = true;
    signOutError = "";
    try {
      const response = await fetch("/auth/sign-out", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      const channel = new BroadcastChannel("pile-of-memories-auth");
      channel.postMessage("signed-out");
      channel.close();
      signedOut = true;
      await invalidateAll();
    } catch {
      signOutError = "Could not sign out. Please try again.";
    } finally {
      working = false;
    }
  }
</script>

<svelte:head><title>Pile of Memories</title></svelte:head>

{#if data.did && !signedOut}
  {#key data.did}
    {#if mounted}
      <BoardLauncher {enrichMemory} connectAirspace={connectAtproto} />
    {/if}
  {/key}
  <button class="chip-button sign-out" type="button" onclick={signOut} disabled={working}>
    {working ? "Closing…" : "Sign out"}
  </button>
  {#if signOutError || authError}<p class="status-pill" role="alert">{signOutError || authError}</p>{/if}
{:else}
  <main class="access-screen">
    <section class="access-slip" aria-labelledby="access-title">
      <p class="catalog-label">Private collection · owner access</p>
      <h1 id="access-title">Pile of Memories</h1>
      <p class="access-copy">
        This drawer belongs to one collector. Sign in with your AT Protocol account to open it.
      </p>
      <form class="sign-in-form" method="POST" action="/auth/sign-in">
        <input
          name="handle"
          placeholder="you.bsky.social or did:plc:…"
          autocomplete="username"
          required
        />
        <button class="card-button login-button" type="submit">Continue with AT Protocol</button>
      </form>
      {#if authError}
        <p class="access-error" role="alert">
          {authError}
        </p>
      {/if}
      <p class="catalog-label access-note">No other account can access this board.</p>
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

  .sign-in-form {
    display: grid;
    gap: 0.75rem;
  }

  .sign-in-form input {
    width: 100%;
    min-height: 2.8rem;
    padding: 0 0.9rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--sheet);
    color: var(--text);
    font: inherit;
    box-sizing: border-box;
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
