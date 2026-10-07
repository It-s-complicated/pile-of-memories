import * as z from "zod";

const errorMessageSchema = z.union([
  z
    .object({ body: z.object({ message: z.string().min(1) }) })
    .transform(({ body }) => body.message),
  z.object({ message: z.string().min(1) }).transform(({ message }) => message),
]);

export function getErrorMessage(
  caught: unknown,
  fallback = "The board could not be saved.",
): string {
  return errorMessageSchema.safeParse(caught).data ?? fallback;
}
