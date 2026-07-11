import { createServerFn } from "@tanstack/react-start";
import { type MemoryContent } from "./memories";

function readMemoryContent(value: unknown): MemoryContent {
  if (!value || typeof value !== "object") {
    throw new Error("Expected memory content");
  }

  const data = value as Record<string, unknown>;
  if (typeof data.id !== "string") throw new Error("Expected memory id");

  return {
    id: data.id,
    title: typeof data.title === "string" ? data.title : "",
    body: typeof data.body === "string" ? data.body : "",
  };
}

export const getMemories = createServerFn({ method: "GET" }).handler(async () => {
  const { listMemories } = await import("./db.server");
  return listMemories();
});

export const createMemoryCard = createServerFn({ method: "POST" }).handler(async () => {
  const { createMemory } = await import("./db.server");
  return createMemory();
});

export const saveMemoryContents = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") {
      throw new Error("Expected memory update payload");
    }

    const contents = (data as Record<string, unknown>).memories;
    if (!Array.isArray(contents)) {
      throw new Error("Expected memories array");
    }

    return contents.map(readMemoryContent);
  })
  .handler(async ({ data }) => {
    const { updateMemoryContents } = await import("./db.server");
    return updateMemoryContents(data);
  });
