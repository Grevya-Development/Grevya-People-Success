/** Directory skeleton: header, filter bar and a grid of people cards. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading directory">
      <div className="mb-2 h-3 w-32 rounded bg-slate-200/60" />
      <div className="mb-1 h-7 w-40 rounded-md bg-slate-200/70" />
      <div className="mb-5 h-4 w-56 rounded bg-slate-200/50" />
      <div className="mb-5 h-[68px] rounded-xl border border-slate-200/80 bg-white" />
      <div className="mb-3 h-3 w-36 rounded bg-slate-200/50" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
            <div className="h-1.5 bg-slate-200" />
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded bg-slate-200/80" />
                  <div className="h-3 w-24 rounded bg-slate-200/60" />
                </div>
              </div>
              <div className="h-5 w-20 rounded-full bg-slate-100" />
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="h-3 w-40 rounded bg-slate-100" />
                <div className="h-3 w-28 rounded bg-slate-100" />
                <div className="h-3 w-24 rounded bg-slate-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
