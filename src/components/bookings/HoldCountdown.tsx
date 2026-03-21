"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Clock } from "lucide-react";

interface HoldCountdownProps {
  heldUntil: string;
  holdTtlMinutes?: number;
  onExpired?: () => void;
}

function getRemainingMs(heldUntil: string): number {
  return Math.max(0, new Date(heldUntil).getTime() - Date.now());
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getUrgencyColor(remainingMs: number, ttlMs: number): string {
  if (remainingMs <= 0) {
    return "text-zinc-400 dark:text-zinc-500";
  }
  const ratio = remainingMs / ttlMs;
  if (ratio > 0.5) {
    return "text-green-600 dark:text-green-400";
  }
  if (remainingMs > 2 * 60 * 1000) {
    return "text-amber-600 dark:text-amber-400";
  }
  return "text-red-600 dark:text-red-400 animate-pulse";
}

export default function HoldCountdown({
  heldUntil,
  holdTtlMinutes = 15,
  onExpired,
}: HoldCountdownProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    getRemainingMs(heldUntil)
  );
  const expiredRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  const handleExpiry = useCallback(() => {
    if (!expiredRef.current) {
      expiredRef.current = true;
      onExpiredRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (getRemainingMs(heldUntil) <= 0) {
      handleExpiry();
      return;
    }

    const interval = setInterval(() => {
      const ms = getRemainingMs(heldUntil);
      setRemainingMs(ms);
      if (ms <= 0) {
        clearInterval(interval);
        handleExpiry();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [heldUntil, handleExpiry]);

  const ttlMs = holdTtlMinutes * 60 * 1000;
  const colorClass = getUrgencyColor(remainingMs, ttlMs);

  if (remainingMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">
        <Clock className="w-3 h-3" />
        Hold expired
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${colorClass}`}
    >
      <Clock className="w-3 h-3" />
      {formatCountdown(remainingMs)}
    </span>
  );
}
