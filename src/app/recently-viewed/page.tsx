import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getRecentlyViewed } from '@/app/actions/listing-status';
import RecentlyViewedClient from './RecentlyViewedClient';

export const metadata = {
    title: 'Recently Viewed | RoomShare',
    description: 'Listings you have recently viewed'
};

export default async function RecentlyViewedPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login');
    }

    const recentlyViewed = await getRecentlyViewed(20);

    // Convert Prisma Decimal price fields to plain numbers at the query boundary
    const listings = recentlyViewed.map(l => ({ ...l, price: Number(l.price) }));

    return <RecentlyViewedClient initialListings={listings} />;
}
