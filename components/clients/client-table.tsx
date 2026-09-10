/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Th, Td } from "@/components/ui/table";
import { PageLink } from "@/components/ui/page-link";
import { cn } from "@/lib/cn";

interface ClientRow {
  id: string;
  client_code: string;
  name: string;
  relationship_tier: string | null;
  balance_paise: string;
  last_import_at: string | null;
}

const tierVariant: Record<string, "default" | "success" | "error" | "info" | "outline"> = {
  strategic: "success",
  standard: "default",
  watchlist: "error",
  new: "info",
};

interface ClientTableProps {
  clients: ClientRow[];
  isLoading?: boolean;
  onPageChange?: (page: number) => void;
  page?: number;
  totalPages?: number;
  searchParams?: { q?: string; tier?: string };
}

export function ClientTable({
  clients,
  isLoading = false,
  onPageChange,
  page,
  totalPages,
  searchParams = {},
}: ClientTableProps) {
  const mountedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const timeoutId = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
    };
  }, []);
  const rowsToRender = isLoading ? Array.from({ length: 5 }, (_, i) => i) : clients;

  if (!isLoading && clients.length === 0) {
    return (
      <div className="glass-strong rounded-sm p-12 text-center animate-fade-in">
        <p className="text-body text-muted">No clients yet. Upload a ledger report to get started.</p>
      </div>
    );
  }

  return (
    <div className="table-container animate-fade-in">
      <table className="table">
        <thead>
          <tr className="border-b border-white/10">
            <Th>Client</Th>
            <Th>Code</Th>
            <Th>Tier</Th>
            <Th className="text-right">Balance</Th>
            <Th>Last import</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 stagger-children">
          {rowsToRender.map((item, index) => {
            if (isLoading) {
              return (
                <tr key={`skeleton-${index}`} className="animate-pulse">
                  <Td><div className="skeleton h-4 w-3/4" /></Td>
                  <Td><div className="skeleton h-4 w-16" /></Td>
                  <Td><div className="skeleton h-4 w-16" /></Td>
                  <Td className="text-right"><div className="skeleton h-4 w-24 text-right" /></Td>
                  <Td><div className="skeleton h-4 w-20" /></Td>
                </tr>
              );
            }

            const c = item as ClientRow;
            const paise = BigInt(c.balance_paise ?? "0");
            const tier = c.relationship_tier ?? "new";
            return (
              <tr
                key={c.id}
                className="hover:bg-white/5 transition-all duration-200"
                style={{ animationDelay: `${Math.min(index * 40, 200)}ms` } as React.CSSProperties}
              >
                <Td>
                  <Link
                    href={`/clients/${c.id}`}
                    className="font-medium text-primary hover:text-primary transition-colors duration-200"
                  >
                    {c.name}
                  </Link>
                </Td>
                <Td className="text-secondary text-mono-sm">{c.client_code}</Td>
                <Td>
                  <Badge variant={tierVariant[tier] ?? "default"} className="text-label">{tier}</Badge>
                </Td>
                <Td className={cn("text-right text-mono tabular-nums", paise < 0n ? "text-error" : "text-primary")}>
                  {formatPaise(paise)}
                </Td>
                <Td className="text-secondary text-body-sm">
                  {c.last_import_at ? new Date(c.last_import_at).toLocaleDateString("en-IN") : "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}