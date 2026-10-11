import * as z from "zod";

export const MAX_LABEL_LENGTH = 40;
export const MAX_LABELS = 200;
export const MAX_LABEL_DESCRIPTION_LENGTH = 1_000;

export const labelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);
export const labelsSchema = z.array(labelSchema).max(MAX_LABELS).transform(canonicalizeLabels);
export const labelKindSchema = z.enum(["tag", "topic"]);
export const labelInputSchema = z
  .object({
    name: labelSchema,
    kind: labelKindSchema,
    description: z.string().trim().max(MAX_LABEL_DESCRIPTION_LENGTH),
  })
  .strict();
export const labelDefinitionSchema = labelInputSchema.extend({ id: z.uuidv4() });
export const managedLabelSchema = labelDefinitionSchema.extend({
  usageCount: z.number().int().nonnegative(),
});
export const saveLabelSchema = labelInputSchema.extend({ id: z.uuidv4().optional() });
export const deleteLabelSchema = z.object({ id: z.uuidv4() }).strict();

export type LabelKind = z.infer<typeof labelKindSchema>;
export type LabelInput = z.infer<typeof labelInputSchema>;
export type LabelDefinition = z.infer<typeof labelDefinitionSchema>;
export type ManagedLabel = z.infer<typeof managedLabelSchema>;

export function canonicalizeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  return labels.flatMap((label) => {
    const trimmed = label.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}
