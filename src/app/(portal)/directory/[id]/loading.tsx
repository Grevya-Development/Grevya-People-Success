/** Shown instantly when a colleague's card is clicked, while their profile loads. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading profile">
      <div className="mb-2 h-3 w-40 rounded bg-slate-200/60" />
      <div className="mb-5 h-7 w-56 rounded-md bg-slate-200/70" />

      <div className="mb-5 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
        <div className="h-20 bg-gradient-to-r from-[#0c1755]/30 via-[#2a3ca3]/30 to-[#5b74d6]/30" />
        <div className="flex flex-col items-center gap-4 px-5 pb-5 sm:flex-row sm:items-end">
          <div className="-mt-10 h-24 w-24 rounded-full bg-slate-200 ring-4 ring-white" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-48 rounded bg-slate-200/80" />
            <div className="h-3.5 w-64 rounded bg-slate-200/60" />
            <div className="h-3 w-20 rounded bg-slate-200/50" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <div className="h-80 rounded-xl border border-slate-200/80 bg-white" />
          <div className="h-32 rounded-xl border border-slate-200/80 bg-white" />
        </div>
        <div className="space-y-5 lg:col-span-2">
          <div className="h-56 rounded-xl border border-slate-200/80 bg-white" />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="h-48 rounded-xl border border-slate-200/80 bg-white" />
            <div className="h-48 rounded-xl border border-slate-200/80 bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
