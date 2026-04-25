import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { runRestorationJob } from "@/lib/payments/contact-restoration";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) {
    return authError;
  }

  const result = await runRestorationJob("ghost-sla");
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

