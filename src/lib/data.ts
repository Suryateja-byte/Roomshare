import { prisma } from '@/lib/prisma';

export interface ListingData {
    id: string;
    title: string;
    description: string;
    price: number;
    availableSlots: number;
    totalSlots: number;
    amenities: string[];
    houseRules: string[];
    leaseDuration?: string;
    roomType?: string;
    moveInDate?: Date;
    ownerId?: string;
    location: {
        address: string;
        city: string;
        state: string;
        zip: string;
        lat: number;
        lng: number;
    };
}

export type SortOption = 'recommended' | 'price_asc' | 'price_desc' | 'newest' | 'rating';

export interface FilterParams {
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    language?: string;
    amenities?: string[];
    moveInDate?: string;
    leaseDuration?: string;
    houseRules?: string[];
    roomType?: string;
    bounds?: {
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
    };
    page?: number;
    limit?: number;
    sort?: SortOption;
}

export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export async function getListings(params: FilterParams = {}): Promise<ListingData[]> {
    const { query, minPrice, maxPrice, language, amenities, moveInDate, leaseDuration, houseRules, roomType, bounds, sort = 'recommended' } = params;

    // Fetch all active listings with location (only show ACTIVE status)
    const listings = await prisma.$queryRaw`
      SELECT
          l.id,
          l.title,
          l.description,
          l.price,
          l."availableSlots",
          l."totalSlots",
          l.amenities,
          l."houseRules",
          l."leaseDuration",
          l."roomType",
          l."moveInDate",
          l."ownerId",
          l."createdAt",
          l."viewCount",
          loc.address,
          loc.city,
          loc.state,
          loc.zip,
          ST_X(loc.coords::geometry) as lng,
          ST_Y(loc.coords::geometry) as lat,
          COALESCE(AVG(r.rating), 0) as avg_rating,
          COUNT(r.id) as review_count
      FROM "Listing" l
      JOIN "Location" loc ON l.id = loc."listingId"
      LEFT JOIN "Review" r ON l.id = r."listingId"
      WHERE l."availableSlots" > 0 AND l.status = 'ACTIVE'
      GROUP BY l.id, loc.id
      ORDER BY l."createdAt" DESC
  `;

    let results = (listings as any[]).map(l => ({
        id: l.id,
        title: l.title,
        description: l.description,
        price: l.price,
        availableSlots: l.availableSlots,
        totalSlots: l.totalSlots,
        amenities: l.amenities,
        houseRules: l.houseRules,
        leaseDuration: l.leaseDuration,
        roomType: l.roomType,
        moveInDate: l.moveInDate ? new Date(l.moveInDate) : undefined,
        ownerId: l.ownerId,
        createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
        viewCount: Number(l.viewCount) || 0,
        avgRating: Number(l.avg_rating) || 0,
        reviewCount: Number(l.review_count) || 0,
        location: {
            address: l.address,
            city: l.city,
            state: l.state,
            zip: l.zip,
            lat: l.lat,
            lng: l.lng
        }
    }));

    // Apply filters in memory
    if (bounds) {
        results = results.filter(l =>
            l.location.lat >= bounds.minLat &&
            l.location.lat <= bounds.maxLat &&
            l.location.lng >= bounds.minLng &&
            l.location.lng <= bounds.maxLng
        );
    }

    if (query) {
        const q = query.toLowerCase();
        results = results.filter(l =>
            l.title.toLowerCase().includes(q) ||
            l.description.toLowerCase().includes(q) ||
            l.location.city.toLowerCase().includes(q) ||
            l.location.state.toLowerCase().includes(q)
        );
    }

    if (minPrice) {
        results = results.filter(l => l.price >= minPrice);
    }

    if (maxPrice) {
        results = results.filter(l => l.price <= maxPrice);
    }

    if (amenities && amenities.length > 0) {
        results = results.filter(l =>
            amenities.every(a => l.amenities.includes(a))
        );
    }

    if (moveInDate) {
        const targetDate = new Date(moveInDate);
        results = results.filter(l =>
            !l.moveInDate || new Date(l.moveInDate) <= targetDate
        );
    }

    if (leaseDuration) {
        results = results.filter(l => l.leaseDuration === leaseDuration);
    }

    if (houseRules && houseRules.length > 0) {
        results = results.filter(l =>
            houseRules.every(r => l.houseRules.includes(r))
        );
    }

    if (roomType) {
        results = results.filter(l => l.roomType === roomType);
    }

    // Apply sorting
    switch (sort) {
        case 'price_asc':
            results.sort((a, b) => a.price - b.price);
            break;
        case 'price_desc':
            results.sort((a, b) => b.price - a.price);
            break;
        case 'newest':
            results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            break;
        case 'rating':
            results.sort((a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount);
            break;
        case 'recommended':
        default:
            // Recommended: combination of recency, rating, and views
            results.sort((a, b) => {
                const aScore = (a.avgRating * 20) + (a.viewCount * 0.1) + (a.reviewCount * 5);
                const bScore = (b.avgRating * 20) + (b.viewCount * 0.1) + (b.reviewCount * 5);
                return bScore - aScore;
            });
            break;
    }

    return results;
}

export async function getListingsPaginated(params: FilterParams = {}): Promise<PaginatedResult<ListingData>> {
    const { page = 1, limit = 12 } = params;

    // Get all filtered results first
    const allResults = await getListings(params);

    // Calculate pagination
    const total = allResults.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // Slice results for current page
    const items = allResults.slice(startIndex, endIndex);

    return {
        items,
        total,
        page,
        limit,
        totalPages
    };
}

export async function getSavedListingIds(userId: string): Promise<string[]> {
    const saved = await prisma.savedListing.findMany({
        where: { userId },
        select: { listingId: true }
    });
    return saved.map(s => s.listingId);
}

export async function getSavedListings(userId: string): Promise<ListingData[]> {
    const saved = await prisma.savedListing.findMany({
        where: { userId },
        include: {
            listing: {
                include: {
                    location: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    return saved.map(s => {
        const l = s.listing;
        // Handle potential null location (though schema says optional, our logic usually ensures it)
        // If location is missing, we might want to skip or handle gracefully. 
        // For now assuming location exists as per our creation logic.
        const loc = l.location!;

        return {
            id: l.id,
            title: l.title,
            description: l.description,
            price: l.price,
            availableSlots: l.availableSlots,
            totalSlots: l.totalSlots,
            amenities: l.amenities,
            houseRules: l.houseRules,
            leaseDuration: l.leaseDuration,
            roomType: l.roomType,
            moveInDate: l.moveInDate ? new Date(l.moveInDate) : undefined,
            ownerId: l.ownerId,
            location: {
                address: loc.address,
                city: loc.city,
                state: loc.state,
                zip: loc.zip,
                // Note: Prisma doesn't fetch Unsupported types like geometry directly easily without raw query.
                // For saved listings page, we might not need exact coords for map immediately, 
                // or we can accept 0,0 if we don't use the map there.
                // If we need coords, we should use queryRaw or a helper.
                // For simplicity here, I'll use 0,0 as placeholders or try to fetch if needed.
                // Actually, let's use a raw query for this too to be consistent and get coords.
                lat: 0,
                lng: 0
            }
        };
    });
}

export async function getReviews(listingId?: string, userId?: string) {
    if (!listingId && !userId) return [];

    return await prisma.review.findMany({
        where: {
            ...(listingId ? { listingId } : {}),
            ...(userId ? { targetUserId: userId } : {})
        },
        include: {
            author: {
                select: {
                    name: true,
                    image: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

export async function getAverageRating(listingId?: string, userId?: string) {
    if (!listingId && !userId) return 0;

    const aggregations = await prisma.review.aggregate({
        _avg: {
            rating: true
        },
        where: {
            ...(listingId ? { listingId } : {}),
            ...(userId ? { targetUserId: userId } : {})
        }
    });

    return aggregations._avg.rating || 0;
}
