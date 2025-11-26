import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
    const session = await auth();

    if (!session || !session.user || !session.user.id) {
        redirect('/login');
    }

    // Fetch user data with their listings
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
            listings: {
                include: {
                    location: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            },
        },
    });

    if (!user) {
        redirect('/login');
    }

    return <ProfileClient user={user} />;
}
