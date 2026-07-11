import { describe, expect, it } from "vite-plus/test";
import { createStarterScene, readScene, serializeScene } from "./scene";

describe("scene snapshots", () => {
  it("round-trips valid scenes and falls back for invalid data", () => {
    const scene = createStarterScene();

    expect(readScene(serializeScene(scene))).toEqual(scene);
    expect(readScene('{"nodes":"invalid","edges":[]}')).toEqual(scene);
  });
});
