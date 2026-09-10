import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const cursorSchema = z.object({
  cursor: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const supabase = await createClient();
    const { clientId } = await params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    if (!clientId) {
      return NextResponse.json({ error: "Missing client ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const parsed = cursorSchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    const cursor = parsed.success ? parsed.data.cursor : undefined;

    let query = supabase.from("event").select("*").eq("client_id", clientId);

    if (cursor) {
      query = query.lt("occurred_at", new Date(cursor).toISOString());
    }

    query = query.order("occurred_at", { ascending: false }).limit(50) as typeof query;

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error("Trail error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
