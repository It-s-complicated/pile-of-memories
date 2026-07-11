import { describe, expect, it } from "vite-plus/test";
import { memoryCardPosition } from "./layout";

describe("memoryCardPosition", () => {
  it("places initial cards without stacking", () => {
    const positions = Array.from({ length: 5 }, (_, index) => memoryCardPosition(index));

    expect(new Set(positions.map(({ x, y }) => `${x},${y}`)).size).toBe(positions.length);
    expect(positions[0]).toEqual({ x: -460, y: -160 });
    expect(positions[3]).toEqual({ x: -460, y: 80 });
  });
});
