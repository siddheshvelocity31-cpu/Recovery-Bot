import type { CaseStatus } from "./types"

export type LegalTransition = {
  from: CaseStatus | '*'   // '*' means any non-terminal status (excludes 'resolved')
  to: CaseStatus
  description: string
}

// Non-terminal statuses that may originate transitions.
// 'resolved' is terminal — nothing transitions FROM it.
const NON_TERMINAL: CaseStatus[] = ['open', 'awaiting_reply', 'promise_active', 'escalated', 'suppressed']

export const LEGAL_TRANSITIONS: LegalTransition[] = [
  // ── Transitions INTO awaiting_reply ──────────────────────────────────────
  // Only 'open' may dispatch a step and move to awaiting_reply.
  // Self-loop is allowed (e.g. status is already awaiting_reply and we stay).
  { from: 'open',           to: 'awaiting_reply',  description: 'Step dispatched' },
  { from: 'awaiting_reply', to: 'awaiting_reply',  description: 'Continuing to await reply' },

  // ── Transitions INTO open ─────────────────────────────────────────────────
  { from: 'awaiting_reply', to: 'open',            description: 'Next step time arrived with no reply' },
  { from: 'promise_active', to: 'open',            description: 'Promise expired past grace period' },
  // Any non-terminal status can return to open (e.g. suppression lifted, or continuing)
  { from: '*',              to: 'open',             description: 'Continuing' },

  // ── Transitions INTO promise_active ──────────────────────────────────────
  // Any non-terminal status may enter promise_active when a confirmed commitment exists.
  { from: '*',              to: 'promise_active',  description: 'Confirmed commitment exists' },

  // ── Transitions INTO escalated ────────────────────────────────────────────
  // Only 'open' escalates on cadence exhaustion. Escalated can stay escalated.
  { from: 'open',           to: 'escalated',        description: 'Cadence exhausted' },
  { from: 'escalated',      to: 'escalated',        description: 'Already escalated, remaining escalated' },

  // ── Transitions INTO suppressed ───────────────────────────────────────────
  // Any non-terminal status may be suppressed.
  { from: '*',              to: 'suppressed',       description: 'Client muted, item disputed, or credit pending' },

  // ── Transitions INTO resolved ─────────────────────────────────────────────
  // Any non-terminal status may resolve when total open reaches zero.
  { from: '*',              to: 'resolved',         description: 'Total open reaches zero' },
]

export function assertLegalTransition(from: CaseStatus, to: CaseStatus): void {
  // 'resolved' is a terminal state — no outbound transitions are permitted.
  if (from === 'resolved') {
    throw new Error(`Illegal transition: ${from} -> ${to}`)
  }

  const legal = LEGAL_TRANSITIONS.some(t => {
    if (t.to !== to) return false
    if (t.from === '*') {
      // Wildcard applies only to non-terminal source statuses.
      return (NON_TERMINAL as string[]).includes(from)
    }
    return t.from === from
  })

  if (!legal) {
    throw new Error(`Illegal transition: ${from} -> ${to}`)
  }
}
