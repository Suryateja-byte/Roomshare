'use client';

import { useState, useEffect } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; // Assuming we have this
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface ReportButtonProps {
    listingId: string;
}

export default function ReportButton({ listingId }: ReportButtonProps) {
    const [mounted, setMounted] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [details, setDetails] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Prevent hydration mismatch by only rendering Dialog on client
    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSubmit = async () => {
        if (!reason) return;

        setIsSubmitting(true);
        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    listingId,
                    reason,
                    details
                }),
            });

            if (response.ok) {
                setSuccess(true);
                setTimeout(() => {
                    setIsOpen(false);
                    setSuccess(false);
                    setReason('');
                    setDetails('');
                }, 2000);
            }
        } catch (error) {
            console.error('Error submitting report:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Render placeholder button during SSR to prevent hydration mismatch
    if (!mounted) {
        return (
            <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-red-600 gap-2">
                <Flag className="w-4 h-4" />
                <span className="text-xs">Report this listing</span>
            </Button>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-red-600 gap-2">
                    <Flag className="w-4 h-4" />
                    <span className="text-xs">Report this listing</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Report Listing</DialogTitle>
                    <DialogDescription>
                        Help us keep the community safe. Why are you reporting this listing?
                    </DialogDescription>
                </DialogHeader>

                {success ? (
                    <div className="py-6 text-center text-green-600 font-medium">
                        Thank you for your report. We will review it shortly.
                    </div>
                ) : (
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="reason">Reason</Label>
                            <Select onValueChange={setReason} value={reason}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a reason" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="fraud">Fraudulent or Scam</SelectItem>
                                    <SelectItem value="inappropriate">Inappropriate Content</SelectItem>
                                    <SelectItem value="spam">Spam</SelectItem>
                                    <SelectItem value="misleading">Misleading Information</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="details">Details (Optional)</Label>
                            <Textarea
                                id="details"
                                value={details}
                                onChange={(e) => setDetails(e.target.value)}
                                placeholder="Please provide more details..."
                            />
                        </div>
                    </div>
                )}

                {!success && (
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={!reason || isSubmitting}>
                            {isSubmitting ? 'Submitting...' : 'Submit Report'}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
