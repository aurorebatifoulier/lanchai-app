// Pre-beta cleanup of test data (logic + what is kept / deleted: ./cleanupTestData.ts).
//   cd functions
//   npm run cleanup:test-data                 → DRY RUN: lists everything, changes nothing
//   npm run cleanup:test-data -- --run        → asks you to TYPE the project id, then deletes
// Credentials: your own Google account through Application Default Credentials
// (`gcloud auth application-default login` once) — no key file. Refuses to run against
// the emulators by accident and from a non-interactive shell (--run).
// Safety net: Firestore point-in-time recovery (7 days) + daily backups.
import * as admin from 'firebase-admin';
import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { planCleanup, runCleanup, describePlan } from './cleanupTestData';

function projectId(): string {
  const arg = process.argv.find(a => a.startsWith('--project='));
  if (arg) return arg.slice('--project='.length);
  try {
    const rc = JSON.parse(readFileSync('../.firebaserc', 'utf8')) as { projects?: { default?: string } };
    if (rc.projects?.default) return rc.projects.default;
  } catch { /* no .firebaserc */ }
  throw new Error('No project: pass --project=<id>');
}

async function main() {
  const run = process.argv.includes('--run');
  const project = projectId();
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Emulator variables are set — unset them to target the real project (tests call the logic directly).');
  }
  admin.initializeApp({ projectId: project, storageBucket: `${project}.firebasestorage.app` });
  const plan = await planCleanup();
  console.log(`\n${describePlan(plan)}\n`);
  if (!run) { console.log('DRY RUN — nothing was changed. Add `-- --run` to apply.'); return; }
  if (plan.admins.length === 0) throw new Error('No admin found in admins/ — refusing (every account would be deleted).');
  if (!process.stdin.isTTY || process.env.CI) throw new Error('Run it yourself in a terminal.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`This permanently deletes the data above. Type the project id "${project}" to continue: `)).trim();
  rl.close();
  if (typed !== project) { console.log('Cancelled — nothing was changed.'); return; }
  await runCleanup(plan, line => console.log(`• ${line}`));
  console.log('\n✓ Done. Run the dry run again: every count above should now be 0.');
}

main().catch(err => { console.error(`\n✗ ${(err as Error).message}\nNothing more was changed.`); process.exit(1); });
