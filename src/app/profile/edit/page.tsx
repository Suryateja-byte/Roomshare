import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getProfile } from '@/app/actions/profile';
import EditProfileClient from './EditProfileClient';

export const metadata = {
    title: 'Edit Profile | RoomShare',
    description: 'Update your profile information'
};

export default async function EditProfilePage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login');
    }

    const { user, error } = await getProfile();

    if (error || !user) {
        redirect('/login');
    }

    return <EditProfileClient user={user} />;
}
