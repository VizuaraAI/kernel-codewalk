/* k3.js: Kernel 3, a tile at a time through shared memory, line by line. */
(function (CW) {
  'use strict';
  const { P, n: { T, R, C, L }, win, block, regs, pill, span, vspan, arrow, S, fmt, f1 } = CW;
  const { M, K, N } = CW.D;
  const K3 = CW.KF[3];
  const s7 = 7;
  const TILES = K3.tiles;                     // 38
  const LASTT = TILES - 1, LASTOFF = LASTT * 32, REAL = K - LASTOFF;   // 37, 1,184, 16
  const V = (snip, key, names) => CW.V(3, snip, key, names);
  const NAMES = ['tx', 'ty', 'out_col', 'out_row', 'num_tiles', 'product', 't', 'tile_offset', 'b_row', 'a_col', 'i'];
  const S3 = CW.S3 = {};

  // ------------------------------------------------------------------------------------------------ the bands a block needs
  S3.bands = function (o = {}) {
    const out = CW.job({});
    const u = 0.2, cx = 540, cy = 285, ax = cx - 16 - K * u, by = cy - 16 - K * u, th = 32 * u;
    out.push(R('bd:a', ax, cy, K * u, th, { rx: 1, fill: P.aAcc, z: 3 }));
    out.push(R('bd:b', cx, by, th, K * u, { rx: 1, fill: P.bAcc, z: 3 }));
    out.push(R('bd:c', cx, cy, th, th, { rx: 1, fill: P.me, z: 3 }));
    out.push(T('bd:at', ax, cy + th + 18, 'rows 0 to 31 of A: 32 × 1,200 values', { size: 12, fill: P.aInk, wt: 600 }));
    out.push(T('bd:bt', cx + th + 8, by + K * u - 30, 'columns 0 to 31 of B:', { size: 12, fill: P.bInk, wt: 600 }));
    out.push(T('bd:bt2', cx + th + 8, by + K * u - 14, '1,200 × 32 values', { size: 12, fill: P.bInk }));
    out.push(T('bd:ct', cx + th + 8, cy + th + 22, "block (0, 0)'s tile:", { size: 12, fill: P.meInk, wt: 600 }));
    out.push(T('bd:ct2', cx + th + 8, cy + th + 38, '32 \u00d7 32 of C', { size: 12, fill: P.meInk }));
    if (o.note) out.push(T('bd:note', ax, cy + 200 + 30, 'The bands are drawn to scale: 32 of 1,000 rows, 32 of 800 columns.', { size: 11.5, fill: P.mute, font: 'serif', it: true }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ bytes: band, budget, chunk
  S3.bytes = function (o = {}) {
    const out = [];
    const x = 170, sc = 600 / 153600;
    const bars = [['band', 'the band of A that block (0, 0) needs: 32 × 1,200 × 4', 153600, P.aMid, P.aInk, 140],
      ['budget', 'the most a block can declare this way: 48 KB', 49152, P.sMid, P.sInk, 250],
      ['chunk', 'one 32 × 32 chunk of A: 32 × 32 × 4', 4096, P.aAcc, P.aInk, 360]];
    for (const [id, label, bytes, fill, ink, y] of bars) {
      if (o.only && !o.only.includes(id)) continue;
      out.push(T(`by:${id}:t`, x, y - 12, label, { size: 12.5, fill: ink }));
      out.push(R(`by:${id}:r`, x, y, Math.max(3, bytes * sc), 26, { rx: 5, fill, z: 2 }));
      out.push(T(`by:${id}:v`, x + Math.max(3, bytes * sc) + 10, y + 18, `${fmt(bytes)} bytes`, { size: 13, wt: 600, fill: ink }));
    }

    return out;
  };

  // ------------------------------------------------------------------------------------------------ A's band cut into chunks
  const SX = 70, SY = 212, SW = 800;          // the band: 1,200 columns across 800 pixels
  const colX = (c) => SX + c * SW / K;
  S3.chunks = function (o = {}) {
    const out = [];
    const t = o.t === undefined ? null : o.t;
    out.push(T('ch:title', SX, SY - 46, 'rows 0 to 31 of A, all 1,200 columns, cut into chunks of 32 columns', { size: 13, wt: 600, fill: P.ink }));
    out.push(R('ch:band', SX, SY, SW, 34, { rx: 4, fill: P.aFill, stroke: P.aMid, sw: 1, z: 1 }));
    for (let j = 1; j < TILES; j++) out.push(L(`ch:l:${j}`, colX(32 * j), SY, colX(32 * j), SY + 34, { stroke: '#ffffff', sw: 1.4, z: 2 }));
    // the last chunk runs past the end of the row
    const w32 = SW * 32 / K;
    out.push(R('ch:past', colX(K), SY, w32 - SW * REAL / K, 34, { rx: 3, fill: 'none', stroke: P.faint, dash: '3 3', sw: 1, z: 2, op: o.past ? 1 : 0 }));
    if (o.past) {
      const py = t === null ? SY + 76 : SY + 160;
      out.push(T('ch:pastt', colX(K) + w32 - SW * REAL / K, py, `chunk ${LASTT}: ${REAL} real columns,`, { size: 11.5, fill: P.soft, anchor: 'end' }));
      out.push(T('ch:pastt2', colX(K) + w32 - SW * REAL / K, py + 16, `${32 - REAL} past the end of the row`, { size: 11.5, fill: P.soft, anchor: 'end' }));
    }
    for (const j of [0, 1, 2]) out.push(T(`ch:n:${j}`, colX(32 * j) + w32 / 2, SY - 8, String(j), { size: 10.5, fill: P.mute, anchor: 'middle' }));
    out.push(T('ch:n:dots', colX(32 * 3) + w32, SY - 8, '…', { size: 10.5, fill: P.mute }));
    out.push(T(`ch:n:last`, colX(32 * LASTT) + w32 / 2, SY - 8, String(LASTT), { size: 10.5, fill: P.mute, anchor: 'middle' }));
    out.push(T('ch:c0', SX, SY + 50, 'column 0', { size: 11, fill: P.mute }));
    out.push(T('ch:cl', colX(K), SY + 50, 'column 1,199', { size: 11, fill: P.mute, anchor: 'end' }));
    if (t !== null) {
      out.push(R('ch:hl', colX(32 * t), SY - 3, Math.min(w32, SW - (32 * t) * SW / K + (t === LASTT ? w32 - SW * REAL / K : 0)), 40, { rx: 4, fill: 'none', stroke: P.aAcc, sw: 2, z: 3 }));
      out.push(T('ch:hlt', colX(32 * t) + w32 / 2, SY + 100, `chunk t = ${t}: columns ${fmt(32 * t)} to ${fmt(32 * t + 31)}`, { size: 12.5, wt: 600, fill: P.aInk, anchor: t > 30 ? 'end' : 'start' }));
      out.push(T('ch:hlt2', colX(32 * t) + w32 / 2, SY + 117, `tile_offset = ${t} × 32 = ${fmt(32 * t)}`, { size: 12, fill: P.aInk, anchor: t > 30 ? 'end' : 'start' }));
      out.push(L('ch:hll', colX(32 * t) + w32 / 2, SY + 38, colX(32 * t) + w32 / 2, SY + 86, { stroke: P.aAcc, dash: '3 3' }));
    }
    if (o.bnote) out.push(T('ch:b', SX, SY + 170, 'B’s band (columns 0 to 31, all 1,200 rows) is cut the same way, into 38 chunks of 32 rows.', { size: 12, fill: P.bInk, font: 'serif', it: true }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the trays
  const TAX = 180, TAY = 150, TBX = 560, TBY = 150;
  const fullMask = (fill) => () => fill;
  S3.trays = function (o = {}) {
    const out = [];
    const frame = (id, x, y, title) => {
      out.push(...win(id, x, y, 32, 32, s7, { empty: true, frame: P.sFill, frameStroke: P.sMid, emptyFill: '#f1f8f5', fillMask: o[id] }));
      out.push(T(id + ':t', x, y - 18, title, { size: 13, wt: 600, fill: P.sInk }));
      out.push(T(id + ':s', x + 52, y - 18, '32 × 32 values, 4,096 bytes', { size: 11.5, fill: P.mute }));
    };
    frame('tileA', TAX, TAY, 'tileA');
    frame('tileB', TBX, TBY, 'tileB');
    out.push(T('trays:t', TAX - 9, TAY - 48, 'shared memory of block (0, 0): one pair of trays, shared by its 1,024 threads', { size: 12.5, fill: P.sInk }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ a copy into a tray
  const WX = 110, WY = 150, TX = 600, TY = 150;
  /* o.which 'A' or 'B'; o.t the chunk; o.mode 'none' | 'thread' | 'warp' | 'block'; o.mask (r, c) -> fill for the tray;
     o.r0 the block's first row of C (992 for the edge block); o.zeros: show the else-branch cells. */
  S3.copy = function (o) {
    const out = [];
    const isA = o.which === 'A';
    const t = o.t || 0, off = 32 * t, r0 = o.r0 || 0, c0b = o.c0b || 0;
    const me = o.me || [8, 3];                  // (tx, ty)
    // the source window: A's rows of this block x the chunk's columns, or B's chunk rows x this block's columns
    const srcR0 = isA ? r0 : off, srcC0 = isA ? off : c0b;
    const hl = [], crates = [];
    if (o.mode === 'thread') hl.push(['cell', isA ? r0 + me[1] : off + me[1], isA ? off + me[0] : c0b + me[0], isA ? P.aAcc : P.bAcc]);
    if (o.mode === 'warp') { hl.push(['row', srcR0 + me[1], isA ? P.aMid : P.bMid]); for (let g = 0; g < 4; g++) crates.push([srcR0 + me[1], srcC0 + 8 * g, isA ? P.aAcc : P.bAcc, 300 + g * 120]); }
    if (o.mode === 'block') hl.push(['rect', srcR0, srcC0, srcR0 + 31, srcC0 + 31, isA ? P.aMid : P.bMid]);
    out.push(...win('src', WX, WY, 32, 32, s7, {
      r0: srcR0, c0: srcC0, R: isA ? M : K, Cc: isA ? K : N, base: isA ? P.aFill : P.bFill,
      title: isA ? 'A' : 'B', sub: isA ? `rows ${fmt(srcR0)} to ${fmt(srcR0 + 31)}, columns ${fmt(off)} to ${fmt(off + 31)}: chunk ${t}` : `rows ${fmt(off)} to ${fmt(off + 31)}: chunk ${t}, columns ${fmt(c0b)} to ${fmt(c0b + 31)}`,
      rowLabels: true, colLabels: true, hl, crates, voidText: true,
    }));
    const name = isA ? 'tileA' : 'tileB';
    out.push(...win('tray', TX, TY, 32, 32, s7, { empty: true, frame: P.sFill, frameStroke: P.sMid, emptyFill: '#f1f8f5', fillMask: o.mask, rowLabels: true, colLabels: true }));
    out.push(T('tray:t', TX, TY - 26, name, { size: 14, wt: 600, fill: P.sInk }));
    out.push(T('tray:s', TX + 44, TY - 26, 'in shared memory: tray row ty, tray column tx', { size: 11.5, fill: P.mute }));
    out.push(CW.arrow('copy:arrow', WX + 32 * s7 + 26, WY + 112, TX - 30, TY + 112, { stroke: P.faint, sw: 1.4 }));
    if (o.mode === 'thread') {
      out.push(R('tray:me', TX + me[0] * s7 - 1, TY + me[1] * s7 - 1, s7 + 2, s7 + 2, { rx: 2, fill: 'none', stroke: P.me, sw: 1.6, z: 5 }));
      const src = isA ? `A[${fmt(r0 + me[1])}][${fmt(off + me[0])}]` : `B[${fmt(off + me[1])}][${fmt(c0b + me[0])}]`;
      out.push(T('copy:lab', WX + 32 * s7 + 26, WY + 32 * s7 + 44, `thread (${me[0]}, ${me[1]}) copies ${src} into ${name}[${me[1]}][${me[0]}]`, { size: 12.5, wt: 600, fill: P.meInk }));
    } else if (o.mode === 'warp') {
      out.push(R('tray:wo', TX - 2, TY + me[1] * s7 - 2, 32 * s7 + 4, s7 + 4, { rx: (s7 + 4) / 2, fill: 'none', stroke: P.cAcc, sw: 1.4, z: 5 }));
      const src = isA ? `A[${fmt(r0 + me[1])}][${fmt(off)}] to A[${fmt(r0 + me[1])}][${fmt(off + 31)}]` : `B[${fmt(off + me[1])}][${fmt(c0b)}] to B[${fmt(off + me[1])}][${fmt(c0b + 31)}]`;
      out.push(T('copy:lab', WX + 32 * s7 + 26, WY + 32 * s7 + 44, `warp ${me[1]} (ty = ${me[1]}) copies ${src}: 4 crates`, { size: 12.5, wt: 600, fill: P.cInk }));
    } else if (o.mode === 'block') {
      out.push(T('copy:lab', WX + 32 * s7 + 26, WY + 32 * s7 + 44, `32 warps: warp w copies row w of the chunk, 4 crates each`, { size: 12.5, wt: 600, fill: P.cInk }));
    }
    if (o.zeroCols) out.push(T('tray:z', TX + 24 * s7, TY + 16 * s7 + 4, 'zeros', { size: 12, fill: P.zeroInk, anchor: 'middle', wt: 600 }));
    if (o.zeroRows) out.push(T('tray:z', TX + 16 * s7, TY + 24 * s7 + 4, 'zeros', { size: 12, fill: P.zeroInk, anchor: 'middle', wt: 600 }));
    if (o.note) out.push(T('copy:note', WX, WY + 32 * s7 + 70, o.note, { size: 12, fill: P.soft, font: 'serif', it: true }));
    return out;
  };
  S3.copyBeads = function (o) {
    const isA = o.which === 'A', me = o.me || [8, 3], col = isA ? P.aAcc : P.bAcc, out = [];
    const cc = (x, y, r, c) => [x + c * s7 + s7 / 2, y + r * s7 + s7 / 2];
    if (o.mode === 'thread') {
      const [x0, y0] = cc(WX, WY, me[1], me[0]); const [x1, y1] = cc(TX, TY, me[1], me[0]);
      out.push({ x0, y0, x1, y1, fill: col, r: 4, dur: 1100 });
    } else if (o.mode === 'warp') {
      for (let j = 0; j < 32; j++) { const [x0, y0] = cc(WX, WY, me[1], j); const [x1, y1] = cc(TX, TY, me[1], j); out.push({ x0, y0, x1, y1, fill: col, r: 2.8, d: j * 18, dur: 1000 }); }
    } else if (o.mode === 'block') {
      for (let r = 0; r < 32; r++) for (let j = 0; j < 32; j += 2) {
        const [x0, y0] = cc(WX, WY, r, j); const [x1, y1] = cc(TX, TY, r, j);
        out.push({ x0, y0, x1, y1, fill: col, r: 2.2, d: r * 34 + j * 2, dur: 900, op: 0.75 });
      }
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the barrier
  /* 32 warps walk to cuda.syncthreads(); each arrives at its own time; nobody passes until all 32 are there. */
  const order = (() => { const a = [...Array(32).keys()]; let x = 11; for (let i = 31; i > 0; i--) { x = (x * 1103515245 + 12345) % 2147483648; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } const rank = []; a.forEach((w, i) => { rank[w] = i; }); return rank; })();
  S3.barrier = function (o = {}) {
    const out = [];
    const X0 = 90, Y0 = 118, dx = 5.2, dy = 9.6, gate = 560, W = 31 * dx;
    const arrived = o.phase === 'arrived' || o.phase === 'go';
    out.push(L('bar:gate', gate, Y0 - 24, gate, Y0 + 32 * dy + 4, { stroke: o.phase === 'go' ? P.sAcc : P.ink, sw: 2.4, z: 3 }));
    out.push(T('bar:gt', gate + 12, Y0 - 10, 'cuda.syncthreads()', { size: 13, wt: 600, fill: P.ink, font: 'mono' }));
    out.push(T('bar:gt2', gate + 12, Y0 + 8, 'no thread goes past this line', { size: 12, fill: P.soft }));
    out.push(T('bar:gt3', gate + 12, Y0 + 24, 'until all 1,024 have reached it', { size: 12, fill: P.soft }));
    let maxD = 0;
    for (let w = 0; w < 32; w++) {
      const startX = X0, atGate = gate - W - 10, past = gate + 30;
      // while walking, warps are spread out: they run independently (warp 0 is a slow one here, warp 3 a fast one)
      const pace = w === 0 ? 0.08 : w === 3 ? 0.92 : 0.15 + ((order[w] * 37) % 70) / 100;
      const x = o.phase === 'go' ? past : arrived ? atGate : o.phase === 'walk' ? startX + pace * (atGate - startX) : startX;
      const d = o.phase === 'arrived' ? order[w] * 70 : (o.phase === 'go' ? w * 12 : 0);
      maxD = Math.max(maxD, d);
      for (let j = 0; j < 32; j += 1) {
        out.push(C(`bar:d:${w}:${j}`, x + j * dx, Y0 + w * dy, 1.7, { fill: (w === (o.hot === undefined ? 3 : o.hot) || (o.phase === 'walk' && w === 0)) ? (w === 0 ? '#e07a5f' : P.cAcc) : (w % 2 ? P.warpB : P.warpA), z: 3, d, dur: o.phase === 'arrived' ? 900 : 700, from: o.phase === 'arrived' ? { x: startX + j * dx, y: Y0 + w * dy } : undefined }));
      }
      if (w % 8 === 0) out.push(T(`bar:wl:${w}`, X0 - 10, Y0 + w * dy + 4, `warp ${w}`, { size: 10.5, fill: P.mute, anchor: 'end' }));
    }
    if (o.phase === 'arrived') {
      out.push(T('bar:done', gate + 12, Y0 + 32 * dy - 30, 'all 32 warps are here:', { size: 13, wt: 600, fill: P.sInk, d: maxD + 900 }));
      out.push(T('bar:done2', gate + 12, Y0 + 32 * dy - 12, 'the barrier opens', { size: 13, wt: 600, fill: P.sInk, d: maxD + 900 }));
    }
    if (o.phase === 'go') out.push(T('bar:go', gate + 40 + W, Y0 + 32 * dy - 12, 'everyone continues', { size: 12.5, fill: P.sInk }));
    if (o.phase === 'walk') {
      out.push(T('bar:w3', gate + 12, Y0 + 3 * dy + 44, 'warp 3: ready to multiply', { size: 12, wt: 600, fill: P.cInk }));
      out.push(T('bar:w0', gate + 12, Y0 + 3 * dy + 62, 'warp 0: has not copied its row yet', { size: 12, wt: 600, fill: '#c0583e' }));
    }
    if (o.note) out.push(T('bar:note', X0 - 50, Y0 + 32 * dy + 40, o.note, { size: 12, fill: P.soft, font: 'serif', it: true }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ who writes the cells a thread will read
  S3.writers = function () {
    const out = S3.trays({ tileA: (r, c) => P.aMid, tileB: (r, c) => P.bMid });
    // our thread reads row 3 of tileA (written by warp 3, its own) and column 8 of tileB (written by all 32 warps)
    out.push(R('wr:arow', TAX - 2, TAY + 3 * s7 - 2, 32 * s7 + 4, s7 + 4, { rx: 4, fill: 'none', stroke: P.me, sw: 1.6, z: 5 }));
    out.push(R('wr:bcol', TBX + 8 * s7 - 2, TBY - 2, s7 + 4, 32 * s7 + 4, { rx: 4, fill: 'none', stroke: P.me, sw: 1.6, z: 5 }));
    out.push(T('wr:at', TAX, TAY + 32 * s7 + 36, 'row 3 of tileA: written by warp 3 itself', { size: 12, fill: P.aInk }));
    out.push(T('wr:bt', TBX, TBY + 32 * s7 + 36, 'column 8 of tileB: one value from each warp', { size: 12, fill: P.bInk }));
    out.push(R('wr:b0', TBX + 8 * s7, TBY, s7, s7, { rx: 1.4, fill: P.me, z: 6 }));
    out.push(T('wr:b0t', TBX + 8 * s7 + 14, TBY - 8, 'tileB[0][8]: written by thread (8, 0), in warp 0', { size: 12, wt: 600, fill: P.meInk }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the multiply-adds from the trays
  const MAX = 300, MAY = 300, MBX = 566, MBY = 42, MCX = 566, MCY = 300;
  /* tileA bottom left, tileB top right, C's tile bottom right (the same places as A, B and C before). */
  S3.multiply = function (o) {
    const out = [];
    const i = o.i === undefined ? null : o.i;
    const hlA = [], hlB = [], hlC = [];
    if (o.mode === 'thread') {
      hlA.push(['row', 3, P.aMid]); hlB.push(['col', 8, P.bMid]);
      if (i !== null) { hlA.push(['cell', 3, i, P.aAcc]); hlB.push(['cell', i, 8, P.bAcc]); }
      hlC.push(['cell', 3, 8, P.me]);
    } else if (o.mode === 'warp') {
      hlA.push(['cell', 3, i, P.aAcc]); hlB.push(['row', i, P.bMid]); hlC.push(['row', 3, P.cMid]);
    }
    out.push(...win('mA', MAX, MAY, 32, 32, s7, { empty: false, base: '#d9eaf7', frame: P.sFill, frameStroke: P.sMid, rowLabels: true, colLabels: true, hl: hlA }));
    out.push(T('mA:t', MAX, MAY - 26, 'tileA', { size: 14, wt: 600, fill: P.sInk }));
    out.push(T('mA:s', MAX + 44, MAY - 26, 'chunk 0 of A, rows 0 to 31', { size: 11.5, fill: P.mute }));
    out.push(...win('mB', MBX, MBY, 32, 32, s7, { empty: false, base: '#f6e1ea', frame: P.sFill, frameStroke: P.sMid, rowLabels: true, colLabels: true, hl: hlB }));
    out.push(T('mB:t', MBX + 32 * s7 + 16, MBY + 14, 'tileB', { size: 14, wt: 600, fill: P.sInk }));
    out.push(T('mB:s', MBX + 32 * s7 + 16, MBY + 31, 'chunk 0 of B', { size: 11.5, fill: P.mute }));
    out.push(...win('mC', MCX, MCY, 32, 32, s7, { base: P.cFill, rowLabels: true, colLabels: true, hl: hlC }));
    out.push(T('mC:t', MCX + 32 * s7 + 16, MCY + 14, 'C', { size: 14, wt: 600, fill: P.cInk }));
    out.push(T('mC:s', MCX + 32 * s7 + 16, MCY + 31, 'block (0, 0)', { size: 11.5, fill: P.mute }));
    if (o.mode === 'thread' && i !== null) {
      out.push(T('m:la', MAX, MAY + 32 * s7 + 26, `tileA[3][${i}] = 2.0`, { size: 12.5, wt: 600, fill: P.aInk }));
      out.push(T('m:lb', MBX - 14, MBY + i * s7 + s7 * 0.85, `tileB[${i}][8] = 3.0`, { size: 12.5, wt: 600, fill: P.bInk, anchor: 'end' }));
    }
    if (o.mode === 'warp') {
      out.push(T('m:la', MAX, MAY + 32 * s7 + 26, `tileA[3][${i}]: one value for all 32 lanes`, { size: 12.5, wt: 600, fill: P.aInk }));
      out.push(T('m:lb', MBX - 14, MBY + i * s7 + s7 * 0.85, `tileB[${i}][0..31]: 32 neighbours, one per bank`, { size: 12, wt: 600, fill: P.bInk, anchor: 'end' }));
    }
    if (o.product !== undefined) out.push(...regs('m:reg', MCX + 32 * s7 + 16, MCY + 84, [['product', f1(o.product), true]], { title: 'thread (8, 3)' }));
    return out;
  };
  S3.multiplyBeads = function (o) {
    const out = [], i = o.i;
    const cc = (x, y, r, c) => [x + c * s7 + s7 / 2, y + r * s7 + s7 / 2];
    if (o.mode === 'thread') {
      const [ax, ay] = cc(MAX, MAY, 3, i), [bx, by] = cc(MBX, MBY, i, 8), [cx, cy] = cc(MCX, MCY, 3, 8);
      out.push({ x0: ax, y0: ay, x1: cx, y1: cy, fill: P.aAcc, r: 3.6, dur: 1000 }, { x0: bx, y0: by, x1: cx, y1: cy, fill: P.bAcc, r: 3.6, dur: 1000, d: 120 });
    } else {
      const [ax, ay] = cc(MAX, MAY, 3, i);
      for (let j = 0; j < 32; j++) {
        const [bx, by] = cc(MBX, MBY, i, j), [cx, cy] = cc(MCX, MCY, 3, j);
        out.push({ x0: bx, y0: by, x1: cx, y1: cy, fill: P.bAcc, r: 2.4, d: j * 14, dur: 900 });
        out.push({ x0: ax, y0: ay, x1: cx, y1: cy, fill: P.aAcc, r: 2.4, d: 150 + j * 14, dur: 900 });
      }
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the second barrier's danger
  S3.danger = function () {
    const out = [];
    const x = 330, y = 150;
    out.push(...win('dg', x, y, 32, 32, s7, { base: '#f6e1ea', frame: P.sFill, frameStroke: P.sMid, rowLabels: true, colLabels: true,
      hl: [['row', 0, '#f4b9a8'], ['cell', 0, 8, P.me]] }));
    out.push(T('dg:t', x, y - 26, 'tileB', { size: 14, wt: 600, fill: P.sInk }));
    out.push(CW.arrow('dg:w0', x - 200, y + 3, x - 8, y + 3, { stroke: '#e07a5f' }));
    out.push(T('dg:w0t', x - 200, y + 26, 'warp 0, done with chunk 0:', { size: 12, wt: 600, fill: '#c0583e' }));
    out.push(T('dg:w0t2', x - 200, y + 42, 'copies chunk 1 into row 0', { size: 12, fill: '#c0583e' }));
    out.push(CW.arrow('dg:w3', x + 8 * s7 + s7 / 2, y + 4, x + 32 * s7 + 150, y + 120, { stroke: P.cAcc }));
    out.push(T('dg:w3t', x + 32 * s7 + 40, y + 150, 'warp 3, still on chunk 0 at i = 0:', { size: 12, wt: 600, fill: P.cInk }));
    out.push(T('dg:w3t2', x + 32 * s7 + 40, y + 166, 'needs tileB[0][8] = B[0][8]', { size: 12, fill: P.cInk }));
    out.push(T('dg:w3t3', x + 32 * s7 + 40, y + 182, 'and could read B[32][8] instead', { size: 12, fill: '#c0583e' }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the running sum, chunk by chunk
  S3.progress = function (o) {
    const out = [];
    const x = 90, y = 250, w = 780, seg = w / TILES;
    out.push(T('pg:t', x, y - 40, 'product of thread (8, 3) after each chunk', { size: 13, wt: 600, fill: P.ink }));
    for (let t = 0; t < TILES; t++) {
      const real = t === LASTT ? REAL / 32 : 1;
      out.push(R(`pg:s:${t}`, x + t * seg + 1, y, seg * real - 2, 26, { rx: 3, fill: t <= o.t ? P.cMid : P.panel, z: 2, d: o.animate ? t * 28 : 0 }));
    }
    const lab = (t, text, up) => out.push(T(`pg:l:${t}`, x + t * seg + seg / 2, up ? y - 10 : y + 46, text, { size: 11.5, fill: P.cInk, anchor: 'middle', wt: 600 }));
    if (o.t >= 0) lab(0, '192.0', false);
    if (o.t >= 1) lab(1, '384.0', true);
    if (o.t >= LASTT - 1) lab(LASTT - 1, '7,104.0', true);
    if (o.t >= LASTT) lab(LASTT, '7,200.0', false);
    if (o.t >= LASTT) out.push(T('pg:sum', x, y + 96, `37 full chunks × 192.0 + one chunk of ${REAL} real columns × 6.0 = 7,104.0 + 96.0 = 7,200.0`, { size: 12.5, fill: P.soft, font: 'serif' }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ the edge block
  S3.edge = function () {
    const out = [];
    const r0 = 32 * (K3.grid[1] - 1), c0 = 32 * (K3.grid[0] - 1);   // 992, 768
    out.push(...win('eA', 110, 150, 32, 32, s7, { r0, c0: 0, R: M, Cc: K, base: P.aFill, title: 'A', sub: `rows ${fmt(r0)} to ${fmt(r0 + 31)}, chunk 0`, rowLabels: true, colLabels: true }));
    out.push(...win('eT', 420, 150, 32, 32, s7, { empty: true, frame: P.sFill, frameStroke: P.sMid, emptyFill: '#f1f8f5', fillMask: (r, c) => (r0 + r < M ? '#cfe2f6' : P.zero), rowLabels: true, colLabels: true }));
    out.push(T('eT:t', 420, 124, 'tileA of block (24, 31)', { size: 13, wt: 600, fill: P.sInk }));
    out.push(T('eT:z', 420 + 16 * s7, 150 + 20 * s7, 'zeros', { size: 12, fill: P.zeroInk, anchor: 'middle' }));
    out.push(...win('eC', 730, 150, 32, 32, s7 * 0.62, { r0, c0, R: M, Cc: N, base: P.cFill, voidText: false }));
    out.push(T('eC:t', 730, 136, 'C: rows 992 to 1,023', { size: 12.5, wt: 600, fill: P.cInk }));
    out.push(T('eC:s', 730, 150 + 32 * s7 * 0.62 + 18, 'rows 992 to 999 written;', { size: 11.5, fill: P.cInk }));
    out.push(T('eC:s2', 730, 150 + 32 * s7 * 0.62 + 34, 'rows 1,000 to 1,023 skipped', { size: 11.5, fill: P.mute }));
    return out;
  };

  // ------------------------------------------------------------------------------------------------ what kernel 3 saves
  S3.savings = function () {
    const out = [];
    const x = 170, y1 = 190, y2 = 300, w = 640;
    // kernel 2: A[r][i] is read by the 800 threads of row r, B[i][c] by the 1,000 threads of column c
    // kernel 3: each value of A is fetched by the 25 blocks along its row band, each value of B by the 32 blocks down its column band
    const k2 = 2 * M * N * K, k3 = M * K * Math.ceil(N / 32) + K * N * Math.ceil(M / 32);
    out.push(T('sv:t', x, y1 - 50, 'values asked of global memory for the whole product', { size: 13, wt: 600, fill: P.ink }));
    out.push(T('sv:k2', x, y1 - 12, 'kernel 2: every thread reads its own row of A and column of B', { size: 12, fill: P.soft }));
    out.push(R('sv:k2r', x, y1, w, 26, { rx: 5, fill: P.bMid, z: 2 }));
    out.push(T('sv:k2v', x + w - 8, y1 + 18, fmt(k2), { size: 13, wt: 600, fill: P.bInk, anchor: 'end' }));
    out.push(T('sv:k3', x, y2 - 12, 'kernel 3: each block fetches each value it needs once', { size: 12, fill: P.soft }));
    out.push(R('sv:k3r', x, y2, Math.max(4, w * k3 / k2), 26, { rx: 5, fill: P.sMid, z: 2 }));
    out.push(T('sv:k3v', x + w * k3 / k2 + 12, y2 + 18, fmt(k3), { size: 13, wt: 600, fill: P.sInk }));
    out.push(T('sv:ratio', x, y2 + 70, `${fmt(k2)} ÷ ${fmt(k3)} = ${(k2 / k3).toFixed(1)} times fewer`, { size: 13, fill: P.ink, font: 'serif' }));
    return out;
  };
  S3.counts = { k2: 2 * M * N * K, k3: M * K * Math.ceil(N / 32) + K * N * Math.ceil(M / 32) };

  // ------------------------------------------------------------------------------------------------ the lesson
  const fillRow = (r, f) => (rr) => (rr === r ? f : null);
  const fillCell = (r, c, f) => (rr, cc) => (rr === r && cc === c ? f : null);
  const fillAll = (f) => () => f;
  const fillHalfCols = (f) => (r, c) => (c < REAL ? f : P.zero);
  const fillHalfRows = (f) => (r, c) => (r < REAL ? f : P.zero);
  const AF = '#cfe2f6', BF = '#f7d3e0';
  const c = S3.counts;

  CW.LESSONS = CW.LESSONS || {};
  CW.LESSONS[3] = {
    tab: 'Kernel 3',
    tabSub: 'tiles in shared memory',
    file: 'matmul-03.py',
    whoText: 'Thread (8, 3) of block (0, 0)',
    dim: (n, line) => /^(from |import )/.test(line.trim()) || /cuda\.synchronize|asnumpy/.test(line),
    beats: [
      {
        q: 'What is kernel 3 trying to fix?',
        lines: ['def matmul'],
        steps: [
          { say: 'In kernel 2, every thread reads its own row of A and its own column of B from global memory: 2 × 1,200 values each. But many threads read the same values. A[3][0] is needed by every element of row 3 of C, so 800 threads ask for it. Inside one block, at step i, all 32 warps of block (0, 0) read the same 32 values, B[i][0] to B[i][31]: the same 4 crates, 32 times over.',
            scene: () => S.read({ kernel: 2, show: ['lanes', 'A', 'Acr'] }) },
          { say: 'Look at one block. Its 1,024 threads compute the 32 × 32 tile of C at rows 0 to 31, columns 0 to 31. Between them they need only rows 0 to 31 of A and columns 0 to 31 of B.',
            scene: () => S3.bands({ note: true }) },
          { say: 'So the block could fetch each of those values from global memory once and keep it in <b>shared memory</b>. Shared memory is a small, fast memory on the streaming multiprocessor (SM) that runs the block, and all threads of that block can read and write it. Every thread that needs a value then reads it there. That is the whole idea of kernel 3.',
            scene: () => S3.bands({ note: true }) },
        ],
      },
      {
        q: 'How is the work cut up?',
        lines: ['tile_dim = 32', 'threads_per_block = (tile_dim, tile_dim)', ['blocks_per_grid = (', 1, 3]],
        steps: [
          { say: '<code>tile_dim = 32</code>: each block computes a 32 × 32 tile of C, one thread per element, exactly as in kernel 2. So <code>threads_per_block = (32, 32)</code> and <code>blocks_per_grid = (25, 32)</code>, the same launch as kernel 2.',
            scene: () => S.grid({ kernel: 3, over: true, counts: true }) },
        ],
      },
      {
        q: 'How much can a block keep in shared memory?',
        lines: ['tileA = cuda.shared.array', 'tileB = cuda.shared.array'],
        steps: [
          { say: 'The band of A that block (0, 0) needs is 32 rows × 1,200 columns = 38,400 values, and at 4 bytes a value that is 153,600 bytes. The band of B is the same size.',
            scene: () => S3.bytes({ only: ['band'] }) },
          { say: 'A block may keep at most 48 KB (49,152 bytes) in shared arrays declared like these. One band alone is more than three times that, so it does not fit. Asking for more needs a different kind of shared array, and even the H100’s limit for one block, 227 KB, could not hold both bands, 307,200 bytes. The bands also grow with k.',
            scene: () => S3.bytes({ only: ['band', 'budget'] }) },
          { say: 'So the kernel takes the band in pieces of 32 columns. A 32 × 32 <b>chunk</b> of A is 32 × 32 × 4 = 4,096 bytes, and the matching 32 × 32 chunk of B is another 4,096. Two chunks, 8 KB, fit easily.',
            scene: () => S3.bytes({}) },
          { kind: 'code', say: '<code>tileA</code> and <code>tileB</code> are the places for those two chunks: two 32 × 32 arrays in shared memory.<span class="eq">tileA = cuda.shared.array(shape=(tile_dim, tile_dim), dtype=cp.float32)\ntileB = cuda.shared.array(shape=(tile_dim, tile_dim), dtype=cp.float32)</span><code>tile_dim</code> is 32, and <code>cp.float32</code> is the same 4-byte float32 as before. There is one pair per block, and all 1,024 of its threads see the same pair. We will call tileA and tileB the <b>trays</b>. A chunk is the data, and a tray is the place in shared memory that holds one chunk at a time. The code uses the word tile for all of these: <code>num_tiles</code> counts chunks, and <code>tile_offset</code> is where a chunk starts. In this walk, a tile on its own means a 32 × 32 piece of C.',
            scene: () => S3.trays({}) },
        ],
      },
      {
        q: 'Which element of C does each thread compute?',
        lines: ['tx = cuda.threadIdx.x', 'ty = cuda.threadIdx.y', 'out_col = tx', 'out_row = ty'],
        steps: [
          { say: '<code>tx</code> and <code>ty</code> are short names for <code>threadIdx.x</code> and <code>threadIdx.y</code>. The two index lines are kernel 2’s. The only change is the order of the product, <code>blockIdx.x * blockDim.x</code> instead of <code>blockDim.x * blockIdx.x</code>, which gives the same number:<span class="eq">out_col = tx + blockIdx.x × 32\nout_row = ty + blockIdx.y × 32</span>So warps still run along rows of C, which kept kernel 2’s reads coalesced.',
            scene: () => S.landing({ kernel: 2, phase: 'all', hlWarp: 3 }) },
          { kind: 'check', say: 'Thread (8, 3) of block (0, 0): out_col = 8 + 0 = 8 and out_row = 3 + 0 = 3. It computes C[3][8], as lane 8 of warp 3.',
            scene: () => S.landing({ kernel: 2, phase: 'all', hlWarp: 3, me: [8, 3] }), vars: () => V('out_row = ', null, NAMES) },
        ],
      },
      {
        q: 'How many chunks does the loop need?',
        lines: ['num_tiles = ', 'product = float32(0.0)'],
        steps: [
          { say: 'The band has 1,200 columns, taken 32 at a time, so ceil_div once more:<span class="eq">num_tiles = (k + tile_dim - 1) // tile_dim\n          = (1200 + 31) // 32 = 1231 // 32 = <b>38</b></span>',
            scene: () => S3.chunks({}), vars: () => V('num_tiles = ', null, NAMES) },
          { say: '1,200 = 37 × 32 + 16. So 37 chunks are full, and the last one, chunk 37, has only 16 real columns: the other 16 would lie past the end of the row.',
            scene: () => S3.chunks({ past: true, t: LASTT }) },
          { say: '<code>product = float32(0.0)</code>: our thread’s running sum, in a register, as <code>dot_product</code> was in kernels 1 and 2.',
            scene: () => S3.chunks({ past: true, bnote: true }), vars: () => V('product = float32', null, NAMES) },
        ],
      },
      {
        q: 'Where does chunk t start?',
        lines: ['for t in range(num_tiles):', 'tile_offset = t * tile_dim'],
        steps: [
          { say: 'The loop runs t = 0 to 37, one chunk per turn. Chunk t covers columns t × 32 to t × 32 + 31 of A’s band, and rows t × 32 to t × 32 + 31 of B’s band. Its first column (or row) is <code>tile_offset = t * tile_dim</code>.',
            scene: () => S3.chunks({ t: 0, past: true }), vars: () => V('tile_offset = ', [0], NAMES) },
          { kind: 'check', say: 't = 0: tile_offset = 0. t = 1: tile_offset = 32. The last turn, t = 37: tile_offset = 37 × 32 = 1,184.',
            scene: () => S3.chunks({ t: 1, past: true }), vars: () => V('tile_offset = ', [1], NAMES) },
        ],
      },
      {
        q: 'Which value does each thread copy?',
        lines: ['b_row = tile_offset + ty', 'a_col = tile_offset + tx'],
        steps: [
          { say: 'A chunk of A is 32 × 32 = 1,024 values, and the block has 1,024 threads. So the simplest split is one value of A per thread, and one value of B per thread.',
            scene: () => S3.copy({ which: 'A', t: 0, mode: 'none', mask: null }) },
          { say: 'Let each thread fill the tray cells at its own position: thread (tx, ty) fills <code>tileA[ty, tx]</code> and <code>tileB[ty, tx]</code>. Which values belong in those cells?',
            scene: () => S3.copy({ which: 'A', t: 0, mode: 'none', mask: fillCell(3, 8, P.me) }) },
          { say: 'Look ahead to line 47, where the trays are used. At step i, thread (tx, ty) multiplies <code>tileA[ty, i]</code> by <code>tileB[i, tx]</code>. For C[out_row][out_col], that pair must be A[out_row][tile_offset + i] and B[tile_offset + i][out_col].',
            lines: ['b_row = tile_offset + ty', 'a_col = tile_offset + tx', 'product += tileA[ty, i] * tileB[i, tx]'],
            scene: () => S3.multiply({ mode: 'thread', i: null }) },
          { say: 'So cell <code>tileA[ty, tx]</code> must hold A[out_row][tile_offset + tx]. The threads that read row ty of tileA all have this ty, and so the same out_row, which is why the copying thread can use its own. The column, <code>tile_offset + tx</code>, is <code>a_col</code>.',
            scene: () => S3.copy({ which: 'A', t: 0, mode: 'thread', mask: fillCell(3, 8, P.me) }) },
          { say: 'Likewise cell <code>tileB[ty, tx]</code> must hold B[tile_offset + ty][out_col]. The threads that read column tx of tileB all have this tx, and so the same out_col. The row, <code>tile_offset + ty</code>, is <code>b_row</code>.',
            scene: () => S3.copy({ which: 'B', t: 0, mode: 'thread', mask: fillCell(3, 8, P.me) }) },
          { kind: 'code', say: '<span class="eq">b_row = tile_offset + ty     # the row of B this thread copies\na_col = tile_offset + tx     # the column of A this thread copies\ntileA[ty, tx] = matA[out_row, a_col]\ntileB[ty, tx] = matB[b_row, out_col]</span>',
            scene: () => S3.copy({ which: 'B', t: 0, mode: 'thread', mask: fillCell(3, 8, P.me) }), vars: () => V('a_col = ', [0], NAMES) },
          { kind: 'check', say: 'Thread (8, 3) at t = 0: a_col = 0 + 8 = 8 and b_row = 0 + 3 = 3. It copies A[3][8] into tileA[3][8] and B[3][8] into tileB[3][8]. At t = 1 it copies A[3][40] and B[35][8] into the same two cells.',
            scene: () => S3.copy({ which: 'A', t: 0, mode: 'thread', mask: fillCell(3, 8, P.me) }) },
        ],
      },
      {
        q: 'What does the copy of A look like, thread by thread?',
        lines: ['if out_row < m and a_col < k:', 'tileA[ty, tx] = matA[out_row, a_col]'],
        steps: [
          { say: 'Our thread: 3 &lt; 1,000 and 8 &lt; 1,200, so the <code>if</code> runs, and A[3][8] = 2.0 lands in tileA[3][8].',
            scene: () => S3.copy({ which: 'A', t: 0, mode: 'thread', mask: fillCell(3, 8, AF) }), beads: () => S3.copyBeads({ which: 'A', mode: 'thread' }), vars: () => V('tileA[ty, tx] = matA', [0], NAMES) },
          { say: 'Its warp runs the line at the same moment. Warp 3’s lanes have tx = 0 to 31, so they copy A[3][0] to A[3][31] into row 3 of tileA: 32 neighbours, 128 bytes, 4 crates. Coalesced.',
            scene: () => S3.copy({ which: 'A', t: 0, mode: 'warp', mask: fillRow(3, AF) }), beads: () => S3.copyBeads({ which: 'A', mode: 'warp' }) },
          { say: 'All 32 warps do the same, each with its own row: warp w copies row w of the chunk. Together they move the whole 32 × 32 chunk of A into tileA, with 32 × 4 = 128 crates.',
            scene: () => S3.copy({ which: 'A', t: 0, mode: 'block', mask: fillAll(AF) }), beads: () => S3.copyBeads({ which: 'A', mode: 'block' }) },
        ],
      },
      {
        q: 'And the copy of B?',
        lines: ['if b_row < k and out_col < n:', 'tileB[ty, tx] = matB[b_row, out_col]'],
        steps: [
          { say: 'Our thread: b_row = 3 &lt; 1,200 and out_col = 8 &lt; 800, so it copies B[3][8] = 3.0 into tileB[3][8].',
            scene: () => S3.copy({ which: 'B', t: 0, mode: 'thread', mask: fillCell(3, 8, BF) }), beads: () => S3.copyBeads({ which: 'B', mode: 'thread' }), vars: () => V('tileB[ty, tx] = matB', [0], NAMES) },
          { say: 'Warp 3 copies B[3][0] to B[3][31] into row 3 of tileB: again 32 neighbours, 4 crates. Notice what this means: the lanes copy 32 neighbouring values from row 3 of B, not column 8. Our thread copies B[3][8] for the 32 threads that compute column 8, one in each warp, and later reads column 8 of tileB, which the other warps copied.',
            scene: () => S3.copy({ which: 'B', t: 0, mode: 'warp', mask: fillRow(3, BF) }), beads: () => S3.copyBeads({ which: 'B', mode: 'warp' }) },
          { say: 'All 32 warps: the whole chunk of B lands in tileB. Every read from global memory in this kernel is a run of 32 neighbours.',
            scene: () => S3.copy({ which: 'B', t: 0, mode: 'block', mask: fillAll(BF) }), beads: () => S3.copyBeads({ which: 'B', mode: 'block' }) },
        ],
      },
      {
        q: 'Why must every thread wait here?',
        lines: [['cuda.syncthreads()', 1]],
        steps: [
          { say: 'In a moment our thread will read row 3 of tileA and column 8 of tileB. Row 3 of tileA was written by its own warp. But column 8 of tileB holds one value from each of the 32 warps: tileB[0][8], for example, was written by thread (8, 0), in warp 0. Even so, CUDA does not promise that the lanes of a warp stay in step, so the barrier is needed for tileA too.',
            scene: S3.writers },
          { say: 'Warps run independently, and warp 0 may be slower than warp 3. Without a wait, warp 3 could read tileB[0][8] before warp 0 has put chunk 0’s value there.',
            scene: () => S3.barrier({ phase: 'walk' }) },
          { say: '<code>cuda.syncthreads()</code> is a <b>barrier</b>: each thread stops at this line until all 1,024 threads of the block have reached it. Then all of them go on, and every cell of both trays is in place.',
            scene: () => S3.barrier({ phase: 'arrived' }) },
        ],
      },
      {
        q: 'What does our thread compute from the trays?',
        lines: ['for i in range(tile_dim):', 'product += tileA[ty, i] * tileB[i, tx]'],
        steps: [
          { say: 'For this chunk, our thread needs row 3 of A times column 8 of B over this chunk’s 32 steps along k (for chunk 0, columns 0 to 31 of A and rows 0 to 31 of B). In the trays those are row ty = 3 of tileA and column tx = 8 of tileB.',
            scene: () => S3.multiply({ mode: 'thread', i: null, product: 0 }) },
          { say: 'i = 0: product += tileA[3][0] × tileB[0][8] = 2.0 × 3.0 = 6.0.',
            scene: () => S3.multiply({ mode: 'thread', i: 0, product: 6 }), beads: () => S3.multiplyBeads({ mode: 'thread', i: 0 }), vars: () => V('product += ', [0, 0], NAMES) },
          { say: 'i = 1: product = 12.0. tileA[3][1] is A[3][1] and tileB[1][8] is B[1][8]: exactly the pair the sum for C[3][8] needs.',
            scene: () => S3.multiply({ mode: 'thread', i: 1, product: 12 }), beads: () => S3.multiplyBeads({ mode: 'thread', i: 1 }), vars: () => V('product += ', [0, 1], NAMES) },
          { kind: 'check', say: 'After i = 31: product = 32 × 6.0 = 192.0, chunk 0’s share of C[3][8].',
            scene: () => S3.multiply({ mode: 'thread', i: 31, product: 192 }), beads: () => S3.multiplyBeads({ mode: 'thread', i: 31 }), vars: () => V('product += ', [0, 31], NAMES) },
          { say: 'The warp at step i: all 32 lanes need <code>tileA[3][i]</code>, a single value, and shared memory hands it to every lane at once. Lane j needs <code>tileB[i][j]</code>. Shared memory is split into 32 <b>banks</b>, and neighbouring 4-byte values sit in neighbouring banks, so tileB[i][0] to tileB[i][31] sit in banks 0 to 31. Each bank serves one address per pass, so the 32 lanes are served in one pass.',
            scene: () => S3.multiply({ mode: 'warp', i: 0 }), beads: () => S3.multiplyBeads({ mode: 'warp', i: 0 }) },
        ],
      },
      {
        q: 'Why wait a second time?',
        lines: [['cuda.syncthreads()', 2]],
        steps: [
          { say: 'The next turn of the loop copies chunk 1 into the same trays. Suppose warp 0 finishes its 32 multiply-adds first and starts copying: it overwrites row 0 of tileB with B[32][0] to B[32][31].',
            scene: S3.danger },
          { say: 'If warp 3 is still on chunk 0, at i = 0, it needs tileB[0][8] = B[0][8], and could read B[32][8] instead. (In this notebook every value of B is 3.0, so the answer would not even change: a bug that the test would not catch.)',
            scene: S3.danger },
          { say: 'So a second <code>cuda.syncthreads()</code> waits until every thread has finished reading chunk 0. Only then may anyone overwrite the trays.',
            scene: () => S3.barrier({ phase: 'arrived', hot: 0 }) },
        ],
      },
      {
        q: 'What changes on the next turns of the loop?',
        lines: ['for t in range(num_tiles):', 'tile_offset = t * tile_dim', 'b_row = tile_offset + ty', 'a_col = tile_offset + tx'],
        steps: [
          { say: 't = 1: tile_offset = 32, so our thread copies A[3][32 + 8] = A[3][40] and B[32 + 3][8] = B[35][8], into the same tray cells as before: tileA[3][8] and tileB[3][8]. Only where the values come from moves.',
            scene: () => S3.copy({ which: 'A', t: 1, mode: 'thread', mask: fillAll(AF) }), beads: () => S3.copyBeads({ which: 'A', mode: 'thread' }), vars: () => V('a_col = ', [1], NAMES) },
          { kind: 'check', say: 'Each chunk adds 32 × 6.0 = 192.0 to product: 192.0 after chunk 0, 384.0 after chunk 1, 7,104.0 after chunk 36.',
            scene: () => S3.progress({ t: 1, animate: true }), vars: () => V('product += ', [1, 31], NAMES) },
        ],
      },
      {
        q: 'What happens in the last chunk?',
        lines: ['tile_offset = t * tile_dim', 'if out_row < m and a_col < k:', 'tileA[ty, tx] = float32(0.0)', 'if b_row < k and out_col < n:', 'tileB[ty, tx] = float32(0.0)'],
        steps: [
          { say: 't = 37: tile_offset = 1,184. Threads with tx ≥ 16 get a_col = 1,184 + tx ≥ 1,200, past the end of A’s row. The test <code>a_col &lt; k</code> fails, and the <code>else</code> writes 0.0 into their tray cell.',
            scene: () => S3.copy({ which: 'A', t: LASTT, mode: 'none', mask: fillHalfCols(AF), zeroCols: true }), vars: () => V('a_col = ', [LASTT], NAMES) },
          { say: 'Likewise threads with ty ≥ 16 get b_row ≥ 1,200, past the last row of B, and write 0.0 into tileB.',
            scene: () => S3.copy({ which: 'B', t: LASTT, mode: 'none', mask: fillHalfRows(BF), zeroRows: true }) },
          { say: 'Why write zeros, and not just skip the copy? A cell that is not written keeps chunk 36’s value. Our thread would then add 16 more products of 2.0 × 3.0 and end at 7,296.0 instead of 7,200.0. A zero adds nothing: product + 0.0 × tileB[i][8] = product. So the multiply loop can run all 32 steps for every thread, with no special case for the last chunk.',
            scene: () => S3.copy({ which: 'B', t: LASTT, mode: 'none', mask: fillHalfRows(BF), zeroRows: true }) },
          { kind: 'check', say: 'Our thread stays inside: a_col = 1,192 and b_row = 1,187. Its last chunk adds 16 real products, 16 × 6.0 = 96.0, so product = 7,104.0 + 96.0 = 7,200.0.',
            scene: () => S3.progress({ t: LASTT, animate: true }) },
        ],
      },
      {
        q: 'Who writes the answer, and who does not?',
        lines: ['if out_row < m and out_col < n:', 'matC[out_row, out_col] = product'],
        steps: [
          { say: 'out_row = 3 &lt; 1,000 and out_col = 8 &lt; 800, so our thread writes matC[3, 8] = 7,200.0. Warp 3 writes C[3][0] to C[3][31] together: 4 crates.',
            scene: () => S.read({ kernel: 2, show: ['store', 'Ccr'] }), vars: () => V('matC[out_row, out_col]', null, NAMES) },
          { say: 'Block (24, 31) covers rows 992 to 1,023. Its threads with ty ≥ 8 have out_row ≥ 1,000. They still did their share: they wrote zeros into tileA (out_row &lt; m failed), copied their values of B, and ran the loop. Here they skip the store. 256 of its 1,024 threads write.',
            scene: S3.edge },
          { say: 'This is why kernel 3 does not <code>return</code> early like kernels 1 and 2. In every chunk, each thread copies one value of A and one value of B for the whole block. In block (24, 31), thread (8, 3), which computes C[995][776], reads tileB[20][8]. That cell is copied by thread (8, 20), whose own row, 1,012, is past the end of C. If thread (8, 20) returned early, the cell would hold whatever was left in shared memory, and C[995][776] could come out wrong. The kernel would not hang, because on GPUs since Volta, the H100 included, the barrier waits only for threads that have not exited. It would finish with wrong numbers.',
            scene: S3.edge },
        ],
      },
      {
        q: 'What did the tiles buy?',
        lines: [],
        steps: [
          { say: `Count the values asked of global memory. In kernel 2 each value of A was read by 800 threads and each value of B by 1,000 threads: ${fmt(c.k2)} values. In kernel 3 each value of A is fetched by the 25 blocks that need it, and each value of B by 32 blocks: ${fmt(c.k3)} values. That is about 32 times fewer.`,
            scene: S3.savings },
          { kind: 'check', say: '<span class="muted">In the real run (book Chapter 4):</span> on 1,024 × 1,024 matrices the book’s kernel 3 took 235.1 µs against kernel 2’s 350.2 µs on our H100: 1.5 times as fast, not the 32 times the count suggests.',
            scene: S3.savings },
          { say: 'Why so little? Every multiply-add now needs two reads from shared memory, tileA[ty][i] and tileB[i][tx], and the book’s Chapter 4 shows that shared memory, not global memory, now sets the pace. Kernel 4 makes each read of tileB serve several multiply-adds.',
            scene: () => S3.multiply({ mode: 'thread', i: 0, product: 6 }) },
        ],
      },
    ],
  };
})(window.CW = window.CW || {});
