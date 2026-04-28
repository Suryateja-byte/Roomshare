"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  submitVerificationRequest,
  DocumentType,
} from "@/app/actions/verification";
import {
  Upload,
  FileText,
  CreditCard,
  Fingerprint,
  Loader2,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const documentTypes: {
  value: DocumentType;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "passport",
    label: "Passport",
    icon: <FileText className="w-5 h-5" />,
  },
  {
    value: "driver_license",
    label: "Driver's License",
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    value: "national_id",
    label: "National ID",
    icon: <Fingerprint className="w-5 h-5" />,
  },
];

export default function VerificationForm() {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocumentType>("passport");
  const [documentUpload, setDocumentUpload] = useState<{
    id: string;
    fileName: string;
  } | null>(null);
  const [selfieUpload, setSelfieUpload] = useState<{
    id: string;
    fileName: string;
  } | null>(null);
  const [uploadingKind, setUploadingKind] = useState<
    "document" | "selfie" | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadVerificationFile = async (
    file: File,
    kind: "document" | "selfie"
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);

    const response = await fetch("/api/verification/upload", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as {
      uploadId?: string;
      error?: string;
    };

    if (!response.ok || !result.uploadId) {
      throw new Error(result.error || "Upload failed");
    }

    return result.uploadId;
  };

  const handleDocumentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadingKind("document");
    try {
      const uploadId = await uploadVerificationFile(file, "document");
      setDocumentUpload({ id: uploadId, fileName: file.name });
    } catch (err) {
      setDocumentUpload(null);
      setError(err instanceof Error ? err.message : "Document upload failed");
    } finally {
      setUploadingKind(null);
      e.target.value = "";
    }
  };

  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadingKind("selfie");
    try {
      const uploadId = await uploadVerificationFile(file, "selfie");
      setSelfieUpload({ id: uploadId, fileName: file.name });
    } catch (err) {
      setSelfieUpload(null);
      setError(err instanceof Error ? err.message : "Selfie upload failed");
    } finally {
      setUploadingKind(null);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!documentUpload) {
      setError("Please upload a document");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitVerificationRequest({
        documentType,
        documentUploadId: documentUpload.id,
        selfieUploadId: selfieUpload?.id,
      });

      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch (_err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Document Type Selection */}
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-3">
          Select Document Type
        </label>
        <div className="grid grid-cols-3 gap-3">
          {documentTypes.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setDocumentType(type.value)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                documentType === type.value
                  ? "border-primary bg-primary/5"
                  : "border-outline-variant/20 hover:border-outline-variant/40"
              }`}
            >
              <span
                className={
                  documentType === type.value
                    ? "text-primary"
                    : "text-on-surface-variant"
                }
              >
                {type.icon}
              </span>
              <span
                className={`text-xs font-medium ${
                  documentType === type.value
                    ? "text-primary"
                    : "text-on-surface-variant"
                }`}
              >
                {type.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Document Upload */}
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-3">
          Upload {documentTypes.find((t) => t.value === documentType)?.label}
        </label>
        <div className="relative">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleDocumentUpload}
            className="hidden"
            id="document-upload"
            aria-describedby={error ? "verification-form-error" : undefined}
            aria-invalid={!!error}
          />
          <label
            htmlFor="document-upload"
            className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
              documentUpload
                ? "border-green-500 bg-green-50"
                : "border-outline-variant/30 hover:border-outline-variant/50 bg-surface-container-high"
            }`}
          >
            {uploadingKind === "document" ? (
              <>
                <Loader2 className="w-8 h-8 text-on-surface-variant mb-2 animate-spin" />
                <span className="text-sm text-on-surface-variant">
                  Uploading...
                </span>
              </>
            ) : documentUpload ? (
              <>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <span className="text-sm font-medium text-green-600">
                  Document uploaded
                </span>
                <span className="text-xs text-on-surface-variant mt-1">
                  {documentUpload.fileName}
                </span>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-on-surface-variant mb-2" />
                <span className="text-sm text-on-surface-variant">
                  Click to upload
                </span>
                <span className="text-xs text-on-surface-variant mt-1">
                  PNG, JPG, or WebP up to 10MB
                </span>
              </>
            )}
          </label>
        </div>
      </div>

      {/* Selfie Upload (Optional) */}
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-1">
          Upload Selfie{" "}
          <span className="text-on-surface-variant font-normal">
            (Optional)
          </span>
        </label>
        <p className="text-xs text-on-surface-variant mb-3">
          A selfie helps us verify that you match the document
        </p>
        <div className="relative">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleSelfieUpload}
            className="hidden"
            id="selfie-upload"
          />
          <label
            htmlFor="selfie-upload"
            className={`flex items-center gap-4 w-full p-4 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
              selfieUpload
                ? "border-green-500 bg-green-50"
                : "border-outline-variant/30 hover:border-outline-variant/50 bg-surface-container-high"
            }`}
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                selfieUpload ? "bg-green-100" : "bg-surface-container-high"
              }`}
            >
              {uploadingKind === "selfie" ? (
                <Loader2 className="w-6 h-6 text-on-surface-variant animate-spin" />
              ) : (
                <Camera
                  className={`w-6 h-6 ${
                    selfieUpload ? "text-green-600" : "text-on-surface-variant"
                  }`}
                />
              )}
            </div>
            <div>
              <span
                className={`text-sm font-medium ${
                  selfieUpload ? "text-green-600" : "text-on-surface-variant"
                }`}
              >
                {uploadingKind === "selfie"
                  ? "Uploading..."
                  : selfieUpload
                    ? "Selfie uploaded"
                    : "Upload a selfie"}
              </span>
              <span className="text-xs text-on-surface-variant block">
                {selfieUpload
                  ? selfieUpload.fileName
                  : "Clear photo of your face"}
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          id="verification-form-error"
          role="alert"
          className="bg-red-50 border border-red-100 rounded-lg p-4"
        >
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Privacy Notice */}
      <div className="bg-surface-container-high rounded-lg p-4">
        <p className="text-xs text-on-surface-variant">
          Your documents are securely stored and will only be used for identity
          verification purposes. We follow strict privacy guidelines and will
          never share your documents with third parties.
        </p>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || uploadingKind !== null || !documentUpload}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit for Verification"
        )}
      </Button>
    </form>
  );
}
