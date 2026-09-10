import { describe, it, expect } from "vitest";
import { extractCommitmentFromText } from "@/lib/replies/extract-commitment";

describe("Commitment Extraction from Inbound Replies", () => {
  const referenceDate = new Date("2026-09-10T10:00:00Z");

  it("should extract commitment with date and amount", () => {
    const text = "Hi team, we will transfer ₹50,000 by 15th Sep 2026. Thanks!";
    const result = extractCommitmentFromText(text, referenceDate);

    expect(result.has_commitment).toBe(true);
    expect(result.promised_amount_paise).toBe(5000000n);
    expect(result.promised_date).not.toBeNull();
    expect(result.promised_date?.getDate()).toBe(15);
    expect(result.promised_date?.getMonth()).toBe(8); // Sept (0-indexed)
  });

  it("should extract relative commitment (tomorrow)", () => {
    const text = "We will pay the full amount by tomorrow.";
    const result = extractCommitmentFromText(text, referenceDate);

    expect(result.has_commitment).toBe(true);
    expect(result.promised_date?.getDate()).toBe(11);
  });

  it("should return has_commitment=false for non-committal replies", () => {
    const text = "Please send us the breakdown of invoice #1029. We are checking with finance.";
    const result = extractCommitmentFromText(text, referenceDate);

    expect(result.has_commitment).toBe(false);
    expect(result.promised_date).toBeNull();
    expect(result.promised_amount_paise).toBeNull();
  });
});
