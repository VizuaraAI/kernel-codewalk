/* scenes.js: whole pictures that several kernels share. Each returns stage nodes; lessons pick one per step and set
   its options, so the same objects stay on screen and move from step to step. */
(function (CW) {
  'use strict';
  const { P, n: { T, R, C, L }, win, block, blockGrid, regs, pill, span, vspan, arrow, fmt, f1 } = CW;
  const { M, K, N } = CW.D;
  const S = CW.S = {};
  const s7 = 7;

  /* Kernel 1 counts rows with x; kernels 2 to 4 count columns with x. */
  const axes = (kernel) => (kernel === 1
    ? { rowB: 'blockIdx.x', rowT: 'threadIdx.x', colB: 'blockIdx.y', colT: 'threadIdx.y', xRows: true }
    : { rowB: 'blockIdx.y', rowT: 'threadIdx.y', colB: 'blockIdx.x', colT: 'threadIdx.x', xRows: false });
  S.axes = axes;

  // ------------------------------------------------------------------------------------------------ C by blocks
  const GX = 150, GY = 118, BS = 10;
  /* C cut into blocks. o.kernel, o.over (show the overhang), o.hl [[bx, by, fill]], o.band ['rows'|'cols', b, fill] */
  S.grid = function (o = {}) {
    const ax = axes(o.kernel || 1);
    const out = blockGrid('grid', GX, GY, BS, M, N, { xRows: ax.xRows, overhang: o.over, hl: o.hl || [] });
    const tilesC = Math.ceil(N / 32), tilesR = Math.ceil(M / 32);
    if (o.band) {
      const [dim, b, fill] = o.band;
      if (dim === 'rows') out.push(R('grid:band', GX, GY + b * BS, tilesC * BS, BS, { rx: 2, fill: fill || P.cMid, z: 2, op: 0.95 }));
      else out.push(R('grid:band', GX + b * BS, GY, BS, tilesR * BS, { rx: 2, fill: fill || P.cMid, z: 2, op: 0.95 }));
    }
    if (o.rowBands) {
      for (const b of o.rowBands) out.push(T(`grid:rb:${b}`, GX + tilesC * BS + 10, GY + b * BS + BS * 0.8, `${ax.rowB} = ${b}: rows ${fmt(32 * b)} to ${fmt(32 * b + 31)}`, { size: 11, fill: P.soft, font: 'mono' }));
    }
    if (o.colBands) {
      for (const b of o.colBands) out.push(T(`grid:cb:${b}`, GX + b * BS + BS / 2, GY + tilesR * BS + 18 + (o.colBands.indexOf(b) % 2) * 14, `${b}`, { size: 10.5, fill: P.soft, font: 'mono', anchor: 'middle' }));
    }
    if (o.counts) {
      out.push(...span('grid:cnt:c', GX, GX + tilesC * BS, GY + tilesR * BS + 18, `${tilesC} blocks across: ${fmt(N)} ÷ 32 = ${fmt(N / 32)}`, { fill: P.cInk }));
      out.push(...vspan('grid:cnt:r', GX + tilesC * BS + 14, GY, GY + tilesR * BS, `${tilesR} blocks down`, { fill: P.cInk }));
      out.push(T('grid:cnt:r2', GX + tilesC * BS + 23, GY + tilesR * BS / 2 + 20, `${fmt(M)} \u00f7 32 = ${(M / 32).toFixed(2)},`, { size: 11, fill: P.mute }));
      out.push(T('grid:cnt:r3', GX + tilesC * BS + 23, GY + tilesR * BS / 2 + 34, 'rounded up', { size: 11, fill: P.mute }));
    }
    return out;
  };
  S.gridXY = (bx, by, kernel) => { const ax = axes(kernel); const tr = ax.xRows ? bx : by, tc = ax.xRows ? by : bx; return [GX + tc * BS, GY + tr * BS]; };

  // ------------------------------------------------------------------------------------------------ an index line, magnified
  /* How out_row (dim 'rows') or out_col (dim 'cols') is built: the grid with one band lit, a magnified window of that
     band's 32 rows or columns, and the thread's offset inside it. o.kernel, o.b (block index), o.t (thread index or
     null), o.showStart */
  S.index = function (o) {
    const ax = axes(o.kernel);
    const out = S.grid({ kernel: o.kernel, over: o.over, band: [o.dim, o.b, P.cMid] });
    const tilesC = Math.ceil(N / 32), tilesR = Math.ceil(M / 32);
    const s = 8;
    if (o.dim === 'rows') {
      const r0 = 32 * o.b, IX = 640, IY = 124, cols = 10;
      out.push(...win('inset', IX, IY, 32, cols, s, { r0, c0: 0, R: M, Cc: N, base: P.cFill, rowLabels: true, voidText: true, voidRowText: 'past row 999' }));
      out.push(T('inset:t', IX, IY - 12, `rows ${fmt(r0)} to ${fmt(r0 + 31)}`, { size: 12.5, wt: 600, fill: P.cInk }));
      if (o.dots) {
        for (let i = 0; i < 32; i++) for (let j = 0; j < cols; j++) {
          const live = r0 + i < M;
          out.push(C(`inset:d:${i}:${j}`, IX + j * s + s / 2, IY + i * s + s / 2, 2.1, live ? { fill: P.warpA, z: 3, d: i * 12 } : { fill: '#ffffff', stroke: P.mute, sw: 0.9, z: 3, d: i * 12 }));
        }
        if (r0 + 32 > M) {
          out.push(T('inset:dt', IX + cols * s + 14, IY + (M - r0 + 8) * s, `${32 - (M - r0)} rows of threads`, { size: 11.5, fill: P.soft }));
          out.push(T('inset:dt2', IX + cols * s + 14, IY + (M - r0 + 8) * s + 16, 'with no element: they return', { size: 11.5, fill: P.soft }));
        }
      }
      const by0 = GY + o.b * BS, by1 = by0 + BS;
      out.push(L('inset:g1', GX + tilesC * BS, by0, IX - 30, IY, { stroke: P.cMid, dash: '3 3' }));
      out.push(L('inset:g2', GX + tilesC * BS, by1, IX - 30, IY + 32 * s, { stroke: P.cMid, dash: '3 3' }));
      out.push(T('inset:b', GX + tilesC * BS + 12, by0 + BS * 0.8, `${ax.rowB} = ${o.b}`, { size: 11.5, wt: 600, fill: P.cInk, font: 'mono' }));
      if (o.showStart) {
        out.push(arrow('inset:start', IX + cols * s + 70, IY + s / 2, IX + cols * s + 6, IY + s / 2, { stroke: P.cAcc }));
        out.push(T('inset:startt', IX + cols * s + 76, IY + s / 2 + 4, `starts at 32 × ${o.b} = ${fmt(32 * o.b)}`, { size: 12, fill: P.cInk }));
      }
      if (o.t !== null && o.t !== undefined) {
        const r = r0 + o.t;
        out.push(R('inset:ptr', IX - 2, IY + o.t * s - 1, cols * s + 4, s + 2, { rx: 3, fill: P.meFill, stroke: P.me, sw: 1.4, z: 3 }));
        out.push(arrow('inset:ptra', IX + cols * s + 70, IY + o.t * s + s / 2 + (o.t < 3 ? 22 : 0), IX + cols * s + 6, IY + o.t * s + s / 2, { stroke: P.me }));
        const ty0 = IY + o.t * s + s / 2 + 4 + (o.t < 3 ? 22 : 0);
        out.push(T(`inset:ptrt`, IX + cols * s + 76, ty0, `${ax.rowT} = ${o.t}`, { size: 12.5, wt: 600, fill: P.meInk }));
        out.push(T(`inset:ptrt2`, IX + cols * s + 76, ty0 + 17, `row ${fmt(r0)} + ${o.t} = ${fmt(r)}${r >= M ? ': past the end' : ''}`, { size: 12, fill: P.meInk }));
      }
    } else {
      const c0 = 32 * o.b, IX = 520, IY = 250, rows = 10;
      out.push(...win('inset', IX, IY, rows, 32, s, { r0: 0, c0, R: M, Cc: N, base: P.cFill, colLabels: true }));
      out.push(T('inset:t', IX, IY - 30, `columns ${fmt(c0)} to ${fmt(c0 + 31)}`, { size: 12.5, wt: 600, fill: P.cInk }));
      const bx0 = GX + o.b * BS, bx1 = bx0 + BS;
      out.push(L('inset:g1', bx0, GY + tilesR * BS, IX, IY + rows * s + 2, { stroke: P.cMid, dash: '3 3', op: 0 }));
      out.push(L('inset:g1b', bx0, GY - 2, IX, IY - 40, { stroke: P.cMid, dash: '3 3' }));
      out.push(L('inset:g2b', bx1, GY - 2, IX + 32 * s, IY - 40, { stroke: P.cMid, dash: '3 3' }));
      out.push(T('inset:b', bx0 + BS / 2, GY - 34, `${ax.colB} = ${o.b}`, { size: 11.5, wt: 600, fill: P.cInk, font: 'mono', anchor: 'middle' }));
      if (o.showStart) {
        out.push(arrow('inset:start', IX + s / 2, IY + rows * s + 56, IX + s / 2, IY + rows * s + 6, { stroke: P.cAcc }));
        out.push(T('inset:startt', IX, IY + rows * s + 72, `starts at 32 × ${o.b} = ${fmt(32 * o.b)}`, { size: 12, fill: P.cInk }));
      }
      if (o.t !== null && o.t !== undefined) {
        const c = c0 + o.t;
        out.push(R('inset:ptr', IX + o.t * s - 1, IY - 2, s + 2, rows * s + 4, { rx: 3, fill: P.meFill, stroke: P.me, sw: 1.4, z: 3 }));
        out.push(arrow('inset:ptra', IX + o.t * s + s / 2, IY + rows * s + 56, IX + o.t * s + s / 2, IY + rows * s + 6, { stroke: P.me }));
        out.push(T('inset:ptrt', IX + o.t * s + s / 2, IY + rows * s + 74, `${ax.colT} = ${o.t}`, { size: 12.5, wt: 600, fill: P.meInk, anchor: o.t > 16 ? 'end' : 'start' }));
        out.push(T('inset:ptrt2', IX + o.t * s + s / 2, IY + rows * s + 91, `column ${fmt(c0)} + ${o.t} = ${fmt(c)}`, { size: 12, fill: P.meInk, anchor: o.t > 16 ? 'end' : 'start' }));
      }
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ warps landing on C
  const BX = 104, BY = 150, CX = 612, CY = 150;
  /* The block's threads on the left, block (0, 0)'s tile of C on the right. o.kernel (1 or 2), o.phase: 'block',
     'numbers', 'warps', 'one' (o.warp lands), 'all'; o.me: [tx, ty]; o.hlWarp: a warp to stress after landing. */
  S.landing = function (o) {
    const out = [];
    const k = o.kernel;
    const placeOf = (tx, ty) => (k === 1 ? [CX + ty * s7 + s7 / 2, CY + tx * s7 + s7 / 2] : [CX + tx * s7 + s7 / 2, CY + ty * s7 + s7 / 2]);
    const landed = (tx, ty) => o.phase === 'all' || (o.phase === 'one' && ty === o.warp);
    const landedCells = [];
    for (let ty = 0; ty < 32; ty++) for (let tx = 0; tx < 32; tx++) if (landed(tx, ty)) landedCells.push(k === 1 ? [tx, ty] : [ty, tx]);
    const hl = [];
    if (o.phase === 'one') hl.push(k === 1 ? ['col', o.warp, P.cMid] : ['row', o.warp, P.cMid]);
    if (o.phase === 'all' && o.hlWarp !== undefined) hl.push(k === 1 ? ['col', o.hlWarp, P.cMid] : ['row', o.hlWarp, P.cMid]);
    if (!o.noC) out.push(...win('ctile', CX, CY, 32, 32, s7, { r0: 0, c0: 0, base: P.cFill, title: 'C', sub: 'rows 0 to 31, columns 0 to 31: the tile of block (0, 0)', titleW: 16, rowLabels: true, colLabels: true, hl }));
    if (o.meLabel && o.me && !landed(o.me[0], o.me[1])) {
      const mx = BX + o.me[0] * s7 + s7 / 2, my = BY + o.me[1] * s7 + s7 / 2;
      out.push(C('th:mering', mx, my, 6.5, { fill: 'none', stroke: P.me, sw: 1.5, z: 5 }));
      out.push(L('th:melead', mx + 6, my + 4, BX + 32 * s7 + 26, my + 40, { stroke: P.me }));
      out.push(T('th:melab', BX + 32 * s7 + 30, my + 44, `thread (${o.me[0]}, ${o.me[1]})`, { size: 12.5, wt: 600, fill: P.meInk }));
      out.push(T('th:melab2', BX + 32 * s7 + 30, my + 60, `threadIdx.x = ${o.me[0]}, threadIdx.y = ${o.me[1]}`, { size: 11.5, fill: P.soft, font: 'mono' }));
    }
    const warpOn = o.phase === 'one' ? o.warp : (o.hlWarp !== undefined ? o.hlWarp : (o.phase === 'warps' ? o.warp : -1));
    out.push(...block('th', BX, BY, s7, {
      axis: true,
      place: (tx, ty) => (landed(tx, ty) ? placeOf(tx, ty) : null),
      colorOf: (tx, ty) => ((o.stripes || o.phase === 'all') ? (ty % 2 ? P.warpB : P.warpA) : (ty === warpOn ? P.dotOn : P.dot)),
      r: 2.3,
      me: o.me,
      warps: (o.phase === 'warps' || o.phase === 'numbers') && o.warp !== undefined ? [o.warp] : [],
      delayOf: (tx, ty) => (o.phase === 'one' ? tx * 22 : o.phase === 'all' ? ((ty * 7) % 32) * 34 + tx * 3 : 0),
    }));
    out.push(T('th:title', BX, BY - 40, 'The 1,024 threads of block (0, 0)', { size: 13, wt: 600, fill: P.ink }));
    if (o.phase === 'numbers' || o.phase === 'warps') {
      const rows = o.phase === 'numbers' ? [0, 1, 2, o.warp] : [0, 1, 2, o.warp, 31];
      for (const r of [...new Set(rows)]) {
        out.push(T(`th:num:${r}`, BX + 32 * s7 + 10, BY + r * s7 + s7 * 0.85, `threads ${fmt(32 * r)} to ${fmt(32 * r + 31)}${o.phase === 'warps' ? `: warp ${r}` : ''}`, { size: 10.5, fill: r === o.warp ? P.cInk : P.mute, wt: r === o.warp ? 600 : 400, font: 'mono' }));
      }
    }
    if (o.phase === 'one' || (o.phase === 'all' && o.hlWarp !== undefined)) {
      const w = o.phase === 'one' ? o.warp : o.hlWarp;
      if (k === 1) {
        out.push(R('ctile:wo', CX + w * s7 - 2, CY - 2, s7 + 4, 32 * s7 + 4, { rx: (s7 + 4) / 2, fill: 'none', stroke: P.cAcc, sw: 1.4, z: 4, d: o.phase === 'one' ? 700 : 0 }));
        out.push(T('ctile:wol', CX + w * s7 + s7 / 2, CY + 32 * s7 + 18, `warp ${w}: column ${w}`, { size: 11.5, wt: 600, fill: P.cInk, anchor: 'middle', d: o.phase === 'one' ? 700 : 0 }));
      } else {
        out.push(R('ctile:wo', CX - 2, CY + w * s7 - 2, 32 * s7 + 4, s7 + 4, { rx: (s7 + 4) / 2, fill: 'none', stroke: P.cAcc, sw: 1.4, z: 4, d: o.phase === 'one' ? 700 : 0 }));
        out.push(T('ctile:wol', CX + 32 * s7 + 10, CY + w * s7 + s7 * 0.85, `warp ${w}: row ${w}`, { size: 11.5, wt: 600, fill: P.cInk, d: o.phase === 'one' ? 700 : 0 }));
      }
    }
    if (o.me && (o.phase === 'all' || (o.phase === 'one' && o.me[1] === o.warp))) {
      const [x, y] = placeOf(o.me[0], o.me[1]);
      out.push(C('ctile:mer', x, y, 7, { fill: 'none', stroke: P.me, sw: 1.6, z: 5, d: 600 }));
      const r = k === 1 ? o.me[0] : o.me[1], c = k === 1 ? o.me[1] : o.me[0];
      out.push(T('ctile:met', x + 12, y + (k === 1 ? 26 : -12), `C[${r}][${c}]: lane ${o.me[0]} of warp ${o.me[1]}`, { size: 12, wt: 600, fill: P.meInk, d: 600 }));
    }
    return out;
  };
  S.landingXY = { BX, BY, CX, CY };

  // ------------------------------------------------------------------------------------------------ one thread's loop
  /* One thread's dot product: row r of A runs right towards C[r][c], column c of B runs down towards it.
     o.i: the step being shown (null: none), o.val: the running sum after it, o.r, o.c, o.name ('dot_product'). */
  const LS = 10, SHOWN = 22, TAIL = 3, SPAN = (SHOWN + 2.2 + TAIL) * LS;
  const LAX = 150, LAY = 372;                       // the row of A runs right from here
  const cX = LAX + SPAN + 26, cY = LAY;             // C[r][c] where the row and the column meet
  const LBX = cX, LBY = cY - 26 - SPAN;             // the column of B runs down to it
  const tailStart = K - TAIL;
  const aCellX = (i) => (i < SHOWN ? LAX + i * LS : LAX + (SHOWN + 2.2) * LS + (i - tailStart) * LS);
  const bCellY = (i) => (i < SHOWN ? LBY + i * LS : LBY + (SHOWN + 2.2) * LS + (i - tailStart) * LS);
  S.loopXY = { aCellX, bCellY, cX, cY, LS };
  S.loop = function (o) {
    const out = [];
    const r = o.r, c = o.c;
    const idx = (i) => (i < SHOWN ? i : i);
    for (let i = 0; i < SHOWN; i++) {
      out.push(R(`lp:a:${i}`, aCellX(i) + 0.6, LAY + 0.6, LS - 1.2, LS - 1.2, { rx: 1.6, fill: P.aFill, z: 1 }));
      out.push(R(`lp:b:${i}`, LBX + 0.6, bCellY(i) + 0.6, LS - 1.2, LS - 1.2, { rx: 1.6, fill: P.bFill, z: 1 }));
    }
    for (let i = tailStart; i < K; i++) {
      out.push(R(`lp:a:${i}`, aCellX(i) + 0.6, LAY + 0.6, LS - 1.2, LS - 1.2, { rx: 1.6, fill: P.aFill, z: 1 }));
      out.push(R(`lp:b:${i}`, LBX + 0.6, bCellY(i) + 0.6, LS - 1.2, LS - 1.2, { rx: 1.6, fill: P.bFill, z: 1 }));
    }
    out.push(T('lp:adots', LAX + (SHOWN + 1.1) * LS, LAY + LS * 0.8, '…', { size: 13, fill: P.mute, anchor: 'middle' }));
    out.push(T('lp:bdots', LBX + LS / 2, LBY + (SHOWN + 1.4) * LS, '⋮', { size: 13, fill: P.mute, anchor: 'middle' }));
    out.push(R('lp:c', cX + 0.6, cY + 0.6, LS - 1.2, LS - 1.2, { rx: 1.6, fill: o.done ? P.meFill : P.cFill, stroke: P.me, sw: 1.4, z: 3 }));
    out.push(T('lp:ct', cX + LS + 8, cY + LS + 14, `C[${r}][${c}]`, { size: 12.5, wt: 600, fill: P.meInk }));
    out.push(T('lp:at', LAX, LAY + LS + 20, `row ${r} of A: A[${r}][0], A[${r}][1], …, A[${r}][${fmt(K - 1)}]`, { size: 12, fill: P.aInk }));
    out.push(T('lp:bt', LBX + LS + 10, LBY + 8, `column ${c} of B`, { size: 12, fill: P.bInk }));
    out.push(T('lp:bt2', LBX + LS + 10, LBY + 23, `B[0][${c}] down to B[${fmt(K - 1)}][${c}]`, { size: 11, fill: P.mute }));
    out.push(T('lp:ai0', aCellX(0) + LS / 2, LAY - 6, 'i = 0', { size: 10, fill: P.mute, anchor: 'middle', font: 'mono' }));
    out.push(T('lp:ail', aCellX(K - 1) + LS / 2, LAY - 6, fmt(K - 1), { size: 10, fill: P.mute, anchor: 'middle', font: 'mono' }));
    if (o.i !== null && o.i !== undefined) {
      const i = o.i;
      out.push(R('lp:ha', aCellX(i) - 1, LAY - 1, LS + 2, LS + 2, { rx: 2.4, fill: P.aAcc, z: 3 }));
      out.push(R('lp:hb', LBX - 1, bCellY(i) - 1, LS + 2, LS + 2, { rx: 2.4, fill: P.bAcc, z: 3 }));
      out.push(T('lp:hat', aCellX(i) + LS / 2, LAY + LS + 40, `A[${r}][${fmt(i)}] = 2.0`, { size: 12, wt: 600, fill: P.aInk, anchor: 'middle' }));
      out.push(T('lp:hbt', LBX - 10, bCellY(i) + LS * 0.85, `B[${fmt(i)}][${c}] = 3.0`, { size: 12, wt: 600, fill: P.bInk, anchor: 'end' }));
    }
    if (o.val !== undefined) out.push(...regs('lp:reg', cX + 34, cY - 40, [[o.name || 'dot_product', f1(o.val), true]]));
    if (o.walk) {
      out.push(arrow('lp:wa', LAX, LAY + LS + 56, LAX + 200, LAY + LS + 56, { stroke: P.aAcc }));
      out.push(T('lp:wat', LAX + 210, LAY + LS + 60, 'along the row: neighbours in memory', { size: 11.5, fill: P.aInk }));
      out.push(arrow('lp:wb', LBX + 150, LBY + 40, LBX + 150, LBY + 200, { stroke: P.bAcc }));
      out.push(T('lp:wbt', LBX + 160, LBY + 120, `down the column: ${fmt(4 * N)} bytes apart`, { size: 11.5, fill: P.bInk }));
    }
    return out;
  };
  S.loopBeads = function (i) {
    const ax = aCellX(i) + LS / 2, by = bCellY(i) + LS / 2;
    return [{ x0: ax, y0: LAY + LS / 2, x1: cX + LS / 2, y1: cY + LS / 2, fill: P.aAcc, r: 4, dur: 900 },
      { x0: LBX + LS / 2, y0: by, x1: cX + LS / 2, y1: cY + LS / 2, fill: P.bAcc, r: 4, dur: 900, d: 120 }];
  };

  // ------------------------------------------------------------------------------------------------ memory, one row after another
  /* The first rows of A laid end to end on the byte line. o.mark: [[r, c, label]], o.inset: [r, c0] magnifies 16
     values of row r from column c0, o.gap: [r1, r2] shows the distance between two marks. */
  const RX = 70, RY = 150, RW = 820, ROWS = 5;
  S.ribbon = function (o = {}) {
    const out = [];
    const rowW = RW / ROWS;
    out.push(T('rb:title', RX, RY - 34, 'matA in memory: row 0, then row 1, then row 2, …', { size: 13, wt: 600, fill: P.ink }));
    for (let r = 0; r < ROWS; r++) {
      out.push(R(`rb:row:${r}`, RX + r * rowW + 1, RY, rowW - 2, 26, { rx: 4, fill: r % 2 ? '#d7e6f8' : P.aFill, z: 1 }));
      out.push(T(`rb:rl:${r}`, RX + r * rowW + rowW / 2, RY + 17, `row ${r}`, { size: 11.5, fill: P.aInk, anchor: 'middle' }));
      out.push(T(`rb:by:${r}`, RX + r * rowW + 1, RY + 44, `byte ${fmt(r * K * 4)}`, { size: 10.5, fill: P.mute, font: 'mono' }));
    }
    out.push(T('rb:more', RX + RW + 8, RY + 18, '…', { size: 14, fill: P.mute }));
    for (const [r, c, lab] of o.mark || []) {
      const x = RX + r * rowW + 1 + (c / K) * (rowW - 2);
      out.push(R(`rb:mk:${r}:${c}`, x - 1.5, RY - 6, 3, 38, { rx: 1.5, fill: P.me, z: 3 }));
      out.push(T(`rb:mkt:${r}:${c}`, x, RY - 12, lab, { size: 11.5, wt: 600, fill: P.meInk, anchor: 'middle' }));
    }
    if (o.gap) {
      const [r1, r2] = o.gap;
      const x1 = RX + r1 * rowW + 1, x2 = RX + r2 * rowW + 1;
      out.push(...span('rb:gap', x1, x2, RY + 66, `${fmt((r2 - r1) * K * 4)} bytes: one whole row of A`, { fill: P.soft }));
    }
    if (o.inset) {
      const [r, c0] = o.inset;
      const IX = 160, IY = 330, s = 38;
      const x = RX + r * rowW + 1 + (c0 / K) * (rowW - 2);
      out.push(L('rb:ig1', x, RY + 28, IX, IY - 22, { stroke: P.aMid, dash: '3 3' }));
      out.push(L('rb:ig2', x + 2, RY + 28, IX + 16 * s, IY - 22, { stroke: P.aMid, dash: '3 3' }));
      for (let j = 0; j < 16; j++) {
        out.push(R(`rb:ic:${j}`, IX + j * s + 1.5, IY + 1.5, s - 3, s - 3, { rx: 4, fill: P.aFill, z: 1 }));
        out.push(T(`rb:icv:${j}`, IX + j * s + s / 2, IY + s / 2 + 4, `A[${r}][${c0 + j}]`, { size: 8.6, fill: P.aInk, anchor: 'middle', font: 'mono' }));
      }
      for (let g = 0; g < 2; g++) {
        out.push(R(`rb:icr:${g}`, IX + g * 8 * s - 2, IY - 2, 8 * s + 4, s + 4, { rx: (s + 4) / 2, fill: 'none', stroke: P.aAcc, sw: 1.6, z: 3 }));
        out.push(T(`rb:icrt:${g}`, IX + g * 8 * s + 4 * s, IY + s + 22, `one 32-byte crate: bytes ${fmt(4 * (r * K + c0) + 32 * g)} to ${fmt(4 * (r * K + c0) + 32 * g + 31)}`, { size: 11.5, fill: P.aInk, anchor: 'middle' }));
      }
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ a warp's reads at one step
  const WAX = 300, WAY = 300, WBX = 566, WBY = 42, WCX = 566, WCY = 300;
  S.readXY = { WAX, WAY, WBX, WBY, WCX, WCY };
  /* Block (0, 0)'s view of A, B and C at step i = 0. o.kernel (1 or 2), o.show: set of 'lanes', 'A', 'Acr', 'B', 'Bcr',
     'total', 'store', 'Ccr'. */
  S.read = function (o) {
    const k = o.kernel, sh = new Set(o.show || []);
    const out = [];
    const w = k === 1 ? 8 : 3;          // our warp
    const lanes = [];
    for (let j = 0; j < 32; j++) lanes.push(k === 1 ? [j, w] : [w, j]);
    const hlC = [], hlA = [], hlB = [], crA = [], crB = [], crC = [];
    if (sh.has('lanes') || sh.has('store')) hlC.push(k === 1 ? ['col', w, sh.has('store') ? P.meFill : P.cMid] : ['row', w, sh.has('store') ? P.meFill : P.cMid]);
    if (sh.has('A')) { if (k === 1) hlA.push(['col', 0, P.aMid]); else hlA.push(['cell', w, 0, P.aAcc]); }
    if (sh.has('B')) { if (k === 1) hlB.push(['cell', 0, w, P.bAcc]); else hlB.push(['row', 0, P.bMid]); }
    if (sh.has('Acr')) { if (k === 1) for (let r = 0; r < 32; r++) crA.push([r, 0, P.aAcc, r * 25]); else crA.push([w, 0, P.aAcc]); }
    if (sh.has('Bcr')) { if (k === 1) crB.push([0, 8, P.bAcc]); else for (let g = 0; g < 4; g++) crB.push([0, 8 * g, P.bAcc, g * 120]); }
    if (sh.has('Ccr')) { if (k === 1) for (let r = 0; r < 32; r++) crC.push([r, 8, P.cAcc, r * 25]); else for (let g = 0; g < 4; g++) crC.push([w, 8 * g, P.cAcc, g * 120]); }
    out.push(...win('rA', WAX, WAY, 32, 32, s7, { base: P.aFill, title: 'A', sub: 'rows 0 to 31, columns 0 to 31', rowLabels: true, colLabels: true, hl: hlA, crates: crA }));
    out.push(...win('rB', WBX, WBY, 32, 32, s7, { base: P.bFill, title: 'B', sub: 'rows 0 to 31, columns 0 to 31', rowLabels: true, colLabels: true, hl: hlB, crates: crB }));
    out.push(...win('rC', WCX, WCY, 32, 32, s7, { base: P.cFill, title: 'C', sub: `the tile of block (0, 0)`, rowLabels: true, colLabels: true, hl: hlC, crates: crC }));
    if (sh.has('lanes') || sh.has('store')) {
      const ly = k === 1 ? WCY + 20 : WCY + w * s7 + s7 * 0.85;
      out.push(T('rC:wl', WCX + 32 * s7 + 12, ly, `warp ${w}`, { size: 12, wt: 600, fill: P.cInk }));
      out.push(T('rC:wl2', WCX + 32 * s7 + 12, ly + 16, k === 1 ? `lane j: C[j][${w}]` : `lane j: C[${w}][j]`, { size: 11.5, fill: P.cInk }));
    }
    if (sh.has('Acr')) out.push(...pill('rA:pill', WAX - 34, WAY + 116, k === 1 ? '32 crates' : '1 crate', { anchor: 'end', fill: P.aFill, stroke: P.aMid, ink: P.aInk }));
    if (sh.has('Bcr')) out.push(...pill('rB:pill', WBX - 34, WBY + 18, k === 1 ? '1 crate' : '4 crates', { anchor: 'end', fill: P.bFill, stroke: P.bMid, ink: P.bInk }));
    if (sh.has('Ccr')) out.push(...pill('rC:pill', WCX + 32 * s7 + 12, WCY + 72, k === 1 ? '32 crates' : '4 crates', { anchor: 'start', fill: P.cFill, stroke: P.cMid, ink: P.cInk }));
    if (sh.has('total')) {
      const crates = k === 1 ? 33 : 5;
      out.push(...pill('rT:pill', 150, 120, `${crates} crates = ${fmt(crates * 32)} bytes`, { anchor: 'middle', fill: P.panel, size: 13 }));
      out.push(T('rT:t', 150, 146, 'for 32 multiply-adds', { size: 12, fill: P.soft, anchor: 'middle' }));
    }
    return out;
  };
  /* Beads for the warp's reads at step 0. */
  S.readBeads = function (kernel, which) {
    const k = kernel, w = k === 1 ? 8 : 3, out = [];
    const cc = (x, y, r, c) => [x + c * s7 + s7 / 2, y + r * s7 + s7 / 2];
    for (let j = 0; j < 32; j++) {
      const [lr, lc] = k === 1 ? [j, w] : [w, j];
      const [x1, y1] = cc(WCX, WCY, lr, lc);
      if (which === 'A') {
        const [x0, y0] = k === 1 ? cc(WAX, WAY, j, 0) : cc(WAX, WAY, w, 0);
        out.push({ x0, y0, x1, y1, fill: P.aAcc, r: 2.6, d: j * 24, dur: 900 });
      } else if (which === 'B') {
        const [x0, y0] = k === 1 ? cc(WBX, WBY, 0, w) : cc(WBX, WBY, 0, j);
        out.push({ x0, y0, x1, y1, fill: P.bAcc, r: 2.6, d: j * 24, dur: 900 });
      }
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------ a thread's place on C
  /* Small helper: C's tile with one element marked. */
  S.meOnTile = function (r, c, label, o = {}) {
    const x = o.x || 380, y = o.y || 150;
    const out = win('mt', x, y, 32, 32, s7, { base: P.cFill, title: 'C', sub: 'the tile of block (0, 0)', rowLabels: true, colLabels: true, hl: [['cell', r, c, P.me]] });
    out.push(T('mt:l', x + c * s7 + 14, y + r * s7 + 4, label, { size: 12, wt: 600, fill: P.meInk }));
    return out;
  };
})(window.CW = window.CW || {});
