import "server-only";

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { formatPaise } from "@/lib/money";
import { BalanceHeader } from "@/components/clients/balance-header"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { TrailList } from "@/components/trail/trail-list";
import { OpenItemsTable, type OpenItem } from "@/components/clients/open-items-table";
import { AgingStrip } from "@/components/clients/aging-strip";
import { NotificationsTable, type OutreachRow } from "@/components/clients/notifications-table";
import { ClientFlagBanner } from "@/components/flags/client-flag-banner";
import { EditContactModal } from "@/components/clients/edit-contact-modal";
import { Th, Td } from "@/components/ui/table";
import { TabLink } from "@/components/ui/tab-link";
import { PageLink } from "@/components/ui/page-link";
import { cn } from "@/lib/cn";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronDown,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronRight,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CircleDot,
  Clock,
  FileText,
  HandCoins,
  Package,
  RadioTower,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ShieldAlert,
  TrendingUp,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Zap,
} from "lucide-react";

const PAGE_SIZE = 50;

interface SearchParams {
  tab?: string;
  page?: string;
}

interface PageProps {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<SearchParams>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  trend,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: "error" | "warning" | "neutral" | "success";
  trend?: string;
}) {
  const toneText = {
    error: "text-error",
    warning: "text-warning",
    neutral: "text-primary",
    success: "text-success",
  }[tone];

  const toneBg = {
    error: "bg-red-500/15 border-red-500/30",
    warning: "bg-amber-500/15 border-amber-500/30",
    neutral: "bg-white/5 border-white/15",
    success: "bg-emerald-500/15 border-emerald-500/30",
  }[tone];

  return (
    <div className={`glass-strong rounded-sm p-4 animate-slide-up ${toneBg}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-label text-muted">{label}</p>
        <Icon size={14} className={toneText} aria-hidden="true" />
      </div>
      <p className={`text-h3 font-mono tabular-nums ${toneText}`}>{value}</p>
      {trend && <p className="mt-1 text-mono-sm text-success">{trend}</p>}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, className = "" }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-strong rounded-sm p-6 animate-slide-up ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-primary" aria-hidden="true" />
        <h2 className="text-h3 text-primary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ProgressBar({ value, max = 100, label, tone = "neutral" }: {
  value: number;
  max?: number;
  label?: string;
  tone?: "error" | "warning" | "neutral" | "success";
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const toneFill = {
    error: "bg-error",
    warning: "bg-warning",
    neutral: "bg-primary",
    success: "bg-success",
  }[tone];

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-label text-secondary">{label}</span>
          <span className="text-mono-sm text-primary">{pct.toFixed(1)}%</span>
        </div>
      )}
      <div className="progress-bar" style={{ "--progress-width": `${pct}%` } as React.CSSProperties}>
        <div
          className={`progress-bar-fill ${toneFill} animate-enter`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default async function ClientDetailPage({ params, searchParams }: PageProps) {
  await requireRole("viewer");

  const { clientId } = await params;
  const { tab = "entries", page: pageStr } = await searchParams;
  const validTabs = ["entries", "open-items", "trail", "notifications"] as const;
  type ValidTab = typeof validTabs[number];
  const activeTab: ValidTab = (validTabs as readonly string[]).includes(tab ?? "") ? (tab as ValidTab) : "entries";
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: client, error: clientError } = await adminAny
    .from("client")
    .select("*")
    .eq("id", clientId)
    .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

  if (clientError) throw clientError;
  if (!client) notFound();

  const { data: balanceRes } = await adminAny
    .from("ledger_entry")
    .select("bill_amount_paise")
    .eq("client_id", clientId) as { data: Array<{ bill_amount_paise: number | null }> | null };

  const totalPaise = (balanceRes ?? []).reduce((acc, row) => acc + BigInt(row.bill_amount_paise ?? 0), 0n);

  const { count: entryCount } = await adminAny
    .from("ledger_entry")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId) as { count: number | null };

  // Fetch latest ledger import for exact last_import_at timestamp
  const { data: latestImportRow } = await adminAny
    .from("ledger_import")
    .select("created_at, completed_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { created_at: string | null; completed_at: string | null } | null };

  // Fetch primary contact details
  const { data: contactRow } = await adminAny
    .from("contact")
    .select("id, full_name, email, phone_e164")
    .eq("client_id", clientId)
    .maybeSingle() as { data: { id: string; full_name: string; email: string; phone_e164: string | null } | null };

  const lastImportIso = latestImportRow?.completed_at || latestImportRow?.created_at || (client["last_import_at"] as string | null);
  const formattedLastImport = lastImportIso
    ? new Date(lastImportIso).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  const totalEntries = entryCount ?? 0;
  const paise = totalPaise;
  const isNegative = paise < 0n;
  const relationshipTier = (client["relationship_tier"] as string | null) ?? "new";
  const behaviourBand = (client["behaviour_band"] as string | null) ?? "unknown";

  const tierTone = relationshipTier === "strategic" ? "success" :
    relationshipTier === "watchlist" ? "error" : "neutral";
  const bandTone = behaviourBand === "prompt" ? "success" :
    behaviourBand === "slipping" ? "warning" :
    behaviourBand === "chronic" ? "error" : "neutral";

  return (
    <div className="container py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-label text-secondary animate-slide-down">
        <Link href="/clients" className="hover:text-primary transition-colors duration-200">Clients</Link>
        <span className="mx-2">/</span>
        <span className="text-primary">{String(client["name"])}</span>
      </nav>

      {/* Hero Header — vsartech.com style */}
      <div className="relative mb-8 overflow-hidden rounded-sm glass-strong p-6 sm:p-8 animate-slide-down">
        <div className="absolute inset-0 -z-10 bg-radial-glow" aria-hidden="true" />
        <div className="relative z-10 grid gap-6 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <RadioTower size={24} className={isNegative ? "text-error" : "text-success"} aria-hidden="true" />
              <h1 className="text-h1 text-primary tracking-tight">{String(client["name"])}</h1>
            </div>
            <p className="text-mono text-secondary">{String(client["client_code"])}</p>
          </div>

          <div className="flex items-end justify-end gap-4 flex-wrap">
            <StatCard
              label="Total balance"
              value={formatPaise(paise)}
              icon={isNegative ? AlertTriangle : TrendingUp}
              tone={isNegative ? "error" : "success"}
            />
          </div>
        </div>
      </div>

      {/* Primary Contact Details & Edit Modal Button */}
      <EditContactModal clientId={clientId} initialContact={contactRow} />

      {/* Meta strip — animated stats */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-4 stagger-children">
        <StatCard
          label="Relationship tier"
          value={relationshipTier}
          icon={Building2}
          tone={tierTone}
        />
        <StatCard
          label="Behaviour band"
          value={behaviourBand}
          icon={Activity}
          tone={bandTone}
        />
        <StatCard
          label="Total entries"
          value={totalEntries.toLocaleString()}
          icon={FileText}
          tone="neutral"
        />
        <StatCard
          label="Last import"
          value={formattedLastImport}
          icon={Clock}
          tone="neutral"
        />
      </div>

      <ClientFlagBanner clientId={clientId} />

      {/* Promise to Pay Banner — shows active commitment if any */}
      <PromiseToPayBanner clientId={clientId} />

      {/* Tab strip — glass */}
      <div className="mb-6 animate-fade-in">
        <div className="flex gap-1 glass-strong p-1 rounded-sm">
          <TabLink href={`/clients/${clientId}?tab=entries`} active={activeTab === "entries"}>Entries</TabLink>
          <TabLink href={`/clients/${clientId}?tab=open-items`} active={activeTab === "open-items"}>Open Items</TabLink>
          <TabLink href={`/clients/${clientId}?tab=trail`} active={activeTab === "trail"}>Trail</TabLink>
          <TabLink href={`/clients/${clientId}?tab=notifications`} active={activeTab === "notifications"}>Notifications</TabLink>
        </div>
      </div>

      {activeTab === "entries" && <EntriesTab clientId={clientId} page={page} totalEntries={totalEntries} />}
      {activeTab === "open-items" && <OpenItemsTab clientId={clientId} />}
      {activeTab === "trail" && <TrailTab clientId={clientId} />}
      {activeTab === "notifications" && <NotificationsTab clientId={clientId} />}
    </div>
  );
}


async function EntriesTab({ clientId, page, totalEntries }: { clientId: string; page: number; totalEntries: number }) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const offset = (page - 1) * PAGE_SIZE;
  const { data: entries, error } = await adminAny
    .from("ledger_entry")
    .select("id, doc_date, doc_code, entry_type, narration, pax_name, reference, bill_amount_paise")
    .eq("client_id", clientId)
    .order("doc_date", { ascending: false })
    .order("row_number", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1) as {
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    };

  if (error) {
    return (
      <SectionCard title="Ledger Entries" icon={FileText}>
        <div className="glass-strong rounded-sm p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body text-error">Failed to load entries.</p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const rows = entries ?? [];
  const totalPages = Math.ceil(totalEntries / PAGE_SIZE);

  if (rows.length === 0 && page === 1) {
    return (
      <SectionCard title="Ledger Entries" icon={FileText}>
        <div className="glass-strong rounded-sm p-12 text-center">
          <FileText size={32} className="mx-auto mb-3 text-muted" aria-hidden="true" />
          <p className="text-body text-muted">No ledger entries yet.</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Ledger Entries" icon={FileText}>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr className="border-b border-white/10">
              <Th>Date</Th>
              <Th>Code</Th>
              <Th>Type</Th>
              <Th>Passenger</Th>
              <Th>Narration</Th>
              <Th>Reference</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 stagger-children">
            {rows.map((e, idx) => {
              const paise = e["bill_amount_paise"] != null ? BigInt(String(e["bill_amount_paise"])) : null;
              const isNegative = paise !== null && paise < 0n;
              const isOpening = e["entry_type"] === "opening";
              return (
                <tr
                  key={String(e["id"])}
                  className={cn(isOpening && "bg-white/5", "hover:bg-white/5 transition-all duration-200")}
                  style={{ animationDelay: `${Math.min(idx * 30, 200)}ms` } as React.CSSProperties}
                >
                  <Td className="whitespace-nowrap text-body-sm text-secondary">{e["doc_date"] ? String(e["doc_date"]) : "—"}</Td>
                  <Td className="text-mono text-secondary">{String(e["doc_code"] ?? "—")}</Td>
                  <Td>
                    <span className={cn("text-body-sm", isOpening ? "text-muted" : "text-secondary")}>
                      {String(e["entry_type"] ?? "")}
                    </span>
                  </Td>
                  <Td className="text-body-sm text-secondary max-w-32 truncate">{String(e["pax_name"] ?? "—")}</Td>
                  <Td className="text-body-sm text-secondary max-w-48 truncate">{String(e["narration"] ?? "—")}</Td>
                  <Td className="text-mono text-secondary max-w-28 truncate">{String(e["reference"] ?? "—")}</Td>
                  <Td className={cn("text-right text-mono tabular-nums", paise === null ? "text-muted" : isNegative ? "text-error font-medium" : "text-primary")}>
                    {paise !== null ? formatPaise(paise) : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-body-sm text-secondary">
          <span>{offset + 1}–{Math.min(offset + rows.length, totalEntries)} of {totalEntries}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <PageLink
                variant="secondary"
                size="sm"
                href={`/clients/${clientId}?tab=entries&page=${page - 1}`}
              >
                Previous
              </PageLink>
            )}
            {page < totalPages && (
              <PageLink
                variant="primary"
                size="sm"
                href={`/clients/${clientId}?tab=entries&page=${page + 1}`}
              >
                Next
              </PageLink>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

async function OpenItemsTab({ clientId }: { clientId: string }) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: openItems, error } = await adminAny
    .from("open_item")
    .select("*")
    .eq("client_id", clientId)
    .order("issue_date", { ascending: false }) as {
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    };

  if (error) {
    return (
      <SectionCard title="Open Items" icon={Package}>
        <div className="glass-strong rounded-sm p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body text-error">Failed to load open items.</p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const rows = (openItems ?? []).map<OpenItem>((r) => ({
    id: String(r["id"]),
    source_doc_code: String(r["source_doc_code"]),
    issue_date: String(r["issue_date"]),
    due_date: r["due_date"] != null ? String(r["due_date"]) : null,
    gross_amount_paise: String(r["gross_amount_paise"] ?? "0"),
    credits_applied_paise: String(r["credits_applied_paise"] ?? "0"),
    receipts_applied_paise: String(r["receipts_applied_paise"] ?? "0"),
    open_amount_paise: String(r["open_amount_paise"] ?? "0"),
    status: String(r["status"]),
    aging_bucket: String(r["aging_bucket"]),
    is_unaged: Boolean(r["is_unaged"]),
  }));

  const sum = (bucket: string | null) => {
    const filtered = rows.filter((r) => bucket === "unaged" ? r.is_unaged : r.aging_bucket === bucket && !r.is_unaged);
    return filtered.reduce((acc, r) => acc + BigInt(r.open_amount_paise), 0n).toString();
  };

  const total = rows.reduce((acc, r) => acc + BigInt(r.open_amount_paise), 0n).toString();
  const totalVal = BigInt(total);

  return (
    <div className="space-y-6">
      {/* Aging Strip with animated progress bars */}
      <SectionCard title="Aging Analysis" icon={Activity}>
        <AgingStrip
          total_paise={total}
          unaged_paise={sum("unaged")}
          current_paise={sum("current")}
          d1_30_paise={sum("d1_30")}
          d31_60_paise={sum("d31_60")}
          d61_90_paise={sum("d61_90")}
          d90_plus_paise={sum("d90_plus")}
        />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-7 stagger-children">
          <ProgressBar value={Number(BigInt(sum("unaged")))} max={Number(totalVal)} label="B/F (unaged)" tone="neutral" />
          <ProgressBar value={Number(BigInt(sum("current")))} max={Number(totalVal)} label="Current" tone="success" />
          <ProgressBar value={Number(BigInt(sum("d1_30")))} max={Number(totalVal)} label="1–30 days" tone="neutral" />
          <ProgressBar value={Number(BigInt(sum("d31_60")))} max={Number(totalVal)} label="31–60 days" tone="warning" />
          <ProgressBar value={Number(BigInt(sum("d61_90")))} max={Number(totalVal)} label="61–90 days" tone="warning" />
          <ProgressBar value={Number(BigInt(sum("d90_plus")))} max={Number(totalVal)} label="90+ days" tone="error" />
        </div>
      </SectionCard>

      <OpenItemsTable items={rows} />
    </div>
  );
}

async function TrailTab({ clientId }: { clientId: string }) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: events, error } = await adminAny
    .from("event")
    .select("id, type, actor_type, actor_id, payload, occurred_at")
    .eq("client_id", clientId)
    .order("occurred_at", { ascending: false })
    .limit(100) as { data: Array<Record<string, unknown>> | null; error: unknown };

  if (error) {
    return (
      <SectionCard title="Audit Trail" icon={BellRing}>
        <div className="glass-strong rounded-sm p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body text-error">Failed to load trail.</p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const trailEvents = (events ?? []).map((e) => ({
    id: String(e["id"]),
    type: String(e["type"]),
    actor_type: String(e["actor_type"]),
    actor_id: e["actor_id"] as string | null,
    payload: (e["payload"] ?? {}) as Record<string, unknown>,
    occurred_at: String(e["occurred_at"]),
  }));

  return (
    <SectionCard title="Audit Trail" icon={BellRing}>
      <TrailList events={trailEvents} />
    </SectionCard>
  );
}

async function NotificationsTab({ clientId }: { clientId: string }) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: outreachRows, error } = await adminAny
    .from("outreach")
    .select("id, channel, cadence_step_number, template_key, persona_tone, rendered_body, status, is_dry_run, scheduled_for, sent_at, suppression_reason, idempotency_key")
    .eq("client_id", clientId)
    .order("scheduled_for", { ascending: false })
    .limit(50) as { data: Array<Record<string, unknown>> | null; error: unknown };

  if (error) {
    return (
      <SectionCard title="Notifications" icon={BellRing}>
        <div className="glass-strong rounded-sm p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body text-error">Failed to load notifications.</p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const rows = (outreachRows ?? []).map<OutreachRow>((r) => ({
    id: String(r["id"]),
    channel: String(r["channel"]),
    cadence_step_number: Number(r["cadence_step_number"]),
    template_key: String(r["template_key"]),
    persona_tone: String(r["persona_tone"]),
    rendered_body: r["rendered_body"] != null ? String(r["rendered_body"]) : "",
    status: String(r["status"]),
    is_dry_run: Boolean(r["is_dry_run"]),
    scheduled_for: String(r["scheduled_for"]),
    sent_at: r["sent_at"] != null ? String(r["sent_at"]) : null,
    suppression_reason: r["suppression_reason"] != null ? String(r["suppression_reason"]) : null,
    idempotency_key: String(r["idempotency_key"]),
  }));

  return (
    <SectionCard title="Notifications" icon={BellRing}>
      <NotificationsTable items={rows} />
    </SectionCard>
  );
}

async function PromiseToPayBanner({ clientId }: { clientId: string }) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  // Find active commitments for this client via recovery_case
  const { data: cases } = await adminAny
    .from("recovery_case")
    .select("id")
    .eq("client_id", clientId)
    .not("status", "in", '("resolved","suppressed")')
    .order("created_at", { ascending: false })
    .limit(5) as { data: Array<{ id: string }> | null };

  if (!cases || cases.length === 0) return null;

  const caseIds = cases.map((c) => c.id);
  const { data: commitments } = await adminAny
    .from("commitment")
    .select("id, due_at, amount_paise, status, notes, created_at")
    .in("case_id", caseIds)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(3) as { data: Array<Record<string, unknown>> | null };

  if (!commitments || commitments.length === 0) return null;

  return (
    <div className="mb-6 space-y-3 stagger-children">
      {commitments.map((c) => {
        const dueAt = c["due_at"]
          ? new Date(String(c["due_at"])).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : null;
        const amountPaise = c["amount_paise"] ? BigInt(String(c["amount_paise"])) : null;
        const amountStr = amountPaise
          ? `₹${(Number(amountPaise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
          : null;
        const notes = c["notes"] ? String(c["notes"]) : null;
        const createdAt = c["created_at"]
          ? new Date(String(c["created_at"])).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;

        return (
          <div
            key={String(c["id"])}
            className="glass-strong rounded-sm p-5 border-l-4 border-emerald-500 animate-slide-up bg-emerald-500/5"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-sm bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <HandCoins size={20} className="text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-body font-semibold text-success">✅ Promise to Pay</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-success border border-emerald-500/30 font-mono">
                    Active
                  </span>
                </div>
                <div className="flex items-center gap-4 flex-wrap text-body-sm">
                  {amountStr && (
                    <span className="text-primary font-mono font-semibold">{amountStr}</span>
                  )}
                  {dueAt && (
                    <span className="text-secondary">
                      Due by: <span className="text-primary font-medium">{dueAt}</span>
                    </span>
                  )}
                  {createdAt && (
                    <span className="text-muted">Detected: {createdAt}</span>
                  )}
                </div>
                {notes && (
                  <p className="mt-2 text-body-sm text-secondary italic truncate max-w-xl">
                    {notes}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}