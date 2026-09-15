import { expect, it, vi } from "vite-plus/test";
import type { Card } from "../card";

const pds = vi.hoisted(() => ({
  supported: vi.fn(),
  info: vi.fn(),
  ensure: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
}));
vi.mock("airspace", async (original) => ({
  ...(await original<typeof import("airspace")>()),
  passwordSession: async () => ({ did: "did:plc:test" }),
  createAirspace: () => ({
    workspace: {
      supported: pds.supported,
      manage: { info: pds.info, ensure: pds.ensure },
      boards: { get: pds.get, put: pds.put },
    },
  }),
}));
import { connectAtproto } from "./atproto";

it("refuses unsupported or public spaces and only writes bounded, validated private snapshots", async () => {
  const settings = {
    service: "https://pds.example.com",
    identifier: "test.example",
    password: "test-only",
  };
  pds.supported.mockResolvedValue(false);
  await expect(connectAtproto(settings)).rejects.toThrow("does not support");
  expect(pds.ensure).not.toHaveBeenCalled();
  pds.supported.mockResolvedValue(true);
  pds.info.mockResolvedValue({ read: "public", write: "member-list" });
  await expect(connectAtproto(settings)).rejects.toThrow("not private");
  pds.info.mockResolvedValue({ read: "member-list", write: "member-list" });
  pds.get.mockResolvedValue(null);
  const storage = await connectAtproto(settings);
  expect(await storage.read()).toEqual([]);
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
  await storage.write([card]);
  expect(pds.put).toHaveBeenCalledTimes(1);
  expect(JSON.parse(pds.put.mock.calls[0][0].snapshot)).toEqual([card]);
  pds.get.mockResolvedValue({ value: { snapshot: JSON.stringify([card]) } });
  expect(await storage.read()).toEqual([card]);
  await expect(storage.write([{ ...card, body: "x".repeat(200_000) }])).rejects.toThrow("200 KB");
  pds.get.mockResolvedValue({ value: { snapshot: "invalid" } });
  await expect(storage.read()).rejects.toThrow();
  pds.info.mockResolvedValue({ read: "public", write: "member-list" });
  await expect(storage.write([card])).rejects.toThrow("not private");
  expect(pds.put).toHaveBeenCalledTimes(1);
  await expect(connectAtproto({ ...settings, service: "http://pds.example.com" })).rejects.toThrow(
    "HTTPS",
  );
});
