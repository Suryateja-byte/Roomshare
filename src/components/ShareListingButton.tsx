'use client';

import { useState } from 'react';
import { Share2, Link as LinkIcon, Twitter, Facebook, Mail, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShareListingButtonProps {
    listingId: string;
    title: string;
}

export default function ShareListingButton({ listingId, title }: ShareListingButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const url = typeof window !== 'undefined'
        ? `${window.location.origin}/listings/${listingId}`
        : `/listings/${listingId}`;

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const shareOptions = [
        {
            name: 'Copy Link',
            icon: copied ? Check : LinkIcon,
            action: handleCopyLink,
            color: copied ? 'text-green-600' : 'text-zinc-600'
        },
        {
            name: 'Twitter',
            icon: Twitter,
            action: () => {
                window.open(
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this room: ${title}`)}&url=${encodeURIComponent(url)}`,
                    '_blank'
                );
                setIsOpen(false);
            },
            color: 'text-[var(--social-twitter)]'
        },
        {
            name: 'Facebook',
            icon: Facebook,
            action: () => {
                window.open(
                    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
                    '_blank'
                );
                setIsOpen(false);
            },
            color: 'text-[var(--social-facebook)]'
        },
        {
            name: 'Email',
            icon: Mail,
            action: () => {
                window.open(
                    `mailto:?subject=${encodeURIComponent(`Check out this room: ${title}`)}&body=${encodeURIComponent(`I found this great room on RoomShare:\n\n${url}`)}`,
                    '_blank'
                );
                setIsOpen(false);
            },
            color: 'text-zinc-600'
        }
    ];

    // Use native share API if available
    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `RoomShare: ${title}`,
                    text: `Check out this room on RoomShare!`,
                    url: url
                });
            } catch (error) {
                // User cancelled or share failed, open dropdown instead
                setIsOpen(true);
            }
        } else {
            setIsOpen(!isOpen);
        }
    };

    return (
        <div className="relative">
            <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={handleShare}
            >
                <Share2 className="w-4 h-4" />
            </Button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-zinc-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                        <p className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Share this listing
                        </p>
                        {shareOptions.map((option) => {
                            const Icon = option.icon;
                            return (
                                <button
                                    key={option.name}
                                    onClick={option.action}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-zinc-50 transition-colors"
                                >
                                    <Icon className={`w-4 h-4 ${option.color}`} />
                                    <span className="text-sm text-zinc-700">{option.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
