import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGAL_PAGES, buildLegalPage, legalValuesOf } from '@/utils/legalPages';

// The public /privacy, /terms and /cancellation pages must match lib/legalContent.ts:
// after any change to the legal texts run `npm run legal:pages` (then deploy hosting).
for (const page of LEGAL_PAGES) {
  test(`hosting/${page.file} is up to date with lib/legalContent.ts`, () => {
    const html = readFileSync(`hosting/${page.file}`, 'utf8');
    const values = legalValuesOf(html);
    assert.ok(values, 'page has no lanchai-legal-values meta — regenerate it');
    assert.equal(html, buildLegalPage(page, values), 'out of date — run `npm run legal:pages`');
  });
}

test('legal pages leave no placeholder and never mention the grace period', () => {
  for (const page of LEGAL_PAGES) {
    const html = readFileSync(`hosting/${page.file}`, 'utf8');
    assert.doesNotMatch(html, /\{\{/);
    assert.doesNotMatch(html, /grace/i);
  }
});
