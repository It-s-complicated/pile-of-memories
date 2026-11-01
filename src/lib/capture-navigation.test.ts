import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { page, goto } = vi.hoisted(() => {
  const page = {
    url: new URL("https://memories.test/?keep=1#board"),
    shallow: null as { url: URL } | null,
    state: {} as App.PageState,
  };
  const goto = vi.fn(async (url: URL, options: { state?: App.PageState }) => {
    await Promise.resolve();
    page.shallow = { url };
    page.state = options.state ?? {};
  });
  return { page, goto };
});

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", () => ({ page }));

import {
  clearSharedMemoryUrl,
  closeCapture,
  initializeCaptureHistory,
  openCapture,
} from "./capture-navigation";
import { getSharedMemoryBody } from "./shared-memory";

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
  await closeCapture();
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

it("opens incoming shares and keeps their content in the URL until capture mounts after sign-in", async () => {
  page.url = new URL(
    "https://memories.test/?share_title=Read&share_text=Remember&share_url=https%3A%2F%2Fexample.com&keep=1#board",
  );
  await initializeCaptureHistory();

  const boardUrl = goto.mock.calls[0][0];
  expect(boardUrl.href).toBe("https://memories.test/?keep=1#board");
  expect(page.shallow?.url.searchParams.get("action")).toBe("new-memory");
  expect(getSharedMemoryBody(page.shallow!.url.searchParams)).toBe(
    "Read\n\nRemember\n\nhttps://example.com",
  );
});

it("clears incoming content on capture mount so reload, Forward, and later capture start empty", async () => {
  page.url = new URL(
    "https://memories.test/?share_title=Read&share_text=Remember&share_text=Again&share_url=https%3A%2F%2Fexample.com&keep=1#board",
  );
  await initializeCaptureHistory();
  const source = page.shallow!.url;
  const boardUrl = goto.mock.calls[0][0];
  await clearSharedMemoryUrl();
  expect(page.shallow?.url.href).toBe("https://memories.test/?keep=1&action=new-memory#board");
  expect(getSharedMemoryBody(page.shallow!.url.searchParams)).toBeNull();
  expect(goto).toHaveBeenLastCalledWith(expect.any(URL), {
    shallow: true,
    replace: true,
    state: { captureHistory: true },
    persistState: true,
  });
  back.mockImplementationOnce(() => {
    const finishedUrl = page.shallow!.url;
    expect(finishedUrl.href).toBe("https://memories.test/?keep=1&action=new-memory#board");
    expect(getSharedMemoryBody(finishedUrl.searchParams)).toBeNull();
    page.shallow = { url: boardUrl };
  });

  // Cancel and successful creation both close through this navigation path.
  await closeCapture();

  expect(back).toHaveBeenCalledOnce();
  await openCapture();
  expect(getSharedMemoryBody(page.shallow!.url.searchParams)).toBeNull();
  expect(source.searchParams.get("share_text")).toBe("Remember");
});

it("removes shared fields when finishing an unprepared direct entry", async () => {
  page.url = new URL("https://memories.test/?action=new-memory&share_text=Remember&keep=1#board");

  await closeCapture();

  expect(back).not.toHaveBeenCalled();
  expect(page.shallow?.url.href).toBe("https://memories.test/?keep=1#board");
  expect(getSharedMemoryBody(page.shallow!.url.searchParams)).toBeNull();
});

it("leaves a source-card reader alone when no share was received", async () => {
  page.url = new URL("https://memories.test/?memory=00000000-0000-4000-8000-000000000001");
  await initializeCaptureHistory();
  expect(goto).not.toHaveBeenCalled();
});

it("does not leave the app when closing an unprepared direct entry", async () => {
  page.url.searchParams.set("action", "new-memory");
  await closeCapture();
  expect(back).not.toHaveBeenCalled();
  expect(page.shallow?.url.href).toBe("https://memories.test/?keep=1#board");
  expect(goto.mock.calls[0][1]).toMatchObject({ shallow: true, replace: true });
});

it("leaves unrelated actions alone", async () => {
  page.url.searchParams.set("action", "unknown");
  await initializeCaptureHistory();
  await closeCapture();
  expect(goto).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
});
