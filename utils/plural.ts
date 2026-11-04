/** "1 item" / "3 items". Pure (no expo-router) — unit-tested in tests/unit. */
export function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}
