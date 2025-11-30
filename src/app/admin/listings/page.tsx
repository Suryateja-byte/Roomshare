import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ArrowLeft, Home } from 'lucide-react';
import ListingList from './ListingList';

export const metadata = {
    title: 'Listing Moderation | Admin | RoomShare',
    description: 'Moderate listings on the RoomShare platform',
};

export default async function AdminListingsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login?callbackUrl=/admin/listings');
    }

    // Check if user is admin
    const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!currentUser?.isAdmin) {
        redirect('/');
    }

    // Fetch all listings
    const [listings, totalListings] = await Promise.all([
        prisma.listing.findMany({
            select: {
                id: true,
                title: true,
                price: true,
                status: true,
                images: true,
                viewCount: true,
                createdAt: true,
                owner: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                location: {
                    select: {
                        city: true,
                        state: true
                    }
                },
                _count: {
                    select: {
                        reports: true,
                        bookings: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 100 // Limit for initial load
        }),
        prisma.listing.count()
    ]);

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/admin"
                        className="inline-flex items-center gap-2 text-zinc-600 hover:text-zinc-900 mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-100 rounded-xl">
                            <Home className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-900">Listing Moderation</h1>
                            <p className="text-zinc-500">Review and manage all listings</p>
                        </div>
                    </div>
                </div>

                {/* Listing List */}
                <ListingList
                    initialListings={listings}
                    totalListings={totalListings}
                />
            </div>
        </div>
    );
}
