'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    User,
    MapPin,
    Languages,
    FileText,
    Save,
    X,
    Plus,
    Camera
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import UserAvatar from '@/components/UserAvatar';
import ImageUpload from '@/components/ImageUpload';
import { updateProfile } from '@/app/actions/profile';

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

const COMMON_LANGUAGES = [
    'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
    'Chinese', 'Japanese', 'Korean', 'Hindi', 'Arabic', 'Russian',
    'Dutch', 'Swedish', 'Polish', 'Turkish', 'Vietnamese', 'Thai'
];

export default function EditProfileClient({ user }: EditProfileClientProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Form state
    const [name, setName] = useState(user.name || '');
    const [bio, setBio] = useState(user.bio || '');
    const [countryOfOrigin, setCountryOfOrigin] = useState(user.countryOfOrigin || '');
    const [languages, setLanguages] = useState<string[]>(user.languages || []);
    const [imageUrl, setImageUrl] = useState(user.image || '');
    const [newLanguage, setNewLanguage] = useState('');

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
        <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 pt-20 pb-20">
            <div className="container mx-auto max-w-2xl px-6 py-10">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/profile"
                        className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Profile
                    </Link>
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Edit Profile</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-2">Update your personal information</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Profile Photo */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800">
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                            <Camera className="w-5 h-5" />
                            Profile Photo
                        </h2>
                        <div className="flex flex-col md:flex-row items-start gap-6">
                            <div className="relative shrink-0">
                                <UserAvatar
                                    image={imageUrl || user.image}
                                    name={name || user.name}
                                    className="w-24 h-24"
                                />
                            </div>
                            <div className="flex-1 w-full">
                                <ImageUpload
                                    value={imageUrl}
                                    onChange={(url) => setImageUrl(url as string)}
                                    type="profile"
                                    multiple={false}
                                />
                                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                    <Label htmlFor="imageUrl" className="text-sm text-zinc-500 mb-2 block">
                                        Or enter image URL directly
                                    </Label>
                                    <Input
                                        id="imageUrl"
                                        type="url"
                                        value={imageUrl}
                                        onChange={(e) => setImageUrl(e.target.value)}
                                        placeholder="https://example.com/your-photo.jpg"
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800">
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                            <User className="w-5 h-5" />
                            Basic Information
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="name">Full Name *</Label>
                                <Input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your full name"
                                    required
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={user.email || ''}
                                    disabled
                                    className="mt-1 bg-zinc-50 dark:bg-zinc-800"
                                />
                                <p className="text-xs text-zinc-400 mt-1">
                                    Email cannot be changed
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* About */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800">
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            About You
                        </h2>
                        <div>
                            <Label htmlFor="bio">Bio</Label>
                            <Textarea
                                id="bio"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Tell others a bit about yourself..."
                                rows={4}
                                maxLength={500}
                                className="mt-1"
                            />
                            <p className="text-xs text-zinc-400 mt-1 text-right">
                                {bio.length}/500 characters
                            </p>
                        </div>
                    </div>

                    {/* Location */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800">
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5" />
                            Location
                        </h2>
                        <div>
                            <Label htmlFor="countryOfOrigin">Country of Origin</Label>
                            <Input
                                id="countryOfOrigin"
                                type="text"
                                value={countryOfOrigin}
                                onChange={(e) => setCountryOfOrigin(e.target.value)}
                                placeholder="e.g., United States"
                                className="mt-1"
                            />
                        </div>
                    </div>

                    {/* Languages */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-100 dark:border-zinc-800">
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                            <Languages className="w-5 h-5" />
                            Languages
                        </h2>

                        {/* Selected Languages */}
                        {languages.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {languages.map((lang) => (
                                    <span
                                        key={lang}
                                        className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 rounded-full text-sm"
                                    >
                                        {lang}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveLanguage(lang)}
                                            className="p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Add Language */}
                        <div className="flex gap-2 mb-4">
                            <Input
                                type="text"
                                value={newLanguage}
                                onChange={(e) => setNewLanguage(e.target.value)}
                                placeholder="Add a language..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddLanguage(newLanguage);
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleAddLanguage(newLanguage)}
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Common Languages */}
                        <div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">Common languages:</p>
                            <div className="flex flex-wrap gap-2">
                                {COMMON_LANGUAGES.filter(l => !languages.includes(l)).slice(0, 8).map((lang) => (
                                    <button
                                        key={lang}
                                        type="button"
                                        onClick={() => handleAddLanguage(lang)}
                                        className="px-3 py-1 text-sm border border-zinc-200 dark:border-zinc-700 dark:text-zinc-300 rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                    >
                                        {lang}
                                    </button>
                                ))}
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

                    {/* Submit Button */}
                    <div className="flex gap-4">
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Link href="/profile">
                            <Button type="button" variant="outline">
                                Cancel
                            </Button>
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
