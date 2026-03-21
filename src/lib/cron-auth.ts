import "server-only";

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

function verifyCronSecret(
  authHeader: string | null,
  cronSecret: string
): boolean {
  if (!authHeader) return false;
  const expected = `Bearer ${cronSecret}`;
  const providedBuf = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function validateCronAuth(request: Request): NextResponse | null {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || cronSecret.length < 32) {
    logger.sync.error("[Cron] CRON_SECRET not configured or too short");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  if (
    cronSecret.startsWith("generate-") ||
    cronSecret.startsWith("your-") ||
    cronSecret.includes("change-in-production")
  ) {
    logger.sync.error("[Cron] CRON_SECRET contains placeholder value");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  if (!verifyCronSecret(authHeader, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
