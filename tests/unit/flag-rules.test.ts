import { describe, it, expect } from "vitest"
import {
  evaluateAllRules,
  evaluateAgedDebt,
  evaluateUnageBalance,
} from "@/lib/flags/rules"
import type { ClientForFlags, OpenItemForFlags } from "@/lib/flags/rules"

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeClient(overrides: Partial<ClientForFlags> = {}): ClientForFlags {
  return {
    client_id: "client-abc",
    threshold_amber_days: 30,
    threshold_red_days: 60,
    threshold_amber_amount_paise: null,
    threshold_red_amount_paise: null,
    silence_attempts: 3,
    consecutive_failed_outreach: 0,
    has_broken_promise: false,
    days_since_last_reply: null,
    today: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  }
}

function makeItem(overrides: Partial<OpenItemForFlags> & Pick<OpenItemForFlags, "id">): OpenItemForFlags {
  return {
    source_doc_code: "INV-001",
    due_date: "2026-09-20",
    open_amount_paise: 100_000n,
    aging_bucket: "current",
    is_unaged: false,
    status: "open",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// unaged_balance rule
// ---------------------------------------------------------------------------

describe("evaluateUnageBalance — unaged item", () => {
  it("single is_unaged=true item with positive balance raises exactly one unaged_balance flag", () => {
    const client = makeClient()
    const items = [makeItem({ id: "item-1", is_unaged: true, aging_bucket: "unknown" })]
    const flag = evaluateUnageBalance(client, items, 500_000n)
    expect(flag).not.toBeNull()
    expect(flag!.rule).toBe("unaged_balance")
  })

  it("unaged_balance flag has severity 'grey'", () => {
    const client = makeClient()
    const items = [makeItem({ id: "item-1", is_unaged: true, aging_bucket: "unknown" })]
    const flag = evaluateUnageBalance(client, items, 500_000n)
    expect(flag!.severity).toBe("grey")
  })

  it("unaged_balance flag message mentions 'Brought-forward balance'", () => {
    const client = makeClient()
    const items = [makeItem({ id: "item-1", is_unaged: true, aging_bucket: "unknown" })]
    const flag = evaluateUnageBalance(client, items, 500_000n)
    expect(flag!.message.toLowerCase()).toContain("brought-forward")
  })

  it("unaged_balance flag message mentions 'cannot be aged'", () => {
    const client = makeClient()
    const items = [makeItem({ id: "item-1", is_unaged: true, aging_bucket: "unknown" })]
    const flag = evaluateUnageBalance(client, items, 500_000n)
    expect(flag!.message.toLowerCase()).toContain("cannot be aged")
  })

  it("no unaged items → returns null (no flag)", () => {
    const client = makeClient()
    const items = [makeItem({ id: "item-1", is_unaged: false, aging_bucket: "current" })]
    const flag = evaluateUnageBalance(client, items, 100_000n)
    expect(flag).toBeNull()
  })

  it("unaged item with zero balance → returns null (no flag)", () => {
    const client = makeClient()
    const items = [makeItem({ id: "item-1", is_unaged: true, aging_bucket: "unknown" })]
    const flag = evaluateUnageBalance(client, items, 0n)
    expect(flag).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// aged_debt rule
// ---------------------------------------------------------------------------

describe("evaluateAgedDebt — 95 days overdue with amber=30, red=60", () => {
  // Item is 95 days past due relative to today (2026-09-20).
  // 2026-09-20 - 95 days = 2026-06-17
  const client = makeClient({
    threshold_amber_days: 30,
    threshold_red_days: 60,
    today: new Date("2026-09-20T00:00:00Z"),
  })
  const item = makeItem({
    id: "item-red",
    due_date: "2026-06-17",
    aging_bucket: "d90_plus", // >90 days
    is_unaged: false,
  })

  it("raises aged_debt flag with severity 'red'", () => {
    const flags = evaluateAgedDebt(client, [item])
    expect(flags).toHaveLength(1)
    expect(flags[0]!.rule).toBe("aged_debt")
    expect(flags[0]!.severity).toBe("red")
  })

  it("aged_debt message contains the months count", () => {
    const flags = evaluateAgedDebt(client, [item])
    // 95 days → Math.ceil(95/30) = 4 months
    expect(flags[0]!.message).toContain("4 month(s)")
  })

  it("aged_debt message contains the invoice doc code", () => {
    const flags = evaluateAgedDebt(client, [item])
    expect(flags[0]!.message).toContain(item.source_doc_code)
  })
})

describe("evaluateAgedDebt — 20 days overdue with amber=30", () => {
  // 20 days < amber threshold of 30 → no flag
  const client = makeClient({
    threshold_amber_days: 30,
    threshold_red_days: 60,
    today: new Date("2026-09-20T00:00:00Z"),
  })
  const item = makeItem({
    id: "item-current-20",
    due_date: "2026-08-31", // 20 days before 2026-09-20
    aging_bucket: "d1_30",
    is_unaged: false,
  })

  it("raises NO aged_debt flag when only 20 days overdue (below amber threshold)", () => {
    const flags = evaluateAgedDebt(client, [item])
    expect(flags).toHaveLength(0)
  })
})

describe("evaluateAgedDebt — is_unaged items are skipped entirely", () => {
  const client = makeClient()
  const item = makeItem({
    id: "item-bf",
    due_date: "2026-01-01", // very old
    aging_bucket: "d90_plus",
    is_unaged: true,
  })

  it("is_unaged=true item raises NO aged_debt flag", () => {
    const flags = evaluateAgedDebt(client, [item])
    expect(flags).toHaveLength(0)
  })
})

describe("evaluateAgedDebt — current / unknown bucket items are skipped", () => {
  const client = makeClient({
    threshold_amber_days: 0, // any overdue triggers
    threshold_red_days: 0,
    today: new Date("2026-09-20T00:00:00Z"),
  })

  it("item with aging_bucket='current' raises no aged_debt flag", () => {
    const item = makeItem({ id: "item-curr", due_date: "2026-09-20", aging_bucket: "current" })
    expect(evaluateAgedDebt(client, [item])).toHaveLength(0)
  })

  it("item with aging_bucket='unknown' raises no aged_debt flag", () => {
    const item = makeItem({ id: "item-unk", due_date: null, aging_bucket: "unknown" })
    expect(evaluateAgedDebt(client, [item])).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// dedupe_key stability
// ---------------------------------------------------------------------------

describe("evaluateAgedDebt — dedupe_key is stable across repeated calls", () => {
  it("same inputs always produce the same dedupe_key", () => {
    const client = makeClient({ client_id: "client-xyz" })
    const item = makeItem({
      id: "item-42",
      due_date: "2026-06-17",
      aging_bucket: "d90_plus",
    })
    const flags1 = evaluateAgedDebt(client, [item])
    const flags2 = evaluateAgedDebt(client, [item])
    expect(flags1[0]!.dedupe_key).toBe(flags2[0]!.dedupe_key)
    expect(flags1[0]!.dedupe_key).toBe("client-xyz:aged_debt:item-42")
  })
})

// ---------------------------------------------------------------------------
// evaluateAllRules — unaged item raises unaged_balance, NOT aged_debt
// ---------------------------------------------------------------------------

describe("evaluateAllRules — unaged-only items", () => {
  it("unaged item raises exactly one unaged_balance flag and zero aged_debt flags", () => {
    const client = makeClient()
    const items = [makeItem({ id: "item-bf", is_unaged: true, aging_bucket: "unknown" })]
    const total_open_paise = 500_000n
    const total_unaged_paise = 500_000n

    const flags = evaluateAllRules(client, items, total_open_paise, total_unaged_paise)

    const unagedFlags = flags.filter((f) => f.rule === "unaged_balance")
    const agedDebtFlags = flags.filter((f) => f.rule === "aged_debt")

    expect(unagedFlags).toHaveLength(1)
    expect(agedDebtFlags).toHaveLength(0)
    expect(unagedFlags[0]!.severity).toBe("grey")
  })
})

// ---------------------------------------------------------------------------
// evaluateAllRules — zero balance produces no flags from balance-dependent rules
// ---------------------------------------------------------------------------

describe("evaluateAllRules — zero balance", () => {
  it("returns no aged_debt or unaged_balance flags when balance is zero", () => {
    const client = makeClient()
    const items: OpenItemForFlags[] = []
    const flags = evaluateAllRules(client, items, 0n, 0n)
    const balanceFlags = flags.filter(
      (f) => f.rule === "aged_debt" || f.rule === "unaged_balance",
    )
    expect(balanceFlags).toHaveLength(0)
  })
})
