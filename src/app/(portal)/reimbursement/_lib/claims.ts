/** Shared helpers for the Reimbursement module (pure, server & client safe). */

export const CLAIM_STATUSES = ["draft", "submitted", "approved", "paid", "rejected", "cancelled"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** CLM-00042 */
export function claimNumber(seq: number | string | null | undefined) {
  return `CLM-${String(seq ?? 0).padStart(5, "0")}`;
}

/** Reimbursement module accent (khaki / olive), mirrors MODULES[].theme. */
export const REIMB_THEME = {
  pill: "bg-[#eff0d2]",
  text: "text-[#7c7a17]",
  solid: "bg-[#b3ad2a]",
  stat: "bg-[#eff0d2] text-[#7c7a17]",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Pending Approval",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export type ClaimCategoryOption = {
  id: string;
  name: string;
  max_amount: number | null;
  requires_receipt: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Display name for a stored receipt path ("<uid>/claims/<uuid>-bill.pdf" -> "bill.pdf"). */
export function receiptName(path: string | null | undefined) {
  if (!path) return null;
  const file = path.split("/").pop() ?? path;
  return file.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "");
}
