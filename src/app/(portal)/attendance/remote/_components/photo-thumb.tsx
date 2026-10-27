"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

/** Selfie thumbnail that opens full size in a dialog. */
export function PhotoThumb({ src, label }: { src: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!src) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-slate-100 text-slate-400">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative block w-full overflow-hidden rounded-lg" aria-label={`View ${label}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.03]" />
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={label} size="lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className="w-full rounded-lg" />
      </Dialog>
    </>
  );
}
