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
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>(listing.languages || []);

    // Form field states for premium components
    const [moveInDate, setMoveInDate] = useState(formatDateForInput(listing.moveInDate));
    const [leaseDuration, setLeaseDuration] = useState(listing.leaseDuration || '');
    const [roomType, setRoomType] = useState(listing.roomType || '');
    const [genderPreference, setGenderPreference] = useState(listing.genderPreference || '');
    const [householdGender, setHouseholdGender] = useState(listing.householdGender || '');

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
                    moveInDate: moveInDate || undefined,
                    leaseDuration: leaseDuration || undefined,
                    roomType: roomType || undefined,
                    genderPreference: genderPreference || undefined,
                    householdGender: householdGender || undefined,
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
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-4 rounded-xl mb-8 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-12">
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
                        />
                    </div>

                    <div>
                        <Label htmlFor="description">Description</Label>
                        <textarea
                            id="description"
                            name="description"
                            required
                            rows={5}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:bg-white dark:focus:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3.5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-zinc-900 dark:focus:border-zinc-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 resize-none leading-relaxed"
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

                <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

                {/* Section 2: Location */}
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
                        <textarea
                            id="houseRules"
                            name="houseRules"
                            rows={3}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:bg-white dark:focus:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3.5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 focus:border-zinc-900 dark:focus:border-zinc-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
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
