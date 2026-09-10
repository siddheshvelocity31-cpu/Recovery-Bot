import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cipfkcsknxjemdmdkpyp.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpcGZrY3NrbnhqZW1kbWRrcHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTcwNDEsImV4cCI6MjEwMzQ5MzA0MX0.xAx-eX1P_DutARKi_fDy0XMhyhvN_gjpk4kJsb9yyc0";

  return createServerClient<Database>(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component; a middleware refreshing the
            // session handles this instead.
          }
        },
      },
    },
  );
}
