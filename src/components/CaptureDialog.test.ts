import { render } from "svelte/server";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const { page } = vi.hoisted(() => ({
  page: {
    url: new URL("https://memories.test/?action=new-memory"),
    shallow: null as { url: URL } | null,
    state: {},
  },
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => ({ page }));
vi.mock("../lib/cards.remote", () => ({
  createCard: { preflight: () => ({ pending: 0 }) },
}));
vi.mock("../lib/enrichment.remote", () => ({ enrichMemory: vi.fn() }));
vi.mock("../lib/exploration-analytics.remote", () => ({ trackExplorationEvent: vi.fn() }));

import CaptureDialog from "./CaptureDialog.svelte";

async function capture() {
  return (
    await render(CaptureDialog, {
      props: {
        vocabulary: [],
        labelsReady: true,
        boardReady: true,
        oncreate: vi.fn(),
        onclose: vi.fn(),
        getPosition: () => ({ x: 0, y: 0 }),
      },
    })
  ).body;
}

beforeEach(() => {
  page.url = new URL("https://memories.test/?action=new-memory");
  page.shallow = null;
});

it("prefills normal capture directly from the visible share URL", async () => {
  page.shallow = {
    url: new URL(
      "https://memories.test/?action=new-memory&share_title=Read&share_text=Gr%C3%BC%C3%9Fe&share_url=https%3A%2F%2Fexample.com",
    ),
  };
  const html = await capture();
  expect(html).toContain("Read\n\nGrüße\n\nhttps://example.com</textarea>");
  expect(html).toContain("Continue");
  expect(html).not.toContain("Create card");
});

it("starts ordinary capture empty after the share parameters have been consumed", async () => {
  const html = await capture();
  expect(html).toMatch(/<textarea\b[^>]*><\/textarea>/);
});
