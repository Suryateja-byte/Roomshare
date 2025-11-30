'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
                <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-4 rounded-xl mb-8 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-12">
                {/* Section 1: The Basics */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
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
                            className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3 sm:py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 resize-none leading-relaxed"
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

                <div className="h-px bg-zinc-100 w-full"></div>

                {/* Section 2: Location */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
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

                <div className="h-px bg-zinc-100 w-full"></div>

                {/* Section 2.5: Photos */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                        <Camera className="w-4 h-4 flex-shrink-0" /> Photos
                    </h3>
                    <div>
                        <Label>Upload Photos</Label>
                        <p className="text-xs text-zinc-400 mt-1 mb-4">
                            Add photos to showcase your space (optional but recommended)
                        </p>
                        <ImageUploader onImagesChange={setUploadedImages} />
                    </div>
                </div>

                <div className="h-px bg-zinc-100 w-full"></div>

                {/* Section 3: Details */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
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
                        <p className="text-xs text-zinc-400 mt-2">Separate amenities with commas</p>
                    </div>

                    <div>
                        <Label htmlFor="moveInDate">Move-In Date</Label>
                        <Input
                            id="moveInDate"
                            name="moveInDate"
                            type="date"
                            disabled={loading}
                        />
                        <p className="text-xs text-zinc-400 mt-2">When can tenants move in? (Optional)</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="leaseDuration">Lease Duration</Label>
                            <select
                                id="leaseDuration"
                                name="leaseDuration"
                                className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3 sm:py-3.5 text-zinc-900 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={loading}
                            >
                                <option value="">Select duration...</option>
                                <option value="Month-to-month">Month-to-month</option>
                                <option value="6 months">6 months</option>
                                <option value="1 year">1 year</option>
                                <option value="1 year+">1 year+</option>
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="roomType">Room Type</Label>
                            <select
                                id="roomType"
                                name="roomType"
                                className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3 sm:py-3.5 text-zinc-900 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={loading}
                            >
                                <option value="">Select type...</option>
                                <option value="Private Room">Private Room</option>
                                <option value="Shared Room">Shared Room</option>
                                <option value="Entire Place">Entire Place</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <Label>Languages Spoken</Label>
                        <p className="text-xs text-zinc-400 mt-1 mb-3">Select languages spoken in the household</p>
                        <div className="flex flex-wrap gap-2">
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => toggleLanguage(lang)}
                                    disabled={loading}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                                        selectedLanguages.includes(lang)
                                            ? 'bg-zinc-900 text-white'
                                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
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
                            <p className="text-xs text-zinc-400 mt-1 mb-2">Who can apply for this room?</p>
                            <select
                                id="genderPreference"
                                name="genderPreference"
                                className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3 sm:py-3.5 text-zinc-900 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={loading}
                            >
                                <option value="">Select preference...</option>
                                <option value="MALE_ONLY">Male Identifying Only</option>
                                <option value="FEMALE_ONLY">Female Identifying Only</option>
                                <option value="NO_PREFERENCE">Any Gender / All Welcome</option>
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="householdGender">Household Gender</Label>
                            <p className="text-xs text-zinc-400 mt-1 mb-2">Current household composition</p>
                            <select
                                id="householdGender"
                                name="householdGender"
                                className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3 sm:py-3.5 text-zinc-900 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={loading}
                            >
                                <option value="">Select composition...</option>
                                <option value="ALL_MALE">All Male</option>
                                <option value="ALL_FEMALE">All Female</option>
                                <option value="MIXED">Mixed (Co-ed)</option>
                            </select>
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
                        <p className="text-xs text-zinc-400 mt-2">Separate rules with commas</p>
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
                    <p className="text-center text-xs text-zinc-400 mt-4">
                        By publishing, you agree to our Terms of Service and Community Guidelines.
                    </p>
                </div>
            </form>
        </>
    );
}
