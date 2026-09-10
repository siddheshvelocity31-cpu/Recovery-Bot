import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export function getAdminClient(): SupabaseClient<Database, "public"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cipfkcsknxjemdmdkpyp.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpcGZrY3NrbnhqZW1kbWRrcHlwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzkxNzA0MSwiZXhwIjoyMTAzNDkzMDQxfQ._3sII3Z_CBoBRx0rESeqoG-amucYyxbRkcEr3E97X20";
  return createClient<Database, "public">(
    url,
    key,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
