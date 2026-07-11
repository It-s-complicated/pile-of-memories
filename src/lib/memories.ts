export type Memory = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type MemoryContent = Pick<Memory, "id" | "title" | "body">;

export const DEFAULT_MEMORY_BODY = "Write the memory, then move it where it belongs.";
