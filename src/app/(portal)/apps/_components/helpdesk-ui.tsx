import { AlertTriangle, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Badge, Field, FormGrid, Input, Select, Textarea, type Tone } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { humanize } from "@/lib/utils";
import { raiseTicket } from "../helpdesk/actions";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "../helpdesk/_lib/constants";

const PRIORITY: Record<string, { tone: Tone; icon: typeof Minus }> = {
  low: { tone: "gray", icon: ArrowDown },
  medium: { tone: "blue", icon: Minus },
  high: { tone: "orange", icon: ArrowUp },
  urgent: { tone: "red", icon: AlertTriangle },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITY[priority] ?? PRIORITY.medium;
  const Icon = p.icon;
  return (
    <Badge tone={p.tone} className="gap-1">
      <Icon className="h-3 w-3" />
      {humanize(priority)}
    </Badge>
  );
}

export function TicketRef({ seq }: { seq: number }) {
  return <span className="font-mono text-xs font-semibold text-slate-500">HD-{seq}</span>;
}

/** Body of the "Raise a ticket" dialog. */
export function RaiseTicketForm() {
  return (
    <ActionForm action={raiseTicket} className="space-y-4">
      <FormGrid>
        <Field label="Category" htmlFor="category" required>
          <Select id="category" name="category" required defaultValue="">
            <option value="" disabled>
              Select a category
            </option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority" required>
          <Select id="priority" name="priority" defaultValue="medium">
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label="Subject" htmlFor="subject" required>
        <Input id="subject" name="subject" required maxLength={150} placeholder="e.g. Salary for September not credited" />
      </Field>
      <Field label="Description" htmlFor="description" required hint="Include dates, amounts and any reference numbers so HR can help faster.">
        <Textarea id="description" name="description" required rows={5} maxLength={5000} placeholder="Describe the issue in detail" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>Raise ticket</SubmitButton>
      </div>
    </ActionForm>
  );
}
