/* kernels.js: what each kernel's lines compute, written once in JavaScript so that the pages (and the "try it"
   boxes) can work out any thread. Each function mirrors the notebook's own lines; test/check_kernels.mjs runs them
   against the CPU trace of the real code for every thread of two blocks per kernel. */
(function (CW) {
  'use strict';
  const D = CW.D = CW.DATA ? CW.DATA.dims : { M: 1000, K: 1200, N: 800 };
  const { M, K, N } = D;
  const cdiv = (a, b) => Math.floor((a + b - 1) / b);

  /* bytes from the start of each matrix (row-major, 4-byte values) */
  const addr = { A: (r, c) => 4 * (r * K + c), B: (r, c) => 4 * (r * N + c), C: (r, c) => 4 * (r * N + c) };
  /* 32-byte crates (sectors) touched by a list of [matrix, r, c] */
  function crates(list) {
    const set = new Set(list.map(([m, r, c]) => m + ':' + Math.floor(addr[m](r, c) / 32)));
    return set.size;
  }

  /* The line number of the first line of kernel k's cell that contains `snip` (or its nth such line). */
  CW.lineOf = function (k, snip, nth = 1) {
    const src = CW.DATA.kernels[k].source;
    let seen = 0;
    for (let i = 0; i < src.length; i++) if (src[i].includes(snip) && ++seen === nth) return i + 1;
    throw new Error(`kernel ${k}: no line contains "${snip}"`);
  };
  const FLOATS = new Set(['dot_product', 'product', 'b']);
  const show = (n, v) => (Array.isArray(v) ? (v.every((x) => x === v[0]) ? `${v.length} \u00d7 ${Number(v[0]).toFixed(1)}` : '[' + v.map((x) => Number(x).toFixed(1)).join(', ') + ']')
    : FLOATS.has(n) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Number(v).toLocaleString('en-US'));
  /* Our thread's values right after a line ran, from the trace of the real code. key: the loop turns, outermost
     first ([] or null for the first time the line ran). names: which variables to show, in order. */
  CW.V = function (k, snip, key, names) {
    const line = typeof snip === 'number' ? snip : CW.lineOf(k, snip);
    const want = key ? JSON.stringify(key) : null;
    const ev = CW.DATA.kernels[k].events.find((e) => e[0] === line && (want === null || JSON.stringify(e[1]) === want));
    if (!ev) throw new Error(`kernel ${k}: no trace event for line ${line} at ${want}`);
    const after = ev[2], out = {};
    for (const n of names || Object.keys(after)) if (n in after) out[n] = show(n, after[n]);
    return out;
  };

  const KF = CW.KF = {
    cdiv, addr, crates,
    1: {
      threads: [32, 32],
      grid: [cdiv(M, 32), cdiv(N, 32)],
      // out_row = threadIdx.x + blockDim.x * blockIdx.x ; out_col = threadIdx.y + blockDim.y * blockIdx.y
      elem: (bx, by, tx, ty) => ({ row: tx + 32 * bx, col: ty + 32 * by }),
      live: (e) => !(e.col >= N || e.row >= M),
    },
    2: {
      threads: [32, 32],
      grid: [cdiv(N, 32), cdiv(M, 32)],
      // out_col = threadIdx.x + blockDim.x * blockIdx.x ; out_row = threadIdx.y + blockDim.y * blockIdx.y
      elem: (bx, by, tx, ty) => ({ row: ty + 32 * by, col: tx + 32 * bx }),
      live: (e) => !(e.col >= N || e.row >= M),
    },
    3: {
      threads: [32, 32],
      grid: [cdiv(N, 32), cdiv(M, 32)],
      tiles: cdiv(K, 32),
      elem: (bx, by, tx, ty) => ({ row: ty + by * 32, col: tx + bx * 32 }),
      live: (e) => e.row < M && e.col < N,
      // chunk t: thread (tx, ty) copies A[out_row, tile_offset + tx] into tileA[ty, tx] and
      //                                  B[tile_offset + ty, out_col] into tileB[ty, tx]
      copyA: (bx, by, tx, ty, t) => {
        const row = ty + by * 32, a_col = t * 32 + tx;
        return { dst: [ty, tx], src: [row, a_col], zero: !(row < M && a_col < K) };
      },
      copyB: (bx, by, tx, ty, t) => {
        const col = tx + bx * 32, b_row = t * 32 + ty;
        return { dst: [ty, tx], src: [b_row, col], zero: !(b_row < K && col < N) };
      },
    },
    4: {
      BM: 32, BN: 32, BK: 32, TM: 8, NT: (32 * 32) / 8,
      threads: [128, 1],
      grid: [cdiv(N, 32), cdiv(M, 32)],
      tiles: cdiv(K, 32),
      // col = tid % BN ; row = (tid // BN) * TM ; block_row = blockIdx.y * BM ; block_col = blockIdx.x * BN
      own: (bx, by, tid) => {
        const col = tid % 32, row = Math.floor(tid / 32) * 8, block_row = by * 32, block_col = bx * 32;
        const cells = [];
        for (let t = 0; t < 8; t++) cells.push([block_row + row + t, block_col + col]);
        return { col, row, block_row, block_col, cells };
      },
      // for i in range(tid, BM * BK, NT): r = i // BK ; c = i % BK ; tileA[r, c] = matA[block_row + r, k0 + c]
      loadA: (bx, by, tid, k0) => {
        const out = [];
        for (let i = tid; i < 32 * 32; i += 128) {
          const r = Math.floor(i / 32), c = i % 32, gr = by * 32 + r, gc = k0 + c;
          out.push({ i, r, c, src: [gr, gc], zero: !(gc < K && gr < M) });
        }
        return out;
      },
      // for i in range(tid, BK * BN, NT): r = i // BN ; c = i % BN ; tileB[r, c] = matB[k0 + r, block_col + c]
      loadB: (bx, by, tid, k0) => {
        const out = [];
        for (let i = tid; i < 32 * 32; i += 128) {
          const r = Math.floor(i / 32), c = i % 32, gr = k0 + r, gc = bx * 32 + c;
          out.push({ i, r, c, src: [gr, gc], zero: !(gr < K && gc < N) });
        }
        return out;
      },
    },
  };
})(window.CW = window.CW || {});
