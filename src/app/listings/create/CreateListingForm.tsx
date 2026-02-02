'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SUPPORTED_LANGUAGES, getLanguageName, type LanguageCode } from '@/lib/languages';
import { DatePicker } from '@/components/ui/date-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Home, MapPin, List, Camera, FileText, X, AlertTriangle, CheckCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import ImageUploader from '@/components/listings/ImageUploader';
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
import CharacterCounter from '@/components/CharacterCounter';

interface ImageObject {
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

interface ListingFormData {
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

const FORM_STORAGE_KEY = 'listing-draft';

export default function CreateListingForm() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [uploadedImages, setUploadedImages] = useState<ImageObject[]>([]);
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
    const [showDraftBanner, setShowDraftBanner] = useState(false);
    const [draftRestored, setDraftRestored] = useState(false);
    const [showPartialUploadDialog, setShowPartialUploadDialog] = useState(false);
    const [pendingSubmit, setPendingSubmit] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

    // Form field states for premium components
    const [description, setDescription] = useState('');
    const [moveInDate, setMoveInDate] = useState('');
    const [leaseDuration, setLeaseDuration] = useState('');
    const [roomType, setRoomType] = useState('');
    const [genderPreference, setGenderPreference] = useState('');
    const [householdGender, setHouseholdGender] = useState('');

    // Form field states for tracking completion
    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [totalSlots, setTotalSlots] = useState('1');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [zip, setZip] = useState('');

    const DESCRIPTION_MAX_LENGTH = 1000;

    // Form persistence hook
    const {
        persistedData,
        hasDraft,
        savedAt,
        saveData,
        clearPersistedData,
        isHydrated
    } = useFormPersistence<ListingFormData>({ key: FORM_STORAGE_KEY });

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

    // Warn user when navigating away during active submission or with unsaved form data
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Warn if submitting
            if (loading) {
                e.preventDefault();
                e.returnValue = 'Your listing is still being created. Are you sure you want to leave?';
                return e.returnValue;
            }

            // Warn if there are uploaded images (significant data loss potential)
            if (uploadedImages.some(img => img.uploadedUrl)) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Your uploaded images will be lost if you leave.';
                return e.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [loading, uploadedImages]);

    // Show draft banner when we have a draft and haven't restored yet
    useEffect(() => {
        if (isHydrated && hasDraft && !draftRestored) {
            setShowDraftBanner(true);
        }
    }, [isHydrated, hasDraft, draftRestored]);

    // Restore draft data to form
    const restoreDraft = () => {
        if (!persistedData) return;

        // Restore controlled component states
        setTitle(persistedData.title || '');
        setDescription(persistedData.description || '');
        setPrice(persistedData.price || '');
        setTotalSlots(persistedData.totalSlots || '1');
        setAddress(persistedData.address || '');
        setCity(persistedData.city || '');
        setState(persistedData.state || '');
        setZip(persistedData.zip || '');
        setMoveInDate(persistedData.moveInDate || '');
        setLeaseDuration(persistedData.leaseDuration || '');
        setRoomType(persistedData.roomType || '');
        setGenderPreference(persistedData.genderPreference || '');
        setHouseholdGender(persistedData.householdGender || '');
        setSelectedLanguages(persistedData.selectedLanguages || []);

        // Restore images (they're already uploaded to Supabase)
        if (persistedData.images && persistedData.images.length > 0) {
            const restoredImages: ImageObject[] = persistedData.images.map(img => ({
                id: img.id,
                previewUrl: img.uploadedUrl, // Use the uploaded URL as preview
                uploadedUrl: img.uploadedUrl,
                isUploading: false
            }));
            setUploadedImages(restoredImages);
        }

        setDraftRestored(true);
        setShowDraftBanner(false);
    };

    // Discard draft and start fresh
    const discardDraft = () => {
        clearPersistedData();
        setShowDraftBanner(false);
        setDraftRestored(true);
    };

    // Collect current form data for saving
    const collectFormData = (): ListingFormData => {
        const form = formRef.current;

        return {
            title,
            description,
            price,
            totalSlots,
            address,
            city,
            state,
            zip,
            amenities: form ? (form.elements.namedItem('amenities') as HTMLInputElement)?.value || '' : '',
            houseRules: form ? (form.elements.namedItem('houseRules') as HTMLInputElement)?.value || '' : '',
            moveInDate,
            leaseDuration,
            roomType,
            genderPreference,
            householdGender,
            selectedLanguages,
            images: uploadedImages
                .filter(img => img.uploadedUrl && !img.error)
                .map(img => ({ id: img.id, uploadedUrl: img.uploadedUrl! }))
        };
    };

    // Auto-save form data on changes
    const handleFormChange = () => {
        if (!isHydrated) return;
        const formData = collectFormData();
        saveData(formData);
    };

    // Save when controlled states change
    useEffect(() => {
        if (!isHydrated || !draftRestored && hasDraft) return;
        handleFormChange();
    }, [title, description, price, totalSlots, address, city, state, zip, moveInDate, leaseDuration, roomType, genderPreference, householdGender, selectedLanguages, uploadedImages]);

    const toggleLanguage = (lang: string) => {
        setSelectedLanguages(prev =>
            prev.includes(lang)
                ? prev.filter(l => l !== lang)
                : [...prev, lang]
        );
    };

    // Calculate image counts
    const successfulImages = uploadedImages.filter(img => img.uploadedUrl && !img.error);
    const failedImages = uploadedImages.filter(img => img.error);
    const stillUploading = uploadedImages.some(img => img.isUploading);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, forceSubmit = false) => {
        e.preventDefault();
        setError('');
        setFieldErrors({});

        // Check if any images are still uploading
        if (stillUploading) {
            setError('Please wait for all images to finish uploading');
            return;
        }

        // Require at least 1 successful image
        if (successfulImages.length === 0) {
            setError('At least one photo is required to publish your listing');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // If some images failed but we have at least 1 success, show confirmation
        if (failedImages.length > 0 && !forceSubmit) {
            setShowPartialUploadDialog(true);
            return;
        }

        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());

        // Get uploaded URLs (filter out any that failed to upload)
        const imageUrls = successfulImages.map(img => img.uploadedUrl as string);

        try {
            const res = await fetch('/api/listings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...data,
                    images: imageUrls,
                    householdLanguages: selectedLanguages,
                    moveInDate: moveInDate || undefined,
                    leaseDuration: leaseDuration || undefined,
                    roomType: roomType || undefined,
                    genderPreference: genderPreference || undefined,
                    householdGender: householdGender || undefined,
                }),
            });

            if (!res.ok) {
                const json = await res.json();
                if (json.fields) {
                    setFieldErrors(json.fields);
                }
                throw new Error(json.error || 'Failed to create listing');
            }

            const result = await res.json();
            // Clear draft on successful submission
            clearPersistedData();
            // Show success toast
            toast.success('Listing published successfully!', {
                description: 'Your listing is now live and visible to potential roommates.'
            });
            router.push(`/listings/${result.id}`);
        } catch (err: any) {
            setError(err.message);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setLoading(false);
        }
    };

    // Handle confirmation to submit with partial images
    const handleConfirmPartialSubmit = () => {
        setShowPartialUploadDialog(false);
        if (formRef.current) {
            // Create a synthetic event and call handleSubmit with forceSubmit=true
            const syntheticEvent = {
                preventDefault: () => { },
                currentTarget: formRef.current
            } as React.FormEvent<HTMLFormElement>;
            handleSubmit(syntheticEvent, true);
        }
    };

    const isAnyUploading = uploadedImages.some(img => img.isUploading);

    // Helper component for field-level errors
    const FieldError = ({ field }: { field: string }) => {
        if (!fieldErrors[field]) return null;
        return (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1">
                {fieldErrors[field]}
            </p>
        );
    };

    // Form sections for progress indicator with completion tracking
    const sectionCompletion = {
        basics: title.trim() !== '' && description.trim().length >= 10 && price.trim() !== '' && totalSlots.trim() !== '',
        location: address.trim() !== '' && city.trim() !== '' && state.trim() !== '' && zip.trim() !== '',
        photos: successfulImages.length > 0,
        details: true, // Details section is optional, always considered complete
    };

    const FORM_SECTIONS = [
        { id: 'basics', label: 'The Basics', icon: Home },
        { id: 'location', label: 'Location', icon: MapPin },
        { id: 'photos', label: 'Photos', icon: Camera },
        { id: 'details', label: 'Finer Details', icon: List },
    ];

    return (
        <>
            {/* Step Progress Indicator */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    {FORM_SECTIONS.map((section, index) => {
                        const Icon = section.icon;
                        const isComplete = sectionCompletion[section.id as keyof typeof sectionCompletion];
                        return (
                            <div key={section.id} className="flex items-center flex-1">
                                {/* Step Circle */}
                                <div className="flex flex-col items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isComplete
                                        ? 'bg-green-50 dark:bg-green-900/30 border-green-500 dark:border-green-400'
                                        : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
                                        }`}>
                                        {isComplete ? (
                                            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                                        ) : (
                                            <Icon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                                        )}
                                    </div>
                                    <span className={`text-xs font-medium mt-2 text-center hidden sm:block transition-colors duration-300 ${isComplete ? 'text-green-600 dark:text-green-400' : 'text-zinc-600 dark:text-zinc-400'
                                        }`}>
                                        {section.label}
                                    </span>
                                    <span className={`text-xs font-medium mt-2 text-center sm:hidden transition-colors duration-300 ${isComplete ? 'text-green-600 dark:text-green-400' : 'text-zinc-600 dark:text-zinc-400'
                                        }`}>
                                        {index + 1}
                                    </span>
                                </div>
                                {/* Connector Line */}
                                {index < FORM_SECTIONS.length - 1 && (
                                    <div className={`flex-1 h-0.5 mx-2 sm:mx-4 transition-colors duration-300 ${isComplete && sectionCompletion[FORM_SECTIONS[index + 1].id as keyof typeof sectionCompletion]
                                        ? 'bg-green-500 dark:bg-green-400'
                                        : 'bg-zinc-200 dark:bg-zinc-700'
                                        }`} />
                                )}
                            </div>
                        );
                    })}
                </div>
                <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-4">
                    {Object.values(sectionCompletion).filter(Boolean).length === 4
                        ? '✓ All sections complete! Ready to publish.'
                        : `Fill out all sections below to publish your listing (${Object.values(sectionCompletion).filter(Boolean).length}/4 complete)`
                    }
                </p>
            </div>

            {/* Draft Resume Banner */}
            {showDraftBanner && savedAt && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-4 py-4 rounded-xl mb-8 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                You have an unsaved draft
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
                            Start Fresh
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={restoreDraft}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Resume Draft
                        </Button>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-4 rounded-xl mb-8 text-sm">
                    {error}
                </div>
            )}

            {/* Auto-save status indicator */}
            {!showDraftBanner && savedAt && !loading && (
                <div className="flex items-center justify-end gap-2 mb-4 text-xs text-zinc-500 dark:text-zinc-400 animate-in fade-in duration-300">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    <span>Draft saved {formatTimeSince(savedAt)}</span>
                </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} onChange={handleFormChange} className="space-y-12">
                {/* Section 1: The Basics */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Home className="w-4 h-4 flex-shrink-0" /> The Basics
                    </h3>

                    <div>
                        <Label htmlFor="title">Listing Title</Label>
                        <Input
                            id="title"
                            name="title"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Sun-drenched Loft in Arts District"
                            disabled={loading}
                            className={fieldErrors.title ? 'border-red-500 dark:border-red-500' : ''}
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
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={DESCRIPTION_MAX_LENGTH}
                            className={`w-full bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:bg-white dark:focus:bg-zinc-800 border rounded-xl px-4 py-3 sm:py-3.5 text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300 outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-zinc-900 dark:focus:border-zinc-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 resize-none leading-relaxed ${fieldErrors.description ? 'border-red-500 dark:border-red-500' : 'border-zinc-200 dark:border-zinc-700'}`}
                            placeholder="What makes your place special? Describe the vibe, the light, and the lifestyle..."
                            disabled={loading}
                        />
                        <div className="flex items-center justify-between mt-1">
                            <FieldError field="description" />
                            <CharacterCounter current={description.length} max={DESCRIPTION_MAX_LENGTH} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="price">Monthly Rent ($)</Label>
                            <Input
                                id="price"
                                name="price"
                                type="number"
                                required
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="2400"
                                disabled={loading}
                                className={fieldErrors.price ? 'border-red-500 dark:border-red-500' : ''}
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
                                value={totalSlots}
                                onChange={(e) => setTotalSlots(e.target.value)}
                                placeholder="1"
                                disabled={loading}
                                className={fieldErrors.totalSlots ? 'border-red-500 dark:border-red-500' : ''}
                            />
                            <FieldError field="totalSlots" />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

                {/* Section 2: Location */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        <MapPin className="w-4 h-4 flex-shrink-0" /> Location
                    </h3>

                    <div>
                        <Label htmlFor="address">Street Address</Label>
                        <Input
                            id="address"
                            name="address"
                            required
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="123 Boulevard St"
                            disabled={loading}
                            className={fieldErrors.address ? 'border-red-500 dark:border-red-500' : ''}
                        />
                        <FieldError field="address" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4">
                        <div>
                            <Label htmlFor="city">City</Label>
                            <Input
                                id="city"
                                name="city"
                                required
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="San Francisco"
                                disabled={loading}
                                className={fieldErrors.city ? 'border-red-500 dark:border-red-500' : ''}
                            />
                            <FieldError field="city" />
                        </div>
                        <div>
                            <Label htmlFor="state">State</Label>
                            <Input
                                id="state"
                                name="state"
                                required
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                placeholder="CA"
                                disabled={loading}
                                className={fieldErrors.state ? 'border-red-500 dark:border-red-500' : ''}
                            />
                            <FieldError field="state" />
                        </div>
                        <div>
                            <Label htmlFor="zip">Zip Code</Label>
                            <Input
                                id="zip"
                                name="zip"
                                required
                                value={zip}
                                onChange={(e) => setZip(e.target.value)}
                                placeholder="94103"
                                disabled={loading}
                                className={fieldErrors.zip ? 'border-red-500 dark:border-red-500' : ''}
                            />
                            <FieldError field="zip" />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

                {/* Section 2.5: Photos */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Camera className="w-4 h-4 flex-shrink-0" /> Photos
                    </h3>
                    <div>
                        <Label>Upload Photos</Label>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 mb-4">
                            At least one photo required to publish your listing
                        </p>
                        <ImageUploader
                            onImagesChange={setUploadedImages}
                            initialImages={uploadedImages.filter(img => img.uploadedUrl).map(img => img.uploadedUrl!)}
                            key={draftRestored ? 'restored' : 'initial'}
                        />
                    </div>
                </div>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

                {/* Section 3: Details */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        <List className="w-4 h-4 flex-shrink-0" /> Finer Details
                    </h3>

                    <div>
                        <Label htmlFor="amenities">Amenities</Label>
                        <Input
                            id="amenities"
                            name="amenities"
                            placeholder="Wifi, Gym, Washer/Dryer, Roof Deck..."
                            disabled={loading}
                            className={fieldErrors.amenities ? 'border-red-500 dark:border-red-500' : ''}
                        />
                        <FieldError field="amenities" />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">Separate amenities with commas</p>
                    </div>

                    <div>
                        <Label htmlFor="moveInDate">Move-In Date</Label>
                        <DatePicker
                            id="moveInDate"
                            value={moveInDate}
                            onChange={setMoveInDate}
                            placeholder="Select move-in date"
                            minDate={new Date().toISOString().split('T')[0]}
                        />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">When can tenants move in? (Optional)</p>
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
                        <Input
                            id="houseRules"
                            name="houseRules"
                            placeholder="No smoking, quiet hours after 10pm, no pets..."
                            disabled={loading}
                            className={fieldErrors.houseRules ? 'border-red-500 dark:border-red-500' : ''}
                        />
                        <FieldError field="houseRules" />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">Separate rules with commas</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-6">
                    <Button
                        type="submit"
                        disabled={loading || isAnyUploading}
                        size="lg"
                        className="w-full rounded-xl shadow-xl shadow-zinc-900/10"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Publishing...
                            </>
                        ) : isAnyUploading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Uploading Images...
                            </>
                        ) : successfulImages.length > 0 ? (
                            `Publish with ${successfulImages.length} Photo${successfulImages.length !== 1 ? 's' : ''}`
                        ) : (
                            'Publish Listing'
                        )}
                    </Button>
                    <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-4">
                        By publishing, you agree to our Terms of Service and Community Guidelines.
                    </p>
                </div>
            </form>

            {/* Partial Upload Confirmation Dialog */}
            <AlertDialog open={showPartialUploadDialog} onOpenChange={setShowPartialUploadDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            Some Images Failed to Upload
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {failedImages.length} of {uploadedImages.length} image{uploadedImages.length !== 1 ? 's' : ''} failed to upload.
                            You can still publish your listing with {successfulImages.length} photo{successfulImages.length !== 1 ? 's' : ''},
                            or go back to retry the failed uploads.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Go Back to Fix</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmPartialSubmit}>
                            Publish with {successfulImages.length} Photo{successfulImages.length !== 1 ? 's' : ''}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
