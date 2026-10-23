/* app.js: the page around the stage. Kernel tabs, the notebook cell with its lines, the question for the current
   line, the reasoning that grows one numbered step at a time with the animation, the thread's values, the
   "try it" boxes, and the step controls. Lessons live in k1.js .. k4.js as CW.LESSONS[n]. */
(function (CW) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let stage, ki = 1, bi = 0, si = 0, tryVals = null;
  const memo = {};                         // remembered position per kernel
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lesson = () => CW.LESSONS[ki];
  const beat = () => lesson().beats[bi];
  const step = () => beat().steps[si];

  // ------------------------------------------------------------------------------------------------ the code
  function hlPy(line) {
    const re = /(#.*$)|("""|'''|"[^"]*"|'[^']*')|(@[\w.]+)|(\b(?:def|for|in|if|else|and|or|not|return|import|from|as|lambda|range)\b)|(\bcuda(?:\.[A-Za-z_]+)+)|(\b\d+(?:\.\d+)?\b)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(line))) {
      out += esc(line.slice(last, m.index));
      const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'd' : m[4] ? 'k' : m[5] ? 'a' : 'n';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + esc(line.slice(last));
  }

  function buildCode() {
    const L = lesson();
    const src = L.source;
    const used = new Map();
    L.beats.forEach((b, i) => b.lineNos.forEach((n) => { if (!used.has(n)) used.set(n, i); }));
    let inDoc = false;
    const html = src.map((line, i) => {
      const n = i + 1;
      let cls = 'ln';
      const trimmed = line.trim();
      const toggles = (trimmed.match(/"""/g) || []).length % 2 === 1;
      const docLine = inDoc || trimmed.startsWith('"""');
      if (toggles) inDoc = !inDoc;
      if (used.has(n)) cls += ' has';
      if (L.dim && L.dim(n, line)) cls += ' off';
      const body = docLine ? `<span class="s">${esc(line)}</span>` : hlPy(line);
      return `<div class="${cls}" data-l="${n}"${used.has(n) ? ` role="button" tabindex="-1" title="Show line ${n}"` : ''}><span class="no">${n}</span><span class="src">${body || ' '}</span></div>`;
    }).join('');
    $('#code').innerHTML = html;
    $('#file').textContent = L.file;
  }

  function paintCode() {
    const box = $('#code');
    box.querySelectorAll('.ln.on, .ln.near').forEach((e) => e.classList.remove('on', 'near'));
    const b = beat();
    let first = null;
    (step().lines || b.lineNos).forEach((n) => {
      const e = box.querySelector(`.ln[data-l="${n}"]`);
      if (!e) return;
      e.classList.add('on');
      if (!first) first = e;
    });
    (step().near || []).forEach((n) => { const e = box.querySelector(`.ln[data-l="${n}"]`); if (e) e.classList.add('near'); });
    if (first) {
      const top = first.offsetTop - box.offsetTop;
      if (top < box.scrollTop + 24 || top > box.scrollTop + box.clientHeight - 60) {
        box.scrollTo({ top: Math.max(0, top - box.clientHeight * 0.35), behavior: reduce ? 'auto' : 'smooth' });
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ the reasoning
  function paintReasoning() {
    const b = beat();
    const ln = [...new Set(b.lineNos)].sort((a, c) => a - c);
    const runs = [];
    for (const n of ln) { const last = runs[runs.length - 1]; if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]); }
    $('#lineno').textContent = b.label || (ln.length ? (ln.length === 1 ? `Line ${ln[0]}` : 'Lines ' + runs.map(([a, c]) => (a === c ? `${a}` : `${a}\u2013${c}`)).join(', ')) : 'Summing up');
    $('#q').textContent = b.q;
    $('#pos').textContent = `${bi + 1} of ${lesson().beats.length}`;
    const ol = $('#reason');
    const items = b.steps.map((s, i) => {
      const cls = ['st', s.kind || ''];
      if (i < si) cls.push('done');
      if (i === si) cls.push('now');
      if (i > si) cls.push('later');
      const label = s.kind === 'check' ? '<span class="tag">Check</span>' : s.kind === 'predict' ? '<span class="tag">Predict</span>' : s.kind === 'code' ? '<span class="tag">In code</span>' : '';
      return `<li class="${cls.join(' ')}" data-i="${i}">${label}${s.say}</li>`;
    }).join('');
    ol.innerHTML = items;
    const now = ol.querySelector('.now');
    const card = ol.closest('.reasoncard');
    if (now && card) {
      const top = now.offsetTop - card.offsetTop, bottom = top + now.offsetHeight;
      if (si === 0) card.scrollTop = 0;
      else if (bottom > card.scrollTop + card.clientHeight - 12) card.scrollTop = bottom - card.clientHeight + 12;
    }
    // the values of our thread
    const vr = step().vars || b.vars;
    const v = typeof vr === 'function' ? vr() : vr;
    const vb = $('#vals');
    if (v && Object.keys(v).length) {
      const prev = prevVars();
      vb.innerHTML = `<div class="vh">${esc(lesson().whoText)}: values after this line</div><div class="vl">` + Object.entries(v).map(([k, val]) => {
        const changed = !(k in prev) || String(prev[k]) !== String(val);
        return `<span class="v${changed ? ' chg' : ''}"><i>${esc(k)}</i><b>${esc(val)}</b></span>`;
      }).join('') + '</div>';
      vb.hidden = false;
    } else vb.hidden = true;
    // try it
    const tb = $('#tryit');
    if (b.tryit && si === b.steps.length - 1) {
      if (!tryVals || tryVals._beat !== b) { tryVals = { _beat: b }; b.tryit.fields.forEach((f) => { tryVals[f.id] = f.val; }); }
      tb.innerHTML = `<div class="th">Try it: ${esc(b.tryit.title)}</div><div class="tf">` + b.tryit.fields.map((f) =>
        `<label>${esc(f.label)} <span class="stepper"><button type="button" data-f="${f.id}" data-d="-1" aria-label="less">−</button><input id="try-${f.id}" type="number" min="${f.min}" max="${f.max}" value="${tryVals[f.id]}" data-f="${f.id}"><button type="button" data-f="${f.id}" data-d="1" aria-label="more">+</button></span></label>`).join('') +
        `</div><div class="to" id="tryout"></div>`;
      tb.hidden = false;
      paintTry(false);
    } else { tb.hidden = true; tb.innerHTML = ''; }
  }

  function prevVars() {
    const L = lesson();
    for (let b = bi, s = si - 1; b >= 0; b--, s = b >= 0 ? L.beats[b].steps.length - 1 : 0) {
      for (; s >= 0; s--) {
        const vr = L.beats[b].steps[s].vars || L.beats[b].vars;
        const v = typeof vr === 'function' ? vr() : vr;
        if (v && Object.keys(v).length) return v;
      }
    }
    return {};
  }

  function paintTry(show) {
    const b = beat();
    const out = b.tryit.out(tryVals);
    $('#tryout').innerHTML = out;
    if (show) { stage.render(b.tryit.scene(tryVals)); stage.camera(b.tryit.cam || step().cam || null, 600); }
  }

  // ------------------------------------------------------------------------------------------------ the stage
  function show(animate = true) {
    const s = step();
    stage.clearBeads();
    const nodes = s.scene ? s.scene() : [];
    stage.render(nodes);
    stage.camera(s.cam || null, animate ? 900 : 0);
    if (animate && s.beads) stage.beads(s.beads());
  }

  function paintTransport() {
    const L = lesson();
    const last = bi === L.beats.length - 1 && si === beat().steps.length - 1;
    $('#back').disabled = bi === 0 && si === 0;
    $('#next').textContent = last ? (ki < 4 ? `Kernel ${ki + 1} →` : 'Done') : (si === beat().steps.length - 1 ? 'Next line →' : 'Next →');
    $('#next').disabled = last && ki === 4;
    const dots = $('#dots');
    dots.innerHTML = L.beats.map((b, i) => `<button type="button" class="${i < bi ? 'past' : i === bi ? 'cur' : ''}" title="${esc(b.q)}" aria-label="Line ${i + 1}: ${esc(b.q)}"></button>`).join('');
    $('#stepcount').textContent = `step ${si + 1} of ${beat().steps.length}`;
  }

  function paint(animate = true) {
    paintCode();
    paintReasoning();
    paintTransport();
    show(animate);
  }

  function go(b, s, animate = true) {
    const L = lesson();
    bi = Math.max(0, Math.min(L.beats.length - 1, b));
    si = Math.max(0, Math.min(L.beats[bi].steps.length - 1, s));
    memo[ki] = [bi, si];
    tryVals = null;
    paint(animate);
  }

  function next() {
    const L = lesson();
    if (si < beat().steps.length - 1) go(bi, si + 1);
    else if (bi < L.beats.length - 1) go(bi + 1, 0);
    else if (ki < 4) openKernel(ki + 1, true);
  }
  function back() {
    if (si > 0) go(bi, si - 1);
    else if (bi > 0) go(bi - 1, lesson().beats[bi - 1].steps.length - 1);
  }
  function replay() {
    // show the previous step at once, then this one with its motion
    const L = lesson();
    let pb = bi, ps = si - 1;
    if (ps < 0) { pb = bi - 1; ps = pb >= 0 ? L.beats[pb].steps.length - 1 : -1; }
    stage.clearBeads();
    if (pb >= 0) {
      stage.svg.classList.add('still');
      stage.render(L.beats[pb].steps[ps].scene ? L.beats[pb].steps[ps].scene() : []);
      stage.camera(L.beats[pb].steps[ps].cam || null, 0);
      stage.svg.getBoundingClientRect();
      CW.nextFrame(() => { if (!stage.reduce) stage.svg.classList.remove('still'); CW.nextFrame(() => show(true)); });
    } else { stage.render([]); CW.nextFrame(() => show(true)); }
  }

  function openKernel(n, fromStart) {
    ki = n;
    document.querySelectorAll('#ktabs button').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.k === n)));
    try { history.replaceState(null, '', '#k' + n); } catch (e) { /* the frame may refuse */ }
    buildCode();
    const [b, s] = fromStart ? [0, 0] : (memo[n] || [0, 0]);
    stage.svg.classList.add('still');
    stage.render([]);
    CW.nextFrame(() => { if (!stage.reduce) stage.svg.classList.remove('still'); go(b, s); });
    document.title = `${lesson().tab} Code Walk`;
  }

  // ------------------------------------------------------------------------------------------------ wiring
  function init() {
    stage = new CW.Stage($('#stage'));
    CW.stage = stage;
    // resolve each beat's lines from code snippets
    for (const k of [1, 2, 3, 4]) {
      const L = CW.LESSONS[k];
      if (!L) continue;
      L.source = CW.DATA.kernels[k].source;
      const find = (snip, nth = 1) => {
        let seen = 0;
        for (let i = 0; i < L.source.length; i++) if (L.source[i].includes(snip) && ++seen === nth) return i + 1;
        throw new Error(`kernel ${k}: no line contains "${snip}"`);
      };
      L.find = find;
      const resolve = (list) => {
        const out = [];
        for (const x of list || []) {
          if (typeof x === 'number') out.push(x);
          else if (Array.isArray(x)) { const n0 = find(x[0], x[1] || 1); for (let j = 0; j <= (x[2] || 0); j++) out.push(n0 + j); }
          else out.push(find(x));
        }
        return out;
      };
      L.beats.forEach((b) => {
        b.lineNos = resolve(b.lines);
        b.steps.forEach((s) => { if (s.lines) s.lines = resolve(s.lines); });
      });
    }
    $('#ktabs').innerHTML = [1, 2, 3, 4].filter((k) => CW.LESSONS[k]).map((k) => `<button type="button" role="tab" data-k="${k}" aria-selected="false"><b>Kernel ${k}</b><span>${esc(CW.LESSONS[k].tabSub)}</span></button>`).join('');
    $('#ktabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) openKernel(+b.dataset.k); });
    $('#next').addEventListener('click', next);
    $('#back').addEventListener('click', back);
    $('#replay').addEventListener('click', replay);
    $('#dots').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; go([...$('#dots').children].indexOf(b), 0); });
    $('#code').addEventListener('click', (e) => {
      const ln = e.target.closest('.ln.has'); if (!ln) return;
      const n = +ln.dataset.l;
      const hits = lesson().beats.map((b, i) => (b.lineNos.includes(n) ? i : -1)).filter((i) => i >= 0);
      const after = hits.find((i) => i > bi);
      go(hits.includes(bi) && after !== undefined ? after : hits[0], 0);
    });
    $('#reason').addEventListener('click', (e) => { const li = e.target.closest('li.done, li.now'); if (li) go(bi, +li.dataset.i); });
    $('#tryit').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-f]'); if (!btn) return;
      const f = beat().tryit.fields.find((x) => x.id === btn.dataset.f);
      tryVals[f.id] = Math.max(f.min, Math.min(f.max, (+tryVals[f.id]) + (+btn.dataset.d)));
      $('#try-' + f.id).value = tryVals[f.id];
      paintTry(true);
    });
    $('#tryit').addEventListener('input', (e) => {
      const inp = e.target.closest('input[data-f]'); if (!inp) return;
      const f = beat().tryit.fields.find((x) => x.id === inp.dataset.f);
      const v = parseInt(inp.value, 10);
      if (Number.isNaN(v)) return;
      tryVals[f.id] = Math.max(f.min, Math.min(f.max, v));
      paintTry(true);
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (e.shiftKey) { if (bi < lesson().beats.length - 1) go(bi + 1, 0); } else next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) { if (bi > 0) go(bi - 1, 0); } else back();
      } else if (e.key === 'r' || e.key === 'R') replay();
      else if (['1', '2', '3', '4'].includes(e.key) && (e.altKey || e.metaKey)) openKernel(+e.key);
    });
    // hover labels on the stage
    const tip = $('#tip');
    $('#stage').addEventListener('pointermove', (e) => {
      const s = step();
      if (!s.hover) { tip.hidden = true; return; }
      const p = stage.toStage(e.clientX, e.clientY);
      const txt = s.hover(p.x, p.y);
      if (!txt) { tip.hidden = true; return; }
      const r = $('#stagebox').getBoundingClientRect();
      tip.textContent = txt; tip.hidden = false;
      tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
    });
    $('#stage').addEventListener('pointerleave', () => { tip.hidden = true; });
    const m = /^#k([1-4])$/.exec(location.hash || '');
    openKernel(m ? +m[1] : 1, true);
  }

  CW.init = init;
})(window.CW = window.CW || {});
