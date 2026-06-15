"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Loader2,
  Home,
  List,
  ArrowLeft,
  RefreshCcw,
  AlertCircle,
  ImageIcon,
} from "lucide-react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
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
import ImageUploader from "@/components/listings/ImageUploader";
import ListingFreshnessCheck from "@/components/ListingFreshnessCheck";
import { VALID_HOUSE_RULES } from "@/lib/filter-schema";
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

const DESCRIPTION_MAX_LENGTH = 1000;

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const normalizeExistingHouseRules = (values: string[]) =>
  values
    .map((value) =>
      VALID_HOUSE_RULES.find(
        (allowed) => allowed.toLowerCase() === value.toLowerCase()
      )
    )
    .filter((value): value is (typeof VALID_HOUSE_RULES)[number] =>
      Boolean(value)
    );

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
  statusReason?: string | null;
}) {
  return getModerationWriteLockReason(options.statusReason) !== null;
}

function HostManagedEditListingForm({
  listing,
  migrationReview: _migrationReview = null,
}: EditListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string | string[]>
  >({});
  const [version, setVersion] = useState(listing.version ?? 0);
  const [detailsModified, setDetailsModified] = useState(false);
  const [availabilityModified, setAvailabilityModified] = useState(false);
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description || "");
  const [price, setPrice] = useState(String(listing.price));
  const [amenities, setAmenities] = useState(listing.amenities.join(", "));
  const [images, setImages] = useState<ImageObject[]>([]);
  const [imageBaseline, setImageBaseline] = useState(listing.images || []);
  const [imageUploaderVersion, setImageUploaderVersion] = useState(0);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [availabilitySaved, setAvailabilitySaved] = useState(false);
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
      statusReason: listing.statusReason,
    })
  );
  const detailsFormRef = useRef<HTMLFormElement>(null);
  const availabilityFormRef = useRef<HTMLFormElement>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const previousSnapshotKeyRef = useRef<string | null>(null);
  const pendingReloadSnapshotKeyRef = useRef<string | null>(null);
  const lastFailedFormRef = useRef<"details" | "availability">("availability");
  const imagesInitializedRef = useRef(false);
  const isDirty = detailsModified || availabilityModified;
  const navGuard = useNavigationGuard(
    isDirty && !loading && !detailsLoading && !pendingReload,
    "You have unsaved changes. Leave without saving?"
  );
  const isBusy = loading || detailsLoading;
  const isDetailsFormDisabled = isBusy || pendingReload || isWriteLocked;
  const isFormDisabled = isBusy || pendingReload || isWriteLocked;
  const isNavigationDisabled = isBusy || pendingReload;
  const isAnyImageUploading = images.some((img) => img.isUploading);
  const currentImageUrls = useMemo(
    () =>
      images
        .filter((img) => img.uploadedUrl && !img.error)
        .map((img) => img.uploadedUrl!),
    [images]
  );
  const imagesChanged = !areStringArraysEqual(currentImageUrls, imageBaseline);

  const markDetailsDirty = useCallback(() => {
    setDetailsSaved(false);
    setAvailabilitySaved(false);
    setDetailsModified(true);
  }, []);

  const markAvailabilityDirty = useCallback(() => {
    setDetailsSaved(false);
    setAvailabilitySaved(false);
    setAvailabilityModified(true);
  }, []);

  const latestSnapshot = useMemo(
    () => ({
      version: listing.version ?? 0,
      title: listing.title,
      description: listing.description || "",
      price: String(listing.price),
      amenities: listing.amenities.join(", "),
      images: listing.images || [],
      moveInDate: formatDateForInput(listing.moveInDate),
      availableUntil: formatDateForInput(listing.availableUntil),
      status: listing.status ?? "ACTIVE",
      openSlots: String(listing.openSlots ?? 0),
      totalSlots: String(listing.totalSlots),
      minStayMonths: String(listing.minStayMonths ?? 1),
    }),
    [
      listing.amenities,
      listing.availableUntil,
      listing.description,
      listing.images,
      listing.minStayMonths,
      listing.moveInDate,
      listing.openSlots,
      listing.price,
      listing.status,
      listing.title,
      listing.totalSlots,
      listing.version,
    ]
  );

  const latestSnapshotKey = useMemo(
    () =>
      [
        latestSnapshot.version,
        latestSnapshot.title,
        latestSnapshot.description,
        latestSnapshot.price,
        latestSnapshot.amenities,
        latestSnapshot.images.join(","),
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
    setTitle(latestSnapshot.title);
    setDescription(latestSnapshot.description);
    setPrice(latestSnapshot.price);
    setAmenities(latestSnapshot.amenities);
    setImageBaseline(latestSnapshot.images);
    setImages(
      latestSnapshot.images.map((url, index) => ({
        id: `initial-${index}`,
        previewUrl: url,
        uploadedUrl: url,
      }))
    );
    imagesInitializedRef.current = false;
    setImageUploaderVersion((key) => key + 1);
    setMoveInDate(latestSnapshot.moveInDate);
    setAvailableUntil(latestSnapshot.availableUntil);
    setStatus(latestSnapshot.status);
    setOpenSlots(latestSnapshot.openSlots);
    setTotalSlots(latestSnapshot.totalSlots);
    setMinStayMonths(latestSnapshot.minStayMonths);
    setError("");
    setFieldErrors({});
    setReloadSuggested(false);
    setDetailsSaved(false);
    setAvailabilitySaved(false);
    setDetailsModified(false);
    setAvailabilityModified(false);
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
        statusReason: listing.statusReason,
      })
    );
  }, [listing.statusReason]);

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

    if (!isDirty) {
      hydrateFromListing();
      return;
    }

    setReloadSuggested(true);
  }, [hydrateFromListing, isDirty, latestSnapshotKey, pendingReload]);

  const FieldError = ({ field }: { field: string }) => {
    const error = fieldErrors[field];
    if (!error) return null;
    const message = Array.isArray(error) ? error[0] : error;
    if (!message) return null;
    return (
      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        {message}
      </p>
    );
  };

  const splitCommaList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleImagesChange = useCallback((newImages: ImageObject[]) => {
    setImages(newImages);
    if (imagesInitializedRef.current) {
      markDetailsDirty();
    } else {
      imagesInitializedRef.current = true;
    }
  }, [markDetailsDirty]);

  const handleDetailsSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendingReload || isWriteLocked || isAnyImageUploading) {
      return;
    }

    setDetailsLoading(true);
    setError("");
    setFieldErrors({});
    setReloadSuggested(false);
    setDetailsSaved(false);
    lastFailedFormRef.current = "details";

    const controller = new AbortController();
    submitAbortRef.current = controller;

    try {
      const detailsPayload = {
        expectedVersion: version,
        title,
        description,
        price: Number(price),
        amenities: splitCommaList(amenities),
        houseRules: normalizeExistingHouseRules(listing.houseRules),
        address: listing.location?.address || "",
        city: listing.location?.city || "",
        state: listing.location?.state || "",
        zip: listing.location?.zip || "",
        leaseDuration: listing.leaseDuration,
        roomType: listing.roomType,
        bookingMode: listing.bookingMode,
        householdLanguages: listing.householdLanguages,
        genderPreference: listing.genderPreference,
        householdGender: listing.householdGender,
        ...(imagesChanged && { images: currentImageUrls }),
      };

      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(detailsPayload),
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

        throw new Error(json.error || "Failed to update listing details");
      }

      if (typeof json.version === "number") {
        setVersion(json.version);
      }

      setDetailsModified(false);
      setImageBaseline(currentImageUrls);
      setDetailsSaved(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      Sentry.captureException(err, {
        tags: { component: "EditListingForm", action: "details_submit" },
      });
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      submitAbortRef.current = null;
      setDetailsLoading(false);
    }
  };

  const handleAvailabilitySubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    if (pendingReload || isWriteLocked) {
      return;
    }

    setLoading(true);
    setError("");
    setFieldErrors({});
    setReloadSuggested(false);
    setDetailsSaved(false);
    lastFailedFormRef.current = "availability";
    const shouldStayOnPage = detailsModified;

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

      setAvailabilityModified(false);

      if (shouldStayOnPage) {
        setAvailabilitySaved(true);
      } else {
        navGuard.disable();
        router.push(`/listings/${listing.id}`);
      }
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

  const retryLastFailedSave = () => {
    if (lastFailedFormRef.current === "details") {
      detailsFormRef.current?.requestSubmit();
      return;
    }
    availabilityFormRef.current?.requestSubmit();
  };

  return (
    <>
      <Link
        data-testid="listing-cancel-button"
        href={`/listings/${listing.id}`}
        className="inline-flex items-center text-sm text-on-surface-variant hover:text-on-surface mb-6"
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
                  : retryLastFailedSave()
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

      {detailsSaved && !error && !reloadSuggested && (
        <div className="bg-green-50 border border-green-100 px-4 py-4 rounded-xl mb-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-900">
                Listing details saved
              </p>
              <p className="text-sm text-green-700 mt-1">
                Your title, description, price, amenities, and photos are up to
                date.
              </p>
            </div>
          </div>
        </div>
      )}

      {availabilitySaved && !error && !reloadSuggested && (
        <div className="bg-green-50 border border-green-100 px-4 py-4 rounded-xl mb-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-900">
                Availability saved
              </p>
              <p className="text-sm text-green-700 mt-1">
                Your unsaved listing details are still on this page.
              </p>
            </div>
          </div>
        </div>
      )}

      <form
        ref={detailsFormRef}
        data-testid="edit-listing-form"
        onSubmit={handleDetailsSubmit}
        onChange={markDetailsDirty}
        className="space-y-8"
      >
        <div className="space-y-6">
          <h3 className="text-lg font-semibold font-display text-on-surface flex items-center gap-2">
            <Home className="w-4 h-4" /> Listing details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="title">Listing Title</Label>
              <Input
                id="title"
                name="title"
                required
                maxLength={100}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDetailsDirty();
                }}
                placeholder="e.g. Sun-drenched Loft in Arts District"
                disabled={isDetailsFormDisabled}
                data-testid="listing-title-input"
              />
              <FieldError field="title" />
            </div>
            <div>
              <Label htmlFor="price">Monthly Rent ($)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  markDetailsDirty();
                }}
                placeholder="2400"
                disabled={isDetailsFormDisabled}
                data-testid="listing-price-input"
              />
              <FieldError field="price" />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              required
              rows={5}
              maxLength={DESCRIPTION_MAX_LENGTH}
              className="w-full bg-surface-canvas hover:bg-surface-container-high focus:bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-on-surface/5 focus:border-on-surface transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 resize-none leading-relaxed"
              placeholder="What makes your place special? Describe the vibe, the light, and the lifestyle..."
              disabled={isDetailsFormDisabled}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                markDetailsDirty();
              }}
              data-testid="listing-description-input"
            />
            <div className="flex items-start justify-between gap-4 mt-1">
              <FieldError field="description" />
              <CharacterCounter
                current={description.length}
                max={DESCRIPTION_MAX_LENGTH}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="amenities">Amenities</Label>
            <Input
              id="amenities"
              name="amenities"
              value={amenities}
              onChange={(e) => {
                setAmenities(e.target.value);
                markDetailsDirty();
              }}
              placeholder="Wifi, Gym, Washer/Dryer, Roof Deck..."
              disabled={isDetailsFormDisabled}
            />
            <p className="text-xs text-on-surface-variant mt-2 pl-1">
              Separate amenities with commas
            </p>
            <FieldError field="amenities" />
          </div>

          <div id="images" className="space-y-2">
            <h4 className="text-sm font-medium text-on-surface flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Photos
            </h4>
            <p className="text-sm text-on-surface-variant">
              Add photos of your space to attract potential roommates. The first
              image will be used as the main photo.
            </p>
            <ImageUploader
              key={imageUploaderVersion}
              initialImages={listing.images || []}
              onImagesChange={handleImagesChange}
              maxImages={10}
              uploadToCloud={true}
            />
            <FieldError field="images" />

            {imagesChanged && currentImageUrls.length === 0 && (
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
              isDetailsFormDisabled ||
              isAnyImageUploading ||
              (imagesChanged && currentImageUrls.length === 0)
            }
            size="lg"
            className="flex-1 h-14 rounded-xl shadow-ambient-lg shadow-on-surface/10 text-lg"
            data-testid="listing-save-button"
          >
            {detailsLoading || pendingReload ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {pendingReload ? "Reloading..." : "Saving..."}
              </>
            ) : (
              "Save Details"
            )}
          </Button>
        </div>
      </form>

      <form
        ref={availabilityFormRef}
        onSubmit={handleAvailabilitySubmit}
        onChange={markAvailabilityDirty}
        className="space-y-8 mt-12"
      >
        <div className="space-y-6">
          <h3 className="text-lg font-semibold font-display text-on-surface flex items-center gap-2">
            <List className="w-4 h-4" /> Availability &amp; status
          </h3>

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
                onChange={(e) => {
                  setOpenSlots(e.target.value);
                  markAvailabilityDirty();
                }}
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
                onChange={(e) => {
                  setTotalSlots(e.target.value);
                  markAvailabilityDirty();
                }}
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
                onChange={(value) => {
                  setMoveInDate(value);
                  markAvailabilityDirty();
                }}
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
                onChange={(value) => {
                  setAvailableUntil(value);
                  markAvailabilityDirty();
                }}
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
                onChange={(e) => {
                  setMinStayMonths(e.target.value);
                  markAvailabilityDirty();
                }}
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
                onChange={(e) => {
                  setStatus(e.target.value as "ACTIVE" | "PAUSED" | "RENTED");
                  markAvailabilityDirty();
                }}
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
            data-testid="listing-availability-save-button"
          >
            {loading || pendingReload ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {pendingReload ? "Reloading..." : "Updating..."}
              </>
            ) : (
              "Save Availability"
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
