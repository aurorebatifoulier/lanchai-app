#!/usr/bin/env node
// Publishes an over-the-air (EAS Update) JS update — the ONLY supported way.
//   npm run update:publish -- preview "Fix booking button"
//   npm run update:publish -- production "New Home banner"
// Guards (nothing is sent unless they all pass):
//   - channel must be exactly `preview` or `production` (development = dev builds only);
//   - a message is required (shown in expo.dev → Updates);
//   - git tree clean and HEAD pushed to origin (the update = a known commit);
//   - typecheck, lint and unit tests pass;
//   - an interactive terminal, and you TYPE the channel name to confirm — so it can't
//     run from CI, a script, or by accident.
// The update uses the EAS environment of that channel (`--environment`), so the
// Firebase / Sentry variables are the build's, not .env.local.
import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const CHANNELS = { preview: 'preview', production: 'production' };
const [channel, ...rest] = process.argv.slice(2);
const message = rest.join(' ').trim();

const fail = (msg) => { console.error(`\n✗ ${msg}\nNothing was published.`); process.exit(1); };
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const step = (label, cmd) => {
  process.stdout.write(`• ${label}… `);
  const r = spawnSync(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) { console.log('failed'); console.error((r.stdout || '') + (r.stderr || '')); fail(`${label} failed.`); }
  console.log('ok');
};

if (!CHANNELS[channel]) fail('Usage: npm run update:publish -- <preview|production> "What changed"');
if (message.length < 3) fail('Add a short message saying what changed.');
if (!process.stdin.isTTY || process.env.CI) fail('Run this yourself in a terminal (not from CI or a script).');

if (sh('git status --porcelain')) fail('Commit or discard your local changes first.');
sh('git fetch -q origin');
const branch = sh('git rev-parse --abbrev-ref HEAD');
const head = sh('git rev-parse HEAD');
let remote = '';
try { remote = sh(`git rev-parse origin/${branch}`); } catch { /* not pushed */ }
if (head !== remote) fail(`Push ${branch} to GitHub first (the update must match a pushed commit).`);

step('Typecheck', 'npx tsc --noEmit');
step('Lint', 'npx eslint . --quiet');
step('Unit tests', 'npm run -s test:unit');

const runtime = JSON.parse(sh('npx expo-updates runtimeversion:resolve --platform android')).runtimeVersion;
console.log(`
  Channel   ${channel}${channel === 'production' ? '  ← EVERY tester (Play internal testing / TestFlight)' : '  ← preview builds only'}
  Commit    ${head.slice(0, 7)} (${branch})
  Runtime   ${runtime.slice(0, 10)} (Android) — only builds with this exact native code get it
  Message   ${message}
`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question(`Type "${channel}" to publish (anything else cancels): `)).trim();
rl.close();
if (typed !== channel) fail('Cancelled.');

const r = spawnSync('eas', [
  'update', '--channel', channel, '--environment', channel, '--platform', 'all',
  '--message', `${message} (${head.slice(0, 7)})`, '--non-interactive',
], { stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_APP_ENV: 'beta' } });
if (r.status !== 0) fail('eas update failed.');
// Readable stack traces in Sentry for this update (optional — needs the token locally).
if (process.env.SENTRY_AUTH_TOKEN) {
  spawnSync('npx', ['sentry-expo-upload-sourcemaps', 'dist'], { stdio: 'inherit' });
} else {
  console.log('\n(Sentry source maps not uploaded — SENTRY_AUTH_TOKEN isn’t set in this terminal. Crashes still report, with less readable stacks.)');
}
console.log(`\n✓ Published to ${channel}. The app downloads it in the background at launch and runs it at the NEXT launch: testers close and reopen the app (Admin → Diagnostics → "Check for update" applies it at once).`);
