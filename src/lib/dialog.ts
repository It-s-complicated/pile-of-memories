export function showModal(dialog: HTMLDialogElement): () => void {
  dialog.showModal();
  return () => dialog.close();
}
