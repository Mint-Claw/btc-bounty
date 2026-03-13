import { NextResponse } from "next/server";
import { btcpayHealthCheck } from "@/lib/server/btcpay";
import { getPaymentStats } from "@/lib/server/payments";

export async function GET() {
  const btcpay = await btcpayHealthCheck();
  const stats = await getPaymentStats();

  return NextResponse.json({
    status: "ok",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    btcpay: {
      connected: btcpay.ok,
      url: btcpay.url,
      ...(btcpay.error && { error: btcpay.error }),
    },
    payments: stats,
  });
}
