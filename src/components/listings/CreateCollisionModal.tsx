"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { CollisionSibling } from "@/lib/listings/collision-detector";
import { cn } from "@/lib/utils";

interface CreateCollisionModalProps {
  open: boolean;
  siblings: CollisionSibling[];
  onUpdate: (sibling: CollisionSibling) => void;
  onAddDate: (sibling: CollisionSibling) => void;
  onCreateSeparate: (reason: string) => void;
  onCancel: () => void;
}

type CollisionChoice = "update" | "add-date" | "create-separate" | null;

function parseDate(value: string | null): Date | null {
  if (!value) return null;

  const directMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (directMatch) {
    const [, year, month, day] = directMatch;
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0)
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatShortDate(value: string | null): string {
  const parsed = parseDate(value);
  if (!parsed) return "an unknown date";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function getListingCountCopy(count: number): string {
  return `You already have ${count} listing${count === 1 ? "" : "s"} at this address.`;
}

function OptionCard({
  checked,
  disabled = false,
  inputId,
  title,
  description,
  testId,
  value,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  inputId: string;
  title: string;
  description?: string;
  testId: string;
  value: Exclude<CollisionChoice, null>;
  onChange: (value: Exclude<CollisionChoice, null>) => void;
}) {
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
        checked
          ? "border-primary/60 bg-primary/5"
          : "border-outline-variant/20 bg-surface-container-lowest",
        disabled &&
          "cursor-not-allowed border-outline-variant/10 bg-surface-container-high/40 text-on-surface-variant"
      )}
    >
      <input
        id={inputId}
        type="radio"
        name="collision-choice"
        className="mt-1 h-4 w-4 accent-current"
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={() => onChange(value)}
      />
      <span className="space-y-1">
        <span className="block text-sm font-semibold text-on-surface">
          {title}
        </span>
        {description ? (
          <span className="block text-sm text-on-surface-variant">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function CreateCollisionModal({
  open,
  siblings,
  onUpdate,
  onAddDate,
  onCreateSeparate,
  onCancel,
}: CreateCollisionModalProps) {
  const [choice, setChoice] = useState<CollisionChoice>(null);
  const [createSeparateReason, setCreateSeparateReason] = useState("");
  const primarySibling = siblings[0] ?? null;

  const canContinue = useMemo(() => {
    if (!choice || !primarySibling) return false;
    if (choice === "create-separate") {
      const trimmedReason = createSeparateReason.trim();
      return trimmedReason.length >= 10 && trimmedReason.length <= 500;
    }
    return true;
  }, [choice, createSeparateReason, primarySibling]);

  if (!primarySibling) {
    return null;
  }

  const resetState = () => {
    setChoice(null);
    setCreateSeparateReason("");
  };

  const handleCancel = () => {
    resetState();
    onCancel();
  };

  const handleContinue = () => {
    if (!canContinue) return;

    if (choice === "update") {
      resetState();
      onUpdate(primarySibling);
      return;
    }

    if (choice === "add-date") {
      resetState();
      onAddDate(primarySibling);
      return;
    }

    const trimmedReason = createSeparateReason.trim();
    resetState();
    onCreateSeparate(trimmedReason);
  };

  const primaryTitle = primarySibling.title?.trim() || "another listing";
  const listingCountCopy = getListingCountCopy(siblings.length);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleCancel()}>
      <DialogContent
        data-testid="collision-modal"
        role="dialog"
        aria-modal="true"
        className="max-w-[min(92vw,36rem)] gap-5 rounded-3xl border border-outline-variant/20 p-5 sm:p-6 [&>button.absolute]:hidden"
      >
        <DialogHeader className="space-y-3 text-left">
          <DialogTitle className="text-xl font-semibold text-on-surface">
            You already have a listing at this address
          </DialogTitle>
          <DialogDescription className="space-y-2 text-sm leading-6 text-on-surface-variant">
            <p>{listingCountCopy}</p>
            <p>
              You posted {primaryTitle} at this address on{" "}
              {formatShortDate(primarySibling.createdAt)}, available from{" "}
              {formatShortDate(primarySibling.moveInDate)}. Adding a second
              listing may confuse renters. What would you like to do?
            </p>
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-3" aria-label="Collision resolution options">
          <OptionCard
            checked={choice === "update"}
            disabled={!primarySibling.canUpdate}
            inputId="collision-option-update"
            title="Update the existing listing"
            description={
              primarySibling.canUpdate
                ? undefined
                : "This listing is closed to updates."
            }
            testId="collision-radio-update"
            value="update"
            onChange={setChoice}
          />
          <OptionCard
            checked={choice === "add-date"}
            inputId="collision-option-add-date"
            title="Post as an additional start date"
            description="We will create a second listing with your new move-in date - renters will see them grouped together."
            testId="collision-radio-add-date"
            value="add-date"
            onChange={setChoice}
          />
          <OptionCard
            checked={choice === "create-separate"}
            inputId="collision-option-create-separate"
            title="Create a separate listing anyway"
            description="We will show this as a separate listing."
            testId="collision-radio-create-separate"
            value="create-separate"
            onChange={setChoice}
          />
        </fieldset>

        {choice === "create-separate" ? (
          <div className="space-y-2">
            <label
              htmlFor="collision-reason-textarea"
              className="text-sm font-medium text-on-surface"
            >
              Why should this stay separate?
            </label>
            <Textarea
              id="collision-reason-textarea"
              data-testid="collision-reason-textarea"
              minLength={10}
              maxLength={500}
              required
              value={createSeparateReason}
              onChange={(event) => setCreateSeparateReason(event.target.value)}
              placeholder="Enter at least 10 characters."
            />
            <p className="text-xs text-on-surface-variant">
              {createSeparateReason.trim().length}/500 characters
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-3 sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            data-testid="collision-cancel"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="collision-continue"
            disabled={!canContinue}
            onClick={handleContinue}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
