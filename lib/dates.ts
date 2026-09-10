import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { addDays, startOfDay } from "date-fns";

export const BUSINESS_TZ = "Asia/Kolkata";

// Excel 1900 date system epoch. Day 1 = 1900-01-01 in Excel's count.
// Includes the Lotus leap-year bug: Excel treats 1900 as a leap year,
// so serial 60 = 1900-02-29 (non-existent). Serials >= 61 are offset by 1.
const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30 UTC

export function excelSerialToDate(serial: number): Date {
  // The 1900 date system epoch is 1899-12-30 UTC. Adding `serial` days gives
  // the correct date for all serials > 60 (post-Lotus-bug era). Serial 60
  // maps to the fictitious 1900-02-29 but that value never appears in real
  // ledger data (invoices pre-date Excel by decades).
  const ms = serial * 24 * 60 * 60 * 1000;
  return new Date(EXCEL_EPOCH.getTime() + ms);
}

export function toBusinessDate(instant: Date): Date {
  return toZonedTime(instant, BUSINESS_TZ);
}

export function businessStartOfDay(date: Date): Date {
  const zoned = toZonedTime(date, BUSINESS_TZ);
  const sod = startOfDay(zoned);
  return fromZonedTime(sod, BUSINESS_TZ);
}

export function addBusinessDays(date: Date, n: number): Date {
  // Calendar days, not working days — per task note ("note it").
  return addDays(date, n);
}

export function isWithinQuietHours(
  instant: Date,
  startHHMM: string,
  endHHMM: string,
): boolean {
  const zoned = toZonedTime(instant, BUSINESS_TZ);
  const h = zoned.getHours();
  const m = zoned.getMinutes();
  const nowMinutes = h * 60 + m;

  const [startH = 0, startM = 0] = startHHMM.split(":").map(Number);
  const [endH = 0, endM = 0] = endHHMM.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes < endMinutes) {
    // Same-day window e.g. 09:00–18:00
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  } else {
    // Crosses midnight e.g. 19:00–10:00
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
}
