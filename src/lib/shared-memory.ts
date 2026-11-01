const shareFields = ["share_title", "share_text", "share_url"];

export function clearSharedMemoryFields(url: URL): void {
  for (const field of shareFields) url.searchParams.delete(field);
}

export function getSharedMemoryBody(params: Pick<URLSearchParams, "get">): string | null {
  const [title, text, url] = shareFields.map((field) => params.get(field)?.trim() ?? "");
  const parts = [...new Set([title, text].filter(Boolean))];
  // Android frequently sends links in text rather than the dedicated URL field.
  if (url && !parts.some((part) => part.includes(url))) parts.push(url);
  return parts.join("\n\n") || null;
}
