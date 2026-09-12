import "server-only";

import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Th, Td } from "@/components/ui/table";

interface CategoryRow {
  id: string;
  code: string;
  display_name: string;
  relationship_tier: string;
  behaviour_band: string;
  is_active: boolean;
  is_default: boolean;
  client_count: number;
}

function tierBadge(tier: string) {
  const map: Record<string, "success" | "error" | "default" | "info"> = {
    strategic: "success",
    watchlist: "error",
    standard: "default",
    new: "info",
  };
  const variant = map[tier] ?? "default";
  return <Badge variant={variant} className="text-label">{tier}</Badge>;
}

function bandBadge(band: string) {
  const map: Record<string, "default" | "success" | "warning" | "error"> = {
    prompt: "success",
    slipping: "warning",
    chronic: "error",
    unknown: "default",
  };
  const variant = map[band] ?? "default";
  return <Badge variant={variant} className="text-label">{band}</Badge>;
}

export default async function CategoriesPage() {
  await requireRole("viewer");

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: categories, error } = await adminAny
    .from("category")
    .select("id, code, display_name, relationship_tier, behaviour_band, is_active, is_default")
    .order("code", { ascending: true }) as {
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    };

  if (error) {
    return (
      <div className="container py-8">
        <h1 className="text-h1 text-primary mb-6">Categories</h1>
        <div className="rounded-sm border border-error/30 bg-red-50 p-4 dark:bg-red-900/20 dark:border-error/30">
          <p className="text-body text-error">Failed to load categories.</p>
        </div>
      </div>
    );
  }

  // Auto-assign default category to any clients that don't have one
  const defaultCat = (categories ?? []).find((c) => Boolean(c["is_default"]));
  if (defaultCat) {
    await adminAny
      .from("client")
      .update({ category_id: String(defaultCat["id"]) })
      .is("category_id", null);
  }

  // Fetch client counts (after auto-fix so counts are accurate)
  const { data: clientCounts } = await adminAny
    .from("client")
    .select("category_id") as {
      data: Array<{ category_id: string | null }> | null;
      error: unknown;
    };

  const countMap: Record<string, number> = {};
  for (const row of clientCounts ?? []) {
    if (row.category_id) {
      countMap[row.category_id] = (countMap[row.category_id] ?? 0) + 1;
    }
  }

  const rows: CategoryRow[] = (categories ?? []).map((c) => ({
    id: String(c["id"]),
    code: String(c["code"]),
    display_name: String(c["display_name"]),
    relationship_tier: String(c["relationship_tier"]),
    behaviour_band: String(c["behaviour_band"]),
    is_active: Boolean(c["is_active"]),
    is_default: Boolean(c["is_default"]),
    client_count: countMap[String(c["id"])] ?? 0,
  }));

  return (
    <div className="container py-8">
      <div className="mb-8">
        <nav className="mb-2 text-label text-secondary">Settings / Categories</nav>
        <h1 className="text-h1 text-primary">Categories</h1>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-sm border-2 border-dashed border-default p-12 text-center">
          <p className="text-body text-muted">No categories configured yet.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Display Name</Th>
                <Th>Tier</Th>
                <Th>Band</Th>
                <Th className="text-right">Clients</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cat) => (
                <tr key={cat.id}>
                  <Td>
                    <Link href={`/settings/categories/${cat.id}`} className="text-mono font-semibold text-secondary hover:text-primary">
                      {cat.code}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/settings/categories/${cat.id}`} className="font-medium text-primary hover:text-primary">
                      {cat.display_name}
                    </Link>
                    {cat.is_default && <span className="ml-2 text-mono-sm text-muted">(default)</span>}
                  </Td>
                  <Td>{tierBadge(cat.relationship_tier)}</Td>
                  <Td>{bandBadge(cat.behaviour_band)}</Td>
                  <Td className="text-right text-mono text-secondary">{cat.client_count}</Td>
                  <Td>
                    <Badge variant={cat.is_active ? "success" : "default"} className="text-label">
                      {cat.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}