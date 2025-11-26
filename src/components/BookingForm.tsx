'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createBooking } from '@/app/actions/booking';
import { useRouter } from 'next/navigation';
import { Calendar } from 'lucide-react';

interface BookingFormProps {
    listingId: string;
    price: number;
    ownerId: string;
    isOwner: boolean;
}

export default function BookingForm({ listingId, price, ownerId, isOwner }: BookingFormProps) {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!startDate || !endDate) {
            setMessage('Please select dates');
            return;
        }

        setIsLoading(true);
        setMessage('');

        try {
            await createBooking(listingId, new Date(startDate), new Date(endDate), price);
            setMessage('Request sent successfully!');
            // Reset form or redirect
            setTimeout(() => {
                setMessage('');
                // Maybe redirect to a bookings page if we had one
            }, 3000);
        } catch (error) {
            setMessage('Failed to send request');
        } finally {
            setIsLoading(false);
        }
    };

    if (isOwner) {
        return null; // Or show some owner-specific view
    }

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-zinc-100 p-6 sticky top-24">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <span className="text-3xl font-bold text-zinc-900">${price}</span>
                    <span className="text-zinc-500"> / month</span>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium text-green-600">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Available now
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-500 uppercase">Check-in</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full p-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            min={new Date().toISOString().split('T')[0]}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-500 uppercase">Check-out</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full p-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            min={startDate || new Date().toISOString().split('T')[0]}
                        />
                    </div>
                </div>

                <Button
                    type="submit"
                    className="w-full h-12 text-lg font-semibold rounded-xl"
                    disabled={isLoading}
                >
                    {isLoading ? 'Sending Request...' : 'Request to Book'}
                </Button>

                {message && (
                    <p className={`text-center text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-500'}`}>
                        {message}
                    </p>
                )}

                <p className="text-center text-xs text-zinc-500">
                    You won't be charged yet
                </p>
            </form>

            <div className="mt-6 pt-6 border-t border-zinc-100 space-y-3">
                <div className="flex justify-between text-zinc-500">
                    <span>Monthly rent</span>
                    <span>${price}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                    <span>Service fee</span>
                    <span>$0</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-3 border-t border-zinc-100 mt-3">
                    <span>Total</span>
                    <span>${price}</span>
                </div>
            </div>
        </div>
    );
}
