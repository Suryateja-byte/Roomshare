import { auth } from '@/auth';
import NavbarClient from './NavbarClient';

import { getUnreadMessageCount } from '@/app/actions/chat';

export default async function Navbar() {
    const session = await auth();
    const user = session?.user;
    const unreadCount = await getUnreadMessageCount();

    return <NavbarClient user={user} unreadCount={unreadCount} />;
}

