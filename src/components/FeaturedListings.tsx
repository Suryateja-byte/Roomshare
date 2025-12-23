'use server';

import { getListingsPaginated, ListingData } from '@/lib/data';
import FeaturedListingsClient from './FeaturedListingsClient';

export default async function FeaturedListings() {
    // Fetch 6 newest listings to display on the home page
    const { items: listings } = await getListingsPaginated({
        sort: 'newest',
        limit: 6
    });

    return <FeaturedListingsClient listings={listings} />;
}
