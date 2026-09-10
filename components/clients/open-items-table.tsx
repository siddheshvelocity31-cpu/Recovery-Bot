import { formatPaise } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Th, Td } from "@/components/ui/table";
import { cn } from "@/lib/cn";

export interface OpenItem {
  id: string;
  source_doc_code: string;
  issue_date: string;
  due_date: string | null;
  gross_amount_paise: string;
  credits_applied_paise: string;
  receipts_applied_paise: string;
  open_amount_paise: string;
  status: string;
  aging_bucket: string;
  is_unaged: boolean;
}

function BucketBadge({ bucket }: { bucket: string }) {
  const map: Record<string, { label: string; variant: "default" | "success" | "info" | "warning" | "error" }> = {
    d90_plus: { label: "90+ days", variant: "error" },
    d61_90: { label: "61–90 days", variant: "warning" },
    d31_60: { label: "31–60 days", variant: "warning" },
    d1_30: { label: "1–30 days", variant: "info" },
    current: { label: "Current", variant: "success" },
    unknown: { label: "Unknown", variant: "default" },
  };

  const config = map[bucket] ?? { label: "Unknown", variant: "default" };
  return <Badge variant={config.variant} className="text-label">{config.label}</Badge>;
}

function MoneyCell({ value, className }: { value: string; className?: string }) {
  const paise = BigInt(value);
  const isNegative = paise < 0n;
  return (
    <span
      className={cn(
        "text-mono tabular-nums",
        isNegative ? "text-error font-medium" : "text-primary",
        className,
      )}
    >
      {formatPaise(paise)}
    </span>
  );
}

export function OpenItemsTable({ items }: { items: OpenItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-sm border border-neutral-200 p-8 text-center dark:border-white/15">
        <p className="text-body text-muted">No open items found.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-sm border border-neutral-200 dark:border-white/15">
      <div className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none bg-gradient-to-l from-neutral-50 to-transparent dark:from-neutral-950" aria-hidden="true" />
      <table className="w-full min-w-max text-body-sm">
        <thead>
          <tr>
            <Th>Doc Code</Th>
            <Th>Issue Date</Th>
            <Th>Due Date</Th>
            <Th className="text-right">Gross</Th>
            <Th className="text-right">Credits</Th>
            <Th className="text-right">Open Amount</Th>
            <Th>Bucket</Th>
            <Th>Status</Th>
            <Th className="w-20">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200/50 dark:divide-white/10">
          {items.map((item) => {
            const isUnaged = item.is_unaged;
            return (
              <tr key={item.id} className={cn(isUnaged && "bg-neutral-50/50 dark:bg-white/5", "hover:bg-neutral-50/50 dark:hover:bg-white/5 transition-all duration-200")}>
                <Td className="text-mono text-muted whitespace-nowrap">
                  {item.source_doc_code}
                  {isUnaged && <span className="ml-2 text-mono-sm text-muted">B/F</span>}
                </Td>
                <Td className="whitespace-nowrap text-body-sm text-secondary">{item.issue_date}</Td>
                <Td className="whitespace-nowrap text-body-sm text-secondary">
                  {isUnaged ? (
                    <span className="text-muted">
                      — <span className="ml-1 text-mono-sm">(unaged)</span>
                    </span>
                  ) : item.due_date ? (
                    item.due_date
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td className="text-right"><MoneyCell value={item.gross_amount_paise} /></Td>
                <Td className="text-right"><MoneyCell value={item.credits_applied_paise} /></Td>
                <Td className="text-right"><MoneyCell value={item.open_amount_paise} /></Td>
                <Td><BucketBadge bucket={item.aging_bucket} /></Td>
                <Td><Badge variant="outline" className="text-label">{item.status}</Badge></Td>
                <Td>
                  <Button variant="ghost" size="sm" className="text-muted hover:text-primary" title="View details">
                    View
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
