// Write every kernel's walk as plain text (the code lines, the question, the numbered reasoning) to out/walk_text.md,
// for proofreading and review without a browser.   node test/export_text.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'out', 'lecture8_codewalk.html'), 'utf8');
const dataJs = html.match(/<script>(window\.CW = window\.CW \|\| \{\}; window\.CW\.DATA = [\s\S]*?)<\/script>/)[1];
const window = {};
const ctx = vm.createContext({ window, matchMedia: () => ({ matches: false }), console });
vm.runInContext(dataJs, ctx);
for (const f of ['engine.js', 'views.js', 'kernels.js', 'scenes.js', 'k1.js', 'k2.js', 'k3.js', 'k4.js']) vm.runInContext(fs.readFileSync(path.join(root, 'web', f), 'utf8'), ctx);
const CW = window.CW;

const plain = (h) => h
  .replace(/<span class="eq">([\s\S]*?)<\/span>/g, (m, x) => '\n\n    ' + x.replace(/<[^>]+>/g, '').replace(/\n/g, '\n    ') + '\n\n')
  .replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const out = ['# Lecture 8 code walk: the text of every step\n'];
for (const k of [1, 2, 3, 4]) {
  const L = CW.LESSONS[k];
  const src = CW.DATA.kernels[k].source;
  const find = (snip, nth = 1) => { let seen = 0; for (let i = 0; i < src.length; i++) if (src[i].includes(snip) && ++seen === nth) return i + 1; throw new Error(snip); };
  const resolve = (list) => { const o = []; for (const x of list || []) { if (typeof x === 'number') o.push(x); else if (Array.isArray(x)) { const n0 = find(x[0], x[1] || 1); for (let j = 0; j <= (x[2] || 0); j++) o.push(n0 + j); } else o.push(find(x)); } return o; };
  out.push(`\n## ${L.tab}: ${L.tabSub} (${L.file})\n\nThe cell:\n\n` + src.map((l, i) => `    ${String(i + 1).padStart(2)}  ${l}`).join('\n') + '\n');
  L.beats.forEach((b, bi) => {
    const lines = [...new Set(resolve(b.lines))];
    out.push(`\n### ${k}.${bi + 1} ${b.q}\n\nLines: ${lines.length ? lines.join(', ') : '(summary)'}\n` + lines.map((n) => `\n    ${n}: ${src[n - 1]}`).join('') + '\n');
    b.steps.forEach((s, si) => {
      const tag = s.kind ? `[${s.kind}] ` : '';
      out.push(`\n${si + 1}. ${tag}${plain(s.say)}`);
    });
    if (b.tryit) out.push(`\n(Try it box: ${b.tryit.title}; fields ${b.tryit.fields.map((f) => f.label).join(', ')})`);
    out.push('\n');
  });
}
fs.writeFileSync(path.join(root, 'out', 'walk_text.md'), out.join('\n'));
console.log('wrote out/walk_text.md');
