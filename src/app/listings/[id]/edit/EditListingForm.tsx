'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Home, MapPin, List, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Listing {
    id: string;
    title: string;
    description: string;
    price: number;
    amenities: string[];
    houseRules: string[];
    languages: string[];
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
}

interface EditListingFormProps {
    listing: Listing;
}

export default function EditListingForm({ listing }: EditListingFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>(listing.languages || []);

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
                    languages: selectedLanguages,
                }),
            });

            if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error || 'Failed to update listing');
            }

            // Redirect to listing page on success
            router.push(`/listings/${listing.id}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setLoading(false);
        }
    };

    // Format date for input (YYYY-MM-DD)
    const formatDateForInput = (date: Date | null) => {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return (
        <>
            <Link
                href={`/listings/${listing.id}`}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to listing
            </Link>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-4 rounded-xl mb-8 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-12">
                {/* Section 1: The Basics */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
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
                        />
                    </div>

                    <div>
                        <Label htmlFor="description">Description</Label>
                        <textarea
                            id="description"
                            name="description"
                            required
                            rows={5}
                            className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 resize-none leading-relaxed"
                            placeholder="What makes your place special? Describe the vibe, the light, and the lifestyle..."
                            disabled={loading}
                            defaultValue={listing.description}
                        />
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
                            />
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
                        </div>
                    </div>
                </div>

                <div className="h-px bg-zinc-100 w-full"></div>

                {/* Section 2: Location */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
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

                <div className="h-px bg-zinc-100 w-full"></div>

                {/* Section 3: Details */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
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
                        <p className="text-xs text-zinc-400 mt-2 pl-1">Separate amenities with commas</p>
                    </div>

                    <div>
                        <Label htmlFor="moveInDate">Move-In Date</Label>
                        <Input
                            id="moveInDate"
                            name="moveInDate"
                            type="date"
                            defaultValue={formatDateForInput(listing.moveInDate)}
                            disabled={loading}
                        />
                        <p className="text-xs text-zinc-400 mt-2 pl-1">When can tenants move in? (Optional)</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="leaseDuration">Lease Duration</Label>
                            <select
                                id="leaseDuration"
                                name="leaseDuration"
                                defaultValue={listing.leaseDuration || ''}
                                className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                                defaultValue={listing.roomType || ''}
                                className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                                defaultValue={listing.genderPreference || ''}
                                className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                                defaultValue={listing.householdGender || ''}
                                className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                        <textarea
                            id="houseRules"
                            name="houseRules"
                            rows={3}
                            className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-black/5 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
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
                        className="flex-1"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading}
                        size="lg"
                        className="flex-1 h-14 rounded-xl shadow-xl shadow-zinc-900/10 text-lg"
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
