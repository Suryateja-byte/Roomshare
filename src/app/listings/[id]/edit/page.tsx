import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import EditListingForm from './EditListingForm';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function EditListingPage({ params }: PageProps) {
    const { id } = await params;
    const session = await auth();

    if (!session || !session.user) {
        redirect('/login');
    }

    const listing = await prisma.listing.findUnique({
        where: { id },
        include: { location: true },
    });

    if (!listing) {
        notFound();
    }

    // Check if user is the owner
    if (listing.ownerId !== session.user.id) {
        redirect(`/listings/${id}`);
    }

    return (
        <div className="min-h-screen bg-background py-12">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground">Edit Listing</h1>
                    <p className="text-muted-foreground mt-2">Update your listing details</p>
                </div>
                <EditListingForm listing={{ ...listing, price: Number(listing.price) }} />
            </div>
        </div>
    );
}
