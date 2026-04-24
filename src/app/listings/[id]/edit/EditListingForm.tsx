"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  SUPPORTED_LANGUAGES,
  getLanguageName,
  type LanguageCode,
} from "@/lib/languages";
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
  ArrowLeft,
  FileText,
  CheckCircle,
  RefreshCcw,
  AlertCircle,
  X,
} from "lucide-react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
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
import ImageUploader from "@/components/listings/ImageUploader";
import ListingFreshnessCheck from "@/components/ListingFreshnessCheck";
import { ImageIcon } from "lucide-react";
import {
  getModerationWriteLockReason,
  LISTING_LOCKED_ERROR_MESSAGE,
} from "@/lib/listings/moderation-write-lock";

interface ImageObject {
  file?: File;
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

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  genderPreference: string | null;
  householdGender: string | null;
  leaseDuration: string | null;
  roomType: string | null;
  bookingMode?: string;
  version?: number;
  status?: "ACTIVE" | "PAUSED" | "RENTED";
  statusReason?: string | null;
  openSlots?: number | null;
  totalSlots: number;
  moveInDate: Date | string | null;
  availableUntil?: Date | string | null;
  minStayMonths?: number | null;
  lastConfirmedAt?: Date | string | null;
  updatedAt?: string;
  location: {
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null;
  images: string[];
}

interface EditListingFormProps {
  listing: Listing;
  migrationReview?: { isReviewRequired: boolean } | null;
  enableWholeUnitMode?: boolean;
  moderationWriteLocksEnabled?: boolean;
}

interface EditListingFormData {
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
  availableUntil?: string;
  minStayMonths?: string;
  leaseDuration: string;
  roomType: string;
  genderPreference: string;
  householdGender: string;
  bookingMode: string;
  selectedLanguages: string[];
  images: PersistedImageData[];
}

// Format date for input (YYYY-MM-DD)
const formatDateForInput = (date: Date | string | null | undefined) => {
  if (!date) return "";
  if (typeof date === "string") {
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function resolveInitialWriteLock(options: {
  moderationWriteLocksEnabled?: boolean;
  statusReason?: string | null;
}) {
  return (
    options.moderationWriteLocksEnabled === true &&
    getModerationWriteLockReason(options.statusReason) !== null
  );
}

function HostManagedEditListingForm({
  listing,
  migrationReview: _migrationReview = null,
  moderationWriteLocksEnabled = false,
}: EditListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(listing.version ?? 0);
  const [formModified, setFormModified] = useState(false);
  const [moveInDate, setMoveInDate] = useState(
    formatDateForInput(listing.moveInDate)
  );
  const [availableUntil, setAvailableUntil] = useState(
    formatDateForInput(listing.availableUntil)
  );
  const [status, setStatus] = useState(listing.status ?? "ACTIVE");
  const [openSlots, setOpenSlots] = useState(String(listing.openSlots ?? 0));
  const [totalSlots, setTotalSlots] = useState(String(listing.totalSlots));
  const [minStayMonths, setMinStayMonths] = useState(
    String(listing.minStayMonths ?? 1)
  );
  const [reloadSuggested, setReloadSuggested] = useState(false);
  const [pendingReload, setPendingReload] = useState(false);
  const [isWriteLocked, setIsWriteLocked] = useState(() =>
    resolveInitialWriteLock({
      moderationWriteLocksEnabled,
      statusReason: listing.statusReason,
    })
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const previousSnapshotKeyRef = useRef<string | null>(null);
  const pendingReloadSnapshotKeyRef = useRef<string | null>(null);
  const navGuard = useNavigationGuard(
    formModified && !loading && !pendingReload,
    "You have unsaved changes. Leave without saving?"
  );
  const isFormDisabled = loading || pendingReload || isWriteLocked;
  const isNavigationDisabled = loading || pendingReload;

  const latestSnapshot = useMemo(
    () => ({
      version: listing.version ?? 0,
      moveInDate: formatDateForInput(listing.moveInDate),
      availableUntil: formatDateForInput(listing.availableUntil),
      status: listing.status ?? "ACTIVE",
      openSlots: String(listing.openSlots ?? 0),
      totalSlots: String(listing.totalSlots),
      minStayMonths: String(listing.minStayMonths ?? 1),
    }),
    [
      listing.availableUntil,
      listing.minStayMonths,
      listing.moveInDate,
      listing.openSlots,
      listing.status,
      listing.totalSlots,
      listing.version,
    ]
  );

  const latestSnapshotKey = useMemo(
    () =>
      [
        latestSnapshot.version,
        latestSnapshot.moveInDate,
        latestSnapshot.availableUntil,
        latestSnapshot.status,
        latestSnapshot.openSlots,
        latestSnapshot.totalSlots,
        latestSnapshot.minStayMonths,
      ].join("|"),
    [latestSnapshot]
  );

  const hydrateFromListing = useCallback(() => {
    setVersion(latestSnapshot.version);
    setMoveInDate(latestSnapshot.moveInDate);
    setAvailableUntil(latestSnapshot.availableUntil);
    setStatus(latestSnapshot.status);
    setOpenSlots(latestSnapshot.openSlots);
    setTotalSlots(latestSnapshot.totalSlots);
    setMinStayMonths(latestSnapshot.minStayMonths);
    setError("");
    setFieldErrors({});
    setReloadSuggested(false);
    setFormModified(false);
    setPendingReload(false);
    pendingReloadSnapshotKeyRef.current = null;
  }, [latestSnapshot]);

  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setIsWriteLocked(
      resolveInitialWriteLock({
        moderationWriteLocksEnabled,
        statusReason: listing.statusReason,
      })
    );
  }, [listing.statusReason, moderationWriteLocksEnabled]);

  useEffect(() => {
    const previousSnapshotKey = previousSnapshotKeyRef.current;
    previousSnapshotKeyRef.current = latestSnapshotKey;

    if (pendingReload) {
      if (pendingReloadSnapshotKeyRef.current === latestSnapshotKey) {
        return;
      }
      hydrateFromListing();
      return;
    }

    if (
      previousSnapshotKey === null ||
      previousSnapshotKey === latestSnapshotKey
    ) {
      return;
    }

    if (!formModified) {
      hydrateFromListing();
      return;
    }

    setReloadSuggested(true);
  }, [formModified, hydrateFromListing, latestSnapshotKey, pendingReload]);

  const FieldError = ({ field }: { field: string }) => {
    if (!fieldErrors[field]) return null;
    return (
      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        {fieldErrors[field]}
      </p>
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendingReload || isWriteLocked) {
      return;
    }

    setLoading(true);
    setError("");
    setFieldErrors({});
    setReloadSuggested(false);

    const controller = new AbortController();
    submitAbortRef.current = controller;

    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: version,
          openSlots: Number(openSlots),
          totalSlots: Number(totalSlots),
          moveInDate: moveInDate || null,
          availableUntil: availableUntil || null,
          minStayMonths: Number(minStayMonths),
          status,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.code === "LISTING_LOCKED") {
          setIsWriteLocked(true);
          setError("");
          setFieldErrors({});
          setReloadSuggested(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        if (json.fields) {
          setFieldErrors(json.fields);
        }

        if (json.code === "VERSION_CONFLICT") {
          setReloadSuggested(true);
          throw new Error(
            "This listing was updated elsewhere. Reload to continue editing or reapply your changes."
          );
        }

        throw new Error(json.error || "Failed to update listing");
      }

      if (typeof json.version === "number") {
        setVersion(json.version);
      }

      navGuard.disable();
      router.push(`/listings/${listing.id}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      Sentry.captureException(err, {
        tags: { component: "HostManagedEditListingForm", action: "submit" },
      });
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      submitAbortRef.current = null;
      setLoading(false);
    }
  };

  const handleReloadLatest = () => {
    pendingReloadSnapshotKeyRef.current = latestSnapshotKey;
    setPendingReload(true);
    router.refresh();
  };

  return (
    <>
      <Link
        data-testid="listing-cancel-button"
        href={`/listings/${listing.id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to listing
      </Link>

      <div className="mb-8">
        <ListingFreshnessCheck listingId={listing.id} canManage={true} />
      </div>

      {isWriteLocked && (
        <div className="bg-amber-50 border border-amber-100 px-4 py-4 rounded-xl mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Listing locked
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  {LISTING_LOCKED_ERROR_MESSAGE}
                </p>
                <p className="text-xs text-amber-700 mt-2">
                  Your unsaved edits are still on the page. Reload when you want
                  to check for an updated listing state.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
              disabled={loading}
              className="flex-shrink-0 text-amber-700 border-outline-variant/20 hover:bg-amber-100"
            >
              <RefreshCcw className="w-4 h-4 mr-1" />
              Reload page
            </Button>
          </div>
        </div>
      )}

      {!isWriteLocked && error && (
        <div className="bg-red-50 border border-red-100 px-4 py-4 rounded-xl mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">
                  Failed to save changes
                </p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                reloadSuggested
                  ? handleReloadLatest()
                  : formRef.current?.requestSubmit()
              }
              disabled={isFormDisabled}
              className="flex-shrink-0 text-red-700 border-outline-variant/20 hover:bg-red-100"
            >
              <RefreshCcw className="w-4 h-4 mr-1" />
              {pendingReload
                ? "Reloading..."
                : reloadSuggested
                  ? "Reload latest"
                  : "Retry"}
            </Button>
          </div>
        </div>
      )}

      {!isWriteLocked && !error && reloadSuggested && (
        <div className="bg-amber-50 border border-amber-100 px-4 py-4 rounded-xl mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  A newer version is available
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Reload the latest listing snapshot to discard unsaved changes
                  and continue editing with the current version.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReloadLatest}
              disabled={isFormDisabled}
              className="flex-shrink-0 text-amber-700 border-outline-variant/20 hover:bg-amber-100"
            >
              <RefreshCcw className="w-4 h-4 mr-1" />
              {pendingReload ? "Reloading..." : "Reload latest"}
            </Button>
          </div>
        </div>
      )}

      <form
        ref={formRef}
        data-testid="edit-listing-form"
        onSubmit={handleSubmit}
        onChange={() => setFormModified(true)}
        className="space-y-8"
      >
        <div className="space-y-6">
          <h3 className="text-lg font-semibold font-display text-on-surface flex items-center gap-2">
            <Home className="w-4 h-4" /> Host-managed availability
          </h3>
          <p className="text-sm text-on-surface-variant">
            Update the live availability fields for this host-managed listing.
            This save uses the dedicated versioned availability contract.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="openSlots">Open Slots</Label>
              <Input
                id="openSlots"
                name="openSlots"
                type="number"
                min="0"
                step="1"
                value={openSlots}
                onChange={(e) => setOpenSlots(e.target.value)}
                disabled={isFormDisabled}
              />
              <FieldError field="openSlots" />
            </div>
            <div>
              <Label htmlFor="totalSlots">Total Slots</Label>
              <Input
                id="totalSlots"
                name="totalSlots"
                type="number"
                min="1"
                step="1"
                value={totalSlots}
                onChange={(e) => setTotalSlots(e.target.value)}
                disabled={isFormDisabled}
              />
              <FieldError field="totalSlots" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="moveInDate">Move-in Date</Label>
              <DatePicker
                id="moveInDate"
                value={moveInDate}
                onChange={setMoveInDate}
                placeholder="Select move-in date"
                disabled={isFormDisabled}
              />
              <FieldError field="moveInDate" />
            </div>
            <div>
              <Label htmlFor="availableUntil">Available Until</Label>
              <DatePicker
                id="availableUntil"
                value={availableUntil}
                onChange={setAvailableUntil}
                placeholder="Select end date"
                disabled={isFormDisabled}
              />
              <FieldError field="availableUntil" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="minStayMonths">Minimum Stay (Months)</Label>
              <Input
                id="minStayMonths"
                name="minStayMonths"
                type="number"
                min="1"
                step="1"
                value={minStayMonths}
                onChange={(e) => setMinStayMonths(e.target.value)}
                disabled={isFormDisabled}
              />
              <FieldError field="minStayMonths" />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "ACTIVE" | "PAUSED" | "RENTED")
                }
                disabled={isFormDisabled}
                className="mt-1 flex h-10 w-full rounded-md border border-outline-variant/20 bg-surface-canvas px-3 py-2 text-sm text-on-surface"
              >
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="RENTED">Rented</option>
              </select>
              <FieldError field="status" />
            </div>
          </div>

          <div>
            <Label htmlFor="expectedVersion">Expected Version</Label>
            <Input
              id="expectedVersion"
              name="expectedVersion"
              value={String(version)}
              readOnly
              disabled
            />
          </div>
        </div>

        <div className="pt-6 flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/listings/${listing.id}`)}
            disabled={isNavigationDisabled}
            size="lg"
            className="flex-1 h-14 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isFormDisabled}
            size="lg"
            className="flex-1 h-14 rounded-xl shadow-ambient-lg shadow-on-surface/10 text-lg"
            data-testid="listing-save-button"
          >
            {loading || pendingReload ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {pendingReload ? "Reloading..." : "Updating..."}
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </form>

      {navGuard.showDialog && (
        <AlertDialog open={navGuard.showDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
              <AlertDialogDescription>
                {navGuard.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={navGuard.onStay}>
                Stay
              </AlertDialogCancel>
              <AlertDialogAction onClick={navGuard.onLeave}>
                Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyEditListingForm({
  listing,
  migrationReview = null,
  enableWholeUnitMode = false,
  moderationWriteLocksEnabled = false,
}: EditListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    listing.householdLanguages || []
  );
  const [formModified, setFormModified] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [isWriteLocked, setIsWriteLocked] = useState(() =>
    resolveInitialWriteLock({
      moderationWriteLocksEnabled,
      statusReason: listing.statusReason,
    })
  );

  const submitAbortRef = useRef<AbortController | null>(null);

  // Cleanup: abort in-flight submit on unmount
  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort();
    };
  }, []);

  // Form field states for premium components
  const [description, setDescription] = useState(listing.description || "");
  const [moveInDate, setMoveInDate] = useState(
    formatDateForInput(listing.moveInDate)
  );
  const [availableUntil, setAvailableUntil] = useState(
    formatDateForInput(listing.availableUntil)
  );
  const [minStayMonths, setMinStayMonths] = useState(
    String(listing.minStayMonths ?? 1)
  );
  const [leaseDuration, setLeaseDuration] = useState(
    listing.leaseDuration || ""
  );
  const [roomType, setRoomType] = useState(listing.roomType || "");
  const [genderPreference, setGenderPreference] = useState(
    listing.genderPreference || ""
  );
  const [householdGender, setHouseholdGender] = useState(
    listing.householdGender || ""
  );
  const [bookingMode, setBookingMode] = useState(
    listing.bookingMode || "SHARED"
  );
  const isMigrationReviewMode = Boolean(migrationReview?.isReviewRequired);

  // Ref to track user-initiated roomType changes (prevents auto-set on mount/restore)
  const userChangedRoomType = useRef(false);

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

  // Image management state
  const [images, setImages] = useState<ImageObject[]>([]);
  const [imagesInitialized, setImagesInitialized] = useState(false);

  // Form persistence hook - unique key per listing
  const FORM_STORAGE_KEY = `edit-listing-draft-${listing.id}`;
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
  } = useFormPersistence<EditListingFormData>({ key: FORM_STORAGE_KEY });

  // Navigation guard for unsaved changes
  const navGuard = useNavigationGuard(
    formModified && !loading,
    "You have unsaved changes. Leave without saving?"
  );
  const isFieldDisabled = loading || isWriteLocked;
  const isNavigationDisabled = loading;

  useEffect(() => {
    setIsWriteLocked(
      resolveInitialWriteLock({
        moderationWriteLocksEnabled,
        statusReason: listing.statusReason,
      })
    );
  }, [listing.statusReason, moderationWriteLocksEnabled]);

  // Show draft banner when we have a draft and haven't restored yet
  useEffect(() => {
    if (isHydrated && hasDraft && !draftRestored) {
      setShowDraftBanner(true);
    }
  }, [isHydrated, hasDraft, draftRestored]);

  // Helper component for field-level errors
  const FieldError = ({ field }: { field: string }) => {
    if (!fieldErrors[field]) return null;
    return (
      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        {fieldErrors[field]}
      </p>
    );
  };

  // Collect current form data for saving
  const collectFormData = (): EditListingFormData => {
    const form = formRef.current;
    const currentImages = images
      .filter((img) => img.uploadedUrl && !img.error)
      .map((img) => ({ id: img.id, uploadedUrl: img.uploadedUrl! }));

    if (!form) {
      return {
        title: listing.title,
        description,
        price: String(listing.price),
        totalSlots: String(listing.totalSlots),
        address: listing.location?.address || "",
        city: listing.location?.city || "",
        state: listing.location?.state || "",
        zip: listing.location?.zip || "",
        amenities: listing.amenities.join(", "),
        houseRules: listing.houseRules.join(", "),
        moveInDate,
        availableUntil,
        minStayMonths,
        leaseDuration,
        roomType,
        genderPreference,
        householdGender,
        bookingMode,
        selectedLanguages,
        images: currentImages,
      };
    }

    return {
      title:
        (form.elements.namedItem("title") as HTMLInputElement)?.value || "",
      description: description,
      price:
        (form.elements.namedItem("price") as HTMLInputElement)?.value || "",
      totalSlots:
        (form.elements.namedItem("totalSlots") as HTMLInputElement)?.value ||
        "",
      address:
        (form.elements.namedItem("address") as HTMLInputElement)?.value || "",
      city: (form.elements.namedItem("city") as HTMLInputElement)?.value || "",
      state:
        (form.elements.namedItem("state") as HTMLInputElement)?.value || "",
      zip: (form.elements.namedItem("zip") as HTMLInputElement)?.value || "",
      amenities:
        (form.elements.namedItem("amenities") as HTMLInputElement)?.value || "",
      houseRules:
        (form.elements.namedItem("houseRules") as HTMLTextAreaElement)?.value ||
        "",
      moveInDate,
      availableUntil,
      minStayMonths,
      leaseDuration,
      roomType,
      genderPreference,
      householdGender,
      bookingMode,
      selectedLanguages,
      images: currentImages,
    };
  };

  // Restore draft data to form
  const restoreDraft = () => {
    if (!persistedData || !formRef.current) return;

    // Staleness check: discard draft if listing was updated after draft was saved
    if (savedAt && listing.updatedAt) {
      const draftTime = savedAt.getTime();
      const listingTime = new Date(listing.updatedAt).getTime();
      if (draftTime < listingTime) {
        clearPersistedData();
        setShowDraftBanner(false);
        setDraftRestored(true);
        return;
      }
    }

    const form = formRef.current;
    (form.elements.namedItem("title") as HTMLInputElement).value =
      persistedData.title || listing.title;
    setDescription(persistedData.description || listing.description);
    (form.elements.namedItem("price") as HTMLInputElement).value =
      persistedData.price || String(listing.price);
    (form.elements.namedItem("totalSlots") as HTMLInputElement).value =
      persistedData.totalSlots || String(listing.totalSlots);
    (form.elements.namedItem("address") as HTMLInputElement).value =
      persistedData.address || listing.location?.address || "";
    (form.elements.namedItem("city") as HTMLInputElement).value =
      persistedData.city || listing.location?.city || "";
    (form.elements.namedItem("state") as HTMLInputElement).value =
      persistedData.state || listing.location?.state || "";
    (form.elements.namedItem("zip") as HTMLInputElement).value =
      persistedData.zip || listing.location?.zip || "";
    (form.elements.namedItem("amenities") as HTMLInputElement).value =
      persistedData.amenities || listing.amenities.join(", ");
    (form.elements.namedItem("houseRules") as HTMLTextAreaElement).value =
      persistedData.houseRules || listing.houseRules.join(", ");

    setMoveInDate(
      persistedData.moveInDate || formatDateForInput(listing.moveInDate)
    );
    setAvailableUntil(
      persistedData.availableUntil || formatDateForInput(listing.availableUntil)
    );
    setMinStayMonths(
      persistedData.minStayMonths || String(listing.minStayMonths ?? 1)
    );
    setLeaseDuration(
      persistedData.leaseDuration || listing.leaseDuration || ""
    );
    setRoomType(persistedData.roomType || listing.roomType || "");
    setGenderPreference(
      persistedData.genderPreference || listing.genderPreference || ""
    );
    setHouseholdGender(
      persistedData.householdGender || listing.householdGender || ""
    );
    setBookingMode(
      persistedData.bookingMode || listing.bookingMode || "SHARED"
    );
    setSelectedLanguages(
      persistedData.selectedLanguages || listing.householdLanguages || []
    );

    // Restore images (they're already uploaded to Supabase)
    if (persistedData.images && persistedData.images.length > 0) {
      const restoredImages: ImageObject[] = persistedData.images.map((img) => ({
        id: img.id,
        previewUrl: img.uploadedUrl, // Use the uploaded URL as preview
        uploadedUrl: img.uploadedUrl,
        isUploading: false,
      }));
      setImages(restoredImages);
      setImagesInitialized(true);
    }

    setDraftRestored(true);
    setShowDraftBanner(false);
    setFormModified(true);
  };

  // Discard draft and use original listing data
  const discardDraft = () => {
    clearPersistedData();
    setShowDraftBanner(false);
    setDraftRestored(true);
  };

  // Auto-save form data on changes
  const handleFormChangeWithSave = () => {
    if (!formModified) {
      setFormModified(true);
    }
    if (!isHydrated) return;
    if (!draftRestored && hasDraft) return; // Don't overwrite existing draft until user decides
    const formData = collectFormData();
    saveData(formData);
  };

  // Save when controlled states change
  useEffect(() => {
    if (!isHydrated || (!draftRestored && hasDraft)) return;
    if (!formModified) return;
    const formData = collectFormData();
    saveData(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional dependency omission to prevent infinite loops
  }, [
    description,
    moveInDate,
    availableUntil,
    minStayMonths,
    leaseDuration,
    roomType,
    genderPreference,
    householdGender,
    bookingMode,
    selectedLanguages,
  ]);

  // Track form modifications (legacy - now merged with save)
  const handleFormChange = () => {
    handleFormChangeWithSave();
  };

  // Language search filter state
  const [languageSearch, setLanguageSearch] = useState("");

  // Get all language codes from canonical list
  const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

  // Filter languages based on search
  const filteredLanguages = useMemo(() => {
    if (!languageSearch.trim()) return LANGUAGE_CODES;
    const search = languageSearch.toLowerCase();
    return LANGUAGE_CODES.filter(
      (code) =>
        getLanguageName(code).toLowerCase().includes(search) ||
        code.toLowerCase().includes(search)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- LANGUAGE_CODES is a stable constant
  }, [languageSearch]);

  const toggleLanguage = (lang: string) => {
    setFormModified(true);
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  // Handle image changes from ImageUploader
  const handleImagesChange = (newImages: ImageObject[]) => {
    setImages(newImages);
    if (imagesInitialized) {
      setFormModified(true);
    } else {
      setImagesInitialized(true);
    }
  };

  // Check if any images are still uploading
  const isAnyImageUploading = images.some((img) => img.isUploading);
  // Retry handler for failed submissions
  const handleRetry = () => {
    setError("");
    setFieldErrors({});
    if (formRef.current) {
      formRef.current.requestSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isWriteLocked) {
      return;
    }
    setLoading(true);
    setError("");
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    const controller = new AbortController();
    submitAbortRef.current = controller;

    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          householdLanguages: selectedLanguages,
          moveInDate: moveInDate || undefined,
          availableUntil: isMigrationReviewMode
            ? availableUntil || null
            : undefined,
          minStayMonths:
            isMigrationReviewMode && minStayMonths.trim().length > 0
              ? Number(minStayMonths)
              : undefined,
          leaseDuration: leaseDuration || undefined,
          roomType: roomType || undefined,
          genderPreference: genderPreference || undefined,
          householdGender: householdGender || undefined,
          bookingMode: enableWholeUnitMode ? bookingMode : undefined,
          images: images
            .filter((img) => img.uploadedUrl)
            .map((img) => img.uploadedUrl),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        if (json.code === "LISTING_LOCKED") {
          setIsWriteLocked(true);
          setError("");
          setFieldErrors({});
          saveData(collectFormData());
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        // Handle field-level errors if provided
        if (json.fields) {
          setFieldErrors(json.fields);
        }
        throw new Error(json.error || "Failed to update listing");
      }

      // Clear draft and navigate on success
      cancelSave();
      clearPersistedData();
      navGuard.disable();
      setFormModified(false);
      if (isMigrationReviewMode) {
        router.refresh();
      } else {
        router.push(`/listings/${listing.id}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return; // Component unmounted
      Sentry.captureException(err, {
        tags: { component: "EditListingForm", action: "submit" },
      });
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      // Save current form state on error so nothing is lost
      saveData(collectFormData());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      submitAbortRef.current = null;
      setLoading(false);
    }
  };

  return (
    <>
      <Link
        data-testid="listing-cancel-button"
        href={`/listings/${listing.id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to listing
      </Link>

      {isWriteLocked && (
        <div className="bg-amber-50 border border-amber-100 px-4 py-4 rounded-xl mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Listing locked
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  {LISTING_LOCKED_ERROR_MESSAGE}
                </p>
                <p className="text-xs text-amber-700 mt-2">
                  Your unsaved edits remain available locally. Reload when you
                  want to check for an updated listing state.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
              disabled={loading}
              className="flex-shrink-0 text-amber-700 border-outline-variant/20 hover:bg-amber-100"
            >
              <RefreshCcw className="w-4 h-4 mr-1" />
              Reload page
            </Button>
          </div>
        </div>
      )}

      {!isWriteLocked && error && (
        <div className="bg-red-50 border border-red-100 px-4 py-4 rounded-xl mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">
                  Failed to save changes
                </p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
                <p className="text-xs text-red-500 mt-2">
                  Your changes have been saved locally and won&apos;t be lost.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={loading}
              className="flex-shrink-0 text-red-700 border-outline-variant/20 hover:bg-red-100"
            >
              <RefreshCcw className="w-4 h-4 mr-1" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Draft Resume Banner */}
      {showDraftBanner && savedAt && (
        <div className="bg-blue-50 border border-outline-variant/20 px-4 py-4 rounded-xl mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                You have unsaved edits
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
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={restoreDraft}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Resume Edits
            </Button>
          </div>
        </div>
      )}

      {crossTabConflict && (
        <div className="bg-yellow-50 border border-outline-variant/20 rounded-lg p-3 text-sm text-yellow-800 mb-4">
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
      {!showDraftBanner && savedAt && formModified && !loading && (
        <div className="flex items-center justify-end gap-2 mb-4 text-xs text-on-surface-variant animate-in fade-in duration-300">
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <span>Draft saved {formatTimeSince(savedAt)}</span>
        </div>
      )}

      <form
        ref={formRef}
        data-testid="edit-listing-form"
        onSubmit={handleSubmit}
        onChange={handleFormChange}
        className="space-y-12"
      >
        {/* Section 1: The Basics */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold font-display text-on-surface mb-6 flex items-center gap-2">
            <Home className="w-4 h-4" /> The Basics
          </h3>

          <div>
            <Label htmlFor="title">Listing Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={100}
              defaultValue={listing.title}
              placeholder="e.g. Sun-drenched Loft in Arts District"
              disabled={isFieldDisabled}
              data-testid="listing-title-input"
            />
            <FieldError field="title" />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              required
              rows={5}
              maxLength={1000}
              className="w-full bg-surface-canvas hover:bg-surface-container-high focus:bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-on-surface/5 focus:border-on-surface transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 resize-none leading-relaxed"
              placeholder="What makes your place special? Describe the vibe, the light, and the lifestyle..."
              disabled={isFieldDisabled}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="listing-description-input"
            />
            <FieldError field="description" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="price">Monthly Rent ($)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={listing.price}
                placeholder="2400"
                disabled={isFieldDisabled}
                data-testid="listing-price-input"
              />
              <FieldError field="price" />
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
                min="1"
                max="20"
                step="1"
                disabled={isFieldDisabled}
              />
              <FieldError field="totalSlots" />
            </div>
          </div>
        </div>

        <div className="h-px bg-surface-container-high w-full"></div>

        {/* Section 2: Photos */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold font-display text-on-surface mb-6 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" /> Photos
          </h3>

          <div id="images" className="space-y-2">
            <p className="text-sm text-on-surface-variant">
              Add photos of your space to attract potential roommates. The first
              image will be used as the main photo.
            </p>
            <ImageUploader
              initialImages={listing.images || []}
              onImagesChange={handleImagesChange}
              maxImages={10}
              uploadToCloud={true}
            />
            <FieldError field="images" />

            {images.length === 0 && (
              <p className="text-sm text-yellow-600 mt-2">
                At least one photo is required for your listing
              </p>
            )}

            {isAnyImageUploading && (
              <p className="text-sm text-blue-600 mt-2">
                Please wait for image uploads to complete before saving...
              </p>
            )}
          </div>
        </div>

        <div className="h-px bg-surface-container-high w-full"></div>

        {/* Section 3: Location */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold font-display text-on-surface mb-6 flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Location
          </h3>

          <div>
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              name="address"
              required
              maxLength={200}
              defaultValue={listing.location?.address || ""}
              placeholder="123 Boulevard St"
              disabled={isFieldDisabled}
            />
            <FieldError field="address" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                required
                maxLength={100}
                defaultValue={listing.location?.city || ""}
                placeholder="San Francisco"
                disabled={isFieldDisabled}
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                name="state"
                required
                maxLength={100}
                defaultValue={listing.location?.state || ""}
                placeholder="CA"
                disabled={isFieldDisabled}
              />
            </div>
            <div>
              <Label htmlFor="zip">Zip Code</Label>
              <Input
                id="zip"
                name="zip"
                required
                maxLength={20}
                defaultValue={listing.location?.zip || ""}
                placeholder="94103"
                disabled={isFieldDisabled}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-surface-container-high w-full"></div>

        {/* Section 3: Details */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold font-display text-on-surface mb-6 flex items-center gap-2">
            <List className="w-4 h-4" /> Finer Details
          </h3>

          <div>
            <Label htmlFor="amenities">Amenities</Label>
            <Input
              id="amenities"
              name="amenities"
              defaultValue={listing.amenities.join(", ")}
              placeholder="Wifi, Gym, Washer/Dryer, Roof Deck..."
              disabled={isFieldDisabled}
            />
            <p className="text-xs text-on-surface-variant mt-2 pl-1">
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
              disabled={isFieldDisabled}
            />
            <p className="text-xs text-on-surface-variant mt-2 pl-1">
              When can tenants move in? (Optional)
            </p>
          </div>

          {isMigrationReviewMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="availableUntil">Available Until</Label>
                <DatePicker
                  id="availableUntil"
                  value={availableUntil}
                  onChange={setAvailableUntil}
                  placeholder="Select availability end date"
                  disabled={isFieldDisabled}
                />
                <p className="text-xs text-on-surface-variant mt-2 pl-1">
                  Keep this blank for open-ended availability, or choose a
                  future date before review.
                </p>
                <FieldError field="availableUntil" />
              </div>
              <div>
                <Label htmlFor="minStayMonths">Minimum Stay (Months)</Label>
                <Input
                  id="minStayMonths"
                  name="minStayMonths"
                  type="number"
                  min="1"
                  step="1"
                  value={minStayMonths}
                  onChange={(e) => setMinStayMonths(e.target.value)}
                  disabled={isFieldDisabled}
                />
                <p className="text-xs text-on-surface-variant mt-2 pl-1">
                  Host-managed listings require a minimum stay of at least 1
                  month.
                </p>
                <FieldError field="minStayMonths" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="leaseDuration">Lease Duration</Label>
              <Select
                value={leaseDuration}
                onValueChange={setLeaseDuration}
                disabled={isFieldDisabled}
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
                disabled={isFieldDisabled}
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

          {/* Booking Mode Selector (behind feature flag) */}
          {enableWholeUnitMode && (
            <fieldset className="space-y-3" disabled={isFieldDisabled}>
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
                    disabled={isFieldDisabled}
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
                    disabled={isFieldDisabled}
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
              <FieldError field="bookingMode" />
            </fieldset>
          )}

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
                    onClick={() => toggleLanguage(code)}
                    disabled={isFieldDisabled}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-on-surface text-white disabled:cursor-not-allowed disabled:opacity-60"
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
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              className="mb-3"
              disabled={isFieldDisabled}
            />

            {/* Language chips */}
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {filteredLanguages
                .filter((code) => !selectedLanguages.includes(code))
                .map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleLanguage(code)}
                    disabled={isFieldDisabled}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 bg-surface-container-high text-on-surface-variant hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getLanguageName(code)}
                  </button>
                ))}
              {filteredLanguages.filter(
                (code) => !selectedLanguages.includes(code)
              ).length === 0 && (
                <p className="text-sm text-on-surface-variant">
                  {languageSearch
                    ? "No languages found"
                    : "All languages selected"}
                </p>
              )}
            </div>
            <FieldError field="householdLanguages" />
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
                disabled={isFieldDisabled}
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
                disabled={isFieldDisabled}
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
            <textarea
              id="houseRules"
              name="houseRules"
              rows={3}
              className="w-full bg-surface-canvas hover:bg-surface-container-high focus:bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-on-surface/5 focus:border-on-surface transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 resize-none"
              placeholder="No smoking, quiet hours after 10pm, no pets..."
              disabled={isFieldDisabled}
              defaultValue={listing.houseRules.join(", ")}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="pt-6 flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/listings/${listing.id}`)}
            disabled={isNavigationDisabled}
            size="lg"
            className="flex-1 h-14 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              isFieldDisabled || isAnyImageUploading || images.length === 0
            }
            size="lg"
            className="flex-1 h-14 rounded-xl shadow-ambient-lg shadow-on-surface/10 text-lg"
            data-testid="listing-save-button"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Updating...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </form>

      {navGuard.showDialog && (
        <AlertDialog open={navGuard.showDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
              <AlertDialogDescription>
                {navGuard.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={navGuard.onStay}>
                Stay
              </AlertDialogCancel>
              <AlertDialogAction onClick={navGuard.onLeave}>
                Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

export default function EditListingForm(props: EditListingFormProps) {
  return <HostManagedEditListingForm {...props} />;
}
