import { describe, expect, it } from "vitest";
import {
  excelSerialToDate,
  isWithinQuietHours,
  toBusinessDate,
} from "@/lib/dates";

describe("excelSerialToDate", () => {
  it("converts serial 46251 → 2026-08-17", () => {
    const d = excelSerialToDate(46251);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7); // 0-based → August
    expect(d.getUTCDate()).toBe(17);
  });

  it("converts serial 46261 → 2026-08-27", () => {
    const d = excelSerialToDate(46261);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(27);
  });
});

describe("isWithinQuietHours", () => {
  // Quiet hours: 19:00–10:00 IST (crosses midnight)
  const qStart = "19:00";
  const qEnd = "10:00";

  function istInstant(h: number, m = 0): Date {
    // Construct a UTC instant that corresponds to hh:mm IST.
    // IST = UTC+5:30, so UTC = IST - 5h30m.
    const utcH = h - 5;
    const utcM = m - 30;
    const d = new Date(Date.UTC(2026, 7, 17, utcH, utcM, 0));
    return d;
  }

  it("23:00 IST is inside quiet hours (after 19:00)", () => {
    expect(isWithinQuietHours(istInstant(23), qStart, qEnd)).toBe(true);
  });

  it("12:00 IST is outside quiet hours (between 10:00 and 19:00)", () => {
    expect(isWithinQuietHours(istInstant(12), qStart, qEnd)).toBe(false);
  });

  it("09:00 IST is inside quiet hours (before 10:00)", () => {
    expect(isWithinQuietHours(istInstant(9), qStart, qEnd)).toBe(true);
  });

  it("10:00 IST is outside quiet hours (boundary — not less than end)", () => {
    expect(isWithinQuietHours(istInstant(10), qStart, qEnd)).toBe(false);
  });

  it("19:00 IST is inside quiet hours (boundary — equal to start)", () => {
    expect(isWithinQuietHours(istInstant(19), qStart, qEnd)).toBe(true);
  });

  it("same-day window: 09:00–18:00, 12:00 is inside", () => {
    expect(isWithinQuietHours(istInstant(12), "09:00", "18:00")).toBe(true);
  });

  it("same-day window: 09:00–18:00, 20:00 is outside", () => {
    expect(isWithinQuietHours(istInstant(20), "09:00", "18:00")).toBe(false);
  });
});

describe("toBusinessDate", () => {
  it("returns a date object shifted to IST", () => {
    // 2026-08-17 00:00:00 UTC → 2026-08-17 05:30:00 IST
    const utc = new Date(Date.UTC(2026, 7, 17, 0, 0, 0));
    const ist = toBusinessDate(utc);
    expect(ist.getFullYear()).toBe(2026);
    expect(ist.getMonth()).toBe(7);
    expect(ist.getDate()).toBe(17);
    expect(ist.getHours()).toBe(5);
    expect(ist.getMinutes()).toBe(30);
  });
});
