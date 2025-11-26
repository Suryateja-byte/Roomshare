'use server';

import { stripe } from '@/lib/stripe';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export async function createVerificationSession() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect('/api/auth/signin');
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    try {
        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'RoomShare Verified Badge',
                            description: 'Get a verified badge on your profile to build trust.',
                        },
                        unit_amount: 500, // $5.00
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?verified=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?verified=false`,
            metadata: {
                userId,
            },
            customer_email: userEmail || undefined,
        });

        if (!checkoutSession.url) {
            throw new Error('Failed to create checkout session');
        }

        return { url: checkoutSession.url };
    } catch (error) {
        console.error('Error creating verification session:', error);
        throw new Error('Failed to initiate verification');
    }
}
