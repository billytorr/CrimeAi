import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/payments/webhook";

// Legacy endpoint kept for Stripe dashboards configured before the
// per-provider routes existed. New merchants use /api/pay/webhook/<id>.
export async function POST(req: Request) {
  if (req.headers.get("stripe-signature")) return handleWebhook("stripe", req);
  return NextResponse.json({ error: "Use /api/pay/webhook/<provider>" }, { status: 400 });
}
