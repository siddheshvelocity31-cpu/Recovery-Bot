import { NextResponse } from "next/server";
import { processInboundReply } from "@/lib/replies/process-inbound";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_id, case_id, contact_id, channel, body_text, message_id } = body;

    if (!client_id || !body_text) {
      return NextResponse.json(
        { error: "client_id and body_text are required" },
        { status: 400 },
      );
    }

    const result = await processInboundReply({
      clientId: client_id,
      caseId: case_id,
      contactId: contact_id,
      channel: channel || "email",
      bodyText: body_text,
      externalMessageId: message_id,
      rawPayload: body,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error processing inbound reply:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
