import { describe, expect, it } from "vitest";
import { parseRupeesToPaise, formatPaise, sumPaise, paiseToString } from "@/lib/money";

describe("parseRupeesToPaise", () => {
  it("converts the fixture closing balance", () => {
    expect(parseRupeesToPaise("1660301.37")).toBe(166030137n);
  });

  it("converts comma-grouped input", () => {
    expect(parseRupeesToPaise("66,97,661.00")).toBe(669766100n);
  });

  it("converts negative values", () => {
    expect(parseRupeesToPaise("-7140")).toBe(-714000n);
  });

  it("converts integer number input", () => {
    expect(parseRupeesToPaise(10625)).toBe(1062500n);
  });

  it("returns null for empty string", () => {
    expect(parseRupeesToPaise("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseRupeesToPaise("   ")).toBeNull();
  });

  it("throws for NaN", () => {
    expect(() => parseRupeesToPaise("abc")).toThrow();
  });

  it("throws for Infinity", () => {
    expect(() => parseRupeesToPaise("Infinity")).toThrow();
  });

  it("rounds half-up at two decimal places", () => {
    // 1.005 rupees = 100.5 paise → rounds to 101 paise
    expect(parseRupeesToPaise("1.005")).toBe(101n);
  });

  it("handles zero", () => {
    expect(parseRupeesToPaise("0")).toBe(0n);
  });

  it("handles negative paise-precision value", () => {
    expect(parseRupeesToPaise("-2626.63")).toBe(-262663n);
  });
});

describe("formatPaise", () => {
  it("formats with Indian grouping — lakh/crore", () => {
    expect(formatPaise(669766100n)).toBe("₹66,97,661.00");
  });

  it("formats smaller amounts without lakh grouping", () => {
    expect(formatPaise(100000n)).toBe("₹1,000.00");
  });

  it("formats negative amounts", () => {
    expect(formatPaise(-714000n)).toBe("-₹7,140.00");
  });

  it("formats zero", () => {
    expect(formatPaise(0n)).toBe("₹0.00");
  });

  it("formats crore-range amounts", () => {
    // 5,13,06,870 paise = ₹5,13,068.70
    expect(formatPaise(513068700n)).toBe("₹51,30,687.00");
  });
});

describe("sumPaise", () => {
  it("sums an array of bigints", () => {
    expect(sumPaise([100n, 200n, 300n])).toBe(600n);
  });

  it("returns 0n for empty array", () => {
    expect(sumPaise([])).toBe(0n);
  });

  it("handles negative values", () => {
    expect(sumPaise([500n, -200n])).toBe(300n);
  });
});

describe("paiseToString", () => {
  it("converts bigint to string", () => {
    expect(paiseToString(669766100n)).toBe("669766100");
  });
});
