/* k4.js: Kernel 4, each thread owns TM = 8 elements of one column of the tile, line by line. */
(function (CW) {
  'use strict';
  const { P, n: { T, R, C, L }, win, block, blockGrid, regs, pill, span, vspan, arrow, S, S3, fmt, f1 } = CW;
  const { M, K, N } = CW.D;
  const K4 = CW.KF[4];
  const s7 = 7;
  const V = (snip, key, names) => CW.V(4, snip, key, names);
  const NAMES = ['tid', 'col', 'row', 'block_row', 'block_col', 'k0', 'i', 'r', 'c', 'global_mem_row', 'global_mem_col', 'kk', 'b', 't', 'product'];
  const S4 = CW.S4 = {};
  const AF = '#cfe2f6', BF = '#f7d3e0';
  const warpFill = (w) => ['#d9d0f7', '#ece7fb', '#d9d0f7', '#ece7fb'][w];
  const warpInk = (w) => [P.cInk, P.cInk, P.cInk, P.cInk][w];

  // ------------------------------------------------------------------------------------------------ the idea: one read of tileB for many sums
  S4.idea = function (o = {}) {
    const out = [];
    const bx = 130, by = 70, cy = 200;
    for (const [k, x0, title] of [[3, 120, 'Kernel 3: 32 threads on column 8'], [4, 560, 'Kernel 4: 4 threads on column 8']]) {
      out.push(T(`id${k}:t`, x0, 54, title, { size: 14, wt: 600, fill: P.ink }));
      // tileB's row i = 0, with cell 8 lit
      out.push(...win(`id${k}:b`, x0, 84, 1, 32, s7, { base: '#f6e1ea', hl: [['cell', 0, 8, P.bAcc]] }));
      out.push(T(`id${k}:bt`, x0 + 32 * s7 + 8, 92, 'row 0 of tileB', { size: 11.5, fill: P.bInk }));
      // column 8 of C's tile
      out.push(...win(`id${k}:c`, x0, cy, 32, 32, s7, { base: P.cFill, hl: [['col', 8, P.cMid]] }));
      if (k === 3) {
        for (let r = 0; r < 32; r++) out.push(C(`id3:d:${r}`, x0 + 8 * s7 + s7 / 2, cy + r * s7 + s7 / 2, 2.3, { fill: P.warpA, z: 4 }));
        out.push(T('id3:n', x0, cy + 32 * s7 + 26, '32 threads, one element each:', { size: 12, fill: P.soft }));
        out.push(T('id3:n2', x0, cy + 32 * s7 + 42, 'each reads tileB[0][8] for itself', { size: 12, wt: 600, fill: P.bInk }));
      } else {
        for (let g = 0; g < 4; g++) {
          out.push(R(`id4:s:${g}`, x0 + 8 * s7 - 1.5, cy + 8 * g * s7 - 1.5, s7 + 3, 8 * s7 + 3, { rx: 4, fill: 'none', stroke: P.cAcc, sw: 1.4, z: 4 }));
          out.push(C(`id4:d:${g}`, x0 + 8 * s7 + s7 / 2, cy + 8 * g * s7 + s7 / 2, 2.6, { fill: g === 0 ? P.me : P.warpA, z: 5 }));
        }
        out.push(T('id4:n', x0, cy + 32 * s7 + 26, '4 threads, 8 elements each:', { size: 12, fill: P.soft }));
        out.push(T('id4:n2', x0, cy + 32 * s7 + 42, 'each reads tileB[0][8] once, for 8 sums', { size: 12, wt: 600, fill: P.bInk }));
      }
    }
    return out;
  };
  S4.ideaBeads = function () {
    const out = [], cy = 200;
    for (let r = 0; r < 32; r++) out.push({ x0: 120 + 8 * s7 + s7 / 2, y0: 84 + s7 / 2, x1: 120 + 8 * s7 + s7 / 2, y1: cy + r * s7 + s7 / 2, fill: P.bAcc, r: 2.4, d: r * 30, dur: 900 });
    for (let g = 0; g < 4; g++) out.push({ x0: 560 + 8 * s7 + s7 / 2, y0: 84 + s7 / 2, x1: 560 + 8 * s7 + s7 / 2, y1: cy + 8 * g * s7 + s7 / 2, fill: P.bAcc, r: 3.4, d: g * 120, dur: 900 });
    return out;
  };

  // ------------------------------------------------------------------------------------------------ 128 threads in a line, and where they work
  const QX = 70, QY = 170, QS = 7;                 // the 1D block: 4 rows of 32 dots, one row per warp
  const OX = 556, OY = 120, OS = 8;                // the tile of C, larger
  S4.owners = function (o = {}) {
    const out = [];
    const placed = (tid) => o.land === 'all' || (o.land === 'one' && tid === 8) || (o.land === 'warp0' && tid < 32);
    // the tile
    const hl = [];
    if (o.bands) for (let w = 0; w < 4; w++) hl.push(['rect', 8 * w, 0, 8 * w + 7, 31, warpFill(w)]);
    out.push(...win('own', OX, OY, 32, 32, OS, { base: P.cFill, title: 'C', sub: 'the 32 × 32 tile of block (0, 0)', rowLabels: true, colLabels: true, hl }));
    if (o.bands) for (let w = 0; w < 4; w++) out.push(T(`own:wl:${w}`, OX + 32 * OS + 12, OY + (8 * w + 4.6) * OS, `warp ${w}: rows ${8 * w} to ${8 * w + 7}`, { size: 11.5, fill: warpInk(w), wt: 600 }));
    if (o.strips) {
      for (let tid = 0; tid < 128; tid++) {
        const col = tid % 32, row = Math.floor(tid / 32) * 8;
        if (o.strips === 'one' && tid !== 8) continue;
        out.push(R(`own:s:${tid}`, OX + col * OS + 1, OY + row * OS + 1, OS - 2, 8 * OS - 2, { rx: 3, fill: 'none', stroke: tid === 8 ? P.me : '#b9abee', sw: tid === 8 ? 1.8 : 0.8, z: 4, d: o.land === 'all' ? 300 + tid * 6 : 0 }));
      }
    }
    if (o.me) {
      out.push(R('own:me', OX + 8 * OS - 1, OY - 1, OS + 2, 8 * OS + 2, { rx: 3, fill: P.meFill, stroke: P.me, sw: 1.6, z: 3 }));
      out.push(T('own:met', OX + 9 * OS + 8, OY + 3 * OS + OS * 0.8, o.meText || 'thread 8: rows 0 to 7 of column 8', { size: 12, wt: 600, fill: P.meInk }));
      if (o.c38) out.push(T('own:c38', OX + 9 * OS + 8, OY + 3 * OS + OS * 0.8 + 16, 'C[3][8] is the one with t = 3', { size: 12, fill: P.meInk }));
    }
    // the threads
    if (o.threads !== false) {
      out.push(T('q:t', QX, QY - 46, 'The 128 threads of block (0, 0)', { size: 13, wt: 600, fill: P.ink }));
      out.push(T('q:s', QX, QY - 28, 'threads_per_block = (128, 1): threadIdx.x = tid = 0 to 127', { size: 11.5, fill: P.mute, font: 'mono' }));
      for (let tid = 0; tid < 128; tid++) {
        const w = Math.floor(tid / 32), lane = tid % 32;
        let x = QX + lane * QS + QS / 2, y = QY + w * 26 + QS / 2;
        if (placed(tid)) { const col = tid % 32, row = Math.floor(tid / 32) * 8; x = OX + col * OS + OS / 2; y = OY + row * OS + OS / 2; }
        const isMe = tid === 8;
        out.push(C(`q:d:${tid}`, x, y, isMe ? 3 : 2.3, { fill: isMe ? P.me : (w % 2 ? P.warpB : P.warpA), z: 5, d: o.land === 'all' ? tid * 9 : o.land === 'warp0' ? tid * 20 : 0 }));
      }
      for (let w = 0; w < 4; w++) out.push(T(`q:w:${w}`, QX + 32 * QS + 10, QY + w * 26 + QS * 0.85, `warp ${w}: tid ${32 * w} to ${32 * w + 31}`, { size: 11, fill: P.cInk }));
      if (o.tidLabels) {
        for (const tid of [0, 8, 31]) out.push(T(`q:tl:${tid}`, QX + tid * QS + QS / 2, QY - 6, String(tid), { size: 10, fill: tid === 8 ? P.meInk : P.mute, anchor: 'middle' }));
      }
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ kernel 3 against kernel 4, the same element
  S4.vs = function () {
    const out = [];
    const s = 6;
    const panes = [[3, 130, 'Kernel 3: thread (8, 3)', 'out_col = tx + blockIdx.x × 32 = 8', 'out_row = ty + blockIdx.y × 32 = 3', 'one element, a column of C'],
      [4, 560, 'Kernel 4: thread 8', 'col = tid % 32 = 8      (in the tile)', 'row = (tid // 32) × 8 = 0', 'eight elements, columns of the tile']];
    for (const [k, x, t1, f1_, f2, f3] of panes) {
      const y = 170;
      out.push(T(`vs${k}:t`, x, 70, t1, { size: 14, wt: 600, fill: P.ink }));
      out.push(T(`vs${k}:f1`, x, 96, f1_, { size: 12, fill: P.soft, font: 'mono' }));
      out.push(T(`vs${k}:f2`, x, 114, f2, { size: 12, fill: P.soft, font: 'mono' }));
      out.push(...win(`vs${k}:c`, x, y, 32, 32, s, { base: P.cFill, rowLabels: true, colLabels: true, hl: k === 3 ? [['cell', 3, 8, P.me]] : [['rect', 0, 8, 7, 8, P.me]] }));
      out.push(T(`vs${k}:f3`, x, y + 32 * s + 26, k === 3 ? 'computes C[3][8] and nothing else' : 'computes C[0][8] to C[7][8]', { size: 12, wt: 600, fill: P.meInk }));
      out.push(T(`vs${k}:f4`, x, y + 32 * s + 44, k === 3 ? 'the block offset is inside out_col' : 'block_col = blockIdx.x × 32 is added later', { size: 12, fill: P.soft }));
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the block's origin in C
  S4.origin = function (o = {}) {
    const GX = 150, GY = 118, BS = 10;
    const out = blockGrid('og', GX, GY, BS, M, N, { xRows: false, overhang: false, hl: [[o.bx, o.by, P.cAcc]] });
    const x0 = GX + o.bx * BS, y0 = GY + o.by * BS;
    out.push(L('og:g1', x0 + BS, y0, 600, 150, { stroke: P.cMid, dash: '3 3' }));
    out.push(L('og:g2', x0 + BS, y0 + BS, 600, 150 + 256, { stroke: P.cMid, dash: '3 3' }));
    out.push(...win('og:t', 600, 150, 32, 32, 8, { r0: 32 * o.by, c0: 32 * o.bx, base: P.cFill, rowLabels: true, colLabels: true, hl: o.cell ? [['cell', 32 * o.by + o.cell[0], 32 * o.bx + o.cell[1], P.me]] : [] }));
    out.push(T('og:tt', 600, 150 - 26, `block (${o.bx}, ${o.by}): rows ${fmt(32 * o.by)} to ${fmt(32 * o.by + 31)}, columns ${fmt(32 * o.bx)} to ${fmt(32 * o.bx + 31)}`, { size: 12, wt: 600, fill: P.cInk }));
    out.push(C('og:o', 600, 150, 4, { fill: P.me, z: 5 }));
    out.push(T('og:ot', 594, 150 + 262 + 26, `origin: block_row = ${o.by} × 32 = ${32 * o.by}, block_col = ${o.bx} × 32 = ${32 * o.bx}`, { size: 12, fill: P.meInk, wt: 600 }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ eight sums in registers
  S4.regs8 = function (vals) {
    const out = S4.owners({ threads: false, me: true, strips: 'one' });
    const x = 120, y = 210;
    out.push(T('r8:t', x, y - 30, 'registers of thread 8: product[0] to product[7]', { size: 12.5, wt: 600, fill: P.meInk }));
    for (let t = 0; t < 8; t++) {
      out.push(R(`r8:b:${t}`, x, y + t * 30, 150, 24, { rx: 6, fill: P.meFill, stroke: P.me, sw: 1, z: 3 }));
      out.push(T(`r8:n:${t}`, x + 8, y + t * 30 + 16, `product[${t}]`, { size: 11.5, fill: P.mute, font: 'mono', z: 4 }));
      out.push(T(`r8:v:${t}:${vals[t]}`, x + 142, y + t * 30 + 16, f1(vals[t]), { size: 12, wt: 600, fill: P.ink, anchor: 'end', font: 'mono', z: 4 }));
      out.push(L(`r8:l:${t}`, x + 156, y + t * 30 + 12, OX + 8 * OS - 2, OY + t * OS + OS / 2, { stroke: t === 3 ? P.me : '#f3d2b0', dash: '2 3' }));
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ loading a tray with 128 threads
  const LX = 600, LY = 150, LS = 7, SX = 110, SY = 150;
  /* o.which 'A' or 'B'; o.rounds: how many rounds are done (0 to 8); o.me: highlight thread 8's eight cells;
     o.numbers: write cell numbers on row 0 and 1; o.warpRow: [round, warp] to stress one warp's row. */
  S4.load = function (o) {
    const out = [];
    const isA = o.which === 'A', k0 = o.k0 || 0;
    const srcR0 = isA ? 0 : k0, srcC0 = isA ? k0 : 0;
    const shl = [], crates = [];
    if (o.rounds > 0) shl.push(['rect', srcR0, srcC0, srcR0 + Math.min(32, 4 * o.rounds) - 1, srcC0 + 31, isA ? P.aMid : P.bMid]);
    if (o.warpRow) { const r = 4 * o.warpRow[0] + o.warpRow[1]; for (let g = 0; g < 4; g++) crates.push([srcR0 + r, srcC0 + 8 * g, isA ? P.aAcc : P.bAcc, g * 100]); }
    out.push(...win('ls', SX, SY, 32, 32, LS, { r0: srcR0, c0: srcC0, R: isA ? M : K, Cc: isA ? K : N, base: isA ? P.aFill : P.bFill, title: isA ? 'A' : 'B',
      sub: isA ? `rows 0 to 31, columns ${fmt(k0)} to ${fmt(k0 + 31)}: the chunk at k0 = ${fmt(k0)}` : `rows ${fmt(k0)} to ${fmt(k0 + 31)}, columns 0 to 31`, rowLabels: true, colLabels: true, hl: shl, crates }));
    const mask = (r, c) => {
      const i = r * 32 + c, round = Math.floor(i / 128), tid = i % 128, w = Math.floor(tid / 32);
      if (o.me && tid === 8) return P.me;
      if (round < o.rounds) return isA ? ['#bcd6f3', '#d3e4f8', '#bcd6f3', '#d3e4f8'][w] : ['#f2bfd2', '#f8d7e3', '#f2bfd2', '#f8d7e3'][w];
      return null;
    };
    out.push(...win('lt', LX, LY, 32, 32, LS, { empty: true, frame: P.sFill, frameStroke: P.sMid, emptyFill: '#f1f8f5', fillMask: mask, rowLabels: true, colLabels: true }));
    out.push(T('lt:t', LX, LY - 26, isA ? 'tileA' : 'tileB', { size: 14, wt: 600, fill: P.sInk }));
    out.push(T('lt:s', LX + 48, LY - 26, 'cells numbered 0 to 1,023, row by row', { size: 11.5, fill: P.mute }));
    if (o.numbers) {
      for (const c of [0, 1, 2, 31]) out.push(T(`lt:n0:${c}`, LX + c * LS + LS / 2, LY + 32 * LS + 16, String(c), { size: 9.5, fill: P.mute, anchor: 'middle' }));
      out.push(T('lt:nrow', LX, LY + 32 * LS + 34, 'cell i sits at row i // 32, column i % 32', { size: 11.5, fill: P.soft }));
    }
    if (o.me) {
      out.push(T('lt:me', LX + 32 * LS + 14, LY + 14, 'thread 8 copies', { size: 12, wt: 600, fill: P.meInk }));
      out.push(T('lt:me2', LX + 32 * LS + 14, LY + 30, 'cells 8, 136, 264,', { size: 12, fill: P.meInk }));
      out.push(T('lt:me3', LX + 32 * LS + 14, LY + 46, '…, 904: column 8,', { size: 12, fill: P.meInk }));
      out.push(T('lt:me4', LX + 32 * LS + 14, LY + 62, 'rows 0, 4, 8, …, 28', { size: 12, fill: P.meInk }));
    }
    if (o.rounds > 0 && o.rounds < 8) out.push(T('lt:round', LX, LY + 32 * LS + 52, `round ${o.rounds - 1}: cells ${fmt(128 * (o.rounds - 1))} to ${fmt(128 * o.rounds - 1)}, rows ${4 * (o.rounds - 1)} to ${4 * o.rounds - 1}`, { size: 12, wt: 600, fill: P.cInk }));
    if (o.rounds === 8) out.push(T('lt:round', LX, LY + 32 * LS + 52, '8 rounds × 128 threads = 1,024 cells', { size: 12, wt: 600, fill: P.cInk }));
    if (o.warpRow) {
      const r = 4 * o.warpRow[0] + o.warpRow[1];
      out.push(R('lt:wr', LX - 2, LY + r * LS - 2, 32 * LS + 4, LS + 4, { rx: (LS + 4) / 2, fill: 'none', stroke: P.cAcc, sw: 1.5, z: 5 }));
      out.push(T('lt:wrt', LX + 32 * LS + 14, LY + r * LS + LS * 0.85 + 90, `warp ${o.warpRow[1]}, round ${o.warpRow[0]}: row ${r}`, { size: 12, wt: 600, fill: P.cInk }));
      out.push(T('lt:wrt2', LX + 32 * LS + 14, LY + r * LS + LS * 0.85 + 106, '32 neighbours: 4 crates', { size: 12, fill: P.cInk }));
    }
    return out;
  };
  S4.loadBeads = function (o) {
    const out = [], isA = o.which === 'A', col = isA ? P.aAcc : P.bAcc;
    const cc = (x, y, r, c) => [x + c * LS + LS / 2, y + r * LS + LS / 2];
    for (let r = 4 * o.round; r < 4 * o.round + 4; r++) for (let c = 0; c < 32; c += 2) {
      const [x0, y0] = cc(SX, SY, r, c), [x1, y1] = cc(LX, LY, r, c);
      out.push({ x0, y0, x1, y1, fill: col, r: 2.4, d: (r % 4) * 140 + c * 6, dur: 900, op: 0.85 });
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ phase 2: one read of tileB, eight multiply-adds
  const MAX = 300, MAY = 300, MBX = 566, MBY = 42, MCX = 566, MCY = 300;
  S4.phase2 = function (o) {
    const out = [];
    const kk = o.kk || 0;
    const hlA = [], hlB = [], hlC = [];
    if (o.mode === 'thread') {
      hlA.push(['rect', 0, kk, 7, kk, P.aAcc]);
      hlB.push(['cell', kk, 8, P.bAcc]);
      hlC.push(['rect', 0, 8, 7, 8, P.meFill]);
    } else if (o.mode === 'warp') {
      hlA.push(['cell', o.t || 0, kk, P.aAcc]);
      hlB.push(['row', kk, P.bMid]);
      hlC.push(['row', o.t || 0, P.cMid]);
    }
    out.push(...win('pA', MAX, MAY, 32, 32, s7, { base: '#d9eaf7', frame: P.sFill, frameStroke: P.sMid, rowLabels: true, colLabels: true, hl: hlA }));
    out.push(T('pA:t', MAX, MAY - 26, 'tileA', { size: 14, wt: 600, fill: P.sInk }));
    out.push(...win('pB', MBX, MBY, 32, 32, s7, { base: '#f6e1ea', frame: P.sFill, frameStroke: P.sMid, rowLabels: true, colLabels: true, hl: hlB }));
    out.push(T('pB:t', MBX + 32 * s7 + 16, MBY + 14, 'tileB', { size: 14, wt: 600, fill: P.sInk }));
    out.push(...win('pC', MCX, MCY, 32, 32, s7, { base: P.cFill, rowLabels: true, colLabels: true, hl: hlC }));
    out.push(T('pC:t', MCX + 32 * s7 + 16, MCY + 14, 'C', { size: 14, wt: 600, fill: P.cInk }));
    if (o.mode === 'thread') {
      out.push(...regs('p:b', 92, 120, [['b', o.b === undefined ? '·' : f1(o.b), o.b !== undefined]], { title: 'thread 8’s register b' }));
      out.push(T('p:la', MAX, MAY + 32 * s7 + 26, `tileA[0..7][${kk}]: one value for each of the 8 sums`, { size: 12, wt: 600, fill: P.aInk }));
      out.push(T('p:lb', MBX - 14, MBY + kk * s7 + s7 * 0.85, `tileB[${kk}][8]: read once`, { size: 12, wt: 600, fill: P.bInk, anchor: 'end' }));
      if (o.sums !== undefined) {
        out.push(T('p:ls', MCX + 32 * s7 + 16, MCY + 44, 'product[0..7]', { size: 12, wt: 600, fill: P.meInk }));
        out.push(T('p:ls2', MCX + 32 * s7 + 16, MCY + 60, `= ${f1(o.sums)} each`, { size: 12, wt: 600, fill: P.meInk }));
      }
    } else if (o.mode === 'warp') {
      out.push(T('p:la', MAX, MAY + 32 * s7 + 26, `tileA[${o.t || 0}][${kk}]: the same value for all 32 lanes`, { size: 12, wt: 600, fill: P.aInk }));
      out.push(T('p:lb', MBX - 14, MBY + kk * s7 + s7 * 0.85, `tileB[${kk}][0..31]: one row, 32 banks`, { size: 12, wt: 600, fill: P.bInk, anchor: 'end' }));
    }
    return out;
  };
  S4.phase2Beads = function (o) {
    const out = [], kk = o.kk || 0;
    const cc = (x, y, r, c) => [x + c * s7 + s7 / 2, y + r * s7 + s7 / 2];
    if (o.stage === 'b') {
      const [bx, by] = cc(MBX, MBY, kk, 8);
      out.push({ x0: bx, y0: by, x1: 120, y1: 133, fill: P.bAcc, r: 4, dur: 1000 });
    } else {
      for (let t = 0; t < 8; t++) {
        const [ax, ay] = cc(MAX, MAY, t, kk), [cx, cy] = cc(MCX, MCY, t, 8);
        out.push({ x0: ax, y0: ay, x1: cx, y1: cy, fill: P.aAcc, r: 3, d: t * 110, dur: 900 });
        out.push({ x0: 120, y0: 133, x1: cx, y1: cy, fill: P.bAcc, r: 3, d: t * 110 + 60, dur: 900 });
      }
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ reads counted
  S4.reads = function () {
    const out = [];
    const x = 150, y3 = 170, y4 = 320, tk = 22;
    out.push(T('rd:t', x, 110, 'reads from shared memory for 8 multiply-adds into 8 elements of one column', { size: 13, wt: 600, fill: P.ink }));
    out.push(T('rd:3', x, y3 - 14, 'kernel 3: 8 threads, each reads one value of tileA and one of tileB', { size: 12, fill: P.soft }));
    for (let j = 0; j < 16; j++) out.push(R(`rd:3:${j}`, x + j * (tk + 6), y3, tk, tk, { rx: 5, fill: j % 2 ? P.bMid : P.aMid, z: 2, d: j * 40 }));
    out.push(T('rd:3n', x + 16 * (tk + 6) + 10, y3 + 16, '16 reads', { size: 13, wt: 600, fill: P.ink }));
    out.push(T('rd:4', x, y4 - 14, 'kernel 4: one thread reads tileB[kk][col] once, then 8 values of tileA', { size: 12, fill: P.soft }));
    for (let j = 0; j < 9; j++) out.push(R(`rd:4:${j}`, x + j * (tk + 6), y4, tk, tk, { rx: 5, fill: j === 0 ? P.bMid : P.aMid, z: 2, d: j * 40 }));
    out.push(T('rd:4n', x + 9 * (tk + 6) + 10, y4 + 16, '9 reads', { size: 13, wt: 600, fill: P.ink }));
    out.push(T('rd:sum', x, y4 + 80, 'reads per multiply-add: 16 ÷ 8 = 2 in kernel 3, 9 ÷ 8 = 1.125 in kernel 4', { size: 13, fill: P.ink, font: 'serif' }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the store, and the edge block
  S4.store = function (o = {}) {
    const out = [];
    const x = 330, y = 120, s = 9;
    const hl = o.warp ? [['row', o.t, P.cMid]] : [['rect', 0, 8, 7, 8, P.meFill]];
    const crates = o.warp ? [0, 8, 16, 24].map((c0, g) => [o.t, c0, P.cAcc, g * 100]) : [];
    out.push(...win('st', x, y, 32, 32, s, { base: P.cFill, title: 'C', sub: 'the tile of block (0, 0)', rowLabels: true, colLabels: true, hl, crates }));
    if (!o.warp) {
      out.push(T('st:me', x + 9 * s + 10, y + 3 * s + s * 0.8, 'C[3][8] = product[3] = 7,200.0', { size: 12.5, wt: 600, fill: P.meInk }));
      out.push(T('st:me2', x + 9 * s + 10, y + 3 * s + s * 0.8 + 17, 'thread 8 writes rows 0 to 7 of column 8', { size: 12, fill: P.meInk }));
    } else {
      out.push(T('st:w', x + 32 * s + 12, y + o.t * s + s * 0.8, `warp 0, t = ${o.t}: row ${o.t}`, { size: 12, wt: 600, fill: P.cInk }));
      out.push(T('st:w2', x + 32 * s + 12, y + o.t * s + s * 0.8 + 16, '32 neighbours: 4 crates', { size: 12, fill: P.cInk }));
    }
    return out;
  };
  S4.edge = function () {
    const out = [];
    const r0 = 32 * (K4.grid[1] - 1), x = 330, y = 120, s = 9;
    const hl = [];
    for (let w = 0; w < 4; w++) hl.push(['rect', r0 + 8 * w, 768, Math.min(r0 + 8 * w + 7, M - 1), 799, warpFill(w)]);
    out.push(...win('ed', x, y, 32, 32, s, { r0, c0: 768, R: M, Cc: N, base: P.cFill, title: 'C', sub: 'the tile of block (24, 31): rows 992 to 1,023', rowLabels: true, colLabels: true, hl: hl.slice(0, 1), voidRowText: 'rows 1,000 to 1,023: past the end' }));
    out.push(T('ed:w0', x + 32 * s + 12, y + 4 * s, 'warp 0: rows 992 to 999', { size: 12, wt: 600, fill: P.cInk }));
    out.push(T('ed:w0b', x + 32 * s + 12, y + 4 * s + 16, 'writes all 8 elements', { size: 12, fill: P.cInk }));
    out.push(T('ed:w1', x + 32 * s + 12, y + 16 * s, 'warps 1 to 3: rows 1,000 to 1,023', { size: 12, wt: 600, fill: P.mute }));
    out.push(T('ed:w1b', x + 32 * s + 12, y + 16 * s + 16, 'every global_mem_row < m test fails:', { size: 12, fill: P.mute }));
    out.push(T('ed:w1c', x + 32 * s + 12, y + 16 * s + 32, 'they copy and compute, and write nothing', { size: 12, fill: P.mute }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the lesson
  const allEq = (v) => v;
  CW.LESSONS = CW.LESSONS || {};
  CW.LESSONS[4] = {
    tab: 'Kernel 4',
    tabSub: '8 elements per thread',
    file: 'matmul-04.py',
    whoText: 'Thread 8 of block (0, 0)',
    dim: (n, line) => /^(from |import )/.test(line.trim()) || /cuda\.synchronize|asnumpy/.test(line) || /^\s*#/.test(line),
    beats: [
      {
        q: 'What is kernel 4 trying to fix?',
        lines: ['def matmul'],
        steps: [
          { say: 'In kernel 3, the 32 threads that compute column 8 of the tile sit in 32 different warps, and at step i each of them reads tileB[i][8] for itself: the same value, 32 times.',
            scene: () => S4.idea({}), beads: S4.ideaBeads },
          { say: 'What if one thread computed several elements of a column? It could read tileB[i][8] once, keep it in a register, and use it for all of its elements. Kernel 4 gives each thread 8 elements of one column.',
            scene: () => S4.idea({}) },
        ],
      },
      {
        q: 'How many threads does a block need now?',
        lines: ['BM = 32', 'BN = 32', 'BK = 32', 'TM = 8', 'NT = (BM * BN) // TM'],
        steps: [
          { say: '<code>BM</code> × <code>BN</code> = 32 × 32 is the tile of C that a block computes, as before. <code>BK</code> = 32 is the width of a chunk along k, kernel 3’s <code>tile_dim</code>. The letters follow the sizes: M for the rows of C (m), N for its columns (n), K for the shared size (k). B is for block and T for thread, so TM is how many rows of C one thread covers.',
            scene: () => S4.owners({ threads: false, bands: false }) },
          { say: '<code>TM</code> = 8 is how many elements of C each thread computes. The tile has 32 × 32 = 1,024 elements, so it needs<span class="eq">NT = (BM * BN) // TM = 1024 // 8 = <b>128</b> threads</span>That is 4 warps, where kernel 3 had 32.',
            scene: () => S4.owners({ threads: false, strips: 'all' }) },
        ],
      },
      {
        q: 'How are the threads launched?',
        lines: [['threads_per_block = (', 1, 2], ['blocks_per_grid = (', 1, 3]],
        steps: [
          { say: '<code>threads_per_block = (NT, 1)</code> = (128, 1): a block is now a single line of 128 threads. <code>threadIdx.x</code> runs 0 to 127, and <code>threadIdx.y</code> is always 0. Warp 0 is threads 0 to 31, warp 1 is 32 to 63, and so on. So <code>cuda.blockDim.x</code> is now 128, not 32. Kernel 4 never uses blockDim: it uses BM and BN instead, and two lines from now the walk shows why.',
            scene: () => S4.owners({ tidLabels: true }) },
          { say: '<code>blocks_per_grid = (ceil_div(n, BN), ceil_div(m, BM))</code> = (25, 32): one block per 32 × 32 tile of C, the same grid as kernels 2 and 3. Only the threads inside a block changed.',
            scene: () => S.grid({ kernel: 4, over: true, counts: true }) },
        ],
      },
      {
        q: 'Which column of the tile is mine?',
        lines: ['tid = cuda.threadIdx.x', 'col = tid % BN'],
        steps: [
          { say: '<code>tid</code> is just a short name for <code>threadIdx.x</code>: the thread’s number in its block, 0 to 127.',
            scene: () => S4.owners({ tidLabels: true }), vars: () => V('tid = cuda.threadIdx.x', null, NAMES) },
          { say: 'The 128 threads must share out 32 columns, 4 threads per column. Which threads should take neighbouring columns? Neighbouring threads, so that a warp\u2019s 32 lanes cover 32 different columns. Then at each step the warp reads 32 neighbouring values of tileB, one from each bank, and at the end it writes 32 neighbouring values of C, as in kernels 2 and 3.',
            scene: () => S4.owners({ tidLabels: true, bands: true }) },
          { kind: 'code', say: '<code>tid % 32</code> runs 0, 1, …, 31, then starts again at 0. So<span class="eq">col = tid % BN</span>is the thread’s column inside the tile, and it equals the thread’s lane. Unlike kernel 3’s <code>out_col</code>, <code>col</code> has no block offset in it. We come back to why after the next line.',
            scene: () => S4.owners({ tidLabels: true, bands: true, land: 'warp0' }) },
          { kind: 'check', say: 'tid 8: col = 8 % 32 = <b>8</b>. tid 40 (lane 8 of warp 1): col = 40 % 32 = 8 too. Both work on column 8 of the tile.',
            scene: () => S4.owners({ tidLabels: true, bands: true, land: 'warp0', me: true, meText: 'thread 8: column 8' }), vars: () => V('col = tid % BN', null, NAMES) },
        ],
        tryit: {
          title: 'any thread of the block',
          fields: [{ id: 'tid', label: 'tid', min: 0, max: 127, val: 40 }],
          out: (v) => `<span class="eq">col = ${v.tid} % 32 = <b>${v.tid % 32}</b>\nrow = (${v.tid} // 32) × 8 = <b>${Math.floor(v.tid / 32) * 8}</b></span>Thread ${v.tid} is lane ${v.tid % 32} of warp ${Math.floor(v.tid / 32)}, and computes rows ${Math.floor(v.tid / 32) * 8} to ${Math.floor(v.tid / 32) * 8 + 7} of column ${v.tid % 32} of the tile.`,
          scene: (v) => {
            const out = S4.owners({ threads: false, bands: true });
            const col = v.tid % 32, row = Math.floor(v.tid / 32) * 8;
            out.push(R('try:strip', OX + col * OS - 1, OY + row * OS - 1, OS + 2, 8 * OS + 2, { rx: 3, fill: P.meFill, stroke: P.me, sw: 1.8, z: 5 }));
            return out;
          },
        },
      },
      {
        q: 'Which rows are mine?',
        lines: ['row = (tid // BN) * TM'],
        steps: [
          { say: '<code>tid // 32</code> is the thread’s warp: 0 for tid 0 to 31, 1 for 32 to 63, up to 3. Give each warp a band of 8 rows: warp 0 takes rows 0 to 7, warp 1 rows 8 to 15, and so on. Then 4 warps × 8 rows cover all 32 rows. The code writes <code>tid // BN</code> rather than <code>tid // 32</code>: each run of BN threads covers the tile’s BN columns once, and the next run starts a new strip. BN is 32, the warp size, so each run is exactly one warp.',
            scene: () => S4.owners({ bands: true, land: 'warp0', tidLabels: true }) },
          { kind: 'code', say: 'The first row of a thread’s strip is its warp number times 8:<span class="eq">row = (tid // BN) * TM = (tid // 32) × 8</span>The thread owns rows <code>row</code> to <code>row + 7</code> of column <code>col</code>.',
            scene: () => S4.owners({ bands: true, land: 'all', strips: 'all' }) },
          { kind: 'check', say: 'tid 8: row = (8 // 32) × 8 = 0, so it owns rows 0 to 7 of column 8 of the tile. Our C[3][8] is the fourth of them, the one with t = 3. And the cover adds up: 128 threads × 8 elements = 1,024, every element once.',
            scene: () => S4.owners({ bands: true, land: 'all', strips: 'all', me: true, c38: true }), vars: () => V('row = (tid // BN) * TM', null, NAMES) },
        ],
      },
      {
        q: 'Why are col and row computed differently from kernel 3’s out_col and out_row?',
        lines: ['col = tid % BN', 'row = (tid // BN) * TM'],
        steps: [
          { say: 'In kernel 3 a thread owned exactly one element, and the block was a 32 × 32 square of threads, so tx and ty pointed straight at it, and the block’s offset could be added on the spot: <code>out_col = tx + blockIdx.x * blockDim.x</code>, a column of C.',
            scene: S4.vs },
          { say: 'Kernel 4 cannot reuse that line. Its block is one line of 128 threads, so there is no ty, and <code>blockDim.x</code> is 128. Kernel 3’s formula would give tid 8 of block (1, 0) the column 8 + 1 × 128 = 136. That block’s tile starts at column 32, so the right column is 32 + 8 = 40. The tile is BN = 32 columns wide whatever shape the block has, so the offset must be <code>blockIdx.x * BN</code>, which is <code>block_col</code>.',
            scene: S4.vs },
          { say: 'Inside the tile, both kernels split the work the same way. The lane picks the column, and the warp picks the rows:<span class="eq">kernel 3:  column = tx          row  = ty\nkernel 4:  column = tid % 32    rows = (tid // 32) × 8 to (tid // 32) × 8 + 7</span>With a single number, tid, kernel 4 needs % to get the lane and // to get the warp.',
            scene: S4.vs },
          { say: 'The code also keeps <code>block_col</code> apart because it adds it to more than one position in the tile: to <code>c</code> when it copies B (line 53) and to <code>col</code> when it stores C (line 69). In kernel 3, the cell a thread filled, <code>tileB[ty, tx]</code>, was in the same column as the element it computed, so <code>out_col</code> could be worked out once at the top. So <code>col</code> is a column of the tile, from 0 to 31, not of C, and <code>row</code> is 0, 8, 16 or 24.',
            lines: ['col = tid % BN', 'row = (tid // BN) * TM', 'global_mem_col = block_col + c', 'global_mem_col = block_col + col'],
            scene: S4.vs },
        ],
      },
      {
        q: 'Where does the block’s tile start in C?',
        lines: ['block_row = cuda.blockIdx.y * BM', 'block_col = cuda.blockIdx.x * BN'],
        steps: [
          { say: 'Block (blockIdx.x, blockIdx.y) computes the tile whose top-left element is row <code>blockIdx.y × 32</code>, column <code>blockIdx.x × 32</code>. Those are <code>block_row</code> and <code>block_col</code>.',
            scene: () => S4.origin({ bx: 2, by: 1 }) },
          { kind: 'check', say: 'Block (2, 1): block_row = 32, block_col = 64. The element at tile row <code>row + t</code> and tile column <code>col</code> is C[32 + row + t][64 + col]. For our block (0, 0) both are 0.',
            scene: () => S4.origin({ bx: 2, by: 1, cell: [3, 8] }), vars: () => V('block_col = cuda.blockIdx.x * BN', null, NAMES) },
        ],
      },
      {
        q: 'Where do the 8 sums live?',
        lines: ['product = cuda.local.array(TM', 'for t in range(TM):', 'product[t] = float32(0.0)'],
        steps: [
          { say: '<code>cuda.local.array(TM, …)</code> gives each thread its own array of 8 values. Each loop over t runs exactly 8 times, so the compiler can unroll it. Every index into <code>product</code> is then known in advance, and the 8 values can live in registers. If an index were known only while the kernel runs, the array would sit in local memory, which despite its name is in the GPU’s main memory and much slower. The loop sets all 8 to 0.0: one running sum for each element the thread owns.',
            scene: () => S4.regs8([0, 0, 0, 0, 0, 0, 0, 0]), vars: () => V('product[t] = float32(0.0)', [7], NAMES) },
        ],
      },
      {
        q: 'Which chunk is this turn of the loop?',
        lines: ['for k0 in range(0, k, BK):'],
        steps: [
          { say: '<code>range(0, k, BK)</code> gives k0 = 0, 32, 64, …, 1,184: the first column of each chunk of A, and the first row of each chunk of B. It is kernel 3’s <code>tile_offset</code>, counted directly in steps of 32. 1,184 ÷ 32 + 1 = 38 turns, as before.',
            scene: () => S3.chunks({ t: 0, past: true }), vars: () => V('for k0 in range', null, NAMES) },
        ],
      },
      {
        q: 'How do 128 threads fill a tray of 1,024 cells?',
        lines: ['for i in range(tid, BM * BK, NT):', 'r = i // BK', 'c = i % BK'],
        steps: [
          { say: 'tileA has 32 × 32 = 1,024 cells, but the block has only 128 threads. So each thread must copy 1,024 ÷ 128 = 8 cells.',
            scene: () => S4.load({ which: 'A', rounds: 0 }) },
          { say: 'Number the cells 0 to 1,023, row by row. Thread <code>tid</code> takes cell <code>tid</code>, then every 128th cell after it: <code>range(tid, 1024, 128)</code>. Here i is a cell number, not a step along k as in kernels 1 to 3. Call each turn of this loop a <b>round</b>: in round q, thread tid copies cell tid + 128 × q.',
            scene: () => S4.load({ which: 'A', rounds: 0, numbers: true }) },
          { kind: 'code', say: '<code>r = i // BK</code> and <code>c = i % BK</code> turn a cell number back into its row and column in the tray, as <code>tid // 32</code> and <code>tid % 32</code> did for the thread.',
            scene: () => S4.load({ which: 'A', rounds: 0, numbers: true, me: true }) },
          { kind: 'check', say: 'Thread 8 takes i = 8, 136, 264, …, 904. Cell 136: r = 136 // 32 = 4, c = 136 % 32 = 8. So thread 8 copies column 8 of the tray, at rows 0, 4, 8, …, 28.',
            scene: () => S4.load({ which: 'A', rounds: 0, me: true }), vars: () => V('c = i % BK', [0, 1], NAMES) },
        ],
      },
      {
        q: 'Which value of A goes into cell (r, c)?',
        lines: ['global_mem_row = block_row + r', 'global_mem_col = k0 + c', 'if global_mem_col < k and global_mem_row < m:', 'tileA[r, c] = matA[global_mem_row, global_mem_col]', 'tileA[r, c] = float32(0.0)'],
        steps: [
          { say: 'Cell (r, c) of tileA holds row r of the block’s rows of A and column c of this chunk: A[<code>block_row + r</code>][<code>k0 + c</code>]. The bounds test is kernel 3’s: past column 1,199 or row 999, write 0.0.',
            scene: () => S4.load({ which: 'A', rounds: 0, me: true }), vars: () => V('global_mem_col = k0 + c', [0, 0], NAMES) },
          { say: 'Round 0: threads 0 to 127 copy cells 0 to 127, which are rows 0 to 3 of the tray.',
            scene: () => S4.load({ which: 'A', rounds: 1 }), beads: () => S4.loadBeads({ which: 'A', round: 0 }) },
          { say: 'In each round, warp w copies one row: row 4 × round + w. Warp 1 in round 0 copies row 1: A[1][0] to A[1][31], 32 neighbours, 4 crates. Coalesced, as in kernel 3.',
            scene: () => S4.load({ which: 'A', rounds: 1, warpRow: [0, 1] }) },
          { kind: 'check', say: 'After 8 rounds, 8 × 128 = 1,024 cells: the whole chunk of A is in tileA.',
            scene: () => S4.load({ which: 'A', rounds: 8 }), beads: () => S4.loadBeads({ which: 'A', round: 7 }) },
        ],
      },
      {
        q: 'And tileB?',
        lines: ['for i in range(tid, BK * BN, NT):', 'r = i // BN', 'c = i % BN', 'global_mem_row = k0 + r', 'global_mem_col = block_col + c', 'tileB[r, c] = matB[global_mem_row, global_mem_col]', 'tileB[r, c] = float32(0.0)'],
        steps: [
          { say: 'The same split, and again warp w copies one row of the tray in each round. What moves is where k0 goes. For A it shifts the column, <code>k0 + c</code>. For B it shifts the row, <code>k0 + r</code>. So cell (r, c) of tileB holds B[<code>k0 + r</code>][<code>block_col + c</code>].',
            scene: () => S4.load({ which: 'B', rounds: 1 }), beads: () => S4.loadBeads({ which: 'B', round: 0 }) },
          { kind: 'check', say: 'Again warp w copies row 4 × round + w: 32 neighbours of a row of B, 4 crates. Thread 8’s first cell is B[0][8]. After 8 rounds tileB is full.',
            scene: () => S4.load({ which: 'B', rounds: 8, me: true }), vars: () => V('tileB[r, c] = matB', [0, 0], NAMES) },
        ],
      },
      {
        q: 'Why wait before the multiply-adds?',
        lines: [['cuda.syncthreads()', 1]],
        steps: [
          { say: 'Thread 8 will read column 8 of tileB at every row kk and rows 0 to 7 of tileA. Those cells were copied by threads from all 4 warps. As in kernel 3, the barrier makes every thread wait until all copies are done.',
            scene: () => S3.barrier({ phase: 'arrived', hot: 0 }) },
        ],
      },
      {
        q: 'How does one read of tileB serve 8 multiply-adds?',
        lines: ['for kk in range(BK):', 'b = tileB[kk, col]', ['for t in range(TM):', 2], 'product[t] += tileA[row + t, kk] * b'],
        steps: [
          { say: 'All 8 of thread 8’s elements are in column 8. At step kk, every one of them needs tileB[kk][8]. So the thread reads it once into a register: <code>b = tileB[kk, col]</code>.',
            scene: () => S4.phase2({ mode: 'thread', kk: 0, b: 3 }), beads: () => S4.phase2Beads({ stage: 'b', kk: 0 }), vars: () => V('b = tileB[kk, col]', [0, 0], NAMES) },
          { say: 'Element t of its strip is row <code>row + t</code> of the tile, so it needs tileA[row + t][kk]. The inner loop does the 8 multiply-adds, all with the same b:<span class="eq">product[t] += tileA[row + t, kk] * b     # t = 0 .. 7</span>',
            scene: () => S4.phase2({ mode: 'thread', kk: 0, b: 3, sums: 6 }), beads: () => S4.phase2Beads({ stage: 'fma', kk: 0 }), vars: () => V('product[t] += ', [0, 0, 7], NAMES) },
          { kind: 'check', say: 'kk = 0: b = 3.0, and each of the 8 sums becomes 2.0 × 3.0 = 6.0. After kk = 31, each is 192.0, the same 192.0 per chunk that kernel 3’s thread had for its single element.',
            scene: () => S4.phase2({ mode: 'thread', kk: 31, b: 3, sums: 192 }), vars: () => V('product[t] += ', [0, 31, 7], NAMES) },
          { say: 'Count the reads from shared memory for those 8 multiply-adds: kernel 3 needed 2 per multiply-add, 16 in all; kernel 4 needs 1 of tileB and 8 of tileA, 9 in all.',
            scene: S4.reads },
          { say: 'The warp at step (kk, t): warp 0’s lanes all have row = 0, so they all read the same tileA[t][kk], one value for the whole warp. Once per kk they read tileB[kk][0..31], one row, one value in each bank.',
            scene: () => S4.phase2({ mode: 'warp', kk: 0, t: 3 }) },
        ],
      },
      {
        q: 'Why wait again?',
        lines: [['cuda.syncthreads()', 2]],
        steps: [
          { say: 'For the same reason as in kernel 3: the next turn copies the next chunk into the same trays, so no thread may start copying until every thread has finished reading this chunk.',
            scene: () => S3.barrier({ phase: 'arrived', hot: 1 }) },
        ],
      },
      {
        q: 'Where do the 8 answers go?',
        lines: ['global_mem_col = block_col + col', ['for t in range(TM):', 3], 'global_mem_row = block_row + row + t', 'if global_mem_row < m and global_mem_col < n:', 'matC[global_mem_row, global_mem_col] = product[t]'],
        steps: [
          { say: 'Now the tile position becomes a position in C, by adding the block’s origin: column <code>block_col + col</code>, and for element t, row <code>block_row + row + t</code>.',
            scene: () => S4.store({}), vars: () => V('global_mem_col = block_col + col', null, NAMES) },
          { kind: 'check', say: 'Thread 8 of block (0, 0) writes C[0][8] to C[7][8], all 7,200.0. C[3][8] is its <code>product[3]</code>.',
            scene: () => S4.store({}), vars: () => V('matC[global_mem_row, global_mem_col]', [7], NAMES) },
          { say: 'Warp 0 at step t writes row t of the tile: lanes 0 to 31, columns 0 to 31, 32 neighbours, 4 crates. Each warp writes its 8 rows in 8 coalesced stores.',
            scene: () => S4.store({ warp: true, t: 3 }) },
          { say: 'In the bottom blocks, rows 992 to 1,023: warp 0 owns rows 992 to 999 and writes them; warps 1 to 3 own rows 1,000 to 1,023, so every one of their <code>global_mem_row &lt; m</code> tests fails, and they write nothing.',
            scene: S4.edge },
        ],
      },
      {
        q: 'What did owning 8 elements buy?',
        lines: [],
        steps: [
          { say: 'Each block now has 4 warps instead of 32, each thread does 8 times the work, and the reads from shared memory fall from 2 per multiply-add to 9 ÷ 8 = 1.125.',
            scene: S4.reads },
          { kind: 'check', say: '<span class="muted">In the real run (book Chapter 4):</span> this exact kernel shape, TM = 8 in a 32 × 32 tile, took 126.0 µs on two 1,024 × 1,024 matrices on our H100: 1.87 times as fast as kernel 3, and the fastest of the six values of TM the book measured.',
            scene: S4.reads },
          { say: 'A question to carry into the next lecture: kernel 4 shares one value of tileB across 8 sums. Could a thread share a value of tileA across several columns too?',
            scene: () => S4.owners({ bands: true, land: 'all', strips: 'all', me: true }) },
        ],
      },
    ],
  };
})(window.CW = window.CW || {});
