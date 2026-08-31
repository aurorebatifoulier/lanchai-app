// Pure calendar-grid math shared by any month-grid calendar UI in this app — no
// selection/interaction logic here, just building the day cells. Originally lived
// inside components/DateRangeCalendar.tsx; extracted so the admin per-product
// availability view (a separate, read/inspect-oriented calendar) can reuse the same
// grid construction without duplicating it or depending on the booking-flow
// component's range-selection-specific interaction model.

export type CalDay = { d: number; date: Date; muted?: boolean };

export function buildCalendarDays(year: number, month: number): CalDay[] {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const days: CalDay[] = [];
  for (let i = offset - 1; i >= 0; i--)
    days.push({ d: prevDays - i, date: new Date(year, month - 1, prevDays - i), muted: true });
  for (let d = 1; d <= daysInMonth; d++)
    days.push({ d, date: new Date(year, month, d) });
  const trailing = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= trailing; d++)
    days.push({ d, date: new Date(year, month + 1, d), muted: true });
  return days;
}

// Explicit weekly rows (7-item chunks), each rendered as its own row View — not a single
// flexWrap container relying on percentage-width cells to auto-wrap every 7 items. That
// prior pattern was the likely source of the calendar's cell/highlight offset bug
// (sub-pixel rounding on `${100/7}%` occasionally mis-wrapping a row); chunking into
// explicit rows eliminates that class of bug by construction.
export function chunkIntoWeeks(days: CalDay[]): CalDay[][] {
  const weeks: CalDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
