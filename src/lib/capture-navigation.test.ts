import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { page, goto } = vi.hoisted(() => {
  const page = {
    url: new URL("https://memories.test/?keep=1#board"),
    shallow: null as { url: URL } | null,
    state: {} as App.PageState,
  };
  const goto = vi.fn(async (url: URL, options: { state?: App.PageState }) => {
    page.shallow = { url };
    page.state = options.state ?? {};
  });
  return { page, goto };
});

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", () => ({ page }));

import { closeCapture, initializeCaptureHistory, openCapture } from "./capture-navigation";

const back = vi.fn();

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  page.url = new URL("https://memories.test/?keep=1#board");
  page.shallow = null;
  page.state = {};
  goto.mockClear();
  back.mockClear();
  vi.stubGlobal("history", { back });
});

it("opens once, preserves the URL, and closes through Back", async () => {
  await openCapture();
  await openCapture();
  expect(goto).toHaveBeenCalledTimes(1);
  expect(page.shallow?.url.href).toBe("https://memories.test/?keep=1&action=new-memory#board");
  expect(goto).toHaveBeenLastCalledWith(expect.any(URL), {
    shallow: true,
    state: { captureHistory: true },
    persistState: true,
  });
  closeCapture();
  expect(back).toHaveBeenCalledOnce();
});

it("places a board entry beneath a direct launch only once", async () => {
  page.url.searchParams.set("action", "new-memory");
  await initializeCaptureHistory();
  expect(goto).toHaveBeenCalledTimes(2);
  expect(goto.mock.calls[0][0].href).toBe("https://memories.test/?keep=1#board");
  expect(goto.mock.calls[0][1]).toMatchObject({ shallow: true, replace: true });
  expect(page.shallow?.url.searchParams.get("action")).toBe("new-memory");
  await initializeCaptureHistory();
  expect(goto).toHaveBeenCalledTimes(2);
});

it("does not leave the app when closing an unprepared direct entry", () => {
  page.url.searchParams.set("action", "new-memory");
  closeCapture();
  expect(back).not.toHaveBeenCalled();
  expect(page.shallow?.url.href).toBe("https://memories.test/?keep=1#board");
  expect(goto.mock.calls[0][1]).toMatchObject({ shallow: true, replace: true });
});

it("leaves unrelated actions alone", async () => {
  page.url.searchParams.set("action", "unknown");
  await initializeCaptureHistory();
  closeCapture();
  expect(goto).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
});
