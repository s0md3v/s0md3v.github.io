(function () {
  const shelf = document.querySelector('.shelf-sneakers');
  if (!shelf || !matchMedia('(hover: hover) and (pointer: fine) and (min-width: 601px) and (prefers-reduced-motion: no-preference)').matches) return;
  const sign = shelf.querySelector('.shop-sign .sign-card');
  const shoes = [...shelf.querySelectorAll('.thing:not(.shop-sign) .thing-picture img')];
  const FIZZ = document.currentScript.dataset.fizz;
  const NOTICED = 6, GIVE = 0.35, MOST = 14;
  const STUCK = 9, PULL = 40;
  let loading = null, state = 'free';
  const stuckDown = new Map();

  shelf.classList.add('can-lift');
  const fetchFizz = () => loading || (loading = window.Fizz ? Promise.resolve() : new Promise((done, failed) => {
    const s = document.createElement('script');
    s.src = FIZZ;
    s.onload = done;
    s.onerror = failed;
    document.head.append(s);
  }));

  for (const img of shoes) {
    img.draggable = false;
    img.addEventListener('pointerdown', e => {
      if (state === 'caught' || e.button !== 0) return;
      e.preventDefault();
      if (state === 'glued') return pull(img, e);
      fetchFizz().catch(() => {});
      const from = e.clientY;
      img.setPointerCapture(e.pointerId);
      img.classList.add('held');
      const move = ev => {
        const lift = Math.min(Math.max((from - ev.clientY) * GIVE, 0), MOST);
        img.style.translate = `0 ${-lift}px`;
        img.style.rotate = `${lift * 0.35}deg`;
        if (lift >= NOTICED && state === 'free') {
          state = 'caught';
          shelf.classList.remove('can-lift');
          end();
          fetchFizz().then(() => comes(img), () => drop(img));
        }
      };
      const end = () => {
        img.removeEventListener('pointermove', move);
        img.removeEventListener('pointerup', up);
        img.removeEventListener('pointercancel', up);
        if (img.hasPointerCapture(e.pointerId)) img.releasePointerCapture(e.pointerId);
      };
      const up = () => { end(); drop(img); };
      img.addEventListener('pointermove', move);
      img.addEventListener('pointerup', up);
      img.addEventListener('pointercancel', up);
    });
  }

  function drop(img) {
    img.classList.remove('held');
    img.style.translate = img.style.rotate = '';
  }

  function hold(img, e, move, up) {
    img.setPointerCapture(e.pointerId);
    img.classList.add('held');
    const end = () => {
      img.removeEventListener('pointermove', move);
      img.removeEventListener('pointerup', end);
      img.removeEventListener('pointercancel', end);
      if (img.hasPointerCapture(e.pointerId)) img.releasePointerCapture(e.pointerId);
      up();
    };
    img.addEventListener('pointermove', move);
    img.addEventListener('pointerup', end);
    img.addEventListener('pointercancel', end);
  }

  function pull(img, e) {
    const g = stuckDown.get(img);
    if (!g) return;
    cancelAnimationFrame(g.settling);
    const from = e.clientY;
    hold(img, e, ev => pose(img, g, STUCK * (1 - Math.exp(-Math.max(from - ev.clientY, 0) / PULL))), () => settle(img, g));
  }

  function pose(img, g, lift) {
    g.lift = lift;
    const rot = lift * 0.15, s = Math.sin((rot * Math.PI) / 180);
    img.style.translate = `0 ${(-lift).toFixed(2)}px`;
    img.style.rotate = `${rot.toFixed(2)}deg`;
    for (const t of g.strings) {
      const yt = -lift + (t.x - g.toe) * s - t.under - 1.5, yb = -2.5, len = yb - yt;
      if (len < 1.5) { t.el.setAttribute('d', ''); continue; }
      const w = Math.max(0.45, Math.min(t.wb, t.wt) * 0.55 * Math.min(1, 4 / len)), ym = (yt + yb) / 2;
      t.el.setAttribute('d', `M${f1(t.x - t.wb / 2)} ${yb} Q${f1(t.x - w / 2)} ${f1(ym)} ${f1(t.x - t.wt / 2)} ${f1(yt)}` +
        ` L${f1(t.x + t.wt / 2)} ${f1(yt)} Q${f1(t.x + w / 2)} ${f1(ym)} ${f1(t.x + t.wb / 2)} ${yb}Z`);
    }
  }

  function settle(img, g) {
    const from = g.lift, t0 = performance.now();
    const tick = now => {
      const t = (now - t0) / 1000;
      let lift = from * Math.exp(-t * 9) * Math.cos(t * 26);
      if (lift < 0) lift *= 0.2;
      if (t < 0.8) {
        pose(img, g, lift);
        g.settling = requestAnimationFrame(tick);
      } else {
        pose(img, g, 0);
        img.classList.remove('held');
        img.style.translate = img.style.rotate = '';
      }
    };
    g.settling = requestAnimationFrame(tick);
  }

  // Same curve as assets/js/lost.js.
  const TAP = [[0, 0], [0.22, 1], [0.31, -0.15], [0.38, 0], [0.47, 0.55], [0.53, -0.15], [0.6, 0]], HITS = [0.31, 0.53];
  function tap(t) {
    for (let i = 1; i < TAP.length; i++) {
      const [t0, v0] = TAP[i - 1], [t1, v1] = TAP[i];
      if (t >= t0 && t < t1) {
        const f = (t - t0) / (t1 - t0);
        return v0 + (v1 - v0) * (v1 > v0 ? 1 - (1 - f) * (1 - f) : f * f);
      }
    }
    return 0;
  }

  const NS = 'http://www.w3.org/2000/svg', rand = (a, b) => a + Math.random() * (b - a);
  const el = (name, attrs, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  };
  const f1 = n => n.toFixed(1);
  let glues = 0;

  function sole(img) {
    const w = img.naturalWidth, h = img.naturalHeight, k = img.offsetHeight / h, c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    let a;
    try { a = x.getImageData(0, 0, w, h).data; } catch (e) { return () => 0; }
    const low = new Float32Array(w);
    for (let i = 0; i < w; i++) {
      let j = h - 1;
      while (j > 0 && a[(j * w + i) * 4 + 3] < 128) j--;
      low[i] = (h - 1 - j) * k;
    }
    return px => low[Math.max(0, Math.min(w - 1, Math.round((px / img.offsetWidth) * w)))];
  }

  function glue(img, delay) {
    const pic = img.parentElement, thing = pic.closest('.thing'), id = `glue-${glues++}`;
    const W = pic.clientWidth, left = img.offsetLeft, width = img.offsetWidth;
    const style = getComputedStyle(thing);
    const heel = parseFloat(style.getPropertyValue('--heel')) || 0, toe = parseFloat(style.getPropertyValue('--toe')) || 1;
    const x0 = left + width * heel - rand(2, 7), x1 = left + width * toe + rand(2, 7);
    const svg = el('svg', { class: 'glue', viewBox: `0 -8 ${W} 40`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const grad = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: -5, x2: 0, y2: 22 }, el('defs', {}, svg));
    [[0, '--g-top'], [0.22, '--g-mid'], [0.7, '--g-mid'], [1, '--g-edge']].forEach(([o, v]) => el('stop', { offset: o, style: `stop-color: var(${v})` }, grad));

    const n = Math.max(3, Math.round((x1 - x0) / rand(10, 18))), top = [];
    for (let i = 0; i <= n; i++) top.push([x0 + ((x1 - x0) * i) / n, i === 0 || i === n ? -1.2 : -rand(2, 4.8)]);
    const mid = (a, b) => `${f1((a[0] + b[0]) / 2)} ${f1((a[1] + b[1]) / 2)}`;
    let d = `M${f1(x0)} 1.8 Q${f1(x0 - 2)} ${f1(top[0][1])} ${mid(top[0], top[1])}`;
    for (let i = 1; i < n; i++) d += ` Q${f1(top[i][0])} ${f1(top[i][1])} ${mid(top[i], top[i + 1])}`;
    d += ` Q${f1(x1 + 2)} ${f1(top[n][1])} ${f1(x1)} 1.8 Q${f1(x1)} 3.2 ${f1(x1 - 3)} 3.2 L${f1(x0 + 3)} 3.2 Q${f1(x0)} 3.2 ${f1(x0)} 1.8Z`;
    const bead = el('g', {}, svg);
    el('path', { d, fill: `url(#${id})` }, bead);
    const sx = rand(x0 + 8, x1 - 20);
    el('ellipse', { cx: f1(sx), cy: -1.6, rx: f1(rand(4, 11)), ry: 0.8, fill: 'var(--g-shine)' }, bead);

    const under = sole(img), strings = [];
    for (let tries = 0; strings.length < 3 + Math.floor(Math.random() * 3) && tries < 60; tries++) {
      const x = rand(x0 + 6, x1 - 6), u = under(x - left);
      if (u < 2.5 && strings.every(t => Math.abs(t.x - x) > 10)) strings.push({ x, under: u, wb: rand(2.5, 4.5), wt: rand(1.8, 3.2) });
    }
    for (const t of strings) t.el = el('path', { fill: `url(#${id})` }, svg);
    stuckDown.set(img, { strings, toe: left + width * 0.8, lift: 0, settling: 0 });

    const drips = [], want = [0, 1, 1, 2, 2, 2, 3][Math.floor(Math.random() * 7)];
    for (let tries = 0; drips.length < want && tries < 30; tries++) {
      const x = rand(x0 + 10, x1 - 10);
      if (drips.every(o => Math.abs(o - x) > 16)) drips.push(x);
    }
    const falls = drips.map(x => {
      const w = rand(3.5, 7), r = w * 0.5, hw = w / 2 + 2.5, nw = w * 0.28, L = Math.random() < 0.4 ? rand(6, 10) : rand(12, 22), yb = L - r;
      const g = el('g', {}, svg);
      el('path', {
        d: `M${f1(x - hw)} 0 C${f1(x - hw * 0.55)} 2 ${f1(x - nw)} ${f1(yb - r * 1.6)} ${f1(x - r)} ${f1(yb)}` +
          ` A${f1(r)} ${f1(r)} 0 0 0 ${f1(x + r)} ${f1(yb)}` +
          ` C${f1(x + nw)} ${f1(yb - r * 1.6)} ${f1(x + hw * 0.55)} 2 ${f1(x + hw)} 0Z`,
        fill: `url(#${id})`,
      }, g);
      el('circle', { cx: f1(x - r * 0.35), cy: f1(yb - r * 0.3), r: f1(r * 0.3), fill: 'var(--g-shine)' }, g);
      return g;
    });
    pic.append(svg);

    bead.style.transformBox = 'fill-box';
    bead.style.transformOrigin = '50% 100%';
    bead.animate([
      { transform: 'scale(0.06, 0.2)', opacity: 0 },
      { transform: 'scale(0.55, 1.25)', opacity: 1, offset: 0.35 },
      { transform: 'scale(0.92, 1.08)', offset: 0.7 },
      { transform: 'scale(1, 1)' },
    ], { duration: rand(550, 800), delay, easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)', fill: 'both' });
    for (const g of falls) {
      g.style.transformBox = 'fill-box';
      g.style.transformOrigin = '50% 0';
      g.animate([
        { transform: 'scale(1.4, 0)' },
        { transform: 'scale(1.15, 0.45)', offset: 0.25 },
        { transform: 'scale(1, 1)' },
      ], { duration: rand(900, 2000), delay: delay + rand(250, 700), easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'both' });
    }
  }

  async function comes(img) {
    const { SUB, NP } = Fizz;
    const R = 42;
    const canvas = document.createElement('canvas');
    const fizz = Fizz({ body: R, most: 4, root: 60, mound: 2.2 });
    const { blob, glow } = fizz;
    const eyes = fizz.eyes();
    const target = { x: 0, y: 0, present: true };
    let arm = null, dpr = 1, last = 0, acc = 0, age = 0, peek = 0, tapped = -1, glued = false, leaving = -1, done = false;

    canvas.className = 'fizz-shelf';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    fizz.mount(canvas);
    function fit() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      fizz.size(Math.round(innerWidth * dpr), Math.round(innerHeight * dpr), dpr);
    }
    fit();
    addEventListener('resize', fit);
    glow.night = !!document.querySelector('.dark-mode');
    glow.n = glow.night ? 1 : 0;
    await Promise.race([fizz.prepare(), new Promise(r => setTimeout(r, 800))]);

    function step(dt) {
      fizz.time += dt;
      age += dt;
      fizz.stir(dt);
      const card = sign.getBoundingClientRect();
      peek += ((leaving < 0 ? 1 : 0) - peek) * (1 - Math.exp(-dt * (leaving < 0 ? 5 : 3)));
      blob.x = innerWidth + R * (1.4 - 1.9 * peek);
      blob.y = card.top + card.height * 0.45;
      if (age > 0.3 && img.classList.contains('held')) drop(img);
      if (age > 0.45 && !arm) {
        arm = fizz.reach(target, { hold: [0, 0] });
        arm.wig = 0.1;
        arm.wave = 0;
      }
      if (arm && arm.state === 'attached' && tapped < 0) tapped = age + 0.25;
      const since = tapped < 0 ? -1 : age - tapped, back = 24 * tap(since);
      target.x = card.left + card.width * 0.72 + back * 0.75;
      target.y = card.top + 3 - back * 0.65;
      let rock = 0;
      for (const h of HITS) if (since > h) rock -= 5 * Math.exp(-(since - h) * 6) * Math.sin((since - h) * 24);
      sign.style.rotate = since >= 0 && since < 2 ? `${(-2 + rock).toFixed(2)}deg` : '';
      if (arm) arm.vol = glow.night ? 4200 : 1500;
      if (arm && arm.state === 'attached') {
        const [rx, ry] = fizz.at(arm.a, 5);
        arm.rest = Math.min(arm.rest, (Math.hypot(target.x - rx, target.y - ry) * 1.04) / (NP - 1));
      }
      if (tapped >= 0 && since > 0.75 && !glued) {
        glued = true;
        shelf.classList.add('glued');
        for (const s of shoes) {
          const a = s.getBoundingClientRect();
          glue(s, Math.hypot(a.left + a.width / 2 - card.left, a.bottom - card.bottom) * 0.45 + rand(0, 80));
        }
        setTimeout(() => { state = 'glued'; shelf.classList.add('can-lift'); }, 1800);
      }
      if (tapped >= 0 && since > 2.1 && leaving < 0) {
        leaving = age;
        fizz.release(true);
      }
      if (leaving >= 0 && age - leaving > 1.4) done = true;
      fizz.move(dt);
      fizz.ebb(dt);
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000 || SUB, 0.1);
      last = now;
      glow.night = !!document.querySelector('.dark-mode');
      for (acc += dt; acc >= SUB; acc -= SUB) step(SUB);
      if (done) {
        removeEventListener('resize', fit);
        canvas.remove();
        return;
      }
      if (peek > 0.02) fizz.peer(eyes, blob.x - R * 0.55, blob.y, R, -1, 0, R * 0.05, peek);
      fizz.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
