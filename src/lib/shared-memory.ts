import * as z from "zod";
import { cardIdSchema, cardKindSchema } from "./card";
import { labelsSchema } from "./labels";

export const SHARED_MEMORY_STORAGE_KEY = "pile-of-memories-shared-drafts-v1";
const shareFields = ["share_title", "share_text", "share_url"];
const sharedMemoryDraftSchema = z.object({
  id: cardIdSchema,
  step: z.enum(["capture", "review"]),
  title: z.string(),
  body: z.string(),
  kind: cardKindSchema,
  tags: labelsSchema,
  topics: labelsSchema,
});
export type SharedMemoryDraft = z.infer<typeof sharedMemoryDraftSchema>;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getSharedMemoryBody(params: URLSearchParams): string | null {
  const [title, text, url] = shareFields.map((field) => params.get(field)?.trim() ?? "");
  const parts = [...new Set([title, text].filter(Boolean))];
  // Android frequently sends links in text rather than the dedicated URL field.
  if (url && !parts.some((part) => part.includes(url))) parts.push(url);
  return parts.join("\n\n") || null;
}

export function readSharedMemoryDrafts(storage?: DraftStorage): SharedMemoryDraft[] {
  try {
    const parsed = z
      .array(z.unknown())
      .safeParse(JSON.parse(storage?.getItem(SHARED_MEMORY_STORAGE_KEY) ?? "[]"));
    if (!parsed.success) return [];
    return parsed.data.flatMap((value) => {
      const draft = sharedMemoryDraftSchema.safeParse(value);
      return draft.success ? [draft.data] : [];
    });
  } catch {
    return [];
  }
}

export function storeSharedMemoryDrafts(
  drafts: SharedMemoryDraft[],
  storage?: DraftStorage,
): boolean {
  if (!storage) return false;
  try {
    if (drafts.length) storage.setItem(SHARED_MEMORY_STORAGE_KEY, JSON.stringify(drafts));
    else storage.removeItem(SHARED_MEMORY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Capture before sign-in, then remove shared content from navigation/OAuth URLs. */
export function prepareSharedMemoryCapture(source: URL, storage?: DraftStorage) {
  const url = new URL(source);
  const drafts = readSharedMemoryDrafts(storage);
  const body = getSharedMemoryBody(url.searchParams);
  if (body) {
    drafts.push({
      id: crypto.randomUUID(),
      step: "capture",
      title: "",
      body,
      kind: "note",
      tags: [],
      topics: [],
    });
  }
  const persisted = storeSharedMemoryDrafts(drafts, storage);
  if (persisted) {
    for (const field of shareFields) url.searchParams.delete(field);
  }
  // Keep the original share in the URL if storage is blocked, so sign-in can recover it.
  if (drafts.length && (body || !url.searchParams.has("memory"))) {
    url.searchParams.set("action", "new-memory");
    if (body) url.searchParams.delete("memory");
  }
  return { drafts, url, persisted };
}
