import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { BUSINESS_TZ } from "@/lib/dates";

export type AgingBucket =
  | "current"
  | "d1_30"
  | "d31_60"
  | "d61_90"
  | "d90_plus"
  | "unknown";

export interface OpenItemForAging {
  id: string;
  due_date: string | null; // ISO date or null
  is_unaged: boolean;
}

export interface AgedItem {
  id: string;
  aging_bucket: AgingBucket;
}

export interface AgingSummary {
  total_open_paise: bigint;
  current_paise: bigint;
  d1_30_paise: bigint;
  d31_60_paise: bigint;
  d61_90_paise: bigint;
  d90_plus_paise: bigint;
  unaged_paise: bigint; // is_unaged=true items (B/F)
  items_by_bucket: Record<AgingBucket, number>; // count
}

/**
 * Classify a single open item into an aging bucket.
 *
 * - `is_unaged=true` or `due_date=null` → `'unknown'`
 * - Days overdue = calendar days from due_date to today in BUSINESS_TZ.
 *   ≤0 → current, 1–30 → d1_30, 31–60 → d31_60, 61–90 → d61_90, >90 → d90_plus.
 *
 * `today` is passed in so the function remains pure (no `new Date()` inside).
 */
export function computeAgingBucket(
  item: OpenItemForAging,
  today: Date,
): AgingBucket {
  if (item.is_unaged || item.due_date === null) {
    return "unknown";
  }

  // Parse the ISO date string as a calendar date in BUSINESS_TZ.
  // "YYYY-MM-DD" at midnight UTC gives the right calendar date when converted
  // to IST, because we immediately strip the time with toZonedTime.
  const dueDateUtc = new Date(`${item.due_date}T00:00:00Z`);
  const dueDateZoned = toZonedTime(dueDateUtc, BUSINESS_TZ);
  const todayZoned = toZonedTime(today, BUSINESS_TZ);

  // differenceInCalendarDays(later, earlier) → positive when today is after due_date
  const daysOverdue = differenceInCalendarDays(todayZoned, dueDateZoned);

  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90_plus";
}

/**
 * Summarise a list of open items by aging bucket, summing paise per bucket.
 */
export function computeAgingSummary(
  items: Array<OpenItemForAging & { open_amount_paise: bigint }>,
  today: Date,
): AgingSummary {
  const zeroCounts: Record<AgingBucket, number> = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
    unknown: 0,
  };

  let total_open_paise = 0n;
  let current_paise = 0n;
  let d1_30_paise = 0n;
  let d31_60_paise = 0n;
  let d61_90_paise = 0n;
  let d90_plus_paise = 0n;
  let unaged_paise = 0n;

  const items_by_bucket: Record<AgingBucket, number> = { ...zeroCounts };

  for (const item of items) {
    const bucket = computeAgingBucket(item, today);
    const amount = item.open_amount_paise;

    total_open_paise += amount;
    items_by_bucket[bucket] += 1;

    if (item.is_unaged) {
      // B/F items — counted separately as unaged even though bucket is 'unknown'
      unaged_paise += amount;
    }

    switch (bucket) {
      case "current":
        current_paise += amount;
        break;
      case "d1_30":
        d1_30_paise += amount;
        break;
      case "d31_60":
        d31_60_paise += amount;
        break;
      case "d61_90":
        d61_90_paise += amount;
        break;
      case "d90_plus":
        d90_plus_paise += amount;
        break;
      case "unknown":
        // unaged_paise already accumulated above
        break;
    }
  }

  return {
    total_open_paise,
    current_paise,
    d1_30_paise,
    d31_60_paise,
    d61_90_paise,
    d90_plus_paise,
    unaged_paise,
    items_by_bucket,
  };
}
