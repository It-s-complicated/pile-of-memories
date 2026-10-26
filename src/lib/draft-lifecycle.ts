/** Reports abandonment only once the outcome of any in-flight save is known. */
export function createDraftLifecycle(onCancel: () => void) {
  let dismissed = false;
  let saved = false;
  let cancelled = false;
  let pendingSaves = 0;

  function reportCancellation(): void {
    if (!dismissed || saved || cancelled || pendingSaves > 0) return;
    cancelled = true;
    onCancel();
  }

  return {
    dismiss(): void {
      dismissed = true;
      reportCancellation();
    },
    async save(create: () => Promise<boolean>): Promise<boolean> {
      pendingSaves += 1;
      try {
        const created = await create();
        saved ||= created;
        return created;
      } finally {
        pendingSaves -= 1;
        reportCancellation();
      }
    },
  };
}
