<script lang="ts">
  import { onMount } from "svelte";
  import App from "../App.svelte";
  import { initializeCaptureHistory } from "../lib/capture-navigation";
  import { browserStorage, createSnapshotBackend, type BoardBackend, type BoardSnapshot, type EnrichmentPlugin, type SnapshotStorage } from "../lib/board-backend";

  let { enrichMemory, connectAirspace }: { enrichMemory?: EnrichmentPlugin; connectAirspace?: () => Promise<SnapshotStorage | undefined> } = $props();
  let backend = $state.raw<BoardBackend>();
  let storageId = $state("");
  let snapshot = $state.raw<BoardSnapshot>();
  let busy = $state(false);
  let message = $state("");
  let remote = $state(false);

  onMount(() => {
    void initializeCaptureHistory();
    remote = !!connectAirspace && new URL(window.location.href).searchParams.get("storage") === "airspace";
  });

  async function open(storage: SnapshotStorage) {
    const operations = createSnapshotBackend(storage, (cards) => { snapshot = cards; });
    await operations.refresh();
    storageId = storage.id;
    backend = {
      ...operations,
      getLiveBoard: () => ({
        get current() { return snapshot; },
        get ready() { return snapshot !== undefined; },
        connected: true,
        error: undefined,
        reconnect: () => operations.refresh(),
      }),
    };
  }

  async function connect(event?: SubmitEvent) {
    event?.preventDefault();
    busy = true;
    message = "";
    try {
      if (remote) {
        const storage = await connectAirspace?.();
        if (storage) await open(storage);
      } else {
        await open(browserStorage());
      }
    } catch (error) {
      message = error instanceof Error ? error.message : "Could not open this board. Please try again.";
    } finally {
      busy = false;
    }
  }

  async function refresh() {
    try { await backend?.getLiveBoard().reconnect(); }
    catch { message = "Could not reload the board. Check your connection and try again."; }
  }
</script>

<svelte:window onstorage={(event) => { if (event.key === storageId) void refresh(); }} />

{#if backend}
  {#key storageId}<App userId={storageId} {backend} {enrichMemory} />{/key}
  {#if remote}
    <button type="button" class="chip-button reload-board" onclick={refresh}>Reload board</button>
  {/if}
  {#if message}<p class="status-pill" role="alert">{message}</p>{/if}
{:else}
  <main class="board-access">
    <section aria-labelledby="board-title">
      <h1 id="board-title">Pile of Memories</h1>
      <p>Choose where this pile lives.</p>
      <form onsubmit={connect}>
        <label class="memory-field">
          <span>Storage</span>
          <select bind:value={remote} disabled={busy}>
            <option value={false}>This browser</option>
            {#if connectAirspace}<option value={true}>Airspace · private AT Protocol space</option>{/if}
          </select>
        </label>
        {#if remote}
          <p>Requires a PDS with experimental private spaces. Use one editor at a time; reload to see changes from another device.</p>
          <p>Uses your signed-in account and discovers its PDS automatically. You may be asked to approve board storage permissions.</p>
        {:else}
          <p>Works without an account or connection. Memories stay in this browser; clearing site data deletes them.</p>
        {/if}
        {#if message}<p role="alert">{message}</p>{/if}
        <button type="submit" class="card-button" disabled={busy}>{busy ? "Opening…" : "Open board"}</button>
      </form>
    </section>
  </main>
{/if}

<style>
  .board-access { display: grid; min-height: 100dvh; place-items: center; padding: 1.5rem; box-sizing: border-box; }
  section { width: min(100%, 28rem); }
  h1 { color: var(--ink-strong); }
  p { line-height: 1.5; }
  select { padding: 0.65rem; color: var(--text); background: var(--paper); border: 1px solid var(--hairline); border-radius: 3px; font: inherit; }
  .reload-board { position: fixed; top: 7rem; left: 1rem; z-index: 7; }
</style>
