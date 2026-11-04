// trackJob records OK runs and failures (and re-throws), so Admin → Diagnostics can show it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { trackJob } from '../src/jobHealth';
import { db, clearFirestore } from './helpers';

before(clearFirestore);

test('OK run → lastOkAt; failure → lastErrorAt + message, error re-thrown', async () => {
  await trackJob('demoJob', async () => {});
  const ok = (await db().doc('jobHealth/demoJob').get()).data()!;
  assert.ok(ok.lastOkAt && ok.lastRunAt && typeof ok.durationMs === 'number');
  await assert.rejects(trackJob('demoJob', async () => { throw new Error('boom'); }), /boom/);
  const bad = (await db().doc('jobHealth/demoJob').get()).data()!;
  assert.ok(bad.lastErrorAt);
  assert.equal(bad.lastError, 'boom');
  assert.ok(bad.lastOkAt, 'the last OK run is kept');
});
