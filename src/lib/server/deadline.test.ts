import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { withDeadline } from "./deadline";

afterEach(() => vi.useRealTimers());

describe("withDeadline", () => {
  it("returns an operation that completes before the deadline", async () => {
    await expect(withDeadline(Promise.resolve("done"), 100, () => new Error("late"))).resolves.toBe(
      "done",
    );
  });

  it("rejects with the boundary error after the deadline", async () => {
    vi.useFakeTimers();
    const result = withDeadline(new Promise<never>(() => {}), 100, () => new Error("late"));
    const expectation = expect(result).rejects.toThrow("late");

    await vi.advanceTimersByTimeAsync(100);

    await expectation;
  });
});
