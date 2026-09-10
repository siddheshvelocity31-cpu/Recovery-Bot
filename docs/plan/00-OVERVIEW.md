# 00 · Overview

## What is being built

VSAR Technologies is a travel agency that bills corporate clients continuously and
collects slowly. Today, chasing money is manual: someone reads a ledger statement,
guesses who is late, messages a contact, is told "next week", and writes it nowhere.

This system automates the loop. It ingests the ledger export from the travel
back-office system, derives an invoice-level view of what is actually outstanding
and how old it is, sorts clients into categories that drive how often and how firmly
they are contacted, sends messages over WhatsApp and email (voice later), captures
replies, extracts promises to pay, and re-fires the cadence when a promise comes due.
Every action lands on a per-client trail that anyone can read.

Full business rationale, risk register and phasing live in `docs/recovery-system-plan.md`.
That document is the *why*. This directory is the *how*, and where the two disagree,
this directory wins because it is the one that has been reduced to contracts.

## Scope of this plan

This plan covers **Phases 0 through 4** of the project plan, ending at a system that
is fully operational in **dry-run mode**: it decides who to contact, when, on which
channel, in what tone, applies every safety rail, raises flags, and writes the entire
would-be conversation to the trail — while sending nothing to anyone.

That endpoint is deliberate. It is the last point at which a mistake is free.

Live sending, inbound reply capture, LLM promise extraction and Sarvam voice are
sketched as coarse epics in `04-TASK-INDEX.md` § Later phases and are **not** task-specced
here. They depend on vendor credentials, Meta template approvals and real reply data
that do not exist yet, and writing detailed tasks against them now would be fiction.

## Success criteria for this plan

1. `tests/fixtures/Olectra_Client_Ledger_Report.xlsx` imports and reconciles exactly:
   opening ₹51,30,687.00, closing ₹66,97,661.00, 107 transaction rows.
2. An accounts user can log in, see what Olectra owes broken into aged open items,
   and see the trail of everything the system decided.
3. An admin can create a category, set its cadence and thresholds, assign a client,
   and see the simulator report what that change would have sent over the last 30 days.
4. A full dry-run week produces scheduled outreach in the trail, correct per category,
   with zero network calls to any messaging provider.
5. The flag board raises "pending debt from the past X months" per category thresholds,
   and flags acknowledge and resolve correctly.

## Non-goals

- Not an accounting system. It reads the books; it is not the books.
- No live message sending in this plan. `is_dry_run` stays true throughout.
- No LLM anywhere in these tasks.
- No payment collection, payment links, or bank reconciliation.
- No multi-tenancy. One agency, one Supabase project pair.
- No mobile app. Desktop-first responsive web only.

## Glossary

| Term | Meaning |
|---|---|
| **Ledger entry** | One immutable row from the imported spreadsheet. |
| **Open item** | A derived invoice-level obligation with a due date and a balance. |
| **B/F** | Brought-forward opening balance. Has no invoice detail and no age. |
| **Case** | A live recovery effort against one client. |
| **Cadence** | The ordered sequence of contact steps for a category. |
| **Rails** | The hard safety checks every outbound message must pass. |
| **Persona** | Tone, language and signature applied to a message. |
| **Flag** | A threshold breach raised for human attention. |
| **Dry run** | Full decision-making with the send suppressed and logged. |
| **Paise** | 1/100 of a rupee. All money is stored as integer paise. |
