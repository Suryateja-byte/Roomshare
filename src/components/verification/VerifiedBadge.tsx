import { ShieldCheck } from 'lucide-react';

export default function VerifiedBadge() {
    return (
        <div className="inline-flex items-center gap-1 text-green-600" title="Verified User">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Verified</span>
        </div>
    );
}
