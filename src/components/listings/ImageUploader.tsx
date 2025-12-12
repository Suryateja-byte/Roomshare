'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Plus, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageObject {
    file?: File;
    id: string;
    previewUrl: string;
    uploadedUrl?: string;
    isUploading?: boolean;
    error?: string;
}

interface ImageUploaderProps {
    onImagesChange?: (images: ImageObject[]) => void;
    initialImages?: string[];
    maxImages?: number;
    uploadToCloud?: boolean;
}

export default function ImageUploader({
    onImagesChange,
    initialImages = [],
    maxImages = 10,
    uploadToCloud = true
}: ImageUploaderProps) {
    const [images, setImages] = useState<ImageObject[]>(() =>
        initialImages.map((url, index) => ({
            id: `initial-${index}`,
            previewUrl: url,
            uploadedUrl: url
        }))
    );
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle standard file input
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        processFiles(files);
        // Reset input so user can select same file again
        e.target.value = '';
    };

    // Handle Drag & Drop events
    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        processFiles(files);
    };

    // Upload a single file to the server
    const uploadFile = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'listing');

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Upload failed');
        }

        const data = await response.json();
        return data.url;
    };

    // Process files: Create preview URLs and optionally upload
    const processFiles = async (newFiles: File[]) => {
        // Filter for images only
        const validImageFiles = newFiles.filter(file => file.type.startsWith('image/'));

        // Check max limit
        const remainingSlots = maxImages - images.length;
        const filesToProcess = validImageFiles.slice(0, remainingSlots);

        if (filesToProcess.length === 0) return;

        // Create initial image objects with loading state
        const newImageObjects: ImageObject[] = filesToProcess.map(file => ({
            file,
            id: Math.random().toString(36).substr(2, 9),
            previewUrl: URL.createObjectURL(file),
            isUploading: uploadToCloud,
            uploadedUrl: undefined
        }));

        const updatedImages = [...images, ...newImageObjects];
        setImages(updatedImages);

        // If uploading to cloud, process uploads
        if (uploadToCloud) {
            for (const imgObj of newImageObjects) {
                try {
                    const url = await uploadFile(imgObj.file!);
                    setImages(prev => prev.map(img =>
                        img.id === imgObj.id
                            ? { ...img, uploadedUrl: url, isUploading: false }
                            : img
                    ));
                } catch (error) {
                    setImages(prev => prev.map(img =>
                        img.id === imgObj.id
                            ? { ...img, error: (error as Error).message, isUploading: false }
                            : img
                    ));
                }
            }
        }
    };

    // Notify parent of changes
    useEffect(() => {
        if (onImagesChange) {
            onImagesChange(images);
        }
    }, [images, onImagesChange]);

    const removeImage = (idToRemove: string) => {
        const imageToRemove = images.find(img => img.id === idToRemove);
        if (imageToRemove?.previewUrl && !imageToRemove.uploadedUrl?.startsWith('http')) {
            URL.revokeObjectURL(imageToRemove.previewUrl);
        }
        const updatedImages = images.filter(img => img.id !== idToRemove);
        setImages(updatedImages);
    };

    // Retry a failed upload
    const retryUpload = async (imageId: string) => {
        const img = images.find(i => i.id === imageId);
        if (!img?.file) return;

        // Reset error state and set uploading
        setImages(prev => prev.map(i =>
            i.id === imageId
                ? { ...i, error: undefined, isUploading: true }
                : i
        ));

        try {
            const url = await uploadFile(img.file);
            setImages(prev => prev.map(i =>
                i.id === imageId
                    ? { ...i, uploadedUrl: url, isUploading: false, error: undefined }
                    : i
            ));
        } catch (error) {
            setImages(prev => prev.map(i =>
                i.id === imageId
                    ? { ...i, error: (error as Error).message, isUploading: false }
                    : i
            ));
        }
    };

    // Retry all failed uploads
    const retryAllFailed = async () => {
        const failedImages = images.filter(img => img.error && img.file);
        for (const img of failedImages) {
            await retryUpload(img.id);
        }
    };

    // Cleanup ObjectURLs to avoid memory leaks
    useEffect(() => {
        return () => {
            images.forEach(img => {
                if (img.previewUrl && !img.uploadedUrl) {
                    URL.revokeObjectURL(img.previewUrl);
                }
            });
        };
    }, []);

    const canAddMore = images.length < maxImages;
    const isAnyUploading = images.some(img => img.isUploading);
    const failedImages = images.filter(img => img.error && img.file);
    const successfulImages = images.filter(img => img.uploadedUrl && !img.error);
    const hasMultipleFailures = failedImages.length > 1;

    return (
        <div className="w-full">
            {/* 1. Upload Area */}
            {canAddMore && (
                <div
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer group ${isDragging
                        ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-800 scale-[1.01]'
                        : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 bg-white dark:bg-zinc-900'
                        }`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                    />

                    <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
                        <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-zinc-200 dark:bg-zinc-700' : 'bg-zinc-100 dark:bg-zinc-800 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700'}`}>
                            <Upload size={32} className={`transition-colors ${isDragging ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-500 dark:group-hover:text-zinc-400'}`} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                <span className="text-zinc-900 dark:text-white">Click to upload</span> or drag and drop
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                JPEG, PNG, WebP or GIF (max 5MB each)
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Image Preview Grid */}
            {images.length > 0 && (
                <div className={`${canAddMore ? 'mt-6' : ''} grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 animate-in fade-in duration-300`}>
                    {images.map((image, index) => (
                        <div key={image.id} className="group relative aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 shadow-sm">
                            <img
                                src={image.previewUrl}
                                alt={`Preview ${index + 1}`}
                                className={`w-full h-full object-cover ${image.isUploading ? 'opacity-50' : ''}`}
                            />

                            {/* Uploading Overlay */}
                            {image.isUploading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                                </div>
                            )}

                            {/* Error Overlay with Retry */}
                            {image.error && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/90 text-white p-2">
                                    <AlertCircle className="w-5 h-5 mb-1" />
                                    <p className="text-2xs text-center mb-2 line-clamp-2">{image.error}</p>
                                    {image.file && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                retryUpload(image.id);
                                            }}
                                            className="flex items-center gap-1 px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            Retry
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Main badge */}
                            {index === 0 && (
                                <span className="absolute top-2 left-2 px-2 py-1 bg-zinc-900 text-white text-xs font-medium rounded-md">
                                    Main
                                </span>
                            )}

                            {/* Overlay with Delete Button */}
                            {!image.isUploading && (
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-start justify-end p-2">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeImage(image.id);
                                        }}
                                        className="bg-white/90 hover:bg-red-500 hover:text-white text-zinc-600 rounded-full p-1.5 shadow-sm transition-all opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0"
                                        title="Remove image"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Add More Button (Mini) */}
                    {canAddMore && (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center justify-center aspect-square rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-500 dark:hover:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all"
                        >
                            <Plus size={24} />
                            <span className="text-xs mt-1 font-medium">Add more</span>
                        </button>
                    )}
                </div>
            )}

            {/* Image count and status summary */}
            {images.length > 0 && (
                <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {images.length} of {maxImages} images
                            {isAnyUploading && ' (uploading...)'}
                        </p>
                        {hasMultipleFailures && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={retryAllFailed}
                                className="text-xs h-7"
                            >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Retry All Failed ({failedImages.length})
                            </Button>
                        )}
                    </div>

                    {/* Upload Summary */}
                    {(successfulImages.length > 0 || failedImages.length > 0) && !isAnyUploading && (
                        <div className="text-xs space-y-1">
                            {successfulImages.length > 0 && (
                                <p className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    {successfulImages.length} image{successfulImages.length !== 1 ? 's' : ''} uploaded successfully
                                </p>
                            )}
                            {failedImages.length > 0 && (
                                <p className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                    {failedImages.length} image{failedImages.length !== 1 ? 's' : ''} failed to upload
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
