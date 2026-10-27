import { format, parseISO, startOfMonth, isValid, differenceInCalendarDays } from "date-fns";
import { orgToday } from "@/lib/utils";

/** Validated date range from search params; defaults to month-to-date, max 366 days. */
export function readRange(sp: Record<string, string | string[] | undefined>) {
  const today = orgToday();
  const def = format(startOfMonth(parseISO(today)), "yyyy-MM-dd");
  const ok = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && isValid(parseISO(v));
  let from = ok(sp.from) ? (sp.from as string) : def;
  let to = ok(sp.to) ? (sp.to as string) : today;
  if (from > to) [from, to] = [to, from];
  if (differenceInCalendarDays(parseISO(to), parseISO(from)) > 366) from = format(new Date(parseISO(to).getTime() - 366 * 864e5), "yyyy-MM-dd");
  return { from, to };
}
