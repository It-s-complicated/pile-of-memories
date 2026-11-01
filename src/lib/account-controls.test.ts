import { beforeEach, expect, it, vi } from "vite-plus/test";

const { page, goto, signIn } = vi.hoisted(() => {
  const page = {
    url: new URL("https://memories.test/"),
    shallow: null as { url: URL } | null,
    state: {} as App.PageState,
  };
  return {
    page,
    goto: vi.fn(async (url: URL, options: { state?: App.PageState }) => {
      page.shallow = { url };
      page.state = options.state ?? {};
    }),
    signIn: vi.fn<(input: { provider: string; callbackURL: string }) => Promise<{ error: null }>>(),
  };
});

vi.mock("$app/navigation", () => ({ goto, invalidateAll: vi.fn() }));
vi.mock("$app/state", () => ({ page }));
vi.mock("./auth-client", () => ({ authClient: { signIn: { social: signIn } } }));

import { AccountState } from "./account-controls.svelte";
import { clearSharedMemoryUrl, initializeCaptureHistory } from "./capture-navigation";
import { getSharedMemoryBody } from "./shared-memory";

beforeEach(() => {
  page.url = new URL("https://memories.test/");
  page.shallow = null;
  page.state = {};
  goto.mockClear();
  signIn.mockReset().mockResolvedValue({ error: null });
});

it.each([false, true])(
  "preserves incoming shares through sign-in (history prepared: %s)",
  async (prepared) => {
    const incoming = new URL("https://memories.test/?keep=1#board");
    incoming.searchParams.set("share_title", "Grüße 👋");
    incoming.searchParams.set("share_text", "Read https://example.com/a%3Fb?q=a+b&lang=日本語");
    incoming.searchParams.set("share_url", "https://example.com/other?item=2#section");
    page.url = incoming;
    const body = getSharedMemoryBody(incoming.searchParams);
    if (prepared) await initializeCaptureHistory();
    const source = page.shallow?.url ?? page.url;

    await new AccountState(vi.fn()).signIn();

    expect(signIn).toHaveBeenCalledExactlyOnceWith({
      provider: "github",
      callbackURL: source.pathname + source.search + source.hash,
    });
    const callback = signIn.mock.calls[0][0].callbackURL;
    expect(getSharedMemoryBody(new URL(callback, incoming.origin).searchParams)).toBe(body);

    // OAuth returns to a fresh document; URL fields carry the share, without a draft store.
    page.url = new URL(callback, incoming.origin);
    page.shallow = null;
    page.state = {};
    goto.mockClear();
    await initializeCaptureHistory();
    expect(getSharedMemoryBody(page.shallow!.url.searchParams)).toBe(body);
    expect(page.shallow!.url.searchParams.get("action")).toBe("new-memory");
    expect(goto.mock.calls[0][0].href).toBe("https://memories.test/?keep=1#board");

    // Capture reads the incoming text before consuming its URL parameters.
    await clearSharedMemoryUrl();
    expect(page.shallow!.url.href).toBe("https://memories.test/?keep=1&action=new-memory#board");
    expect(getSharedMemoryBody(page.shallow!.url.searchParams)).toBeNull();
  },
);
