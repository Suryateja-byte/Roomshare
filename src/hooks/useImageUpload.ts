'use client';

import { useState, useCallback, useRef } from 'react';

const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const DEFAULT_ACCEPTED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
];

export interface UseImageUploadConfig {
    /** Maximum number of files that can be uploaded in one batch */
    maxFiles?: number;
    /** Maximum file size in bytes (default: 5MB) */
    maxSizeBytes?: number;
    /** Accepted MIME types (default: jpeg, png, webp, gif) */
    acceptedTypes?: string[];
    /** Upload type identifier sent to the API (e.g., 'profile', 'listing') */
    uploadType: string;
}

export interface UseImageUploadReturn {
    /** Upload a single file. Resolves with the uploaded URL, or throws on failure. */
    uploadImage: (file: File) => Promise<string>;
    /** Whether any upload is currently in progress */
    isUploading: boolean;
    /** Current error message, if any */
    error: string | null;
    /** Clear the current error */
    clearError: () => void;
    /** Validate a file without uploading. Returns an error string or null if valid. */
    validateFile: (file: File) => string | null;
}

/**
 * Shared hook for image upload logic used by both ImageUpload and ImageUploader components.
 *
 * Handles file validation (size, type), uploading to /api/upload, and error/loading state.
 *
 * @example
 * const { uploadImage, isUploading, error, validateFile } = useImageUpload({
 *   uploadType: 'listing',
 *   maxSizeBytes: 5 * 1024 * 1024,
 * });
 *
 * const handleFile = async (file: File) => {
 *   const validationError = validateFile(file);
 *   if (validationError) { setError(validationError); return; }
 *   const url = await uploadImage(file);
 * };
 */
export function useImageUpload(config: UseImageUploadConfig): UseImageUploadReturn {
    const {
        maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
        acceptedTypes = DEFAULT_ACCEPTED_TYPES,
        uploadType,
    } = config;

    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const activeUploads = useRef(0);

    const validateFile = useCallback(
        (file: File): string | null => {
            if (!acceptedTypes.some((type) => file.type === type || file.type.startsWith(type.replace('*', '')))) {
                const friendlyTypes = acceptedTypes
                    .map((t) => t.split('/')[1]?.toUpperCase())
                    .filter(Boolean)
                    .join(', ');
                return `File type not accepted. Allowed: ${friendlyTypes}`;
            }

            if (file.size > maxSizeBytes) {
                const maxMB = Math.round(maxSizeBytes / (1024 * 1024));
                return `File too large. Maximum size: ${maxMB}MB`;
            }

            return null;
        },
        [acceptedTypes, maxSizeBytes],
    );

    const uploadImage = useCallback(
        async (file: File): Promise<string> => {
            const validationError = validateFile(file);
            if (validationError) {
                setError(validationError);
                throw new Error(validationError);
            }

            activeUploads.current += 1;
            setIsUploading(true);
            setError(null);

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('type', uploadType);

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Upload failed');
                }

                return data.url;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Upload failed';
                setError(message);
                throw err;
            } finally {
                activeUploads.current -= 1;
                if (activeUploads.current === 0) {
                    setIsUploading(false);
                }
            }
        },
        [uploadType, validateFile],
    );

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        uploadImage,
        isUploading,
        error,
        clearError,
        validateFile,
    };
}

export default useImageUpload;
