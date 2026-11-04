// Fails unless EVERY `match` block of firestore.rules and storage.rules was exercised
// by at least one ALLOWED and one DENIED test (recorded by ok() / no() in env.ts).
// Run after the rules tests: `npm run test:emu:rules`.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'tests/.coverage');

/** Full paths of every match block ("fs:users/{userId}/bag/{itemId}"), nesting resolved. */
export function ruleBlocks(file: string, prefix: 'fs' | 'st', root: RegExp): string[] {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\/.*$/gm, '');
  const out: string[] = [];
  const stack: { path: string | null; depth: number }[] = [];
  let depth = 0;
  const re = /match\s+(\/\S+)\s*\{|\{|\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) {
      const own = m[1].replace(/^\//, '');
      const parent = [...stack].reverse().find(s => s.path !== null)?.path ?? null;
      const full = root.test(m[1]) ? '' : (parent ? `${parent}/${own}` : own);
      stack.push({ path: root.test(m[1]) ? null : full, depth });
      if (!root.test(m[1])) out.push(`${prefix}:${full}`);
      depth++;
    } else if (m[0] === '{') {
      depth++;
    } else {
      depth--;
      if (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
    }
  }
  return out;
}

/** Blocks where NO client can ever be allowed anything — deny tests only. */
const DENY_ONLY = new Set([
  'fs:inviteCodes/{code}',
  'fs:productLocks/{productId}',
  'st:{allPaths=**}',
]);

if (require.main === module) {
  const blocks = [
    ...ruleBlocks('firestore.rules', 'fs', /^\/databases\//),
    ...ruleBlocks('storage.rules', 'st', /^\/b\//),
  ];
  const hits: Record<string, { allow: number; deny: number }> = {};
  for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) {
    const part = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as typeof hits;
    for (const [k, v] of Object.entries(part)) {
      hits[k] ??= { allow: 0, deny: 0 };
      hits[k].allow += v.allow; hits[k].deny += v.deny;
    }
  }
  const unknown = Object.keys(hits).filter(k => !blocks.includes(k));
  const missing = blocks.flatMap(b => {
    const h = hits[b] ?? { allow: 0, deny: 0 };
    const gaps = [];
    if (!h.allow && !DENY_ONLY.has(b)) gaps.push('allow');
    if (!h.deny) gaps.push('deny');
    return gaps.length ? [`  ${b} — no ${gaps.join(' / ')} test`] : [];
  });
  console.log(`Rule blocks: ${blocks.length} (firestore + storage), covered: ${blocks.length - missing.length}.`);
  if (unknown.length) console.error(`Tests reference unknown blocks (typo?):\n  ${unknown.join('\n  ')}`);
  if (missing.length) console.error(`Missing coverage:\n${missing.join('\n')}`);
  if (unknown.length || missing.length) process.exit(1);
}
