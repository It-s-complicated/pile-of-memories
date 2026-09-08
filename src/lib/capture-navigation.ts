import { goto } from "$app/navigation";
import { page } from "$app/state";

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
  const url = new URL((page.shallow?.url ?? page.url).href);
  if (url.searchParams.get("action") !== "new-memory" || page.state.captureHistory) return;
  // A shortcut launch needs a board entry beneath it so Back stays in the app.
  url.searchParams.delete("action");
  await goto(url, { shallow: true, replace: true, state: page.state });
  await openCapture();
}

export function closeCapture(): void {
  if ((page.shallow?.url ?? page.url).searchParams.get("action") !== "new-memory") return;
  if (page.state.captureHistory) {
    history.back();
  } else {
    const url = new URL((page.shallow?.url ?? page.url).href);
    url.searchParams.delete("action");
    void goto(url, { shallow: true, replace: true, state: page.state });
  }
}
