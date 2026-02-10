'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    User,
    MapPin,
    Save,
    X,
    Plus,
    Camera,
    CheckCircle2,
    Globe,
    Lock,
    Loader2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { updateProfile } from '@/app/actions/profile';
import { useFormPersistence, formatTimeSince } from '@/hooks/useFormPersistence';


type UserProfile = {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    bio: string | null;
    countryOfOrigin: string | null;
    languages: string[];
    isVerified: boolean;
    emailVerified: Date | null;
};

interface EditProfileClientProps {
    user: UserProfile;
}

interface ProfileFormData {
    name: string;
    bio: string;
    countryOfOrigin: string;
    languages: string[];
    imageUrl: string;
}

const COMMON_LANGUAGES = [
    'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
    'Chinese', 'Japanese', 'Korean', 'Hindi', 'Arabic', 'Russian',
    'Dutch', 'Swedish', 'Polish', 'Turkish', 'Vietnamese', 'Thai'
];

const PROFILE_FORM_STORAGE_KEY = 'profile-edit-draft';

export default function EditProfileClient({ user }: EditProfileClientProps) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [showLanguageInput, setShowLanguageInput] = useState(false);

    // Form state
    const [name, setName] = useState(user.name || '');
    const [bio, setBio] = useState(user.bio || '');
    const [countryOfOrigin, setCountryOfOrigin] = useState(user.countryOfOrigin || '');
    const [languages, setLanguages] = useState<string[]>(user.languages || []);
    const [imageUrl, setImageUrl] = useState(user.image || '');
    const [newLanguage, setNewLanguage] = useState('');

    // Handle file upload
    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setIsUploading(true);
        setError(null);

        try {
            const file = files[0];
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'profile');

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            setImageUrl(data.url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
            // Reset input so same file can be selected again
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Form persistence
    const {
        savedAt,
        saveData,
        clearPersistedData,
        isHydrated
    } = useFormPersistence<ProfileFormData>({ key: PROFILE_FORM_STORAGE_KEY });

    // Auto-save when form changes
    useEffect(() => {
        if (!isHydrated || success) return;
        saveData({ name, bio, countryOfOrigin, languages, imageUrl });
    }, [name, bio, countryOfOrigin, languages, imageUrl, isHydrated, success, saveData]);


    const handleAddLanguage = (lang: string) => {
        if (lang && !languages.includes(lang)) {
            setLanguages([...languages, lang]);
            setNewLanguage('');
        }
    };

    const handleRemoveLanguage = (lang: string) => {
        setLanguages(languages.filter(l => l !== lang));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const result = await updateProfile({
                name,
                bio: bio || null,
                countryOfOrigin: countryOfOrigin || null,
                languages,
                image: imageUrl || null,
            });

            if (result.error) {
                setError(result.error);
            } else {
                setSuccess(true);
                clearPersistedData(); // Clear draft on successful save
                setTimeout(() => {
                    router.push('/profile');
                }, 1500);
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-24 pb-20">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/profile"
                        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors mb-4 group"
                    >
                        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                        Back to Profile
                    </Link>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Edit Profile</h1>
                            <p className="text-zinc-500 dark:text-zinc-400 mt-2">Update your photo and personal details.</p>
                        </div>
                        {savedAt && !isLoading && !success && (
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-xs font-medium border border-green-100 dark:border-green-900/30">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Saved automatically
                            </div>
                        )}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Section: Profile Photo */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 md:p-8 shadow-sm border border-zinc-200 dark:border-zinc-800">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            <div className="relative group">
                                <div className="w-28 h-28 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 ring-4 ring-zinc-50 dark:ring-zinc-900 border border-zinc-200 dark:border-zinc-700">
                                    {(imageUrl || user.image) ? (
                                        <img
                                            src={imageUrl || user.image || ''}
                                            alt="Profile"
                                            className="w-full h-full object-cover transition-opacity group-hover:opacity-75"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-3xl font-medium">
                                            {(name || user.name || 'U').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-full cursor-pointer disabled:cursor-wait"
                                >
                                    {isUploading ? (
                                        <Loader2 className="w-8 h-8 text-white drop-shadow-md animate-spin" />
                                    ) : (
                                        <Camera className="w-8 h-8 text-white drop-shadow-md" />
                                    )}
                                </button>
                            </div>
                            <div className="flex-1 space-y-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Profile Photo</h2>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Accepts JPG, PNG or WEBP. Max size of 5MB.</p>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {/* Hidden file input */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        onChange={(e) => handleFileUpload(e.target.files)}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-full transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {isUploading ? 'Uploading...' : 'Upload New'}
                                    </button>
                                    {imageUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setImageUrl('')}
                                            disabled={isUploading}
                                            className="px-4 py-2 bg-white dark:bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-full transition-colors disabled:opacity-60"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Personal Information */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 md:p-8 shadow-sm border border-zinc-200 dark:border-zinc-800 space-y-6">
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                            <User className="w-5 h-5 text-zinc-400" />
                            Personal Information
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="fullName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Full Name</Label>
                                <Input
                                    type="text"
                                    id="fullName"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your full name"
                                    required
                                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white/20 focus:bg-white dark:focus:bg-zinc-800 transition-all placeholder:text-zinc-600 dark:placeholder:text-zinc-300"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email Address</Label>
                                <div className="relative flex items-center">
                                    <Input
                                        type="email"
                                        id="email"
                                        value={user.email || ''}
                                        disabled
                                        className="w-full px-4 py-2.5 pr-11 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                                    />
                                    <Lock className="absolute right-4 w-4 h-4 text-zinc-400 pointer-events-none" />
                                </div>
                                <p className="text-xs text-zinc-400">Contact support to change email.</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="bio" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Bio</Label>
                            <Textarea
                                id="bio"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Tell others a bit about yourself..."
                                rows={4}
                                maxLength={500}
                                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white/20 focus:bg-white dark:focus:bg-zinc-800 transition-all placeholder:text-zinc-600 dark:placeholder:text-zinc-300 resize-none"
                            />
                            <div className="flex justify-end">
                                <span className="text-xs text-zinc-400">{bio.length}/500 characters</span>
                            </div>
                        </div>
                    </div>

                    {/* Section: Details & Preferences */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 md:p-8 shadow-sm border border-zinc-200 dark:border-zinc-800 space-y-6">
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-zinc-400" />
                            Details & Preferences
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="location" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Location</Label>
                                <div className="relative flex items-center">
                                    <Globe className="absolute left-4 w-4 h-4 text-zinc-400 pointer-events-none z-10" />
                                    <Input
                                        type="text"
                                        id="location"
                                        value={countryOfOrigin}
                                        onChange={(e) => setCountryOfOrigin(e.target.value)}
                                        placeholder="e.g., United States"
                                        className="w-full !pl-11 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white/20 focus:bg-white dark:focus:bg-zinc-800 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Languages</Label>
                                <div className="flex flex-wrap gap-2 p-1">
                                    {/* Language Tags */}
                                    {languages.map((lang) => (
                                        <div
                                            key={lang}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full text-sm border border-zinc-200 dark:border-zinc-700 group"
                                        >
                                            <span>{lang}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveLanguage(lang)}
                                                className="text-zinc-400 hover:text-red-500 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add Language Input or Button */}
                                    {showLanguageInput ? (
                                        <div className="inline-flex items-center gap-1">
                                            <input
                                                type="text"
                                                value={newLanguage}
                                                onChange={(e) => setNewLanguage(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddLanguage(newLanguage);
                                                        setShowLanguageInput(false);
                                                    }
                                                    if (e.key === 'Escape') {
                                                        setShowLanguageInput(false);
                                                        setNewLanguage('');
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (newLanguage) {
                                                        handleAddLanguage(newLanguage);
                                                    }
                                                    setShowLanguageInput(false);
                                                }}
                                                placeholder="Type language..."
                                                aria-label="Add a language"
                                                className="w-24 px-2 py-1 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                                                autoFocus
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setShowLanguageInput(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-transparent text-zinc-500 dark:text-zinc-400 rounded-full text-sm border border-dashed border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-all"
                                        >
                                            <Plus className="w-3 h-3" />
                                            Add
                                        </button>
                                    )}
                                </div>

                                {/* Common Languages - show when no languages selected */}
                                {languages.length === 0 && (
                                    <div className="pt-2">
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">Suggestions:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {COMMON_LANGUAGES.slice(0, 6).map((lang) => (
                                                <button
                                                    key={lang}
                                                    type="button"
                                                    onClick={() => handleAddLanguage(lang)}
                                                    className="px-2 py-0.5 text-xs border border-zinc-200 dark:border-zinc-700 dark:text-zinc-400 rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                                >
                                                    {lang}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Error/Success Messages */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl">
                            Profile updated successfully! Redirecting...
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-4 pt-4">
                        <Link href="/profile" className="w-full sm:w-auto">
                            <button
                                type="button"
                                className="w-full sm:w-auto px-6 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium transition-all text-sm"
                            >
                                Cancel
                            </button>
                        </Link>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full sm:w-auto px-8 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-medium transition-all shadow-lg shadow-zinc-900/20 dark:shadow-white/10 active:scale-[0.98] text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4" />
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
