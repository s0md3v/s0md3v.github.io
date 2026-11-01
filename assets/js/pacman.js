/* The Projects page. He goes down the page as you read it, eating what's on the way, and at the
   bottom there's something waiting for him: the one from the dish on the homepage. Nothing's
   keeping it there. It's the same animal, so this is the same physics as assets/js/symbiote.js,
   with the same numbers: only what it's after, and where it's living, are different.

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
  const layer = (w = 300, h = 150) => { const el = document.createElement('canvas'); el.width = w; el.height = h; return el; };

  // ---- What's under the page ----

  function underThePage(host) {
    const BODY = 90, NP = 14, MAX_STRANDS = 26, SUB = 1 / 120, ITER = 3;
    const P = { creep: 0.25, magnet: 1.6 };
    // Its tentacles are as thick here as you'd expect of it, close to
    const REACH_VOL = Math.PI * 3 * 3 * 170;
    // The arms it'll use, how long it leaves between them, and what each is worth, against what
    // he's worth. The fight's only what these come to.
    const PULL = 15, THRUST = 1500, DRAG = 5;
    // The scene. It's fishing. A hair of it has lain from the big one off the bottom of the page
    // all along, with nothing else to see. He bites, it clamps onto his face, the line goes taut
    // and two arms have him at once. He breaks the line, and what was on his face goes with it,
    // and two more come. But he has his mouth back now: he bites through two, two more come, and
    // he bites through those, and he's all but free. So it stops sending them two at a time.
    const BOLTS = [{ at: 1.6, cut: 0, line: true }, { at: 2.45, cut: 2 }, { at: 3.15, cut: 2 }];
    const MORE = [{ at: 2.8, arms: 2 }, { at: 3.5, arms: 6 }];
    const LEAN = [0.5, -0.5, 0.95, -0.95, 0.2, -0.2, 0.7, -0.7, 1.2, -1.2, 0.35, -0.35];
    const REEL_AT = 4.5;
    const YANK = 0.22;
    // Bits are what they are in the dish, which is drawn at about 0.7 of this. How high one goes
    // stays in the dish's units, because that's what swells it and lifts its shadow.
    const BIT = 0.7, HOP = 34;
    const CANVAS = 560;

    const UP = -Math.PI / 2;
    const strands = [], ripples = [], drops = [], tracks = [];
    const blob = { x: 0, y: 0, ty: 0, la: UP, take: 0, takeAt: UP };
    const flashes = [];
    const glow = { x: -0.53, y: -0.85, cast: [8, 12, 4], touch: [1, 1, 1], shadow: '28, 34, 44', night: false, n: 0, stirred: 0.25 };
    let aware = 0, sinceNight = 0, lastNight = 0, meal = null, bait = null, line = null, gag = null;
    let time = rand(0, 100), flow = rand(0, 50);
    let prey = null, sated = 0;
    let canvas = null, ctx = null, shape = null, sil = null, low = null, lo = null, spill = null, pool = null, dpr = 1, top = 0;
    let running = false, last = 0, acc = 0;

    const rest = () => innerHeight + BODY * 1.2;

    function radius(a) {
      const t = time * 1.5;
      let r = BODY * (1 + 0.085 * Math.sin(2 * a + t * 0.31 + 1) + 0.06 * Math.sin(3 * a - t * 0.23 + 2) +
        0.034 * Math.sin(5 * a + t * 0.41) + 0.016 * Math.sin(8 * a - t * 0.7 + 4));
      for (const s of strands) if (s.mound > 0.05 && s.pin === 'anchor') r += s.mound * bell(turn(a - s.a), 0.13 + 0.09 * s.elong);
      // Taking him in: the surface comes up round him and closes over
      if (blob.take > 0.5) r += blob.take * bell(turn(a - blob.takeAt), 0.58);
      for (const w of ripples) r += w.amp * 7 * Math.exp(-w.age * 4) * bell(turn(a - w.a), 0.3 + w.age);
      return r;
    }
    function edge(x, y) {
      const dx = x - blob.x, dy = y - blob.y, L = Math.hypot(dx, dy) || 1e-3, a = Math.atan2(dy, dx), r = radius(a);
      return { a, nx: dx / L, ny: dy / L, d: L - r };
    }
    const at = (a, inset = 0) => {
      const r = radius(a) - inset;
      return [blob.x + Math.cos(a) * r, blob.y + Math.sin(a) * r];
    };
    function flash(x, y, amp) {
      flashes.push({ x, y, amp, age: 0 });
      if (flashes.length > 4) flashes.shift();
      glow.stirred = Math.min(glow.stirred + amp * 0.4, 1.2);
    }
    function ripple(a, amp) {
      ripples.push({ a, age: 0, amp });
      if (ripples.length > 6) ripples.shift();
    }

    function newStrand(kind, a) {
      const s = {
        kind, state: 'grow', pin: 'anchor', a,
        pos: new Float32Array(NP * 2), prev: new Float32Array(NP * 2), rad: new Float32Array(NP).fill(1.5),
        u: 0, ud: 0, uKick: true, rest: 1, vol: 0, stretch: 1, pinch: 0, len: 0,
        neckS: rand(0.42, 0.62), side: Math.random() < 0.5 ? -1 : 1, wig: rand(0.5, 1.2), phase: rand(0, 100),
        lat: 0, life: 0,
        mound: 0, elong: 0, dead: false, retract: 0,
      };
      const [x, y] = at(a, 5), nx = Math.cos(a), ny = Math.sin(a);
      for (let i = 0; i < NP; i++) {
        s.pos[i * 2] = s.prev[i * 2] = x + nx * i * 0.4;
        s.pos[i * 2 + 1] = s.prev[i * 2 + 1] = y + ny * i * 0.4;
      }
      return s;
    }
    // Left alone they curl out, glide along, and sink back. Here they've somewhere to be, and
    // only just show over the edge.
    const holdOn = () => ({ r: rand(8, 13), a: rand(0, 6.28), spin: rand(0.7, 1.5) * (Math.random() < 0.5 ? -1 : 1), x: prey.x, y: prey.y });
    // The first two were on their way before he bit: they set off from the edge of the window
    function spawnReach(ready) {
      if (strands.length >= MAX_STRANDS - 1) return;
      const toward = edge(prey.x, prey.y).a, lat = LEAN[prey.sent++ % LEAN.length] + rand(-0.1, 0.1);
      const s = newStrand('reach', toward + lat), R = at(s.a, 5);
      s.lat = lat;
      s.vol = REACH_VOL;
      s.hold = holdOn();
      if (ready) s.u = clamp((R[1] - innerHeight) / Math.hypot(prey.x - R[0], prey.y - R[1]), 0, 0.6);
      strands.push(s);
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
    // He's strong enough to part one, at the neck: the base whips home, the tip unwinds
    function split(s) {
      const k = s.neckS * (NP - 1), o = (NP - 1) * 2;
      const base = { ...s, kind: 'piece', state: 'recoil', pin: 'anchor', pinch: 0,
        pos: resample(s.pos, 0, k), prev: resample(s.prev, 0, k), rad: new Float32Array(NP), vol: s.vol * s.neckS };
      const tip = { ...s, kind: 'piece', state: 'recoil', pin: 'free', pinch: 0, mound: 0, end: [s.pos[o], s.pos[o + 1]],
        pos: resample(s.pos, NP - 1, k), prev: resample(s.prev, NP - 1, k), rad: new Float32Array(NP), vol: s.vol * (1 - s.neckS) };
      base.len = s.len * s.neckS; base.rest = base.len / (NP - 1);
      tip.len = s.len * (1 - s.neckS); tip.rest = tip.len / (NP - 1);
      base.retract = tip.retract = 0;
      strands[strands.indexOf(s)] = base;
      if (strands.length < MAX_STRANDS) strands.push(tip);
      ripple(s.a, 0.8);
      flash(...at(s.a, 4), 1);
      // What's thrown off, thrown clear of him, to find its own way back
      fling(s.pos[o], s.pos[o + 1], 30, 80);
      fling(s.pos[o], s.pos[o + 1], 30, 80);
      if (s === line) loose();
    }
    const pulse = (s, sp) => {
      const beat = (time * (0.7 + 0.5 * clamp(s.stretch - 1, 0, 1)) + s.phase) % 1.5;
      return bell(sp - (1.2 - beat), 0.1);
    };

    function stepStrand(s, dt) {
      s.life += dt;
      const R = s.pin === 'anchor' ? at(s.a, 5) : s.end;

      let T = null;
      if (s.kind === 'line') {
        T = [gag.x, gag.y];
      } else if (s.kind === 'reach' && prey) {
        const h = s.hold, k = 1 - Math.exp(-dt * 24);
        h.a += h.spin * dt;
        h.x += (prey.x + Math.cos(h.a) * h.r - h.x) * k;
        h.y += (prey.y + Math.sin(h.a) * h.r - h.y) * k;
        T = [h.x, h.y];
        if (s.state === 'attached') s.a += turn(edge(prey.x, prey.y).a + s.lat - s.a) * (1 - Math.exp(-dt * 1.4));
      }

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
          if (s.kind === 'line' && prey) Lr = Math.max(40, Lr - (prey.t < YANK ? 260 : 0) * dt);
          // Hand over hand
          if (prey && prey.reeling && s.kind === 'reach') Lr = Math.max(24, Lr - (50 + 300 * ease(0, 1.3, prey.reeling)) * dt);
          s.rest = Lr / (NP - 1);
          s.stretch = L0 / Math.max(Lr, 1);
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
      const amp = (s.state === 'recoil' ? 0 : s.kind === 'line' ? 140 : 700) * clamp(1.35 - s.stretch, 0.15, 1) * (s.state === 'grow' ? 0.4 : 1);
      const mag = s.kind === 'reach' && s.state !== 'recoil' && prey ? P.magnet * 900 * dt * dt : 0;
      for (let i = 1; i < NP; i++) {
        const o = i * 2, sp = i / (NP - 1);
        const vx = (pos[o] - prev[o]) * damp, vy = (pos[o + 1] - prev[o + 1]) * damp;
        prev[o] = pos[o]; prev[o + 1] = pos[o + 1];
        const env = Math.sin(Math.PI * sp), wave = Math.sin(sp * 8.5 - time * 7.5 + s.phase) * env * amp * dt * dt;
        pos[o] += vx + px * wave;
        pos[o + 1] += vy + py * wave;
        if (mag) {
          const mx = prey.x - pos[o], my = prey.y - pos[o + 1], ml = Math.hypot(mx, my) || 1;
          pos[o] += (mx / ml) * mag * env;
          pos[o + 1] += (my / ml) * mag * env;
        }
      }

      const length = Math.max(s.rest, 0.05);
      for (let it = 0; it < ITER; it++) {
        pos[0] = R[0]; pos[1] = R[1];
        if (tip) { pos[last] = tip[0]; pos[last + 1] = tip[1]; }
        for (let i = 0; i < NP - 1; i++) {
          const a = i * 2, b = a + 2;
          let dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1];
          const d = Math.hypot(dx, dy) || 1e-6, wa = i === 0 ? 0 : 1, wb = i + 1 === NP - 1 && tip ? 0 : 1, ws = wa + wb;
          const diff = ((d - length) / d) * 0.95;
          dx *= diff; dy *= diff;
          if (wa) { pos[a] += dx * wa / ws; pos[a + 1] += dy * wa / ws; }
          if (wb) { pos[b] -= dx * wb / ws; pos[b + 1] -= dy * wb / ws; }
        }
        // Muscular: it won't kink
        for (let i = 0; i < NP - 2; i++) {
          const a = i * 2, b = a + 4;
          let dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1];
          const d = Math.hypot(dx, dy) || 1e-6, min = length * 1.55;
          if (d >= min) continue;
          const wa = i === 0 ? 0 : 1, wb = i + 2 === NP - 1 && tip ? 0 : 1, ws = wa + wb;
          const diff = ((d - min) / d) * 0.25;
          dx *= diff; dy *= diff;
          if (wa) { pos[a] += dx * wa / ws; pos[a + 1] += dy * wa / ws; }
          if (wb) { pos[b] -= dx * wb / ws; pos[b + 1] -= dy * wb / ws; }
        }
      }

      // Thin as it's stretched, necking where it'll part, and beading once it's nearly gone
      let L = 0;
      for (let i = 0; i < NP - 1; i++) L += Math.hypot(pos[i * 2 + 2] - pos[i * 2], pos[i * 2 + 3] - pos[i * 2 + 1]);
      s.len = L;
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

      let moundT = 0, elongT = 0;
      if (s.pin === 'anchor') {
        if (s.state === 'grow') { moundT = 7; elongT = 0.9; }
        else if (s.state === 'attached') { moundT = 6 + 6 * clamp(s.stretch - 1, 0, 1.4); elongT = 1 + 1.6 * clamp(s.stretch - 0.8, 0, 1.4); }
      }
      s.mound += (moundT * 0.55 - s.mound) * (1 - Math.exp(-dt * (moundT > s.mound ? 10 : 5)));
      s.elong += (elongT - s.elong) * (1 - Math.exp(-dt * 8));

      if (s.state === 'recoil' && (s.rest * (NP - 1) < 12 || L < 5)) {
        s.dead = true;
        if (s.pin === 'anchor') ripple(s.a, 0.5);
      }
    }

    // ---- The line ----
    function layLine(to) {
      const s = newStrand('line', UP), [x0, y0] = at(UP, 5);
      s.state = 'attached';
      s.vol = Math.PI * 0.7 * 0.7 * 200;
      // The lie of it on the page, the same as the one drawn there until now
      const from = to.y + 12;
      for (let i = 0; i < NP; i++) {
        const f = i / (NP - 1), y = y0 + (to.y - y0) * f, v = clamp((y - from) / (innerHeight - from), 0, 1);
        s.pos[i * 2] = s.prev[i * 2] = x0 + (to.x - x0) * f + 4.5 * Math.sin(v * Math.PI * 2);
        s.pos[i * 2 + 1] = s.prev[i * 2 + 1] = y;
      }
      s.rest = Math.hypot(to.x - x0, to.y - y0) * 1.05 / (NP - 1);
      strands.push(s);
      line = s;
    }
    function fling(x, y, near, far) {
      const a = rand(0, 6.28), go = rand(near, far), x1 = x + Math.cos(a) * go, y1 = Math.min(y + Math.sin(a) * go, innerHeight - 12);
      drops.push({ x, y, r: rand(2.6, 4.2) * BIT, t: rand(0, 3), phase: rand(0, 6.28), dx: x1 - x, dy: y1 - y, sq: 1, up: 0, land: 0, step: 0,
        state: 'air', flight: 0, time: 0.36, x0: x, y0: y, x1, y1 });
    }
    // The line goes, and what's in his mouth, and two more are on their way
    function loose() {
      line = null;
      for (let i = 0; i < 16; i++) fling(gag.x, gag.y, 24, 120);
      flash(gag.x, gag.y, 1.4);
      gag.dead = true;
      gag = null;
      prey.freed();
      spawnReach();
      spawnReach();
    }
    // A bit goes home the way it gets home in its dish: it inches along, and gathers itself and
    // jumps, and lands, and inches along, and goes back into the body where it gets to it
    // What he bit. It's gone into his mouth and round his face, thickest over the mouth, with a
    // couple of knuckles in it, and it's drawn out toward whatever's pulling on it.
    const FACE = 15, ROUND = 1.9, GRIP = 40;
    function grip(c) {
      const d = gag, m = prey.face - Math.PI / 2, f = ease(0, 0.1, d.t), pull = line ? clamp(line.stretch - 1, 0, 0.6) : 0;
      let start = true;
      const point = (phi, r, u) => {
        const a = (u + 0.5) * Math.PI * 2, x = d.x0 + Math.cos(a) * d.r0, y = d.y0 + Math.sin(a) * d.r0;
        c[start ? 'moveTo' : 'lineTo'](x + (prey.x + Math.cos(m + phi) * r - x) * f, y + (prey.y + Math.sin(m + phi) * r - y) * f);
        start = false;
      };
      for (let i = 0; i <= GRIP; i++) {
        const u = i / GRIP, phi = ROUND * (2 * u - 1), tip = Math.sqrt(Math.min((ROUND - Math.abs(phi)) / 0.5, 1));
        const w = 11 * bell(phi, 0.8) + 4 * bell(phi - 1.15, 0.3) + 4.5 * bell(phi + 1, 0.28) + 2 * Math.sin(phi * 3.3 + 1) + 1.1 * Math.sin(phi * 6 + time * 4) + 16 * pull * bell(phi, 0.26);
        point(phi, FACE + 0.4 + Math.max(w, 1.5) * tip, u / 2);
      }
      for (let i = GRIP; i >= 0; i--) {
        const u = i / GRIP, phi = ROUND * (2 * u - 1);
        point(phi, FACE * (1 - 0.85 * bell(phi, 0.8)) - 1.5, 1 - u / 2);
      }
      c.closePath();
    }
    function stepDrop(d, dt) {
      d.t += dt;
      // What's in his mouth is going wherever he goes
      if (d.state === 'gag') {
        if (!prey) { d.dead = true; gag = null; return; }
        const mx = Math.sin(prey.face), my = -Math.cos(prey.face);
        d.x = prey.x + mx * (FACE + 11);
        d.y = prey.y + my * (FACE + 11);
        d.r = 8;
        d.dx = mx; d.dy = my;
        return;
      }
      // Past the bottom of the window it's as good as home
      if (d.y > innerHeight + 6) { d.dead = true; return; }
      if (d.up < 0.5 && (d.step += dt) > 0.05) {
        d.step = 0;
        tracks.push({ x: d.x, y: d.y, r: d.r * 0.5, age: 0, of: d });
      }
      d.land *= Math.exp(-dt * 9);
      if (d.state === 'crouch') {
        d.wait -= dt;
        d.sq = 1 + 0.75 * (1 - Math.max(d.wait, 0) / d.crouch) + d.land;
        if (d.wait > 0) return;
        const e = edge(d.x, d.y);
        // It's come up over it while it was getting ready
        if (e.d < 4) { d.dead = true; ripple(e.a, 1); return; }
        const far = Math.min(e.d + 8, rand(33, 41) * BIT), L = 1 / (e.nx * e.nx + e.ny * e.ny) ** 0.5;
        Object.assign(d, { state: 'air', flight: 0, x0: d.x, y0: d.y, x1: d.x - e.nx * L * far, y1: d.y - e.ny * L * far, time: 0.42, dx: -e.nx, dy: -e.ny });
      }
      if (d.state === 'air') {
        d.flight += dt / d.time;
        const f = Math.min(d.flight, 1);
        d.x = d.x0 + (d.x1 - d.x0) * f;
        d.y = d.y0 + (d.y1 - d.y0) * f;
        d.up = HOP * 4 * f * (1 - f);
        d.sq = 1 + 0.5 * Math.abs(1 - 2 * f);     // Drawn out as it goes, round at the top
        if (f < 1) return;
        d.up = 0;
        d.state = 'crawl';
        d.land = 1.1;
        d.crawl = rand(0.5, 1.1);
      }
      if (d.state !== 'crawl') return;
      const e = edge(d.x, d.y), pulse = Math.sin(d.t * 9) ** 2, speed = (34 + 96 * pulse) * BIT, wob = Math.sin(d.t * 11 + d.phase) * 22 * BIT;
      // It lands going the way it was going, and stretched that way, and comes round to home from
      // there. In the dish that's always the same way, so it never has to.
      const heading = Math.atan2(d.dy, d.dx), home = heading + turn(Math.atan2(-e.ny, -e.nx) - heading) * (1 - Math.exp(-dt * 5));
      d.dx = Math.cos(home); d.dy = Math.sin(home);
      d.x += (d.dx * speed - d.dy * wob) * dt;
      d.y += (d.dy * speed + d.dx * wob) * dt;
      d.sq = 1 + 0.4 * pulse + d.land;
      if (e.d < 0) { d.dead = true; ripple(e.a, 1); flash(d.x, d.y, 0.5); return; }
      if ((d.crawl -= dt) <= 0) {
        const crouch = rand(0.16, 0.3);
        Object.assign(d, { state: 'crouch', crouch, wait: crouch });
      }
    }

    // ---- The fight ----
    // He's a body like any other: what he's doing, against what the arms that have got him are
    // doing, and he tires. It takes hold, he pulls away, it takes hold again.
    function fight(dt) {
      const t = prey.t += dt;
      const arms = strands.filter(s => s.kind === 'reach');
      const held = arms.filter(s => s.state === 'attached');

      if (prey.more < MORE.length && t >= MORE[prey.more].at) {
        for (let i = MORE[prey.more++].arms; i > 0; i--) spawnReach();
      }
      if (!prey.reeling) {
        if (t > REEL_AT) prey.reeling = 1e-3;
      } else {
        prey.reeling += dt;
        blob.ty = rest() - 66 * ease(0.2, 1.2, prey.reeling);
        const dx = prey.x - blob.x, dy = prey.y - blob.y;
        blob.takeAt = Math.atan2(dy, dx);
        blob.take = Math.min(130, (Math.hypot(dx, dy) - BODY) * 1.15) * ease(0.45, 1.3, prey.reeling);
      }

      const stuck = held.length || line;
      const biting = prey.breaks && prey.breaks.arms[0];
      const bolt = BOLTS[prey.bolts];
      if (bolt && t > bolt.at && held.length >= bolt.cut) {
        prey.bolts++;
        prey.dx = 0.3 * prey.side; prey.dy = -0.95;
        prey.boltUntil = prey.dashUntil = t + 0.36;
        prey.nextDash = t + 0.5;
        prey.breaks = { at: t + 0.24, arms: [...held.slice(0, bolt.cut), ...(bolt.line && line ? [line] : [])] };
      }
      if (prey.breaks && t > prey.breaks.at) {
        for (const s of prey.breaks.arms) {
          if (s.state !== 'attached' || s.pinch) continue;
          s.pinch = 1e-4;
          // Where he's got it, right up by his mouth
          if (s !== line) s.neckS = 0.9;
        }
        prey.breaks = null;
      }
      if (stuck && t > prey.nextDash) {
        prey.side = -prey.side;
        const a = rand(0.3, 1.1) * prey.side;
        prey.dx = Math.sin(a); prey.dy = -Math.cos(a);
        prey.dashUntil = t + rand(0.2, 0.3);
        prey.nextDash = prey.dashUntil + rand(0.08, 0.2);
      }
      let ax = 0, ay = 0;
      // With nothing on him he's only got what he was already doing
      if (stuck && t < prey.dashUntil) {
        // There's only so far he can get, with all that on him
        const tired = (1 - 0.5 * ease(0, 5, t)) * (prey.reeling ? 0.4 : 1) * (t < prey.boltUntil ? 2.6 : 1) * ease(620, 480, Math.hypot(prey.x - blob.x, prey.y - blob.y));
        ax += prey.dx * THRUST * tired;
        ay += prey.dy * THRUST * tired;
        if (!line && !biting) prey.face += turn(Math.atan2(prey.dx, -prey.dy) - prey.face) * (1 - Math.exp(-dt * 26));
      }
      // On the line, his mouth goes where the line goes, whichever way he's trying to get away, and
      // when he's going to bite something it goes to that
      const pulled = line || biting;
      if (pulled) {
        const o = (NP - 2) * 2;
        prey.face += turn(Math.atan2(pulled.pos[o] - prey.x, prey.y - pulled.pos[o + 1]) - prey.face) * (1 - Math.exp(-dt * 14));
      }
      for (const s of line ? [line, ...held] : held) {
        const dx = s.pos[0] - prey.x, dy = s.pos[1] - prey.y, L = Math.hypot(dx, dy) || 1, over = Math.max(0, L - s.rest * (NP - 1));
        const pull = s === line ? PULL * 1.4 : PULL;
        ax += (dx / L) * over * pull;
        ay += (dy / L) * over * pull;
      }
      const drag = Math.exp(-dt * DRAG);
      prey.vx = (prey.vx + ax * dt) * drag;
      prey.vy = (prey.vy + ay * dt) * drag;
      prey.x += prey.vx * dt;
      prey.y += prey.vy * dt;

      if (edge(prey.x, prey.y).d < -10 || prey.y > innerHeight + 40) swallow();
    }
    // There's nothing to it but it's closing over him, and he goes on down inside it, which by
    // night you can see, till there's nothing of him to see
    function swallow() {
      const a = edge(prey.x, prey.y).a;
      meal = { x: prey.x, y: prey.y, face: prey.face, t: 0, move: prey.move, gone: prey.gone };
      flash(prey.x, prey.y, 1.4);
      prey = null;
      sated = time;
      ripple(a, 2);
      ripple(a + 0.9, 1.2);
      ripple(a - 0.9, 1.2);
      for (const s of strands) {
        if (s.kind === 'reach') { s.kind = 'piece'; s.state = 'recoil'; }
      }
    }

    function step(dt) {
      time += dt;
      aware += ((prey ? 1 : 0) - aware) * (1 - Math.exp(-dt * 4));
      flow += dt * (1 + 2 * aware);
      glow.n = glow.night ? glow.n + (1 - glow.n) * (1 - Math.exp(-dt * 2.5)) : 0;
      const calm = 0.25 + 0.45 * aware;
      glow.stirred += (calm - glow.stirred) * (1 - Math.exp(-dt * (calm > glow.stirred ? 7 : 1.2)));
      for (const f of flashes) f.age += dt;
      while (flashes.length && flashes[0].age > 1.4) flashes.shift();
      if (prey) blob.la += turn(edge(prey.x, prey.y).a - blob.la) * (1 - Math.exp(-dt * 8));
      else blob.take *= Math.exp(-dt * 2.5);
      if (meal) {
        meal.t += dt;
        // Faster than the surface comes down after him, so it never lets go of him
        const k = 1 - Math.exp(-dt * 6);
        meal.x += (blob.x - meal.x) * k;
        meal.y += (blob.y - BODY * 0.25 - meal.y) * k;
        if (meal.t > 0.8) { meal.gone(); meal = null; }
      }
      for (const r of ripples) r.age += dt;
      while (ripples.length && ripples[0].age > 1.6) ripples.shift();
      if (prey) fight(dt);
      else if (sated) { if (time - sated > 0.8) blob.ty = rest(); }
      blob.y += (blob.ty - blob.y) * (1 - Math.exp(-dt * (prey ? 7 : 3.5)));
      for (let i = 0; i < strands.length; i++) stepStrand(strands[i], dt);
      for (let i = strands.length - 1; i >= 0; i--) if (strands[i].dead) strands.splice(i, 1);
      for (let i = drops.length - 1; i >= 0; i--) { stepDrop(drops[i], dt); if (drops[i].dead) drops.splice(i, 1); }
      for (const t of tracks) t.age += dt;
      while (tracks.length && tracks[0].age > 3) tracks.shift();
    }

    // ---- Drawing: as it's drawn in its dish, line for line ----

    const OUTLINE = 84, ox = new Float32Array(OUTLINE), oy = new Float32Array(OUTLINE);
    function outline() {
      for (let i = 0; i < OUTLINE; i++) {
        const a = (i / OUTLINE) * Math.PI * 2, r = radius(a);
        ox[i] = blob.x + Math.cos(a) * r;
        oy[i] = blob.y + Math.sin(a) * r;
      }
    }
    function closed(c, inset = 0, fresh = true) {
      const n = OUTLINE;
      const x = i => { i = (i + n) % n; return ox[i] + (blob.x - ox[i]) * inset; };
      const y = i => { i = (i + n) % n; return oy[i] + (blob.y - oy[i]) * inset; };
      if (fresh) c.beginPath();
      c.moveTo((x(n - 1) + x(0)) / 2, (y(n - 1) + y(0)) / 2);
      for (let i = 0; i < n; i++) c.quadraticCurveTo(x(i), y(i), (x(i) + x(i + 1)) / 2, (y(i) + y(i + 1)) / 2);
      c.closePath();
    }
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
    const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
    const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    const INK = '180, 232, 155';
    const DARK = [17, 46, 34], THIN = [46, 132, 92];
    const shine = alpha => `rgba(232, 240, 255, ${alpha})`;
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
    const MOTES = Array.from({ length: 260 }, () => {
      let x, y, z;
      do { x = rand(-1, 1); y = rand(-1, 1); z = rand(0, 1); } while (x * x + y * y + z * z > 1);
      const rho = Math.hypot(x, y);
      return { rho: rho * 0.96, depth: Math.sqrt(1 - rho * rho) - z, th: Math.atan2(y, x), spin: rand(0.05, 0.2) * (Math.random() < 0.8 ? 1 : -1),
        size: Math.random() < 0.1 ? rand(2.6, 4.4) : rand(1, 2.4), ph: rand(0, 6.28), rate: rand(0.5, 1.6), bright: rand(0.3, 1), spark: 0 };
    });
    function motes() {
      const near = aware, dx = Math.cos(blob.la), dy = Math.sin(blob.la);
      ctx.globalCompositeOperation = 'lighter';
      for (const m of MOTES) {
        const th = m.th + flow * m.spin * (1.4 - m.rho), rho = m.rho + 0.05 * Math.sin(flow * 0.4 * m.rate + m.ph), r = radius(th) * rho;
        const x = blob.x + Math.cos(th) * r + dx * near * 16 * (1 - m.rho * 0.6), y = blob.y + Math.sin(th) * r + dy * near * 16 * (1 - m.rho * 0.6);
        const twinkle = 0.55 + 0.45 * Math.sin(flow * m.rate + m.ph * 3);
        if (glow.night) {
          m.spark *= Math.exp(-sinceNight / 0.18);
          if (Math.random() < sinceNight * (0.08 + 1.5 * glow.stirred * glow.stirred)) m.spark = rand(0.4, 0.95);
          let light = 0.09 + 0.09 * twinkle + m.spark;
          for (const f of flashes) light += f.amp * Math.exp(-f.age * 2.6) * bell(Math.hypot(x - f.x, y - f.y) - f.age * 230, 24);
          if (prey) light += 0.2 * aware * bell(Math.hypot(x - prey.x, y - prey.y), 42);
          const size = m.size * (0.8 + 2.4 * m.depth);
          ctx.globalAlpha = Math.min(light * Math.exp(-1.5 * m.depth), 1) * glow.n;
          ctx.drawImage(SOFT, x - size, y - size, size * 2, size * 2);
          continue;
        }
        const a = 0.26 * m.bright * twinkle;
        ctx.globalAlpha = Math.min(a, 1);
        ctx.drawImage(SOFT, x - m.size, y - m.size, m.size * 2, m.size * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
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
    function flesh(c, s) {
      const fill = c.createLinearGradient(vx[0], vy[0], vx[VP - 1] + 0.01, vy[VP - 1]);
      for (let i = 0; i < NP; i++) fill.addColorStop(i / (NP - 1), rgb(mix(DARK, THIN, ease(3.4, 0.8, s.rad[i]))));
      c.fillStyle = fill;
      ribbon(c, 0.74);
    }
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
      const sheen = ctx.createRadialGradient(blob.x + glow.x * r * 0.42, blob.y + glow.y * r * 0.42, 0, blob.x, blob.y, r * 1.15);
      sheen.addColorStop(0, shine(0.2));
      sheen.addColorStop(0.45, shine(0.05));
      sheen.addColorStop(1, shine(0));
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, innerWidth, innerHeight + 300);
      const pan = ctx.createRadialGradient(blob.x, blob.y, r * 0.5, blob.x, blob.y, r * 0.86);
      pan.addColorStop(0, shine(0.1));
      pan.addColorStop(0.45, shine(0.34));
      pan.addColorStop(1, shine(0.92));
      ctx.fillStyle = pan;
      const take = blob.take;
      blob.take = 0;
      ctx.shadowColor = shine(0.5);
      ctx.shadowBlur = 2.5 * dpr;
      pane(ctx, light - 0.56, light - 0.05, 0.56, 0.84);
      pane(ctx, light + 0.05, light + 0.56, 0.56, 0.84);
      ctx.shadowBlur = 0;
      blob.take = take;
      const a = light + Math.PI + 0.7 + 0.2 * Math.sin(time * 0.6), k = radius(a) * (0.66 + 0.05 * Math.sin(time * 0.8));
      ctx.fillStyle = shine(0.55);
      ctx.beginPath();
      ctx.ellipse(blob.x + Math.cos(a) * k, blob.y + Math.sin(a) * k, 3.2, 1.3, a + Math.PI / 2, 0, 6.29);
      ctx.fill();
      ctx.restore();
    }
    // As it's reeled in you can see it's not only got hold of him
    function inHim() {
      if (!prey || !prey.reeling) return;
      const a = ease(0.1, 1.1, prey.reeling);
      ctx.save();
      ctx.beginPath();
      ctx.arc(prey.x, prey.y, 14.5, 0, 6.29);
      ctx.clip();
      ctx.fillStyle = glow.night ? `rgba(${INK}, ${(0.28 * a).toFixed(3)})` : `rgba(${DARK[0]}, ${DARK[1]}, ${DARK[2]}, ${(0.62 * a).toFixed(3)})`;
      ctx.fillRect(prey.x - 16, prey.y - 16, 32, 32);
      ctx.globalCompositeOperation = 'lighter';
      for (const m of prey.specks) {
        const th = m.a + flow * 0.4, x = prey.x + Math.cos(th) * m.rho * 14, y = prey.y + Math.sin(th) * m.rho * 14;
        ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(flow * 3 + m.ph));
        ctx.drawImage(SOFT, x - m.size, y - m.size, m.size * 2, m.size * 2);
      }
      ctx.restore();
    }
    function byDay() {
      sil.setTransform(1, 0, 0, 1, 0, 0);
      sil.clearRect(0, 0, shape.width, shape.height);
      sil.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
      sil.fillStyle = rgb(DARK);
      closed(sil);
      sil.fill();
      for (const s of strands) { view(s); ribbon(sil); }
      for (const d of drops) {
        if (d.up > 0.5) continue;
        sil.beginPath();
        if (d === gag) grip(sil);
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
      ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      ctx.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
      for (const s of strands) { view(s); flesh(ctx, s); }
      shaded();
      for (const s of strands) { if (s.state === 'recoil') continue; view(s); gloss(ctx); streaming(s); }
      // Off the page a bit's shadow comes away from it, fainter and softer the higher it is
      const S = dpr;
      for (const d of drops) {
        const lift = 1 + d.up * 0.028, r = d.r * lift, a = Math.atan2(d.dy, d.dx);
        if (d.up > 0.5) {
          const away = d.up * 0.5 * BIT;
          ctx.shadowColor = `rgba(${glow.shadow}, ${(0.6 - d.up * 0.009).toFixed(3)})`;
          ctx.shadowBlur = (1 + d.up * 0.14) * 2 * S * BIT;
          ctx.shadowOffsetX = (-glow.x * away - 2000) * S;
          ctx.shadowOffsetY = -glow.y * away * S;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(d.x + 2000, d.y, d.r, d.r * 0.9, a, 0, 6.29);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
          ctx.fillStyle = rgb(DARK);
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, r * d.sq, r / d.sq, a, 0, 6.29);
          ctx.fill();
        }
        ctx.fillStyle = shine(0.7);
        ctx.beginPath();
        ctx.arc(d.x + glow.x * r * 0.4, d.y + glow.y * r * 0.4, r * 0.22, 0, 6.29);
        ctx.fill();
      }
      inHim();
    }

    function emission(c, s, width = 1, amount = 1) {
      const fill = c.createLinearGradient(vx[0], vy[0], vx[VP - 1] + 0.01, vy[VP - 1]);
      const strain = s.state === 'attached' ? clamp(s.stretch - 1, 0, 1) : 0;
      for (let i = 0; i < NP; i++) {
        const sp = i / (NP - 1), a = (0.08 + 0.55 * ease(0.7, 3.6, s.rad[i]) + 0.45 * strain) * amount;
        fill.addColorStop(sp, `rgba(${INK}, ${(Math.min(a, 1) * ease(0, 0.2, sp)).toFixed(3)})`);
      }
      c.fillStyle = fill;
      ribbon(c, width);
    }
    const CLOUDS = Array.from({ length: 13 }, () => ({ rho: Math.sqrt(Math.random()) * 0.72, th: rand(0, 6.28), spin: rand(0.03, 0.09), size: rand(0.3, 0.62), a: rand(0.05, 0.12), ph: rand(0, 6.28) }));
    function clouds(level) {
      ctx.globalCompositeOperation = 'lighter';
      for (const c of CLOUDS) {
        const th = c.th + flow * c.spin, r = radius(th), x = blob.x + Math.cos(th) * r * c.rho, y = blob.y + Math.sin(th) * r * c.rho, size = r * c.size;
        ctx.globalAlpha = Math.min(c.a * (1.1 + 0.4 * Math.sin(flow * 0.3 + c.ph)) * level * 1.7, 1);
        ctx.drawImage(SOFT, x - size, y - size, size * 2, size * 2);
      }
    }
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

    const AWAY = 4000;
    function byNight() {
      const S = dpr, L = S / 3, n = glow.n, r = BODY;
      sinceNight = clamp(time - lastNight, 0, 0.1);
      lastNight = time;
      const level = n * (0.68 + 0.42 * glow.stirred) * (0.94 + 0.06 * Math.sin(time * 0.9));
      const world = (c, k, x = 0) => c.setTransform(k, 0, 0, k, x, -top * k);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      world(ctx, S);
      closed(ctx);
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${INK}, ${(0.08 * level).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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
        lo.rect(-300, -300, innerWidth + 600, innerHeight + 600);
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = level;
      ctx.drawImage(spill, 0, 0, canvas.width, canvas.height);

      world(ctx, S);
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
        if (d === gag) grip(ctx);
        else ctx.ellipse(d.x, d.y, r * d.sq, r / d.sq, a, 0, 6.29);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      inHim();

      makeGrain();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = n;
      ctx.drawImage(grain, Math.round(blob.x * S - grain.width / 2), Math.round((blob.y - top) * S - grain.height / 2));
      ctx.globalAlpha = 1;
    }
    // A glow is a long, slow fade across very few of a screen's shades, and a grain of a shade or
    // two either way, over all of it, breaks up the bands
    let grain = null;
    function makeGrain() {
      const D = Math.ceil(620 * dpr);
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

    function open() {
      if (canvas) return;
      glow.night = host.night();
      glow.n = glow.night ? 1 : 0;
      const height = Math.min(innerHeight, CANVAS);
      dpr = Math.min(devicePixelRatio || 1, 2);
      top = innerHeight - height;
      canvas = layer(Math.round(innerWidth * dpr), Math.round(height * dpr));
      canvas.className = 'symbiote';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.height = `${height}px`;
      ctx = canvas.getContext('2d');
      shape = layer(canvas.width, canvas.height);
      sil = shape.getContext('2d');
      low = layer(Math.ceil(canvas.width / 3), Math.ceil(canvas.height / 3));
      lo = low.getContext('2d');
      spill = layer(low.width, low.height);
      pool = spill.getContext('2d');
      document.body.append(canvas);
    }
    function close() {
      canvas.remove();
      canvas = null;
      running = false;
    }
    function frame(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      acc += dt;
      let n = 0;
      while (acc >= SUB && n < 14) { step(SUB); acc -= SUB; n++; }
      if (n === 14) acc = 0;
      if (prey) prey.move(prey.x, prey.y, prey.face, 1);
      if (meal) meal.move(meal.x, meal.y, meal.face, 1 - ease(0.1, 0.8, meal.t));
      glow.night = host.night();
      draw();
      // It's the canvas's now, from the frame it's drawn on
      if (bait && gag) { bait.take(); bait = null; }
      // Nothing to wait for, and nothing still out
      if (!prey && !meal && !strands.length && !drops.length && !tracks.length && blob.y > rest() - 2) return close();
      requestAnimationFrame(frame);
    }
    function run() {
      open();
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }

    return {
      strike(x, y, chunk, move, freed, gone) {
        blob.x = chunk.x;
        if (!running) blob.y = blob.ty = rest();
        bait = chunk;
        prey = { x, y, vx: 0, vy: 0, t: 0, face: Math.PI, side: Math.random() < 0.5 ? -1 : 1, nextDash: 0.2, dashUntil: 0, boltUntil: 0, bolts: 0, more: 0, sent: 0, breaks: null, dx: 0, dy: 0, reeling: 0, freed, specks: Array.from({ length: 12 }, () => ({ a: rand(0, 6.28), rho: Math.sqrt(Math.random()), size: rand(1.2, 3), ph: rand(0, 6.28) })), move, gone };
        layLine(chunk);
        gag = { x: chunk.x, y: chunk.y, x0: chunk.x, y0: chunk.y, r: chunk.r, r0: chunk.r, t: 0, phase: 0, dx: 0, dy: 1, sq: 1, up: 0, land: 0, step: 0, state: 'gag' };
        drops.push(gag);
        spawnReach(true);
        spawnReach(true);
        run();
      },
    };
  }

  // ---- Him ----

  const chart = document.querySelector('.chart');
  if (!chart) return;
  const pac = chart.querySelector('.pac');
  const face = pac.firstElementChild;
  const header = document.querySelector('header');
  const wide = matchMedia('(min-width: 1160px)');
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  const place = (out, y, angle) => {
    pac.style.transform = `translate(${-out}px, ${y}px)`;
    face.style.transform = `rotate(${angle}deg)`;
  };

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    place(0, 14, 180);
    return;
  }

  // Level one of the arcade game: 60.6 pixels a second, and he's 13 across. Off-screen is the
  // only time he goes any faster.
  const SPEED = (60.6 / 13) * pac.offsetWidth;
  const DOWN = 180;
  const UP = 0;
  const LEFT = -90;
  const RIGHT = 90;

  let stops = [];
  let branches = [];
  let branch = null;
  let out = 0;
  let y = 0;
  let angle = DOWN;
  let last = 0;
  let frame = 0;
  let taken = false;

  const under = underThePage({
    night: () => !!pac.closest('.dark-mode') || document.documentElement.classList.contains('dark-mode'),
  });

  const fromBottom = () => document.documentElement.scrollHeight - innerHeight - scrollY;
  const atBottom = () => fromBottom() < 3;
  const lineX = () => chart.getBoundingClientRect().left + parseFloat(getComputedStyle(pac).left);
  // Everything he can eat, by how far down it is
  function survey() {
    const top = chart.getBoundingClientRect().top;
    stops = [...chart.querySelectorAll('.minors li')].map(el => ({
      el,
      y: el.getBoundingClientRect().top - top + 12,
    }));
    const heads = [...chart.querySelectorAll('.major')].map(el => ({ el, head: el.querySelector('.major-head') }));
    if (!wide.matches) {
      stops.push(...heads.map(({ el }) => ({ el, y: el.getBoundingClientRect().top - top + 24 })));
      // With nothing under the page to stop him, he gets it
      const chunk = theEnd();
      stops.push({ el: chunk.el, y: chunk.middle - top - chunk.height });
      branches = [];
      return;
    }
    branches = heads.map(({ el, head }) => {
      const run = getComputedStyle(head, '::before');
      const length = parseFloat(run.width);
      const clear = parseFloat(run.paddingRight);
      const known = branches.find(known => known.el === el);
      return {
        el,
        length,
        // They're laid in threes
        clear,
        step: (length - clear) / (3 * Math.max(1, Math.round((length - clear) / (3 * parseFloat(run.fontSize))))),
        y: head.getBoundingClientRect().top - top + parseFloat(run.top),
        done: known ? known.done : false,
      };
    });
  }

  // Up to the big one, at the end of the trail, with his mouth on it
  function theEnd() {
    const today = chart.querySelector('.today'), chunk = getComputedStyle(today, '::before');
    const middle = today.getBoundingClientRect().top + parseFloat(chunk.top);
    return { el: today, middle, height: parseFloat(chunk.height), width: parseFloat(chunk.width) };
  }

  // On to the last thing there is to eat on the screen, and there he waits for more. With nothing
  // left in sight he stays where he is, if that's somewhere he can be seen.
  function wanted() {
    const bar = header.getBoundingClientRect();
    const top = chart.getBoundingClientRect().top;
    const floor = (bar.top > innerHeight / 2 ? bar.top : innerHeight) - 24 - top;
    const chunk = theEnd();
    const end = chunk.middle - top - chunk.height / 2 - 13;
    if (end <= floor) return end;
    let food = -Infinity;
    for (const stop of stops) {
      if (stop.y <= floor && !stop.el.classList.contains('eaten')) food = Math.max(food, stop.y - 10);
    }
    for (const run of branches) {
      if (run.y <= floor && !run.done) food = Math.max(food, run.y + 2);
    }
    return food > -Infinity ? food : clamp(y, Math.min(innerHeight * 0.25 - top, floor), floor);
  }

  const swing = (facing, dt) => {
    angle += (((facing - angle + 540) % 360) - 180) * Math.min(1, dt * 18);
  };
  const eatRun = (run, reach) => {
    const gone = Math.min(run.length, run.clear + Math.max(0, Math.ceil((reach - run.clear) / run.step)) * run.step);
    run.el.style.setProperty('--gone', `${gone.toFixed(1)}px`);
  };
  const finish = run => {
    run.done = true;
    run.el.classList.add('eaten');
    eatRun(run, run.length);
  };

  function walk(time) {
    const dt = Math.min(0.05, (time - last) / 1000 || 0.016);
    last = time;
    // Nobody's watching him off-screen, so he's only ever just out of sight
    const top = chart.getBoundingClientRect().top;
    const seenAt = y + top;
    if (seenAt < -40 || seenAt > innerHeight + 40) {
      y = clamp(seenAt, -40, innerHeight + 40) - top;
      if (branch) finish(branch);
      out = 0;
      branch = null;
      place(out, y, angle);
      stops.forEach(stop => {
        if (y + 12 >= stop.y) stop.el.classList.add('eaten');
      });
      branches.forEach(run => {
        if (!run.done && y >= run.y) finish(run);
      });
    }
    const away = wanted() - y;

    // Down a run of pellets and back, unless you've gone on without him
    if (branch) {
      const going = branch.going;
      out += (going ? 1 : -1) * SPEED * dt;
      swing(going ? LEFT : RIGHT, dt);
      if (going) {
        eatRun(branch, out + 10);
        if (out >= branch.length) branch.going = false;
      } else if (out <= 0) {
        out = 0;
        branch = null;
      }
      pac.classList.add('walking');
      place(out, y, angle);
      frame = requestAnimationFrame(walk);
      return;
    }

    if (Math.abs(away) < 1.5) {
      frame = 0;
      pac.classList.remove('walking');
      if (atBottom() && wide.matches && mouse.matches && !taken) snatch();
      return;
    }

    y += Math.sign(away) * Math.min(Math.abs(away), SPEED * dt);
    swing(away > 0 ? DOWN : UP, dt);
    if (away > 0) {
      stops.forEach(stop => {
        if (y + 12 >= stop.y) stop.el.classList.add('eaten');
      });
      for (const run of branches) {
        if (run.done || y < run.y) continue;
        y = run.y;
        run.done = true;
        run.el.classList.add('eaten');
        branch = run;
        branch.going = true;
        break;
      }
    }

    pac.classList.add('walking');
    place(out, y, angle);
    frame = requestAnimationFrame(walk);
  }

  const wake = () => {
    if (frame || taken) return;
    last = performance.now();
    frame = requestAnimationFrame(walk);
  };

  addEventListener('scroll', () => {
    wake();
  }, { passive: true });
  addEventListener('resize', () => {
    survey();
    wake();
  });

  function snatch() {
    taken = true;
    const box = pac.getBoundingClientRect();
    const chunk = theEnd();
    const bait = { x: lineX(), y: chunk.middle, r: (chunk.width + chunk.height) / 4, take: () => chunk.el.classList.add('eaten') };
    pac.style.position = 'fixed';
    pac.style.left = '0';
    // Open, with that in it
    pac.classList.remove('walking');
    under.strike(box.left + box.width / 2, box.top + box.height / 2, bait, (x, y, facing, seen) => {
      pac.style.transform = `translate(${x}px, ${y}px)`;
      pac.style.opacity = seen;
      face.style.transform = `rotate(${facing}rad)`;
    }, () => pac.classList.add('walking'), () => {
      pac.hidden = true;
    });
  }

  survey();
  new ResizeObserver(survey).observe(chart);
  document.fonts.ready.then(survey);
  // He comes out from under the navigation, which is over him, and well under it, since the page
  // can still settle a little. On a phone that's at the bottom, so he comes in from the top.
  const bar = header.getBoundingClientRect().bottom;
  y = (bar < innerHeight / 2 ? bar : 0) - pac.offsetHeight - 2 - chart.getBoundingClientRect().top;
  place(out, y, angle);
  wake();
})();
