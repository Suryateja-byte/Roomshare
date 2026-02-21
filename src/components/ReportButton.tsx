'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiFetch, handleFetchError } from '@/lib/api-client';

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
    const [errorMessage, setErrorMessage] = useState('');
    const isSubmittingRef = useRef(false);

    // Prevent hydration mismatch by only rendering Dialog on client
    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSubmit = async () => {
        if (!reason || isSubmittingRef.current) return;

        isSubmittingRef.current = true;
        setIsSubmitting(true);
        setErrorMessage('');

        try {
            await apiFetch('/api/reports', {
                method: 'POST',
                body: JSON.stringify({
                    listingId,
                    reason,
                    details
                }),
            });

            setSuccess(true);
            setTimeout(() => {
                setIsOpen(false);
                setSuccess(false);
                setReason('');
                setDetails('');
                setErrorMessage('');
            }, 2000);
        } catch (error) {
            handleFetchError(error, 'Failed to submit report');
            setErrorMessage('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
            isSubmittingRef.current = false;
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
        <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) setErrorMessage('');
        }}>
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
                        {errorMessage && (
                            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                                {errorMessage}
                            </p>
                        )}
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
