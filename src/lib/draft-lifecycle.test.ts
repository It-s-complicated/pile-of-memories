import { expect, it, vi } from "vite-plus/test";
import { createDraftLifecycle } from "./draft-lifecycle";

it("reports dismissal once across Cancel and component cleanup", () => {
  const cancelled = vi.fn();
  const draft = createDraftLifecycle(cancelled);
  draft.dismiss();
  draft.dismiss();
  expect(cancelled).toHaveBeenCalledOnce();
});

it("does not report a saved draft when the dialog unmounts", async () => {
  const cancelled = vi.fn();
  const draft = createDraftLifecycle(cancelled);
  expect(await draft.save(async () => true)).toBe(true);
  draft.dismiss();
  expect(cancelled).not.toHaveBeenCalled();
});

it("waits for a pending save after Back and excludes a successful save", async () => {
  const cancelled = vi.fn();
  const draft = createDraftLifecycle(cancelled);
  const result = Promise.withResolvers<boolean>();
  const saving = draft.save(() => result.promise);
  draft.dismiss();
  expect(cancelled).not.toHaveBeenCalled();
  result.resolve(true);
  await saving;
  expect(cancelled).not.toHaveBeenCalled();
});

it("reports abandonment after Back if the pending save fails", async () => {
  const cancelled = vi.fn();
  const draft = createDraftLifecycle(cancelled);
  const result = Promise.withResolvers<boolean>();
  const saving = draft.save(() => result.promise);
  draft.dismiss();
  expect(cancelled).not.toHaveBeenCalled();
  result.reject(new Error("Database unavailable"));
  await expect(saving).rejects.toThrow("Database unavailable");
  draft.dismiss();
  expect(cancelled).toHaveBeenCalledOnce();
});

it("allows a failed save to be retried before deciding whether the draft was abandoned", async () => {
  const cancelled = vi.fn();
  const draft = createDraftLifecycle(cancelled);
  await draft.save(async () => false);
  expect(cancelled).not.toHaveBeenCalled();
  await draft.save(async () => true);
  draft.dismiss();
  expect(cancelled).not.toHaveBeenCalled();
});
