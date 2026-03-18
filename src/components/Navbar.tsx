import NavbarClient from './NavbarClient';
import { auth } from '@/auth';

export default async function Navbar() {
    const session = await auth();
    return <NavbarClient user={session?.user ?? null} unreadCount={0} />;
}

