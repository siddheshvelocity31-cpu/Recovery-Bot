# T-029 · Dry-run dispatcher and the notifications tab

**Status:** not started
**Depends on:** T-028
**Size:** M
**Blocked by:** —

## Goal
Queued outreach is rendered into the exact message text that would be sent, recorded, and
shown on the client's trail and notifications tab — with no network call to any provider.

## Context to read first
- `docs/plan/00-OVERVIEW.md` § Scope — why dry run is the endpoint of this plan
- `CLAUDE.md` § Non-negotiables — `is_dry_run` defaults to true
- `docs/plan/02-CONTRACTS.md` § API surface → `/api/clients/:id/outreach`
- `lib/policy/resolve.ts` — the persona that shapes the rendering

## Files
**Create:** `lib/outreach/render.ts`, `lib/outreach/templates.ts`,
`lib/outreach/dispatch.ts`, `lib/outreach/adapters/dry-run.ts`,
`lib/jobs/handlers/outreach-dispatch.ts`, `components/clients/notifications-table.tsx`,
`app/api/clients/[clientId]/outreach/route.ts`,
`tests/unit/render.test.ts`, `tests/integration/dispatch.test.ts`
**Modify:** `lib/jobs/handlers/index.ts` (register),
`app/(app)/clients/[clientId]/page.tsx` (add the Notifications tab only)
**Do not touch:** `lib/cases/evaluate.ts`, `lib/policy/rails.ts`

## Implementation notes
1. `lib/outreach/templates.ts` holds a local map from `template_key` to a body with
   placeholders. **Keep the WhatsApp bodies tone-neutral and identical across categories**,
   per the project plan: real Meta templates cannot vary by tone without multiplying the
   approval surface, and building the code as though they can bakes in a wrong assumption.
   Email bodies do carry the persona's tone, salutation and signature.
2. `renderMessage(template, context, persona)` is pure. Placeholders:
   `{contact_name}`, `{client_name}`, `{total_open}`, `{oldest_due_date}`,
   `{invoice_count}`, `{statement_period}`. Amounts render through `formatPaise`.
   **An unresolved placeholder is an error, not a passthrough** — a message reading
   "you owe {total_open}" reaching a client is the kind of failure that ends trust in the
   tool, and it is trivially preventable here.
3. The dispatcher selects an adapter by channel. In this plan **only the dry-run adapter
   exists**. It sets `status = 'sent'` with `is_dry_run = true`, `provider = 'dry-run'` and
   `sent_at = now()`, so the full downstream state machine is exercised exactly as it will be
   live. Real adapters land in the later phase behind the same interface.
4. Define the `OutreachAdapter` interface now — `send(outreach, contact): Promise<SendResult>`
   — even though there is one implementation. The interface is the point: it is what lets
   DoubleTick, SMTP and Sarvam land later without touching the dispatcher.
5. Write `outreach.dry_run` to the trail with the rendered body in the payload, so a reviewer
   can read exactly what would have gone out. This is the artefact the dry-run week produces
   and the thing the accounts team will actually review.
6. The Notifications tab lists outreach with channel, template, tone, status, scheduled and
   sent times, and a expandable rendered body. Mark dry-run rows with an unmistakable badge.
   Someone will eventually look at this screen and need to know instantly whether these
   messages really went out.
7. After dispatch, enqueue a follow-up `case.evaluate` so the case advances on the next tick.

## Acceptance criteria
- [ ] `npm test -- tests/unit/render.test.ts` passes
- [ ] `npm test -- tests/integration/dispatch.test.ts` passes
- [ ] Test proves an unresolved placeholder throws rather than rendering literally
- [ ] Test proves `{total_open}` renders as `₹66,97,661.00` for Olectra
- [ ] Test proves the same `template_key` renders identical WhatsApp text for a `courteous`
      and a `firm` persona, and different email text for the two
- [ ] Test proves dispatch sets `is_dry_run = true`, `provider = 'dry-run'`, `status = 'sent'`
- [ ] Test proves an `outreach.dry_run` event exists containing the rendered body
- [ ] Test asserts **zero** outbound HTTP requests occur during dispatch (assert via a
      global fetch spy that fails the test if called)
- [ ] Test proves dispatching the same `outreach` row twice does not duplicate the event
- [ ] Manual: run a full cycle on the fixture and read the rendered message on the
      Notifications tab
- [ ] `npm run check` exits 0

## Out of scope
Any real provider — DoubleTick, SMTP, Sarvam are all the later phase. Inbound replies.
Promise extraction. Attachments.

## Commit
`feat(outreach): add dry-run dispatcher with message rendering`
