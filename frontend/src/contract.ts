/** The length of a contract in calendar years, months and days. Mirrors backend/tpra/contract.py, which is what the
 *  server stores and reports; this is for showing the length live while a date is being picked. */

export interface Term {
  years: number;
  months: number;
  days: number;
}

const parse = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};

function addMonths(d: Date, months: number): Date {
  const index = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)));
}

/** Both days count: 1 Jan to 31 Dec is one year, not 11 months 30 days. Null until both dates are valid and in order. */
export function contractTerm(start: string, end: string): Term | null {
  const from = parse(start);
  const to = parse(end);
  if (!from || !to || to < from) return null;
  const stop = new Date(to.getTime() + 86_400_000); // exclusive end
  let months = (stop.getUTCFullYear() - from.getUTCFullYear()) * 12 + (stop.getUTCMonth() - from.getUTCMonth());
  let anchor = addMonths(from, months);
  if (anchor > stop) {
    months -= 1;
    anchor = addMonths(from, months);
  }
  return { years: Math.floor(months / 12), months: months % 12, days: Math.round((stop.getTime() - anchor.getTime()) / 86_400_000) };
}

export const totalMonths = (t: Term) => t.years * 12 + t.months;

export function termLabel(t: Term): string {
  const parts = ([[t.years, "year"], [t.months, "month"], [t.days, "day"]] as const)
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n} ${unit}${n === 1 ? "" : "s"}`);
  return parts.join(" ") || "0 days";
}

/** A calendar date (YYYY-MM-DD) shown as that day, whatever the viewer's time zone: no midnight-UTC shift. */
export function formatCalendarDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
