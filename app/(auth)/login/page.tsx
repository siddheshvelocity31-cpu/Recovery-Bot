"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const emailError = emailTouched && email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? "Enter a valid email address."
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    setError(null);

    if (emailError) return;

    setLoading(true);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  const inputBase = cn(
    "w-full rounded-sm border bg-white px-3 py-2 text-body placeholder:text-neutral-400",
    "focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:outline-none",
    "disabled:opacity-60",
    "dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:border-white dark:focus:ring-white",
    emailError ? "border-error" : "border-neutral-300 dark:border-white/20",
  );

  const labelBase = "block text-body-sm font-medium text-secondary";

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-900">
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        noValidate
        className="w-full max-w-sm space-y-4 rounded-sm border border-neutral-200 bg-surface p-6 sm:p-8 dark:border-white/15 dark:bg-neutral-950"
      >
        <h1 className="text-h2 text-primary">Recovery System</h1>
        <p className="text-body-sm text-muted">Sign in to manage client receivables.</p>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-sm bg-red-50 px-3 py-2 text-body-sm text-error dark:bg-red-900/20"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className={labelBase}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            autoComplete="email"
            required
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "email-error" : undefined}
            className={inputBase}
            disabled={loading}
          />
          {emailError && (
            <p id="email-error" className="text-body-sm text-error">{emailError}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className={labelBase}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            autoComplete="current-password"
            required
            aria-invalid={passwordTouched && password === ""}
            aria-describedby={passwordTouched && password === "" ? "password-error" : undefined}
            className={inputBase}
            disabled={loading}
          />
          {passwordTouched && password === "" && (
            <p id="password-error" className="text-body-sm text-error">Password is required.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-neutral-950 px-4 py-2 text-body-sm font-medium text-white transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200 dark:focus-visible:ring-white"
        >
          {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
