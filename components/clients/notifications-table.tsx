import { Badge } from "@/components/ui/badge";
import { Th, Td } from "@/components/ui/table";

export interface OutreachRow {
  id: string;
  channel: string;
  cadence_step_number: number;
  template_key: string;
  persona_tone: string;
  rendered_body: string;
  status: string;
  is_dry_run: boolean;
  scheduled_for: string;
  sent_at: string | null;
  suppression_reason: string | null;
  idempotency_key: string;
}

function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, { label: string; variant: "default" | "success" | "info" | "warning" }> = {
    whatsapp: { label: "WhatsApp", variant: "success" },
    email: { label: "Email", variant: "info" },
    voice: { label: "Voice", variant: "warning" },
    human: { label: "Human", variant: "default" },
  };
  const config = map[channel] ?? { label: "Human", variant: "default" };
  return <Badge variant={config.variant} className="text-label capitalize">{config.label}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "info" }> = {
    queued: { label: "Queued", variant: "default" },
    suppressed: { label: "Suppressed", variant: "warning" },
    sent: { label: "Sent", variant: "info" },
    delivered: { label: "Delivered", variant: "success" },
    read: { label: "Read", variant: "success" },
    failed: { label: "Failed", variant: "error" },
  };
  const config = map[status] ?? { label: "Queued", variant: "default" };
  return <Badge variant={config.variant} className="text-label capitalize">{config.label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationsTable({ items }: { items: OutreachRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-sm border border-neutral-200 p-8 text-center dark:border-white/15">
        <p className="text-body text-muted">No notifications sent yet.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-sm border border-neutral-200 dark:border-white/15">
      <div className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none bg-gradient-to-l from-neutral-50 to-transparent dark:from-[#090a0c]" aria-hidden="true" />
      <table className="w-full min-w-max text-body-sm">
        <thead>
          <tr>
            <Th>Channel</Th>
            <Th className="text-center">Step</Th>
            <Th>Template</Th>
            <Th>Tone</Th>
            <Th>Status</Th>
            <Th>Scheduled</Th>
            <Th>Sent</Th>
            <Th>Body</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200/50 dark:divide-white/10">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-neutral-50/50 dark:hover:bg-white/5 transition-all duration-200">
              <Td className="whitespace-nowrap">
                <div className="flex flex-col gap-1">
                  <ChannelBadge channel={item.channel} />
                  {item.is_dry_run && (
                    <Badge variant="warning" className="text-label">Dry Run</Badge>
                  )}
                </div>
              </Td>
              <Td className="text-center text-body-sm text-secondary">{item.cadence_step_number}</Td>
              <Td className="text-mono text-secondary max-w-32 truncate">{item.template_key}</Td>
              <Td className="text-body-sm text-secondary capitalize">{item.persona_tone}</Td>
              <Td>
                <StatusBadge status={item.status} />
                {item.suppression_reason && (
                  <p className="mt-1 text-mono-sm text-muted max-w-32 truncate" title={item.suppression_reason}>
                    {item.suppression_reason}
                  </p>
                )}
              </Td>
              <Td className="whitespace-nowrap text-body-sm text-secondary">{formatDate(item.scheduled_for)}</Td>
              <Td className="whitespace-nowrap text-body-sm text-secondary">{formatDate(item.sent_at)}</Td>
              <Td>
                <details className="group">
                  <summary className="cursor-pointer list-none text-body-sm text-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 dark:focus-visible:ring-white">
                    <span className="group-open:hidden">Show</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <pre className="mt-2 max-w-xs overflow-x-auto whitespace-pre-wrap rounded-sm bg-neutral-100 p-2 text-mono-sm text-primary dark:bg-white/5 dark:text-white/80">
                    {item.rendered_body}
                  </pre>
                </details>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
