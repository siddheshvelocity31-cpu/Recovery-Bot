import { describe, it, expect } from "vitest"
import { computeAgingBucket } from "@/lib/ledger/aging"
import type { OpenItemForAging } from "@/lib/ledger/aging"

// Fixed "today" used throughout most tests
const TODAY = new Date("2026-09-20T00:00:00Z")

function makeItem(overrides: Partial<OpenItemForAging> & Pick<OpenItemForAging, "due_date">): OpenItemForAging {
  return {
    id: "item-1",
    is_unaged: false,
    ...overrides,
  }
}

describe("computeAgingBucket — is_unaged flag", () => {
  it("is_unaged=true always returns 'unknown' even when due_date is set", () => {
    const item = makeItem({ due_date: "2026-09-01", is_unaged: true })
    expect(computeAgingBucket(item, TODAY)).toBe("unknown")
  })

  it("is_unaged=true with far-past due_date still returns 'unknown'", () => {
    const item = makeItem({ due_date: "2026-01-01", is_unaged: true })
    expect(computeAgingBucket(item, TODAY)).toBe("unknown")
  })
})

describe("computeAgingBucket — null due_date", () => {
  it("due_date=null returns 'unknown'", () => {
    const item = makeItem({ due_date: null })
    expect(computeAgingBucket(item, TODAY)).toBe("unknown")
  })

  it("due_date=null with is_unaged=false still returns 'unknown'", () => {
    const item = makeItem({ due_date: null, is_unaged: false })
    expect(computeAgingBucket(item, TODAY)).toBe("unknown")
  })
})

describe("computeAgingBucket — bucket boundaries (today = 2026-09-20)", () => {
  it("0 days past due (due today) → 'current'", () => {
    const item = makeItem({ due_date: "2026-09-20" })
    expect(computeAgingBucket(item, TODAY)).toBe("current")
  })

  it("1 day in the future → 'current'", () => {
    const item = makeItem({ due_date: "2026-09-21" })
    expect(computeAgingBucket(item, TODAY)).toBe("current")
  })

  it("1 day past due → 'd1_30'", () => {
    const item = makeItem({ due_date: "2026-09-19" })
    expect(computeAgingBucket(item, TODAY)).toBe("d1_30")
  })

  it("30 days past due (inclusive upper boundary) → 'd1_30'", () => {
    // 2026-09-20 minus 30 days = 2026-08-21
    const item = makeItem({ due_date: "2026-08-21" })
    expect(computeAgingBucket(item, TODAY)).toBe("d1_30")
  })

  it("31 days past due → 'd31_60'", () => {
    // 2026-09-20 minus 31 days = 2026-08-20
    const item = makeItem({ due_date: "2026-08-20" })
    expect(computeAgingBucket(item, TODAY)).toBe("d31_60")
  })

  it("60 days past due (inclusive upper boundary) → 'd31_60'", () => {
    // 2026-09-20 minus 60 days = 2026-07-22
    const item = makeItem({ due_date: "2026-07-22" })
    expect(computeAgingBucket(item, TODAY)).toBe("d31_60")
  })

  it("61 days past due → 'd61_90'", () => {
    // 2026-09-20 minus 61 days = 2026-07-21
    const item = makeItem({ due_date: "2026-07-21" })
    expect(computeAgingBucket(item, TODAY)).toBe("d61_90")
  })

  it("90 days past due (inclusive upper boundary) → 'd61_90'", () => {
    // 2026-09-20 minus 90 days = 2026-06-22
    const item = makeItem({ due_date: "2026-06-22" })
    expect(computeAgingBucket(item, TODAY)).toBe("d61_90")
  })

  it("91 days past due → 'd90_plus'", () => {
    // 2026-09-20 minus 91 days = 2026-06-21
    const item = makeItem({ due_date: "2026-06-21" })
    expect(computeAgingBucket(item, TODAY)).toBe("d90_plus")
  })
})

describe("computeAgingBucket — fixture case (invoice due 2026-09-16)", () => {
  // Issue date 2026-08-17 + 30 days = 2026-09-16
  const invoiceDueDate = "2026-09-16"

  it("due 2026-09-16 is 'current' when today=2026-09-01 (15 days before due)", () => {
    const item = makeItem({ due_date: invoiceDueDate })
    const today = new Date("2026-09-01T00:00:00Z")
    expect(computeAgingBucket(item, today)).toBe("current")
  })

  it("due 2026-09-16 is 'd1_30' when today=2026-09-20 (4 days overdue)", () => {
    const item = makeItem({ due_date: invoiceDueDate })
    const today = new Date("2026-09-20T00:00:00Z")
    expect(computeAgingBucket(item, today)).toBe("d1_30")
  })
})
