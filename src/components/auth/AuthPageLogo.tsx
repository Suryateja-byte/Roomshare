import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface AuthPageLogoProps {
  className?: string;
  imageClassName?: string;
}

export default function AuthPageLogo({
  className,
  imageClassName,
}: AuthPageLogoProps) {
  return (
    <Link
      href="/"
      className={cn("lg:hidden inline-flex items-center mb-8 group", className)}
      aria-label="RoomShare home"
    >
      <Image
        src="/images/home/rs-logo.svg?v=2"
        alt=""
        width={166}
        height={40}
        className={cn("h-10 w-auto", imageClassName)}
      />
      <span className="sr-only">RoomShare</span>
    </Link>
  );
}
