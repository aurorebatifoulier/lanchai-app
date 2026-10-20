// Pickup/return time-slot rules — single source for the app's pickers
// (utils/timeSlots.ts) and the createReservations callable (server-side slot check).
// Dependency-free (see latePenalty.ts).
export const pad = (n: number) => n.toString().padStart(2, '0');

export const SLOT_STEP_MIN = 30;

export const DEFAULT_OPEN_TIME              = '09:00';
export const DEFAULT_CLOSE_TIME             = '20:00';
export const DEFAULT_LAST_PICKUP_OFFSET_MIN = 30;

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" → minutes since midnight, or null if not a valid 24h time. */
export function parseHHMM(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = HHMM_RE.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export const toHHMM = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function generateSlots(openMin: number, lastMin: number): string[] {
  const slots: string[] = [];
  for (let m = openMin; m <= lastMin; m += SLOT_STEP_MIN) slots.push(toHHMM(m));
  return slots;
}

// 09:00–19:30 — what the app used before shop hours became configurable, and still the
// fallback whenever config/shop is missing or holds unusable values.
export const DEFAULT_TIME_SLOTS: string[] = generateSlots(
  parseHHMM(DEFAULT_OPEN_TIME)!,
  parseHHMM(DEFAULT_CLOSE_TIME)! - DEFAULT_LAST_PICKUP_OFFSET_MIN,
);

/**
 * Slots from opening time up to (closing time − lastPickupOffsetMin), every 30 min.
 * Invalid input (bad format, closing before opening, no slot left) falls back to
 * DEFAULT_TIME_SLOTS so a misconfigured doc can never leave renters with no times.
 */
export function buildTimeSlots(
  openTime: unknown,
  closeTime: unknown,
  lastPickupOffsetMin: unknown,
): string[] {
  const openMin  = parseHHMM(openTime);
  const closeMin = parseHHMM(closeTime);
  const offset   = typeof lastPickupOffsetMin === 'number' && Number.isFinite(lastPickupOffsetMin) && lastPickupOffsetMin >= 0
    ? lastPickupOffsetMin
    : DEFAULT_LAST_PICKUP_OFFSET_MIN;
  if (openMin == null || closeMin == null) return DEFAULT_TIME_SLOTS;
  const lastMin = closeMin - offset;
  if (lastMin < openMin) return DEFAULT_TIME_SLOTS;
  return generateSlots(openMin, lastMin);
}

