import "server-only";

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Th, Td } from "@/components/ui/table";
import { TabLink } from "@/components/ui/tab-link";
import { formatPaise } from "@/lib/money";

interface SearchParams {
  tab?: string;
}

interface PageProps {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function CategoryDetailPage({ params, searchParams }: PageProps) {
  await requireRole("viewer");

  const { categoryId } = await params;
  const { tab = "cadence" } = await searchParams;

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: category, error: catError } = await adminAny
    .from("category")
    .select("*")
    .eq("id", categoryId)
    .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

  if (catError) throw catError;
  if (!category) notFound();

  const displayName = String(category["display_name"]);

  return (
    <div className="container py-8 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-6 text-label text-secondary">
        <Link href="/settings/categories" className="hover:text-primary transition-colors duration-200">Settings</Link>
        <span className="mx-2">/</span>
        <Link href="/settings/categories" className="hover:text-primary transition-colors duration-200">Categories</Link>
        <span className="mx-2">/</span>
        <span className="text-primary">{displayName}</span>
      </nav>

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-h1 text-primary">{displayName}</h1>
        <p className="mt-1 text-mono text-secondary">{String(category["code"])}</p>
      </div>

      {/* Tab strip */}
      <div className="mb-6 border-b border-default">
        <div className="flex gap-1">
          <TabLink href={`/settings/categories/${categoryId}?tab=cadence`} active={tab === "cadence"}>Cadence</TabLink>
          <TabLink href={`/settings/categories/${categoryId}?tab=thresholds`} active={tab === "thresholds"}>Thresholds</TabLink>
          <TabLink href={`/settings/categories/${categoryId}?tab=persona`} active={tab === "persona"}>Persona</TabLink>
        </div>
      </div>

      {tab === "cadence" && <CadenceTab categoryId={categoryId} category={category} />}
      {tab === "thresholds" && <ThresholdsTab categoryId={categoryId} />}
      {tab === "persona" && <PersonaTab categoryId={categoryId} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label text-secondary">{label}</dt>
      <dd className="text-body text-primary">{children}</dd>
    </div>
  );
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

async function CadenceTab({ categoryId, category }: { categoryId: string; category: Record<string, unknown> }) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: policy, error: policyError } = await adminAny
    .from("cadence_policy")
    .select("*")
    .eq("category_id", categoryId)
    .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

  if (policyError) {
    return (
      <div className="rounded-sm border border-error/30 bg-red-50 p-4 dark:bg-red-900/20 dark:border-error/30">
        <p className="text-body text-error">Failed to load cadence policy.</p>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="rounded-sm border-2 border-dashed border-default p-8 text-center">
        <p className="text-body text-muted">No cadence policy configured for this category.</p>
      </div>
    );
  }

  const { data: steps, error: stepsError } = await adminAny
    .from("cadence_step")
    .select("id, step_number, channel, offset_days_from_due, template_key, escalation_level")
    .eq("cadence_policy_id", String(policy["id"]))
    .order("step_number", { ascending: true }) as {
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    };

  if (stepsError) {
    return (
      <div className="rounded-sm border border-error/30 bg-red-50 p-4 dark:bg-red-900/20 dark:border-error/30">
        <p className="text-body text-error">Failed to load cadence steps.</p>
      </div>
    );
  }

  const stepRows = steps ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-h3 text-primary">Policy settings</h2>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Max messages / week">{String(policy["max_messages_per_week"] ?? "—")}</Field>
            <Field label="Active">
              <Badge variant={policy["is_active"] ? "success" : "default"} className="text-label">
                {policy["is_active"] ? "Yes" : "No"}
              </Badge>
            </Field>
            <Field label="Tier">{tierBadge(String(category["relationship_tier"]))}</Field>
            <Field label="Band">{bandBadge(String(category["behaviour_band"]))}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-h3 text-primary">Steps ({stepRows.length})</h2>
        </CardHeader>
        <CardContent className="p-0">
          {stepRows.length === 0 ? (
            <p className="p-6 text-body text-muted">No steps defined.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <Th>Step</Th>
                    <Th>Channel</Th>
                    <Th>Offset (days from due)</Th>
                    <Th>Template key</Th>
                    <Th>Escalation level</Th>
                  </tr>
                </thead>
                <tbody>
                  {stepRows.map((s) => (
                    <tr key={String(s["id"])}>
                      <Td className="text-mono font-semibold">{String(s["step_number"])}</Td>
                      <Td>
                        <Badge variant="outline" className="text-label">{String(s["channel"])}</Badge>
                      </Td>
                      <Td className="text-mono">{String(s["offset_days_from_due"])}</Td>
                      <Td className="text-mono text-secondary">{String(s["template_key"])}</Td>
                      <Td className="text-mono">{String(s["escalation_level"])}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function ThresholdsTab({ categoryId }: { categoryId: string }) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: ts, error } = await adminAny
    .from("threshold_set")
    .select("*")
    .eq("category_id", categoryId)
    .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

  if (error) {
    return (
      <div className="rounded-sm border border-error/30 bg-red-50 p-4 dark:bg-red-900/20 dark:border-error/30">
        <p className="text-body text-error">Failed to load threshold settings.</p>
      </div>
    );
  }

  if (!ts) {
    return (
      <div className="rounded-sm border-2 border-dashed border-default p-8 text-center">
        <p className="text-body text-muted">No threshold set configured for this category.</p>
      </div>
    );
  }

  const amberAmount = ts["amber_amount_paise"] != null ? formatPaise(BigInt(String(ts["amber_amount_paise"]))) : "—";
  const redAmount = ts["red_amount_paise"] != null ? formatPaise(BigInt(String(ts["red_amount_paise"]))) : "—";

  return (
    <Card>
      <CardHeader>
        <h2 className="text-h3 text-primary">Thresholds</h2>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Field label="Amber days">{String(ts["amber_days"] ?? "—")}</Field>
          <Field label="Red days">{String(ts["red_days"] ?? "—")}</Field>
          <Field label="Amber amount threshold">{amberAmount}</Field>
          <Field label="Red amount threshold">{redAmount}</Field>
          <Field label="Quiet hours start">{String(ts["quiet_hours_start"] ?? "—")}</Field>
          <Field label="Quiet hours end">{String(ts["quiet_hours_end"] ?? "—")}</Field>
          <Field label="Promise grace (hours)">{String(ts["promise_grace_hours"] ?? "—")}</Field>
          <Field label="Silence attempts">{String(ts["silence_attempts"] ?? "—")}</Field>
        </dl>
      </CardContent>
    </Card>
  );
}

async function PersonaTab({ categoryId }: { categoryId: string }) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data: persona, error } = await adminAny
    .from("persona")
    .select("*")
    .eq("category_id", categoryId)
    .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

  if (error) {
    return (
      <div className="rounded-sm border border-error/30 bg-red-50 p-4 dark:bg-red-900/20 dark:border-error/30">
        <p className="text-body text-error">Failed to load persona settings.</p>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="rounded-sm border-2 border-dashed border-default p-8 text-center">
        <p className="text-body text-muted">No persona configured for this category.</p>
      </div>
    );
  }

  const requiresApproval = Boolean(persona["requires_human_approval"]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-h3 text-primary">Persona</h2>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Field label="Tone">
            <Badge variant="default" className="text-label">{String(persona["tone"] ?? "—")}</Badge>
          </Field>
          <Field label="Language">{String(persona["language"] ?? "—")}</Field>
          <Field label="Requires human approval">
            <Badge variant={requiresApproval ? "error" : "default"} className="text-label">
              {requiresApproval ? "Yes" : "No"}
            </Badge>
          </Field>
          <div className="col-span-2 sm:col-span-3 flex flex-col gap-1">
            <dt className="text-label text-secondary">Salutation</dt>
            <dd className="rounded-sm border border-default bg-neutral-100 p-3 text-mono text-body text-primary dark:border-white/15 dark:bg-neutral-800 dark:text-primary">
              {String(persona["salutation"] ?? "—")}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-3 flex flex-col gap-1">
            <dt className="text-label text-secondary">Signature</dt>
            <dd className="rounded-sm border border-default bg-neutral-100 p-3 text-mono text-body text-primary dark:border-white/15 dark:bg-neutral-800 dark:text-primary whitespace-pre-wrap">
              {String(persona["signature"] ?? "—")}
            </dd>
          </div>
          {Boolean(persona["voice_script_style"]) && (
            <div className="col-span-2 sm:col-span-3 flex flex-col gap-1">
              <dt className="text-label text-secondary">Voice script style</dt>
              <dd className="text-body text-primary">{String(persona["voice_script_style"])}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}