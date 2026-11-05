// Minimal Markdown → HTML for our own legal texts (headings, bullets, bold, italic, rules) —
// the ONE converter for the rental agreement's Terms annex (lib/rentalAgreement.ts) and the
// public /privacy, /terms, /cancellation pages (scripts/legal-pages.ts). Pure: no React
// Native import, so Node scripts and tests can use it.

export const escHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function markdownToHtml(md: string, opts: {
  /** '# Title' lines: dropped (the agreement annex has its own title) or rendered as <h1>. */
  title?: 'drop' | 'h1';
  /** Tag for '## ' section headings (the agreement annex uses h3). */
  sectionTag?: 'h2' | 'h3';
} = {}): string {
  const title = opts.title ?? 'drop';
  const sectionTag = opts.sectionTag ?? 'h3';
  const inline = (t: string) => escHtml(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const out: string[] = [];
  let list = false;
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { closeList(); continue; }
    if (line.startsWith('# ')) { closeList(); if (title === 'h1') out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('## ')) { closeList(); out.push(`<${sectionTag}>${inline(line.slice(3))}</${sectionTag}>`); continue; }
    if (line.trim() === '---') { closeList(); out.push('<hr/>'); continue; }
    const m = /^(\s*)- (.*)$/.exec(line);
    if (m) {
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li${m[1].length >= 2 ? ' class="sub"' : ''}>${inline(m[2])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}
