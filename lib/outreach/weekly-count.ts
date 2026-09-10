import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { startOfWeek, endOfWeek } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { BUSINESS_TZ } from "@/lib/dates";

export async function getWeeklyOutreachCount(
  clientId: string,
  now: Date,
): Promise<number> {
  // Week boundaries in IST (Monday start)
  const nowIST = toZonedTime(now, BUSINESS_TZ);
  const weekStart = fromZonedTime(startOfWeek(nowIST, { weekStartsOn: 1 }), BUSINESS_TZ);
  const weekEnd = fromZonedTime(endOfWeek(nowIST, { weekStartsOn: 1 }), BUSINESS_TZ);

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin as any)
    .from("outreach")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .in("status", ["sent", "delivered", "read"])
    .gte("sent_at", weekStart.toISOString())
    .lte("sent_at", weekEnd.toISOString()) as { count: number | null; error: unknown };

  if (error) throw error;
  return count ?? 0;
}
