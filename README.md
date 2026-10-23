# Lecture 8 code walk

Line-by-line walks through the four matrix-multiplication kernels of the Lecture 8 notebook
(`src/Lecture8_MatMul_Kernels.ipynb`, from VizuaraAI/Kernel-Engg, `lecture8/`). Each line of a kernel gets a question,
a short chain of numbered reasoning with a worked check in real numbers, and an animation that changes one thing at a
time. Students step through it with the arrow keys, or click any line of code to jump to its picture.

The page is one self-contained HTML file: `out/lecture8_codewalk.html`. It needs no server and no GPU.

- Live page: https://kernel-codewalk.vercel.app
- Source: https://github.com/VizuaraAI/kernel-codewalk

## Why it exists

Students followed Lecture 7 (book Chapter 4 and its films) but could not map the notebook's code to that story. The
notebook uses different names and sizes from the book (`tileA` for `As`, `out_row` for `row`, `product` for `sum`,
m, k, n = 1,000, 1,200, 800 instead of 1,024 square, and TM = 8 instead of 32 in kernel 4), and every line runs on
thousands of threads at once, which the code never shows. These walks show it.

## How every number is kept honest

`trace_kernels.py` runs the notebook's own kernel cells on the CPU, one thread at a time. Each thread is a Python
generator, and `cuda.syncthreads()` becomes a real barrier, so a block's threads meet exactly as they do on the GPU. The
tracer records every line each followed thread runs (with its local values) and every array read and write of the
traced blocks, then checks C against `A @ B` on those blocks. Two blocks per kernel are traced: block (0, 0) and the
bottom-right block, where the bounds checks matter.

The page then uses that record in two ways:

- The values panel ("Thread (8, 3) ...: values after this line") is read straight from the trace.
- The index arithmetic the pictures need (`web/kernels.js`) is written once in JavaScript, and
  `test/check_kernels.mjs` checks it against the trace for every thread of the traced blocks, every shared-memory cell
  of chunks 0, 1 and 37, and the crate counts the captions quote. At the time of writing: 55,872 checks, 0 failed.

## Build and check

```bash
python3 -I trace_kernels.py src/Lecture8_MatMul_Kernels.ipynb trace   # about 2 minutes; only after the notebook changes
python3 -I build.py                                                   # writes out/lecture8_codewalk.html
node test/check_kernels.mjs                                           # the page's arithmetic against the trace
node test/export_text.mjs                                             # every step's text in out/walk_text.md, for proofreading
python3 -m http.server 8796 --directory out                           # then open http://localhost:8796/lecture8_codewalk.html
```

Python needs only numpy. Node 18 or later runs the tests. Nothing is fetched at build time; the page loads DM Sans and
JetBrains Mono from Google Fonts and carries the book's ET Book font inline.

## Files

| File | What it does |
|---|---|
| `trace_kernels.py` | Runs the four kernel cells thread by thread and writes `trace/k1.json` to `trace/k4.json`. |
| `build.py` | Joins `web/*` and the trace data into one HTML file. |
| `web/engine.js` | The stage: a small keyed SVG renderer. Objects that stay glide to their new place, new ones fade in, old ones fade out; beads are dots that travel and vanish. |
| `web/views.js` | The visual vocabulary: matrix windows, thread blocks, C cut into blocks, A, B and C to scale, register boxes, labels. |
| `web/scenes.js` | Pictures that several kernels share: index bands, warps landing on C, one thread's loop, the byte ribbon, a warp's reads. |
| `web/kernels.js` | What each kernel's lines compute, mirrored from the notebook, plus the trace look-ups (`CW.V`). |
| `web/k1.js` to `web/k4.js` | The four walks: one beat per line (or few lines), one step per piece of reasoning. |
| `web/app.js`, `web/page.html`, `web/style.css` | The page around the stage: tabs, code, reasoning, values, try-it boxes, controls. |
| `test/check_kernels.mjs` | Checks `web/kernels.js` against the traces. |
| `test/export_text.mjs` | Dumps all text for review. |

## Deploying

The live page is the Vercel project `kernel-codewalk` in the Vizuara AI team. To update it, copy
`out/lecture8_codewalk.html` to `index.html` in an empty folder, run `vercel link --project kernel-codewalk` there,
delete the `.env.local` file that `vercel link` writes (it holds a token), and run `vercel deploy --prod`.

## How a walk is written

A kernel's walk (`web/kN.js`) is a list of beats. A beat names the lines it explains (by a snippet of their text, so
renumbering the notebook does not break it) and the question those lines answer. Its steps reveal the reasoning one
item at a time:

```js
{
  q: 'Which row of C is mine?',
  lines: ['out_row = cuda.threadIdx.x'],             // or ['snippet', nth, extraLines]
  steps: [
    { say: 'Blocks with the same <code>blockIdx.x</code> share a band of 32 rows ...',
      scene: () => S.index({ kernel: 1, dim: 'rows', b: 1, t: null }) },
    { kind: 'check', say: 'Our thread (3, 8) is in block (0, 0): ...',
      scene: () => S.index({ kernel: 1, dim: 'rows', b: 0, t: 3 }),
      vars: () => V('out_row = ', null, NAMES) },      // values from the trace
  ],
  tryit: { title, fields, out, scene },               // optional calculator, shown on the beat's last step
}
```

`kind` can be `check` (a worked check), `predict` (a question before the answer) or `code` (the line written out).
`beads` adds travelling dots for a step. Keep the keys of stage objects stable between steps, so that objects move
instead of popping.

To add the Part B kernels: trace their notebook cells (the tracer finds every cell with `@cuda.jit`), add their index
arithmetic to `web/kernels.js` and a check to `test/check_kernels.mjs`, write `web/k5.js` and so on, and list them in
`build.py` and in the tabs loop of `web/app.js`.

## Visual rules

White page, pastel signals, one idea at a time:

- **A:** light blue
- **B:** light pink
- **C:** light purple
- **Shared memory:** mint trays
- **Threads:** small dots
- **A warp:** a purple outline around 32 dots
- **Our own thread and element:** warm peach, the one warm colour. We follow C[3][8]: thread (3, 8) in kernel 1, (8, 3) in kernels 2 and 3, thread 8 in kernel 4.
- **A crate (a 32-byte sector):** a capsule outline over 8 neighbouring values.

The reasoning is set in ET Book, as in the book. Code is JetBrains Mono. Labels on the stage use DM Sans, because
JetBrains Mono's dotted zero reads like an 8 at small sizes.

## Writing rules

Plain sentences in the house voice: no contractions, no em dashes, numbers with thousands separators, and "value"
rather than "word" for a 4-byte number. Each step adds one thing. Name a thing after showing it. Measured numbers
from the book go in a step marked "In the real run (book Chapter 4)", never mixed into the derivation.
