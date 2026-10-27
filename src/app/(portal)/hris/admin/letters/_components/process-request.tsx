"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileCheck2 } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { Button, Field, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { approveLetterRequest } from "../actions";
import { LetterEditor } from "./letter-editor";

export function ProcessRequestDialog({
  requestId,
  employeeName,
  typeLabel,
  draftTitle,
  draftContent,
}: {
  requestId: string;
  employeeName: string;
  typeLabel: string;
  draftTitle: string;
  draftContent: string;
}) {
  const [title, setTitle] = useState(draftTitle);
  const [content, setContent] = useState(draftContent);
  const [open, setOpen] = useState(false);

  // Approving removes this request's row (and so this dialog) in the same render as the
  // action result, so ActionForm would never get to toast. Toast + close here instead.
  const approve = async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    const res = await approveLetterRequest(prev, fd);
    if (!res?.ok) return res;
    toast.success(res.message ?? "Letter issued");
    setOpen(false);
    return null;
  };

  return (
    <Dialog
      size="xl"
      open={open}
      onOpenChange={setOpen}
      title={`Issue ${typeLabel}`}
      description={`For ${employeeName}. The draft is filled from the employee record — review and edit before issuing.`}
      trigger={
        <Button size="sm" variant="success">
          <FileCheck2 className="h-3.5 w-3.5" /> Approve & issue
        </Button>
      }
    >
      <ActionForm action={approve} resetOnSuccess={false} className="space-y-4">
        <input type="hidden" name="request_id" value={requestId} />
        <LetterEditor title={title} content={content} onTitle={setTitle} onContent={setContent} />
        <Field label="Remarks to employee" htmlFor={`remarks-${requestId}`} hint="Optional">
          <Textarea id={`remarks-${requestId}`} name="remarks" rows={2} maxLength={500} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button
            variant="ghost"
            onClick={() => {
              setTitle(draftTitle);
              setContent(draftContent);
            }}
          >
            Reset draft
          </Button>
          <SubmitButton variant="success">Approve & issue letter</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  );
}
