import { z } from "zod";

export const importSchema = z.object({
  filename: z.string().nonempty(),
  sha256: z.string().length(64),
  client_code: z.string().nonempty(),
});

export type ImportFormValues = z.infer<typeof importSchema>;

export function validateImportData(
  data: unknown,
): [error: string | null, values: ImportFormValues | null] {
  const result = importSchema.safeParse(data);
  if (!result.success) {
    return [result.error.issues[0]?.message ?? "Validation failed", null];
  }
  return [null, result.data];
}