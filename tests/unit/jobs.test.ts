// Diagnostics job states + the job list matches every onSchedule() in functions/src.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEDULED_JOBS, jobState } from '../../functions/src/shared/jobs';

const MIN = 60_000;

test('job state: ok / error / late / never', () => {
  const now = 1_000 * MIN;
  assert.equal(jobState(null, 15, now), 'never');
  assert.equal(jobState({ lastOkAtMs: now - 10 * MIN, lastErrorAtMs: null }, 15, now), 'ok');
  assert.equal(jobState({ lastOkAtMs: now - 31 * MIN, lastErrorAtMs: null }, 15, now), 'late');
  assert.equal(jobState({ lastOkAtMs: now - 20 * MIN, lastErrorAtMs: now - 5 * MIN }, 15, now), 'error');
  assert.equal(jobState({ lastOkAtMs: now - 5 * MIN, lastErrorAtMs: now - 20 * MIN }, 15, now), 'ok');
});

test('every scheduled function is tracked and listed', () => {
  const dir = path.resolve(__dirname, '../../functions/src');
  const files = [...fs.readdirSync(dir).map(f => path.join(dir, f)), ...fs.readdirSync(path.join(dir, 'email')).map(f => path.join(dir, 'email', f))]
    .filter(f => f.endsWith('.ts'));
  const scheduled: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/export const (\w+) = onSchedule\(/g)) {
      scheduled.push(m[1]);
      assert.match(src, new RegExp(`trackJob\\('${m[1]}'`), `${m[1]} is not wrapped in trackJob`);
    }
  }
  assert.deepEqual(scheduled.sort(), SCHEDULED_JOBS.map(j => j.name).sort());
});
