import Link from "next/link";

export default function AuthPageLogo() {
  return (
    <Link href="/" className="lg:hidden inline-flex items-center gap-2.5 mb-8 group">
      <div className="w-9 h-9 bg-on-surface rounded-lg flex items-center justify-center text-surface-container-lowest font-bold text-xl shadow-ambient shadow-on-surface/10">
        R
      </div>
      <span className="text-xl font-display font-semibold tracking-[-0.03em] text-on-surface">
        RoomShare<span className="text-primary">.</span>
      </span>
    </Link>
  );
}
