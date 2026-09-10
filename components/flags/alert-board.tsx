"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { FlagRow, type FlagRowFlag } from "@/components/flags/flag-row";
import { AcknowledgeDialog } from "@/components/flags/acknowledge-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface FlagRowData {
  id: string;
  client_id: string;
  rule: string;
  severity: string;
  message: string;
  dedupe_key: string;
  raised_at: string;
  acknowledged_by: string | null;
  ack_reason: string | null;
  ack_until: string | null;
  resolved_at: string | null;
  client: { name: string; client_code: string } | null;
}

interface AlertBoardProps {
  liveFlags: FlagRowData[];
  acknowledgedFlags: FlagRowData[];
}

function toFlagRowFlag(f: FlagRowData): FlagRowFlag {
  return {
    id: f.id,
    rule: f.rule,
    severity: f.severity,
    message: f.message,
    raised_at: f.raised_at,
    acknowledged_at: f.ack_until ? f.raised_at : null,
    ack_reason: f.ack_reason,
    ack_until: f.ack_until,
    client_id: f.client_id,
    client_name: f.client?.name,
  };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-label uppercase tracking-widest text-secondary">{children}</h2>;
}

interface SeveritySectionProps {
  label: string;
  flags: FlagRowData[];
  onSnooze: (id: string) => void;
}

function SeveritySection({ label, flags, onSnooze }: SeveritySectionProps) {
  if (flags.length === 0) return null;
  const severityConfig: Record<string, { variant: "error" | "warning" | "default" }> = {
    Red: { variant: "error" },
    Amber: { variant: "warning" },
    Grey: { variant: "default" },
  };
  const config = severityConfig[label] ?? { variant: "default" };
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <SectionHeading>
          <Badge variant={config.variant} className="mr-2">{label}</Badge>
          {flags.length}
        </SectionHeading>
      </div>
      <div className="space-y-2">
        {flags.map((f) => (
          <FlagRow key={f.id} flag={toFlagRowFlag(f)} onSnooze={onSnooze} />
        ))}
      </div>
    </section>
  );
}

export function AlertBoard({ liveFlags, acknowledgedFlags }: AlertBoardProps) {
  const [snoozingFlagId, setSnoozingFlagId] = useState<string | null>(null);
  const [ackOpen, setAckOpen] = useState(false);
  const [ackCollapsed, setAckCollapsed] = useState(true);

  const redFlags = liveFlags.filter((f) => f.severity === "red");
  const amberFlags = liveFlags.filter((f) => f.severity === "amber");
  const greyFlags = liveFlags.filter((f) => f.severity === "grey");
  const allLiveFlags = [...redFlags, ...amberFlags, ...greyFlags];

  function handleSnooze(id: string) {
    setSnoozingFlagId(id);
    setAckOpen(true);
  }

  function handleSnoozeAll() {
    const firstFlag = allLiveFlags[0];
    if (!firstFlag) return;
    handleSnooze(firstFlag.id);
  }

  function handleClose() {
    setAckOpen(false);
    setSnoozingFlagId(null);
  }

  if (liveFlags.length === 0 && acknowledgedFlags.length === 0) {
    return (
      <div className="rounded-sm border border-neutral-200 p-12 text-center dark:border-white/15">
        <CheckCircle2 size={28} className="mx-auto mb-3 text-success" aria-hidden="true" />
        <p className="text-h3 text-success">No active alerts</p>
        <p className="mt-2 text-body text-muted">All flags are resolved.</p>
      </div>
    );
  }

  return (
    <div>
      {liveFlags.length > 0 && (
        <div className="mb-6 flex items-center justify-between">
          <p className="text-body text-secondary">
            {liveFlags.length} active flag{liveFlags.length === 1 ? "" : "s"}
          </p>
          <Button variant="secondary" size="sm" onClick={handleSnoozeAll}>
            Snooze all
          </Button>
        </div>
      )}
      <SeveritySection label="Red" flags={redFlags} onSnooze={handleSnooze} />
      <SeveritySection label="Amber" flags={amberFlags} onSnooze={handleSnooze} />
      <SeveritySection label="Grey" flags={greyFlags} onSnooze={handleSnooze} />

      {acknowledgedFlags.length > 0 && (
        <section className="mb-8">
          <button
            type="button"
            onClick={() => setAckCollapsed((c) => !c)}
            aria-expanded={!ackCollapsed}
            className="flex items-center gap-2 text-label uppercase tracking-widest text-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 dark:focus-visible:ring-white"
          >
            {ackCollapsed ? (
              <ChevronRight size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
            <span>Acknowledged ({acknowledgedFlags.length})</span>
          </button>
          {!ackCollapsed && (
            <div className="mt-4 space-y-2">
              {acknowledgedFlags.map((f) => (
                <FlagRow key={f.id} flag={toFlagRowFlag(f)} />
              ))}
            </div>
          )}
        </section>
      )}

      {ackOpen && snoozingFlagId && (
        <AcknowledgeDialog
          flagId={snoozingFlagId}
          onClose={handleClose}
          open={ackOpen}
        />
      )}
    </div>
  );
}