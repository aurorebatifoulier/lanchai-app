import type { Timestamp } from 'firebase/firestore';

// Shared by the admin reservations list and the client "My Rentals" screen — both
// project reservations onto the same three date fields and need identical filter/sort
// semantics, so this lives in one place rather than being reimplemented per screen.
export type DateField = 'pickupAt' | 'returnAt' | 'returnedAt';
export type SortDir = 'asc' | 'desc';

export interface DateFieldOption {
  id: DateField;
  label: string;
}

export interface DateFilterState {
  field: DateField;
  // null = no explicit sort applied — each screen falls back to its own existing
  // default order. Keeping this the resting state means the feature is fully opt-in;
  // nothing changes until the user applies a sort direction from the filter sheet.
  sortDir: SortDir | null;
}

export const DEFAULT_DATE_FILTER: DateFilterState = {
  field: 'pickupAt',
  sortDir: null,
};

export function isDateFilterActive(f: DateFilterState): boolean {
  return f.sortDir != null;
}

// returnedAt is the only optional field of the three (RentalDoc.pickupAt/returnAt are
// required Timestamps) — null here means "not yet returned."
export function getDateFieldValue(
  r: { pickupAt?: Timestamp; returnAt?: Timestamp; returnedAt?: Timestamp },
  field: DateField,
): number | null {
  const ts = field === 'pickupAt' ? r.pickupAt : field === 'returnAt' ? r.returnAt : r.returnedAt;
  return ts ? ts.toMillis() : null;
}

// Reservations lacking a value for the selected field always sort last, regardless of
// direction — most relevant for "actual return date" on items that haven't been
// returned yet.
export function compareByDateField(aVal: number | null, bVal: number | null, dir: SortDir): number {
  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return 1;
  if (bVal == null) return -1;
  return dir === 'asc' ? aVal - bVal : bVal - aVal;
}
