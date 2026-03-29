"use client";

import { toast } from "sonner";

interface ComingSoonButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export default function ComingSoonButton({
  children,
  className,
  ...props
}: ComingSoonButtonProps) {
  return (
    <button
      type="button"
      onClick={() => toast.info("Coming soon")}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}
