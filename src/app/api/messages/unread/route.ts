import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUnreadMessageCount } from '@/app/actions/chat';

export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const count = await getUnreadMessageCount();

        console.log(`[Unread API] User ${session.user.id} - Unread count: ${count}`);

        return NextResponse.json({ count });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
