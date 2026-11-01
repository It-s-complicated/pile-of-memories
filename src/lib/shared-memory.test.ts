import { expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { getSharedMemoryBody } from "./shared-memory";
import { cardInputSchema } from "./card";
import { parseMarkdown } from "./markdown";

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

it("keeps oversized text intact for editing rather than silently truncating it", () => {
  const body = `First line\n${"a".repeat(9000)}`;
  expect(getSharedMemoryBody(new URLSearchParams({ share_text: body }))).toBe(body);
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
  const card = cardInputSchema.parse({
    id: crypto.randomUUID(),
    body: getSharedMemoryBody(url.searchParams),
    kind: "note",
    tags: [],
    topics: [],
    title: "Shared link",
    position: { x: 0, y: 0 },
    archived: false,
  });
  expect(parseMarkdown(card.body).links).toEqual([link]);
});
