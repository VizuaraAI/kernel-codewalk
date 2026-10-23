// Check the page's arithmetic (web/kernels.js) against the CPU trace of the notebook's own code (trace/k1..k4.json).
//   node test/check_kernels.mjs
// For every thread of the two traced blocks of each kernel: the elements of C it stored; for kernels 3 and 4, every
// shared-memory cell written in chunks 0, 1 and the last, by whom and from where; and the crate counts the captions
// quote for the warps followed in kernels 1 and 2.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const traces = {};
for (const k of [1, 2, 3, 4]) traces[k] = JSON.parse(fs.readFileSync(path.join(root, 'trace', `k${k}.json`), 'utf8'));
const t1 = traces[1];
const window = { CW: { DATA: { dims: { M: t1.m, K: t1.k, N: t1.n }, kernels: Object.fromEntries([1, 2, 3, 4].map((k) => [k, { source: traces[k].source, events: [] }])) } } };
vm.runInNewContext(fs.readFileSync(path.join(root, 'web', 'kernels.js'), 'utf8'), { window });
const { KF } = window.CW;

let checks = 0, fails = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; if (fails <= 25) console.log('FAIL', msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const k of [1, 2, 3, 4]) {
  const tr = traces[k];
  for (const [key, blk] of Object.entries(tr.blocks)) {
    const [bx, by] = key.split(',').map(Number);
    // stores
    blk.store_map.forEach((stores, lin) => {
      if (k === 4) {
        const own = KF[4].own(bx, by, lin);
        const want = own.cells.filter(([r, c]) => r < tr.m && c < tr.n);
        ok(same(stores, want), `k4 block ${key} tid ${lin}: stored ${JSON.stringify(stores)}, page says ${JSON.stringify(want)}`);
      } else {
        const tx = lin % 32, ty = Math.floor(lin / 32);
        const e = KF[k].elem(bx, by, tx, ty);
        const want = (k === 3 ? KF[3].live(e) : KF[k].live(e)) ? [[e.row, e.col]] : [];
        ok(same(stores, want), `k${k} block ${key} thread (${tx}, ${ty}): stored ${JSON.stringify(stores)}, page says ${JSON.stringify(want)}`);
      }
    });
    // shared-memory fills
    if (blk.fills) {
      for (const [tStr, arrays] of Object.entries(blk.fills)) {
        const t = Number(tStr);
        for (const [name, cells] of Object.entries(arrays)) {
          const seen = new Set();
          for (const [r, c, lin, src] of cells) {
            seen.add(r * 32 + c);
            if (k === 3) {
              const tx = lin % 32, ty = Math.floor(lin / 32);
              const cp = name === 'tileA' ? KF[3].copyA(bx, by, tx, ty, t) : KF[3].copyB(bx, by, tx, ty, t);
              ok(same(cp.dst, [r, c]), `k3 ${key} t${t} ${name}: thread (${tx}, ${ty}) wrote (${r}, ${c}), page says ${cp.dst}`);
              ok(src === null ? cp.zero : (!cp.zero && same(cp.src, src)), `k3 ${key} t${t} ${name} (${r}, ${c}): source ${JSON.stringify(src)}, page says ${cp.zero ? 'zero' : JSON.stringify(cp.src)}`);
            } else {
              const loads = name === 'tileA' ? KF[4].loadA(bx, by, lin, 32 * t) : KF[4].loadB(bx, by, lin, 32 * t);
              const hit = loads.find((e) => e.r === r && e.c === c);
              ok(!!hit, `k4 ${key} t${t} ${name}: tid ${lin} wrote (${r}, ${c}), which the page does not give it`);
              if (hit) ok(src === null ? hit.zero : (!hit.zero && same(hit.src, src)), `k4 ${key} t${t} ${name} (${r}, ${c}): source ${JSON.stringify(src)}, page says ${hit.zero ? 'zero' : JSON.stringify(hit.src)}`);
            }
          }
          ok(seen.size === 1024, `k${k} ${key} t${t} ${name}: ${seen.size} cells written, expected 1,024`);
        }
      }
    }
    // crates for the warps' global reads and writes, as the page counts them
    for (const [w, steps] of Object.entries(blk.warps || {})) {
      for (const st of steps) {
        if (st.space !== 'global') continue;
        const m = st.arr === 'matA' ? 'A' : st.arr === 'matB' ? 'B' : 'C';
        const mine = KF.crates(st.idx.map(([r, c]) => [m, r, c]));
        ok(mine === st.sectors, `k${k} ${key} warp ${w} line ${st.line} ${st.arr}: trace ${st.sectors} crates, page ${mine}`);
      }
    }
  }
}

// the numbers the captions quote
const w = (k, warp, line, arr, key) => traces[k].blocks['0,0'].warps[String(warp)].find((s) => s.line === line && s.arr === arr && JSON.stringify(s.key) === JSON.stringify(key));
const lineOf = (k, snip) => traces[k].source.findIndex((l) => l.includes(snip)) + 1;
const L1 = lineOf(1, 'dot_product +='), S1 = lineOf(1, 'matC[out_row, out_col]');
const L2 = lineOf(2, 'dot_product +='), S2 = lineOf(2, 'matC[out_row, out_col]');
ok(w(1, 8, L1, 'matA', [0]).sectors === 32, 'kernel 1, warp 8: 32 crates of A');
ok(w(1, 8, L1, 'matB', [0]).sectors === 1, 'kernel 1, warp 8: 1 crate of B');
ok(w(1, 8, S1, 'matC', []).sectors === 32, 'kernel 1, warp 8: 32 crates of C');
ok(w(2, 3, L2, 'matA', [0]).sectors === 1, 'kernel 2, warp 3: 1 crate of A');
ok(w(2, 3, L2, 'matB', [0]).sectors === 4, 'kernel 2, warp 3: 4 crates of B');
ok(w(2, 3, S2, 'matC', []).sectors === 4, 'kernel 2, warp 3: 4 crates of C');
const L3a = lineOf(3, 'tileA[ty, tx] = matA'), L3b = lineOf(3, 'tileB[ty, tx] = matB');
ok(w(3, 3, L3a, 'matA', [0]).sectors === 4 && w(3, 3, L3b, 'matB', [0]).sectors === 4, 'kernel 3, warp 3: 4 crates for each copy');
const L4a = lineOf(4, 'tileA[r, c] = matA');
for (let j = 0; j < 8; j++) ok(w(4, 0, L4a, 'matA', [0, j]).sectors === 4, `kernel 4, warp 0, round ${j}: 4 crates`);

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
