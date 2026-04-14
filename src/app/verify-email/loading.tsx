import { Loader2 } from "lucide-react";

export default function VerifyEmailLoading() {
  return (
    <div className="min-h-screen bg-surface-canvas flex items-center justify-center px-4">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-on-surface-variant animate-spin mx-auto mb-4" />
        <p className="text-on-surface-variant">Loading verification page...</p>
      </div>
    </div>
  );
}
