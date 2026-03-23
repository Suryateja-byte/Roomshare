import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { captureApiError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/csrf";
import { z } from "zod";

// P2-4: Zod schema for request validation
const toggleFavoriteSchema = z.object({
  listingId: z.string().min(1, "listingId is required").max(100),
});

const favoritesQuerySchema = z.array(z.string().min(1).max(100)).max(60);

export async function GET(request: Request) {
  // L-12 FIX: Rate limit GET to prevent enumeration abuse
  const rateLimitResponse = await withRateLimit(request, {
    type: "savedListings",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      const response = NextResponse.json({ savedIds: [] as string[] });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }

    const { searchParams } = new URL(request.url);
    const rawIds = (searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const parsed = favoritesQuerySchema.safeParse(rawIds);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid ids parameter" },
        { status: 400 }
      );
    }

    if (parsed.data.length === 0) {
      const response = NextResponse.json({ savedIds: [] as string[] });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }

    const savedListings = await prisma.savedListing.findMany({
      where: {
        userId: session.user.id,
        listingId: { in: parsed.data },
      },
      select: {
        listingId: true,
      },
    });

    const response = NextResponse.json({
      savedIds: savedListings.map((savedListing) => savedListing.listingId),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return captureApiError(error, { route: "/api/favorites", method: "GET" });
  }
}

export async function POST(request: Request) {
  // CSRF protection
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  // P2-4: Add rate limiting to prevent abuse
  const rateLimitResponse = await withRateLimit(request, {
    type: "toggleFavorite",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // P2-4: Zod validation
    const parsed = toggleFavoriteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { listingId } = parsed.data;

    const userId = session.user.id;

    // Check if already saved
    const existing = await prisma.savedListing.findUnique({
      where: {
        userId_listingId: {
          userId,
          listingId,
        },
      },
    });

    if (existing) {
      // Delete
      await prisma.savedListing.delete({
        where: {
          id: existing.id,
        },
      });
      // P2-1: User-specific toggle must not be cached
      const response = NextResponse.json({ saved: false });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } else {
      // Create
      await prisma.savedListing.create({
        data: {
          userId,
          listingId,
        },
      });
      // P2-1: User-specific toggle must not be cached
      const response = NextResponse.json({ saved: true });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  } catch (error) {
    return captureApiError(error, { route: "/api/favorites", method: "POST" });
  }
}
