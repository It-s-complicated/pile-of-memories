import { render } from "svelte/server";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import type { Card } from "#lib/card.js";

const { page } = vi.hoisted(() => ({
  page: {
    url: new URL("https://memories.test/"),
    shallow: null as { url: URL } | null,
    state: {},
  },
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => ({ page }));

import LinkedMemoryReader from "./LinkedMemoryReader.svelte";

const source: Card = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "note",
  title: "Original source",
  body: "A **source detail** worth revisiting.",
  position: { x: 0, y: 0 },
  tags: [],
  topics: [],
  archived: false,
  links: [],
  createdAt: "2026-10-26T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
};

async function read(cards: Card[], ready = true) {
  return (
    await render(LinkedMemoryReader, {
      props: { cards, ready, loadError: false, canExplore: true, onexplore: vi.fn() },
    })
  ).body.replace(/<!--[\s\S]*?-->/g, "");
}

beforeEach(() => {
  page.url = new URL(`https://memories.test/?memory=${source.id}`);
  page.shallow = null;
});

it("renders an archived citation with its Markdown and without an exploration action", async () => {
  const html = await read([{ ...source, archived: true }]);
  expect(html).toContain("Archived memory");
  expect(html).toContain("Original source");
  expect(html).toContain("<strong>source detail</strong>");
  expect(html).not.toContain("Explore from here");
});

it("can explore an active source from the visible shallow URL", async () => {
  page.url = new URL("https://memories.test/");
  page.shallow = { url: new URL(`https://memories.test/?memory=${source.id}`) };
  const html = await read([source]);
  expect(html).toContain("Original source");
  expect(html).toContain("Explore from here");
  expect(html).not.toContain("Archived memory");
});

it("explains a deleted source after loading instead of leaving the link inert", async () => {
  const html = await read([]);
  expect(html).toContain("Memory unavailable");
  expect(html).toContain("It may have been deleted.");
  expect(html).not.toContain("Explore from here");
});

it("waits for source data before claiming a memory is missing", async () => {
  const html = await read([], false);
  expect(html).toContain("Loading memory…");
  expect(html).not.toContain("It may have been deleted.");
});
