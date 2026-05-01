"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { triggerLightHaptic } from "@/lib/haptics";

interface FavoriteButtonProps {
  listingId: string;
  initialIsSaved?: boolean;
  className?: string;
}

export default function FavoriteButton({
  listingId,
  initialIsSaved = false,
  className,
}: FavoriteButtonProps) {
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const [isLoading, setIsLoading] = useState(false);
  const [animating, setAnimating] = useState(false);
  const userTouchedRef = useRef(false);
  const previousListingIdRef = useRef(listingId);
  const router = useRouter();

  useEffect(() => {
    if (previousListingIdRef.current !== listingId) {
      previousListingIdRef.current = listingId;
      userTouchedRef.current = false;
      setIsSaved(initialIsSaved);
      setAnimating(false);
      return;
    }

    if (!userTouchedRef.current) {
      setIsSaved(initialIsSaved);
    }
  }, [initialIsSaved, listingId]);

  // P2-3: Memoize handler to improve INP by preventing function recreation on each render
  const toggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isLoading) return;

      setIsLoading(true);
      userTouchedRef.current = true;
      triggerLightHaptic();
      // Optimistic update with bounce animation on save
      const previousState = isSaved;
      const willSave = !isSaved;
      setIsSaved(willSave);
      if (willSave) {
        setAnimating(true);
        setTimeout(() => setAnimating(false), 400);
      }

      try {
        const response = await fetch("/api/favorites", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ listingId }),
        });

        if (response.status === 401) {
          // Redirect to login if unauthorized
          router.push("/login");
          setIsSaved(previousState); // Revert
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to toggle favorite");
        }

        const data = await response.json();
        setIsSaved(data.saved);
      } catch (error) {
        console.error("Error toggling favorite:", error);
        setIsSaved(previousState); // Revert on error
        toast.error("Couldn\u2019t update saved listings. Try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, isSaved, listingId, router]
  );

  return (
    <button
      onClick={toggleFavorite}
      disabled={isLoading}
      aria-label={isSaved ? "Remove from saved" : "Save listing"}
      aria-pressed={isSaved}
      className={cn(
        "p-2 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm hover:bg-surface-container-lowest transition-colors shadow-ambient-sm group min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
        isSaved ? "text-primary" : "text-on-surface-variant hover:text-primary",
        className
      )}
    >
      <Heart
        className={cn(
          "w-4 h-4 transition-all duration-300",
          isSaved ? "fill-current scale-110" : "scale-100",
          animating && "animate-heart-bounce"
        )}
      />
    </button>
  );
}
