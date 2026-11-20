// Android edge-to-edge (SDK 54): a scrollable STACK screen must stop above the 3-button /
// gesture bar. The ONE convention (CLAUDE.md "Stack screens + Android edge-to-edge"):
// the ROOT carries the bottom inset — `screen.root` from useScreenInsets(), or
// `paddingBottom: insets.bottom` on the root, or SafeAreaView edges top + bottom — and
// the scroll content only adds the usual gap (`screen.contentBottom`). Putting
// `insets.bottom` inside a contentContainerStyle instead makes the list scroll UNDER the
// bar. Tab screens are exempt (the tab bar sits above the system bar). A screen whose
// fixed bottom bar handles the inset itself opts out with a `// bottom-inset: <reason>`
// comment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function screens(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '(tabs)' ? [] : screens(p);
    return name.endsWith('.tsx') && name !== '_layout.tsx' && !name.startsWith('+') ? [p] : [];
  });
}

/** Does the file render a VERTICAL ScrollView / FlatList / SectionList? */
function hasVerticalScroller(src: string): boolean {
  const re = /<(?:Animated\.)?(?:ScrollView|FlatList|SectionList)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index);
    const end = rest.search(/\/>|>\s*\n/);
    const tag = end < 0 ? rest.slice(0, 600) : rest.slice(0, end);
    if (!/\bhorizontal\b/.test(tag)) return true;
  }
  return false;
}

const ROOT_INSET = [
  /screen\.root/,
  /paddingBottom:\s*insets\.bottom\b(?!\s*\+)/,
  /edges=\{\[\s*'top',\s*'bottom'\s*\]\}/,
  /paddingBottom:\s*screen\.bottom/,
  /bookingBarSpace\(/,
  /\/\/ bottom-inset:/,
];

test('every scrollable stack screen stops above the Android navigation bar', () => {
  const missing: string[] = [];
  const contentInset: string[] = [];
  for (const f of screens(join(ROOT, 'app'))) {
    const src = readFileSync(f, 'utf8');
    if (!hasVerticalScroller(src)) continue;
    const rel = relative(ROOT, f);
    if (!ROOT_INSET.some(re => re.test(src))) missing.push(rel);
    // The fixed booking bar is the one legit content-level case (bookingBarSpace).
    const lines = src.split('\n').filter(l => /contentContainerStyle=.*insets\.bottom/.test(l) && !/bookingBarSpace\(/.test(l));
    if (lines.length) contentInset.push(rel);
  }
  assert.deepEqual(missing, [], 'put the bottom inset on the screen root (screen.root / useScreenInsets)');
  assert.deepEqual(contentInset, [], 'insets.bottom inside contentContainerStyle scrolls under the bar — move it to the root');
});
