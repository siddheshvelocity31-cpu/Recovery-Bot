import { NextResponse } from "next/server";
import { syncGmailInboundReplies } from "@/lib/replies/gmail-sync";

export async function GET() {
  try {
    const result = await syncGmailInboundReplies();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Failed to sync Gmail replies:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return GET();
}
