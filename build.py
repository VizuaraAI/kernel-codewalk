"""Build the Lecture 8 code walk as one self-contained HTML page.

    python3 -I build.py            -> out/lecture8_codewalk.html

Reads the traces in trace/ (made by trace_kernels.py from the notebook), keeps each kernel's source and the values of
the thread we follow, inlines the book's ET Book font, and joins web/*.js and web/style.css into web/page.html.
Nothing is fetched from the network at build time.
"""
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, 'web')
SCRIPTS = ['engine.js', 'views.js', 'kernels.js', 'scenes.js', 'k1.js', 'k2.js', 'k3.js', 'k4.js', 'app.js']
FONT_DIR = os.path.join(HERE, 'fonts')   # ET Book (MIT licence, fonts/et-book-LICENSE.txt), as in the course book
FONTS = [('et-book-roman-line-figures.woff', 400, 'normal'),
         ('et-book-display-italic-old-style-figures.woff', 400, 'italic'),
         ('et-book-bold-line-figures.woff', 700, 'normal')]


def keep_turns(trace):
    """Which loop turns of our thread to keep: the main loop's first two and last turn, and inner loops' first
    three and last turn. Everything else is dropped to keep the page small."""
    loops = {l['id']: l for l in trace['loops']}
    enclosing = {int(k): v for k, v in trace['enclosing'].items()}
    main = trace['main_loop']
    last = {}
    for e in trace['blocks']['0,0']['ours']['lines']:
        for pos, lid in enumerate(enclosing.get(e['line'], [])):
            last[lid] = max(last.get(lid, 0), e['key'][pos])

    def ok(line, key):
        for pos, lid in enumerate(enclosing.get(line, [])):
            v = key[pos]
            allowed = {0, 1, last.get(lid, 0)} if lid == main else {0, 1, 2, last.get(lid, 0)}
            if v not in allowed:
                return False
        return True
    return ok, loops


def kernel_data(k):
    t = json.load(open(os.path.join(HERE, 'trace', 'k%d.json' % k)))
    ok, loops = keep_turns(t)
    headers = {l['line'] for l in loops.values()}
    lines = t['blocks']['0,0']['ours']['lines']
    keep = [ok(e['line'], e['key']) for e in lines]
    # a `for` line's own event sits outside its loop's body: keep it when the turn it opens is kept
    for j, e in enumerate(lines):
        if e['line'] in headers:
            nxt = keep[j + 1] if j + 1 < len(lines) and lines[j + 1]['line'] not in headers else None
            prv = keep[j - 1] if j > 0 else True
            keep[j] = keep[j] and (nxt if nxt is not None else prv)
    events = []
    for e, kp in zip(lines, keep):
        if not kp:
            continue
        after = {n: v for n, v in e['after'].items() if n not in ('m', 'n', 'k')}
        events.append([e['line'], e['key'], after])
    return dict(source=t['source'], events=events, grid=t['grid'], block=t['block'], consts=t['consts'],
                checks={b: v['check'] for b, v in t['blocks'].items()}), (t['m'], t['k'], t['n'])


def fonts_css():
    css = []
    for name, wt, style in FONTS:
        path = os.path.join(FONT_DIR, name)
        if not os.path.exists(path):
            print('note: font %s not found; the page falls back to Palatino or Georgia' % name)
            continue
        b64 = base64.b64encode(open(path, 'rb').read()).decode()
        css.append("@font-face{font-family:'et-book';src:url(data:font/woff;base64,%s) format('woff');font-weight:%d;"
                   "font-style:%s;font-display:swap}" % (b64, wt, style))
    return '\n'.join(css)


def main(out_path):
    kernels, dims = {}, None
    for k in (1, 2, 3, 4):
        kernels[k], d = kernel_data(k)
        assert dims in (None, d), 'the four cells use different sizes'
        dims = d
        assert all(kernels[k]['checks'].values()), 'kernel %d: C did not match A @ B on a traced block' % k
    M, K, N = dims
    data = dict(dims=dict(M=M, K=K, N=N), kernels=kernels,
                note='Sizes as in the notebook: m = %s, k = %s, n = %s.' % ('{:,}'.format(M), '{:,}'.format(K), '{:,}'.format(N)))
    page = open(os.path.join(WEB, 'page.html')).read()
    js = []
    for name in SCRIPTS:
        p = os.path.join(WEB, name)
        if os.path.exists(p):
            js.append('/* ---- %s ---- */\n%s' % (name, open(p).read()))
    page = page.replace('/*FONTS*/', fonts_css())
    page = page.replace('/*STYLE*/', open(os.path.join(WEB, 'style.css')).read())
    page = page.replace('/*DATA*/', 'window.CW = window.CW || {}; window.CW.DATA = ' + json.dumps(data, separators=(',', ':')).replace('</', '<\\/') + ';')
    page = page.replace('/*SCRIPTS*/', '\n'.join(js).replace('</script', '<\\/script'))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        f.write(page)
    print('wrote %s: %d KB, events per kernel %s' % (out_path, len(page.encode()) // 1024,
                                                     {k: len(v['events']) for k, v in kernels.items()}))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'lecture8_codewalk.html'))
