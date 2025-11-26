import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getSavedListings } from '@/app/actions/saved-listings';
import SavedListingsClient from './SavedListingsClient';

export const metadata = {
    title: 'Saved Listings | RoomShare',
    description: 'View and manage your saved listings'
};

export default async function SavedPage() {
    const session = await auth();

    if (!session || !session.user || !session.user.id) {
        redirect('/login');
    }

    const savedListings = await getSavedListings();

    return <SavedListingsClient initialListings={savedListings} />;
}
