/* k2.js: Kernel 2, the two index lines swapped, line by line. */
(function (CW) {
  'use strict';
  const { P, n: { T, R, C, L }, win, block, blockGrid, regs, pill, span, S, fmt } = CW;
  const { M, K, N } = CW.D;
  const K2 = CW.KF[2];
  const V = (snip, key, names) => CW.V(2, snip, key, names);
  const NAMES = ['out_col', 'out_row', 'dot_product', 'i'];

  /* Kernel 1 and kernel 2 side by side: the same warps, landing as columns in one and as rows in the other. */
  function compare(o = {}) {
    const out = [];
    const s = 6, y = 150;
    const panels = [[1, 150, 'Kernel 1', 'out_row from threadIdx.x'], [2, 560, 'Kernel 2', 'out_col from threadIdx.x']];
    for (const [k, x, title, sub] of panels) {
      out.push(...win(`cmp${k}`, x, y, 32, 32, s, { base: P.cFill, rowLabels: true, colLabels: true }));
      out.push(T(`cmp${k}:t`, x, y - 34, title, { size: 15, wt: 600, fill: P.ink }));
      out.push(T(`cmp${k}:s`, x + 76, y - 34, sub, { size: 12, fill: P.mute }));
      for (let ty = 0; ty < 32; ty++) for (let tx = 0; tx < 32; tx++) {
        const [r, c] = k === 1 ? [tx, ty] : [ty, tx];
        const hot = o.warp !== undefined && ty === (k === 1 ? 8 : 3);
        out.push(C(`cmp${k}:d:${tx}:${ty}`, x + c * s + s / 2, y + r * s + s / 2, hot ? 2.2 : 1.8, { fill: hot ? P.cAcc : (ty % 2 ? P.warpB : P.warpA), z: 3 }));
      }
      const w = k === 1 ? 8 : 3;
      if (o.warp !== undefined) {
        if (k === 1) out.push(R(`cmp${k}:wo`, x + w * s - 2, y - 2, s + 4, 32 * s + 4, { rx: (s + 4) / 2, fill: 'none', stroke: P.cAcc, sw: 1.4, z: 4 }));
        else out.push(R(`cmp${k}:wo`, x - 2, y + w * s - 2, 32 * s + 4, s + 4, { rx: (s + 4) / 2, fill: 'none', stroke: P.cAcc, sw: 1.4, z: 4 }));
        out.push(T(`cmp${k}:wl`, x, y + 32 * s + 26, k === 1 ? 'warp 8 covers column 8: 32 rows' : 'warp 3 covers row 3: 32 columns', { size: 12.5, wt: 600, fill: P.cInk }));
        const me = k === 1 ? [3, 8] : [3, 8];
        out.push(C(`cmp${k}:me`, x + me[1] * s + s / 2, y + me[0] * s + s / 2, 5, { fill: 'none', stroke: P.me, sw: 1.5, z: 5 }));
        out.push(T(`cmp${k}:mel`, x, y + 32 * s + 44, k === 1 ? 'C[3][8] is thread (3, 8): lane 3 of warp 8' : 'C[3][8] is thread (8, 3): lane 8 of warp 3', { size: 12, fill: P.meInk }));
      } else {
        out.push(T(`cmp${k}:wl`, x, y + 32 * s + 26, k === 1 ? 'each stripe is a warp: columns' : 'each stripe is a warp: rows', { size: 12.5, wt: 600, fill: P.cInk }));
      }
    }
    return out;
  }

  /* What if the launch had not been swapped: x would count 32 blocks across and y only 25 down. */
  function wrongLaunch() {
    const GX = 210, GY = 92, bs = 10;
    const out = blockGrid('wl', GX, GY, bs, M, N, { xRows: false, labels: false });
    out.push(T('wl:title', GX, GY - 30, 'C', { size: 14, wt: 600, fill: P.ink }));
    out.push(T('wl:size', GX + 16, GY - 30, '1,000 rows × 800 columns', { size: 11.5, fill: P.mute }));
    // threads would cover columns 0 to 1,023 and rows 0 to 799
    out.push(R('wl:cover', GX - 1, GY - 1, 32 * bs + 2, 25 * bs + 2, { rx: 3, fill: 'none', stroke: P.aAcc, sw: 1.6, dash: '5 3', z: 4 }));
    out.push(T('wl:covt', GX + 32 * bs + 12, GY + 12, 'blocks_per_grid = (32, 25) would cover', { size: 11.5, fill: P.aInk }));
    out.push(T('wl:covt2', GX + 32 * bs + 12, GY + 28, 'columns 0 to 1,023 and rows 0 to 799', { size: 11.5, fill: P.aInk }));
    out.push(R('wl:miss', GX, GY + 25 * bs, 25 * bs, (M / 32 - 25) * bs, { pat: { cell: bs, gap: 1.6, fill: P.bMid, rx: 2 }, z: 3 }));
    out.push(T('wl:misst', GX + 25 * bs + 12, GY + 25 * bs + 24, 'rows 800 to 999: no thread ever computes them', { size: 12, wt: 600, fill: P.bInk }));
    out.push(T('wl:misst2', GX + 25 * bs + 12, GY + 25 * bs + 41, 'they stay 0.0, and the assert fails', { size: 11.5, fill: P.bInk }));
    out.push(T('wl:waste', GX + 32 * bs + 12, GY + 60, 'columns 800 to 1,023: threads with nothing to do', { size: 11.5, fill: P.mute }));
    return out;
  }

  CW.LESSONS = CW.LESSONS || {};
  CW.LESSONS[2] = {
    tab: 'Kernel 2',
    tabSub: 'lanes along a row',
    file: 'matmul-02.py',
    whoText: 'Thread (8, 3) of block (0, 0)',
    dim: (n, line) => /^(from |import )/.test(line.trim()) || /cuda\.synchronize|asnumpy/.test(line),
    beats: [
      {
        q: 'What changed from kernel 1?',
        lines: ['out_col = cuda.threadIdx.x', 'out_row = cuda.threadIdx.y'],
        steps: [
          { say: 'Kernel 2 is kernel 1 with x and y swapped in the two index lines. In kernel 1, <code>threadIdx.x</code> fed <code>out_row</code>. Here it feeds <code>out_col</code>:<span class="eq">kernel 1:  out_row = threadIdx.x + 32 × blockIdx.x\n           out_col = threadIdx.y + 32 × blockIdx.y\nkernel 2:  out_col = threadIdx.x + 32 × blockIdx.x\n           out_row = threadIdx.y + 32 × blockIdx.y</span>',
            scene: () => S.landing({ kernel: 2, phase: 'block', noC: false }) },
          { say: 'The launch is swapped to match, and everything else in the cell is the same as kernel 1: the bounds check, the loop, the store. So any difference in speed comes from these few lines.',
            lines: ['out_col = cuda.threadIdx.x', 'out_row = cuda.threadIdx.y', ['blocks_per_grid = (', 1, 3]],
            scene: () => S.landing({ kernel: 2, phase: 'block' }) },
        ],
      },
      {
        q: 'Which column of C is mine now?',
        lines: ['out_col = cuda.threadIdx.x'],
        steps: [
          { say: 'Blocks with the same <code>blockIdx.x</code> now share a band of 32 <b>columns</b>, starting at column <code>blockDim.x * blockIdx.x</code>, and <code>threadIdx.x</code> picks one column inside it.',
            scene: () => S.index({ kernel: 2, dim: 'cols', b: 1, t: null, showStart: true }) },
          { kind: 'code', say: '<span class="eq">out_col = cuda.threadIdx.x + cuda.blockDim.x * cuda.blockIdx.x\n        =   threadIdx.x  +      32       ×  blockIdx.x</span>Thread (5, 0) of block (1, 0) gets column 32 + 5 = 37.',
            scene: () => S.index({ kernel: 2, dim: 'cols', b: 1, t: 5 }) },
          { kind: 'check', say: 'Our element, C[3][8], is in column 8 of block (0, 0)’s band. So its thread has <code>threadIdx.x</code> = 8:<span class="eq">out_col = 8 + 32 × 0 = <b>8</b></span>',
            scene: () => S.index({ kernel: 2, dim: 'cols', b: 0, t: 8 }), vars: () => V('out_col = ', null, NAMES) },
        ],
        tryit: {
          title: 'any thread, any block',
          fields: [{ id: 'bx', label: 'blockIdx.x', min: 0, max: K2.grid[0] - 1, val: 1 }, { id: 'tx', label: 'threadIdx.x', min: 0, max: 31, val: 5 }],
          out: (v) => `<span class="eq">out_col = ${v.tx} + 32 × ${v.bx} = <b>${fmt(v.tx + 32 * v.bx)}</b></span>`,
          scene: (v) => S.index({ kernel: 2, dim: 'cols', b: v.bx, t: v.tx }),
        },
      },
      {
        q: 'Which row of C is mine now?',
        lines: ['out_row = cuda.threadIdx.y'],
        steps: [
          { say: 'Rows now come from y: blocks with the same <code>blockIdx.y</code> share a band of 32 rows, and <code>threadIdx.y</code> picks one.<span class="eq">out_row = cuda.threadIdx.y + cuda.blockDim.y * cuda.blockIdx.y\n        =   threadIdx.y  +      32       ×  blockIdx.y</span>',
            scene: () => S.index({ kernel: 2, dim: 'rows', b: 0, t: 3 }) },
          { kind: 'check', say: 'Row 3 in block (0, 0) needs <code>threadIdx.y</code> = 3. So C[3][8] is computed by thread <span class="me">(8, 3)</span> of block (0, 0). In kernel 1 it was thread (3, 8).',
            scene: () => S.meOnTile(3, 8, 'C[3][8]: thread (8, 3)'), vars: () => V('out_row = ', null, NAMES) },
        ],
        tryit: {
          title: 'any thread, any block',
          fields: [{ id: 'by', label: 'blockIdx.y', min: 0, max: K2.grid[1] - 1, val: 1 }, { id: 'ty', label: 'threadIdx.y', min: 0, max: 31, val: 3 }],
          out: (v) => {
            const r = v.ty + 32 * v.by;
            return `<span class="eq">out_row = ${v.ty} + 32 × ${v.by} = <b>${fmt(r)}</b></span>` + (r >= M ? `Row ${fmt(r)} is past the last row, so this thread returns at line 16.` : '');
          },
          scene: (v) => S.index({ kernel: 2, dim: 'rows', b: v.by, t: v.ty, over: v.by === K2.grid[1] - 1 }),
        },
      },
      {
        q: 'Why did the launch change too?',
        lines: [['blocks_per_grid = (', 1, 3]],
        steps: [
          { say: 'x now counts across the columns, so the x count comes from <code>n</code>, and y counts down the rows, so it comes from <code>m</code>:<span class="eq">ceil_div(n, 32) = ceil_div(800, 32)  = <b>25</b>   # x, across\nceil_div(m, 32) = ceil_div(1000, 32) = <b>32</b>   # y, down</span><code>blocks_per_grid = (25, 32)</code>: the same 800 blocks, counted the other way.',
            scene: () => S.grid({ kernel: 2, over: true, counts: true }) },
          { kind: 'predict', say: 'Before the next step: what would go wrong if we swapped the index lines but kept kernel 1’s launch, (32, 25)?',
            scene: () => S.grid({ kernel: 2, over: true }) },
          { say: 'x would run to 32 blocks, columns 0 to 1,023, and y would stop at 25 blocks, rows 0 to 799. Rows 800 to 999 of C would never get a thread: they would stay 0.0 and the assert would fail. The launch and the index lines must agree on which way x counts.',
            scene: wrongLaunch },
        ],
      },
      {
        q: 'Which threads form a warp now, and where do they land?',
        lines: ['out_col = cuda.threadIdx.x', 'out_row = cuda.threadIdx.y'],
        steps: [
          { say: 'Warps have not changed: warp w is still the 32 threads with <code>threadIdx.y</code> = w, one row of the block’s picture, numbered by <code>threadIdx.x + 32 × threadIdx.y</code>.',
            scene: () => S.landing({ kernel: 2, phase: 'warps', warp: 3 }) },
          { say: 'But now <code>threadIdx.x</code> feeds <code>out_col</code>. Warp 3’s lanes, <code>threadIdx.x</code> = 0 to 31, get columns 0 to 31, and all of them have <code>threadIdx.y</code> = 3: row 3.',
            scene: () => S.landing({ kernel: 2, phase: 'one', warp: 3 }) },
          { say: 'So a row of the picture lands as a <b>row</b> of C. In kernel 2, the 32 lanes of a warp go along one row of C, on 32 neighbouring columns.',
            scene: () => S.landing({ kernel: 2, phase: 'one', warp: 3 }) },
          { say: 'Every warp w lands on row w of its block’s tile, which is row 32 × blockIdx.y + w of C.',
            scene: () => S.landing({ kernel: 2, phase: 'all', hlWarp: 3 }) },
          { kind: 'check', say: 'C[3][8] belongs to thread (8, 3): number 8 + 32 × 3 = 104 = 3 × 32 + 8, lane 8 of warp 3. In kernel 1 the same element belonged to lane 3 of warp 8.',
            scene: () => S.landing({ kernel: 2, phase: 'all', hlWarp: 3, me: [8, 3] }) },
          { say: 'Side by side: the same warps, the same 1,024 threads, the same tile. Only which index line takes <code>threadIdx.x</code> decides whether a warp runs down a column or along a row.',
            scene: () => compare({ warp: true }) },
        ],
      },
      {
        q: 'Which threads stop at the bounds check now?',
        lines: ['if out_col >= n or out_row >= m:', 'return'],
        steps: [
          { say: 'The bottom blocks are now the ones with <code>blockIdx.y</code> = 31: rows 992 to 1,023. Their threads with <code>threadIdx.y</code> from 8 to 31 get rows 1,000 to 1,023 and return at once.',
            scene: () => S.index({ kernel: 2, dim: 'rows', b: 31, t: null, over: true, dots: true }) },
          { kind: 'check', say: 'Again 24 × 32 = 768 threads in each of 25 blocks: 19,200, the same surplus as kernel 1, now in whole warps (warps 8 to 31 of each bottom block).',
            scene: () => S.index({ kernel: 2, dim: 'rows', b: 31, t: null, over: true, dots: true }) },
        ],
      },
      {
        q: 'What does warp 3 read in one step?',
        lines: ['dot_product += matA'],
        steps: [
          { say: 'Our thread does the same work as before: row 3 of A times column 8 of B, 1,200 steps, 7,200.0 at the end. What changed is who runs beside it.',
            scene: () => S.loop({ r: 3, c: 8, i: null, val: 0 }) },
          { say: 'At step i = 0, lane j of warp 3 computes C[3][j], so it reads A[3][0] and B[0][j].',
            scene: () => S.read({ kernel: 2, show: ['lanes'] }) },
          { say: 'A[3][0] is the same value for all 32 lanes. It comes in one crate, and every lane gets a copy.',
            scene: () => S.read({ kernel: 2, show: ['lanes', 'A', 'Acr'] }), beads: () => S.readBeads(2, 'A') },
          { say: 'B[0][0] to B[0][31] are 32 neighbours: bytes 0 to 127 of B, exactly 4 crates, every byte used.',
            scene: () => S.read({ kernel: 2, show: ['lanes', 'A', 'Acr', 'B', 'Bcr'] }), beads: () => S.readBeads(2, 'B') },
          { kind: 'check', say: '1 + 4 = 5 crates, 160 bytes, for the same 32 multiply-adds. Kernel 1 needed 33 crates, 1,056 bytes: 6.6 times as many.',
            scene: () => S.read({ kernel: 2, show: ['lanes', 'A', 'Acr', 'B', 'Bcr', 'total'] }) },
        ],
      },
      {
        q: 'Then why does the docstring call matB uncoalesced?',
        lines: [2, 3, 'dot_product += matA'],
        steps: [
          { say: 'Follow one thread through time. Each step it moves one value along row 3 of A (neighbours in memory) and one value down column 8 of B (3,200 bytes apart). Seen this way, A looks friendly and B does not. That is what the docstring describes.',
            scene: () => S.loop({ r: 3, c: 8, i: 2, val: 18, walk: true }) },
          { say: 'But memory never sees one thread alone. At one step it sees the 32 requests of a warp together, and those decide the crates: one shared value of A and 32 neighbouring values from one row of B.',
            scene: () => S.read({ kernel: 2, show: ['lanes', 'A', 'Acr', 'B', 'Bcr', 'total'] }) },
          { say: 'So the docstring is about one thread over time, while coalescing is about a warp at one moment. For the warp, kernel 2 reads B perfectly and A as one shared value. A docstring that matches the warp would say:<span class="eq">load from matA -> one value shared by the warp\nload from matB -> coalesced\nstore in matC  -> coalesced</span>',
            scene: () => S.read({ kernel: 2, show: ['lanes', 'A', 'Acr', 'B', 'Bcr', 'total'] }) },
        ],
      },
      {
        q: 'Where do the answers go?',
        lines: ['matC[out_row, out_col] = dot_product'],
        steps: [
          { say: 'Warp 3 writes C[3][0] to C[3][31] with one instruction: 32 neighbours, 4 crates. The store is coalesced, as the docstring says.',
            lines: ['matC[out_row, out_col] = dot_product', 4], scene: () => S.read({ kernel: 2, show: ['store', 'Ccr'] }), vars: () => V('matC[out_row, out_col]', null, NAMES) },
        ],
      },
      {
        q: 'What did the swap buy, and what is left?',
        lines: [],
        steps: [
          { say: 'Two swapped lines, plus the matching launch, took each warp’s reads from 33 crates to 5 at every step, and its writes from 32 crates to 4.',
            scene: () => compare({}) },
          { kind: 'check', say: '<span class="muted">In the real run (book Chapter 4):</span> on two 1,024 × 1,024 matrices the book’s CUDA kernel 1 took 4,388.5 µs and kernel 2 took 350.2 µs on our H100, 12.5 times as fast.',
            scene: () => compare({}) },
          { say: 'What is left: A[3][0] is still asked for by all 800 threads of row 3, one warp in each of 25 blocks, and B[0][8] by all 1,000 threads of column 8, each in a different warp. Kernel 3 lets the threads of a block share what they fetch.',
            scene: () => compare({ warp: true }) },
        ],
      },
    ],
  };
})(window.CW = window.CW || {});
