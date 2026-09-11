import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { ClientTable } from "@/components/clients/client-table";
import { PageLink } from "@/components/ui/page-link";

interface SearchParams {
  q?: string;
  tier?: string;
  page?: string;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("viewer");

  const { q, tier, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  // 1. Query client records
  let clientQuery = adminAny
    .from("client")
    .select("id, client_code, name, relationship_tier, last_import_at")
    .order("name", { ascending: true })
    .range((page - 1) * 50, page * 50 - 1);

  if (q) {
    clientQuery = clientQuery.or(`name.ilike.%${q}%,client_code.ilike.%${q}%`);
  }
  if (tier) {
    clientQuery = clientQuery.eq("relationship_tier", tier);
  }

  const { data: rawClients, error } = await clientQuery;

  if (error) {
    return (
      <div className="container py-8">
        <div className="glass-strong rounded-sm p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-error" aria-hidden="true">⚠</span>
            <p className="text-body text-error">Failed to load clients.</p>
          </div>
        </div>
      </div>
    );
  }

  const clientList = rawClients ?? [];
  const clientIds = clientList.map((c: any) => c.id);

  // 2. Query exact net sum of ledger entries for these clients
  const balanceMap = new Map<string, bigint>();
  if (clientIds.length > 0) {
    const { data: entrySums } = await adminAny
      .from("ledger_entry")
      .select("client_id, bill_amount_paise")
      .in("client_id", clientIds);

    for (const row of entrySums ?? []) {
      if (row.bill_amount_paise != null) {
        const cId = String(row.client_id);
        const curr = balanceMap.get(cId) ?? 0n;
        balanceMap.set(cId, curr + BigInt(row.bill_amount_paise));
      }
    }
  }

  const rows = clientList.map((c: any) => ({
    id: String(c["id"]),
    client_code: String(c["client_code"] ?? ""),
    name: String(c["name"] ?? ""),
    relationship_tier: c["relationship_tier"] as string | null,
    balance_paise: (balanceMap.get(String(c["id"])) ?? 0n).toString(),
    last_import_at: c["last_import_at"] as string | null,
  }));

  return (
    <div className="container py-8">
      {/* Hero */}
      <div className="mb-8 animate-slide-down">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow" aria-hidden="true" />
          <h1 className="text-h1 text-primary">Clients</h1>
        </div>
        <p className="text-body-sm text-secondary">
          {rows.length} client{rows.length !== 1 ? "s" : ""} • Page {page}
        </p>
      </div>

      <ClientTable
        clients={rows}
        isLoading={false}
        page={page}
        totalPages={rows.length === 50 ? page + 1 : page}
        searchParams={{ q, tier }}
      />

      {rows.length === 50 && (
        <div className="mt-6 flex justify-end gap-2 animate-slide-up">
          {page > 1 && (
            <PageLink
              variant="secondary"
              size="sm"
              href={`/clients?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${tier ? `&tier=${tier}` : ""}`}
            >
              Previous
            </PageLink>
          )}
          <PageLink
            variant="primary"
            size="sm"
            href={`/clients?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${tier ? `&tier=${tier}` : ""}`}
          >
            Next
          </PageLink>
        </div>
      )}
    </div>
  );
}
