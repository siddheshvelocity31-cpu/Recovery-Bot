export type TemplateKey = string // e.g. "reminder_1", "escalation_1"

export interface Template {
  key: TemplateKey
  whatsapp: string
  email_subject: string
  email_body: string
  voice_script: string
}

// Valid placeholders: {contact_name}, {client_name}, {total_open},
// {oldest_due_date}, {invoice_count}, {statement_period}

export const TEMPLATES: Template[] = [
  {
    key: "reminder_1",
    whatsapp:
      "Dear {contact_name}, this is a reminder that {client_name} has an outstanding balance of {total_open}. Please arrange payment at your earliest convenience.",
    email_subject: "Payment Reminder – {client_name} Outstanding Balance of {total_open}",
    email_body:
      "Dear {contact_name}, this is a reminder that {client_name} has an outstanding balance of {total_open}. Please arrange payment at your earliest convenience.",
    voice_script:
      "Dear {contact_name}, this is a reminder that {client_name} has an outstanding balance of {total_open}. Please arrange payment at your earliest convenience.",
  },
  {
    key: "reminder_2",
    whatsapp:
      "Dear {contact_name}, we note that the invoice balance of {total_open} for {client_name} remains unpaid. Kindly settle this at the earliest.",
    email_subject: "Second Payment Reminder – {client_name} Balance of {total_open} Remains Unpaid",
    email_body:
      "Dear {contact_name}, we note that the invoice balance of {total_open} for {client_name} remains unpaid. Kindly settle this at the earliest.",
    voice_script:
      "Dear {contact_name}, we note that the invoice balance of {total_open} for {client_name} remains unpaid. Kindly settle this at the earliest.",
  },
  {
    key: "escalation_1",
    whatsapp:
      "Dear {contact_name}, despite our previous communications, the outstanding balance of {total_open} for {client_name} remains unpaid. We request immediate attention.",
    email_subject: "Escalation Notice – {client_name} Outstanding Balance of {total_open} Requires Immediate Attention",
    email_body:
      "Dear {contact_name}, despite our previous communications, the outstanding balance of {total_open} for {client_name} remains unpaid. We request immediate attention.",
    voice_script:
      "Dear {contact_name}, despite our previous communications, the outstanding balance of {total_open} for {client_name} remains unpaid. We request immediate attention.",
  },
  {
    key: "final_notice",
    whatsapp:
      "Dear {contact_name}, this is a final notice regarding the outstanding balance of {total_open} for {client_name}. Please contact us within 24 hours.",
    email_subject: "Final Notice – {client_name} Outstanding Balance of {total_open}",
    email_body:
      "Dear {contact_name}, this is a final notice regarding the outstanding balance of {total_open} for {client_name}. Please contact us within 24 hours.",
    voice_script:
      "Dear {contact_name}, this is a final notice regarding the outstanding balance of {total_open} for {client_name}. Please contact us within 24 hours.",
  },
]

const TEMPLATE_MAP = new Map<TemplateKey, Template>(
  TEMPLATES.map((t) => [t.key, t]),
)

export function getTemplate(key: TemplateKey): Template | undefined {
  return TEMPLATE_MAP.get(key)
}
