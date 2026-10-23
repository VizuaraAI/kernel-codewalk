/* engine.js: the stage.
   A scene is a plain list of nodes, each with a stable key (k). render() compares the list with what is on screen:
   a node that stays glides to its new place and colour (CSS transitions), a new node fades in (optionally from a
   `from` position), and a node that is gone fades out. Beads are one-shot dots that travel from one point to another
   and fade when they arrive. camera() tweens the viewBox, for a gentle zoom. No libraries. */
(function (CW) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 960, H = 540;
  const LAYERS = 6;          // z = 0 (back) .. 5 (front)
  const TEXT = 1.12;         // every label a little larger than its nominal size, for laptops and projectors

  /* The next animation frame, or a short timer if frames are paused (a background tab): state never waits on paint. */
  function nextFrame(fn) {
    let done = false;
    const run = () => { if (!done) { done = true; fn(); } };
    requestAnimationFrame(run);
    setTimeout(run, 80);
  }
  CW.nextFrame = nextFrame;

  function mk(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const a in attrs) e.setAttribute(a, attrs[a]);
    return e;
  }

  class Stage {
    constructor(svg) {
      this.svg = svg;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      this.defs = mk('defs', {});
      svg.appendChild(this.defs);
      this.layers = [];
      for (let i = 0; i < LAYERS; i++) { const g = mk('g', {}); svg.appendChild(g); this.layers.push(g); }
      this.beadLayer = mk('g', {});
      svg.appendChild(this.beadLayer);
      this.live = new Map();
      this.pats = new Set();
      this.cam = { x: 0, y: 0, w: W, h: H };
      this.camAnim = 0;
      this.reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (this.reduce) svg.classList.add('still');
    }

    /* A pattern of cells (a grid of rounded squares), made once per look and shared. */
    pattern(p) {
      const id = 'p' + [p.cell, p.gap, p.fill, p.rx || 0, p.stroke || ''].join('_').replace(/[^a-z0-9_]/gi, '');
      if (!this.pats.has(id)) {
        const pat = mk('pattern', { id, width: p.cell, height: p.cell, patternUnits: 'userSpaceOnUse' });
        const r = mk('rect', { x: p.gap / 2, y: p.gap / 2, width: p.cell - p.gap, height: p.cell - p.gap, rx: p.rx || 0, fill: p.fill });
        if (p.stroke) { r.setAttribute('stroke', p.stroke); r.setAttribute('stroke-width', 0.6); }
        pat.appendChild(r);
        this.defs.appendChild(pat);
        this.pats.add(id);
      }
      return `url(#${id})`;
    }

    make(n) {
      const tag = n.t === 'group' ? 'g' : n.t;
      const e = mk(tag, {});
      e.classList.add('n');
      if (n.cls) e.classList.add(...n.cls.split(' '));
      return e;
    }

    xf(n, x, y) {
      let s = `translate(${x || 0}px, ${y || 0}px)`;
      if (n.rot) s += ` rotate(${n.rot}deg)`;
      if (n.sc && n.sc !== 1) s += ` scale(${n.sc})`;
      return s;
    }

    apply(e, n, fresh, inGroup) {
      const st = e.style;
      st.transitionDelay = (n.d || 0) + 'ms';
      if (n.dur) st.setProperty('--tm', n.dur + 'ms');
      const tf = this.xf(n, n.x, n.y);
      if (e._tf !== tf) { st.transform = tf; e._tf = tf; }
      const fill = n.pat ? this.pattern(n.pat) : (n.fill === undefined ? (n.t === 'text' ? '#1d2030' : 'none') : n.fill);
      if (n.t !== 'group' && e._fill !== fill) { st.fill = fill; e._fill = fill; }
      if (n.stroke !== undefined && e._stroke !== n.stroke) { st.stroke = n.stroke; e._stroke = n.stroke; }
      if (n.sw !== undefined && e._sw !== n.sw) { e.setAttribute('stroke-width', n.sw); e._sw = n.sw; }
      if (n.dash !== undefined && e._dash !== n.dash) { e.setAttribute('stroke-dasharray', n.dash); e._dash = n.dash; }
      const op = n.op === undefined ? 1 : n.op;
      if (!fresh || inGroup) { if (e._op !== op) { st.opacity = op; e._op = op; } }
      else e._targetOp = op;
      switch (n.t) {
        case 'rect':
          if (e._w !== n.w) { e.setAttribute('width', Math.max(0, n.w)); e._w = n.w; }
          if (e._h !== n.h) { e.setAttribute('height', Math.max(0, n.h)); e._h = n.h; }
          if (e._rx !== (n.rx || 0)) { e.setAttribute('rx', n.rx || 0); e._rx = n.rx || 0; }
          break;
        case 'circle':
          if (e._r !== n.r) { e.setAttribute('r', n.r); e._r = n.r; }
          break;
        case 'text': {
          if (e._txt !== n.text) { e.textContent = n.text; e._txt = n.text; }
          const font = n.font || 'sans';
          if (e._font !== font) { e.classList.remove('f-sans', 'f-mono', 'f-serif'); e.classList.add('f-' + font); e._font = font; }
          if (e._size !== (n.size || 12)) { e.setAttribute('font-size', ((n.size || 12) * TEXT).toFixed(2)); e._size = n.size || 12; }
          if (e._wt !== (n.wt || 400)) { e.setAttribute('font-weight', n.wt || 400); e._wt = n.wt || 400; }
          const anc = n.anchor || 'start';
          if (e._anc !== anc) { e.setAttribute('text-anchor', anc); e._anc = anc; }
          if (n.it !== undefined && e._it !== n.it) { e.setAttribute('font-style', n.it ? 'italic' : 'normal'); e._it = n.it; }
          break;
        }
        case 'path':
          if (e._d !== n.dpath) { e.setAttribute('d', n.dpath); e._d = n.dpath; }
          if (n.cap && e._cap !== n.cap) { e.setAttribute('stroke-linecap', n.cap); e._cap = n.cap; }
          break;
        case 'line':
          if (e._l !== n.x2 + ',' + n.y2) { e.setAttribute('x1', 0); e.setAttribute('y1', 0); e.setAttribute('x2', n.x2); e.setAttribute('y2', n.y2); e._l = n.x2 + ',' + n.y2; }
          break;
        case 'group': {
          const kids = n.kids || [];
          if (e.children.length !== kids.length) {
            e.replaceChildren();
            kids.forEach((c) => { const ce = this.make(c); e.appendChild(ce); this.apply(ce, c, true, true); });
          } else kids.forEach((c, i) => this.apply(e.children[i], c, false, true));
          break;
        }
        default:
          break;
      }
    }

    /* Show a scene. Nodes keep their keys from scene to scene, so what stays moves and what changes fades. */
    render(nodes) {
      const seen = new Set();
      const fresh = [];
      for (const n of nodes) {
        if (!n || !n.k) continue;
        if (seen.has(n.k)) continue;
        seen.add(n.k);
        let e = this.live.get(n.k);
        if (e && e._dying) { clearTimeout(e._dying); e._dying = 0; }
        if (!e) {
          e = this.make(n);
          const z = Math.max(0, Math.min(LAYERS - 1, n.z === undefined ? 2 : n.z));
          this.layers[z].appendChild(e);
          this.live.set(n.k, e);
          e.style.opacity = 0;
          e._op = 0;
          if (n.from) { e.style.transform = this.xf(n, n.from.x, n.from.y); e._tf = null; }
          this.apply(e, n, true);
          if (n.from) { e.style.transform = this.xf(n, n.from.x, n.from.y); e._tf = 'from'; }
          fresh.push([e, n]);
        } else {
          this.apply(e, n, false);
        }
      }
      for (const [k, e] of this.live) {
        if (seen.has(k) || e._dying) continue;
        e.style.transitionDelay = '0ms';
        e.style.opacity = 0;
        e._op = 0;
        e._dying = setTimeout(() => { e.remove(); this.live.delete(k); }, this.reduce ? 0 : 420);
      }
      if (fresh.length) {
        this.svg.getBoundingClientRect();           // commit the starting state before it changes
        void this.svg.offsetWidth;
        nextFrame(() => {
          for (const [e, n] of fresh) {
            if (e._dying) continue;
            e.style.opacity = e._targetOp;
            e._op = e._targetOp;
            if (n.from) { const tf = this.xf(n, n.x, n.y); e.style.transform = tf; e._tf = tf; }
          }
        });
      }
    }

    /* One-shot dots that travel (x0, y0) -> (x1, y1) and fade on arrival. list: [{x0, y0, x1, y1, r, fill, d, dur}] */
    beads(list) {
      if (this.reduce || !list || !list.length) return;
      const made = [];
      for (const b of list) {
        const c = mk('circle', { r: b.r || 3 });
        c.classList.add('bead');
        c.style.fill = b.fill || '#4d8fd8';
        c.style.transform = `translate(${b.x0}px, ${b.y0}px)`;
        c.style.opacity = 0;
        this.beadLayer.appendChild(c);
        made.push([c, b]);
      }
      this.svg.getBoundingClientRect();
      nextFrame(() => {
        for (const [c, b] of made) {
          const dur = b.dur || 900, d = b.d || 0;
          c.style.transition = `transform ${dur}ms cubic-bezier(.45,.05,.3,1) ${d}ms, opacity 220ms ease ${d}ms`;
          c.style.opacity = b.op || 0.95;
          c.style.transform = `translate(${b.x1}px, ${b.y1}px)`;
          setTimeout(() => { c.style.transition = 'opacity 380ms ease'; c.style.opacity = 0; }, d + dur);
          setTimeout(() => c.remove(), d + dur + 420);
        }
      });
    }

    clearBeads() { this.beadLayer.replaceChildren(); }

    /* Move the camera to a box (x, y, w, h) of the 960 x 540 stage. */
    camera(box, dur) {
      const to = box || { x: 0, y: 0, w: W, h: H };
      const from = { ...this.cam };
      cancelAnimationFrame(this.camAnim);
      const d = this.reduce ? 0 : (dur === undefined ? 900 : dur);
      const t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const step = (now) => {
        const u = d ? Math.min(1, (now - t0) / d) : 1;
        const e = ease(u);
        const c = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
        this.svg.setAttribute('viewBox', `${c.x} ${c.y} ${c.w} ${c.h}`);
        this.cam = c;
        if (u < 1) this.camAnim = requestAnimationFrame(step);
      };
      this.camAnim = requestAnimationFrame(step);
      clearTimeout(this.camEnd);
      this.camEnd = setTimeout(() => { if (this.cam.x !== to.x || this.cam.w !== to.w || this.cam.y !== to.y) { cancelAnimationFrame(this.camAnim); this.svg.setAttribute('viewBox', `${to.x} ${to.y} ${to.w} ${to.h}`); this.cam = { ...to }; } }, d + 120);
    }

    /* Map a pointer position to stage coordinates (for hover labels). */
    toStage(clientX, clientY) {
      const r = this.svg.getBoundingClientRect();
      return { x: this.cam.x + (clientX - r.left) / r.width * this.cam.w, y: this.cam.y + (clientY - r.top) / r.height * this.cam.h };
    }
  }

  CW.Stage = Stage;
  CW.W = W;
  CW.H = H;
})(window.CW = window.CW || {});
