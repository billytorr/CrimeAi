import { handleWebhook } from "@/lib/payments/webhook";

// Canonical webhook endpoint — one URL per merchant:
//   https://app.publicsafetycrimecenter.com/api/pay/webhook/stripe
//   https://app.publicsafetycrimecenter.com/api/pay/webhook/chase
//   … any provider id registered in lib/payments/registry.ts
export async function POST(req: Request, { params }: { params: { provider: string } }) {
  return handleWebhook(params.provider, req);
}
