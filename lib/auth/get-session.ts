import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/types/database";

export type AppUser = Tables<"app_user">;

export async function getSession(): Promise<{
  user: { id: string; email: string } | null;
  appUser: AppUser | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, appUser: null };

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: appUser } = await (admin as any)
    .from("app_user")
    .select("*")
    .eq("id", user.id)
    .single() as { data: AppUser | null };

  return {
    user: { id: user.id, email: user.email ?? "" },
    appUser,
  };
}
