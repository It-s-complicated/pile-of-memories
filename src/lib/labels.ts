export const PRIMARY_TAGS = ["Web development", "Job", "Personal development"] as const;
export const TOPIC_TAGS = ["Local-first", "CSS", "Hosting", "Vue", "React", "Finance"] as const;
export const MAX_LABEL_LENGTH = 40;
export const MAX_LABELS = 200;

const primaryTags = new Map(PRIMARY_TAGS.map((tag) => [tag.toLowerCase(), tag]));

export function canonicalizeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  return labels.flatMap((label) => {
    const trimmed = label.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [primaryTags.get(key) ?? trimmed];
  });
}

export function partitionLabels(labels: string[]): { tags: string[]; topics: string[] } {
  const tags: string[] = [];
  const topics: string[] = [];

  for (const label of canonicalizeLabels(labels)) {
    (primaryTags.has(label.toLowerCase()) ? tags : topics).push(label);
  }

  return { tags, topics };
}

export function labelsAreValid(labels: unknown): labels is string[] {
  return (
    Array.isArray(labels) &&
    labels.length <= MAX_LABELS &&
    labels.every(
      (label) =>
        typeof label === "string" &&
        label.trim().length > 0 &&
        label.trim().length <= MAX_LABEL_LENGTH,
    )
  );
}
