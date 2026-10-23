"""Trace the Lecture 8 kernels line by line on the CPU, from the notebook's own source.

Each CUDA thread runs the kernel's Python body as a generator: cuda.syncthreads() becomes a yield, so the threads of a
block meet at the barrier as they do on the GPU. Every array read and write is logged with its thread, source line and
loop iteration, and chosen threads also get every line they run with their local values. The page draws only what
this records, so a picture cannot disagree with the code.

    python3 -I trace_kernels.py <notebook.ipynb> <out_dir>

Writes <out_dir>/k1.json .. k4.json and prints the checks (C against A @ B on every traced block, warp counts).
"""
import ast
import json
import os
import sys
import types

import numpy as np

SECTOR = 32          # bytes in a sector (a "crate")
LINE = 128           # bytes in an L1 cache line
BANKS = 32


# ---------------------------------------------------------------------------------------------------------------- source

def kernel_cells(nb_path):
    """The four kernel cells as (display lines, source text). The %%writefile line is dropped, so line 1 is line 1 of
    matmul-0N.py, the file ncu profiled."""
    nb = json.load(open(nb_path))
    out = []
    for c in nb['cells']:
        src = ''.join(c['source'])
        if c['cell_type'] == 'code' and '@cuda.jit' in src:
            lines = src.split('\n')
            if lines and lines[0].lstrip('#').startswith('%%writefile'):
                lines = lines[1:]
            out.append(lines)
    return out


class Loops(ast.NodeTransformer):
    """`for x in it:` -> `for __itN, x in enumerate(it):`, so every frame knows each loop's iteration count, and
    `cuda.syncthreads()` -> `yield 'sync'`. Line numbers stay those of the notebook."""

    def __init__(self):
        self.n = 0
        self.loops = []                     # (id, header line, first body line, last body line, target name)

    def visit_For(self, node):
        i = self.n
        self.n += 1
        end = max(getattr(x, 'end_lineno', x.lineno) for x in node.body)
        self.loops.append((i, node.lineno, node.body[0].lineno, end, ast.unparse(node.target)))
        self.generic_visit(node)
        it = ast.Name('__it%d' % i, ast.Store())
        node.target = ast.Tuple([it, node.target], ast.Store())
        node.iter = ast.Call(ast.Name('enumerate', ast.Load()), [node.iter], [])
        return ast.fix_missing_locations(ast.copy_location(node, node))

    def visit_Expr(self, node):
        c = node.value
        if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute) and c.func.attr == 'syncthreads':
            y = ast.Expr(ast.Yield(ast.Constant('sync')))
            ast.copy_location(y, node)
            ast.copy_location(y.value, node)
            ast.copy_location(y.value.value, node)
            return y
        return node


def build(lines):
    """Parse one cell. Returns the kernel's code object, its loop table, the module constants, the launch shape and
    the line -> name map of its shared and local arrays."""
    src = '\n'.join(lines)
    tree = ast.parse(src)
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef))
    # module constants and the launch, evaluated in order with cp/np mapped to numpy (the matrices included)
    env = {'np': np, 'cp': types.SimpleNamespace(ones=np.ones, zeros=np.zeros, float32=np.float32)}
    for node in tree.body:
        if isinstance(node, ast.Assign) and node.lineno > fn.end_lineno:
            names = {n.id for n in ast.walk(node.value) if isinstance(n, ast.Name)}
            if 'cuda' in names or 'matmul' in names:
                continue
            if any(isinstance(t, ast.Name) and t.id in ('matA', 'matB', 'matC') for t in node.targets) and 'asnumpy' in ast.unparse(node.value):
                continue
        elif not (isinstance(node, ast.Assign)):
            continue
        exec(compile(ast.Module([node], []), '<cell>', 'exec'), env)
    consts = {k: v for k, v in env.items() if isinstance(v, (int, float)) and not k.startswith('_')}
    # the arrays the kernel allocates, by the line of their call
    arrays = {}
    for node in ast.walk(fn):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            f = ast.unparse(node.value.func)
            if f in ('cuda.shared.array', 'cuda.local.array'):
                arrays[node.lineno] = (node.targets[0].id, f.split('.')[1])
    fn.decorator_list = []
    tr = Loops()
    fn = tr.visit(fn)
    if not any(isinstance(n, ast.Yield) for n in ast.walk(fn)):          # kernels 1, 2: still a generator
        guard = ast.parse('if False:\n    yield None').body[0]
        for n in ast.walk(guard):
            n.lineno = n.end_lineno = fn.lineno
            n.col_offset = n.end_col_offset = 0
        fn.body.insert(0, guard)
    mod = ast.fix_missing_locations(ast.Module([fn], []))
    g = {}
    exec(compile(mod, '<kernel>', 'exec'), g)
    code = g[fn.name].__code__
    # loops enclosing each line, outermost first
    enclosing = {}
    for ln in range(1, len(lines) + 1):
        enclosing[ln] = [i for (i, h, b0, b1, _) in sorted(tr.loops, key=lambda x: x[1]) if b0 <= ln <= b1]
    params = [a.arg for a in fn.args.args]
    return dict(code=code, loops=tr.loops, enclosing=enclosing, env=env, consts=consts, arrays=arrays, params=params,
                fn_lines=(fn.lineno, fn.end_lineno))


# ---------------------------------------------------------------------------------------------------------------- arrays

class TArr:
    """A traced array: every read and write is handed to the tracer with the kernel line that made it."""
    __slots__ = ('a', 'name', 'space', 'T')

    def __init__(self, a, name, space, T):
        self.a, self.name, self.space, self.T = a, name, space, T

    def __getitem__(self, idx):
        v = self.a[idx]
        self.T.mem('R', self, idx, v)
        return v

    def __setitem__(self, idx, v):
        self.a[idx] = v
        self.T.mem('W', self, idx, self.a[idx])


class Dim3:
    __slots__ = ('x', 'y', 'z')

    def __init__(self, x, y=1, z=1):
        self.x, self.y, self.z = x, y, z


class Thread:
    __slots__ = ('tid', 'lin', 'warp', 'lane', 'gen', 'lines', 'mem', 'full', 'keep_mem', 'last_line')

    def __init__(self, tid, lin, full, keep_mem):
        self.tid, self.lin = tid, lin
        self.warp, self.lane = lin // 32, lin % 32
        self.full, self.keep_mem = full, keep_mem
        self.lines, self.mem = [], []
        self.last_line = None


def scalar(v):
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if isinstance(v, (int, np.integer)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return float(v)
    return None


class Tracer:
    def __init__(self, K, keep):
        self.K = K
        self.keep = keep
        self.cur = None

    # every read and write
    def mem(self, op, arr, idx, v):
        th = self.cur
        if not th.keep_mem:
            return
        f = sys._getframe(2)                                    # mem <- __getitem__/__setitem__ <- kernel frame
        if f.f_code is not self.K['code']:
            return
        ln = f.f_lineno
        loc = f.f_locals
        key = tuple(loc.get('__it%d' % i, -1) for i in self.K['enclosing'].get(ln, []))
        if not self.keep(th, ln, key, op, arr.name, arr.space):
            return
        if not isinstance(idx, tuple):
            idx = (idx,)
        th.mem.append((ln, key, op, arr.name, arr.space, tuple(int(i) for i in idx), float(v)))

    # every line of the threads we follow in full
    def trace(self, frame, event, arg):
        if frame.f_code is not self.K['code'] or not self.cur.full:
            return None
        frame.f_trace_lines = True
        return self.local

    def local(self, frame, event, arg):
        th = self.cur
        if event == 'line' or event == 'return':
            loc = frame.f_locals
            vals = {}
            for k, v in loc.items():
                if k.startswith('__it'):
                    continue
                s = scalar(v)
                if s is not None:
                    vals[k] = s
                elif isinstance(v, TArr) and v.space == 'local':
                    vals[k] = [float(x) for x in v.a]
            ln = frame.f_lineno
            key = tuple(loc.get('__it%d' % i, -1) for i in self.K['enclosing'].get(ln, []))
            th.lines.append((ln if event == 'line' else -1, key, vals, len(th.mem)))
        return self.local


def run_block(K, bid, A, B, C, full=(), keep=lambda *a: True):
    """Run every thread of block `bid` (bx, by) to the end, barrier by barrier. `full`: thread ids (tx, ty) followed
    line by line; `keep(thread, line, key, op, array, space)`: which reads and writes to keep."""
    env = K['env']
    bdim = env['threads_per_block']
    bdim = (bdim[0], bdim[1] if len(bdim) > 1 else 1)
    gdim = env['blocks_per_grid']
    T = Tracer(K, keep)
    for arr in (A, B, C):
        arr.T = T
    shared = {}

    class Shared:
        @staticmethod
        def array(shape, dtype):
            ln = sys._getframe(1).f_lineno
            if ln not in shared:
                shared[ln] = TArr(np.zeros(shape, np.float32), K['arrays'][ln][0], 'shared', T)
            return shared[ln]

    threads = []
    for ty in range(bdim[1]):
        for tx in range(bdim[0]):
            lin = tx + bdim[0] * ty
            th = Thread((tx, ty), lin, (tx, ty) in full, True)

            class Local:
                @staticmethod
                def array(shape, dtype, _T=T):
                    ln = sys._getframe(1).f_lineno
                    return TArr(np.zeros(shape, np.float32), K['arrays'][ln][0], 'local', _T)

            cuda = types.SimpleNamespace(threadIdx=Dim3(tx, ty), blockIdx=Dim3(*bid), blockDim=Dim3(*bdim),
                                         gridDim=Dim3(*gdim), shared=Shared, local=Local)
            g = dict(K['consts'])
            g.update(cuda=cuda, float32=np.float32, cp=env['cp'], enumerate=enumerate, range=range)
            f = types.FunctionType(K['code'], g)
            args = dict(matA=A, matB=B, matC=C, m=env['m'], n=env['n'], k=env['k'])
            th.gen = f(*[args[p] for p in K['params']])
            threads.append(th)
    alive = threads
    old = sys.gettrace()
    sys.settrace(T.trace)
    barriers = 0
    try:
        while alive:
            nxt, where = [], set()
            for th in alive:
                T.cur = th
                try:
                    next(th.gen)
                    nxt.append(th)
                    where.add(th.gen.gi_frame.f_lineno)
                except StopIteration:
                    pass
            assert len(where) <= 1, 'threads of one block wait at different barriers: %s' % where
            barriers += 1 if nxt else 0
            alive = nxt
    finally:
        sys.settrace(old)
    return threads, barriers


# ---------------------------------------------------------------------------------------------------------------- facts

def warp_steps(threads, arrays_shape, warp):
    """Group one warp's reads and writes into the instructions the warp issues: same line, same loop iterations, same
    array, same direction. For each: the lanes' indices and what the memory sees (sectors and lines for global
    arrays, banks for shared ones)."""
    groups = {}
    for th in threads:
        if th.warp != warp:
            continue
        for (ln, key, op, name, space, idx, v) in th.mem:
            groups.setdefault((ln, key, op, name, space), []).append((th.lane, idx, v))
    out = []
    for (ln, key, op, name, space), lanes in sorted(groups.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        lanes.sort()
        rec = dict(line=ln, key=list(key), op=op, arr=name, space=space, lanes=[l for l, _, _ in lanes],
                   idx=[list(i) for _, i, _ in lanes])
        if space == 'global':
            cols = arrays_shape[name][1]
            addr = sorted({(i[0] * cols + i[1]) * 4 for _, i, _ in lanes})
            rec['sectors'] = len({a // SECTOR for a in addr})
            rec['lines128'] = len({a // LINE for a in addr})
            rec['values'] = len(addr)
        elif space == 'shared':
            cols = arrays_shape.get(name, (0, 32))[1]
            words = {i[0] * cols + i[1] if len(i) == 2 else i[0] for _, i, _ in lanes}
            per_bank = {}
            for w in words:
                per_bank.setdefault(w % BANKS, set()).add(w)
            rec['words'] = len(words)
            rec['ways'] = max(len(s) for s in per_bank.values())
        out.append(rec)
    return out


def fill_map(threads, name, key0, pos=lambda ln: 0):
    """Who wrote each cell of a shared array in turn `key0` of the main loop, and from where: a list of
    [row, col, tid_lin, src, value] with src = [r, c] of the global value read on the same line, or None for a zero."""
    out = []
    for th in threads:
        last_read = {}
        for (ln, key, op, nm, space, idx, v) in th.mem:
            p = pos(ln)
            if p is None or key[p] != key0:
                continue
            if op == 'R' and space == 'global':
                last_read[(ln, key)] = idx
            if op == 'W' and nm == name:
                src = last_read.get((ln, key))
                out.append([idx[0], idx[1], th.lin, list(src) if src else None, v])
    return out


def line_events(th, keep):
    """A followed thread's lines, each with the values after it ran and the reads and writes it made. `keep(key)`
    picks which loop iterations to keep (the rest are summarised by the values at the end of each outer turn)."""
    ev = []
    L = th.lines
    for j, (ln, key, vals, m0) in enumerate(L):
        if ln < 0:
            continue
        after = L[j + 1][2] if j + 1 < len(L) else vals
        m1 = L[j + 1][3] if j + 1 < len(L) else len(th.mem)
        if not keep(ln, key):
            continue
        mem = [[op, nm, list(idx), v] for (_, _, op, nm, space, idx, v) in th.mem[m0:m1]]
        ev.append(dict(line=ln, key=list(key), before=vals, after=after, mem=mem))
    return ev


# ---------------------------------------------------------------------------------------------------------------- kernels

# Our element C[3][8], as the book follows it: which block and thread own it in each kernel (from the kernel's own
# index lines, and checked below against the store the trace records).
OWN = {1: (0, 0, 3, 8),       # out_row = threadIdx.x + ..., out_col = threadIdx.y + ...: thread (3, 8), warp 8, lane 3
       2: (0, 0, 8, 3),       # out_col = threadIdx.x + ..., out_row = threadIdx.y + ...: thread (8, 3), warp 3, lane 8
       3: (0, 0, 8, 3),       # the same index lines as kernel 2
       4: (0, 0, 8, 0)}       # tid 8: col = 8, row = 0, so it owns rows 0..7 of column 8; C[3][8] is product[3]


def tile_of(kn, K, bid):
    """The rows and columns of C that block `bid` owns, from the launch and the index lines."""
    bdim = K['env']['threads_per_block']
    if kn == 1:
        return bid[0] * bdim[0], bid[1] * bdim[1]
    if kn in (2, 3):
        return bid[1] * bdim[1], bid[0] * bdim[0]
    return bid[1] * K['consts']['BM'], bid[0] * K['consts']['BN']


def main(nb_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    cells = kernel_cells(nb_path)
    assert len(cells) == 4, 'expected 4 kernel cells, found %d' % len(cells)
    report = []
    for kn, lines in enumerate(cells, 1):
        K = build(lines)
        env = K['env']
        m, n, k = env['m'], env['n'], env['k']
        A = np.ascontiguousarray(env['matA'], np.float32)
        B = np.ascontiguousarray(env['matB'], np.float32)
        C = np.zeros((m, n), np.float32)
        tA, tB, tC = (TArr(A, 'matA', 'global', None), TArr(B, 'matB', 'global', None), TArr(C, 'matC', 'global', None))
        shapes = dict(matA=A.shape, matB=B.shape, matC=C.shape)
        has_shared = any(kind == 'shared' for _, kind in K['arrays'].values())
        for name, kind in K['arrays'].values():
            if kind == 'shared':
                shapes[name] = (32, 32)
        # the outermost loop's turns we keep in full: the first four and the last two
        turns = k if not has_shared else -(-k // 32)
        kept = {0, 1, 2, 3, turns - 2, turns - 1}
        # the main loop: the k loop (kernels 1, 2) or the chunk loop (kernels 3, 4); only its turns are thinned
        main = max(K['loops'], key=lambda l: l[3] - l[2])[0] if not has_shared else \
            min((l for l in K['loops'] if l[3] - l[2] > 5), key=lambda l: l[1])[0]

        def main_pos(ln):
            enc = K['enclosing'].get(ln, [])
            return enc.index(main) if main in enc else None

        bx, by, tx, ty = OWN[kn]
        gdim = env['blocks_per_grid']
        edge = (gdim[0] - 1, gdim[1] - 1)
        res = dict(kernel=kn, source=lines, fn_lines=list(K['fn_lines']), m=m, n=n, k=k, turns=turns,
                   kept=sorted(kept), main_loop=main,
                   consts={c: K['consts'][c] for c in K['consts'] if c in ('tile_dim', 'BM', 'BN', 'BK', 'TM', 'NT')},
                   block=list(env['threads_per_block']), grid=list(gdim),
                   loops=[dict(id=i, line=h, body=[b0, b1], var=v) for (i, h, b0, b1, v) in K['loops']],
                   enclosing={str(l): v for l, v in K['enclosing'].items() if v},
                   own=dict(block=[bx, by], thread=[tx, ty]), blocks={})
        for bid in ((bx, by), edge):
            full = ((tx, ty),) if bid == (bx, by) else ()
            bdim = env['threads_per_block']
            our_warp = (tx + bdim[0] * ty) // 32 if bid == (bx, by) else -1
            focus = {0, our_warp}

            def keep(th, ln, key, op, name, space):
                if name == 'matC':
                    return True                                  # every store, for the boundary picture
                pos = main_pos(ln)
                if pos is not None and key[pos] not in kept:
                    return False
                if th.warp in focus:
                    return True                                  # our warp and warp 0: every read and write
                return op == 'W' or space == 'global'            # the rest: what fills shared memory

            threads, barriers = run_block(K, bid, tA, tB, tC, full=full, keep=keep)
            bres = dict(barriers=barriers)
            ours = next((th for th in threads if th.full), None)
            r0, c0 = tile_of(kn, K, bid)
            r1, c1 = min(r0 + 32, m), min(c0 + 32, n)
            ref = A[r0:r1].astype(np.float64) @ B[:, c0:c1].astype(np.float64)
            ok = bool(np.allclose(C[r0:r1, c0:c1], ref, rtol=1e-5, atol=1e-5))
            bres.update(tile=[r0, c0, r1, c1], check=ok)
            report.append('kernel %d block %s: C rows %d..%d, cols %d..%d; %d barriers; C == A @ B there: %s'
                          % (kn, bid, r0, r1 - 1, c0, c1 - 1, barriers, ok))
            bres['warps'] = {str(w): warp_steps(threads, shapes, w) for w in sorted(focus) if w >= 0}
            if has_shared:
                bres['fills'] = {str(t): {nm: fill_map(threads, nm, t, main_pos)
                                          for nm, kind in K['arrays'].values() if kind == 'shared'}
                                 for t in (0, 1, turns - 1)}
            if ours:
                ev = line_events(ours, lambda ln, key: main_pos(ln) is None or key[main_pos(ln)] in kept)
                bres['ours'] = dict(thread=list(ours.tid), lin=ours.lin, warp=ours.warp, lane=ours.lane, lines=ev)
                # the values our thread holds at the end of every turn of the outer loop (for the turns not kept)
                ends = {}
                for (ln, key, vals, _) in ours.lines:
                    if ln > 0 and main_pos(ln) is not None:
                        ends[key[main_pos(ln)]] = vals
                bres['ours']['turn_ends'] = {str(t): v for t, v in sorted(ends.items())}
                stores = [mm for mm in ours.mem if mm[2] == 'W' and mm[3] == 'matC']
                report.append('  our thread %s (warp %d, lane %d) stores %s'
                              % (ours.tid, ours.warp, ours.lane,
                                 ', '.join('matC%s = %g' % (list(s_[5]), s_[6]) for s_ in stores)))
            bres['stores'] = [sum(1 for mm in th.mem if mm[2] == 'W' and mm[3] == 'matC') for th in threads]
            # every element of C each thread wrote, in thread-number order (for checking the page's index arithmetic)
            bres['store_map'] = [[list(mm[5]) for mm in th.mem if mm[2] == 'W' and mm[3] == 'matC'] for th in threads]
            res['blocks']['%d,%d' % bid] = bres
            for w, steps in bres['warps'].items():
                for st in steps:
                    if st['space'] == 'global' and (not st['key'] or st['key'][0] == 0 or st['arr'] == 'matC'):
                        report.append('  block %s warp %s line %d %s %s %s: %d values, %d sectors, %d lines'
                                      % (bid, w, st['line'], st['key'], st['op'], st['arr'], st['values'],
                                         st['sectors'], st['lines128']))
            del threads
        with open(os.path.join(out_dir, 'k%d.json' % kn), 'w') as f:
            json.dump(res, f, separators=(',', ':'))
    print('\n'.join(report))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
