import { beforeEach, expect, it, vi } from "vite-plus/test";
import { createCardFormSchema, updateCardFormSchema } from "./card";

const database = vi.hoisted(() => ({
  insertCard: vi.fn(),
  updateCard: vi.fn(),
  listCards: vi.fn(),
  removeCard: vi.fn(),
  updateCardPositions: vi.fn(),
  recordEnrichmentReview: vi.fn(),
  recordExplorationEvent: vi.fn(),
}));
const { getRequestEvent, submitCreate, submitEdit } = vi.hoisted(() => ({
  getRequestEvent: vi.fn(),
  submitCreate: vi.fn(),
  submitEdit: vi.fn(),
}));
vi.mock("#lib/server/database.js", () => database);
vi.mock("#lib/server/card-changes.js", () => ({ streamCardSnapshots: vi.fn() }));
vi.mock("#lib/server/enrichment-analytics.js", () => ({
  buildReviewAnalyticsJob: vi.fn(),
  reportAnalyticsFailure: vi.fn(),
}));
vi.mock("$app/server", () => ({
  getRequestEvent,
  form: (schema: { parse: (input: unknown) => unknown }, handler: (input: unknown) => unknown) => {
    const submit = schema === createCardFormSchema ? submitCreate : submitEdit;
    submit.mockImplementation(async (input: unknown) => handler(schema.parse(input)));
    return { __: { type: "form" } };
  },
  command: (schema: { parse: (input: unknown) => unknown }, handler: (input: unknown) => unknown) =>
    Object.assign(async (input: unknown) => handler(schema.parse(input)), {
      __: { type: "command" },
    }),
  query: { live: () => Object.assign(vi.fn(), { __: { type: "query_live" } }) },
}));
import { deleteCard, updateCard, updateCardPositions } from "./cards.remote";

const id = "00000000-0000-4000-8000-000000000001";
const card = {
  id,
  title: "A memory",
  kind: "note" as const,
  body: "Keep this text",
  position: { x: 12, y: -4 },
  tags: [],
  topics: [],
  archived: false,
  links: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  getRequestEvent.mockReturnValue({ locals: { user: { id: "owner" } } });
  database.insertCard.mockResolvedValue(card);
  database.updateCard.mockResolvedValue(card);
  database.recordExplorationEvent.mockResolvedValue(undefined);
});

it("records an idea save only after persistence succeeds", async () => {
  const exploration = { sessionId: id, runId: id, ideaIndex: 1, sourceCardCount: 2 };
  await submitCreate({
    card: { id, title: card.title, body: card.body, position: card.position, kind: "idea" },
    exploration,
  });
  expect(database.recordExplorationEvent).toHaveBeenCalledWith({
    sessionId: id,
    runId: id,
    ideaIndex: 1,
    selectedCardCount: 2,
    event: "idea_saved",
    cardId: id,
  });
  database.recordExplorationEvent.mockClear();
  database.insertCard.mockRejectedValueOnce(new Error("Database down"));
  await expect(
    submitCreate({
      card: { id, title: "Idea", body: "Text", position: card.position },
      exploration,
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(database.recordExplorationEvent).not.toHaveBeenCalled();
});

it("authenticates both card forms before database access", async () => {
  getRequestEvent.mockReturnValue({ locals: { user: null } });
  await expect(
    submitCreate({
      card: {
        id,
        title: card.title,
        body: card.body,
        position: card.position,
      },
    }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(submitEdit({ id, changes: { title: card.title } })).rejects.toMatchObject({
    status: 401,
  });
  expect(database.insertCard).not.toHaveBeenCalled();
  expect(database.updateCard).not.toHaveBeenCalled();
});

it("accepts HTML form omissions and returns authoritative cards for the local cache", async () => {
  expect(
    await submitCreate({
      card: {
        id,
        title: " A memory ",
        kind: "note",
        body: card.body,
        position: card.position,
      },
    }),
  ).toEqual(card);
  expect(database.insertCard).toHaveBeenCalledWith({
    id,
    title: card.title,
    kind: "note",
    body: card.body,
    position: card.position,
    tags: [],
    topics: [],
    archived: false,
  });
  expect(await submitEdit({ id, changes: { title: " A memory ", body: card.body } })).toEqual(card);
  expect(database.updateCard).toHaveBeenCalledWith(id, {
    title: card.title,
    body: card.body,
    tags: [],
    topics: [],
  });
  expect(
    createCardFormSchema.safeParse({ card: { id, title: " ", body: "", position: card.position } })
      .success,
  ).toBe(false);
  expect(
    updateCardFormSchema.safeParse({ id: "invalid", changes: { title: card.title } }).success,
  ).toBe(false);
});

it("reports stale label assignments as conflicts for both forms and existing commands", async () => {
  database.insertCard.mockRejectedValue({ code: "23503", detail: "Private SQL" });
  database.updateCard.mockRejectedValue({ code: "23503", detail: "Private SQL" });
  const expected = {
    status: 409,
    body: {
      message:
        "A selected tag or topic was renamed or deleted. Remove the old selection and choose its current name. Your text has been kept.",
    },
  };
  await expect(
    submitCreate({
      card: {
        id,
        title: card.title,
        body: card.body,
        position: card.position,
        tags: ["Old label"],
      },
    }),
  ).rejects.toMatchObject(expected);
  await expect(
    submitEdit({ id, changes: { title: card.title, tags: ["Old label"] } }),
  ).rejects.toMatchObject(expected);
  await expect(
    updateCard({ id, changes: { tags: ["Old label"], topics: [] } }),
  ).rejects.toMatchObject(expected);
});

it("hides database failures and preserves missing-card errors", async () => {
  const positions = [{ id, position: card.position }];
  for (const operation of [
    database.insertCard,
    database.updateCard,
    database.updateCardPositions,
    database.removeCard,
  ])
    operation.mockRejectedValue(new Error("Private SQL details"));
  const expected = { status: 503, body: { message: "Database unavailable" } };
  await expect(
    submitCreate({ card: { id, title: card.title, body: card.body, position: card.position } }),
  ).rejects.toMatchObject(expected);
  await expect(submitEdit({ id, changes: { title: card.title } })).rejects.toMatchObject(expected);
  await expect(updateCard({ id, changes: { archived: true } })).rejects.toMatchObject(expected);
  await expect(updateCardPositions({ positions })).rejects.toMatchObject(expected);
  await expect(deleteCard({ id })).rejects.toMatchObject(expected);

  database.updateCard.mockResolvedValue(null);
  database.updateCardPositions.mockResolvedValue(null);
  database.removeCard.mockResolvedValue(false);
  await expect(submitEdit({ id, changes: { title: card.title } })).rejects.toMatchObject({
    status: 404,
  });
  await expect(updateCard({ id, changes: { archived: true } })).rejects.toMatchObject({
    status: 404,
  });
  await expect(updateCardPositions({ positions })).rejects.toMatchObject({ status: 404 });
  await expect(deleteCard({ id })).rejects.toMatchObject({ status: 404 });
});
