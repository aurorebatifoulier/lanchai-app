// Run by dates-slots.test.ts with different TZ values — prints "ok" or the first mismatch.
import { atVteSlot, vteDayToken, vteHHMM, vteDayRange, addDays, sameDayToken } from '../../lib/vteTime';

const fail = (m: string) => { console.log(m); process.exit(0); };
const day = new Date(2026, 10, 14); // day token "14 Nov"
const at = atVteSlot(day, '10:00');
if (at.toISOString() !== '2026-11-14T03:00:00.000Z') fail(`atVteSlot ${at.toISOString()}`);
if (vteHHMM(at) !== '10:00') fail(`vteHHMM ${vteHHMM(at)}`);
const tok = vteDayToken(Date.UTC(2026, 10, 14, 18, 30)); // 01:30 on the 15th in Vientiane
if (tok.getFullYear() !== 2026 || tok.getMonth() !== 10 || tok.getDate() !== 15) fail(`vteDayToken ${tok.toString()}`);
const r = vteDayRange(day);
if (r.start.toISOString() !== '2026-11-13T17:00:00.000Z' || r.end.getTime() - r.start.getTime() !== 86_400_000) fail(`vteDayRange ${r.start.toISOString()}`);
if (!sameDayToken(addDays(day, 1), new Date(2026, 10, 15))) fail('addDays');
console.log('ok');
