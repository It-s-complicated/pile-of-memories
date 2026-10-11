import { beforeEach, expect, it, vi } from "vite-plus/test";

const database = vi.hoisted(() => ({
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
}));
const { getRequestEvent, liveQuery, submitLabel } = vi.hoisted(() => ({
  getRequestEvent: vi.fn(),
  liveQuery: vi.fn(),
  submitLabel: vi.fn(),
}));
vi.mock("#lib/server/database.js", () => database);
vi.mock("$app/server", () => ({
  getRequestEvent,
  form: (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, issue: unknown) => unknown,
  ) => {
    submitLabel.mockImplementation(async (input: unknown) =>
      handler(schema.parse(input), {
        name: (message: string) => ({ message, path: ["name"] }),
      }),
    );
    return { __: { type: "form" } };
  },
  command: (schema: { parse: (input: unknown) => unknown }, handler: (input: unknown) => unknown) =>
    Object.assign(async (input: unknown) => handler(schema.parse(input)), {
      __: { type: "command" },
    }),
  query: {
    live: (handler: () => unknown) => {
      liveQuery.mockImplementation(handler);
      return Object.assign(liveQuery, { __: { type: "query_live" } });
    },
  },
}));
vi.mock("#lib/server/card-changes.js", () => ({
  streamCardSnapshots: async function* (read: () => Promise<unknown>) {
    yield await read();
  },
}));
import { deleteLabel } from "./labels.remote";

const id = "00000000-0000-4000-8000-000000000001";
const label = {
  name: "Professional practice",
  kind: "tag" as const,
  description: "Work and careers.",
};

beforeEach(() => {
  vi.clearAllMocks();
  getRequestEvent.mockReturnValue({
    locals: { user: { id: "owner" } },
    request: { signal: new AbortController().signal },
  });
  database.listLabels.mockResolvedValue([]);
  database.createLabel.mockResolvedValue({ id, ...label, usageCount: 0 });
  database.updateLabel.mockResolvedValue({ id, ...label, usageCount: 2 });
  database.deleteLabel.mockResolvedValue(true);
});

it("guards label form submissions, deletion and live reads with the private-board session", async () => {
  getRequestEvent.mockReturnValue({
    locals: { user: null },
    request: { signal: new AbortController().signal },
  });
  await expect(submitLabel(label)).rejects.toMatchObject({ status: 401 });
  await expect(submitLabel({ id, ...label })).rejects.toMatchObject({ status: 401 });
  await expect(deleteLabel({ id })).rejects.toMatchObject({ status: 401 });
  await expect(liveQuery().next()).rejects.toMatchObject({ status: 401 });
  for (const operation of Object.values(database)) expect(operation).not.toHaveBeenCalled();
});

it("validates and trims create and edit forms before writing to the database", async () => {
  await submitLabel({
    ...label,
    name: "  Professional practice ",
    description: "  Work and careers. ",
  });
  expect(database.createLabel).toHaveBeenCalledWith(label);
  await submitLabel({ id, ...label, name: "Curiosity", kind: "topic" });
  expect(database.updateLabel).toHaveBeenCalledWith(id, {
    ...label,
    name: "Curiosity",
    kind: "topic",
  });
  await expect(submitLabel({ ...label, name: "" })).rejects.toThrow();
  await expect(submitLabel({ id: "invalid", ...label })).rejects.toThrow();
  await expect(deleteLabel({ id: "invalid" })).rejects.toThrow();
  expect(database.deleteLabel).not.toHaveBeenCalled();
});

it("returns field issues for duplicate names and recoverable issues for deleted labels", async () => {
  database.createLabel.mockRejectedValue({ code: "23505", detail: "Private SQL details" });
  await expect(submitLabel(label)).rejects.toMatchObject({
    issues: [
      {
        path: ["name"],
        message: "A tag or topic with that name already exists. Choose a different name.",
      },
    ],
  });
  database.updateLabel.mockResolvedValue(null);
  await expect(submitLabel({ id, ...label })).rejects.toMatchObject({
    issues: [{ message: "This tag or topic was deleted. Copy your changes into a new label." }],
  });
  database.deleteLabel.mockResolvedValue(false);
  await expect(deleteLabel({ id })).rejects.toMatchObject({ status: 404 });
  database.createLabel.mockRejectedValue(new Error("Private connection details"));
  await expect(submitLabel(label)).rejects.toMatchObject({
    status: 503,
    body: { message: "Could not save tags and topics. Please try again." },
  });
});

it("reads the managed vocabulary for the live catalog", async () => {
  const labels = [{ id, ...label, usageCount: 2 }];
  database.listLabels.mockResolvedValue(labels);
  expect((await liveQuery().next()).value).toEqual(labels);
});
