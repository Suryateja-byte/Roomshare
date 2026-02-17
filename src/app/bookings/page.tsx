import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getMyBookings } from '@/app/actions/manage-booking';
import BookingsClient from './BookingsClient';

export const metadata = {
    title: 'My Bookings | RoomShare',
    description: 'Manage your booking requests'
};

export default async function BookingsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login');
    }

    const { sentBookings, receivedBookings, error } = await getMyBookings();

    if (error) {
        return (
            <div className="min-h-screen bg-zinc-50/50 pt-20 pb-20">
                <div className="container mx-auto max-w-5xl px-6 py-10">
                    <p className="text-red-500">{error}</p>
                </div>
            </div>
        );
    }

    // Convert Prisma Decimal fields to plain numbers at the query boundary
    const convertBooking = (b: any) => ({
        ...b,
        totalPrice: Number(b.totalPrice),
        listing: { ...b.listing, price: Number(b.listing.price) },
    });

    return (
        <BookingsClient
            sentBookings={(sentBookings || []).map(convertBooking)}
            receivedBookings={(receivedBookings || []).map(convertBooking)}
        />
    );
}
