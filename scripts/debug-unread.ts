// Debug script to check unread messages
import { prisma } from '../src/lib/prisma';

async function debugUnreadMessages() {
    const userId = process.argv[2]; // Pass user ID as argument

    if (!userId) {
        console.log('Usage: tsx scripts/debug-unread.ts <userId>');
        process.exit(1);
    }

    console.log(`\n🔍 Checking unread messages for user: ${userId}\n`);

    // Get all conversations for this user
    const conversations = await prisma.conversation.findMany({
        where: {
            participants: {
                some: { id: userId },
            },
        },
        include: {
            messages: {
                where: {
                    senderId: { not: userId },
                    read: false,
                },
                orderBy: { createdAt: 'desc' },
            },
            participants: {
                select: { id: true, name: true },
            },
        },
    });

    console.log(`📊 Total conversations: ${conversations.length}\n`);

    let totalUnread = 0;
    conversations.forEach(conv => {
        if (conv.messages.length > 0) {
            console.log(`Conversation ${conv.id}:`);
            console.log(`  Participants: ${conv.participants.map(p => `${p.name} (${p.id})`).join(', ')}`);
            console.log(`  Unread messages: ${conv.messages.length}`);
            conv.messages.forEach(msg => {
                console.log(`    - Message ${msg.id}: "${msg.content.substring(0, 50)}..." (read: ${msg.read})`);
            });
            console.log('');
            totalUnread += conv.messages.length;
        }
    });

    // Use the same query as getUnreadMessageCount
    const countFromQuery = await prisma.message.count({
        where: {
            conversation: {
                participants: {
                    some: { id: userId },
                },
            },
            senderId: { not: userId },
            read: false,
        },
    });

    console.log(`\n📈 Summary:`);
    console.log(`  Total unread messages (manual count): ${totalUnread}`);
    console.log(`  Total unread messages (query count): ${countFromQuery}`);

    if (totalUnread !== countFromQuery) {
        console.log(`  ⚠️  MISMATCH DETECTED!`);
    } else {
        console.log(`  ✅ Counts match`);
    }

    await prisma.$disconnect();
}

debugUnreadMessages().catch(console.error);
