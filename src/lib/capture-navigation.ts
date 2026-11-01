import { goto } from "$app/navigation";
import { page } from "$app/state";
import { clearSharedMemoryFields, getSharedMemoryBody } from "./shared-memory";

export async function openCapture(): Promise<void> {
  const url = new URL((page.shallow?.url ?? page.url).href);
  if (url.searchParams.get("action") === "new-memory") return;
  url.searchParams.set("action", "new-memory");
  await goto(url, {
    shallow: true,
    state: { ...page.state, captureHistory: true },
    persistState: true,
  });
}

export async function initializeCaptureHistory(): Promise<void> {
  if (page.state.captureHistory) return;
  const url = new URL((page.shallow?.url ?? page.url).href);
  if (getSharedMemoryBody(url.searchParams)) {
    url.searchParams.set("action", "new-memory");
    url.searchParams.delete("memory");
  }
  if (url.searchParams.get("action") !== "new-memory") return;
  const captureUrl = new URL(url);
  // A shortcut launch needs a board entry beneath it so Back stays in the app.
  // Keep incoming content only on the capture entry until the dialog reads it.
  url.searchParams.delete("action");
  clearSharedMemoryFields(url);
  await goto(url, { shallow: true, replace: true, state: page.state });
  await goto(captureUrl, {
    shallow: true,
    state: { ...page.state, captureHistory: true },
    persistState: true,
  });
}

export async function clearSharedMemoryUrl(): Promise<void> {
  const source = page.shallow?.url ?? page.url;
  const url = new URL(source.href);
  clearSharedMemoryFields(url);
  if (url.href !== source.href) {
    await goto(url, { shallow: true, replace: true, state: page.state, persistState: true });
  }
}

export async function closeCapture(): Promise<void> {
  if ((page.shallow?.url ?? page.url).searchParams.get("action") !== "new-memory") return;
  await clearSharedMemoryUrl();
  if (page.state.captureHistory) {
    history.back();
  } else {
    const url = new URL((page.shallow?.url ?? page.url).href);
    url.searchParams.delete("action");
    await goto(url, { shallow: true, replace: true, state: page.state });
  }
}
