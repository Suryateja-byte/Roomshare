'use client';

import { useState } from 'react';
import { submitVerificationRequest, DocumentType } from '@/app/actions/verification';
import { Upload, FileText, CreditCard, Fingerprint, Loader2, Camera } from 'lucide-react';
import { useRouter } from 'next/navigation';

const documentTypes: { value: DocumentType; label: string; icon: React.ReactNode }[] = [
    { value: 'passport', label: 'Passport', icon: <FileText className="w-5 h-5" /> },
    { value: 'driver_license', label: "Driver's License", icon: <CreditCard className="w-5 h-5" /> },
    { value: 'national_id', label: 'National ID', icon: <Fingerprint className="w-5 h-5" /> },
];

export default function VerificationForm() {
    const [documentType, setDocumentType] = useState<DocumentType>('passport');
    const [documentUrl, setDocumentUrl] = useState('');
    const [selfieUrl, setSelfieUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    // In a real implementation, these would handle file uploads to a storage service
    const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // For demo purposes, we'll create a mock URL
        // In production, upload to Supabase Storage, S3, Cloudinary, etc.
        const mockUrl = `https://storage.example.com/documents/${Date.now()}-${file.name}`;
        setDocumentUrl(mockUrl);
    };

    const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const mockUrl = `https://storage.example.com/selfies/${Date.now()}-${file.name}`;
        setSelfieUrl(mockUrl);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!documentUrl) {
            setError('Please upload a document');
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await submitVerificationRequest({
                documentType,
                documentUrl,
                selfieUrl: selfieUrl || undefined
            });

            if (result.error) {
                setError(result.error);
            } else {
                router.refresh();
            }
        } catch (err) {
            setError('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Document Type Selection */}
            <div>
                <label className="block text-sm font-medium text-zinc-700 mb-3">
                    Select Document Type
                </label>
                <div className="grid grid-cols-3 gap-3">
                    {documentTypes.map((type) => (
                        <button
                            key={type.value}
                            type="button"
                            onClick={() => setDocumentType(type.value)}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${documentType === type.value
                                    ? 'border-zinc-900 bg-zinc-50'
                                    : 'border-zinc-200 hover:border-zinc-300'
                                }`}
                        >
                            <span className={documentType === type.value ? 'text-zinc-900' : 'text-zinc-400'}>
                                {type.icon}
                            </span>
                            <span className={`text-xs font-medium ${documentType === type.value ? 'text-zinc-900' : 'text-zinc-500'
                                }`}>
                                {type.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Document Upload */}
            <div>
                <label className="block text-sm font-medium text-zinc-700 mb-3">
                    Upload {documentTypes.find(t => t.value === documentType)?.label}
                </label>
                <div className="relative">
                    <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleDocumentUpload}
                        className="hidden"
                        id="document-upload"
                    />
                    <label
                        htmlFor="document-upload"
                        className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all ${documentUrl
                                ? 'border-green-500 bg-green-50'
                                : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50'
                            }`}
                    >
                        {documentUrl ? (
                            <>
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                                    <FileText className="w-6 h-6 text-green-600" />
                                </div>
                                <span className="text-sm font-medium text-green-600">Document uploaded</span>
                                <span className="text-xs text-zinc-500 mt-1">Click to replace</span>
                            </>
                        ) : (
                            <>
                                <Upload className="w-8 h-8 text-zinc-400 mb-2" />
                                <span className="text-sm text-zinc-600">Click to upload</span>
                                <span className="text-xs text-zinc-400 mt-1">PNG, JPG or PDF up to 10MB</span>
                            </>
                        )}
                    </label>
                </div>
            </div>

            {/* Selfie Upload (Optional) */}
            <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Upload Selfie <span className="text-zinc-400 font-normal">(Optional)</span>
                </label>
                <p className="text-xs text-zinc-500 mb-3">
                    A selfie helps us verify that you match the document
                </p>
                <div className="relative">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleSelfieUpload}
                        className="hidden"
                        id="selfie-upload"
                    />
                    <label
                        htmlFor="selfie-upload"
                        className={`flex items-center gap-4 w-full p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all ${selfieUrl
                                ? 'border-green-500 bg-green-50'
                                : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50'
                            }`}
                    >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selfieUrl ? 'bg-green-100' : 'bg-zinc-100'
                            }`}>
                            <Camera className={`w-6 h-6 ${selfieUrl ? 'text-green-600' : 'text-zinc-400'}`} />
                        </div>
                        <div>
                            <span className={`text-sm font-medium ${selfieUrl ? 'text-green-600' : 'text-zinc-600'}`}>
                                {selfieUrl ? 'Selfie uploaded' : 'Upload a selfie'}
                            </span>
                            <span className="text-xs text-zinc-400 block">
                                {selfieUrl ? 'Click to replace' : 'Clear photo of your face'}
                            </span>
                        </div>
                    </label>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                    <p className="text-sm text-red-600">{error}</p>
                </div>
            )}

            {/* Privacy Notice */}
            <div className="bg-zinc-50 rounded-xl p-4">
                <p className="text-xs text-zinc-500">
                    Your documents are securely stored and will only be used for identity verification purposes.
                    We follow strict privacy guidelines and will never share your documents with third parties.
                </p>
            </div>

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isSubmitting || !documentUrl}
                className="w-full bg-zinc-900 text-white py-3 px-6 rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Submitting...
                    </>
                ) : (
                    'Submit for Verification'
                )}
            </button>
        </form>
    );
}
