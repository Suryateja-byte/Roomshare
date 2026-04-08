"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  SUPPORTED_LANGUAGES,
  getLanguageName,
  type LanguageCode,
} from "@/lib/languages";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Home,
  MapPin,
  List,
  Camera,
  FileText,
  X,
  AlertTriangle,
  CheckCircle,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import { createListingClientSchema } from "@/lib/schemas";
import { checkListingLanguageCompliance } from "@/lib/listing-language-guard";
import ImageUploader from "@/components/listings/ImageUploader";
import {
  useFormPersistence,
  formatTimeSince,
} from "@/hooks/useFormPersistence";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CharacterCounter from "@/components/CharacterCounter";

interface ImageObject {
  id: string;
  previewUrl: string;
  uploadedUrl?: string;
  isUploading?: boolean;
  error?: string;
}

interface PersistedImageData {
  id: string;
  uploadedUrl: string;
}

function FieldError({
  field,
  fieldErrors,
}: {
  field: string;
  fieldErrors: Record<string, string>;
}) {
  if (!fieldErrors[field]) return null;
  return (
    <p id={`${field}-error`} role="alert" className="text-red-500 text-xs mt-1">
      {fieldErrors[field]}
    </p>
  );
}

interface ListingFormData {
  title: string;
  description: string;
  price: string;
  totalSlots: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  amenities: string;
  houseRules: string;
  moveInDate: string;
  leaseDuration: string;
  roomType: string;
  genderPreference: string;
  householdGender: string;
  bookingMode: string;
  selectedLanguages: string[];
  images: PersistedImageData[];
}

const FORM_STORAGE_KEY = "listing-draft";

// Static data moved to module scope to avoid re-creation every render (M-U3)
const FORM_SECTIONS = [
  { id: "basics", label: "The Basics", icon: Home },
  { id: "location", label: "Location", icon: MapPin },
  { id: "photos", label: "Photos", icon: Camera },
  { id: "details", label: "Finer Details", icon: List },
] as const;

const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

interface CreateListingFormProps {
  enableWholeUnitMode?: boolean;
}

export default function CreateListingForm({
  enableWholeUnitMode = false,
}: CreateListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadedImages, setUploadedImages] = useState<ImageObject[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showPartialUploadDialog, setShowPartialUploadDialog] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef(false);
  const submitAbortRef = useRef<AbortController | null>(null);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitSucceededRef = useRef(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  // Form field states for premium components
  const [description, setDescription] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [leaseDuration, setLeaseDuration] = useState("");
  const [roomType, setRoomType] = useState("");
  const [genderPreference, setGenderPreference] = useState("");
  const [householdGender, setHouseholdGender] = useState("");
  const [bookingMode, setBookingMode] = useState("SHARED");

  // Ref to track user-initiated roomType changes (prevents auto-set on mount/restore)
  const userChangedRoomType = useRef(false);

  // Form field states for tracking completion
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [totalSlots, setTotalSlots] = useState("1");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [amenitiesValue, setAmenitiesValue] = useState("");
  const [houseRulesValue, setHouseRulesValue] = useState("");

  const DESCRIPTION_MAX_LENGTH = 1000;

  // Form persistence hook
  const {
    persistedData,
    hasDraft,
    savedAt,
    saveData,
    cancelSave,
    clearPersistedData,
    isHydrated,
    crossTabConflict,
    dismissCrossTabConflict,
  } = useFormPersistence<ListingFormData>({ key: FORM_STORAGE_KEY });

  // Language search filter state
  const [languageSearch, setLanguageSearch] = useState("");

  // Filter languages based on search
  const filteredLanguages = useMemo(() => {
    if (!languageSearch.trim()) return LANGUAGE_CODES;
    const search = languageSearch.toLowerCase();
    return LANGUAGE_CODES.filter(
      (code) =>
        getLanguageName(code).toLowerCase().includes(search) ||
        code.toLowerCase().includes(search)
    );
  }, [languageSearch]);

  // Guard against all navigation vectors (beforeunload, pushState, popstate)
  const hasUnsavedWork =
    !submitSucceededRef.current &&
    (loading ||
      uploadedImages.some((img) => img.uploadedUrl) ||
      !!(title || description || price || address || city || state || zip));

  const navGuard = useNavigationGuard(
    hasUnsavedWork,
    loading
      ? "Your listing is still being created. Are you sure you want to leave?"
      : "You have unsaved changes. Your uploaded images and data will be lost if you leave."
  );

  // Show draft banner when we have a draft and haven't restored yet
  useEffect(() => {
    if (isHydrated && hasDraft && !draftRestored) {
      setShowDraftBanner(true);
    }
  }, [isHydrated, hasDraft, draftRestored]);

  // Restore draft data to form
  const restoreDraft = () => {
    if (!persistedData) return;

    try {
      // Restore controlled component states
      setTitle(persistedData.title || "");
      setDescription(persistedData.description || "");
      setPrice(persistedData.price || "");
      setTotalSlots(persistedData.totalSlots || "1");
      setAddress(persistedData.address || "");
      setCity(persistedData.city || "");
      setState(persistedData.state || "");
      setZip(persistedData.zip || "");
      let restoredMoveInDate = persistedData.moveInDate || "";
      if (restoredMoveInDate) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        if (restoredMoveInDate < todayStr) {
          restoredMoveInDate = "";
        }
      }
      setMoveInDate(restoredMoveInDate);
      setLeaseDuration(persistedData.leaseDuration || "");
      setRoomType(persistedData.roomType || "");
      setGenderPreference(persistedData.genderPreference || "");
      setHouseholdGender(persistedData.householdGender || "");
      setBookingMode(persistedData.bookingMode || "SHARED");
      setSelectedLanguages(persistedData.selectedLanguages || []);
      setAmenitiesValue(persistedData.amenities || "");
      setHouseRulesValue(persistedData.houseRules || "");

      // Restore images (they're already uploaded to Supabase)
      if (persistedData.images && persistedData.images.length > 0) {
        const restoredImages: ImageObject[] = persistedData.images.map(
          (img) => ({
            id: img.id,
            previewUrl: img.uploadedUrl, // Use the uploaded URL as preview
            uploadedUrl: img.uploadedUrl,
            isUploading: false,
          })
        );
        setUploadedImages(restoredImages);
      }

      setDraftRestored(true);
      setShowDraftBanner(false);
    } catch {
      toast.error("Could not restore draft. Starting fresh.");
      clearPersistedData();
      setShowDraftBanner(false);
    }
  };

  // Discard draft and start fresh
  const discardDraft = () => {
    clearPersistedData();
    setShowDraftBanner(false);
    setDraftRestored(true);
  };

  // Collect current form data for saving
  const collectFormData = (): ListingFormData => {
    return {
      title,
      description,
      price,
      totalSlots,
      address,
      city,
      state,
      zip,
      amenities: amenitiesValue,
      houseRules: houseRulesValue,
      moveInDate,
      leaseDuration,
      roomType,
      genderPreference,
      householdGender,
      bookingMode,
      selectedLanguages,
      images: uploadedImages
        .filter((img) => img.uploadedUrl && !img.error)
        .map((img) => ({ id: img.id, uploadedUrl: img.uploadedUrl! })),
    };
  };

  // Save when controlled states change (M-U1: fix operator precedence, M-U2: fix deps)
  useEffect(() => {
    if (!isHydrated || (!draftRestored && hasDraft)) return;
    saveData(collectFormData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isHydrated,
    draftRestored,
    hasDraft,
    title,
    description,
    price,
    totalSlots,
    address,
    city,
    state,
    zip,
    amenitiesValue,
    houseRulesValue,
    moveInDate,
    leaseDuration,
    roomType,
    genderPreference,
    householdGender,
    bookingMode,
    selectedLanguages,
    uploadedImages,
  ]);

  // Auto-set bookingMode when user changes roomType
  useEffect(() => {
    if (!enableWholeUnitMode) return;
    if (!userChangedRoomType.current) return;
    userChangedRoomType.current = false;
    if (roomType === "Entire Place") {
      setBookingMode("WHOLE_UNIT");
    } else {
      setBookingMode("SHARED");
    }
  }, [roomType, enableWholeUnitMode]);

  // Cleanup: abort in-flight submission and clear redirect timeout on unmount
  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort();
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  // Show a non-field error in the banner and focus it for screen readers
  const showError = (message: string) => {
    setError(message);
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => errorBannerRef.current?.focus());
  };

  // Calculate image counts
  const successfulImages = uploadedImages.filter(
    (img) => img.uploadedUrl && !img.error
  );
  const failedImages = uploadedImages.filter((img) => img.error);
  const stillUploading = uploadedImages.some((img) => img.isUploading);

  // Core submit logic extracted to avoid fake event creation (M-U5)
  const executeSubmit = async (forceSubmit = false) => {
    if (isSubmittingRef.current) return;

    setError("");
    setFieldErrors({});

    if (stillUploading) {
      setError("Please wait for all images to finish uploading");
      return;
    }

    if (successfulImages.length === 0) {
      showError("At least one photo is required to publish your listing");
      return;
    }

    if (failedImages.length > 0 && !forceSubmit) {
      setShowPartialUploadDialog(true);
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);

    if (submitAbortRef.current) submitAbortRef.current.abort();
    const abortController = new AbortController();
    submitAbortRef.current = abortController;

    const imageUrls = successfulImages.map((img) => img.uploadedUrl as string);
    const idempotencyKey = idempotencyKeyRef.current;

    // Build body exclusively from React state (all fields are controlled)
    const bodyObj = {
      title,
      description,
      price,
      address,
      city,
      state,
      zip,
      totalSlots,
      amenities: amenitiesValue || undefined,
      houseRules: houseRulesValue || undefined,
      images: imageUrls,
      householdLanguages: selectedLanguages,
      moveInDate: moveInDate || undefined,
      leaseDuration: leaseDuration || undefined,
      roomType: roomType || undefined,
      genderPreference: genderPreference || undefined,
      householdGender: householdGender || undefined,
      bookingMode: enableWholeUnitMode ? bookingMode : "SHARED",
    };

    // Client-side Zod pre-validation (optimistic — server validates as defense-in-depth)
    const clientParsed = createListingClientSchema.safeParse(bodyObj);
    if (!clientParsed.success) {
      const errors: Record<string, string> = {};
      clientParsed.error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          errors[issue.path[0].toString()] = issue.message;
        }
      });
      setFieldErrors(errors);
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey) {
        document.getElementById(firstErrorKey)?.focus();
      }
      setLoading(false);
      isSubmittingRef.current = false;
      return;
    }

    // Client-side language compliance pre-check (server validates as defense-in-depth)
    const titleCompliance = checkListingLanguageCompliance(bodyObj.title);
    if (!titleCompliance.allowed) {
      setFieldErrors({
        title: titleCompliance.message || "Content policy violation",
      });
      document.getElementById("title")?.focus();
      setLoading(false);
      isSubmittingRef.current = false;
      return;
    }
    const descCompliance = checkListingLanguageCompliance(bodyObj.description);
    if (!descCompliance.allowed) {
      setFieldErrors({
        description: descCompliance.message || "Content policy violation",
      });
      document.getElementById("description")?.focus();
      setLoading(false);
      isSubmittingRef.current = false;
      return;
    }

    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(bodyObj),
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      if (!res.ok) {
        const json = await res.json();

        // Regenerate key when the server definitively rejected (no listing created).
        // Keep key on hash-mismatch or ambiguous errors for dedup safety.
        const isDefinitiveRejection =
          res.status >= 400 &&
          res.status < 500 &&
          !json.error?.includes("Idempotency key reused");
        if (isDefinitiveRejection) {
          idempotencyKeyRef.current = crypto.randomUUID();
        }

        if (json.fields || json.field) {
          const newFieldErrors = json.fields
            ? (json.fields as Record<string, string>)
            : ({ [json.field]: json.error || "Validation error" } as Record<
                string,
                string
              >);
          setFieldErrors(newFieldErrors);
          const firstErrorKey = Object.keys(newFieldErrors)[0];
          if (firstErrorKey) {
            const element = document.getElementById(firstErrorKey);
            element?.focus();
          }
        }
        throw new Error(json.error || "Failed to create listing");
      }

      const result = await res.json();

      if (abortController.signal.aborted) return;

      cancelSave();
      clearPersistedData();
      submitSucceededRef.current = true;
      navGuard.disable();
      idempotencyKeyRef.current = crypto.randomUUID();
      toast.success("Listing published successfully!", {
        description:
          "Your listing is now live and visible to potential roommates.",
        duration: 5000,
      });
      redirectTimeoutRef.current = setTimeout(() => {
        if (!abortController.signal.aborted) {
          router.push(`/listings/${result.id}`);
        }
      }, 1000);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      Sentry.captureException(err, {
        tags: { component: "CreateListingForm", action: "submit" },
      });
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      showError(message);
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    executeSubmit(false);
  };

  const handleConfirmPartialSubmit = () => {
    setShowPartialUploadDialog(false);
    executeSubmit(true);
  };

  const isAnyUploading = uploadedImages.some((img) => img.isUploading);

  // FieldError is now a module-level component (UI-H1)

  // Memoize section completion to avoid re-creation every render (M-U3)
  const sectionCompletion = useMemo(
    () => ({
      basics:
        title.trim() !== "" &&
        description.trim().length >= 10 &&
        price.trim() !== "" &&
        totalSlots.trim() !== "",
      location:
        address.trim() !== "" &&
        city.trim() !== "" &&
        state.trim() !== "" &&
        zip.trim() !== "",
      photos: successfulImages.length > 0,
      details:
        amenitiesValue.trim() !== "" ||
        houseRulesValue.trim() !== "" ||
        moveInDate !== "" ||
        leaseDuration !== "",
    }),
    [
      title,
      description,
      price,
      totalSlots,
      address,
      city,
      state,
      zip,
      successfulImages.length,
      amenitiesValue,
      houseRulesValue,
      moveInDate,
      leaseDuration,
    ]
  );

  // Memoize unselected language list to avoid double .filter() (M-U3)
  const unselectedLanguages = useMemo(
    () => filteredLanguages.filter((code) => !selectedLanguages.includes(code)),
    [filteredLanguages, selectedLanguages]
  );

  return (
    <>
      {/* Step Progress Indicator */}
      <div
        data-testid="progress-steps"
        className="mb-8"
        role="group"
        aria-label="Form completion progress"
      >
        <div className="flex items-center justify-between">
          {FORM_SECTIONS.map((section, index) => {
            const Icon = section.icon;
            const isComplete =
              sectionCompletion[section.id as keyof typeof sectionCompletion];
            return (
              <div
                key={section.id}
                className="flex items-center flex-1"
                aria-label={`Step ${index + 1} of ${FORM_SECTIONS.length}: ${section.label}, ${isComplete ? "complete" : "incomplete"}`}
                data-step-complete={isComplete}
              >
                {/* Step Circle */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                      isComplete
                        ? "bg-green-50 border-green-500"
                        : "bg-surface-container-high border-outline-variant/20"
                    }`}
                  >
                    {isComplete ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Icon className="w-4 h-4 text-on-surface-variant" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium mt-2 text-center hidden sm:block transition-colors duration-300 ${
                      isComplete ? "text-green-600" : "text-on-surface-variant"
                    }`}
                  >
                    {section.label}
                  </span>
                  <span
                    className={`text-xs font-medium mt-2 text-center sm:hidden transition-colors duration-300 ${
                      isComplete ? "text-green-600" : "text-on-surface-variant"
                    }`}
                  >
                    {index + 1}
                  </span>
                </div>
                {/* Connector Line */}
                {index < FORM_SECTIONS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 sm:mx-4 transition-colors duration-300 ${
                      isComplete ? "bg-green-500" : "bg-surface-container-high"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p
          className="text-center text-sm text-on-surface-variant mt-4"
          aria-live="polite"
        >
          {Object.values(sectionCompletion).filter(Boolean).length === 4
            ? "✓ All sections complete! Ready to publish."
            : `Fill out all sections below to publish your listing (${Object.values(sectionCompletion).filter(Boolean).length}/4 complete)`}
        </p>
      </div>

      {/* Draft Resume Banner */}
      {showDraftBanner && savedAt && (
        <div
          role="status"
          className="bg-blue-50 border border-blue-100 px-4 py-4 rounded-xl mb-8 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                You have a saved draft
              </p>
              <p className="text-xs text-blue-600">
                Last saved {formatTimeSince(savedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={discardDraft}
              className="text-blue-700 border-blue-200 hover:bg-blue-100"
            >
              Start Fresh
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={restoreDraft}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Resume Draft
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          ref={errorBannerRef}
          tabIndex={-1}
          role="alert"
          data-testid="form-error-banner"
          className="bg-red-50 border border-red-100 text-red-600 px-4 py-4 rounded-xl mb-8 text-sm outline-none"
        >
          {error}
        </div>
      )}

      {crossTabConflict && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 mb-4">
          <p>
            This draft was modified in another tab. Reload to see the latest
            version.
          </p>
          <button onClick={dismissCrossTabConflict} className="underline mt-1">
            Dismiss
          </button>
        </div>
      )}

      {/* Auto-save status indicator */}
      {!showDraftBanner && savedAt && !loading && (
        <div className="flex items-center justify-end gap-2 mb-4 text-xs text-on-surface-variant animate-in fade-in duration-300">
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <span>Draft saved {formatTimeSince(savedAt)}</span>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        onChange={() => saveData(collectFormData())}
        className="space-y-12"
      >
        {/* Section 1: The Basics */}
        <section className="space-y-6" aria-labelledby="section-basics">
          <h3
            id="section-basics"
            className="text-lg font-semibold font-display text-on-surface flex items-center gap-2"
          >
            <Home className="w-4 h-4 flex-shrink-0" /> The Basics
          </h3>

          <div>
            <Label htmlFor="title">Listing Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sun-drenched Loft in Arts District"
              disabled={loading}
              aria-invalid={!!fieldErrors.title}
              aria-describedby={fieldErrors.title ? "title-error" : undefined}
              className={fieldErrors.title ? "border-red-500" : ""}
            />
            <FieldError field="title" fieldErrors={fieldErrors} />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX_LENGTH}
              aria-invalid={!!fieldErrors.description}
              aria-describedby={
                fieldErrors.description ? "description-error" : undefined
              }
              className={`w-full bg-surface-canvas hover:bg-surface-container-high focus:bg-surface-container-lowest border rounded-xl px-4 py-3 sm:py-3.5 text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-black/5 focus:border-on-surface transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 resize-none leading-relaxed ${fieldErrors.description ? "border-red-500" : "border-outline-variant/20"}`}
              placeholder="What makes your place special? Describe the vibe, the light, and the lifestyle..."
              disabled={loading}
            />
            <div className="flex items-center justify-between mt-1">
              <FieldError field="description" fieldErrors={fieldErrors} />
              <CharacterCounter
                current={description.length}
                max={DESCRIPTION_MAX_LENGTH}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price">Monthly Rent ($)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="2400"
                disabled={loading}
                aria-invalid={!!fieldErrors.price}
                aria-describedby={fieldErrors.price ? "price-error" : undefined}
                className={fieldErrors.price ? "border-red-500" : ""}
              />
              <FieldError field="price" fieldErrors={fieldErrors} />
            </div>
            <div>
              <Label htmlFor="totalSlots">Total Roommates</Label>
              <Input
                id="totalSlots"
                name="totalSlots"
                type="number"
                min="1"
                max="20"
                step="1"
                required
                value={totalSlots}
                onChange={(e) => setTotalSlots(e.target.value)}
                placeholder="1"
                disabled={loading}
                aria-invalid={!!fieldErrors.totalSlots}
                aria-describedby={
                  fieldErrors.totalSlots ? "totalSlots-error" : undefined
                }
                className={fieldErrors.totalSlots ? "border-red-500" : ""}
              />
              <FieldError field="totalSlots" fieldErrors={fieldErrors} />
            </div>
          </div>

          {/* Booking Mode Selector (behind feature flag) */}
          {enableWholeUnitMode && (
            <fieldset className="space-y-3" disabled={loading}>
              <legend className="text-sm font-medium text-on-surface">
                Booking Mode
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    bookingMode === "SHARED"
                      ? "border-on-surface bg-surface-canvas"
                      : "border-outline-variant/20 hover:border-outline-variant/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="bookingMode"
                    value="SHARED"
                    checked={bookingMode === "SHARED"}
                    onChange={(e) => setBookingMode(e.target.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium text-on-surface">
                      Shared space (multiple tenants)
                    </span>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Individual slots can be booked by different tenants.
                    </p>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    bookingMode === "WHOLE_UNIT"
                      ? "border-on-surface bg-surface-canvas"
                      : "border-outline-variant/20 hover:border-outline-variant/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="bookingMode"
                    value="WHOLE_UNIT"
                    checked={bookingMode === "WHOLE_UNIT"}
                    onChange={(e) => setBookingMode(e.target.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium text-on-surface">
                      Entire unit (one party)
                    </span>
                    <p className="text-xs text-on-surface-variant mt-1">
                      The entire unit is booked by a single party at a time.
                    </p>
                  </div>
                </label>
              </div>
              <FieldError field="bookingMode" fieldErrors={fieldErrors} />
            </fieldset>
          )}
        </section>

        <div className="h-px bg-surface-container-high w-full"></div>

        {/* Section 2: Location */}
        <section className="space-y-6" aria-labelledby="section-location">
          <h3
            id="section-location"
            className="text-lg font-semibold font-display text-on-surface flex items-center gap-2"
          >
            <MapPin className="w-4 h-4 flex-shrink-0" /> Location
          </h3>

          <div>
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              name="address"
              required
              maxLength={200}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Boulevard St"
              disabled={loading}
              aria-invalid={!!fieldErrors.address}
              aria-describedby={
                fieldErrors.address ? "address-error" : undefined
              }
              className={fieldErrors.address ? "border-red-500" : ""}
            />
            <FieldError field="address" fieldErrors={fieldErrors} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] md:grid-cols-[2fr_1fr_1fr] gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                required
                maxLength={100}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="San Francisco"
                disabled={loading}
                aria-invalid={!!fieldErrors.city}
                aria-describedby={fieldErrors.city ? "city-error" : undefined}
                className={fieldErrors.city ? "border-red-500" : ""}
              />
              <FieldError field="city" fieldErrors={fieldErrors} />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                name="state"
                required
                maxLength={50}
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="CA"
                disabled={loading}
                aria-invalid={!!fieldErrors.state}
                aria-describedby={fieldErrors.state ? "state-error" : undefined}
                className={fieldErrors.state ? "border-red-500" : ""}
              />
              <FieldError field="state" fieldErrors={fieldErrors} />
            </div>
            <div>
              <Label htmlFor="zip">Zip Code</Label>
              <Input
                id="zip"
                name="zip"
                required
                maxLength={20}
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="94103"
                disabled={loading}
                aria-invalid={!!fieldErrors.zip}
                aria-describedby={fieldErrors.zip ? "zip-error" : undefined}
                className={fieldErrors.zip ? "border-red-500" : ""}
              />
              <FieldError field="zip" fieldErrors={fieldErrors} />
            </div>
          </div>
        </section>

        <div className="h-px bg-surface-container-high w-full"></div>

        {/* Section 2.5: Photos */}
        <section className="space-y-6" aria-labelledby="section-photos">
          <h3
            id="section-photos"
            className="text-lg font-semibold font-display text-on-surface flex items-center gap-2"
          >
            <Camera className="w-4 h-4 flex-shrink-0" /> Photos
          </h3>
          <div id="images">
            <Label>Upload Photos</Label>
            <p className="text-xs text-on-surface-variant mt-1 mb-4">
              At least one photo required to publish your listing
            </p>
            <ImageUploader
              onImagesChange={setUploadedImages}
              initialImages={uploadedImages
                .filter((img) => img.uploadedUrl)
                .map((img) => img.uploadedUrl!)}
              key={draftRestored ? "restored" : "initial"}
            />
            {fieldErrors.images && (
              <p className="text-sm text-red-500 mt-1">{fieldErrors.images}</p>
            )}
          </div>
        </section>

        <div className="h-px bg-surface-container-high w-full"></div>

        {/* Section 3: Details */}
        <section className="space-y-6" aria-labelledby="section-details">
          <h3
            id="section-details"
            className="text-lg font-semibold font-display text-on-surface flex items-center gap-2"
          >
            <List className="w-4 h-4 flex-shrink-0" /> Finer Details
          </h3>

          <div>
            <Label htmlFor="amenities">Amenities</Label>
            <Input
              id="amenities"
              name="amenities"
              value={amenitiesValue}
              onChange={(e) => setAmenitiesValue(e.target.value)}
              placeholder="Wifi, Gym, Washer/Dryer, Roof Deck..."
              disabled={loading}
              aria-invalid={!!fieldErrors.amenities}
              aria-describedby={
                fieldErrors.amenities ? "amenities-error" : undefined
              }
              className={fieldErrors.amenities ? "border-red-500" : ""}
            />
            <FieldError field="amenities" fieldErrors={fieldErrors} />
            <p className="text-xs text-on-surface-variant mt-2">
              Separate amenities with commas
            </p>
          </div>

          <div>
            <Label htmlFor="moveInDate">Move-In Date</Label>
            <DatePicker
              id="moveInDate"
              value={moveInDate}
              onChange={setMoveInDate}
              placeholder="Select move-in date"
              minDate={new Date().toISOString().split("T")[0]}
            />
            <p className="text-xs text-on-surface-variant mt-2">
              When can tenants move in? (Optional)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="leaseDuration">Lease Duration</Label>
              <Select
                value={leaseDuration}
                onValueChange={setLeaseDuration}
                disabled={loading}
              >
                <SelectTrigger id="leaseDuration" className="w-full mt-1">
                  <SelectValue placeholder="Select duration..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Month-to-month">Month-to-month</SelectItem>
                  <SelectItem value="3 months">3 months</SelectItem>
                  <SelectItem value="6 months">6 months</SelectItem>
                  <SelectItem value="12 months">12 months</SelectItem>
                  <SelectItem value="Flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="roomType">Room Type</Label>
              <Select
                value={roomType}
                onValueChange={(val) => {
                  userChangedRoomType.current = true;
                  setRoomType(val);
                }}
                disabled={loading}
              >
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

          <div id="householdLanguages">
            <Label>Languages Spoken in the House</Label>
            <p className="text-xs text-on-surface-variant mt-1 mb-3">
              Select languages spoken by household members
            </p>

            {/* Selected languages shown at top */}
            {selectedLanguages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-outline-variant/20">
                {selectedLanguages.map((code) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed="true"
                    aria-label={`${getLanguageName(code)}, selected`}
                    onClick={() => toggleLanguage(code)}
                    disabled={loading}
                    className="flex items-center gap-1 px-3 py-1.5 min-h-[44px] rounded-full text-sm font-medium bg-on-surface text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getLanguageName(code)}
                    <X className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            )}

            {/* Search input */}
            <Input
              type="text"
              placeholder="Search languages..."
              aria-label="Search languages"
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              className="mb-3"
              disabled={loading}
            />
            <span className="sr-only" aria-live="polite" role="status">
              {languageSearch
                ? `${unselectedLanguages.length} languages found`
                : `${unselectedLanguages.length} languages available`}
            </span>

            {/* Language chips */}
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {unselectedLanguages.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed="false"
                  onClick={() => toggleLanguage(code)}
                  disabled={loading}
                  className="px-3 py-1.5 min-h-[44px] rounded-full text-sm font-medium transition-all duration-200 bg-surface-container-high text-on-surface-variant hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {getLanguageName(code)}
                </button>
              ))}
              {unselectedLanguages.length === 0 && (
                <p className="text-sm text-on-surface-variant">
                  {languageSearch
                    ? "No languages found"
                    : "All languages selected"}
                </p>
              )}
            </div>
            {fieldErrors.householdLanguages && (
              <p className="text-sm text-red-500 mt-1">
                {fieldErrors.householdLanguages}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="genderPreference">Gender Preference</Label>
              <p className="text-xs text-on-surface-variant mt-1 mb-2">
                Who can apply for this room?
              </p>
              <Select
                value={genderPreference}
                onValueChange={setGenderPreference}
                disabled={loading}
              >
                <SelectTrigger id="genderPreference" className="w-full">
                  <SelectValue placeholder="Select preference..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE_ONLY">
                    Male Identifying Only
                  </SelectItem>
                  <SelectItem value="FEMALE_ONLY">
                    Female Identifying Only
                  </SelectItem>
                  <SelectItem value="NO_PREFERENCE">
                    Any Gender / All Welcome
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="householdGender">Household Gender</Label>
              <p className="text-xs text-on-surface-variant mt-1 mb-2">
                Current household composition
              </p>
              <Select
                value={householdGender}
                onValueChange={setHouseholdGender}
                disabled={loading}
              >
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
            <Input
              id="houseRules"
              name="houseRules"
              value={houseRulesValue}
              onChange={(e) => setHouseRulesValue(e.target.value)}
              placeholder="No smoking, quiet hours after 10pm, no pets..."
              disabled={loading}
              aria-invalid={!!fieldErrors.houseRules}
              aria-describedby={
                fieldErrors.houseRules ? "houseRules-error" : undefined
              }
              className={fieldErrors.houseRules ? "border-red-500" : ""}
            />
            <FieldError field="houseRules" fieldErrors={fieldErrors} />
            <p className="text-xs text-on-surface-variant mt-2">
              Separate rules with commas
            </p>
          </div>
        </section>

        {/* Actions */}
        <div className="pt-6">
          <Button
            type="submit"
            disabled={loading || isAnyUploading}
            size="lg"
            className="w-full rounded-xl shadow-xl shadow-on-surface/10"
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
            ) : successfulImages.length > 0 ? (
              `Publish with ${successfulImages.length} Photo${successfulImages.length !== 1 ? "s" : ""}`
            ) : (
              "Publish Listing"
            )}
          </Button>
          {/* TODO: Create /community-guidelines page (terms page already exists) */}
          <p className="text-center text-xs text-on-surface-variant mt-4">
            By publishing, you agree to our{" "}
            <a href="/terms" className="underline hover:text-primary-700">
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/community-guidelines"
              className="underline hover:text-primary-700"
            >
              Community Guidelines
            </a>
            .
          </p>
        </div>
      </form>

      {/* Partial Upload Confirmation Dialog */}
      <AlertDialog
        open={showPartialUploadDialog}
        onOpenChange={setShowPartialUploadDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Some Images Failed to Upload
            </AlertDialogTitle>
            <AlertDialogDescription>
              {failedImages.length} of {uploadedImages.length} image
              {uploadedImages.length !== 1 ? "s" : ""} failed to upload. You can
              still publish your listing with {successfulImages.length} photo
              {successfulImages.length !== 1 ? "s" : ""}, or go back to retry
              the failed uploads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back to Fix</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPartialSubmit}>
              Publish with {successfulImages.length} Photo
              {successfulImages.length !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Navigation Guard Dialog */}
      <AlertDialog
        open={navGuard.showDialog}
        onOpenChange={(open) => {
          if (!open) navGuard.onStay();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>{navGuard.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={navGuard.onStay}>
              Stay on Page
            </AlertDialogCancel>
            <AlertDialogAction onClick={navGuard.onLeave}>
              Leave Page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
