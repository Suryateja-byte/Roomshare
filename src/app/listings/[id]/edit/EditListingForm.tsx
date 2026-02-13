'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { SUPPORTED_LANGUAGES, getLanguageName, type LanguageCode } from '@/lib/languages';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Home, MapPin, List, ArrowLeft, FileText, CheckCircle, RefreshCcw, AlertCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useFormPersistence, formatTimeSince } from '@/hooks/useFormPersistence';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ImageUploader from '@/components/listings/ImageUploader';
import { ImageIcon } from 'lucide-react';

interface ImageObject {
    file?: File;
    id: string;
    previewUrl: string;
    uploadedUrl?: string;
    isUploading?: boolean;
    error?: string;
}

interface PersistedImageData {
    id: string;
    uploadedUrl: string;
}

interface Listing {
    id: string;
    title: string;
    description: string;
    price: number;
    amenities: string[];
    houseRules: string[];
    householdLanguages: string[];
    genderPreference: string | null;
    householdGender: string | null;
    leaseDuration: string | null;
    roomType: string | null;
    totalSlots: number;
    moveInDate: Date | null;
    location: {
        address: string;
        city: string;
        state: string;
        zip: string;
    } | null;
    images: string[];
}

interface EditListingFormProps {
    listing: Listing;
}

interface EditListingFormData {
    title: string;
    description: string;
    price: string;
    totalSlots: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    amenities: string;
    houseRules: string;
    moveInDate: string;
    leaseDuration: string;
    roomType: string;
    genderPreference: string;
    householdGender: string;
    selectedLanguages: string[];
    images: PersistedImageData[];
}

// Format date for input (YYYY-MM-DD)
const formatDateForInput = (date: Date | null) => {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function EditListingForm({ listing }: EditListingFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>(listing.householdLanguages || []);
    const [formModified, setFormModified] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const [showDraftBanner, setShowDraftBanner] = useState(false);
    const [draftRestored, setDraftRestored] = useState(false);

    // Form field states for premium components
    const [description, setDescription] = useState(listing.description || '');
    const [moveInDate, setMoveInDate] = useState(formatDateForInput(listing.moveInDate));
    const [leaseDuration, setLeaseDuration] = useState(listing.leaseDuration || '');
    const [roomType, setRoomType] = useState(listing.roomType || '');
    const [genderPreference, setGenderPreference] = useState(listing.genderPreference || '');
    const [householdGender, setHouseholdGender] = useState(listing.householdGender || '');

    // Image management state
    const [images, setImages] = useState<ImageObject[]>([]);
    const [imagesInitialized, setImagesInitialized] = useState(false);

    // Form persistence hook - unique key per listing
    const FORM_STORAGE_KEY = `edit-listing-draft-${listing.id}`;
    const {
        persistedData,
        hasDraft,
        savedAt,
        saveData,
        clearPersistedData,
        isHydrated
    } = useFormPersistence<EditListingFormData>({ key: FORM_STORAGE_KEY });

    // Show draft banner when we have a draft and haven't restored yet
    useEffect(() => {
        if (isHydrated && hasDraft && !draftRestored) {
            setShowDraftBanner(true);
        }
    }, [isHydrated, hasDraft, draftRestored]);

    // Helper component for field-level errors
    const FieldError = ({ field }: { field: string }) => {
        if (!fieldErrors[field]) return null;
        return (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {fieldErrors[field]}
            </p>
        );
    };

    // Collect current form data for saving
    const collectFormData = (): EditListingFormData => {
        const form = formRef.current;
        const currentImages = images
            .filter(img => img.uploadedUrl && !img.error)
            .map(img => ({ id: img.id, uploadedUrl: img.uploadedUrl! }));

        if (!form) {
            return {
                title: listing.title, description, price: String(listing.price), totalSlots: String(listing.totalSlots),
                address: listing.location?.address || '', city: listing.location?.city || '',
                state: listing.location?.state || '', zip: listing.location?.zip || '',
                amenities: listing.amenities.join(', '), houseRules: listing.houseRules.join(', '),
                moveInDate, leaseDuration, roomType, genderPreference, householdGender,
                selectedLanguages,
                images: currentImages
            };
        }

        return {
            title: (form.elements.namedItem('title') as HTMLInputElement)?.value || '',
            description: description,
            price: (form.elements.namedItem('price') as HTMLInputElement)?.value || '',
            totalSlots: (form.elements.namedItem('totalSlots') as HTMLInputElement)?.value || '',
            address: (form.elements.namedItem('address') as HTMLInputElement)?.value || '',
            city: (form.elements.namedItem('city') as HTMLInputElement)?.value || '',
            state: (form.elements.namedItem('state') as HTMLInputElement)?.value || '',
            zip: (form.elements.namedItem('zip') as HTMLInputElement)?.value || '',
            amenities: (form.elements.namedItem('amenities') as HTMLInputElement)?.value || '',
            houseRules: (form.elements.namedItem('houseRules') as HTMLTextAreaElement)?.value || '',
            moveInDate,
            leaseDuration,
            roomType,
            genderPreference,
            householdGender,
            selectedLanguages,
            images: currentImages
        };
    };

    // Restore draft data to form
    const restoreDraft = () => {
        if (!persistedData || !formRef.current) return;

        const form = formRef.current;
        (form.elements.namedItem('title') as HTMLInputElement).value = persistedData.title || listing.title;
        setDescription(persistedData.description || listing.description);
        (form.elements.namedItem('price') as HTMLInputElement).value = persistedData.price || String(listing.price);
        (form.elements.namedItem('totalSlots') as HTMLInputElement).value = persistedData.totalSlots || String(listing.totalSlots);
        (form.elements.namedItem('address') as HTMLInputElement).value = persistedData.address || listing.location?.address || '';
        (form.elements.namedItem('city') as HTMLInputElement).value = persistedData.city || listing.location?.city || '';
        (form.elements.namedItem('state') as HTMLInputElement).value = persistedData.state || listing.location?.state || '';
        (form.elements.namedItem('zip') as HTMLInputElement).value = persistedData.zip || listing.location?.zip || '';
        (form.elements.namedItem('amenities') as HTMLInputElement).value = persistedData.amenities || listing.amenities.join(', ');
        (form.elements.namedItem('houseRules') as HTMLTextAreaElement).value = persistedData.houseRules || listing.houseRules.join(', ');

        setMoveInDate(persistedData.moveInDate || formatDateForInput(listing.moveInDate));
        setLeaseDuration(persistedData.leaseDuration || listing.leaseDuration || '');
        setRoomType(persistedData.roomType || listing.roomType || '');
        setGenderPreference(persistedData.genderPreference || listing.genderPreference || '');
        setHouseholdGender(persistedData.householdGender || listing.householdGender || '');
        setSelectedLanguages(persistedData.selectedLanguages || listing.householdLanguages || []);

        // Restore images (they're already uploaded to Supabase)
        if (persistedData.images && persistedData.images.length > 0) {
            const restoredImages: ImageObject[] = persistedData.images.map(img => ({
                id: img.id,
                previewUrl: img.uploadedUrl, // Use the uploaded URL as preview
                uploadedUrl: img.uploadedUrl,
                isUploading: false
            }));
            setImages(restoredImages);
            setImagesInitialized(true);
        }

        setDraftRestored(true);
        setShowDraftBanner(false);
        setFormModified(true);
    };

    // Discard draft and use original listing data
    const discardDraft = () => {
        clearPersistedData();
        setShowDraftBanner(false);
        setDraftRestored(true);
    };

    // Auto-save form data on changes
    const handleFormChangeWithSave = () => {
        if (!formModified) {
            setFormModified(true);
        }
        if (!isHydrated) return;
        if (!draftRestored && hasDraft) return; // Don't overwrite existing draft until user decides
        const formData = collectFormData();
        saveData(formData);
    };

    // Save when controlled states change
    useEffect(() => {
        if (!isHydrated || (!draftRestored && hasDraft)) return;
        if (!formModified) return;
        const formData = collectFormData();
        saveData(formData);
    }, [description, moveInDate, leaseDuration, roomType, genderPreference, householdGender, selectedLanguages]);

    // Warn user when navigating away with unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (formModified && !loading) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [formModified, loading]);

    // Track form modifications (legacy - now merged with save)
    const handleFormChange = () => {
        handleFormChangeWithSave();
    };

    // Language search filter state
    const [languageSearch, setLanguageSearch] = useState('');

    // Get all language codes from canonical list
    const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

    // Filter languages based on search
    const filteredLanguages = useMemo(() => {
        if (!languageSearch.trim()) return LANGUAGE_CODES;
        const search = languageSearch.toLowerCase();
        return LANGUAGE_CODES.filter(code =>
            getLanguageName(code).toLowerCase().includes(search) ||
            code.toLowerCase().includes(search)
        );
    }, [languageSearch]);

    const toggleLanguage = (lang: string) => {
        setFormModified(true);
        setSelectedLanguages(prev =>
            prev.includes(lang)
                ? prev.filter(l => l !== lang)
                : [...prev, lang]
        );
    };

    // Handle image changes from ImageUploader
    const handleImagesChange = (newImages: ImageObject[]) => {
        setImages(newImages);
        if (imagesInitialized) {
            setFormModified(true);
        } else {
            setImagesInitialized(true);
        }
    };

    // Check if any images are still uploading
    const isAnyImageUploading = images.some(img => img.isUploading);
    const hasFailedImages = images.some(img => img.error);

    // Retry handler for failed submissions
    const handleRetry = () => {
        setError('');
        setFieldErrors({});
        if (formRef.current) {
            formRef.current.requestSubmit();
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setFieldErrors({});

        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());

        try {
            const res = await fetch(`/api/listings/${listing.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...data,
                    householdLanguages: selectedLanguages,
                    moveInDate: moveInDate || undefined,
                    leaseDuration: leaseDuration || undefined,
                    roomType: roomType || undefined,
                    genderPreference: genderPreference || undefined,
                    householdGender: householdGender || undefined,
                    images: images.filter(img => img.uploadedUrl).map(img => img.uploadedUrl),
                }),
            });

            if (!res.ok) {
                const json = await res.json();
                // Handle field-level errors if provided
                if (json.fields) {
                    setFieldErrors(json.fields);
                }
                throw new Error(json.error || 'Failed to update listing');
            }

            // Clear draft on successful submission
            clearPersistedData();
            // Redirect to listing page on success
            router.push(`/listings/${listing.id}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
            // Save current form state on error so nothing is lost
            saveData(collectFormData());
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Link
                data-testid="listing-cancel-button"
                href={`/listings/${listing.id}`}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to listing
            </Link>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-4 py-4 rounded-xl mb-8">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                                    Failed to save changes
                                </p>
                                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                    {error}
                                </p>
                                <p className="text-xs text-red-500 dark:text-red-500 mt-2">
                                    Your changes have been saved locally and won't be lost.
                                </p>
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRetry}
                            disabled={loading}
                            className="flex-shrink-0 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/50"
                        >
                            <RefreshCcw className="w-4 h-4 mr-1" />
                            Retry
                        </Button>
                    </div>
                </div>
            )}

            {/* Draft Resume Banner */}
            {showDraftBanner && savedAt && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-4 py-4 rounded-xl mb-8 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                You have unsaved edits
                            </p>
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                                Last saved {formatTimeSince(savedAt)}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={discardDraft}
                            className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        >
                            Discard
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={restoreDraft}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Resume Edits
                        </Button>
                    </div>
                </div>
            )}

            {/* Auto-save status indicator */}
            {!showDraftBanner && savedAt && formModified && !loading && (
                <div className="flex items-center justify-end gap-2 mb-4 text-xs text-zinc-500 dark:text-zinc-400 animate-in fade-in duration-300">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    <span>Draft saved {formatTimeSince(savedAt)}</span>
                </div>
            )}

            <form ref={formRef} data-testid="edit-listing-form" onSubmit={handleSubmit} onChange={handleFormChange} className="space-y-12">
                {/* Section 1: The Basics */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                        <Home className="w-4 h-4" /> The Basics
                    </h3>

                    <div>
                        <Label htmlFor="title">Listing Title</Label>
                        <Input
                            id="title"
                            name="title"
                            required
                            defaultValue={listing.title}
                            placeholder="e.g. Sun-drenched Loft in Arts District"
                            disabled={loading}
                            data-testid="listing-title-input"
                        />
                        <FieldError field="title" />
                    </div>

                    <div>
                        <Label htmlFor="description">Description</Label>
                        <textarea
                            id="description"
                            name="description"
                            required
                            rows={5}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:bg-white dark:focus:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3.5 text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300 outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-zinc-900 dark:focus:border-zinc-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 resize-none leading-relaxed"
                            placeholder="What makes your place special? Describe the vibe, the light, and the lifestyle..."
                            disabled={loading}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            data-testid="listing-description-input"
                        />
                        <FieldError field="description" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <Label htmlFor="price">Monthly Rent ($)</Label>
                            <Input
                                id="price"
                                name="price"
                                type="number"
                                required
                                defaultValue={listing.price}
                                placeholder="2400"
                                disabled={loading}
                                data-testid="listing-price-input"
                            />
                            <FieldError field="price" />
                        </div>
                        <div>
                            <Label htmlFor="totalSlots">Total Roommates</Label>
                            <Input
                                id="totalSlots"
                                name="totalSlots"
                                type="number"
                                required
                                defaultValue={listing.totalSlots}
                                placeholder="1"
                                disabled={loading}
                            />
                            <FieldError field="totalSlots" />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

                {/* Section 2: Photos */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" /> Photos
                    </h3>

                    <div className="space-y-2">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Add photos of your space to attract potential roommates. The first image will be used as the main photo.
                        </p>
                        <ImageUploader
                            initialImages={listing.images || []}
                            onImagesChange={handleImagesChange}
                            maxImages={10}
                            uploadToCloud={true}
                        />

                        {images.length === 0 && (
                            <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
                                ⚠️ At least one photo is required for your listing
                            </p>
                        )}

                        {isAnyImageUploading && (
                            <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                                Please wait for image uploads to complete before saving...
                            </p>
                        )}
                    </div>
                </div>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

                {/* Section 3: Location */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Location
                    </h3>

                    <div>
                        <Label htmlFor="address">Street Address</Label>
                        <Input
                            id="address"
                            name="address"
                            required
                            defaultValue={listing.location?.address || ''}
                            placeholder="123 Boulevard St"
                            disabled={loading}
                        />
                        <FieldError field="address" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="city">City</Label>
                            <Input
                                id="city"
                                name="city"
                                required
                                defaultValue={listing.location?.city || ''}
                                placeholder="San Francisco"
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <Label htmlFor="state">State</Label>
                            <Input
                                id="state"
                                name="state"
                                required
                                defaultValue={listing.location?.state || ''}
                                placeholder="CA"
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <Label htmlFor="zip">Zip Code</Label>
                            <Input
                                id="zip"
                                name="zip"
                                required
                                defaultValue={listing.location?.zip || ''}
                                placeholder="94103"
                                disabled={loading}
                            />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

                {/* Section 3: Details */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                        <List className="w-4 h-4" /> Finer Details
                    </h3>

                    <div>
                        <Label htmlFor="amenities">Amenities</Label>
                        <Input
                            id="amenities"
                            name="amenities"
                            defaultValue={listing.amenities.join(', ')}
                            placeholder="Wifi, Gym, Washer/Dryer, Roof Deck..."
                            disabled={loading}
                        />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 pl-1">Separate amenities with commas</p>
                    </div>

                    <div>
                        <Label htmlFor="moveInDate">Move-In Date</Label>
                        <DatePicker
                            id="moveInDate"
                            value={moveInDate}
                            onChange={setMoveInDate}
                            placeholder="Select move-in date"
                        />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 pl-1">When can tenants move in? (Optional)</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="leaseDuration">Lease Duration</Label>
                            <Select value={leaseDuration} onValueChange={setLeaseDuration} disabled={loading}>
                                <SelectTrigger id="leaseDuration" className="w-full mt-1">
                                    <SelectValue placeholder="Select duration..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Month-to-month">Month-to-month</SelectItem>
                                    <SelectItem value="6 months">6 months</SelectItem>
                                    <SelectItem value="1 year">1 year</SelectItem>
                                    <SelectItem value="1 year+">1 year+</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="roomType">Room Type</Label>
                            <Select value={roomType} onValueChange={setRoomType} disabled={loading}>
                                <SelectTrigger id="roomType" className="w-full mt-1">
                                    <SelectValue placeholder="Select type..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Private Room">Private Room</SelectItem>
                                    <SelectItem value="Shared Room">Shared Room</SelectItem>
                                    <SelectItem value="Entire Place">Entire Place</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div>
                        <Label>Languages Spoken in the House</Label>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 mb-3">Select languages spoken by household members</p>

                        {/* Selected languages shown at top */}
                        {selectedLanguages.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-700">
                                {selectedLanguages.map((code) => (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => toggleLanguage(code)}
                                        disabled={loading}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {getLanguageName(code)}
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Search input */}
                        <Input
                            type="text"
                            placeholder="Search languages..."
                            value={languageSearch}
                            onChange={(e) => setLanguageSearch(e.target.value)}
                            className="mb-3"
                            disabled={loading}
                        />

                        {/* Language chips */}
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                            {filteredLanguages.filter(code => !selectedLanguages.includes(code)).map((code) => (
                                <button
                                    key={code}
                                    type="button"
                                    onClick={() => toggleLanguage(code)}
                                    disabled={loading}
                                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {getLanguageName(code)}
                                </button>
                            ))}
                            {filteredLanguages.filter(code => !selectedLanguages.includes(code)).length === 0 && (
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    {languageSearch ? 'No languages found' : 'All languages selected'}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="genderPreference">Gender Preference</Label>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 mb-2">Who can apply for this room?</p>
                            <Select value={genderPreference} onValueChange={setGenderPreference} disabled={loading}>
                                <SelectTrigger id="genderPreference" className="w-full">
                                    <SelectValue placeholder="Select preference..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MALE_ONLY">Male Identifying Only</SelectItem>
                                    <SelectItem value="FEMALE_ONLY">Female Identifying Only</SelectItem>
                                    <SelectItem value="NO_PREFERENCE">Any Gender / All Welcome</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="householdGender">Household Gender</Label>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 mb-2">Current household composition</p>
                            <Select value={householdGender} onValueChange={setHouseholdGender} disabled={loading}>
                                <SelectTrigger id="householdGender" className="w-full">
                                    <SelectValue placeholder="Select composition..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL_MALE">All Male</SelectItem>
                                    <SelectItem value="ALL_FEMALE">All Female</SelectItem>
                                    <SelectItem value="MIXED">Mixed (Co-ed)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="houseRules">House Rules</Label>
                        <textarea
                            id="houseRules"
                            name="houseRules"
                            rows={3}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:bg-white dark:focus:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3.5 text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300 outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-zinc-900 dark:focus:border-zinc-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 resize-none"
                            placeholder="No smoking, quiet hours after 10pm, no pets..."
                            disabled={loading}
                            defaultValue={listing.houseRules.join(', ')}
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-6 flex gap-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push(`/listings/${listing.id}`)}
                        disabled={loading}
                        size="lg"
                        className="flex-1 h-14 rounded-xl"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading || isAnyImageUploading || (images.length === 0)}
                        size="lg"
                        className="flex-1 h-14 rounded-xl shadow-xl shadow-zinc-900/10 text-lg"
                        data-testid="listing-save-button"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Updating...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </div>
            </form>
        </>
    );
}
