const shimmer =
  "animate-shimmer bg-gradient-to-r from-surface-container-high via-surface-canvas to-surface-container-high bg-[length:200%_100%]";

/**
 * Suspense fallback for FeaturedListings. Mirrors the rendered layout of
 * FeaturedListingsClient (section padding, header, filter pills, 12-col
 * editorial grid with big cards at index 0 and 5) so resolving the stream
 * causes no layout shift. Keep in sync with FeaturedListingsClient.
 */
export default function FeaturedListingsSkeleton() {
  return (
    <section
      aria-label="Featured listings"
      aria-busy="true"
      className="bg-surface-canvas py-20 md:py-28"
    >
      <div className="container">
        <div className="mb-9 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="w-full max-w-3xl">
            <div className={`mb-4 h-4 w-44 rounded-full ${shimmer}`} />
            <div className={`h-9 max-w-xl rounded-lg md:h-14 ${shimmer}`} />
            <div className={`mt-2 h-9 w-2/3 max-w-md rounded-lg md:h-14 ${shimmer}`} />
          </div>
          <div className={`h-8 w-44 shrink-0 rounded-full ${shimmer}`} />
        </div>

        <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar">
          {[88, 124, 120, 116, 104].map((w, i) => (
            <div
              key={i}
              style={{ width: w }}
              className={`h-10 shrink-0 rounded-full ${shimmer}`}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-12">
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const big = index % 5 === 0;
            return (
              <div
                key={index}
                className={`col-span-1 min-w-0 ${big ? "md:col-span-12 lg:col-span-6" : "md:col-span-6 lg:col-span-3"}`}
              >
                <div
                  className={`rounded-[1.125rem] ${shimmer} ${
                    big ? "h-72 sm:h-80 md:h-[26rem]" : "h-64 sm:h-72 md:h-[19rem]"
                  }`}
                />
                <div className="pt-4">
                  <div className={`h-6 w-3/4 rounded-lg ${shimmer}`} />
                  <div className={`mt-2 h-4 w-2/3 rounded-lg ${shimmer}`} />
                  {big ? (
                    <div className="mt-3 flex gap-1.5">
                      {[64, 88, 72].map((w, i) => (
                        <div
                          key={i}
                          style={{ width: w }}
                          className={`h-6 rounded-full ${shimmer}`}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
