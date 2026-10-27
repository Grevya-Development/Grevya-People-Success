# People Success — code conventions

Next.js **16.4** (App Router, React 19.3, Tailwind v4) + Supabase. `cacheComponents` is **off**: every portal page is dynamic, per-user.
Read `node_modules/next/dist/docs/` if unsure about an API. Notable v16 changes: `params` / `searchParams` are **Promises** (`const { id } = await params`), `middleware` is now `src/proxy.ts`.

## Layout
- `src/app/(portal)/...` — every signed-in page. The layout already renders the header + navy sidebar; pages render only their content.
- Routes are defined in `src/lib/nav.ts` (`MODULES`). Build exactly those hrefs.
- Module-private components go in `src/app/(portal)/<module>/_components/`. Server actions go in `src/app/(portal)/<module>/actions.ts` (`"use server"` at top).
- Don't edit shared files (`src/components/ui/*`, `src/lib/*`, `src/components/shell/*`, `src/app/(portal)/layout.tsx`). If you need something shared, make it inside your module folder.

## Data access
- Server components: `const supabase = await createClient()` from `@/lib/supabase/server`. RLS enforces access: employees see their own rows, managers see their reporting chain (`can_approve_for`), HR (`role = 'hr_admin'`) sees everything.
- Types: `import type { Tables, TablesInsert } from "@/lib/database.types"`.
- Current user: `const me = await requireEmployee()` (or `requireManager()` / `requireHR()`) from `@/lib/auth`. `me.id` is the **employee id** (not auth uid). `me.isManager`, `me.isHR`, `me.reportCount`, `me.department?.name`, `me.designation?.title`, `me.manager`.
- Embedding: `employees` has two self-relations; use explicit FK names, e.g. `employee:employees!leave_requests_employee_id_fkey(full_name, employee_code, avatar_url)`. For the self-relation (an employee's manager) use `manager:manager_id(...)` (the many-to-one column embed). Do NOT use `employees!manager_id(...)` — that returns the direct reports — or the constraint-name form, which fails on hosted PostgREST.
- Because managers can also see their own rows, approval queues must filter `.neq("employee_id", me.id)`.
- Service role (`createAdminClient` from `@/lib/supabase/admin`) only for things RLS can't do (creating auth users, signed URLs). Always check `me.isHR` first.
- Files: `uploadDocument(formData.get("file"), "claims")` → path; `signedDocumentUrl(path)` → URL (from `@/lib/storage`).
- Dates: DB "today" is India time. Use `orgToday()` from `@/lib/utils` (yyyy-MM-dd).

## Server actions
```ts
"use server";
import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str, num } from "@/lib/utils";

export async function applyLeave(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const reason = str(fd, "reason");
  if (!reason) return fail("Reason is required");
  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({ ... , employee_id: me.id });
  if (error) return fail(dbError(error));
  revalidatePath("/leave");
  return ok("Leave applied", "/leave/details"); // 2nd arg = optional redirect
}
```
Always validate input and re-check permissions inside the action (actions are public POST endpoints). Return `fail()` instead of throwing.

## UI kit (`@/components/ui`)
- Server-safe (import from `@/components/ui`): `Button, buttonClass, Card, CardHeader, CardBody, WidgetCard, Badge, StatusBadge, Label, Input, Textarea, Select, Checkbox, Field, FormGrid, Table, THead, TBody, TR, TH, TD, EmptyState, PageHeader, Avatar, StatCard, ProgressBar, ProgressRing`.
- Client (import from their files):
  - `ActionForm` + `SubmitButton` from `@/components/ui/action-form` — `<ActionForm action={serverAction} successMessage="...">…<SubmitButton>Save</SubmitButton></ActionForm>`; toasts, keeps input on error, resets & closes surrounding dialog on success, follows `redirectTo`.
  - `ActionButton` from `@/components/ui/action-button` — `<ActionButton action={approve} fields={{ id }} prompt="Remarks" variant="success">Approve</ActionButton>`; also `confirm="Delete?"`.
  - `Dialog` from `@/components/ui/dialog` — `<Dialog trigger={<Button>New</Button>} title="…">…</Dialog>`.
  - `LinkTabs` from `@/components/ui/link-tabs` — URL-driven tabs (`?tab=…`).
- Formatting (`@/lib/utils`): `formatDate, formatDateTime, formatTime, formatCurrency (INR), humanize, initials, financialYear, cn, str, num, bool`.
- `StatusBadge status="pending"` colours every workflow status consistently.

## Look & feel
Light canvas (`bg-canvas`), white rounded-xl cards, `text-slate-*` greys, primary blue `primary-600`. Each module has a pastel theme in `MODULES[i].theme` (`pill`, `text`, `solid`) — use it for accents so modules feel distinct (e.g. Leave = peach/orange, Attendance = yellow, Payroll = green). Pages start with `<PageHeader title breadcrumbs actions />`. Every list needs an empty state. Pages must work at phone width (stack columns, tables scroll horizontally).
