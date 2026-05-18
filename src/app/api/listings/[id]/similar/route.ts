import { NextResponse } from "next/server";
import { getPublicListingDetail } from "@/lib/listings/public-detail";
import { getSimilarListingsForListing } from "@/lib/listings/similar-listings";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function jsonWithNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const publicDetail = await getPublicListingDetail(id);

  if (!publicDetail) {
    return jsonWithNoStore({ error: "Listing not found" }, { status: 404 });
  }

  const listings = await getSimilarListingsForListing(id);
  return jsonWithNoStore({ listings });
}
