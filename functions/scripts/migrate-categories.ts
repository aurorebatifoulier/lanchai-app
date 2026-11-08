// Category migration (logic + rules: ./migrateCategories.ts).
//   cd functions
//   npm run migrate:categories                → DRY RUN: lists everything, changes nothing in
//                                               Firestore; writes / completes
//                                               scripts/category-choices.json (suggestions
//                                               fun → games, sports → outdoor; [] = decide)
//   (edit scripts/category-choices.json: "categories": ["outdoor", "games"], main first)
//   npm run migrate:categories -- --run       → asks you to TYPE the project id, then migrates
//   … -- --run --delete-stale-watches         → also deletes "Notify me" watches on retired categories
// Credentials: your own Google account through Application Default Credentials
// (`gcloud auth application-default login` once) — no key file. Refuses to run against
// the emulators by accident and from a non-interactive shell (--run).
import * as admin from 'firebase-admin';
import { createInterface } from 'node:readline/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { planMigration, runMigration, describePlan, choicesTemplate, type ChoicesFile } from './migrateCategories';

const CHOICES = path.join(__dirname, 'category-choices.json');

function projectId(): string {
  const arg = process.argv.find(a => a.startsWith('--project='));
  if (arg) return arg.slice('--project='.length);
  try {
    const rc = JSON.parse(readFileSync('../.firebaserc', 'utf8')) as { projects?: { default?: string } };
    if (rc.projects?.default) return rc.projects.default;
  } catch { /* no .firebaserc */ }
  throw new Error('No project: pass --project=<id>');
}

function readChoices(): ChoicesFile {
  if (!existsSync(CHOICES)) return {};
  try {
    return JSON.parse(readFileSync(CHOICES, 'utf8')) as ChoicesFile;
  } catch (err) {
    throw new Error(`${CHOICES} is not valid JSON: ${(err as Error).message}`);
  }
}

async function main() {
  const run = process.argv.includes('--run');
  const deleteStaleWatches = process.argv.includes('--delete-stale-watches');
  const project = projectId();
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Emulator variables are set — unset them to target the real project (tests call the logic directly).');
  }
  admin.initializeApp({ projectId: project });
  const db = admin.firestore();
  const choices = readChoices();
  const plan = await planMigration(db, choices);
  console.log(`\n${describePlan(plan)}\n`);

  if (!run) {
    const next = choicesTemplate(plan, choices);
    if (Object.keys(next).length > 0) {
      writeFileSync(CHOICES, `${JSON.stringify(next, null, 2)}\n`);
      console.log(`Choices file: ${CHOICES}\n  Review every entry — suggestions only (fun → games, sports → outdoor); "categories": [] = still to decide.`);
    }
    console.log('DRY RUN — nothing was changed in Firestore. Add `-- --run` to apply.');
    return;
  }
  if (!process.stdin.isTTY || process.env.CI) throw new Error('Run it yourself in a terminal.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`This updates the products listed above${deleteStaleWatches ? ' and deletes the stale watches' : ''}. Type the project id "${project}" to continue: `)).trim();
  rl.close();
  if (typed !== project) { console.log('Cancelled — nothing was changed.'); return; }
  await runMigration(db, plan, { deleteStaleWatches }, line => console.log(`• ${line}`));
  console.log('\n✓ Done. Run the dry run again: "WILL CONVERT" and "WILL APPLY YOUR CHOICE" should now be 0.');
}

main().catch(err => { console.error(`\n✗ ${(err as Error).message}\nNothing more was changed.`); process.exit(1); });
