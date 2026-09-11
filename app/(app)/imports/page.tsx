"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { AlertCircle, FileText, Upload, CheckCircle2, XCircle, Clock, Hash, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function getBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cipfkcsknxjemdmdkpyp.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpcGZrY3NrbnhqZW1kbWRrcHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTcwNDEsImV4cCI6MjEwMzQ5MzA0MX0.xAx-eX1P_DutARKi_fDy0XMhyhvN_gjpk4kJsb9yyc0";
  return createBrowserClient(url, key);
}


interface ImportRow {
  id: string;
  client_id: string;
  status: string;
  created_at: string;
  error_message: string | null;
  source_filename: string | null;
  row_count_imported?: number;
  row_count_total?: number;
}

interface UploadProgress {
  stage: "idle" | "uploading" | "parsing" | "complete" | "error";
  progress: number;
  message: string;
}

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "success" | "warning" | "error" | "info"; label: string; icon: React.ElementType }> = {
    pending: { variant: "warning", label: "Pending", icon: Clock },
    parsing: { variant: "info", label: "Parsing", icon: Hash },
    imported: { variant: "success", label: "Imported", icon: CheckCircle2 },
    failed: { variant: "error", label: "Failed", icon: XCircle },
  };
  const config = map[status] ?? { variant: "warning" as const, label: status, icon: Clock };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1.5">
      <Icon size={10} aria-hidden="true" />
      {config.label}
    </Badge>
  );
}

export default function ImportsPage() {
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string; client_code: string }>>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: "idle",
    progress: 0,
    message: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImports = useCallback(async () => {
    const client = getBrowserClient();
    const { data, error: fetchError } = await client
      .from("ledger_import")
      .select("id, client_id, status, created_at, error_message, source_filename, row_count_imported, row_count_total")
      .order("created_at", { ascending: false });
    setLoaded(true);
    if (fetchError) setError(fetchError.message);
    else setImports((data as ImportRow[]) ?? []);

    const { data: clientData } = await client
      .from("client")
      .select("id, name, client_code")
      .order("name", { ascending: true });
    if (clientData) setClients(clientData);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) {
        await loadImports();
      }
    })();
    const interval = setInterval(() => {
      void loadImports();
    }, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [loadImports]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setSuccessInfo(null);
    setUploadProgress({ stage: "uploading", progress: 20, message: "Uploading document..." });

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (selectedClientId) {
        formData.append("client_id", selectedClientId);
      }

      setUploadProgress({ stage: "parsing", progress: 60, message: "Parsing statement data & extracting rows..." });

      const res = await fetch("/api/imports", {
        method: "POST",
        body: formData,
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || resJson.message || "Failed to process document file");
      }

      // If the file was uploaded but no entries were extracted, show a warning (not an error)
      if (resJson.warning) {
        setUploadProgress({ stage: "error", progress: 0, message: "" });
        setError(`⚠️ ${resJson.warning}`);
        await loadImports();
        return;
      }

      setUploadProgress({ stage: "complete", progress: 100, message: "Document imported successfully!" });
      setSuccessInfo(`Successfully extracted and imported ${resJson.rowsImported} statement rows for ${resJson.client?.name || "client"}.${resJson.emailSent ? " Payment reminder email sent." : ""}`);

      await loadImports();

      setTimeout(() => {
        setUploadProgress({ stage: "idle", progress: 0, message: "" });
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 2000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed — please try again.";
      setError(msg);
      setUploadProgress({ stage: "error", progress: 0, message: msg });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="container py-8 max-w-3xl">
      {/* Hidden File Input accepting .xlsx, .docx, .doc */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.docx,.doc"
        onChange={handleUpload}
        className="hidden"
        id="ledger-file-input"
        disabled={isUploading}
      />

      {/* Hero */}
      <div className="mb-10 animate-slide-down">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-sm glass-strong flex items-center justify-center">
            <FileText size={24} className="text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-h1 text-primary">Document & Ledger Imports</h1>
            <p className="text-body text-secondary">Upload Excel (.xlsx) or Word (.docx, .doc) statement files</p>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div role="alert" className="mb-6 glass-strong rounded-sm p-4 border-l-4 border-error animate-slide-up">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body text-error">{error}</p>
          </div>
        </div>
      )}

      {/* Success alert */}
      {successInfo && (
        <div role="status" className="mb-6 glass-strong rounded-sm p-4 border-l-4 border-success animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
              <p className="text-body text-success">{successInfo}</p>
            </div>
            <Link href="/clients" className="inline-flex items-center text-body-sm text-primary hover:underline gap-1">
              View Clients <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Target Client Selector */}
      <div className="mb-6 glass-strong rounded-sm p-4 animate-slide-up">
        <label htmlFor="target-client-select" className="block text-body-sm text-secondary mb-2">
          Select Target Client (Optional — auto-detected from statement header if unselected):
        </label>
        <select
          id="target-client-select"
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-sm px-3 py-2 text-body text-primary focus:outline-none focus:border-primary/50"
          disabled={isUploading}
        >
          <option value="" className="bg-neutral-900 text-white">Auto-detect from file header</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id} className="bg-neutral-900 text-white">
              {c.name} ({c.client_code})
            </option>
          ))}
        </select>
      </div>

      {/* Upload Zone */}
      <div className="mb-10 animate-slide-up">
        <div className={cn(
          "relative rounded-sm p-8 sm:p-12 text-center transition-all duration-300",
          "glass-strong border-2 border-dashed cursor-pointer",
          isUploading
            ? "border-primary/50 bg-primary/5 cursor-not-allowed"
            : "border-default hover:border-primary/50 hover:bg-white/5"
        )}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          {!isUploading ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/15 mb-4">
                <FileText size={28} className="text-primary" aria-hidden="true" />
              </div>
              <p className="text-h3 text-primary mb-2">Drag & drop document or ledger file</p>
              <p className="text-body text-muted">Supports Excel (.xlsx) and Word (.docx, .doc) formats</p>
              <p className="mt-4 text-label text-secondary">Max 10MB per file</p>
            </>
          ) : (
            <>
              <p className="text-h3 text-primary mb-2">{uploadProgress.message}</p>
              <div className="mt-4 w-full max-w-xs mx-auto progress-bar">
                <div
                  className="progress-bar-fill bg-primary animate-enter"
                  style={{ width: `${uploadProgress.progress}%` }}
                />
              </div>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="mt-6"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            disabled={isUploading}
          >
            <Upload size={14} className="mr-2" aria-hidden="true" />
            Browse files
          </Button>
        </div>
      </div>

      {/* Import History */}
      <section className="glass-strong rounded-sm p-6 animate-slide-up">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={16} className="text-primary" aria-hidden="true" />
          <h2 className="text-h3 text-primary">Import History</h2>
        </div>
        {!loaded ? (
          <div className="space-y-3 stagger-children" role="status" aria-live="polite">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="animate-pulse glass-strong rounded-sm p-4 flex items-center gap-4">
                <div className="skeleton h-10 w-10 rounded-sm" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/2" />
                </div>
                <div className="skeleton h-6 w-20" />
              </div>
            ))}
          </div>
        ) : imports.length > 0 ? (
          <ul className="space-y-3 stagger-children">
            {imports.map((imp, idx) => (
              <li
                key={imp.id}
                className="glass-strong rounded-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                style={{ animationDelay: `${Math.min(idx * 40, 200)}ms` } as React.CSSProperties}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-sm glass flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-primary" aria-hidden="true" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-body font-medium text-primary">{imp.source_filename ?? imp.client_id}</span>
                    <div className="flex items-center gap-3 text-body-sm">
                      {statusBadge(imp.status)}
                      <span className="text-secondary">{new Date(imp.created_at).toLocaleDateString("en-IN")}</span>
                      {imp.row_count_imported != null && (
                        <span className="text-mono-sm text-secondary font-medium">({imp.row_count_imported} rows extracted)</span>
                      )}
                    </div>
                  </div>
                </div>
                {imp.error_message && (
                  <div className="mt-3 ml-14 text-body-sm text-error flex items-center gap-1.5">
                    <AlertCircle size={12} aria-hidden="true" />
                    {imp.error_message}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="glass-strong rounded-sm p-12 text-center">
            <div className="w-16 h-16 rounded-full glass-strong flex items-center justify-center mx-auto mb-4">
              <FileText size={32} className="text-muted" aria-hidden="true" />
            </div>
            <p className="text-body text-muted">No imports yet. Upload a statement file to get started.</p>
          </div>
        )}
      </section>
    </div>
  );
}
