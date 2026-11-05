"use client";

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar } from "@/components/ui";
import { removeAvatar, updateAvatar } from "../actions";

/** Current photo + upload (with preview) + remove. */
export function AvatarUploader({ employeeId, name, src }: { employeeId: string; name: string; src: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <Avatar name={name} src={preview ?? src} size="xl" className="shrink-0 ring-4 ring-[#dce5fa]" />
      <div className="min-w-0 flex-1">
        <ActionForm action={updateAvatar} successMessage="Profile photo updated" onSuccess={() => setPreview(null)} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <label className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-[#5b74d6] hover:bg-[#f5f7fe]">
            <Camera className="h-4 w-4 shrink-0 text-[#3753b8]" />
            <span className="min-w-0 truncate">{preview ? "Image selected — click Upload" : "Choose an image (JPG/PNG, max 2 MB)"}</span>
            <input
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
          <SubmitButton size="sm" disabled={!preview} className="shrink-0">
            Upload
          </SubmitButton>
        </ActionForm>
        {src && (
          <div className="mt-2">
            <ActionButton action={removeAvatar} fields={{ employee_id: employeeId }} confirm="Remove profile photo?" variant="ghost" size="sm">
              Remove photo
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
