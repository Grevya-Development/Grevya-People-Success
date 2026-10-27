"use client";

import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { Input, Select } from "@/components/ui";

/** <select> inside a GET filter form that submits the form on change. */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/** <input> (date / month) inside a GET filter form that submits on change. */
export function AutoSubmitInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} onChange={(e) => e.currentTarget.value && e.currentTarget.form?.requestSubmit()} />;
}
