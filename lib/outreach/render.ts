import { getTemplate } from "@/lib/outreach/templates"

export interface RenderContext {
  contact_name: string
  client_name: string
  total_open: string       // pre-formatted, e.g. "₹66,97,661.00"
  oldest_due_date: string  // pre-formatted, e.g. "17 Aug 2026"
  invoice_count: string    // e.g. "103"
  statement_period: string // e.g. "Apr 2026 – Aug 2026"
}

export interface RenderInput {
  template_key: string
  channel: "whatsapp" | "email" | "voice" | "human"
  context: RenderContext
  persona_tone: "courteous" | "neutral" | "firm"
  salutation: string
  signature: string
}

export interface RenderedMessage {
  body: string
  subject: string | null // null for non-email channels
}

// Non-global variant used for .test() checks — avoids stateful lastIndex issues
const PLACEHOLDER_RE_TEST = /\{[^}]+\}/

function resolvePlaceholders(text: string, context: RenderContext): string {
  return text.replace(/\{[^}]+\}/g, (match) => {
    const key = match.slice(1, -1) as keyof RenderContext
    if (key in context) {
      return context[key]
    }
    // Return the original placeholder so the unresolved check can catch it
    return match
  })
}

export function renderMessage(input: RenderInput): RenderedMessage {
  const template = getTemplate(input.template_key)
  if (template === undefined) {
    throw new Error(`Unknown template: ${input.template_key}`)
  }

  // Pick the raw template text for the channel
  let rawBody: string
  switch (input.channel) {
    case "whatsapp":
      rawBody = template.whatsapp
      break
    case "email":
      rawBody = template.email_body
      break
    case "voice":
    case "human":
      rawBody = template.voice_script
      break
  }

  // Resolve placeholders in body
  const resolvedBody = resolvePlaceholders(rawBody, input.context)

  // Guard against any remaining unresolved placeholders
  if (PLACEHOLDER_RE_TEST.test(resolvedBody)) {
    throw new Error(`Unresolved placeholders in template: ${input.template_key}`)
  }

  // Wrap with salutation and signature
  const body = `${input.salutation}\n\n${resolvedBody}\n\n${input.signature}`

  // For email, resolve placeholders in the subject too
  let subject: string | null = null
  if (input.channel === "email") {
    const resolvedSubject = resolvePlaceholders(template.email_subject, input.context)
    if (PLACEHOLDER_RE_TEST.test(resolvedSubject)) {
      throw new Error(`Unresolved placeholders in template: ${input.template_key}`)
    }
    subject = resolvedSubject
  }

  return { body, subject }
}
