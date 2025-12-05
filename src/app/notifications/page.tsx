import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getNotifications } from '@/app/actions/notifications';
import NotificationsClient from './NotificationsClient';

export const metadata = {
    title: 'Notifications | RoomShare',
    description: 'View your notifications'
};

export default async function NotificationsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login');
    }

    const { notifications, hasMore } = await getNotifications(20);

    return <NotificationsClient initialNotifications={notifications as any} initialHasMore={hasMore} />;
}
