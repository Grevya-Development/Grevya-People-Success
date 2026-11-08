/**
 * Leave for someone joining part-way through the year.
 * Months are counted from the joining month when they join on or before the 15th,
 * otherwise from the next month. The result is rounded to the nearest half day.
 */
export function remainingMonths(joining: string, year: number): number {
  const [y, m, d] = joining.split("-").map(Number);
  if (!y || !m || !d) return 12;
  if (y < year) return 12;
  if (y > year) return 0;
  return Math.max(0, 12 - (m - 1) - (d > 15 ? 1 : 0));
}

export function proratedQuota(annualQuota: number, joining: string, year: number): number {
  const quota = Number(annualQuota) || 0;
  if (quota <= 0) return 0;
  return Math.round(((quota * remainingMonths(joining, year)) / 12) * 2) / 2;
}

/** The leave year a new joiner's first balances belong to: this year, or their joining year if later. */
export function firstLeaveYear(joining: string, today: string): number {
  return Math.max(Number(today.slice(0, 4)), Number(joining.slice(0, 4)));
}
