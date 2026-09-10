import { createHash } from "crypto";

export function naturalKey(
  clientCode: string,
  docCode: string,
  docDateIso: string,
  rowNumber: number,
  billAmountPaise: bigint | null,
): string {
  const rows = [clientCode, docCode, docDateIso, rowNumber.toString(), billAmountPaise?.toString() ?? ""].join("|");
  return createHash("sha256").update(rows).digest("hex");
}
