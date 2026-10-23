/* views.js: the visual vocabulary. Every function returns a list of nodes for the stage (engine.js).
   One look for all four kernels: A light blue, B light pink, C light purple, shared memory mint, threads small grey
   dots, a warp an outlined row of dots in purple, and our own thread and element the one warm colour (peach).
   Keys are stable, so the same object in the next step moves instead of popping. */
(function (CW) {
  'use strict';

  const P = CW.P = {
    ink: '#1d2030', soft: '#565b6e', mute: '#959bae', faint: '#c9cdd9', rule: '#e7e9f0', panel: '#f6f7fb', paper: '#ffffff',
    aFill: '#e2edfb', aMid: '#b9d3f2', aAcc: '#4a8bd6', aInk: '#2f6db5',
    bFill: '#fce5ee', bMid: '#f4c0d4', bAcc: '#d55f8c', bInk: '#b4436f',
    cFill: '#ece7fb', cMid: '#cdc2f3', cAcc: '#7a63d3', cInk: '#5d47b6',
    sFill: '#ddf2ea', sMid: '#ace0cb', sAcc: '#3ea57e', sInk: '#2c8463',
    dot: '#c3c8d9', dotOn: '#7a63d3', warpA: '#8c76de', warpB: '#c3b6f0',
    me: '#f09a4c', meFill: '#ffe2c4', meInk: '#c4701f',
    zero: '#eef0f5', zeroInk: '#a3a8b8', hatch: '#dfe2ea',
  };
  const fmt = CW.fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
  const f1 = CW.f1 = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // ------------------------------------------------------------------------------------------------ small pieces
  const T = (k, x, y, text, o = {}) => ({ k, t: 'text', x, y, text, size: o.size || 12, wt: o.wt || 400, fill: o.fill || P.soft, anchor: o.anchor || 'start', font: o.font || 'sans', op: o.op, z: o.z === undefined ? 4 : o.z, d: o.d, it: o.it });
  const R = (k, x, y, w, h, o = {}) => ({ k, t: 'rect', x, y, w, h, rx: o.rx || 0, fill: o.fill, stroke: o.stroke, sw: o.sw, dash: o.dash, op: o.op, z: o.z === undefined ? 1 : o.z, d: o.d, pat: o.pat, from: o.from, dur: o.dur });
  const C = (k, x, y, r, o = {}) => ({ k, t: 'circle', x, y, r, fill: o.fill, stroke: o.stroke, sw: o.sw, op: o.op, z: o.z === undefined ? 3 : o.z, d: o.d, from: o.from, dur: o.dur });
  const L = (k, x1, y1, x2, y2, o = {}) => ({ k, t: 'line', x: x1, y: y1, x2: x2 - x1, y2: y2 - y1, stroke: o.stroke || P.faint, sw: o.sw || 1, dash: o.dash, op: o.op, z: o.z === undefined ? 2 : o.z, d: o.d });
  const PATH = (k, x, y, d, o = {}) => ({ k, t: 'path', x, y, dpath: d, fill: o.fill || 'none', stroke: o.stroke || P.soft, sw: o.sw || 1.4, op: o.op, z: o.z === undefined ? 3 : o.z, cap: 'round', d: o.d });
  CW.n = { T, R, C, L, PATH };

  const pat = (cell, fill, gap = 1.2, rx = 1.3) => ({ cell, gap, fill, rx });

  /* An arrow from (x1, y1) to (x2, y2), drawn as one path. */
  function arrow(k, x1, y1, x2, y2, o = {}) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, h = o.head || 7;
    const bx = x2 - ux * h, by = y2 - uy * h;
    const d = `M0,0 L${dx},${dy} M${bx - x1 - uy * h * 0.55},${by - y1 + ux * h * 0.55} L${dx},${dy} L${bx - x1 + uy * h * 0.55},${by - y1 - ux * h * 0.55}`;
    return PATH(k, x1, y1, d, { stroke: o.stroke || P.mute, sw: o.sw || 1.4, op: o.op, z: o.z, d: o.d });
  }
  CW.arrow = arrow;

  /* A brace or bracket under/over a span, with a label. */
  function span(k, x1, x2, y, text, o = {}) {
    const up = o.up ? -1 : 1, h = 5;
    const d = `M0,${-h * up} L0,0 L${x2 - x1},0 L${x2 - x1},${-h * up}`;
    return [PATH(k + ':b', x1, y, d, { stroke: o.stroke || P.mute, sw: 1.1, op: o.op, d: o.d }),
      T(k + ':t', (x1 + x2) / 2, y + (o.up ? -9 : 15), text, { anchor: 'middle', size: o.size || 11.5, fill: o.fill || P.soft, op: o.op, d: o.d, font: o.font })];
  }
  function vspan(k, x, y1, y2, text, o = {}) {
    const left = o.left ? -1 : 1, w = 5;
    const d = `M${-w * left},0 L0,0 L0,${y2 - y1} L${-w * left},${y2 - y1}`;
    return [PATH(k + ':b', x, y1, d, { stroke: o.stroke || P.mute, sw: 1.1, op: o.op, d: o.d }),
      T(k + ':t', x + (o.left ? -9 : 9), (y1 + y2) / 2 + 4, text, { anchor: o.left ? 'end' : 'start', size: o.size || 11.5, fill: o.fill || P.soft, op: o.op, d: o.d, font: o.font })];
  }
  CW.span = span;
  CW.vspan = vspan;

  // ------------------------------------------------------------------------------------------------ a matrix window
  /* A window of `rows` x `cols` cells onto a matrix (or a shared-memory tray), cell size s, top-left (x, y).
     o.r0, o.c0: the global row and column of the window's first cell (for labels and for cells past the end).
     o.R, o.Cc: the matrix's real size; cells past it are drawn as an empty dashed area.
     o.hl: [[kind, ...]] highlights: ['row', r, fill], ['col', c, fill], ['cell', r, c, fill], ['rect', r0, c0, r1, c1, fill]
     (global coordinates). o.crates: [[r, c0, colour]] capsules over 8 neighbouring values. o.zero: [[r0, c0, r1, c1]]
     areas holding zeros. o.empty: true for a tray with nothing in it yet. o.fillMask: a function (lr, lc) -> fill
     for trays that fill cell by cell. */
  function win(id, x, y, rows, cols, s, o = {}) {
    const out = [];
    const r0 = o.r0 || 0, c0 = o.c0 || 0;
    const Rn = o.R === undefined ? Infinity : o.R, Cn = o.Cc === undefined ? Infinity : o.Cc;
    const realRows = Math.max(0, Math.min(rows, Rn - r0)), realCols = Math.max(0, Math.min(cols, Cn - c0));
    const base = o.base || P.aFill;
    if (o.frame) out.push(R(id + ':frame', x - 9, y - 9, cols * s + 18, rows * s + 18, { rx: 10, fill: o.frame, stroke: o.frameStroke || 'none', sw: 1, z: 0 }));
    if (o.empty) {
      out.push(R(id + ':bg', x, y, cols * s, rows * s, { pat: pat(s, o.emptyFill || '#f3f7f5', 1.2, 1.3), z: 1 }));
    } else if (realRows > 0 && realCols > 0) {
      out.push(R(id + ':bg', x, y, realCols * s, realRows * s, { pat: pat(s, base), z: 1 }));
    }
    if (!o.empty && (realRows < rows || realCols < cols)) {
      // the part of the window past the end of the matrix
      if (realRows < rows) out.push(R(id + ':voidr', x + 0.5, y + realRows * s + 0.5, cols * s - 1, (rows - realRows) * s - 1, { rx: 3, fill: 'none', stroke: P.faint, sw: 1, dash: '3 3', z: 1 }));
      if (realCols < cols && realRows > 0) out.push(R(id + ':voidc', x + realCols * s + 0.5, y + 0.5, (cols - realCols) * s - 1, realRows * s - 1, { rx: 3, fill: 'none', stroke: P.faint, sw: 1, dash: '3 3', z: 1 }));
      if (o.voidText !== false) {
        if (realRows < rows) out.push(T(id + ':voidrt', x + cols * s / 2, y + (realRows + (rows - realRows) / 2) * s + 4, o.voidRowText || 'past the last row', { anchor: 'middle', size: 11, fill: P.mute }));
        else out.push(T(id + ':voidct', x + (realCols + (cols - realCols) / 2) * s, y + rows * s / 2 + 4, o.voidColText || 'past the end of the row', { anchor: 'middle', size: 11, fill: P.mute }));
      }
    }
    if (o.fillMask) {
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const f = o.fillMask(i, j);
        if (!f) continue;
        out.push(R(`${id}:m:${i}:${j}`, x + j * s + 0.6, y + i * s + 0.6, s - 1.2, s - 1.2, { rx: 1.3, fill: f.fill || f, z: 2, d: f.d, op: f.op }));
      }
    }
    for (const z of o.zero || []) {
      const [zr0, zc0, zr1, zc1] = z;
      const lr0 = zr0 - r0, lc0 = zc0 - c0, nr = zr1 - zr0 + 1, nc = zc1 - zc0 + 1;
      out.push(R(`${id}:zero:${zr0}:${zc0}`, x + lc0 * s, y + lr0 * s, nc * s, nr * s, { pat: pat(s, P.zero), z: 2, d: o.zeroD }));
      out.push(T(`${id}:zerot:${zr0}:${zc0}`, x + (lc0 + nc / 2) * s, y + (lr0 + nr / 2) * s + 4, 'zeros', { anchor: 'middle', size: 11, fill: P.zeroInk, d: o.zeroD }));
    }
    for (const h of o.hl || []) {
      const kind = h[0];
      if (kind === 'row') {
        const lr = h[1] - r0; if (lr < 0 || lr >= rows) continue;
        const n = h[3] === undefined ? realCols : h[3];
        out.push(R(`${id}:hr:${h[1]}`, x, y + lr * s, n * s, s, { pat: pat(s, h[2] || P.aMid), z: 2, d: h[4] }));
      } else if (kind === 'col') {
        const lc = h[1] - c0; if (lc < 0 || lc >= cols) continue;
        const n = h[3] === undefined ? realRows : h[3];
        out.push(R(`${id}:hc:${h[1]}`, x + lc * s, y, s, n * s, { pat: pat(s, h[2] || P.aMid), z: 2, d: h[4] }));
      } else if (kind === 'cell') {
        const lr = h[1] - r0, lc = h[2] - c0; if (lr < 0 || lc < 0 || lr >= rows || lc >= cols) continue;
        out.push(R(`${id}:hx:${h[1]}:${h[2]}`, x + lc * s + 0.5, y + lr * s + 0.5, s - 1, s - 1, { rx: 1.4, fill: h[3] || P.aAcc, z: 3, d: h[4] }));
      } else if (kind === 'rect') {
        const lr0 = h[1] - r0, lc0 = h[2] - c0, nr = h[3] - h[1] + 1, nc = h[4] - h[2] + 1;
        out.push(R(`${id}:hq:${h[1]}:${h[2]}:${h[3]}:${h[4]}`, x + lc0 * s, y + lr0 * s, nc * s, nr * s, { pat: pat(s, h[5] || P.aMid), z: 2, d: h[6] }));
      } else if (kind === 'outline') {
        const lr0 = h[1] - r0, lc0 = h[2] - c0, nr = h[3] - h[1] + 1, nc = h[4] - h[2] + 1;
        out.push(R(`${id}:ho:${h[1]}:${h[2]}:${h[3]}:${h[4]}`, x + lc0 * s - 2, y + lr0 * s - 2, nc * s + 4, nr * s + 4, { rx: 4, fill: 'none', stroke: h[5] || P.ink, sw: h[6] || 1.4, dash: h[7], z: 4, d: h[8] }));
      }
    }
    for (const cr of o.crates || []) {
      const [r, cc0, col, d] = cr;
      const lr = r - r0, lc = cc0 - c0;
      out.push(R(`${id}:cr:${r}:${cc0}`, x + lc * s - 1.6, y + lr * s - 1.6, 8 * s + 3.2, s + 3.2, { rx: (s + 3.2) / 2, fill: 'none', stroke: col || P.aAcc, sw: 1.5, z: 4, d }));
    }
    // labels
    if (o.title) out.push(T(id + ':title', x, y - (o.colLabels ? 22 : 10), o.title, { size: 14, wt: 600, fill: o.titleFill || P.ink }));
    if (o.sub) out.push(T(id + ':sub', x + (o.subX || 0) + (o.titleW || 16), y - (o.colLabels ? 22 : 10), o.sub, { size: 11.5, fill: P.mute }));
    if (o.rowLabels) {
      const step = o.rowStep || 8;
      for (let i = 0; i < rows; i += step) out.push(T(`${id}:rl:${i}`, x - 6, y + i * s + s * 0.85, fmt(r0 + i), { anchor: 'end', size: 10, fill: P.mute, font: 'mono' }));
    }
    if (o.colLabels) {
      const step = o.colStep || 8;
      for (let j = 0; j < cols; j += step) out.push(T(`${id}:cl:${j}`, x + j * s, y - 6, fmt(c0 + j), { size: 10, fill: P.mute, font: 'mono' }));
    }
    return out;
  }
  CW.win = win;

  /* The centre of a cell of a window drawn by win(). */
  CW.cell = (x, y, s, r0, c0, r, c) => [x + (c - c0) * s + s / 2, y + (r - r0) * s + s / 2];

  // ------------------------------------------------------------------------------------------------ a block of threads
  /* The threads of a 32 x 32 block as dots at (x, y), spacing s. Thread (tx, ty) sits at column tx, row ty.
     o.place(tx, ty) may move each dot elsewhere (to land it on C), returning [x, y] or null to keep it.
     o.colorOf(tx, ty) -> fill. o.warps: list of warps to outline (a warp is the row ty = w).
     o.me: [tx, ty] our thread. o.delayOf(tx, ty) -> ms. */
  function block(id, x, y, s, o = {}) {
    const out = [];
    const nx = o.nx || 32, ny = o.ny || 32;
    for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
      let px = x + tx * s + s / 2, py = y + ty * s + s / 2;
      if (o.place) { const p = o.place(tx, ty); if (p) { px = p[0]; py = p[1]; } }
      const isMe = o.me && o.me[0] === tx && o.me[1] === ty;
      const fill = isMe ? P.me : (o.colorOf ? o.colorOf(tx, ty) : P.dot);
      if (fill === null) continue;
      out.push(C(`${id}:t:${tx}:${ty}`, px, py, isMe ? s * 0.36 : (o.r || s * 0.27), { fill, z: 3, d: o.delayOf ? o.delayOf(tx, ty) : 0, op: o.opOf ? o.opOf(tx, ty) : 1 }));
    }
    if (o.axis) {
      out.push(arrow(id + ':ax', x, y - 12, x + nx * s, y - 12, { stroke: P.mute, sw: 1.1, head: 5 }));
      out.push(T(id + ':axt', x, y - 19, o.axisX || 'threadIdx.x  0 → 31', { size: 11, fill: P.soft, font: 'mono' }));
      if (ny > 1) {
        out.push(arrow(id + ':ay', x - 12, y, x - 12, y + ny * s, { stroke: P.mute, sw: 1.1, head: 5 }));
        out.push(T(id + ':ayt', x - 18, y + ny * s / 2, o.axisY || 'threadIdx.y', { size: 11, fill: P.soft, font: 'mono', anchor: 'end' }));
        out.push(T(id + ':ayt2', x - 18, y + ny * s / 2 + 14, '0 ↓ 31', { size: 11, fill: P.mute, font: 'mono', anchor: 'end' }));
      }
    }
    for (const w of o.warps || []) {
      out.push(R(`${id}:w:${w}`, x - 2.5, y + w * s - 1.5, nx * s + 5, s + 3, { rx: (s + 3) / 2, fill: 'none', stroke: P.cAcc, sw: 1.4, z: 4 }));
      if (o.warpLabels !== false) out.push(T(`${id}:wl:${w}`, x + nx * s + 10, y + w * s + s * 0.8, 'warp ' + w, { size: 11, fill: P.cInk, wt: 600 }));
    }
    return out;
  }
  CW.block = block;

  // ------------------------------------------------------------------------------------------------ C cut into blocks
  /* C (M x N) cut into 32 x 32 tiles, each tile one block. bs: pixels per tile. o.xRows: true when blockIdx.x counts
     down the rows (kernel 1); false when it counts across the columns (kernels 2 to 4). o.hl: [[bx, by, fill]]. */
  function blockGrid(id, x, y, bs, M, N, o = {}) {
    const out = [];
    const tilesR = Math.ceil(M / 32), tilesC = Math.ceil(N / 32);
    const hReal = (M / 32) * bs, wReal = (N / 32) * bs;
    out.push(R(id + ':bg', x, y, wReal, hReal, { pat: pat(bs, P.cFill, 1.6, 2), z: 1 }));
    if (tilesR * bs > hReal + 0.1) {
      out.push(R(id + ':over', x, y + hReal, tilesC * bs, tilesR * bs - hReal, { fill: 'none', stroke: P.bAcc, sw: 1, dash: '3 3', z: 2, op: o.overhang ? 1 : 0 }));
      if (o.overhang) {
        out.push(T(id + ':overt', x - 10, y + hReal + 4, o.overText || 'past the end of C:', { size: 11, fill: P.bInk, anchor: 'end' }));
        out.push(T(id + ':overt2', x - 10, y + hReal + 18, o.overText2 || 'rows 1,000 to 1,023', { size: 11, fill: P.bInk, anchor: 'end' }));
      }
    }
    for (const h of o.hl || []) {
      const [bx, by, fill] = h;
      const tr = o.xRows ? bx : by, tc = o.xRows ? by : bx;
      out.push(R(`${id}:hl:${bx}:${by}`, x + tc * bs + 0.8, y + tr * bs + 0.8, bs - 1.6, bs - 1.6, { rx: 2, fill: fill || P.cAcc, z: 3 }));
    }
    if (o.labels !== false) {
      out.push(T(id + ':title', x, y - 30, o.title || 'C', { size: 14, wt: 600, fill: P.ink }));
      out.push(T(id + ':size', x + 16, y - 30, `${fmt(M)} rows × ${fmt(N)} columns`, { size: 11.5, fill: P.mute }));
      const across = o.xRows ? 'blockIdx.y' : 'blockIdx.x', down = o.xRows ? 'blockIdx.x' : 'blockIdx.y';
      out.push(T(id + ':across', x, y - 10, `${across}  0 → ${tilesC - 1}`, { size: 11, fill: P.soft, font: 'mono' }));
      out.push(T(id + ':down', x - 10, y + 12, down, { size: 11, fill: P.soft, font: 'mono', anchor: 'end' }));
      out.push(T(id + ':down2', x - 10, y + 26, `0 ↓ ${tilesR - 1}`, { size: 11, fill: P.mute, font: 'mono', anchor: 'end' }));
    }
    return out;
  }
  CW.blockGrid = blockGrid;

  // ------------------------------------------------------------------------------------------------ A, B, C to scale
  /* The job: A (M x K), B (K x N) and C (M x N) to scale, in the classic layout (B above C, A to its left). */
  function job(o = {}) {
    const { M, K, N } = CW.D;
    const u = o.u || 0.2;                       // pixels per row or column
    const cx = o.cx || 540, cy = o.cy || 285;   // C's top-left
    const gap = 16;
    const aw = K * u, ah = M * u, bw = N * u, bh = K * u, cw = N * u, chh = M * u;
    const ax = cx - gap - aw, ay = cy, bx = cx, by = cy - gap - bh;
    const out = [];
    out.push(R('job:A', ax, ay, aw, ah, { rx: 3, fill: P.aFill, stroke: P.aMid, sw: 1, z: 1 }));
    out.push(R('job:B', bx, by, bw, bh, { rx: 3, fill: P.bFill, stroke: P.bMid, sw: 1, z: 1 }));
    out.push(R('job:C', cx, cy, cw, chh, { rx: 3, fill: P.cFill, stroke: P.cMid, sw: 1, z: 1, op: o.noC ? 0 : 1 }));
    out.push(T('job:At', ax, ay - 10, 'A', { size: 15, wt: 600, fill: P.aInk }));
    out.push(T('job:As', ax + 17, ay - 10, `matA: ${fmt(M)} × ${fmt(K)}  (m × k)`, { size: 11.5, fill: P.soft, font: 'mono' }));
    out.push(T('job:Bt', bx + bw + 12, by + 16, 'B', { size: 15, wt: 600, fill: P.bInk }));
    out.push(T('job:Bs', bx + bw + 12, by + 34, `matB: ${fmt(K)} × ${fmt(N)}`, { size: 11.5, fill: P.soft, font: 'mono' }));
    out.push(T('job:Bs2', bx + bw + 12, by + 50, '(k × n)', { size: 11.5, fill: P.mute, font: 'mono' }));
    out.push(T('job:Ct', cx + cw + 12, cy + 16, 'C', { size: 15, wt: 600, fill: P.cInk, op: o.noC ? 0 : 1 }));
    out.push(T('job:Cs', cx + cw + 12, cy + 34, `matC: ${fmt(M)} × ${fmt(N)}`, { size: 11.5, fill: P.soft, font: 'mono', op: o.noC ? 0 : 1 }));
    out.push(T('job:Cs2', cx + cw + 12, cy + 50, '(m × n)', { size: 11.5, fill: P.mute, font: 'mono', op: o.noC ? 0 : 1 }));
    const th = 3.2;   // a single row or column, drawn thicker than it is
    if (o.row !== undefined) {
      out.push(R('job:row', ax, ay + o.row * u * 6 + 4, aw, th, { rx: 1.6, fill: P.aAcc, z: 3 }));
      out.push(T('job:rowt', ax, ay + o.row * u * 6 + 22, `row ${o.row} of A: ${fmt(K)} values`, { size: 11.5, fill: P.aInk }));
    }
    if (o.col !== undefined) {
      out.push(R('job:col', bx + o.col * u * 6 + 4, by, th, bh, { rx: 1.6, fill: P.bAcc, z: 3 }));
      out.push(T('job:colt', bx + o.col * u * 6 + 12, by + bh - 8, `column ${o.col} of B: ${fmt(K)} values`, { size: 11.5, fill: P.bInk }));
    }
    if (o.el) {
      const ex = cx + o.el[1] * u * 6 + 4 + th / 2, ey = cy + o.el[0] * u * 6 + 4 + th / 2;
      out.push(C('job:el', ex, ey, 5, { fill: P.me, z: 4 }));
      out.push(C('job:elr', ex, ey, 10, { fill: 'none', stroke: P.me, sw: 1.4, z: 4 }));
      out.push(T('job:elt', ex + 16, ey + 22, `C[${o.el[0]}][${o.el[1]}]`, { size: 13, wt: 600, fill: P.meInk }));
      if (o.row !== undefined) out.push(L('job:guide1', ax + aw, ay + o.row * u * 6 + 4 + th / 2, ex - 10, ey, { stroke: P.aMid, dash: '3 3' }));
      if (o.col !== undefined) out.push(L('job:guide2', bx + o.col * u * 6 + 4 + th / 2, by + bh, ex, ey - 10, { stroke: P.bMid, dash: '3 3' }));
    }
    if (o.note) out.push(T('job:note', ax, cy + chh + 28, o.note, { size: 11.5, fill: P.mute, it: true, font: 'serif' }));
    return out;
  }
  CW.job = job;

  // ------------------------------------------------------------------------------------------------ registers
  /* A thread's registers as small labelled boxes. items: [[name, value, highlight]] */
  function regs(id, x, y, items, o = {}) {
    const out = [];
    let cx = x;
    if (o.title) out.push(T(id + ':t', x, y - 8, o.title, { size: 11.5, fill: P.mute }));
    items.forEach(([name, val, hot], i) => {
      const w = Math.max(70, 22 + (name.length + String(val).length) * 7.6);
      out.push(R(`${id}:b:${i}`, cx, y, w, 26, { rx: 6, fill: hot ? P.meFill : P.panel, stroke: hot ? P.me : P.rule, sw: 1, z: 3 }));
      out.push(T(`${id}:n:${i}`, cx + 8, y + 17, name, { size: 11.5, fill: P.mute, font: 'mono', z: 4 }));
      out.push(T(`${id}:v:${i}:${val}`, cx + w - 8, y + 17, String(val), { size: 12, wt: 600, fill: hot ? P.meInk : P.ink, font: 'mono', anchor: 'end', z: 4 }));
      cx += w + 6;
    });
    return out;
  }
  CW.regs = regs;

  // ------------------------------------------------------------------------------------------------ a caption on the stage
  function note(id, x, y, text, o = {}) {
    return [T(id, x, y, text, { size: o.size || 13, fill: o.fill || P.soft, anchor: o.anchor, font: o.font || 'serif', it: o.it, wt: o.wt, d: o.d })];
  }
  CW.note = note;

  /* A pill label, for counts like "4 crates". */
  function pill(id, x, y, text, o = {}) {
    const w = 14 + text.length * (o.size || 12) * 0.6;
    const ax = o.anchor === 'middle' ? x - w / 2 : o.anchor === 'end' ? x - w : x;
    return [R(id + ':b', ax, y - 15, w, 22, { rx: 11, fill: o.fill || P.panel, stroke: o.stroke || P.rule, sw: 1, z: 4, d: o.d }),
      T(id + ':t', ax + w / 2, y, text, { anchor: 'middle', size: o.size || 12, wt: o.wt || 600, fill: o.ink || P.ink, font: o.font || 'sans', z: 5, d: o.d })];
  }
  CW.pill = pill;
})(window.CW = window.CW || {});
