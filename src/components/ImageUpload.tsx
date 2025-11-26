'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageUploadProps {
    value?: string | string[];
    onChange: (value: string | string[]) => void;
    multiple?: boolean;
    maxFiles?: number;
    type: 'profile' | 'listing';
    className?: string;
}

export default function ImageUpload({
    value,
    onChange,
    multiple = false,
    maxFiles = 5,
    type,
    className = ''
}: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const images = multiple
        ? (Array.isArray(value) ? value : value ? [value] : [])
        : (typeof value === 'string' && value ? [value] : []);

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setError(null);
        setIsUploading(true);

        const filesToUpload = Array.from(files);

        // Check max files limit for multiple uploads
        if (multiple && images.length + filesToUpload.length > maxFiles) {
            setError(`Maximum ${maxFiles} images allowed`);
            setIsUploading(false);
            return;
        }

        try {
            const uploadedUrls: string[] = [];

            for (const file of filesToUpload) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('type', type);

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Upload failed');
                }

                uploadedUrls.push(data.url);
            }

            if (multiple) {
                onChange([...images, ...uploadedUrls]);
            } else {
                onChange(uploadedUrls[0]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = async (urlToRemove: string) => {
        if (multiple) {
            onChange(images.filter(url => url !== urlToRemove));
        } else {
            onChange('');
        }
    };

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        handleUpload(e.dataTransfer.files);
    }, [images]);

    const canAddMore = multiple ? images.length < maxFiles : images.length === 0;

    return (
        <div className={className}>
            {/* Upload Area */}
            {canAddMore && (
                <div
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                        dragActive
                            ? 'border-zinc-900 bg-zinc-50'
                            : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple={multiple}
                        onChange={(e) => handleUpload(e.target.files)}
                        className="hidden"
                    />

                    {isUploading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
                            <p className="text-sm text-zinc-500">Uploading...</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center">
                                    <Upload className="w-6 h-6 text-zinc-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-zinc-700">
                                        Drag & drop {multiple ? 'images' : 'an image'} here
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        or click to browse
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => inputRef.current?.click()}
                                >
                                    <ImageIcon className="w-4 h-4 mr-2" />
                                    Select {multiple ? 'Images' : 'Image'}
                                </Button>
                            </div>
                            <p className="text-xs text-zinc-400 mt-3">
                                JPEG, PNG, WebP, GIF up to 5MB
                                {multiple && ` (max ${maxFiles} images)`}
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* Error Message */}
            {error && (
                <p className="text-sm text-red-500 mt-2">{error}</p>
            )}

            {/* Image Preview */}
            {images.length > 0 && (
                <div className={`grid gap-3 mt-4 ${multiple ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
                    {images.map((url, index) => (
                        <div
                            key={url}
                            className="relative group aspect-square rounded-xl overflow-hidden border border-zinc-200"
                        >
                            <img
                                src={url}
                                alt={`Upload ${index + 1}`}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                    type="button"
                                    onClick={() => handleRemove(url)}
                                    className="p-2 bg-white rounded-full shadow-lg hover:bg-red-50 transition-colors"
                                >
                                    <X className="w-4 h-4 text-red-500" />
                                </button>
                            </div>
                            {multiple && index === 0 && (
                                <span className="absolute top-2 left-2 px-2 py-1 bg-zinc-900 text-white text-xs font-medium rounded-md">
                                    Main
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Image Count */}
            {multiple && images.length > 0 && (
                <p className="text-xs text-zinc-500 mt-2">
                    {images.length} of {maxFiles} images
                </p>
            )}
        </div>
    );
}
