import Link from "next/link";
import { CalendarClock, CheckCircle2, Circle, ExternalLink, MinusCircle, Plus, Trash2, Zap } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, FormGrid, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatDate } from "@/lib/utils";
import { addTask, deleteTask, setTaskDue, setTaskStatus } from "../actions";
import { AUTO_LABELS, OWNERS, OWNER_LABELS, daysBetween, taskActionHref, type Owner, type TaskRow } from "../_lib";

type Viewer = { isHR: boolean; isManagerOfJoiner: boolean; isJoiner: boolean };

function canTick(owner: Owner, v: Viewer) {
  return v.isHR || (owner === "manager" && v.isManagerOfJoiner) || (owner === "employee" && v.isJoiner);
}

function dueText(due: string | null, today: string) {
  if (!due) return null;
  const d = daysBetween(today, due);
  if (d === 0) return { text: "Due today", tone: "text-amber-700" };
  if (d < 0) return { text: `Overdue by ${-d} day${d === -1 ? "" : "s"}`, tone: "text-red-600" };
  if (d <= 7) return { text: `Due in ${d} day${d === 1 ? "" : "s"}`, tone: "text-slate-600" };
  return { text: `Due ${formatDate(due, "dd MMM")}`, tone: "text-slate-500" };
}

export function Checklist({
  tasks,
  employeeId,
  joinerFirstName,
  managerName,
  viewer,
  today,
}: {
  tasks: TaskRow[];
  employeeId: string;
  joinerFirstName: string;
  managerName: string | null;
  viewer: Viewer;
  today: string;
}) {
  const groupLabel = (o: Owner) => (o === "employee" ? (viewer.isJoiner ? "You" : joinerFirstName) : o === "manager" ? `Manager${managerName ? ` · ${managerName}` : ""}` : OWNER_LABELS[o]);
  // The viewer's own tasks first, then the rest in the usual order.
  const order = [...OWNERS].sort((a, b) => Number(canTick(b, viewer) && !viewer.isHR) - Number(canTick(a, viewer) && !viewer.isHR));

  return (
    <div className="space-y-5">
      {order.map((owner) => {
        const list = tasks.filter((t) => t.owner === owner);
        if (!list.length) return null;
        const done = list.filter((t) => t.status !== "pending").length;
        return (
          <Card key={owner}>
            <CardHeader title={groupLabel(owner)} description={`${done} of ${list.length} done`} />
            <ul className="divide-y divide-slate-100">
              {list.map((t) => (
                <TaskItem key={t.id} task={t} viewer={viewer} employeeId={employeeId} today={today} />
              ))}
            </ul>
          </Card>
        );
      })}

      {viewer.isHR && (
        <Dialog
          title="Add a task"
          description="A one-off task for this joinee only. To change every new joiner's checklist, edit the template."
          trigger={
            <Button variant="outline">
              <Plus className="h-4 w-4" />
              Add a task
            </Button>
          }
        >
          <ActionForm action={addTask} className="space-y-4">
            <input type="hidden" name="employee_id" value={employeeId} />
            <Field label="Task" htmlFor="title" required>
              <Input id="title" name="title" required maxLength={120} placeholder="e.g. Book travel for the induction" />
            </Field>
            <FormGrid>
              <Field label="Who does it" htmlFor="owner" required>
                <Select id="owner" name="owner" defaultValue="hr">
                  {OWNERS.map((o) => (
                    <option key={o} value={o}>
                      {OWNER_LABELS[o]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Due date" htmlFor="due_date">
                <Input id="due_date" name="due_date" type="date" />
              </Field>
            </FormGrid>
            <Field label="Details" htmlFor="description">
              <Textarea id="description" name="description" maxLength={500} rows={2} />
            </Field>
            <div className="flex justify-end">
              <SubmitButton>Add task</SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </div>
  );
}

function TaskItem({ task: t, viewer, employeeId, today }: { task: TaskRow; viewer: Viewer; employeeId: string; today: string }) {
  const tickable = canTick(t.owner, viewer);
  const pending = t.status === "pending";
  const due = pending ? dueText(t.due_date, today) : null;
  const go = pending ? taskActionHref(t.auto_key, employeeId, { isHR: viewer.isHR, self: viewer.isJoiner }) : null;
  const isDeskTask = t.auto_key === "it_setup";

  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <div className="pt-0.5">
        {tickable && !(isDeskTask && pending && t.link_label && !viewer.isHR) ? (
          <ActionButton
            action={setTaskStatus}
            fields={{ id: t.id, status: pending ? "done" : "pending" }}
            variant="ghost"
            size="sm"
            className="h-6 w-6 rounded-full p-0"
            title={pending ? "Mark as done" : "Reopen"}
            successMessage={pending ? "Done" : "Reopened"}
          >
            {pending ? <Circle className="h-5 w-5 text-slate-300 hover:text-emerald-500" /> : t.status === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <MinusCircle className="h-5 w-5 text-slate-400" />}
          </ActionButton>
        ) : pending ? (
          <Circle className="h-5 w-5 text-slate-300" />
        ) : t.status === "done" ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <MinusCircle className="h-5 w-5 text-slate-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("text-sm font-medium", pending ? "text-slate-900" : "text-slate-500 line-through decoration-slate-300")}>{t.title}</p>
          {t.status === "skipped" && <Badge>Skipped</Badge>}
          {t.auto_key && pending && (
            <span title={AUTO_LABELS[t.auto_key]} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-violet-600">
              <Zap className="h-3 w-3" />
              Automatic
            </span>
          )}
        </div>
        {t.description && pending && <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {due && (
            <span className={cn("inline-flex items-center gap-1", due.tone)}>
              <CalendarClock className="h-3.5 w-3.5" />
              {due.text}
            </span>
          )}
          {!pending && (
            <span className="text-slate-500">
              {t.status === "done" ? "Done" : "Skipped"}
              {t.completer?.full_name ? ` by ${t.completer.full_name}` : ""}
              {t.completed_at ? ` on ${formatDate(t.completed_at)}` : ""}
            </span>
          )}
          {t.note && <span className="text-slate-500">{t.note}</span>}
          {t.link && (
            <a href={t.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline">
              {t.link_label ?? "Open"}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {go && (
          <Link href={go.href} className={buttonClass("outline", "sm")}>
            {go.label}
          </Link>
        )}
        {viewer.isHR && pending && (
          <>
            <Dialog
              title="Change due date"
              trigger={
                <Button variant="ghost" size="sm" title="Change due date">
                  <CalendarClock className="h-4 w-4" />
                </Button>
              }
            >
              <ActionForm action={setTaskDue} className="space-y-4">
                <input type="hidden" name="id" value={t.id} />
                <Field label="Due date" htmlFor={`due-${t.id}`}>
                  <Input id={`due-${t.id}`} name="due_date" type="date" defaultValue={t.due_date ?? ""} />
                </Field>
                <div className="flex justify-end">
                  <SubmitButton>Save</SubmitButton>
                </div>
              </ActionForm>
            </Dialog>
            <ActionButton action={setTaskStatus} fields={{ id: t.id, status: "skipped" }} variant="ghost" size="sm" prompt="Why skip this task? (optional)" title="Skip">
              <MinusCircle className="h-4 w-4" />
            </ActionButton>
          </>
        )}
        {viewer.isHR && !t.template_id && (
          <ActionButton action={deleteTask} fields={{ id: t.id }} variant="ghost" size="sm" confirm={`Remove "${t.title}"?`} title="Remove">
            <Trash2 className="h-4 w-4 text-slate-400" />
          </ActionButton>
        )}
      </div>
    </li>
  );
}
