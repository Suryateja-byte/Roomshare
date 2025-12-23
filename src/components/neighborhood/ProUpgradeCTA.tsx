'use client';

/**
 * ProUpgradeCTA - Upgrade prompt for Free users
 *
 * Displays a visually appealing call-to-action encouraging users
 * to upgrade to Pro for enhanced neighborhood intelligence features:
 * - Interactive map with POI pins
 * - Exact distances on every place
 * - Walkability rings visualization
 */

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ProUpgradeCTAProps {
  /** Number of places found (shown in the CTA) */
  placeCount?: number;
  /** Callback when upgrade button is clicked */
  onUpgradeClick?: () => void;
  /** Optional class name for styling */
  className?: string;
}

export function ProUpgradeCTA({
  placeCount = 0,
  onUpgradeClick,
  className = '',
}: ProUpgradeCTAProps) {
  const handleUpgradeClick = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else {
      // Default: navigate to upgrade page
      window.location.href = '/settings?tab=subscription';
    }
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardContent className="p-0">
        {/* Blurred map preview background */}
        <div className="relative">
          <div
            className="h-48 bg-gradient-to-br from-blue-100 via-blue-50 to-green-50 dark:from-blue-950 dark:via-slate-900 dark:to-green-950"
            aria-hidden="true"
          >
            {/* Simulated map elements */}
            <div className="absolute inset-0 overflow-hidden">
              {/* Grid lines */}
              <div className="absolute inset-0 opacity-10">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={`h-${i}`}
                    className="absolute h-px bg-current w-full"
                    style={{ top: `${(i + 1) * 12.5}%` }}
                  />
                ))}
                {[...Array(8)].map((_, i) => (
                  <div
                    key={`v-${i}`}
                    className="absolute w-px bg-current h-full"
                    style={{ left: `${(i + 1) * 12.5}%` }}
                  />
                ))}
              </div>

              {/* Center marker */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-4 h-4 rounded-full bg-primary/80 ring-4 ring-primary/30" />
              </div>

              {/* Walkability rings */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-green-400/40 dark:border-green-500/30" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-2 border-dashed border-yellow-400/30 dark:border-yellow-500/20" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full border-2 border-dashed border-orange-400/20 dark:border-orange-500/15" />
              </div>

              {/* Simulated POI markers */}
              {placeCount > 0 && (
                <>
                  <div className="absolute top-[30%] left-[40%] w-2 h-2 rounded-full bg-red-400/60" />
                  <div className="absolute top-[45%] left-[65%] w-2 h-2 rounded-full bg-red-400/60" />
                  <div className="absolute top-[60%] left-[35%] w-2 h-2 rounded-full bg-red-400/60" />
                  <div className="absolute top-[35%] left-[55%] w-2 h-2 rounded-full bg-red-400/60" />
                  <div className="absolute top-[55%] left-[70%] w-2 h-2 rounded-full bg-red-400/60" />
                </>
              )}
            </div>

            {/* Blur overlay */}
            <div className="absolute inset-0 backdrop-blur-[3px] bg-background/30 dark:bg-background/40" />
          </div>

          {/* CTA Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <div className="bg-background/90 dark:bg-background/95 rounded-xl p-4 shadow-lg border max-w-xs">
              <div className="flex items-center justify-center gap-2 mb-2">
                <MapIcon className="h-5 w-5 text-primary" />
                <span className="font-semibold text-lg">Pro Feature</span>
              </div>

              <p className="text-sm text-muted-foreground mb-3">
                Unlock the interactive map with{' '}
                {placeCount > 0 ? (
                  <span className="font-medium text-foreground">{placeCount} nearby places</span>
                ) : (
                  'nearby places'
                )}
                , exact walking distances, and walkability rings.
              </p>

              <div className="space-y-2 text-xs text-muted-foreground mb-4">
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                  <span>Interactive map with POI pins</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                  <span>Walking time on every place</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                  <span>5/10/15 min walkability rings</span>
                </div>
              </div>

              <Button
                onClick={handleUpgradeClick}
                className="w-full"
                size="sm"
              >
                Upgrade to Pro
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default ProUpgradeCTA;
