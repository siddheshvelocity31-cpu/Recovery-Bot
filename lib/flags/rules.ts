import { differenceInCalendarDays, parseISO } from "date-fns";
import { formatPaise } from "@/lib/money";

export type FlagRule =
  | "aged_debt"
  | "amount_exposure"
  | "broken_promise"
  | "silence"
  | "adverse_trajectory"
  | "unaged_balance";

export type FlagSeverity = "red" | "amber" | "grey";

export interface FlagOutput {
  rule: FlagRule;
  severity: FlagSeverity;
  message: string;
  dedupe_key: string; // "{client_id}:{rule}:{open_item_id|'client'}"
  open_item_id: string | null;
}

export interface OpenItemForFlags {
  id: string;
  source_doc_code: string;
  due_date: string | null;
  open_amount_paise: bigint;
  aging_bucket: string;
  is_unaged: boolean;
  status: string;
}

export interface ClientForFlags {
  client_id: string;
  threshold_amber_days: number;
  threshold_red_days: number;
  threshold_amber_amount_paise: bigint | null;
  threshold_red_amount_paise: bigint | null;
  silence_attempts: number;
  consecutive_failed_outreach: number; // count of consecutive failed outreach
  has_broken_promise: boolean;
  days_since_last_reply: number | null;
  today: Date;
}

/**
 * Evaluate aged_debt rule for all open items.
 *
 * Skips is_unaged=true items entirely (B/F never gets aged_debt).
 * For each item with an aging_bucket not in ['current', 'unknown']:
 *   - Computes days_overdue from due_date.
 *   - Emits red if days_overdue > threshold_red_days, amber if > threshold_amber_days.
 */
export function evaluateAgedDebt(
  client: ClientForFlags,
  items: OpenItemForFlags[],
): FlagOutput[] {
  const results: FlagOutput[] = [];

  for (const item of items) {
    // B/F items are never aged
    if (item.is_unaged) continue;

    // Only age items in a non-current, non-unknown bucket
    if (item.aging_bucket === "current" || item.aging_bucket === "unknown") {
      continue;
    }

    // due_date must be present for an aged item; skip defensively if missing
    if (item.due_date === null) continue;

    const days_overdue = differenceInCalendarDays(
      client.today,
      parseISO(item.due_date),
    );

    let severity: FlagSeverity | null = null;
    if (days_overdue > client.threshold_red_days) {
      severity = "red";
    } else if (days_overdue > client.threshold_amber_days) {
      severity = "amber";
    }

    if (severity === null) continue;

    const months = Math.ceil(days_overdue / 30);
    const message = `Invoice ${item.source_doc_code} is overdue by ${months} month(s)`;
    const dedupe_key = `${client.client_id}:aged_debt:${item.id}`;

    results.push({
      rule: "aged_debt",
      severity,
      message,
      dedupe_key,
      open_item_id: item.id,
    });
  }

  return results;
}

/**
 * Evaluate amount_exposure rule against the client's total open balance.
 *
 * Returns a red flag if the total exceeds the red threshold, amber if it
 * exceeds the amber threshold, null otherwise.
 */
export function evaluateAmountExposure(
  client: ClientForFlags,
  total_open_paise: bigint,
): FlagOutput | null {
  let severity: FlagSeverity | null = null;

  if (
    client.threshold_red_amount_paise !== null &&
    total_open_paise > client.threshold_red_amount_paise
  ) {
    severity = "red";
  } else if (
    client.threshold_amber_amount_paise !== null &&
    total_open_paise > client.threshold_amber_amount_paise
  ) {
    severity = "amber";
  }

  if (severity === null) return null;

  const message = `Total exposure ${formatPaise(total_open_paise)} exceeds ${severity} threshold`;
  const dedupe_key = `${client.client_id}:amount_exposure:client`;

  return {
    rule: "amount_exposure",
    severity,
    message,
    dedupe_key,
    open_item_id: null,
  };
}

/**
 * Evaluate broken_promise rule.
 *
 * Returns a red flag if the client has a broken payment promise.
 */
export function evaluateBrokenPromise(client: ClientForFlags): FlagOutput | null {
  if (!client.has_broken_promise) return null;

  const dedupe_key = `${client.client_id}:broken_promise:client`;

  return {
    rule: "broken_promise",
    severity: "red",
    message: "Client has a broken payment promise",
    dedupe_key,
    open_item_id: null,
  };
}

/**
 * Evaluate silence rule.
 *
 * Returns an amber flag if the number of consecutive failed outreach attempts
 * meets or exceeds the configured silence_attempts threshold.
 */
export function evaluateSilence(client: ClientForFlags): FlagOutput | null {
  if (client.consecutive_failed_outreach < client.silence_attempts) return null;

  const dedupe_key = `${client.client_id}:silence:client`;

  return {
    rule: "silence",
    severity: "amber",
    message: `No response after ${client.consecutive_failed_outreach} outreach attempts`,
    dedupe_key,
    open_item_id: null,
  };
}

/**
 * Evaluate unaged_balance rule.
 *
 * Returns a grey flag whenever there is at least one is_unaged item and the
 * total unaged balance is greater than zero. Grey severity is unconditional —
 * the brought-forward balance is never red or amber.
 */
export function evaluateUnageBalance(
  client: ClientForFlags,
  items: OpenItemForFlags[],
  total_unaged_paise: bigint,
): FlagOutput | null {
  const hasUnaged = items.some((i) => i.is_unaged);
  if (!hasUnaged || total_unaged_paise <= 0n) return null;

  const dedupe_key = `${client.client_id}:unaged_balance:client`;

  return {
    rule: "unaged_balance",
    severity: "grey",
    message: `Brought-forward balance of ${formatPaise(total_unaged_paise)} has no due date — cannot be aged`,
    dedupe_key,
    open_item_id: null,
  };
}

/**
 * Run all applicable rules and return the collected non-null outputs.
 */
export function evaluateAllRules(
  client: ClientForFlags,
  items: OpenItemForFlags[],
  total_open_paise: bigint,
  total_unaged_paise: bigint,
): FlagOutput[] {
  const results: FlagOutput[] = [];

  // aged_debt — one flag per overdue item
  results.push(...evaluateAgedDebt(client, items));

  // amount_exposure — one flag per client
  const amountFlag = evaluateAmountExposure(client, total_open_paise);
  if (amountFlag !== null) results.push(amountFlag);

  // broken_promise — one flag per client
  const promiseFlag = evaluateBrokenPromise(client);
  if (promiseFlag !== null) results.push(promiseFlag);

  // silence — one flag per client
  const silenceFlag = evaluateSilence(client);
  if (silenceFlag !== null) results.push(silenceFlag);

  // unaged_balance — one flag per client
  const unagedFlag = evaluateUnageBalance(client, items, total_unaged_paise);
  if (unagedFlag !== null) results.push(unagedFlag);

  return results;
}
