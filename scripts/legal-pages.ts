// npm run legal:pages — writes hosting/privacy.html, terms.html, cancellation.html from
// lib/legalContent.ts (see utils/legalPages.ts). Retention durations come from the live
// config/legalPublic (public read, no sign-in), else the code defaults. Re-run after any
// change to the legal texts or to Admin → Shop settings → Document retention, then
// `firebase deploy --only hosting`. The unit test fails while a page is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL_PAGES, buildLegalPage } from '@/utils/legalPages';
import { RETENTION_DEFAULTS, sanitizeRetention, type RetentionConfig } from '@/functions/src/shared/retention';

function projectId(): string {
  if (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) return process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  try {
    const m = /^EXPO_PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m.exec(readFileSync('.env.local', 'utf8'));
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  } catch { /* no .env.local */ }
  return '';
}

async function liveRetention(): Promise<{ value: RetentionConfig; source: string }> {
  const pid = projectId();
  if (!pid) return { value: RETENTION_DEFAULTS, source: 'code defaults (no project id)' };
  try {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/config/legalPublic`);
    if (res.status === 404) return { value: RETENTION_DEFAULTS, source: 'code defaults (config/legalPublic not set)' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const f = ((await res.json()) as { fields?: Record<string, { integerValue?: string; doubleValue?: number }> }).fields ?? {};
    const num = (k: string) => Number(f[k]?.integerValue ?? f[k]?.doubleValue);
    return { value: sanitizeRetention({ idRetentionMonths: num('idRetentionMonths'), proofRetentionDays: num('proofRetentionDays') }), source: 'config/legalPublic' };
  } catch (err) {
    return { value: RETENTION_DEFAULTS, source: `code defaults (couldn't read config/legalPublic: ${(err as Error).message})` };
  }
}

async function main() {
  const { value, source } = await liveRetention();
  for (const page of LEGAL_PAGES) writeFileSync(join('hosting', page.file), buildLegalPage(page, value));
  console.log(`Wrote ${LEGAL_PAGES.map(p => `hosting/${p.file}`).join(', ')}`);
  console.log(`Retention: ID ${value.idRetentionMonths} months, proofs ${value.proofRetentionDays} days — from ${source}.`);
  console.log('Next: commit, then `firebase deploy --only hosting`.');
}

void main();
