import { beforeEach, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import {
  getSharedMemoryBody,
  prepareSharedMemoryCapture,
  readSharedMemoryDrafts,
  SHARED_MEMORY_STORAGE_KEY,
  storeSharedMemoryDrafts,
} from "./shared-memory";
import { cardInputSchema } from "./card";
import { parseMarkdown } from "./markdown";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value);
  },
  removeItem: (key: string) => {
    values.delete(key);
  },
};

beforeEach(() => values.clear());

it("combines title, Unicode text and URLs without decoding twice or duplicating links", () => {
  const params = new URLSearchParams({
    share_title: " Read this ",
    share_text: "Grüße 👋\n日本語",
    share_url: "https://example.com/a%3Fb?q=a+b&lang=日本語#section",
  });
  const body = getSharedMemoryBody(new URLSearchParams(params.toString()));
  expect(body).toBe(
    "Read this\n\nGrüße 👋\n日本語\n\nhttps://example.com/a%3Fb?q=a+b&lang=日本語#section",
  );
  const url = "https://example.com/?a=1&b=2";
  expect(getSharedMemoryBody(new URLSearchParams({ share_text: url }))).toBe(url);
  expect(
    getSharedMemoryBody(new URLSearchParams({ share_title: url, share_text: url, share_url: url })),
  ).toBe(url);
  expect(
    getSharedMemoryBody(new URLSearchParams({ share_text: `Read ${url}`, share_url: url })),
  ).toBe(`Read ${url}`);
});

it("ignores unrelated and empty fields, and uses the first repeated field", () => {
  expect(getSharedMemoryBody(new URLSearchParams("title=Other&action=new-memory"))).toBeNull();
  expect(getSharedMemoryBody(new URLSearchParams("share_text=++&share_url="))).toBeNull();
  expect(getSharedMemoryBody(new URLSearchParams("share_title=First&share_title=Second"))).toBe(
    "First",
  );
});

it("stores before sign-in and removes content from the callback URL without replaying on reload", () => {
  const incoming = new URL("https://memories.test/?share_title=Read&share_text=Hello&keep=1#board");
  const first = prepareSharedMemoryCapture(incoming, storage);
  expect(first.persisted).toBe(true);
  expect(first.url.href).toBe("https://memories.test/?keep=1&action=new-memory#board");
  expect(incoming.searchParams.get("share_text")).toBe("Hello");
  const reloaded = prepareSharedMemoryCapture(first.url, storage);
  expect(reloaded.drafts).toEqual(first.drafts);
  expect(reloaded.drafts).toHaveLength(1);
});

it("preserves review edits and queues a second share without overwriting the first", () => {
  const first = prepareSharedMemoryCapture(
    new URL("https://memories.test/?share_text=First"),
    storage,
  );
  const edited = {
    ...first.drafts[0],
    title: "Edited",
    body: "Edited text",
    kind: "idea" as const,
    tags: ["Work"],
    topics: ["CSS"],
    step: "review" as const,
  };
  storeSharedMemoryDrafts([edited], storage);
  const second = prepareSharedMemoryCapture(
    new URL("https://memories.test/?share_text=Second"),
    storage,
  );
  expect(second.drafts[0]).toEqual(edited);
  expect(second.drafts[1].body).toBe("Second");
  expect(second.drafts[1].id).not.toBe(edited.id);
  // Completing or cancelling one draft leaves the next available for capture.
  storeSharedMemoryDrafts(
    second.drafts.filter(({ id }) => id !== edited.id),
    storage,
  );
  expect(readSharedMemoryDrafts(storage)).toEqual([second.drafts[1]]);
  storeSharedMemoryDrafts([], storage);
  expect(storage.getItem(SHARED_MEMORY_STORAGE_KEY)).toBeNull();
});

it("keeps oversized text intact for editing rather than silently truncating it", () => {
  const body = `First line\n${"a".repeat(9000)}`;
  const result = prepareSharedMemoryCapture(
    new URL(`https://memories.test/?${new URLSearchParams({ share_text: body })}`),
    storage,
  );
  expect(result.drafts[0].body).toBe(body);
  expect(readSharedMemoryDrafts(storage)[0].body).toBe(body);
});

it("does not replace a source-card reader with a pending shared draft", () => {
  prepareSharedMemoryCapture(new URL("https://memories.test/?share_text=Remember"), storage);
  const source = new URL("https://memories.test/?memory=00000000-0000-4000-8000-000000000001");
  expect(prepareSharedMemoryCapture(source, storage).url.href).toBe(source.href);
});

it("survives unavailable or corrupt storage and retains incoming text for sign-in recovery", () => {
  const incoming = new URL("https://memories.test/?share_text=Remember");
  for (const blocked of [
    undefined,
    {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("quota");
      },
      removeItem() {
        throw Error("blocked");
      },
    },
  ]) {
    const result = prepareSharedMemoryCapture(incoming, blocked);
    expect(result.persisted).toBe(false);
    expect(result.drafts[0].body).toBe("Remember");
    expect(result.url.searchParams.get("share_text")).toBe("Remember");
  }
  storage.setItem(SHARED_MEMORY_STORAGE_KEY, "not json");
  expect(readSharedMemoryDrafts(storage)).toEqual([]);
  const valid = prepareSharedMemoryCapture(incoming, storage).drafts[0];
  storage.setItem(SHARED_MEMORY_STORAGE_KEY, JSON.stringify([{ id: "broken" }, valid]));
  expect(readSharedMemoryDrafts(storage)).toEqual([valid]);
});

it("receives the manifest's actual fields and supports the existing card and link contracts", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../static/manifest.webmanifest", import.meta.url), "utf8"),
  );
  const target = manifest.share_target;
  expect(target.method).toBe("GET");
  const url = new URL(target.action, "https://memories.test");
  const link = "https://example.com/read?lang=de&item=a_b#section";
  url.searchParams.set(target.params.title, "Grüße 👋");
  url.searchParams.set(target.params.text, "Something to remember");
  url.searchParams.set(target.params.url, link);
  const { drafts } = prepareSharedMemoryCapture(url, storage);
  const { id, body, kind, tags, topics } = drafts[0];
  const card = cardInputSchema.parse({
    id,
    body,
    kind,
    tags,
    topics,
    title: "Shared link",
    position: { x: 0, y: 0 },
    archived: false,
  });
  expect(parseMarkdown(card.body).links).toEqual([link]);
});
