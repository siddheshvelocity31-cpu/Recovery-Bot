"use client";

import { useState } from "react";
import { User, Mail, Phone, Edit2, X, CheckCircle2, AlertCircle, Loader2, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface Contact {
  id?: string;
  full_name: string;
  email: string;
  phone_e164?: string | null;
}

interface EditContactModalProps {
  clientId: string;
  initialContact: Contact | null;
}

export function EditContactModal({ clientId, initialContact }: EditContactModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contact, setContact] = useState<Contact | null>(initialContact);
  const [fullName, setFullName] = useState(initialContact?.full_name || "");
  const [email, setEmail] = useState(initialContact?.email || "");
  const [phone, setPhone] = useState(initialContact?.phone_e164 || "");
  const [saving, setSaving] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [checkingReply, setCheckingReply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  async function handleCheckClientReply() {
    setCheckingReply(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/replies/sync");
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || "Failed to check replies");

      if (resJson.processedCount > 0) {
        setSuccess(`New client reply detected! Payment promise tracked & case status updated to promise_active.`);
      } else {
        setSuccess(`Checked Gmail inbox — no new unread reply found from ${contact?.email || "client"}.`);
      }
      router.refresh();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || "Failed to check email replies");
    } finally {
      setCheckingReply(false);
    }
  }

  async function handleSendTestEmail() {
    if (!contact?.email) return;
    setSendingMail(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/contact`, {
        method: "PUT",
      });
      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || "Failed to send email");
      }
      setSuccess(`Payment reminder notice sent to ${contact.email}!`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to send email");
    } finally {
      setSendingMail(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please enter a contact person name.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          phone_e164: phone.trim() || null,
        }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || "Failed to update contact details");
      }

      setContact(resJson.contact);
      const msg = resJson.emailSent
        ? `Contact saved & payment reminder email automatically sent to ${resJson.contact.email}!`
        : "Contact details updated successfully!";
      setSuccess(msg);
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(null);
      }, 2500);
    } catch (err: any) {
      setError(err.message || "Failed to save contact details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Contact Summary Strip & Edit Button */}
      <div className="glass-strong rounded-sm p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-up">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center">
            <User size={20} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-body font-semibold text-primary">
                {contact?.full_name || "No Primary Contact Set"}
              </p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-secondary border border-white/10 font-mono">
                Accounts Contact
              </span>
            </div>
            <div className="flex items-center gap-4 mt-0.5 text-body-sm text-secondary flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} className="text-primary" />
                {contact?.email ? contact.email : <span className="text-warning italic">No Email Configured</span>}
              </span>
              {contact?.phone_e164 && (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                  <Phone size={13} className="text-primary" />
                  {contact.phone_e164}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            onClick={handleCheckClientReply}
            disabled={checkingReply}
            className="gap-2 dark:bg-black dark:hover:bg-neutral-900 dark:border dark:border-white/20"
          >
            {checkingReply ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Check Client Reply Now
          </Button>
          {contact?.email && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSendTestEmail}
              disabled={sendingMail}
              className="gap-2 dark:bg-black dark:hover:bg-neutral-900 dark:border dark:border-white/20"
            >
              {sendingMail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send Reminder Email Now
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
          >
            <Edit2 size={14} />
            {contact ? "Edit Contact Details" : "+ Add Contact Email"}
          </Button>
        </div>
      </div>

      {!isOpen && success && (
        <div role="status" className="mb-6 glass-strong rounded-sm p-4 border-l-4 border-success animate-slide-up flex items-center gap-2 text-body text-success">
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}

      {!isOpen && error && (
        <div role="alert" className="mb-6 glass-strong rounded-sm p-4 border-l-4 border-error animate-slide-up flex items-center gap-2 text-body text-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-enter">
          <div className="w-full max-w-md rounded-md bg-[#0d0e15] border border-white/20 p-6 shadow-2xl relative z-50 text-white">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <User size={20} className="text-primary" />
              <h3 className="text-h3 text-primary font-semibold">Update Accounts Contact</h3>
            </div>
            <p className="text-body-sm text-secondary mb-6">
              Payment reminder emails for this client will be sent directly to this email address.
            </p>

            {error && (
              <div role="alert" className="mb-4 p-3 rounded-sm bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-body-sm text-error">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div role="status" className="mb-4 p-3 rounded-sm bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-body-sm text-success">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium text-secondary mb-1">
                  Contact Person Name <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Finance Team / Accounts Manager"
                  className="w-full bg-white/5 border border-white/15 rounded-sm px-3 py-2 text-body text-primary focus:outline-none focus:border-primary/50"
                  required
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-secondary mb-1">
                  Accounts Email Address <span className="text-error">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. accounts@clientcompany.com"
                  className="w-full bg-white/5 border border-white/15 rounded-sm px-3 py-2 text-body text-primary focus:outline-none focus:border-primary/50"
                  required
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-secondary mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +919876543210"
                  className="w-full bg-white/5 border border-white/15 rounded-sm px-3 py-2 text-body text-primary focus:outline-none focus:border-primary/50 font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={saving}
                  className="gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Save Contact Details
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
