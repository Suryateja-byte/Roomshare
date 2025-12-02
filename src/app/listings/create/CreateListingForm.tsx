'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Home, MapPin, List, Camera } from 'lucide-react';
import ImageUploader from '@/components/listings/ImageUploader';

interface ImageObject {
    id: string;
    previewUrl: string;
    uploadedUrl?: string;
    isUploading?: boolean;
    error?: string;
}

export default function CreateListingForm() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [uploadedImages, setUploadedImages] = useState<ImageObject[]>([]);
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

    // Form field states for premium components
    const [moveInDate, setMoveInDate] = useState('');
    const [leaseDuration, setLeaseDuration] = useState('');
    const [roomType, setRoomType] = useState('');
    const [genderPreference, setGenderPreference] = useState('');
    const [householdGender, setHouseholdGender] = useState('');

    const LANGUAGES = [
        'English', 'Spanish', 'Mandarin', 'Hindi', 'French',
        'Arabic', 'Portuguese', 'Russian', 'Japanese', 'German'
    ];

    const toggleLanguage = (lang: string) => {
        setSelectedLanguages(prev =>
            prev.includes(lang)
                ? prev.filter(l => l !== lang)
                : [...prev, lang]
        );
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Check if any images are still uploading
        const stillUploading = uploadedImages.some(img => img.isUploading);
        if (stillUploading) {
            setError('Please wait for all images to finish uploading');
            setLoading(false);
            return;
        }

        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());

        // Get uploaded URLs (filter out any that failed to upload)
        const imageUrls = uploadedImages
            .filter(img => img.uploadedUrl && !img.error)
            .map(img => img.uploadedUrl as string);

        try {
            const res = await fetch('/api/listings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...data,
                    images: imageUrls,
                    languages: selectedLanguages,
                    moveInDate: moveInDate || undefined,
                    leaseDuration: leaseDuration || undefined,
                    roomType: roomType || undefined,
                    genderPreference: genderPreference || undefined,
                    householdGender: householdGender || undefined,
                }),
            });

            if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error || 'Failed to create listing');
            }

            const result = await res.json();
            router.push(`/listings/${result.id}`);
        } catch (err: any) {
            setError(err.message);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setLoading(false);
        }
    };

    const isAnyUploading = uploadedImages.some(img => img.isUploading);

    return (
        <>
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-4 rounded-xl mb-8 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-12">
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
                            placeholder="e.g. Sun-drenched Loft in Arts District"
                            disabled={loading}
                        />
                    </div>

                    <div>
                        <Label htmlFor="description">Description</Label>
                        <textarea
                            id="description"
                            name="description"
                            required
                            rows={5}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:bg-white dark:focus:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 sm:py-3.5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-zinc-900 dark:focus:border-zinc-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 resize-none leading-relaxed"
                            placeholder="What makes your place special? Describe the vibe, the light, and the lifestyle..."
                            disabled={loading}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="price">Monthly Rent ($)</Label>
                            <Input
                                id="price"
                                name="price"
                                type="number"
                                required
                                placeholder="2400"
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <Label htmlFor="totalSlots">Total Roommates</Label>
                            <Input
                                id="totalSlots"
                                name="totalSlots"
                                type="number"
                                required
                                placeholder="1"
                                defaultValue="1"
                                disabled={loading}
                            />
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
                            placeholder="123 Boulevard St"
                            disabled={loading}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4">
                        <div>
                            <Label htmlFor="city">City</Label>
                            <Input
                                id="city"
                                name="city"
                                required
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
                                placeholder="94103"
                                disabled={loading}
                            />
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
                            Add photos to showcase your space (optional but recommended)
                        </p>
                        <ImageUploader onImagesChange={setUploadedImages} />
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
                        />
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
                        <Label>Languages Spoken</Label>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 mb-3">Select languages spoken in the household</p>
                        <div className="flex flex-wrap gap-2">
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => toggleLanguage(lang)}
                                    disabled={loading}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                                        selectedLanguages.includes(lang)
                                            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                    {lang}
                                </button>
                            ))}
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
                        />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">Separate rules with commas</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-6">
                    <Button
                        type="submit"
                        disabled={loading || isAnyUploading}
                        size="lg"
                        className="w-full h-12 sm:h-14 rounded-xl shadow-xl shadow-zinc-900/10 text-base sm:text-lg"
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
                        ) : (
                            'Publish Listing'
                        )}
                    </Button>
                    <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-4">
                        By publishing, you agree to our Terms of Service and Community Guidelines.
                    </p>
                </div>
            </form>
        </>
    );
}
