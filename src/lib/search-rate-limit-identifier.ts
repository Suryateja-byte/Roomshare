import { auth } from "@/auth";
import { getClientIP } from "@/lib/rate-limit";

/**
 * Build a search rate-limit identifier.
 * Authenticated traffic uses ip:userId to avoid shared-NAT starvation.
 */
export async function getSearchRateLimitIdentifier(
  request: Request,
): Promise<string> {
  const ip = getClientIP(request);

  try {
    const session = await auth();
    const userId = session?.user?.id;
    return userId ? `${ip}:${userId}` : ip;
  } catch {
    return ip;
  }
}
