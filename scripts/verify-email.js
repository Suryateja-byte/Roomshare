const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyEmail(email) {
    try {
        const result = await prisma.user.update({
            where: { email },
            data: { emailVerified: new Date() }
        });
        console.log('Email verified successfully for:', result.email);
        console.log('Verified at:', result.emailVerified);
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

verifyEmail('suryaram564@gmail.com');
