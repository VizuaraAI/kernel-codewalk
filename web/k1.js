/* k1.js: Kernel 1, one thread for each element of C, line by line.
   A step is { say (the reasoning, HTML), scene (stage nodes), beads, cam, vars, kind: 'check' | 'predict' | 'code' }.
   A beat is one line (or a few lines) of the cell and the question it answers. */
(function (CW) {
  'use strict';
  const { P, n: { T, R, C, L }, win, block, regs, pill, S, fmt, f1 } = CW;
  const { M, K, N } = CW.D;
  const K1 = CW.KF[1];
  const s7 = 7;
  const V = (snip, key, names) => CW.V(1, snip, key, names);
  const NAMES = ['out_row', 'out_col', 'dot_product', 'i'];

  /* C's tile with a thread on every element (before we know which thread is which). */
  const threadsOnC = () => {
    const x = 368, y = 150;
    const out = win('ctile', x, y, 32, 32, s7, { base: P.cFill, title: 'C', sub: 'a 32 × 32 corner of it', titleW: 16, rowLabels: true, colLabels: true });
    for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) out.push(C(`dots:${r}:${c}`, x + c * s7 + s7 / 2, y + r * s7 + s7 / 2, 1.9, { fill: P.dot, d: (r + c) * 6 }));
    out.push(T('dots:t', x + 32 * s7 + 16, y + 110, 'one thread for', { size: 13, fill: P.soft, font: 'serif', it: true }));
    out.push(T('dots:t2', x + 32 * s7 + 16, y + 128, 'each element', { size: 13, fill: P.soft, font: 'serif', it: true }));
    return out;
  };

  /* A grid where y stops at 25 blocks (kernel 2's launch kept by mistake) is drawn in k2.js. */

  CW.LESSONS = CW.LESSONS || {};
  CW.LESSONS[1] = {
    tab: 'Kernel 1',
    tabSub: 'one thread per element',
    file: 'matmul-01.py',
    whoText: 'Thread (3, 8) of block (0, 0)',
    dim: (n, line) => /^(from |import )/.test(line.trim()) || /cuda\.synchronize|asnumpy/.test(line),
    beats: [
      {
        q: 'What does this cell compute?',
        lines: ['m = 1000', 'k = 1200', 'n = 800', 'matA = cp.ones', 'matB = cp.ones', 'matC = cp.zeros'],
        steps: [
          { say: '<span class="A">matA</span> has shape <code>(m, k)</code> = (1,000, 1,200): 1,000 rows and 1,200 columns. <span class="B">matB</span> has shape <code>(k, n)</code> = (1,200, 800).',
            scene: () => CW.job({ noC: true }) },
          { say: 'A row of A meets a column of B value by value, so the 1,200 columns of A must match the 1,200 rows of B. That shared size is <code>k</code>. The product <span class="C">C</span> has a row for each row of A and a column for each column of B: <code>(m, n)</code> = (1,000, 800). That is <code>matC</code>, filled with zeros for now.',
            scene: () => CW.job({}) },
          { say: 'One element, <span class="me">C[3][8]</span>, multiplies row 3 of A by column 8 of B, value by value, and adds up the 1,200 products.',
            scene: () => CW.job({ row: 3, col: 8, el: [3, 8] }) },
          { kind: 'check', say: 'Every value of A is 2.0 and every value of B is 3.0, so every element of C is 1,200 × 2.0 × 3.0 = 7,200.0. The <code>assert_allclose</code> at the bottom of the cell checks the result against <code>matA @ matB</code>.',
            scene: () => CW.job({ row: 3, col: 8, el: [3, 8], note: 'The row and the column are drawn thicker than they are.' }) },
        ],
      },
      {
        q: 'How many threads, and how are they grouped?',
        lines: ['threads_per_block = (32, 32)'],
        steps: [
          { say: 'C has 1,000 × 800 = 800,000 elements. Kernel 1 gives every element a thread of its own, and each thread computes just that one element.',
            scene: threadsOnC },
          { say: 'Threads are launched in blocks. <code>threads_per_block = (32, 32)</code> makes each block 32 × 32 = 1,024 threads, the most a block may hold.',
            scene: () => S.landing({ kernel: 1, phase: 'block', noC: true }) },
          { say: 'Inside its block, each thread has two numbers: <code>cuda.threadIdx.x</code> from 0 to 31 across the picture, and <code>cuda.threadIdx.y</code> from 0 to 31 down it. We write a thread as (threadIdx.x, threadIdx.y). The picture only shows how the block is numbered. Where each number lands on C is decided by the index lines, and kernels 1 and 2 decide it differently.',
            scene: () => S.landing({ kernel: 1, phase: 'block', me: [3, 8], noC: true, meLabel: true }) },
          { kind: 'check', say: 'The thread in column 3, row 8 of the picture is thread (3, 8): threadIdx.x = 3 and threadIdx.y = 8. We will follow it through the whole kernel.',
            scene: () => S.landing({ kernel: 1, phase: 'block', me: [3, 8], noC: true, meLabel: true }) },
        ],
      },
      {
        q: 'How many blocks, and which way does each count go?',
        lines: [['blocks_per_grid = (', 1, 3]],
        steps: [
          { say: 'Each block computes one 32 × 32 tile of C. Down the rows, C has 1,000 rows, and 1,000 ÷ 32 = 31.25 tiles.',
            scene: () => S.grid({ kernel: 1 }) },
          { say: 'A block cannot be split, so the cell rounds up with <code>ceil_div</code>:<span class="eq">ceil_div(1000, 32) = (1000 + 32 - 1) // 32 = 1031 // 32 = <b>32</b></span>Adding 31 before the division pushes any leftover rows into one more block.',
            scene: () => S.grid({ kernel: 1, over: true }) },
          { say: 'Across the columns, C has 800 columns, and 800 = 25 × 32:<span class="eq">ceil_div(800, 32) = (800 + 31) // 32 = 831 // 32 = <b>25</b></span>',
            scene: () => S.grid({ kernel: 1, over: true, counts: true }) },
          { say: 'Each block gets two numbers of its own: <code>cuda.blockIdx.x</code> from 0 to 31 and <code>cuda.blockIdx.y</code> from 0 to 24. We write a block as (blockIdx.x, blockIdx.y), in the same order as a thread. So <code>blocks_per_grid = (32, 25)</code>: 32 × 25 = 800 blocks. Mind the order. The first number, the x count, came from <code>m</code>: in this kernel x counts down the rows of C, even though x runs across the picture of a block. The index lines must use x for rows too, and in kernel 1 they do.',
            scene: () => S.grid({ kernel: 1, over: true, counts: true }) },
          { kind: 'check', say: '800 blocks × 1,024 threads = 819,200 threads: 19,200 more than the 800,000 elements. The extra threads sit in the 24 rows past row 999 in the bottom blocks: 24 × 800 = 19,200.',
            scene: () => S.grid({ kernel: 1, over: true, counts: true }) },
        ],
      },
      {
        q: 'Which row of C is mine?',
        lines: ['out_row = cuda.threadIdx.x'],
        steps: [
          { say: 'Blocks with the same <code>blockIdx.x</code> share a band of 32 rows of C. Band 0 is rows 0 to 31, band 1 is rows 32 to 63, and so on down to band 31.',
            scene: () => S.index({ kernel: 1, dim: 'rows', b: 1, t: null }) },
          { say: 'Band 1 starts at row 32 × 1 = 32. In the code, that 32 is <code>cuda.blockDim.x</code>, the number of threads a block has along x. So the band of block <code>blockIdx.x</code> starts at row <code>blockDim.x * blockIdx.x</code>.',
            scene: () => S.index({ kernel: 1, dim: 'rows', b: 1, t: null, showStart: true }) },
          { say: 'Inside the band, <code>threadIdx.x</code> picks one of its 32 rows. Thread (5, 0) of block (1, 0) gets row 32 + 5 = 37.',
            scene: () => S.index({ kernel: 1, dim: 'rows', b: 1, t: 5 }) },
          { kind: 'code', say: 'Start of the band, plus the offset inside it:<span class="eq">out_row = cuda.threadIdx.x + cuda.blockDim.x * cuda.blockIdx.x\n        =   threadIdx.x  +      32       ×  blockIdx.x</span>',
            scene: () => S.index({ kernel: 1, dim: 'rows', b: 1, t: 5 }) },
          { kind: 'check', say: 'Our thread (3, 8) is in block (0, 0):<span class="eq">out_row = 3 + 32 × 0 = <b>3</b></span>',
            scene: () => S.index({ kernel: 1, dim: 'rows', b: 0, t: 3 }), vars: () => V('out_row = ', null, NAMES) },
        ],
        tryit: {
          title: 'any thread, any block',
          fields: [{ id: 'bx', label: 'blockIdx.x', min: 0, max: K1.grid[0] - 1, val: 1 }, { id: 'tx', label: 'threadIdx.x', min: 0, max: 31, val: 5 }],
          out: (v) => {
            const r = v.tx + 32 * v.bx;
            return `<span class="eq">out_row = ${v.tx} + 32 × ${v.bx} = <b>${fmt(r)}</b></span>` + (r >= M ? `Row ${fmt(r)} is past the last row of C (row ${fmt(M - 1)}), so this thread will leave at the <code>if</code> on line 16.` : `This thread works on row ${fmt(r)} of C.`);
          },
          scene: (v) => S.index({ kernel: 1, dim: 'rows', b: v.bx, t: v.tx, over: v.bx === K1.grid[0] - 1 }),
        },
      },
      {
        q: 'Which column of C is mine?',
        lines: ['out_col = cuda.threadIdx.y'],
        steps: [
          { say: 'Columns work the same way with the other pair of numbers. Blocks with the same <code>blockIdx.y</code> share a band of 32 columns, starting at column <code>blockDim.y * blockIdx.y</code>, and <code>threadIdx.y</code> picks one column inside it.',
            scene: () => S.index({ kernel: 1, dim: 'cols', b: 1, t: null, showStart: true }) },
          { kind: 'code', say: '<span class="eq">out_col = cuda.threadIdx.y + cuda.blockDim.y * cuda.blockIdx.y\n        =   threadIdx.y  +      32       ×  blockIdx.y</span>Thread (0, 4) of block (0, 1) gets column 4 + 32 = 36.',
            scene: () => S.index({ kernel: 1, dim: 'cols', b: 1, t: 4 }) },
          { kind: 'check', say: 'For our thread (3, 8) of block (0, 0):<span class="eq">out_col = 8 + 32 × 0 = <b>8</b></span>So thread (3, 8) computes <span class="me">C[3][8]</span>. Its x number became the row and its y number became the column. So the thread drawn at column 3, row 8 of the picture computes row 3, column 8 of C: in kernel 1 the picture lies on C flipped across its diagonal.',
            scene: () => S.meOnTile(3, 8, 'C[3][8]: thread (3, 8)'), vars: () => V('out_col = ', null, NAMES) },
        ],
        tryit: {
          title: 'any thread, any block',
          fields: [{ id: 'by', label: 'blockIdx.y', min: 0, max: K1.grid[1] - 1, val: 1 }, { id: 'ty', label: 'threadIdx.y', min: 0, max: 31, val: 4 }],
          out: (v) => `<span class="eq">out_col = ${v.ty} + 32 × ${v.by} = <b>${fmt(v.ty + 32 * v.by)}</b></span>`,
          scene: (v) => S.index({ kernel: 1, dim: 'cols', b: v.by, t: v.ty }),
        },
      },
      {
        q: 'Which threads run together as a warp, and where do they land on C?',
        lines: ['out_row = cuda.threadIdx.x', 'out_col = cuda.threadIdx.y'],
        steps: [
          { say: 'The GPU numbers the threads of a block one row of the picture at a time, x changing fastest:<span class="eq">thread number = threadIdx.x + 32 × threadIdx.y</span>Row 0 of the picture is threads 0 to 31, row 1 is threads 32 to 63.',
            scene: () => S.landing({ kernel: 1, phase: 'numbers', warp: 8 }) },
          { say: 'It runs them in <b>warps</b> of 32 consecutive numbers. With 32 threads in each row of the picture, a warp is exactly one row: warp w is the 32 threads with threadIdx.y = w. Inside a warp, a thread’s place, 0 to 31, is its <b>lane</b>.',
            scene: () => S.landing({ kernel: 1, phase: 'warps', warp: 8 }) },
          { say: 'So a warp is always 32 neighbouring values of <code>threadIdx.x</code> with one value of <code>threadIdx.y</code>. Whichever of <code>out_row</code> and <code>out_col</code> takes <code>threadIdx.x</code> is the one that changes across the warp. That decides where the warp lands.',
            scene: () => S.landing({ kernel: 1, phase: 'warps', warp: 8 }) },
          { say: 'Now apply kernel 1’s index lines to warp 8. Its lanes have threadIdx.x = 0 to 31, and threadIdx.x feeds <code>out_row</code>: rows 0 to 31. All of them have threadIdx.y = 8, and threadIdx.y feeds <code>out_col</code>: column 8.',
            scene: () => S.landing({ kernel: 1, phase: 'one', warp: 8 }) },
          { say: 'So a row of the picture lands as a <b>column</b> of C. In kernel 1, the 32 lanes of a warp work down one column, on 32 different rows.',
            scene: () => S.landing({ kernel: 1, phase: 'one', warp: 8 }) },
          { say: 'Every warp does the same: warp w lands on column w of its block’s tile, which is column 32 × blockIdx.y + w of C.',
            scene: () => S.landing({ kernel: 1, phase: 'all', hlWarp: 8 }) },
          { kind: 'check', say: 'Our thread (3, 8) has number 3 + 32 × 8 = 259 = 8 × 32 + 3: lane 3 of warp 8. It sits on C[3][8], the element with index 3 in column 8.',
            scene: () => S.landing({ kernel: 1, phase: 'all', hlWarp: 8, me: [3, 8] }) },
          { kind: 'predict', say: 'Before the next step: where does warp 0 land?',
            scene: () => S.landing({ kernel: 1, phase: 'warps', warp: 0 }) },
          { say: 'Warp 0 has threadIdx.y = 0 for every lane, so <code>out_col</code> = 0, and its lanes take rows 0 to 31: column 0.',
            scene: () => S.landing({ kernel: 1, phase: 'one', warp: 0 }) },
        ],
      },
      {
        q: 'What happens to the threads past the end of C?',
        lines: ['if out_col >= n or out_row >= m:', 'return'],
        steps: [
          { say: 'The bottom blocks have blockIdx.x = 31, so their band starts at row 32 × 31 = 992 and their threads get out_row = 992 to 1,023. C stops at row 999.',
            scene: () => S.index({ kernel: 1, dim: 'rows', b: 31, t: null, over: true }) },
          { say: 'Threads with threadIdx.x from 8 to 31 land past the last row. The <code>if</code> sends them out with <code>return</code> before they read anything.',
            scene: () => S.index({ kernel: 1, dim: 'rows', b: 31, t: 8, over: true, dots: true }) },
          { kind: 'check', say: 'In each of the 25 bottom blocks, 24 × 32 = 768 threads return, and 25 × 768 = 19,200. That is exactly the surplus we counted from the launch. These are lanes 8 to 31 of every warp in those blocks. Each of the 32 warps keeps 8 working lanes and runs the whole loop for them.',
            scene: () => S.index({ kernel: 1, dim: 'rows', b: 31, t: null, over: true, dots: true }) },
          { say: '<code>out_col &gt;= n</code> never fires here, because 800 is a multiple of 32. The test still earns its place: with n = 810 the grid would need 26 blocks across, and the threads on columns 810 to 831 would need it.',
            scene: () => S.grid({ kernel: 1, over: true }) },
        ],
      },
      {
        q: 'Where does the running sum live?',
        lines: ['dot_product = float32(0.0)'],
        steps: [
          { say: 'Each thread keeps its own running sum in a <b>register</b>, a private slot next to the lane. It starts at 0.0, and no other thread can see it.',
            scene: () => [...S.meOnTile(3, 8, 'C[3][8]: thread (3, 8)'), ...regs('reg1', 640, 300, [['dot_product', '0.0', true]], { title: 'registers of thread (3, 8)' })],
            vars: () => V('dot_product = float32', null, NAMES) },
        ],
      },
      {
        q: 'What does one thread do in the loop?',
        lines: ['for i in range(k):', 'dot_product += matA'],
        steps: [
          { say: 'The loop runs <code>i</code> from 0 to 1,199. At step <code>i</code>, our thread reads A[3][i] and B[i][8], multiplies them and adds the product to <code>dot_product</code>.',
            scene: () => S.loop({ r: 3, c: 8, i: null, val: 0 }) },
          { say: 'i = 0: A[3][0] × B[0][8] = 2.0 × 3.0 = 6.0, so dot_product = 6.0.',
            scene: () => S.loop({ r: 3, c: 8, i: 0, val: 6 }), beads: () => S.loopBeads(0), vars: () => V('dot_product += ', [0], NAMES) },
          { say: 'i = 1: dot_product = 12.0. The thread walks along row 3 of A and down column 8 of B, one value of each per step.',
            scene: () => S.loop({ r: 3, c: 8, i: 1, val: 12 }), beads: () => S.loopBeads(1), vars: () => V('dot_product += ', [1], NAMES) },
          { kind: 'check', say: 'After the last step, i = 1,199, dot_product = 1,200 × 6.0 = 7,200.0.',
            scene: () => S.loop({ r: 3, c: 8, i: K - 1, val: 7200, done: true }), beads: () => S.loopBeads(K - 1), vars: () => V('dot_product += ', [K - 1], NAMES) },
        ],
      },
      {
        q: 'Where do A[3][i] and B[i][8] sit in memory?',
        lines: ['dot_product += matA'],
        steps: [
          { say: 'Memory is one long line of bytes. <code>matA</code> is stored one row after another: all of row 0, then all of row 1, and so on. This is called row-major order.',
            scene: () => S.ribbon({}) },
          { say: 'So A[r][i] is value number r × 1,200 + i, and with 4 bytes a value it starts at byte 4 × (r × 1,200 + i). A[3][0] starts at byte 14,400 and A[4][0] at byte 19,200: 4,800 bytes further on.',
            scene: () => S.ribbon({ mark: [[3, 0, 'A[3][0]'], [4, 0, 'A[4][0]']], gap: [3, 4] }) },
          { say: 'Memory hands data out in 32-byte <b>crates</b> (NVIDIA calls them sectors), each holding 8 neighbouring values. Crates start at every 32nd byte, and matA itself starts at the beginning of a crate. A[3][0] starts at byte 14,400 = 450 × 32, so A[3][0] to A[3][7] fill exactly one crate. A[3][0] and A[4][0] can never share one.',
            scene: () => S.ribbon({ mark: [[3, 0, 'A[3][0]'], [4, 0, 'A[4][0]']], gap: [3, 4], inset: [3, 0] }) },
          { say: 'B has 800 columns, so B[i][8] is value number i × 800 + 8. Going down a column of B jumps 800 × 4 = 3,200 bytes each step.',
            scene: () => S.ribbon({ mark: [[3, 0, 'A[3][0]'], [4, 0, 'A[4][0]']], gap: [3, 4], inset: [3, 0] }) },
        ],
      },
      {
        q: 'What does warp 8 read in one step?',
        lines: ['dot_product += matA'],
        steps: [
          { say: 'All 32 lanes of warp 8 run line 20 together, at the same <code>i</code>. Lane j computes C[j][8], so at i = 0 it reads A[j][0] and B[0][8].',
            scene: () => S.read({ kernel: 1, show: ['lanes'] }) },
          { say: 'The 32 values of A are A[0][0], A[1][0], …, A[31][0]: one from each of 32 rows, 4,800 bytes apart.',
            scene: () => S.read({ kernel: 1, show: ['lanes', 'A'] }), beads: () => S.readBeads(1, 'A') },
          { say: 'No two of them share a crate, so the warp’s read of A takes 32 crates. Each crate brings 32 bytes, and its lane uses 4.',
            scene: () => S.read({ kernel: 1, show: ['lanes', 'A', 'Acr'] }) },
          { say: 'B[0][8] is a single value that all 32 lanes need. It comes in one crate, and every lane gets a copy.',
            scene: () => S.read({ kernel: 1, show: ['lanes', 'A', 'Acr', 'B', 'Bcr'] }), beads: () => S.readBeads(1, 'B') },
          { kind: 'check', say: '32 + 1 = 33 crates, 33 × 32 = 1,056 bytes, for 32 multiply-adds.',
            scene: () => S.read({ kernel: 1, show: ['lanes', 'A', 'Acr', 'B', 'Bcr', 'total'] }) },
          { say: 'Now read the docstring at the top of the cell: “load from matA -> coalesced, load from matB -> uncoalesced”. For the warp it is the other way round: A is the scattered read (32 crates) and B is one shared value (1 crate). The docstring describes one thread walking through its loop. Coalescing is about the 32 lanes at one step. Kernel 2 comes back to this.',
            lines: [2, 3], scene: () => S.read({ kernel: 1, show: ['lanes', 'A', 'Acr', 'B', 'Bcr', 'total'] }) },
        ],
      },
      {
        q: 'Where does the answer go?',
        lines: ['matC[out_row, out_col] = dot_product'],
        steps: [
          { say: 'After the loop our thread writes its sum: C[3][8] = 7,200.0.',
            scene: () => [...S.meOnTile(3, 8, 'C[3][8] = 7,200.0')], vars: () => V('matC[out_row, out_col]', null, NAMES) },
          { say: 'Warp 8 writes C[0][8] to C[31][8] with one instruction: 32 values, 3,200 bytes apart, so 32 crates. Here the docstring’s “store in matC -> uncoalesced” is right.',
            lines: ['matC[out_row, out_col] = dot_product', 4], scene: () => S.read({ kernel: 1, show: ['store', 'Ccr'] }) },
        ],
      },
      {
        q: 'What did kernel 1 cost, and what comes next?',
        lines: [],
        steps: [
          { say: 'Kernel 1 does the right arithmetic, but at every step each warp asks memory for 33 crates in order to do 32 multiply-adds, and it writes C in 32 crates per warp.',
            scene: () => S.read({ kernel: 1, show: ['lanes', 'A', 'Acr', 'B', 'Bcr', 'total'] }) },
          { kind: 'check', say: '<span class="muted">In the real run (book Chapter 4):</span> the book’s CUDA version of this kernel, on two 1,024 × 1,024 matrices, took 4,388.5 µs on our H100, 1.3% of cuBLAS’s speed.',
            scene: () => S.read({ kernel: 1, show: ['lanes', 'A', 'Acr', 'B', 'Bcr', 'total'] }) },
          { say: 'The question for kernel 2: what if the 32 lanes of a warp went along a row of C instead of down a column?',
            scene: () => S.landing({ kernel: 1, phase: 'all', hlWarp: 8 }) },
        ],
      },
    ],
  };
})(window.CW = window.CW || {});
