# Receivables Recovery System — Operations Runbook

This document answers the seven questions a team member will ask when something
goes wrong or needs attention outside normal business hours.

---

## 1. How to import a ledger

**What to do:**

1. Log in to the application and navigate to a client's detail page.
2. Click **Import Ledger** and upload the XLSX file exported from the travel
   back-office system (the same format as `Olectra_Client_Ledger_Report.xlsx`).
3. The application creates a `ledger_import` row in the database with
   `status = 'pending'` and enqueues a `ledger.parse_chunk` job.

**What happens next (automatic):**

- The cron tick (every minute via `/api/cron/tick`) claims the
  `ledger.parse_chunk` job and calls the parse handler, which reads the XLSX
  from Supabase Storage and inserts rows into `ledger_entry`.
- When parsing is complete, a `ledger.derive_open_items` job is enqueued. This
  job reconciles debit/credit entries and produces `open_item` rows.
- After derivation, a `case.evaluate` job is enqueued automatically, which
  opens or advances the recovery case for the client.
- An `aging.recompute` job re-buckets all open items and cascades to
  `flags.evaluate`.

**How to verify it worked:**

- Go to the client's detail page. Under **Open Items**, you should see the
  imported invoices listed with their amounts and due dates.
- Check the **Trail** tab. You should see events in order:
  `ledger.imported` → `open_item.created` (one per new invoice) → `case.opened`
  (if a new case was created).
- In Supabase Studio → Tables → `ledger_import`, confirm the row has
  `status = 'imported'`.
- Count: `ledger_entry` rows for the client should match the row count in the
  XLSX (typically 108 rows for the Olectra fixture).

**If the import row is stuck at `status = 'pending'`:**

Check whether the cron tick is running — see the health endpoint:

```
GET /api/health
```

A `tick_age_minutes > 5` means the cron tick has not fired recently. Check the
Vercel cron logs or restart the local dev server.

---

## 2. How to read the trail

The **Trail** tab on every client page shows an append-only log of everything
that happened. Each row is an `event` record with a `type` and a `payload`.

**Key event types and what they mean:**

| Event type | What it means |
|---|---|
| `ledger.imported` | A new XLSX was uploaded and parsed |
| `open_item.created` | A new open invoice was derived from ledger entries |
| `case.opened` | A recovery case was opened for this client |
| `case.advanced` | The case moved to the next cadence step |
| `case.suppressed` | The case was suppressed (client muted, or dispute open) |
| `case.resolved` | All open items settled — case closed |
| `case.escalated` | Case escalated to a higher cadence level |
| `outreach.dry_run` | A message was composed and sent in dry-run mode (no real send) |
| `outreach.suppressed` | A message was blocked by the rails (kill switch, mute, dispute, etc.) |
| `outreach.sent` | A real message was sent (when live providers are configured) |
| `flag.raised` | A flag was raised (aged debt, unaged balance, etc.) |
| `flag.resolved` | A flag condition cleared automatically |
| `flag.acknowledged` | A collector acknowledged a flag with a note |
| `reply.received` | A client reply was captured |
| `commitment.made` | A client promised to pay by a specific date |
| `commitment.broken` | A payment promise was not fulfilled |

**How to interpret status changes:**

- The `payload.from_status` and `payload.to_status` fields on `case.*` events
  show exactly which transition occurred and why (`payload.reason`).
- `outreach.suppressed` events carry `payload.reason` — read it to understand
  which rail blocked the message (kill switch, mute, quiet hours, etc.).
- If you see gaps in the expected sequence (e.g. `case.opened` but no
  `outreach.dry_run`), check the `flag` table for a blocking flag and the
  `system_config` row for the kill switch state.

---

## 3. How to mute a client

**When to use it:** The client has asked not to be contacted for a period, or
you are aware of a dispute that makes outreach inappropriate right now.

**How to do it:**

```http
POST /api/clients/:clientId/mute
Content-Type: application/json
Authorization: Bearer <session token>

{
  "muted_until": "2026-09-30T00:00:00Z",
  "reason": "Client requested no contact until end of Q3"
}
```

- `muted_until` is an ISO 8601 timestamp. Omit it for an indefinite mute.
- The route sets `is_muted = true` and `muted_until` on the client row and
  writes a `client.muted` event to the trail.

**What it does:**

- The `checkRails` function in `lib/policy/rails.ts` evaluates `is_muted` on
  every outreach attempt. If muted and within the muted period, it returns
  `{ allowed: false, rule: "mute" }` and the message is suppressed.
- The recovery case transitions to `suppressed` status on the next evaluation.
- No outreach is sent while the mute is active. The case does not progress.

**To unmute:** Call the mute endpoint again with a `muted_until` in the past,
or set `is_muted = false` directly in Supabase Studio if the UI route is not
available.

---

## 4. How to stop everything (kill switch)

The kill switch halts **all outbound messages** across every client
immediately. Use it when something is wrong and you cannot afford to have any
message leave the system while you investigate.

**Where to find it:**

- In Supabase Studio → Tables → `system_config` → the single `singleton` row.
- The field is `outreach_kill_switch` (boolean, default `false`).

**How to toggle it on:**

Option A — via Supabase Studio:
1. Open `system_config` table.
2. Click the `singleton` row.
3. Set `outreach_kill_switch` to `true` and save.

Option B — via SQL (Supabase SQL editor or psql):

```sql
UPDATE system_config
SET outreach_kill_switch = true
WHERE id = 'singleton';
```

**What it affects:**

- Every call to `dispatchOutreach()` checks `outreach_kill_switch` first. If
  it is `true`, the outreach row is updated to `status = 'suppressed'` with
  `suppression_reason = 'Kill switch active'` and an `outreach.suppressed`
  event is written. No message is sent.
- The recovery pipeline continues to run (case evaluation, aging recompute,
  flag evaluation) — only the message-sending step is blocked.
- The `/api/health` endpoint reports `kill_switch: true` in its JSON body.

**To re-enable outreach:** Set `outreach_kill_switch` back to `false` using
either method above. Jobs that were suppressed while the kill switch was on
will not be retried automatically — you must re-queue them or wait for the
next scheduled case evaluation to create new outreach rows.

---

## 5. What to do when an import fails reconciliation

Reconciliation failure means the sum of derived `open_item.open_amount_paise`
values does not match the closing balance shown on the XLSX (or an expected
total).

**How to detect it:**

- The import handler writes a `ledger.reconciliation_failed` event to the
  trail if the balance check fails. Look for this event type in the client's
  trail.
- The `ledger_import` row will have `status = 'failed'` and a `failure_reason`
  message explaining the discrepancy.
- Alternatively: use the Open Items page to compare
  `SUM(open_amount_paise)` against the XLSX closing balance column.

**What to investigate:**

1. **Double-check the XLSX** — open it and confirm the closing balance shown
   in the header row matches what you expect. The back-office system sometimes
   exports a trailing page with a revised figure.
2. **Check for duplicate rows** — look in `ledger_entry` for rows with the
   same `natural_key`. A duplicate import will inflate totals.
   ```sql
   SELECT natural_key, COUNT(*)
   FROM ledger_entry
   WHERE client_id = '<uuid>'
   GROUP BY natural_key
   HAVING COUNT(*) > 1;
   ```
3. **Check credit allocations** — `allocate-credits.ts` may have mis-matched a
   credit note to the wrong invoice. Compare `receipts_applied_paise` and
   `credits_applied_paise` on each open item against the XLSX lines.
4. **Check for missing B/F row** — if the XLSX has a "Brought Forward" opening
   balance row, it must parse as `entry_type = 'opening'` with `is_unaged = true`.
   If it was skipped, the total will be understated.
5. **Re-import after fixing the source** — reconciliation failures are always a
   data quality issue in the source system. Do not manually patch `open_item`
   rows. Correct the XLSX and re-import — the upsert logic on
   `(client_id, source_doc_code)` will reconcile correctly.

---

## 6. What the grey "unaged balance" flag means and why the software cannot clear it

**What it means:**

A grey `unaged_balance` flag appears when one or more open items have
`is_unaged = true`. These are "Brought Forward" (B/F) items — a lump-sum
opening balance imported from the previous accounting period. They have no
individual due date, so the system cannot compute how old they are or which
aging bucket they belong to.

The flag is always severity `grey` (informational only). It does not trigger
collection actions on its own.

**Why the software cannot clear it:**

The B/F balance exists because the source back-office system did not export the
individual invoices that make up that balance — it only exported a single
summary row. The recovery system has no way to know:

- Which invoices are included in the balance
- When those invoices were due
- Whether any partial payments have been applied

Until the back-office system provides a line-by-line breakdown of the brought-
forward balance, the flag will remain. The software cannot invent due dates or
split the balance — doing so would be a guess that could lead to incorrect
collection actions on real money.

**What to do:**

1. Contact the team that manages the travel back-office system and ask them to
   export a historical statement that breaks down the B/F balance into
   individual invoice lines.
2. Import that historical statement as a separate ledger import.
3. Once the individual invoices are present as `open_item` rows with proper
   `due_date` values, the `is_unaged = true` item can be settled (set
   `status = 'settled'`) and the flag will auto-resolve on the next flag
   evaluation run.

Do not acknowledge the grey flag as a substitute for getting the data — it
will keep appearing every time flag evaluation runs unless the underlying data
is corrected.

---

## 7. How to hand a stuck job back to pending

A job is "stuck" when its `status = 'running'` but the worker that claimed it
has crashed or timed out. The `reclaimStuckJobs()` function normally handles
this automatically (it runs every tick via the cron) — but if a job is stuck
in a terminal or unusual state, you may need to reset it manually.

**Check for stuck jobs:**

```sql
SELECT id, kind, status, locked_at, locked_by, last_error
FROM job
WHERE status IN ('running', 'failed')
ORDER BY locked_at ASC;
```

**Reset a specific job to pending:**

```sql
UPDATE job
SET
  status       = 'pending',
  locked_at    = NULL,
  locked_by    = NULL,
  run_after    = now()
WHERE id = '<job-uuid>';
```

**Reset all failed jobs for a specific kind:**

```sql
UPDATE job
SET
  status    = 'pending',
  locked_at = NULL,
  locked_by = NULL,
  run_after = now()
WHERE status = 'failed'
  AND kind   = 'case.evaluate';
```

**Reset a dead job (dead = exhausted all attempts):**

Dead jobs will not be retried automatically. You must also reset their attempt
counter if you want them to run again:

```sql
UPDATE job
SET
  status    = 'pending',
  attempts  = 0,
  locked_at = NULL,
  locked_by = NULL,
  run_after = now(),
  last_error = NULL
WHERE id = '<job-uuid>'
  AND status = 'dead';
```

**Important:** Before resetting a job, check `last_error` to understand why it
failed. Resetting a job whose handler will immediately fail again just wastes
cycles and fills the error log. Fix the root cause first, then reset.
