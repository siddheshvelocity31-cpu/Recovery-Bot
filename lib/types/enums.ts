export const UserRole = {
  admin: "admin",
  collector: "collector",
  viewer: "viewer",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const RelationshipTier = {
  strategic: "strategic",
  standard: "standard",
  watchlist: "watchlist",
  new: "new",
} as const;
export type RelationshipTier = (typeof RelationshipTier)[keyof typeof RelationshipTier];

export const BehaviourBand = {
  prompt: "prompt",
  slipping: "slipping",
  chronic: "chronic",
  unknown: "unknown",
} as const;
export type BehaviourBand = (typeof BehaviourBand)[keyof typeof BehaviourBand];

export const ImportStatus = {
  pending: "pending",
  parsing: "parsing",
  imported: "imported",
  failed: "failed",
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const EntryType = {
  debit: "debit",
  credit: "credit",
  opening: "opening",
} as const;
export type EntryType = (typeof EntryType)[keyof typeof EntryType];

export const OpenItemStatus = {
  open: "open",
  part_paid: "part_paid",
  settled: "settled",
  disputed: "disputed",
  written_off: "written_off",
} as const;
export type OpenItemStatus = (typeof OpenItemStatus)[keyof typeof OpenItemStatus];

export const AgingBucket = {
  current: "current",
  d1_30: "d1_30",
  d31_60: "d31_60",
  d61_90: "d61_90",
  d90_plus: "d90_plus",
  unknown: "unknown",
} as const;
export type AgingBucket = (typeof AgingBucket)[keyof typeof AgingBucket];

export const Channel = {
  whatsapp: "whatsapp",
  email: "email",
  voice: "voice",
  human: "human",
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

export const Tone = {
  courteous: "courteous",
  neutral: "neutral",
  firm: "firm",
} as const;
export type Tone = (typeof Tone)[keyof typeof Tone];

export const CaseStatus = {
  open: "open",
  awaiting_reply: "awaiting_reply",
  promise_active: "promise_active",
  escalated: "escalated",
  suppressed: "suppressed",
  resolved: "resolved",
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export const OutreachStatus = {
  queued: "queued",
  suppressed: "suppressed",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
} as const;
export type OutreachStatus = (typeof OutreachStatus)[keyof typeof OutreachStatus];

export const CommitmentStatus = {
  proposed: "proposed",
  confirmed: "confirmed",
  kept: "kept",
  partial: "partial",
  broken: "broken",
  rejected: "rejected",
} as const;
export type CommitmentStatus = (typeof CommitmentStatus)[keyof typeof CommitmentStatus];

export const FlagRule = {
  aged_debt: "aged_debt",
  amount_exposure: "amount_exposure",
  broken_promise: "broken_promise",
  silence: "silence",
  adverse_trajectory: "adverse_trajectory",
  unaged_balance: "unaged_balance",
} as const;
export type FlagRule = (typeof FlagRule)[keyof typeof FlagRule];

export const FlagSeverity = {
  red: "red",
  amber: "amber",
  grey: "grey",
} as const;
export type FlagSeverity = (typeof FlagSeverity)[keyof typeof FlagSeverity];

export const ActorType = {
  system: "system",
  user: "user",
  client: "client",
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const JobStatus = {
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
  dead: "dead",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
