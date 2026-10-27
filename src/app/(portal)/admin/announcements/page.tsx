import { Megaphone, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatDateTime } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";
import { deleteAnnouncement, saveAnnouncement, toggleAnnouncementPin } from "./actions";

export const metadata = { title: "Announcements" };

function AnnouncementForm({ a }: { a?: Pick<Tables<"announcements">, "id" | "title" | "body" | "pinned"> }) {
  return (
    <ActionForm action={saveAnnouncement} className="space-y-4">
      {a && <input type="hidden" name="id" value={a.id} />}
      <Field label="Title" required>
        <Input name="title" defaultValue={a?.title} required maxLength={200} placeholder="e.g. Office closed on Friday for Diwali" />
      </Field>
      <Field label="Message" required hint="Plain text. Line breaks are preserved.">
        <Textarea name="body" defaultValue={a?.body} required rows={6} maxLength={5000} />
      </Field>
      <Checkbox name="pinned" label="Pin to the top of the home page" defaultChecked={a?.pinned ?? false} />
      <div className="flex justify-end">
        <SubmitButton>{a ? "Save changes" : "Publish"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function AnnouncementsAdminPage() {
  await requireHR();
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, created_at, author:employees!announcements_created_by_fkey(full_name, avatar_url)")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  const items = data ?? [];
  const pinnedCount = items.filter((a) => a.pinned).length;

  return (
    <div>
      <PageHeader
        title="Announcements"
        description={`${items.length} announcement${items.length === 1 ? "" : "s"} · ${pinnedCount} pinned. Everyone in the organisation sees these on their home page.`}
        breadcrumbs={[{ label: "HR Admin" }, { label: "Announcements" }]}
        actions={
          <Dialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> New announcement
              </Button>
            }
            title="New announcement"
          >
            <AnnouncementForm />
          </Dialog>
        }
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Megaphone} title="No announcements yet" description="Share news, policy updates or celebrations with everyone at Grevya." />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id} className={cn("overflow-hidden", a.pinned && "border-amber-200")}>
              <div className="flex">
                <div className={cn("w-1 shrink-0", a.pinned ? "bg-amber-400" : "bg-indigo-400")} />
                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-slate-800">{a.title}</h3>
                        {a.pinned && (
                          <Badge tone="yellow">
                            <Pin className="mr-1 h-3 w-3" /> Pinned
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Avatar name={a.author?.full_name ?? "HR"} src={a.author?.avatar_url} size="xs" />
                        <span>{a.author?.full_name ?? "HR"}</span>·<span>{formatDateTime(a.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <ActionButton action={toggleAnnouncementPin} fields={{ id: a.id, pinned: !a.pinned }} variant="ghost" title={a.pinned ? "Unpin" : "Pin"}>
                        {a.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">{a.pinned ? "Unpin" : "Pin"}</span>
                      </ActionButton>
                      <Dialog
                        trigger={
                          <Button size="sm" variant="ghost" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Edit</span>
                          </Button>
                        }
                        title="Edit announcement"
                      >
                        <AnnouncementForm a={a} />
                      </Dialog>
                      <ActionButton action={deleteAnnouncement} fields={{ id: a.id }} variant="ghost" title="Delete" confirm={`Delete "${a.title}"?`}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </ActionButton>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{a.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
