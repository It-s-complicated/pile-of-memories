import * as z from "zod";

export const PRIMARY_TAGS = ["Web development", "Job", "Personal development", "Project"] as const;
export const TOPIC_TAGS = [
  "AI",
  "Local-first",
  "CSS",
  "Hosting",
  "Vue",
  "React",
  "Finance",
] as const;
export const MAX_LABEL_LENGTH = 40;
export const MAX_LABELS = 200;

export const labelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);
export const labelsSchema = z.array(labelSchema).max(MAX_LABELS);

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

export function normalizeLabelGroups(
  tags: string[],
  topics: string[],
): { tags: string[]; topics: string[] } {
  const normalizedTags = canonicalizeLabels(tags);
  const tagKeys = new Set(normalizedTags.map((tag) => tag.toLowerCase()));
  return {
    tags: normalizedTags,
    topics: canonicalizeLabels(topics).filter((topic) => !tagKeys.has(topic.toLowerCase())),
  };
}

export function partitionLabels(
  labels: string[],
  primaryLabels: readonly string[] = PRIMARY_TAGS,
): { tags: string[]; topics: string[] } {
  const tags: string[] = [];
  const topics: string[] = [];
  const primary = new Set(primaryLabels.map((label) => label.toLowerCase()));

  for (const label of canonicalizeLabels(labels)) {
    (primary.has(label.toLowerCase()) ? tags : topics).push(label);
  }

  return { tags, topics };
}
