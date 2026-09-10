import { isWithinQuietHours } from "@/lib/dates";

export type Channel = "whatsapp" | "email" | "voice" | "human";

export interface RailsInput {
  now: Date;
  is_kill_switch_on: boolean;
  is_client_muted: boolean;
  muted_until: Date | null;
  is_suppressed: boolean; // case status = suppressed
  has_active_dispute: boolean;
  total_open_paise: bigint;
  weekly_messages_sent: number; // messages sent this week (Mon-Sun)
  max_messages_per_week: number;
  quiet_hours_start: string; // "HH:MM" e.g. "19:00"
  quiet_hours_end: string; // "HH:MM" e.g. "10:00"
  channel: Channel;
  contact_whatsapp_opt_in: boolean;
  contact_email_opt_in: boolean;
  contact_voice_opt_in: boolean;
  contact_phone_e164: string | null;
  contact_email: string | null;
  requires_human_approval: boolean;
  has_human_approval: boolean;
}

export type RailsResult =
  | { allowed: true }
  | { allowed: false; reason: string; rule: string };

export function checkRails(input: RailsInput): RailsResult {
  // Rule 1: kill_switch
  if (input.is_kill_switch_on) {
    return {
      allowed: false,
      reason: "Global kill switch is active — all outreach halted",
      rule: "kill_switch",
    };
  }

  // Rule 2: mute
  if (
    input.is_client_muted &&
    (input.muted_until === null || input.now < input.muted_until)
  ) {
    return {
      allowed: false,
      reason: "Client is muted",
      rule: "mute",
    };
  }

  // Rule 3: suppression
  if (input.is_suppressed) {
    return {
      allowed: false,
      reason: "Case is suppressed",
      rule: "suppression",
    };
  }

  // Rule 4: dispute
  if (input.has_active_dispute) {
    return {
      allowed: false,
      reason: "Client has an active dispute",
      rule: "dispute",
    };
  }

  // Rule 5: zero_balance
  if (input.total_open_paise <= 0n) {
    return {
      allowed: false,
      reason: "No outstanding balance — nothing to collect",
      rule: "zero_balance",
    };
  }

  // Rule 6: weekly_cap
  if (input.weekly_messages_sent >= input.max_messages_per_week) {
    return {
      allowed: false,
      reason: `Weekly message cap of ${input.max_messages_per_week} reached (sent ${input.weekly_messages_sent})`,
      rule: "weekly_cap",
    };
  }

  // Rule 7: quiet_hours
  if (
    isWithinQuietHours(input.now, input.quiet_hours_start, input.quiet_hours_end)
  ) {
    return {
      allowed: false,
      reason: `Current time is within quiet hours (${input.quiet_hours_start}–${input.quiet_hours_end})`,
      rule: "quiet_hours",
    };
  }

  // Rule 8: opt_in
  if (input.channel === "whatsapp" && !input.contact_whatsapp_opt_in) {
    return {
      allowed: false,
      reason: "Contact has not opted in to WhatsApp messages",
      rule: "opt_in",
    };
  }
  if (input.channel === "email" && !input.contact_email_opt_in) {
    return {
      allowed: false,
      reason: "Contact has not opted in to email messages",
      rule: "opt_in",
    };
  }
  if (
    input.channel === "voice" &&
    (!input.contact_voice_opt_in || input.contact_phone_e164 === null)
  ) {
    return {
      allowed: false,
      reason: "Contact has not opted in to voice calls or has no phone number",
      rule: "opt_in",
    };
  }

  // Rule 9: required_field
  if (
    (input.channel === "whatsapp" || input.channel === "voice") &&
    input.contact_phone_e164 === null
  ) {
    return {
      allowed: false,
      reason: `Channel "${input.channel}" requires a phone number (E.164) but none is set`,
      rule: "required_field",
    };
  }
  if (input.channel === "email" && input.contact_email === null) {
    return {
      allowed: false,
      reason: "Channel \"email\" requires an email address but none is set",
      rule: "required_field",
    };
  }

  // Rule 10: human_approval
  if (input.requires_human_approval && !input.has_human_approval) {
    return {
      allowed: false,
      reason: "Message requires human approval before sending",
      rule: "human_approval",
    };
  }

  return { allowed: true };
}
