"use client";

import { toast } from "sonner";

interface ComingSoonButtonProps {
  children: React.ReactNode;
  className?: string;
}

export default function ComingSoonButton({
  children,
  className,
}: ComingSoonButtonProps) {
  return (
    <button
      type="button"
      onClick={() => toast.info("Coming soon")}
      className={className}
    >
      {children}
    </button>
  );
}
