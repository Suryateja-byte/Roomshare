'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Home, ChevronDown } from 'lucide-react';
import { updateListingStatus, ListingStatus } from '@/app/actions/listing-status';

interface ListingStatusToggleProps {
    listingId: string;
    currentStatus: ListingStatus;
}

const statusConfig = {
    ACTIVE: {
        label: 'Active',
        description: 'Visible to everyone',
        icon: Eye,
        color: 'bg-green-100 text-green-700 border-green-200',
        dotColor: 'bg-green-500'
    },
    PAUSED: {
        label: 'Paused',
        description: 'Hidden from search',
        icon: EyeOff,
        color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        dotColor: 'bg-yellow-500'
    },
    RENTED: {
        label: 'Rented',
        description: 'Marked as rented',
        icon: Home,
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        dotColor: 'bg-blue-500'
    }
};

export default function ListingStatusToggle({ listingId, currentStatus }: ListingStatusToggleProps) {
    const [status, setStatus] = useState<ListingStatus>(currentStatus);
    const [isOpen, setIsOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const router = useRouter();

    const config = statusConfig[status];
    const Icon = config.icon;

    const handleStatusChange = async (newStatus: ListingStatus) => {
        if (newStatus === status) {
            setIsOpen(false);
            return;
        }

        setIsUpdating(true);
        const result = await updateListingStatus(listingId, newStatus);

        if (result.error) {
            toast.error(result.error);
        } else {
            setStatus(newStatus);
            router.refresh();
        }

        setIsUpdating(false);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isUpdating}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${config.color} transition-all hover:shadow-md disabled:opacity-50`}
            >
                <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                <span className="font-medium text-sm">{config.label}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-zinc-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                        <p className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Listing Status
                        </p>
                        {(Object.keys(statusConfig) as ListingStatus[]).map((statusKey) => {
                            const itemConfig = statusConfig[statusKey];
                            const ItemIcon = itemConfig.icon;
                            const isSelected = statusKey === status;

                            return (
                                <button
                                    key={statusKey}
                                    onClick={() => handleStatusChange(statusKey)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors ${isSelected ? 'bg-zinc-50' : ''}`}
                                >
                                    <div className={`p-2 rounded-lg ${itemConfig.color}`}>
                                        <ItemIcon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-sm text-zinc-900">{itemConfig.label}</p>
                                        <p className="text-xs text-zinc-500">{itemConfig.description}</p>
                                    </div>
                                    {isSelected && (
                                        <div className="w-2 h-2 rounded-full bg-zinc-900" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
