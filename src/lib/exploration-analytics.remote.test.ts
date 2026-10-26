import { beforeEach, expect, it, vi } from "vite-plus/test";

const { getRequestEvent, recordExplorationEvent } = vi.hoisted(() => ({
  getRequestEvent: vi.fn(),
  recordExplorationEvent: vi.fn(),
}));
vi.mock("$app/server", () => ({
  getRequestEvent,
  command: (schema: { parse: (value: unknown) => unknown }, handler: (input: unknown) => unknown) =>
    Object.assign(async (input: unknown) => handler(schema.parse(input)), {
      __: { type: "command" },
    }),
}));
vi.mock("#lib/server/database.js", () => ({ recordExplorationEvent }));
vi.mock("#lib/server/enrichment-analytics.js", () => ({ reportAnalyticsFailure: vi.fn() }));
import { trackExplorationEvent } from "./exploration-analytics.remote";
const sessionId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  getRequestEvent.mockReturnValue({ locals: { user: { id: "owner" } } });
  recordExplorationEvent.mockResolvedValue(undefined);
});
it("requires a private session and refuses client-reported saves or text payloads", async () => {
  getRequestEvent.mockReturnValue({ locals: { user: null } });
  await expect(trackExplorationEvent({ sessionId, event: "opened" })).rejects.toMatchObject({
    status: 401,
  });
  getRequestEvent.mockReturnValue({ locals: { user: { id: "owner" } } });
  await expect(trackExplorationEvent({ sessionId, event: "idea_saved" })).rejects.toThrow();
  await expect(
    trackExplorationEvent({ sessionId, event: "opened", question: "Private text" } as never),
  ).rejects.toThrow();
  expect(recordExplorationEvent).not.toHaveBeenCalled();
});
it("records validated funnel events and tolerates analytics failure", async () => {
  const event = {
    sessionId,
    event: "card_added" as const,
    selectedCardCount: 2,
    selectionSource: "suggested" as const,
  };
  await trackExplorationEvent(event);
  expect(recordExplorationEvent).toHaveBeenCalledWith(event);
  recordExplorationEvent.mockRejectedValueOnce(new Error("Database unavailable"));
  await expect(trackExplorationEvent({ sessionId, event: "closed" })).resolves.toBeUndefined();
});
