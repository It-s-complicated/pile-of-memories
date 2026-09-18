import { beforeEach, expect, it, vi } from "vite-plus/test";
import { boardSnapshotSchema } from "./board-backend";
import { storageScopes } from "./airspace-model";

const mocks = vi.hoisted(() => ({
  event: {
    locals: { did: "did:plc:owner" as string | null },
    cookies: {},
    url: new URL("https://memories.example"),
  },
  restore: vi.fn(),
  authorize: vi.fn(),
  connect: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("$app/server", () => ({
  getRequestEvent: () => mocks.event,
  command: (schemaOrHandler: object, handler?: object) =>
    Object.assign(handler ?? schemaOrHandler, { __: { type: "command" } }),
}));
vi.mock("./server/auth", () => ({
  getOAuth: async () => ({ restore: mocks.restore, authorize: mocks.authorize }),
}));
vi.mock("./server/atproto", () => ({ connectAtproto: mocks.connect }));
import { openAirspace, readAirspace, writeAirspace } from "./airspace.remote";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.event.locals.did = "did:plc:owner";
  mocks.connect.mockResolvedValue({ read: mocks.read, write: mocks.write });
});

it("rejects unauthenticated reads, writes and connection attempts before restoring a session", async () => {
  mocks.event.locals.did = null;
  for (const operation of [
    openAirspace,
    readAirspace,
    () => writeAirspace(boardSnapshotSchema.parse([])),
  ]) {
    await expect(operation()).rejects.toMatchObject({ status: 401 });
  }
  expect(mocks.restore).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("upgrades identity-only sessions using the same DID and blocks storage until consent", async () => {
  mocks.restore.mockResolvedValue({
    did: "did:plc:owner",
    getTokenInfo: async () => ({ scope: "atproto" }),
  });
  mocks.authorize.mockResolvedValue(new URL("https://pds.example/consent"));
  expect(await openAirspace()).toEqual({ authorizationUrl: "https://pds.example/consent" });
  expect(mocks.authorize).toHaveBeenCalledWith("did:plc:owner", { state: "airspace" });
  await expect(readAirspace()).rejects.toMatchObject({ status: 403 });
  await expect(writeAirspace(boardSnapshotSchema.parse([]))).rejects.toMatchObject({ status: 403 });
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("uses the restored OAuth session for every read and write without returning its credentials", async () => {
  const session = {
    did: "did:plc:owner",
    getTokenInfo: async () => ({ scope: storageScopes.join(" ") }),
  };
  mocks.restore.mockResolvedValue(session);
  const board = boardSnapshotSchema.parse([]);
  mocks.read.mockResolvedValue(board);
  expect(await openAirspace()).toEqual({ id: "pile-of-memories-atproto-did:plc:owner" });
  expect(await readAirspace()).toEqual(board);
  await writeAirspace(board);
  expect(mocks.restore).toHaveBeenCalledWith("did:plc:owner");
  expect(mocks.connect).toHaveBeenCalledTimes(2);
  expect(mocks.connect).toHaveBeenCalledWith(session);
  expect(mocks.write).toHaveBeenCalledWith(board);
  expect(mocks.authorize).not.toHaveBeenCalled();
});

it("reports unsupported or non-private spaces to the launcher", async () => {
  mocks.restore.mockResolvedValue({
    did: "did:plc:owner",
    getTokenInfo: async () => ({ scope: storageScopes.join(" ") }),
  });
  mocks.connect.mockRejectedValue(new Error("This PDS does not support private spaces."));
  await expect(readAirspace()).rejects.toMatchObject({
    status: 502,
    body: { message: "This PDS does not support private spaces." },
  });
  expect(mocks.read).not.toHaveBeenCalled();
});
