/* Fizz. Nearly black by day, shy of the light, and curious. By night it glows, and it's lit as a
   light would be: what shines through it adds up along the line of sight, and it sparks where
   it's stirred, like the sea does.

   This is the animal and none of where it lives. A page makes one and gives it a canvas, runs its
   own clock, and says what it's after:

     const fizz = Fizz({ body: 50 });
     fizz.mount(canvas);
     fizz.size(canvas.width, canvas.height, dpr);
     each 1 / 120 of a second: fizz.time += dt; fizz.stir(dt); fizz.move(dt); fizz.ebb(dt);
     each frame: fizz.draw();

   An arm that goes to something and stays there is fizz.reach({ x, y, present: true }). A pair of
   eyes is fizz.eyes(), drawn with fizz.drawEyes(), on any canvas. It's the same animal on every
   page: what's different goes in as options, at the top of Fizz().

   The way its tentacles move is adapted from Venom Button by exteestudio, which draws them in
   3D with WebGL; here they're flat, on a canvas.

   MIT License. Copyright (c) 2026 exteestudio

   Permission is hereby granted, free of charge, to any person obtaining a copy of this
   software and associated documentation files (the "Software"), to deal in the Software
   without restriction, including without limitation the rights to use, copy, modify, merge,
   publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
   to whom the Software is furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all copies or
   substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
   INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
   PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
   FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
   DEALINGS IN THE SOFTWARE. */
(function () {
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const turn = a => Math.atan2(Math.sin(a), Math.cos(a));
  const bell = (x, w) => Math.exp(-((x / w) ** 2));
  // A canvas, at the size a browser gives one till it's told otherwise
  const layer = (w = 300, h = 150) => { const el = document.createElement('canvas'); el.width = w; el.height = h; return el; };

  const NP = 14, SUB = 1 / 120, ITER = 3;
  const P = { creep: 0.25, magnet: 1.6 };
  const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
  const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const INK = '180, 232, 155';
  const DARK = [17, 46, 34], THIN = [46, 132, 92];
  const shine = alpha => `rgba(232, 240, 255, ${alpha})`;
  // What it's full of. Each has its own place in the body, as a share of the way to the edge
  // and an angle, so that they stay in it however it changes shape. They're soft dots, added
  // to what's under them: a little light by day, and all the light there is by night.
  const sprite = colour => {
    const c = layer(32, 32);
    const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${colour}, 1)`);
    g.addColorStop(0.3, `rgba(${colour}, 0.55)`);
    g.addColorStop(1, `rgba(${colour}, 0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return c;
  };
  const SOFT = sprite('190, 236, 165');

  // All of these are optional, and a page only has the ones it needs.
  //   body, most, bit: how big it is, how many strands it'll have out, and how big its bits are
  //   snap: { stretch, len }, how far an arm goes before it parts. Without it, none does by itself.
  //   time, flow, probeAt, blob: how it starts
  //   aims: { kind: (s, R, dt) => [x, y] }, where the tips of a page's own kinds of strand go
  //   haul: (s, length, dt) => length, for a strand that's being pulled in
  //   bound: (r, a) => r, the last word on where its surface is, for something in the way
  //   parted: (s, base, tip), once a strand's parted. stepBit: (d, dt), how a bit gets home.
  //   lit: (c, level, r), anything else it lights at night
  //   area, under: as far as it can get, as [w, h], and how far past the bottom of that
  //   aside: how far to throw a shape that's only there for its shadow
  //   blend: how an arm's light adds to what's there. grainAt: (size, S) => [x, y], for the grain.
  function Fizz(opts = {}) {
    const BODY = opts.body || 50, MAX_STRANDS = opts.most || 14, BIT = opts.bit || 1, SNAP = opts.snap;
    const area = opts.area || (() => [canvas.width / (dpr * scale), canvas.height / (dpr * scale)]);
    const aside = opts.aside || (() => 1000), under = opts.under || 0, blend = opts.blend || 'source-over';
    let canvas = null, ctx = null, shape = null, sil = null, low = null, lo = null, spill = null, pool = null;
    let scale = 1, dpr = 1, top = 0, sinceNight = 0, lastNight = 0;

    let time = opts.time ?? rand(0, 100), flow = opts.flow ?? rand(0, 50), aware = 0, focus = null, probeAt = opts.probeAt || 0;
    const strands = [], drops = [], ripples = [], tracks = [], flashes = [];
    const blob = { x: 0, y: 0, tx: 0, ty: 0, next: 0, lean: 0, la: 0, grow: 1, size: 1, sizeV: 0, over: 0, smear: 0, take: 0, takeAt: 0, ...opts.blob };
    const glow = { x: -0.53, y: -0.85, cast: [8, 12, 4], touch: [1, 1, 1], shadow: '28, 34, 44', night: null, n: 0, stirred: 0.25 };

    // ---- The body: a wandering outline, drawn out towards whatever's got its attention ----

    function radius(a) {
      const t = time * 1.5, R = BODY * blob.grow * blob.size;
      let r = R * (1 + 0.085 * Math.sin(2 * a + t * 0.31 + 1) + 0.06 * Math.sin(3 * a - t * 0.23 + 2) +
        0.034 * Math.sin(5 * a + t * 0.41) + 0.016 * Math.sin(8 * a - t * 0.7 + 4));
      // Flung, it spreads along the way it's going, and more of it drags behind than goes ahead.
      // It's only as much of it as there was, so it's thinner for being longer.
      if (blob.smear > 0.01) {
        const c = Math.cos(a - blob.la), s = Math.sin(a - blob.la), along = 1 + blob.smear * (c > 0 ? 0.8 : 1.5), across = 1 / (1 + blob.smear * 0.75);
        r /= Math.sqrt((c * c) / (along * along) + (s * s) / (across * across));
      }
      if (blob.lean > 0.001) r += blob.lean * R * 0.3 * bell(turn(a - blob.la), 0.62);
      for (const s of strands) if (s.mound > 0.05 && s.pin === 'anchor') r += s.mound * bell(turn(a - s.a), 0.13 + 0.09 * s.elong);
      // Taking something in: the surface comes up round it and closes over
      if (blob.take > 0.5) r += blob.take * bell(turn(a - blob.takeAt), 0.58);
      for (const w of ripples) r += w.amp * 7 * Math.exp(-w.age * 4) * bell(turn(a - w.a), 0.3 + w.age);
      return opts.bound ? opts.bound(r, a) : r;
    }
    // Where a point is, from the body: nearest point on its edge, which way's out, how far off
    function edge(x, y) {
      const dx = x - blob.x, dy = y - blob.y, L = Math.hypot(dx, dy) || 1e-3, a = Math.atan2(dy, dx), r = radius(a);
      return { a, nx: dx / L, ny: dy / L, d: L - r };
    }
    const at = (a, inset = 0) => {
      const r = radius(a) - inset;
      return [blob.x + Math.cos(a) * r, blob.y + Math.sin(a) * r];
    };
    // Stirred, it lights up, and the light spreads through it from there as a wave
    function flash(x, y, amp) {
      flashes.push({ x, y, amp, age: 0 });
      if (flashes.length > 4) flashes.shift();
      glow.stirred = Math.min(glow.stirred + amp * 0.4, 1.2);
    }
    function ripple(a, amp) {
      ripples.push({ a, age: 0, amp });
      if (ripples.length > 6) ripples.shift();
    }

    // ---- Strands ----

    function sprout(kind, a) {
      const s = {
        kind, state: 'grow', pin: 'anchor', a,
        pos: new Float32Array(NP * 2), prev: new Float32Array(NP * 2), rad: new Float32Array(NP).fill(1.5),
        u: 0, ud: 0, uKick: true, rest: 1, vol: 0, stretch: 1, pinch: 0, len: 0,
        neckS: rand(0.42, 0.62), side: Math.random() < 0.5 ? -1 : 1, wig: rand(0.5, 1.2), phase: rand(0, 100),
        snapMul: SNAP ? rand(0.85, 1.15) : 1, lenMul: SNAP ? rand(0.88, 1.12) : 1, wave: 700, lat: 0, life: 0, ttl: 0,
        probe: null, mound: 0, elong: 0, dead: false, retract: 0,
      };
      const [x, y] = at(a, 5), nx = Math.cos(a), ny = Math.sin(a);
      for (let i = 0; i < NP; i++) {
        s.pos[i * 2] = s.prev[i * 2] = x + nx * i * 0.4;
        s.pos[i * 2 + 1] = s.prev[i * 2 + 1] = y + ny * i * 0.4;
      }
      return s;
    }
    // An arm, after something, which is anything with an x and a y and `present`, and it goes on
    // following it for as long as it moves. Each takes hold in its own place, close round it, and
    // works at it, `hold` being how close. Left alone it stays there, as it only lets go if it's
    // told to, or if it's been given `snap` and pulled too far.
    function reach(target, { toward = edge(target.x, target.y).a, lean = 0, vol = Math.PI * 2.5 * 2.5 * 170, hold = [2, 6] } = {}) {
      const lat = lean + rand(-0.1, 0.1), s = sprout('reach', toward + lat);
      s.lat = lat;
      s.vol = vol;
      s.target = target;
      s.hold = { r: rand(hold[0], hold[1]), a: rand(0, 6.28), spin: rand(0.7, 1.5) * (Math.random() < 0.5 ? -1 : 1), x: target.x, y: target.y };
      strands.push(s);
      return s;
    }
    // Short hairs that stand up all over the side facing what it's after, and never catch it
    function hair(target, toward) {
      if (strands.length >= MAX_STRANDS - 4) return;
      const lat = rand(-1, 1) * 1.1, s = sprout('micro', toward + lat);
      s.lat = lat;
      s.target = target;
      s.probe = { len: rand(0.5, 1.2), ph: rand(0, 6.28) };
      s.ttl = rand(0.7, 1.9);
      s.vol = Math.PI * 0.7 * 0.7 * 40;
      strands.push(s);
    }
    // Left alone: two or three thin strands curl out, glide along, and sink back
    function probe() {
      const dir = Math.random() < 0.5 ? -1 : 1, n = Math.random() < 0.5 ? 2 : 3;
      probeAt += rand(1.6, 4.7);
      for (let i = 0; i < n && strands.length < MAX_STRANDS - 2; i++) {
        const a = probeAt + (i - (n - 1) / 2) * 0.22 + rand(-0.05, 0.05), s = sprout('probe', a);
        s.probe = { dist: rand(11, 20), dir, delay: i * 0.07 };
        s.ttl = rand(0.8, 1.0);
        s.vol = Math.PI * 0.95 * 0.95 * 40;
        strands.push(s);
      }
    }

    const cum = new Float32Array(NP), tmpP = new Float32Array(NP * 2), tmpV = new Float32Array(NP * 2);
    function truncate(s, Lnew) {
      const pos = s.pos, prev = s.prev;
      cum[0] = 0;
      for (let i = 1; i < NP; i++) cum[i] = cum[i - 1] + Math.hypot(pos[i * 2] - pos[i * 2 - 2], pos[i * 2 + 1] - pos[i * 2 - 1]);
      if (cum[NP - 1] < 1e-3 || Lnew >= cum[NP - 1]) return;
      let k = 0;
      for (let j = 0; j < NP; j++) {
        const target = (Lnew * j) / (NP - 1);
        while (k < NP - 2 && cum[k + 1] < target) k++;
        const t = clamp((target - cum[k]) / Math.max(cum[k + 1] - cum[k], 1e-6), 0, 1);
        for (let c = 0; c < 2; c++) {
          tmpP[j * 2 + c] = pos[k * 2 + c] * (1 - t) + pos[(k + 1) * 2 + c] * t;
          tmpV[j * 2 + c] = prev[k * 2 + c] * (1 - t) + prev[(k + 1) * 2 + c] * t;
        }
      }
      pos.set(tmpP); prev.set(tmpV);
    }
    function resample(src, a, b) {
      const out = new Float32Array(NP * 2);
      for (let j = 0; j < NP; j++) {
        const f = a + ((b - a) * j) / (NP - 1), i0 = clamp(Math.floor(f), 0, NP - 2), t = f - i0;
        for (let c = 0; c < 2; c++) out[j * 2 + c] = src[i0 * 2 + c] * (1 - t) + src[(i0 + 1) * 2 + c] * t;
      }
      return out;
    }
    // It parts at the neck: the base whips home, the tip unwinds, and falls, and crawls back
    function split(s) {
      const k = s.neckS * (NP - 1), o = (NP - 1) * 2;
      const base = { ...s, kind: 'piece', state: 'recoil', pin: 'anchor', pinch: 0,
        pos: resample(s.pos, 0, k), prev: resample(s.prev, 0, k), rad: new Float32Array(NP), vol: s.vol * s.neckS };
      const tip = { ...s, kind: 'piece', state: 'recoil', pin: 'free', pinch: 0, mound: 0, end: [s.pos[o], s.pos[o + 1]],
        pos: resample(s.pos, NP - 1, k), prev: resample(s.prev, NP - 1, k), rad: new Float32Array(NP), vol: s.vol * (1 - s.neckS) };
      base.len = s.len * s.neckS; base.rest = base.len / (NP - 1);
      tip.len = s.len * (1 - s.neckS); tip.rest = tip.len / (NP - 1);
      strands[strands.indexOf(s)] = base;
      if (strands.length < MAX_STRANDS) strands.push(tip);
      ripple(s.a, 0.8);
      flash(...at(s.a, 4), 1);
      if (opts.parted) opts.parted(s, base, tip);
      // The tip gets a turn this substep and the base doesn't. Drawn as it is, it isn't there.
      taper(base, base.len);
    }
    function release(absorb) {
      for (const s of strands) {
        if (s.kind === 'reach') {
          if (absorb || s.state === 'grow') { s.state = 'recoil'; s.kind = 'piece'; } else if (!s.pinch) s.pinch = 1e-4;
        }
      }
    }

    // A swelling, on its way along a tentacle that's got hold of something, from it to the body
    const pulse = (s, sp) => {
      const beat = (time * (0.7 + 0.5 * clamp(s.stretch - 1, 0, 1)) + s.phase) % 1.5;
      return bell(sp - (1.2 - beat), 0.1);
    };

    // Where the tip of each kind wants to be, and a page can add its own. Null, and it's let go.
    const aims = {
      reach(s, R, dt) {
        const h = s.hold, to = s.target, k = 1 - Math.exp(-dt * 24);
        h.a += h.spin * dt;
        // It's dragged along by what it's got hold of, a moment behind it
        h.x += (to.x + Math.cos(h.a) * h.r - h.x) * k;
        h.y += (to.y + Math.sin(h.a) * h.r - h.y) * k;
        // Sticky feet: its root peels along the surface towards it
        if (s.state === 'attached') s.a += turn(edge(to.x, to.y).a + s.lat - s.a) * (1 - Math.exp(-dt * 1.4));
        return [h.x, h.y];
      },
      micro(s, R, dt) {
        const to = s.target;
        s.a += turn(edge(to.x, to.y).a + s.lat - s.a) * (1 - Math.exp(-dt * 2));
        const nx = Math.cos(s.a), ny = Math.sin(s.a);
        let tx = to.x - R[0], ty = to.y - R[1];
        const tl = Math.hypot(tx, ty) || 1;
        let dx = nx * 0.25 + (tx / tl) * 0.75, dy = ny * 0.25 + (ty / tl) * 0.75;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl; dy /= dl;
        const len = (10 + 34 * aware) * s.probe.len, sway = Math.sin(time * 3 + s.probe.ph) * 4;
        if (s.life > s.ttl || aware < 0.08) { s.state = 'recoil'; return null; }
        return [R[0] + dx * len - dy * sway, R[1] + dy * len + dx * sway];
      },
      probe(s, R) {
        const p = s.probe, f = clamp((s.life - p.delay) / s.ttl, 0, 1), wave = Math.sin(Math.PI * f);
        const nx = Math.cos(s.a), ny = Math.sin(s.a), glide = p.dir * (f - 0.3) * (p.glide || 24), out = 3 + p.dist * wave;
        if (s.life > s.ttl + p.delay) { s.state = 'recoil'; return null; }
        return [R[0] + nx * out - ny * glide * wave, R[1] + ny * out + nx * glide * wave];
      },
      ...opts.aims,
    };

    function stepStrand(s, dt) {
      s.life += dt;
      const R = s.pin === 'anchor' ? at(s.a, 5) : s.end;

      const aim = aims[s.kind], T = aim && s.state !== 'recoil' ? aim(s, R, dt) : null;

      let tip = null;
      if (T) {
        const L0 = Math.hypot(T[0] - R[0], T[1] - R[1]);
        if (s.state === 'grow') {
          // A little wind-up, then a lunge that overshoots and latches
          const f = 3.8 * 0.95, z = 0.5, r = -0.2;
          const k1 = z / (Math.PI * f), k2 = 1 / ((2 * Math.PI * f) ** 2), k3 = (r * z) / (2 * Math.PI * f);
          const xd = s.uKick ? 1 / dt : 0;
          s.uKick = false;
          const k2s = Math.max(k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
          s.u += dt * s.ud;
          s.ud += (dt * (1 + k3 * xd - s.u - k1 * s.ud)) / k2s;
          const u = s.u, uc = clamp(u, 0, 1), L2 = L0 || 1;
          const nx = -(T[1] - R[1]) / L2, ny = (T[0] - R[0]) / L2;
          const lat = s.side * s.wig * Math.sin(Math.PI * uc) * Math.min(L2 * 0.3, 38);
          tip = [R[0] + (T[0] - R[0]) * u + nx * lat, R[1] + (T[1] - R[1]) * u + ny * lat];
          s.rest = (Math.max(4, L0 * Math.max(u, 0.03)) * 1.05) / (NP - 1);
          if (u > 0.85 && Math.abs(s.ud) < 1.6) {
            s.state = s.kind === 'reach' ? 'attached' : 'held';
            if (s.kind === 'reach') flash(R[0], R[1], 0.6);
          }
        } else {
          tip = T;
          let Lr = s.rest * (NP - 1);
          if (L0 < Lr * 1.03) Lr += (L0 * 1.03 - Lr) * (1 - Math.exp(-dt * 3.5));
          else Lr += (L0 - Lr) * (1 - Math.exp(-dt * P.creep));
          if (opts.haul) Lr = opts.haul(s, Lr, dt);
          s.rest = Lr / (NP - 1);
          s.stretch = L0 / Math.max(Lr, 1);
          if (SNAP && s.kind === 'reach' && !s.pinch && (s.stretch > SNAP.stretch * s.snapMul || L0 > SNAP.len * s.lenMul)) s.pinch = 1e-4;
        }
      } else if (s.state === 'recoil') {
        // Back along its own path, fast at first, easing in, like a rubber band
        s.retract += dt;
        const Ln = Math.max(0, s.len * Math.exp(-dt * 9) - (s.pin === 'free' ? 160 : 110) * dt);
        truncate(s, Ln);
        s.rest = Ln / (NP - 1);
      }

      if (s.pinch > 0) {
        s.pinch += dt / 0.1;
        if (s.pinch >= 1) return split(s);
      }

      const pos = s.pos, prev = s.prev, damp = s.state === 'recoil' ? 0.94 : 0.965, last = (NP - 1) * 2;
      const ex = pos[last] - R[0], ey = pos[last + 1] - R[1], el = Math.hypot(ex, ey) || 1, px = -ey / el, py = ex / el;
      const amp = (s.state === 'recoil' ? 0 : s.wave) * clamp(1.35 - s.stretch, 0.15, 1) * (s.state === 'grow' ? 0.4 : 1);
      const to = s.target, mag = to && to.present && s.state !== 'recoil' ? P.magnet * 900 * dt * dt : 0;
      for (let i = 1; i < NP; i++) {
        const o = i * 2, sp = i / (NP - 1);
        const vx = (pos[o] - prev[o]) * damp, vy = (pos[o + 1] - prev[o + 1]) * damp;
        prev[o] = pos[o]; prev[o + 1] = pos[o + 1];
        const env = Math.sin(Math.PI * sp), wave = Math.sin(sp * 8.5 - time * 7.5 + s.phase) * env * amp * dt * dt;
        pos[o] += vx + px * wave;
        pos[o + 1] += vy + py * wave;
        if (mag) {
          const mx = to.x - pos[o], my = to.y - pos[o + 1], ml = Math.hypot(mx, my) || 1;
          pos[o] += (mx / ml) * mag * env;
          pos[o + 1] += (my / ml) * mag * env;
        }
      }

      const rest = Math.max(s.rest, 0.05);
      for (let it = 0; it < ITER; it++) {
        pos[0] = R[0]; pos[1] = R[1];
        if (tip) { pos[last] = tip[0]; pos[last + 1] = tip[1]; }
        for (let i = 0; i < NP - 1; i++) {
          const a = i * 2, b = a + 2;
          let dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1];
          const d = Math.hypot(dx, dy) || 1e-6, wa = i === 0 ? 0 : 1, wb = i + 1 === NP - 1 && tip ? 0 : 1, ws = wa + wb;
          const diff = ((d - rest) / d) * 0.95;
          dx *= diff; dy *= diff;
          if (wa) { pos[a] += dx * wa / ws; pos[a + 1] += dy * wa / ws; }
          if (wb) { pos[b] -= dx * wb / ws; pos[b + 1] -= dy * wb / ws; }
        }
        // Muscular: it won't kink
        for (let i = 0; i < NP - 2; i++) {
          const a = i * 2, b = a + 4;
          let dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1];
          const d = Math.hypot(dx, dy) || 1e-6, min = rest * 1.55;
          if (d >= min) continue;
          const wa = i === 0 ? 0 : 1, wb = i + 2 === NP - 1 && tip ? 0 : 1, ws = wa + wb;
          const diff = ((d - min) / d) * 0.25;
          dx *= diff; dy *= diff;
          if (wa) { pos[a] += dx * wa / ws; pos[a + 1] += dy * wa / ws; }
          if (wb) { pos[b] -= dx * wb / ws; pos[b + 1] -= dy * wb / ws; }
        }
      }

      let L = 0;
      for (let i = 0; i < NP - 1; i++) L += Math.hypot(pos[i * 2 + 2] - pos[i * 2], pos[i * 2 + 3] - pos[i * 2 + 1]);
      s.len = L;
      taper(s, L);

      // The surface is drawn out in a cone along the pull
      let moundT = 0, elongT = 0;
      if (s.pin === 'anchor') {
        if (s.state === 'grow') { moundT = 7; elongT = 0.9; }
        else if (s.state === 'attached') { moundT = 6 + 6 * clamp(s.stretch - 1, 0, 1.4); elongT = 1 + 1.6 * clamp(s.stretch - 0.8, 0, 1.4); }
        if (s.kind === 'micro') { moundT *= 0.35; elongT *= 0.6; }
        if (s.kind === 'probe') { moundT *= 0.2; elongT *= 0.4; }
      }
      s.mound += (moundT * 0.55 - s.mound) * (1 - Math.exp(-dt * (moundT > s.mound ? 10 : 5)));
      s.elong += (elongT - s.elong) * (1 - Math.exp(-dt * 8));

      if (s.state === 'recoil' && (s.rest * (NP - 1) < 12 || L < 5)) {
        s.dead = true;
        if (s.pin === 'anchor' && s.kind !== 'micro') ripple(s.a, 0.5);
      }
    }
    // Thin as it's stretched, necking where it'll part, and beading once it's nearly gone
    function taper(s, L) {
      const rMean = clamp(Math.sqrt(s.vol / (Math.PI * Math.max(L, 2))), 0.6, s.state === 'recoil' ? 5 : 7);
      const held = s.state === 'attached';
      const neck = held ? clamp((s.stretch - 1.15) / 1.2, 0, 0.7) : 0, nk = neck * (1 - s.pinch) + s.pinch * 0.96;
      const bead = held ? clamp((s.stretch - 1.5) / 0.8, 0, 1) : 0, beadFreq = L / (9 * rMean);
      const cap = s.state === 'recoil' ? Math.min(0.8, s.retract * 3) : 0;
      for (let i = 0; i < NP; i++) {
        const sp = i / (NP - 1);
        let r = rMean * (s.pin === 'free' ? 0.6 : 1 + 1.1 * Math.exp(-sp / 0.1));
        if (s.kind !== 'piece') r *= 1 - 0.68 * ease(0.5, 1, sp);
        else r *= 1 + (0.5 + cap) * Math.exp(-(1 - sp) / 0.07);
        r *= 1 - nk * Math.exp(-(((sp - s.neckS) / 0.16) ** 2));
        r *= 1 + bead * 0.3 * Math.sin(sp * Math.PI * 2 * beadFreq + s.phase);
        if (held) r *= 1 + 0.42 * pulse(s, sp) * (1 - nk);
        s.rad[i] = Math.max(r, 0.35);
      }
    }

    // Bits are a page's business, as how they get home depends on what's in the way. These are
    // the parts that don't: a bit leaves a track behind it and gets over landing, whatever it's
    // doing, and it goes through the air in a straight line, seen from above.
    function trace(d, dt) {
      if (d.up < 0.5 && (d.step += dt) > 0.05) {
        d.step = 0;
        tracks.push({ x: d.x, y: d.y, r: d.r * 0.5, age: 0, of: d });
      }
      d.land *= Math.exp(-dt * 9);
    }
    function flight(d, dt) {
      d.flight += dt / d.time;
      const f = Math.min(d.flight, 1);
      d.x = d.x0 + (d.x1 - d.x0) * f;
      d.y = d.y0 + (d.y1 - d.y0) * f;
      return f;
    }

    // ---- Keeping it going, in this order or a page's own ----

    // What's going on inside it, which goes faster the more it's got to mind. `calm`'s what its
    // light settles to.
    function stir(dt, calm = 0.25 + 0.45 * aware + 0.6 * blob.over) {
      flow += dt * (1 + 2 * aware + 2.5 * blob.over);
      glow.n = glow.night ? glow.n + (1 - glow.n) * (1 - Math.exp(-dt * 2.5)) : 0;
      glow.stirred += (calm - glow.stirred) * (1 - Math.exp(-dt * (calm > glow.stirred ? 7 : 1.2)));
      for (const f of flashes) f.age += dt;
      while (flashes.length && flashes[0].age > 1.4) flashes.shift();
    }
    function move(dt) {
      for (let i = 0; i < strands.length; i++) stepStrand(strands[i], dt);
      for (let i = strands.length - 1; i >= 0; i--) if (strands[i].dead) strands.splice(i, 1);
      for (let i = drops.length - 1; i >= 0; i--) { opts.stepBit(drops[i], dt); if (drops[i].dead) drops.splice(i, 1); }
      for (const t of tracks) t.age += dt;
      while (tracks.length && tracks[0].age > 3) tracks.shift();
    }
    function ebb(dt) {
      for (const r of ripples) r.age += dt;
      while (ripples.length && ripples[0].age > 1.6) ripples.shift();
    }

    // ---- Drawing ----

    const world = (c, k, x = 0) => c.setTransform(k, 0, 0, k, x, -top * k);
    const OUTLINE = 84, ox = new Float32Array(OUTLINE), oy = new Float32Array(OUTLINE);
    function outline() {
      for (let i = 0; i < OUTLINE; i++) {
        const a = (i / OUTLINE) * Math.PI * 2, r = radius(a);
        ox[i] = blob.x + Math.cos(a) * r;
        oy[i] = blob.y + Math.sin(a) * r;
      }
    }
    // Through the middles of the sides, so it's smooth
    function closed(c, inset = 0, fresh = true) {
      const n = OUTLINE;
      const x = i => { i = (i + n) % n; return ox[i] + (blob.x - ox[i]) * inset; };
      const y = i => { i = (i + n) % n; return oy[i] + (blob.y - oy[i]) * inset; };
      if (fresh) c.beginPath();
      c.moveTo((x(n - 1) + x(0)) / 2, (y(n - 1) + y(0)) / 2);
      for (let i = 0; i < n; i++) c.quadraticCurveTo(x(i), y(i), (x(i) + x(i + 1)) / 2, (y(i) + y(i + 1)) / 2);
      c.closePath();
    }
    // A tentacle as it's seen: smoothed, as its joints only have to behave as a whole, and with
    // more points through it, so that it's a tube, however it bends
    const VP = (NP - 1) * 3 + 1, vx = new Float32Array(VP), vy = new Float32Array(VP), vr = new Float32Array(VP);
    const sx = new Float32Array(NP), sy = new Float32Array(NP);
    function view(s) {
      for (let i = 0; i < NP; i++) { sx[i] = s.pos[i * 2]; sy[i] = s.pos[i * 2 + 1]; }
      for (let pass = 0; pass < 3; pass++) {
        let px = sx[0], py = sy[0];
        for (let i = 1; i < NP - 1; i++) {
          const x = sx[i], y = sy[i];
          sx[i] = x * 0.5 + (px + sx[i + 1]) * 0.25;
          sy[i] = y * 0.5 + (py + sy[i + 1]) * 0.25;
          px = x; py = y;
        }
      }
      const curve = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      for (let i = 0; i < VP; i++) {
        const f = i / 3, j = Math.min(Math.floor(f), NP - 2), t = f - j, a = Math.max(j - 1, 0), d = Math.min(j + 2, NP - 1);
        vx[i] = curve(sx[a], sx[j], sx[j + 1], sx[d], t);
        vy[i] = curve(sy[a], sy[j], sy[j + 1], sy[d], t);
        vr[i] = s.rad[j] + (s.rad[j + 1] - s.rad[j]) * t;
      }
    }
    const edgeX = new Float32Array(VP * 2), edgeY = new Float32Array(VP * 2);
    function ribbon(c, width = 1) {
      for (let i = 0; i < VP; i++) {
        const a = Math.max(i - 1, 0), b = Math.min(i + 1, VP - 1);
        let tx = vx[b] - vx[a], ty = vy[b] - vy[a];
        const L = Math.hypot(tx, ty) || 1, r = vr[i] * width;
        tx /= L; ty /= L;
        edgeX[i] = vx[i] - ty * r; edgeY[i] = vy[i] + tx * r;
        const j = VP * 2 - 1 - i;
        edgeX[j] = vx[i] + ty * r; edgeY[j] = vy[i] - tx * r;
      }
      c.beginPath();
      c.moveTo(edgeX[0], edgeY[0]);
      for (let i = 0; i < VP * 2 - 1; i++) c.quadraticCurveTo(edgeX[i], edgeY[i], (edgeX[i] + edgeX[i + 1]) / 2, (edgeY[i] + edgeY[i + 1]) / 2);
      c.lineTo(edgeX[VP * 2 - 1], edgeY[VP * 2 - 1]);
      c.closePath();
      c.fill();
      c.beginPath();
      c.arc(vx[VP - 1], vy[VP - 1], vr[VP - 1] * width, 0, 6.29);
      c.fill();
    }
    // Scattered through a dome: seen from above, most of them are where it's deepest, and
    // `depth` is how far under its surface each one is
    const MOTES = Array.from({ length: 260 }, () => {
      let x, y, z;
      do { x = rand(-1, 1); y = rand(-1, 1); z = rand(0, 1); } while (x * x + y * y + z * z > 1);
      const rho = Math.hypot(x, y);
      return { rho: rho * 0.96, depth: Math.sqrt(1 - rho * rho) - z, th: Math.atan2(y, x), spin: rand(0.05, 0.2) * (Math.random() < 0.8 ? 1 : -1),
        size: Math.random() < 0.1 ? rand(2.6, 4.4) : rand(1, 2.4), ph: rand(0, 6.28), rate: rand(0.5, 1.6), bright: rand(0.3, 1), spark: 0 };
    });
    function motes() {
      const near = aware + blob.over, dx = Math.cos(blob.la), dy = Math.sin(blob.la), on = focus && focus.present;
      ctx.globalCompositeOperation = 'lighter';
      for (const m of MOTES) {
        const th = m.th + flow * m.spin * (1.4 - m.rho), rho = m.rho + 0.05 * Math.sin(flow * 0.4 * m.rate + m.ph), r = radius(th) * rho;
        // They crowd towards whatever it wants
        const x = blob.x + Math.cos(th) * r + dx * near * 16 * (1 - m.rho * 0.6), y = blob.y + Math.sin(th) * r + dy * near * 16 * (1 - m.rho * 0.6);
        const twinkle = 0.55 + 0.45 * Math.sin(flow * m.rate + m.ph * 3);
        if (glow.night) {
          // Each only sparks now and then, for a moment, more often the more it's stirred.
          // Deep down it's dimmer, and spread out by what the light's come through.
          m.spark *= Math.exp(-sinceNight / 0.18);
          if (Math.random() < sinceNight * (0.08 + 1.5 * glow.stirred * glow.stirred)) m.spark = rand(0.4, 0.95);
          let light = 0.09 + 0.09 * twinkle + m.spark;
          for (const f of flashes) light += f.amp * Math.exp(-f.age * 2.6) * bell(Math.hypot(x - f.x, y - f.y) - f.age * 230, 24);
          if (on) light += (0.2 * aware + blob.over) * bell(Math.hypot(x - focus.x, y - focus.y), 42);
          const size = m.size * (0.8 + 2.4 * m.depth);
          ctx.globalAlpha = Math.min(light * Math.exp(-1.5 * m.depth), 1) * glow.n;
          ctx.drawImage(SOFT, x - size, y - size, size * 2, size * 2);
          continue;
        }
        let a = 0.26 * m.bright * twinkle;
        if (blob.over > 0.01 && on) a += blob.over * bell(Math.hypot(x - focus.x, y - focus.y), 34);
        ctx.globalAlpha = Math.min(a, 1);
        ctx.drawImage(SOFT, x - m.size, y - m.size, m.size * 2, m.size * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // And down a tentacle that's got hold of something, on their way home
    function streaming(s) {
      if (s.state !== 'attached') return;
      const strength = glow.night ? 0.5 * glow.n : 0.4;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const f = 1 - ((flow * 0.5 + i / 7 + s.phase) % 1), at = Math.min(Math.floor(f * (VP - 1)), VP - 1), size = 1.1 + (i % 3) * 0.5;
        ctx.globalAlpha = strength * Math.sin(Math.PI * f) ** 0.5;
        ctx.drawImage(SOFT, vx[at] - size, vy[at] - size, size * 2, size * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Light gets through where it's thin: by day, a bottle's green; by night, its own.
    // Inside its skin, as it's the middle that's lit.
    function flesh(c, s) {
      const fill = c.createLinearGradient(vx[0], vy[0], vx[VP - 1] + 0.01, vy[VP - 1]);
      for (let i = 0; i < NP; i++) {
        fill.addColorStop(i / (NP - 1), rgb(mix(DARK, THIN, ease(3.4, 0.8, s.rad[i]))));
      }
      c.fillStyle = fill;
      ribbon(c, 0.74);
    }
    // Gloss down the side that faces the light, brightest where it's square on to it
    function gloss(c) {
      c.lineCap = 'round';
      for (let i = 0; i + 2 < VP; i += 2) {
        const r = (vr[i] + vr[i + 2]) / 2;
        if (r < 0.75) continue;
        const tx = vx[i + 2] - vx[i], ty = vy[i + 2] - vy[i], L = Math.hypot(tx, ty) || 1;
        const nx = -ty / L, ny = tx / L, f = nx * glow.x + ny * glow.y, off = (f < 0 ? -1 : 1) * r * 0.42;
        c.strokeStyle = shine((0.1 + 0.62 * Math.abs(f) ** 1.6).toFixed(3));
        c.lineWidth = Math.max(0.35, r * 0.28);
        c.beginPath();
        c.moveTo(vx[i] + nx * off, vy[i] + ny * off);
        c.lineTo(vx[i + 2] + nx * off, vy[i + 2] + ny * off);
        c.stroke();
      }
    }
    // A window, curved round the body as it'd be in a bead of oil, stretching as it stretches
    function pane(c, th0, th1, r0, r1) {
      const point = (th, rho) => {
        const r = radius(th) * rho;
        return [blob.x + Math.cos(th) * r, blob.y + Math.sin(th) * r];
      };
      c.beginPath();
      for (let i = 0; i <= 6; i++) { const q = point(th0 + ((th1 - th0) * i) / 6, r1); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }
      for (let i = 6; i >= 0; i--) { const q = point(th0 + ((th1 - th0) * i) / 6, r0); c.lineTo(q[0], q[1]); }
      c.closePath();
      c.fill();
    }
    function shaded() {
      const light = Math.atan2(glow.y, glow.x), r = radius(light);
      ctx.save();
      closed(ctx);
      ctx.clip();
      motes();
      // Faint and broad, so it's round: nothing else lifts a black thing off a black thing
      const sheen = ctx.createRadialGradient(blob.x + glow.x * r * 0.42, blob.y + glow.y * r * 0.42, 0, blob.x, blob.y, r * 1.15);
      sheen.addColorStop(0, shine(0.2));
      sheen.addColorStop(0.45, shine(0.05));
      sheen.addColorStop(1, shine(0));
      ctx.fillStyle = sheen;
      const [w, h] = area();
      ctx.fillRect(0, 0, w, h + under);
      // The window: sky at the top of it, going dark towards the trees
      const pan = ctx.createRadialGradient(blob.x, blob.y, r * 0.5, blob.x, blob.y, r * 0.86);
      pan.addColorStop(0, shine(0.1));
      pan.addColorStop(0.45, shine(0.34));
      pan.addColorStop(1, shine(0.92));
      ctx.fillStyle = pan;
      // What it's closing over isn't in the reflection
      const take = blob.take;
      blob.take = 0;
      ctx.shadowColor = shine(0.5);
      ctx.shadowBlur = 2.5 * scale * dpr;
      pane(ctx, light - 0.56, light - 0.05, 0.56, 0.84);
      pane(ctx, light + 0.05, light + 0.56, 0.56, 0.84);
      ctx.shadowBlur = 0;
      blob.take = take;
      // And a small, sharp kick off the far side, moving with the surface
      const a = light + Math.PI + 0.7 + 0.2 * Math.sin(time * 0.6), k = radius(a) * (0.66 + 0.05 * Math.sin(time * 0.8));
      ctx.fillStyle = shine(0.55);
      ctx.beginPath();
      ctx.ellipse(blob.x + Math.cos(a) * k, blob.y + Math.sin(a) * k, 3.2, 1.3, a + Math.PI / 2, 0, 6.29);
      ctx.fill();
      ctx.restore();
    }

    function byDay() {
      const S = dpr * scale, body = rgb(DARK);
      // The whole shape, once, so that its shadow's of the whole, however its parts overlap
      sil.setTransform(1, 0, 0, 1, 0, 0);
      sil.clearRect(0, 0, shape.width, shape.height);
      world(sil, S);
      sil.fillStyle = body;
      closed(sil);
      sil.fill();
      for (const s of strands) { view(s); ribbon(sil); }
      for (const d of drops) {
        if (d.up > 0.5) continue;
        sil.beginPath();
        if (d.path) d.path(sil);
        else sil.ellipse(d.x, d.y, d.r * d.sq, d.r / d.sq, Math.atan2(d.dy, d.dx), 0, 6.29);
        sil.fill();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.shadowColor = `rgba(${glow.shadow}, 0.42)`;
      ctx.shadowOffsetX = glow.cast[0] * dpr; ctx.shadowOffsetY = glow.cast[1] * dpr; ctx.shadowBlur = glow.cast[2] * 2 * dpr;
      ctx.drawImage(shape, 0, 0);
      ctx.shadowColor = `rgba(${glow.shadow}, 0.6)`;
      ctx.shadowOffsetX = glow.touch[0] * dpr; ctx.shadowOffsetY = glow.touch[1] * dpr; ctx.shadowBlur = glow.touch[2] * 2 * dpr;
      ctx.drawImage(shape, 0, 0);
      ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      world(ctx, S);
      for (const s of strands) { view(s); flesh(ctx, s); }
      shaded();
      // Going back into the body, they're under its surface, and catch no light
      for (const s of strands) { if (s.state === 'recoil') continue; view(s); gloss(ctx); streaming(s); }
      // Off the ground a bit's shadow comes away from it, fainter and softer the higher it is,
      // and it's a little nearer the eye. Seen from above, that's all there is to show height.
      for (const d of drops) {
        const lift = 1 + d.up * 0.028, r = d.r * lift, a = Math.atan2(d.dy, d.dx);
        if (d.up > 0.5) {
          const away = d.up * 0.5 * BIT, off = aside();
          ctx.shadowColor = `rgba(${glow.shadow}, ${(0.6 - d.up * 0.009).toFixed(3)})`;
          ctx.shadowBlur = (1 + d.up * 0.14) * 2 * S * BIT;
          ctx.shadowOffsetX = (-glow.x * away - off) * S;
          ctx.shadowOffsetY = -glow.y * away * S;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(d.x + off, d.y, d.r, d.r * 0.9, a, 0, 6.29);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
          ctx.fillStyle = body;
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, r * d.sq, r / d.sq, a, 0, 6.29);
          ctx.fill();
        }
        ctx.fillStyle = shine(0.7);
        ctx.beginPath();
        ctx.arc(d.x + glow.x * r * 0.4, d.y + glow.y * r * 0.4, r * 0.22, 0, 6.29);
        ctx.fill();
      }
    }

    // How bright a stretch of tentacle is, as a share of what's deepest in the body: there's
    // only as much light as there's stuff to give it off, so a thin one's all but dark, till
    // the strain on it sets it off
    function emission(c, s, width = 1, amount = 1) {
      const fill = c.createLinearGradient(vx[0], vy[0], vx[VP - 1] + 0.01, vy[VP - 1]);
      const strain = s.state === 'attached' ? clamp(s.stretch - 1, 0, 1) : 0;
      for (let i = 0; i < NP; i++) {
        const sp = i / (NP - 1), a = (0.08 + 0.55 * ease(0.7, 3.6, s.rad[i]) + 0.45 * strain) * amount;
        // It comes up out of the body, so its root's lost in the glow
        fill.addColorStop(sp, `rgba(${INK}, ${(Math.min(a, 1) * ease(0, 0.2, sp)).toFixed(3)})`);
      }
      c.fillStyle = fill;
      ribbon(c, width);
    }

    // It's not even all through: there's more of what shines in some places than others, and
    // it's slowly carried round. Soft all over, or it'd look like the parts of a cell.
    const CLOUDS = Array.from({ length: 13 }, () => ({ rho: Math.sqrt(Math.random()) * 0.72, th: rand(0, 6.28), spin: rand(0.03, 0.09), size: rand(0.3, 0.62), a: rand(0.05, 0.12), ph: rand(0, 6.28) }));
    function clouds(level) {
      ctx.globalCompositeOperation = 'lighter';
      for (const c of CLOUDS) {
        const th = c.th + flow * c.spin, r = radius(th), x = blob.x + Math.cos(th) * r * c.rho, y = blob.y + Math.sin(th) * r * c.rho, size = r * c.size;
        ctx.globalAlpha = Math.min(c.a * (1.1 + 0.4 * Math.sin(flow * 0.3 + c.ph)) * level * 1.7, 1);
        ctx.drawImage(SOFT, x - size, y - size, size * 2, size * 2);
      }
    }

    // Its surface, at night, drawn inside its outline. The light that's turned back and gets
    // out round the rim gathers where the surface curves, and thins where it doesn't, so it
    // comes and goes around it. And it's wet: it shows the lamp, a soft sheen along the side
    // that faces it, with a small sharp image of the bulb in it.
    function surface(level) {
      ctx.lineCap = 'round';
      const rim = (width, amount) => {
        ctx.lineWidth = width;
        for (let i = 0; i < OUTLINE; i++) {
          const j = (i + 1) % OUTLINE, a = (i / OUTLINE) * Math.PI * 2;
          const v = 0.5 + 0.26 * Math.sin(3 * a + time * 0.4 + 1) + 0.15 * Math.sin(7 * a - time * 0.6) + 0.09 * Math.sin(13 * a + time * 0.9);
          let open = 1;
          for (const s of strands) if (s.kind === 'reach') open *= 1 - 0.9 * bell(turn(a - s.a), 0.13);
          ctx.strokeStyle = `rgba(${INK}, ${(amount * level * (0.14 + v * v * 1.3) * open).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(ox[i], oy[i]);
          ctx.lineTo(ox[j], oy[j]);
          ctx.stroke();
        }
      };
      rim(7, 0.14);
      rim(2.6, 0.5);
      const light = Math.atan2(glow.y, glow.x), r = radius(light), lamp = glow.n;
      // Nothing here's got a corner: a soft patch, laid along the curve
      ctx.save();
      ctx.translate(blob.x + glow.x * r * 0.66, blob.y + glow.y * r * 0.66);
      ctx.rotate(light);
      ctx.scale(0.28, 0.8);
      const sheen = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      sheen.addColorStop(0, `rgba(255, 228, 196, ${(0.13 * lamp).toFixed(3)})`);
      sheen.addColorStop(1, 'rgba(255, 228, 196, 0)');
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 6.29);
      ctx.fill();
      ctx.restore();
      const k = r * 0.62;
      ctx.fillStyle = `rgba(255, 236, 214, ${(0.75 * lamp).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(blob.x + glow.x * k, blob.y + glow.y * k, 2.6, 1.4, light + Math.PI / 2, 0, 6.29);
      ctx.fill();
    }

    // A tentacle's the same stuff, with the same surface: a sharp edge down each side, where
    // the light it's carrying gets out, coming and going along it, gone where it's thinned to
    // a thread, and where it rises out of the body it's the body's own
    function skin(s, level) {
      ctx.lineCap = 'round';
      const line = (at, phase) => {
        for (let i = 0; i < VP - 1; i++) {
          const j = at(i), k = at(i + 1), sp = i / (VP - 1), r = vr[i];
          const v = 0.55 + 0.3 * Math.sin(sp * 11 + s.phase + phase + time * 0.7) + 0.15 * Math.sin(sp * 27 - time * 1.1 + phase);
          const a = level * ease(0.05, 0.3, sp) * ease(0.5, 1.6, r) * (0.1 + 0.75 * v * v);
          ctx.strokeStyle = `rgba(${INK}, ${a.toFixed(3)})`;
          ctx.lineWidth = Math.min(0.45 + r * 0.2, 1.1);
          ctx.beginPath();
          ctx.moveTo(edgeX[j], edgeY[j]);
          ctx.lineTo(edgeX[k], edgeY[k]);
          ctx.stroke();
        }
      };
      line(i => i, 0);
      line(i => VP * 2 - 1 - i, 2.1);
    }

    // At night there's nothing to see of it but the light it gives off, and that's all this
    // draws, screened over what's there, so what's under it shows through: a thing that shines
    // adds to what's there. Light from all through it adds up along the line of sight, so it's
    // brightest where it's deepest. But it's a gel, not a gas: it has a surface, so its edge is
    // sharp however soft its inside, and at that surface what's coming out at a shallow angle is
    // turned back in, and gets out round the rim instead, so there's a thin, uneven line of
    // brighter light just inside its edge. And what it lights is lit from low down, close to,
    // which falls off fast (about as the cube of the distance), and keeps to its shape.
    const AWAY = 4000;
    function byNight() {
      const S = dpr * scale, L = S / 3, n = glow.n, r = BODY * blob.size, [w, h] = area();
      sinceNight = clamp(time - lastNight, 0, 0.1);
      lastNight = time;
      const level = n * (0.68 + 0.42 * glow.stirred) * (0.94 + 0.06 * Math.sin(time * 0.9));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Everything inside it stops at its surface
      ctx.save();
      world(ctx, S);
      closed(ctx);
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Even at its thinnest there's some of it
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${INK}, ${(0.08 * level).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // The depth of it, at a third of the size, as it has no edges to keep sharp. A dome's
      // depth climbs steeply at its edge, then slower and slower towards the middle, so it's
      // built up in steps, each all of it less the shadow of a ring set in from its edge. The
      // last, nearly all of it, is left for what it lights.
      [[0.72, 0.26, 0.2], [0.48, 0.18, 0.11], [0.17, 0.08, 0.07]].forEach(([inset, soft, amount]) => {
        lo.setTransform(1, 0, 0, 1, 0, 0);
        lo.clearRect(0, 0, low.width, low.height);
        world(lo, L);
        lo.fillStyle = `rgb(${INK})`;
        closed(lo);
        lo.fill();
        lo.save();
        lo.globalCompositeOperation = 'destination-out';
        world(lo, L, -AWAY);
        lo.shadowColor = '#000';
        lo.shadowOffsetX = AWAY;
        lo.shadowBlur = 2 * r * soft * L;
        lo.fillStyle = '#000';
        lo.beginPath();
        lo.rect(-300, -300, w + 600, h + 600);
        closed(lo, inset, false);
        lo.fill('evenodd');
        lo.restore();
        ctx.globalAlpha = amount * level;
        ctx.drawImage(low, 0, 0, canvas.width, canvas.height);
      });
      world(ctx, S);
      clouds(level);
      ctx.globalAlpha = 1;
      motes();
      ctx.globalCompositeOperation = 'lighter';
      surface(level);
      ctx.restore();

      // What it lights: everything it gives off, spread three ways, that sum to that fall-off
      for (const s of strands) { view(s); emission(lo, s); }
      pool.setTransform(1, 0, 0, 1, 0, 0);
      pool.clearRect(0, 0, spill.width, spill.height);
      pool.globalCompositeOperation = 'lighter';
      pool.shadowOffsetX = AWAY;
      [[3, 0.42], [9, 0.24], [26, 0.11]].forEach(([spread, amount]) => {
        pool.shadowColor = `rgba(${INK}, ${amount})`;
        pool.shadowBlur = 2 * spread * L;
        pool.drawImage(low, -AWAY, 0);
      });
      ctx.globalCompositeOperation = blend;
      ctx.globalAlpha = level;
      ctx.drawImage(spill, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      world(ctx, S);
      // Whatever else is there to be lit, nearest it
      if (opts.lit) opts.lit(ctx, level, r);

      // A tube's deepest down its middle, so that's where it's brightest
      ctx.globalAlpha = level;
      for (const s of strands) {
        view(s);
        emission(ctx, s, 0.34, 0.34);
        emission(ctx, s, 0.68, 0.26);
        emission(ctx, s, 1, 0.34);
        skin(s, level);
      }
      ctx.globalAlpha = 1;
      for (const s of strands) { view(s); streaming(s); }
      ctx.globalCompositeOperation = 'lighter';
      // What a bit leaves behind it, one unbroken smear, drying up
      ctx.lineCap = 'round';
      tracks.forEach((t, i) => {
        const before = tracks.slice(Math.max(i - 8, 0), i).reverse().find(o => o.of === t.of);
        if (!before || Math.hypot(t.x - before.x, t.y - before.y) > 40) return;
        ctx.strokeStyle = `rgba(${INK}, ${(0.2 * n * (1 - t.age / 3)).toFixed(3)})`;
        ctx.lineWidth = t.r * 1.4 * (1 - t.age / 6);
        ctx.beginPath();
        ctx.moveTo(before.x, before.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      });
      // A bit's a small drop of it, with an edge of its own, and in the air it lights nothing but
      // itself
      for (const d of drops) {
        const r = d.r * (1 + d.up * 0.028), a = Math.atan2(d.dy, d.dx);
        if (d.up < 0.5) { ctx.globalAlpha = n * 0.16; ctx.drawImage(SOFT, d.x - r * 3, d.y - r * 3, r * 6, r * 6); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(${INK}, ${(0.34 * n).toFixed(3)})`;
        ctx.strokeStyle = `rgba(${INK}, ${(0.5 * n).toFixed(3)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        if (d.path) d.path(ctx);
        else ctx.ellipse(d.x, d.y, r * d.sq, r / d.sq, a, 0, 6.29);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      makeGrain();
      const [gx, gy] = opts.grainAt ? opts.grainAt(grain.width, S) : [Math.round((canvas.width - grain.width) / 2), Math.round((canvas.height - grain.height) / 2)];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = n;
      ctx.drawImage(grain, gx, gy);
      ctx.globalAlpha = 1;
    }
    // A glow is a long, slow fade across very few of a screen's shades, and only some browsers
    // dither it, so in the others it shows as bands. A grain of a shade or two either way, over
    // all of it, breaks them up. It fades out with the glow, and it's only made once it's needed.
    let grain = null;
    function makeGrain() {
      const D = Math.ceil(620 * scale * dpr);
      if (grain && grain.width === D) return;
      grain = layer(D, D);
      const c = grain.getContext('2d'), image = c.createImageData(D, D), px = image.data;
      for (let y = 0, i = 0; y < D; y++) {
        for (let x = 0; x < D; x++, i += 4) {
          const d = Math.hypot(x - D / 2, y - D / 2) / (D / 2), fade = d < 1 ? (1 - d * d) ** 1.2 : 0;
          px[i] = px[i + 1] = px[i + 2] = Math.random() < 0.5 ? 0 : 255;
          px[i + 3] = Math.random() * 6 * fade;
        }
      }
      c.putImageData(image, 0, 0);
    }
    function draw() {
      outline();
      if (glow.night) byNight();
      else byDay();
    }

    // A canvas of its own, and what goes with it
    function mount(el) {
      canvas = el;
      ctx = canvas.getContext('2d');
      shape = layer();
      sil = shape.getContext('2d');
      low = layer();
      lo = low.getContext('2d');
      spill = layer();
      pool = spill.getContext('2d');
    }
    // `w` and `h` in pixels, `zoom` being how big what it draws is, and `from` where the canvas
    // starts, for one that's only part of the way down what it's living in
    function size(w, h, ratio = 1, zoom = 1, from = 0) {
      dpr = ratio; scale = zoom; top = from;
      canvas.width = shape.width = w;
      canvas.height = shape.height = h;
      low.width = spill.width = Math.ceil(w / 3);
      low.height = spill.height = Math.ceil(h / 3);
    }

    // ---- Eyes ----

    // Two lights, for looking out from under something. They're on whatever canvas they're given,
    // as there's nothing to them but a place on the page.
    function eyes() {
      return { blink: 3, pair: [-1, 1].map(side => Array.from({ length: 16 }, () => {
        const a = rand(0, 6.28), d = Math.sqrt(Math.random());
        return { side, u: Math.cos(a) * d, v: Math.sin(a) * d, size: rand(0.05, 0.1), ph: rand(0, 6.28) };
      })) };
    }
    // At x, y, for a body of radius R, facing out along nx, ny. `look`'s how far along the edge
    // they've slid, and `open` how much of them there is.
    function drawEyes(c, e, x, y, R, nx, ny, look, open) {
      if (time > e.blink + 0.3) e.blink = time + rand(2, 5);
      const tx = -ny, ty = nx, shut = 1 - 0.9 * bell(time - e.blink, 0.08);
      c.globalCompositeOperation = 'lighter';
      for (const eye of e.pair) for (const m of eye) {
        const ex = x + tx * (m.side * R * 0.3 + look) + tx * m.u * R * 0.075 + nx * m.v * R * 0.09 * shut, ey = y + ty * (m.side * R * 0.3 + look) + ty * m.u * R * 0.075 + ny * m.v * R * 0.09 * shut, size = m.size * R * 1.1;
        c.globalAlpha = open * (0.68 + 0.3 * Math.sin(time * 2 + m.ph));
        c.drawImage(SOFT, ex - size, ey - size, size * 2, size * 2);
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    return {
      blob, strands, drops, tracks, glow,
      get time() { return time; }, set time(t) { time = t; },
      get aware() { return aware; }, set aware(a) { aware = a; },
      get focus() { return focus; }, set focus(f) { focus = f; },
      get probeAt() { return probeAt; }, set probeAt(a) { probeAt = a; },
      radius, edge, at, flash, ripple,
      sprout, reach, hair, probe, release,
      trace, flight, stir, move, ebb,
      mount, size, draw, eyes, drawEyes,
    };
  }

  window.Fizz = Object.assign(Fizz, { clamp, ease, rand, turn, bell, layer, rgb, shine, INK, DARK, SOFT, NP, SUB });
})();
