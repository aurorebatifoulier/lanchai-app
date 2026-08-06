// Shared 09:00–19:30 time-slot list (30-min increments) used by both the single-item
// booking flow and the bag/multi-item date range picker.
export const pad = (n: number) => n.toString().padStart(2, '0');

export const TIME_SLOTS: string[] = [];
for (let h = 9; h <= 19; h++) {
  TIME_SLOTS.push(`${pad(h)}:00`);
  if (h < 19) TIME_SLOTS.push(`${pad(h)}:30`);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Slots for a date that is today are filtered to (now + 1h prep buffer), rounded up to
// the nearest slot increment (30 min) — a renter can't select a time that's already
// passed or too soon to prepare. Future dates return the full slot list.
export function getAvailableTimeSlots(date: Date | null): string[] {
  if (!date || !sameDay(date, new Date())) return TIME_SLOTS;
  const buffer = new Date(Date.now() + 60 * 60 * 1000);
  const totalMinutes = buffer.getHours() * 60 + buffer.getMinutes();
  const roundedMinutes = Math.ceil(totalMinutes / 30) * 30;
  const threshold = `${pad(Math.floor(roundedMinutes / 60))}:${pad(roundedMinutes % 60)}`;
  return TIME_SLOTS.filter(slot => slot >= threshold);
}
