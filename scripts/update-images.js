// Update listing images to use allowed domains
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Different Unsplash room/apartment images
const imageUrls = [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800',
    'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800',
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800'
];

async function main() {
    const listings = await prisma.listing.findMany();

    for (let i = 0; i < listings.length; i++) {
        const imgIndex = i % imageUrls.length;
        await prisma.listing.update({
            where: { id: listings[i].id },
            data: {
                images: [
                    imageUrls[imgIndex],
                    imageUrls[(imgIndex + 1) % imageUrls.length],
                    imageUrls[(imgIndex + 2) % imageUrls.length]
                ]
            }
        });
        console.log(`✓ Updated images for: ${listings[i].title}`);
    }

    console.log('\n✅ All listing images updated!');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
