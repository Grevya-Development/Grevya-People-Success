"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui";
import { adjustBalance } from "../actions";

export function AdjustBalanceForm({
  employeeId,
  year,
  types,
}: {
  employeeId: string;
  year: number;
  types: { id: string; name: string; allocated: number; used: number }[];
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const current = types.find((t) => t.id === typeId);
  return (
    <ActionForm action={adjustBalance} successMessage="Balance updated" resetOnSuccess={false}>
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="year" value={year} />
      <div className="space-y-4">
        <Field label="Leave type" required>
          <Select name="leave_type_id" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Allocated days for ${year}`} required hint={current ? `Currently ${current.allocated} allocated · ${current.used} used` : undefined}>
          {/* key resets the default when the type changes */}
          <Input key={typeId} name="allocated" type="number" min={0} max={365} step={0.5} defaultValue={current?.allocated ?? 0} required />
        </Field>
        <div className="flex justify-end">
          <SubmitButton>Save allocation</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
