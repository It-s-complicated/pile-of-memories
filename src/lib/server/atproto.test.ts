import { expect, it, vi } from "vite-plus/test";
import type { OAuthSession } from "airspace/oauth";
import type { Card } from "../card";
import { boardSnapshotSchema } from "../board-backend";

const pds = vi.hoisted(() => ({
  client: vi.fn(),
  supported: vi.fn(),
  info: vi.fn(),
  ensure: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
}));
vi.mock("airspace", async (original) => ({
  ...(await original<typeof import("airspace")>()),
  createAirspace: (options: unknown) => {
    pds.client(options);
    return {
      workspace: {
        supported: pds.supported,
        manage: { info: pds.info, ensure: pds.ensure },
        boards: { get: pds.get, put: pds.put },
      },
    };
  },
}));
import { connectAtproto } from "./atproto";

it("refuses unsupported or public spaces and only writes bounded, validated private snapshots", async () => {
  const settings = { did: "did:plc:test" } as unknown as OAuthSession;
  pds.supported.mockResolvedValue(false);
  await expect(connectAtproto(settings)).rejects.toThrow("does not support");
  expect(pds.ensure).not.toHaveBeenCalled();
  pds.supported.mockResolvedValue(true);
  pds.info.mockResolvedValue({ read: "public", write: "member-list" });
  await expect(connectAtproto(settings)).rejects.toThrow("not private");
  pds.info.mockResolvedValue({ read: "member-list", write: "member-list" });
  pds.get.mockResolvedValue(null);
  const storage = await connectAtproto(settings);
  expect(pds.client).toHaveBeenLastCalledWith(
    expect.objectContaining({ identity: settings.did, session: settings }),
  );
  expect(await storage.read()).toEqual(boardSnapshotSchema.parse([]));
  const card: Card = {
    id: crypto.randomUUID(),
    title: "Test",
    body: "Text",
    tags: [],
    topics: [],
    links: [],
    archived: false,
    position: { x: 1.25, y: -0.5 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const board = boardSnapshotSchema.parse({
    memories: [card],
    tags: ["Custom area"],
    topics: ["Custom topic"],
  });
  await storage.write(board);
  expect(pds.put).toHaveBeenCalledTimes(1);
  expect(JSON.parse(pds.put.mock.calls[0][0].snapshot)).toEqual(board);
  pds.get.mockResolvedValue({ value: { snapshot: JSON.stringify(board) } });
  expect(await storage.read()).toEqual(board);
  await expect(
    storage.write({ ...board, memories: [{ ...card, body: "x".repeat(200_000) }] }),
  ).rejects.toThrow("200 KB");
  pds.get.mockResolvedValue({ value: { snapshot: "invalid" } });
  await expect(storage.read()).rejects.toThrow();
  pds.info.mockResolvedValue({ read: "public", write: "member-list" });
  await expect(storage.write(board)).rejects.toThrow("not private");
  expect(pds.put).toHaveBeenCalledTimes(1);
});
