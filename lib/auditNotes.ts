// Audit-note display helpers (pure — tests/unit/returnCharges.test.ts).

/** "late fee 630000 LAK · refund 4272000 LAK" → "late fee 630,000 LAK · refund 4,272,000 LAK"
 *  (older entries were written with raw numbers). */
export function formatAuditNote(note: string): string {
  return note.replace(/(\d+(?:\.\d+)?)(\s*)(LAK|USD|THB)\b/g, (_m, n: string, sp: string, cur: string) =>
    `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}${sp || ' '}${cur}`);
}
