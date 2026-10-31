/* What's in the Petri dish: nearly black by day, shy of the light, and curious. It wanders,
   feels the glass, and when a pointer comes close it leans over, climbs out, takes hold of it
   and feeds. Pull hard enough and a tentacle necks and snaps, and what's left crawls home.
   At night it glows, the colour of the ink on the table's labels, which is no coincidence:
   it's been out. It's lit as a light would be: what shines through it adds up along the line
   of sight, and it sparks where it's stirred, like the sea does. And it knows who's in the
   Polaroid: point at him and see. Its prints, and the trail to the nearest of them, only show in the dark.

   The way its tentacles move is adapted from Venom Button by exteestudio, which draws them in
   3D with WebGL; here they're flat, on a canvas, and light comes from the table.

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
  const obj = document.getElementById('playground');
  const canvas = document.querySelector('.goo');
  const prints = document.querySelector('.goo-prints');
  if (!obj || !canvas || !prints) return;
  const dish = obj.querySelector('.item');
  const table = obj.closest('.table');
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Everything's worked out in units of a dish 216 across, in the middle of a square VIEW
  // across, which is as far as it can reach
  const VIEW = 780, MID = VIEW / 2, WALL = 98, BODY = 50;
  // The outside of the dish's rim; how far off it a bit gathers itself; and how high it's
  // got to get to clear it, about as high as the dish is
  const RIM = 108, TAKEOFF = 13, CLEAR = 26;
  const NP = 14, MAX_STRANDS = 14;
  const SUB = 1 / 120, ITER = 3;
  const P = { reach: 200, awareness: 290, maxStrands: 7, snapStretch: 1.75, maxLen: 285, creep: 0.25, magnet: 1.6 };
  const LIMIT = VIEW / 2 - 52;

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const turn = a => Math.atan2(Math.sin(a), Math.cos(a));
  const bell = (x, w) => Math.exp(-((x / w) ** 2));

  const ctx = canvas.getContext('2d');
  const shape = document.createElement('canvas');
  const sil = shape.getContext('2d');
  const low = document.createElement('canvas'), lo = low.getContext('2d');
  const spill = document.createElement('canvas'), pool = spill.getContext('2d');
  let sinceNight = 0, lastNight = 0;

  let scale = 1, dpr = 1, rect = null;
  let time = still ? 40 : rand(0, 100), frames = 0;
  const strands = [], drops = [], ripples = [];
  const blob = { x: MID, y: MID, tx: MID, ty: MID, next: 3, lean: 0, la: 0, grow: still ? 1 : 0.2, size: 1, sizeV: 0, over: 0 };
  const cur = { x: -1e4, y: -1e4, vx: 0, present: false };
  const tracks = [], spores = [], flashes = [];
  let flow = rand(0, 50);
  const glow = { x: -0.53, y: -0.85, cast: [8, 12, 4], touch: [1, 1, 1], shadow: '28, 34, 44', night: null, n: 0, stirred: 0.25 };
  let lastSnap = -1, lastSpawn = -1, lastMicro = -1, nextProbe = 2.2, lastFeel = 6, lastProbeAt = Math.random() * 6.28, aware = 0;

  function spring(o, k, v, target, w, z, dt) {
    o[v] += (w * w * (target - o[k]) - 2 * z * w * o[v]) * dt;
    o[k] += o[v] * dt;
  }

  // ---- The body: a wandering outline, drawn out towards whatever's got its attention ----

  function radius(a) {
    const t = time * 1.5, R = BODY * blob.grow * blob.size;
    let r = R * (1 + 0.085 * Math.sin(2 * a + t * 0.31 + 1) + 0.06 * Math.sin(3 * a - t * 0.23 + 2) +
      0.034 * Math.sin(5 * a + t * 0.41) + 0.016 * Math.sin(8 * a - t * 0.7 + 4));
    if (blob.lean > 0.001) r += blob.lean * R * 0.3 * bell(turn(a - blob.la), 0.62);
    for (const s of strands) if (s.mound > 0.05 && s.pin === 'anchor') r += s.mound * bell(turn(a - s.a), 0.13 + 0.09 * s.elong);
    for (const w of ripples) r += w.amp * 7 * Math.exp(-w.age * 4) * bell(turn(a - w.a), 0.3 + w.age);
    return r;
  }
  // Where a point is, from the body: nearest point on its edge, which way's out, how far off
  function edge(x, y) {
    const dx = x - blob.x, dy = y - blob.y, L = Math.hypot(dx, dy) || 1e-3, a = Math.atan2(dy, dx), r = radius(a);
    return { a, nx: dx / L, ny: dy / L, d: L - r, r };
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

  function newStrand(kind, a) {
    const s = {
      kind, state: 'grow', pin: 'anchor', a,
      pos: new Float32Array(NP * 2), prev: new Float32Array(NP * 2), rad: new Float32Array(NP).fill(1.5),
      u: 0, ud: 0, uKick: true, rest: 1, vol: 0, stretch: 1, pinch: 0, len: 0,
      neckS: rand(0.42, 0.62), side: Math.random() < 0.5 ? -1 : 1, wig: rand(0.5, 1.2), phase: rand(0, 100),
      snapMul: rand(0.85, 1.15), lenMul: rand(0.88, 1.12), lat: 0, life: 0, ttl: 0,
      probe: null, mound: 0, elong: 0, dead: false, retract: 0,
    };
    const [x, y] = at(a, 5), nx = Math.cos(a), ny = Math.sin(a);
    for (let i = 0; i < NP; i++) {
      s.pos[i * 2] = s.prev[i * 2] = x + nx * i * 0.4;
      s.pos[i * 2 + 1] = s.prev[i * 2 + 1] = y + ny * i * 0.4;
    }
    return s;
  }
  function spawnReach(toward) {
    if (strands.length >= MAX_STRANDS - 1) return;
    const k = strands.filter(s => s.kind === 'reach' && s.pin === 'anchor' && s.state !== 'recoil').length;
    const lat = ([0, 0.5, -0.5, 0.95, -0.95, 1.35, -1.35][k % 7]) + rand(-0.1, 0.1);
    const s = newStrand('reach', toward + lat);
    s.lat = lat;
    s.vol = Math.PI * 2.5 * 2.5 * 170;
    // Each takes hold in its own place, close round the tip of the pointer, and works at it
    s.hold = { r: rand(2, 6), a: rand(0, 6.28), spin: rand(0.7, 1.5) * (Math.random() < 0.5 ? -1 : 1), x: cur.x, y: cur.y };
    strands.push(s);
  }
  // Short hairs that stand up all over the side facing the pointer, and never catch it
  function spawnMicro(toward) {
    if (strands.length >= MAX_STRANDS - 4) return;
    const lat = rand(-1, 1) * 1.1, s = newStrand('micro', toward + lat);
    s.lat = lat;
    s.probe = { len: rand(0.5, 1.2), ph: rand(0, 6.28) };
    s.ttl = rand(0.7, 1.9);
    s.vol = Math.PI * 0.7 * 0.7 * 40;
    strands.push(s);
  }
  // Left alone: two or three thin strands curl out, glide along, and sink back
  function spawnProbe() {
    const dir = Math.random() < 0.5 ? -1 : 1, n = Math.random() < 0.5 ? 2 : 3;
    lastProbeAt += rand(1.6, 4.7);
    for (let i = 0; i < n && strands.length < MAX_STRANDS - 2; i++) {
      const a = lastProbeAt + (i - (n - 1) / 2) * 0.22 + rand(-0.05, 0.05), s = newStrand('probe', a);
      s.probe = { dist: rand(11, 20), dir, delay: i * 0.07 };
      s.ttl = rand(0.8, 1.0);
      s.vol = Math.PI * 0.95 * 0.95 * 40;
      strands.push(s);
    }
  }
  // And now and then one goes all the way to the glass, and feels along it for a way out
  function spawnFeeler() {
    const a = lastProbeAt += rand(1.6, 4.7), s = newStrand('probe', a);
    const [x, y] = at(a);
    const dx = x - MID, dy = y - MID, b = dx * Math.cos(a) + dy * Math.sin(a), c = dx * dx + dy * dy - (WALL - 6) ** 2;
    s.probe = { dist: Math.max(-b + Math.sqrt(Math.max(b * b - c, 0)), 14), dir: Math.random() < 0.5 ? -1 : 1, delay: 0, glide: 70 };
    s.ttl = rand(2.2, 3);
    s.vol = Math.PI * 1.1 * 1.1 * 80;
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
  // It parts at the neck: the base whips home, the tip unwinds, and falls, and crawls back
  function split(s) {
    const k = s.neckS * (NP - 1);
    const base = { ...s, kind: 'piece', state: 'recoil', pin: 'anchor', pinch: 0, wrap: null,
      pos: resample(s.pos, 0, k), prev: resample(s.prev, 0, k), rad: new Float32Array(NP), vol: s.vol * s.neckS };
    const o = (NP - 1) * 2;
    const tip = { ...s, kind: 'piece', state: 'recoil', pin: 'free', pinch: 0, mound: 0, end: [s.pos[o], s.pos[o + 1]],
      pos: resample(s.pos, NP - 1, k), prev: resample(s.prev, NP - 1, k), rad: new Float32Array(NP), vol: s.vol * (1 - s.neckS) };
    base.len = s.len * s.neckS; base.rest = base.len / (NP - 1);
    tip.len = s.len * (1 - s.neckS); tip.rest = tip.len / (NP - 1);
    base.retract = tip.retract = 0;
    strands[strands.indexOf(s)] = base;
    if (strands.length < MAX_STRANDS) strands.push(tip);
    ripple(s.a, 0.8);
    flash(...at(s.a, 4), 1);
    lastSnap = time;
    if (drops.length < 6) {
      // However far away it was flung, it lands where it can be seen getting back
      const L = Math.hypot(s.pos[o] - MID, s.pos[o + 1] - MID) || 1, far = Math.min(L, rand(190, 235)) / L;
      const a = Math.atan2(s.pos[o + 1] - MID, s.pos[o] - MID) + rand(-0.3, 0.3);
      const x = MID + Math.cos(a) * L * far, y = MID + Math.sin(a) * L * far;
      drops.push({ x, y, r: rand(2.6, 4.2), t: rand(0, 3), phase: rand(0, 6.28), dx: 1, dy: 0, sq: 1, up: 0, land: 0, step: 0,
        state: 'crawl', outside: Math.hypot(x - MID, y - MID) > RIM, tries: 0 });
    }
  }
  function releaseAll(absorb) {
    for (const s of strands) {
      if (s.kind === 'reach' && (s.state === 'grow' || s.state === 'attached')) {
        if (absorb || s.state === 'grow') { s.state = 'recoil'; s.kind = 'piece'; } else if (!s.pinch) s.pinch = 1e-4;
      }
    }
  }

  // A swelling, on its way along a tentacle that's got hold of something, from it to the body
  const pulse = (s, sp) => {
    const beat = (time * (0.7 + 0.5 * clamp(s.stretch - 1, 0, 1)) + s.phase) % 1.5;
    return bell(sp - (1.2 - beat), 0.1);
  };

  function stepStrand(s, dt) {
    s.life += dt;
    const R = s.pin === 'anchor' ? at(s.a, 5) : s.end;

    // Where the tip wants to be
    let T = null;
    if (s.kind === 'reach' && (s.state === 'grow' || s.state === 'attached')) {
      const h = s.hold, k = 1 - Math.exp(-dt * 24);
      h.a += h.spin * dt;
      // It's dragged along by the pointer, a moment behind it
      h.x += (cur.x + Math.cos(h.a) * h.r - h.x) * k;
      h.y += (cur.y + Math.sin(h.a) * h.r - h.y) * k;
      T = [h.x, h.y];
      // Sticky feet: its root peels along the surface towards the pointer
      if (s.state === 'attached') s.a += turn(edge(cur.x, cur.y).a + s.lat - s.a) * (1 - Math.exp(-dt * 1.4));
    } else if (s.kind === 'micro' && s.state !== 'recoil') {
      s.a += turn(edge(cur.x, cur.y).a + s.lat - s.a) * (1 - Math.exp(-dt * 2));
      const nx = Math.cos(s.a), ny = Math.sin(s.a);
      let tx = cur.x - R[0], ty = cur.y - R[1];
      const tl = Math.hypot(tx, ty) || 1;
      let dx = nx * 0.25 + (tx / tl) * 0.75, dy = ny * 0.25 + (ty / tl) * 0.75;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const len = (10 + 34 * aware) * s.probe.len, sway = Math.sin(time * 3 + s.probe.ph) * 4;
      T = [R[0] + dx * len - dy * sway, R[1] + dy * len + dx * sway];
      if (s.life > s.ttl || aware < 0.08) { s.state = 'recoil'; T = null; }
    } else if (s.kind === 'probe' && s.state !== 'recoil') {
      const p = s.probe, f = clamp((s.life - p.delay) / s.ttl, 0, 1), wave = Math.sin(Math.PI * f);
      const nx = Math.cos(s.a), ny = Math.sin(s.a), glide = p.dir * (f - 0.3) * (p.glide || 24), out = 3 + p.dist * wave;
      T = [R[0] + nx * out - ny * glide * wave, R[1] + ny * out + nx * glide * wave];
      if (s.life > s.ttl + p.delay) { s.state = 'recoil'; T = null; }
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
        s.rest = Lr / (NP - 1);
        s.stretch = L0 / Math.max(Lr, 1);
        if (s.kind === 'reach' && !s.pinch && (s.stretch > P.snapStretch * s.snapMul || L0 > P.maxLen * s.lenMul)) s.pinch = 1e-4;
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
    const amp = (still || s.state === 'recoil' ? 0 : 700) * clamp(1.35 - s.stretch, 0.15, 1) * (s.state === 'grow' ? 0.4 : 1);
    const mag = (s.kind === 'reach' || s.kind === 'micro') && s.state !== 'recoil' && cur.present ? P.magnet * 900 * dt * dt : 0;
    for (let i = 1; i < NP; i++) {
      const o = i * 2, sp = i / (NP - 1);
      const vx = (pos[o] - prev[o]) * damp, vy = (pos[o + 1] - prev[o + 1]) * damp;
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1];
      const env = Math.sin(Math.PI * sp), wave = Math.sin(sp * 8.5 - time * 7.5 + s.phase) * env * amp * dt * dt;
      pos[o] += vx + px * wave;
      pos[o + 1] += vy + py * wave;
      if (mag) {
        const mx = cur.x - pos[o], my = cur.y - pos[o + 1], ml = Math.hypot(mx, my) || 1;
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
        if (!ws) continue;
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
        if (!ws) continue;
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
    const bead = held ? clamp((s.stretch - 1.5) / 0.8, 0, 1) : 0, beadFreq = L / (9 * Math.max(rMean, 0.6));
    const cap = s.state === 'recoil' ? Math.min(0.8, s.retract * 3) : 0;
    for (let i = 0; i < NP; i++) {
      const sp = i / (NP - 1);
      let r = rMean * (s.pin === 'free' ? 0.6 : 1 + 1.1 * Math.exp(-sp / 0.1));
      if (s.kind === 'reach' || s.kind === 'micro' || s.kind === 'probe') r *= 1 - 0.68 * ease(0.5, 1, sp);
      else r *= 1 + (0.5 + cap) * Math.exp(-(1 - sp) / 0.07);
      r *= 1 - nk * Math.exp(-(((sp - s.neckS) / 0.16) ** 2));
      r *= 1 + bead * 0.3 * Math.sin(sp * Math.PI * 2 * beadFreq + s.phase);
      if (held) r *= 1 + 0.42 * pulse(s, sp) * (1 - nk);
      s.rad[i] = Math.max(r, 0.35);
    }

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

  // The dish stands on the table, so a bit that's crawled home has to get back into it: it
  // stops at the foot of the wall, gathers itself, and jumps. Some don't make it the first
  // time, hit the glass, and drop back for another go.
  function stepDrop(d, dt) {
    d.t += dt;
    if (d.up < 0.5 && (d.step += dt) > 0.05) {
      d.step = 0;
      tracks.push({ x: d.x, y: d.y, r: d.r * 0.5, age: 0, of: d });
    }
    d.land *= Math.exp(-dt * 9);
    if (d.state === 'crouch') {
      d.wait -= dt;
      d.sq = 1 + 0.75 * (1 - Math.max(d.wait, 0) / d.crouch) + d.land;
      if (d.wait > 0) return;
      const dx = d.x - MID, dy = d.y - MID, L = Math.hypot(dx, dy) || 1, short = d.tries === 0 && Math.random() < 0.35;
      const far = short ? RIM - 1 : rand(WALL - 18, WALL - 10);
      Object.assign(d, { state: 'air', flight: 0, short, tries: d.tries + 1, x0: d.x, y0: d.y, x1: MID + (dx / L) * far, y1: MID + (dy / L) * far });
      d.time = short ? 0.2 : 0.42;
      d.dx = -dx / L; d.dy = -dy / L;
    }
    if (d.state === 'air') {
      d.flight += dt / d.time;
      const f = Math.min(d.flight, 1);
      d.x = d.x0 + (d.x1 - d.x0) * f;
      d.y = d.y0 + (d.y1 - d.y0) * f;
      d.up = (d.short ? CLEAR * 0.72 * Math.sin(f * Math.PI / 2) : (CLEAR + 8) * 4 * f * (1 - f));
      d.sq = 1 + 0.5 * Math.abs(1 - 2 * f);     // Drawn out as it goes, round at the top
      if (f < 1) return;
      if (d.short) {
        // Off the glass, back down where it came from
        Object.assign(d, { state: 'fall', flight: 0, time: 0.24, top: d.up, land: 0.5, x1: d.x0, y1: d.y0, x0: d.x, y0: d.y });
        return;
      }
      d.up = 0;
      d.state = 'crawl';
      d.outside = false;
      d.land = 1.1;
    }
    if (d.state === 'fall') {
      d.flight += dt / d.time;
      const f = Math.min(d.flight, 1);
      d.x = d.x0 + (d.x1 - d.x0) * f;
      d.y = d.y0 + (d.y1 - d.y0) * f;
      d.up = d.top * (1 - f * f);
      if (f < 1) return;
      Object.assign(d, { state: 'crouch', up: 0, land: 0.9, crouch: 0.42, wait: 0.42 });   // A moment to recover
      return;
    }
    const e = edge(d.x, d.y), pulse = Math.sin(d.t * 9) ** 2, speed = 34 + 96 * pulse, wob = Math.sin(d.t * 11 + d.phase) * 22;
    d.dx = -e.nx; d.dy = -e.ny;
    d.x += (-e.nx * speed - e.ny * wob) * dt;
    d.y += (-e.ny * speed + e.nx * wob) * dt;
    d.sq = 1 + 0.4 * pulse + d.land;
    if (d.outside && Math.hypot(d.x - MID, d.y - MID) < RIM + TAKEOFF) {
      Object.assign(d, { state: 'crouch', crouch: rand(0.16, 0.3), dx: -e.nx, dy: -e.ny });
      d.wait = d.crouch;
    }
    if (e.d < 0) { d.dead = true; ripple(e.a, 1); flash(d.x, d.y, 0.5); }
  }

  function step(dt) {
    if (!still) time += dt;
    blob.grow += (1 - blob.grow) * (1 - Math.exp(-dt * 1.4));
    const e = edge(cur.x, cur.y), present = cur.present && blob.grow > 0.6 && !(leap && leap.off);
    const inside = present && e.d < -4;
    blob.over += ((inside ? 1 : 0) - blob.over) * (1 - Math.exp(-dt * 6));
    flow += dt * (1 + 2 * aware + 2.5 * blob.over);
    if (glow.night && spores.length < 16 && Math.random() < dt * 5) {
      const a = rand(0, 6.28), [x, y] = at(a, 2);
      spores.push({ x, y, vx: Math.cos(a) * rand(5, 13), vy: Math.sin(a) * rand(5, 13), age: 0, life: rand(2.5, 5.5), size: rand(1, 2.2), ph: rand(0, 6.28) });
    }
    for (let i = spores.length - 1; i >= 0; i--) {
      const m = spores[i];
      m.age += dt;
      m.x += (m.vx + Math.sin(m.age * 1.7 + m.ph) * 7) * dt;
      m.y += (m.vy + Math.cos(m.age * 1.3 + m.ph) * 7) * dt;
      // They can't get through the glass
      const dx = m.x - MID, dy = m.y - MID, L = Math.hypot(dx, dy);
      if (L > WALL - 3) { m.x = MID + (dx / L) * (WALL - 3); m.y = MID + (dy / L) * (WALL - 3); m.vx *= 0.5; m.vy *= 0.5; }
      if (m.age > m.life) spores.splice(i, 1);
    }
    glow.n = glow.night ? glow.n + (1 - glow.n) * (1 - Math.exp(-dt * 2.5)) : 0;
    const rest = 0.25 + 0.45 * Math.max(aware, ready) + 0.6 * blob.over;
    glow.stirred += (rest - glow.stirred) * (1 - Math.exp(-dt * (rest > glow.stirred ? 7 : 1.2)));
    for (const f of flashes) f.age += dt;
    while (flashes.length && flashes[0].age > 1.4) flashes.shift();
    // It doesn't care for daylight. By night it spreads out, and it's braver.
    gone += ((leap && leap.off ? 1 : 0) - gone) * (1 - Math.exp(-dt * 8));
    // Point near him and it's seen where you're going: it gets ready, by as much as you're near
    ready += (nearing - ready) * (1 - Math.exp(-dt * (nearing > ready ? 5 : 3)));
    const winding = leap && !leap.off, coil = winding ? 1 : leap ? 0 : ready, tense = coil > 0.02;
    spring(blob, 'size', 'sizeV', (glow.night ? 1.08 : 0.94) * (1 - 0.24 * coil) * (1 - 0.5 * gone), leap ? 18 : tense ? 10 : 3, 0.5, dt);
    const reach = P.reach * (glow.night ? 1.15 : 1);
    aware = present && !inside ? ease(P.awareness * (glow.night ? 1.15 : 1), 18, e.d) : 0;

    // Leans, and shifts its weight, towards the pointer. Left alone it sets off somewhere else.
    if (aware > 0.02 || inside) {
      const dx = cur.x - MID, dy = cur.y - MID, L = Math.hypot(dx, dy) || 1, far = Math.min(L, 36);
      blob.tx = MID + (dx / L) * far; blob.ty = MID + (dy / L) * far;
      blob.next = time + rand(3, 6);
      blob.la += turn(e.a - blob.la) * (1 - Math.exp(-dt * 8));
    } else if (time > blob.next) {
      const a = rand(0, 6.28), far = rand(0, 34);
      blob.tx = MID + Math.cos(a) * far; blob.ty = MID + Math.sin(a) * far;
      blob.next = time + rand(4, 8);
    }
    // Winding up: it draws back from where it's going, and holds there, quite still
    if (tense) {
      const dir = winding ? leap.dir : aim;
      blob.tx = MID - Math.cos(dir) * 30 * coil; blob.ty = MID - Math.sin(dir) * 30 * coil;
      blob.next = time + 2;
      nextProbe = Math.max(nextProbe, time + 1);
      blob.la += turn(dir - blob.la) * (1 - Math.exp(-dt * (8 + 22 * coil)));
    }
    const k = 1 - Math.exp(-dt * (winding ? 16 : tense ? 6 : aware > 0.02 ? 2.2 : 0.5));
    blob.x += (blob.tx - blob.x) * k;
    blob.y += (blob.ty - blob.y) * k;
    const strain = Math.max(aware, 1.5 * coil), quiver = (1 - coil) * 0.03 * Math.sin(time * 19);
    blob.lean += ((still ? 0 : strain) * (1 + quiver) - blob.lean) * (1 - Math.exp(-dt * (6 + 16 * coil)));

    if (!still) {
      const active = strands.filter(s => s.kind === 'reach' && (s.state === 'grow' || s.state === 'attached')).length;
      if (!present) releaseAll(false);
      else if (inside) releaseAll(true);
      else {
        const want = e.d < reach ? Math.round(4 + (P.maxStrands - 4) * ease(reach, reach * 0.45, e.d)) : 0;
        if (active < want && time - lastSpawn > rand(0.03, 0.06) && time - lastSnap > 0.15) { spawnReach(e.a); lastSpawn = time; }
        const micro = strands.filter(s => s.kind === 'micro' && s.state !== 'recoil').length;
        if (micro < Math.round(7 * ease(0.1, 0.8, aware)) && time - lastMicro > rand(0.03, 0.07)) { spawnMicro(e.a); lastMicro = time; }
      }
      if (!inside && aware < 0.02 && time > nextProbe && blob.grow > 0.95) {
        if (strands.every(s => s.kind === 'probe' || s.state === 'recoil')) {
          if (time - lastFeel > 9) { spawnFeeler(); lastFeel = time; } else spawnProbe();
        }
        nextProbe = time + rand(1.8, 3.4) * (glow.night ? 0.6 : 1);
      }
    }

    for (let i = 0; i < strands.length; i++) stepStrand(strands[i], dt);
    for (let i = strands.length - 1; i >= 0; i--) if (strands[i].dead) strands.splice(i, 1);
    for (let i = drops.length - 1; i >= 0; i--) { stepDrop(drops[i], dt); if (drops[i].dead) drops.splice(i, 1); }
    for (const r of ripples) r.age += dt;
    while (ripples.length && ripples[0].age > 1.6) ripples.shift();
    for (const t of tracks) t.age += dt;
    while (tracks.length && tracks[0].age > 3) tracks.shift();

    cur.vx *= Math.exp(-dt * 8);
  }

  // ---- Drawing ----

  const OUTLINE = 84, ox = new Float32Array(OUTLINE), oy = new Float32Array(OUTLINE);
  function outline() {
    for (let i = 0; i < OUTLINE; i++) {
      const a = (i / OUTLINE) * Math.PI * 2, r = radius(a);
      ox[i] = blob.x + Math.cos(a) * r;
      oy[i] = blob.y + Math.sin(a) * r;
    }
  }
  // Through the middles of the sides, so it's smooth
  function closed(c, xs, ys, n, inset = 0, fresh = true) {
    const x = i => { i = (i + n) % n; return xs[i] + (blob.x - xs[i]) * inset; };
    const y = i => { i = (i + n) % n; return ys[i] + (blob.y - ys[i]) * inset; };
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
  const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
  const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const INK = '180, 232, 155';
  const DARK = [17, 46, 34], THIN = [46, 132, 92];
  const shine = alpha => `rgba(232, 240, 255, ${alpha})`;
  // What it's full of. Each has its own place in the body, as a share of the way to the edge
  // and an angle, so that they stay in it however it changes shape. They're soft dots, added
  // to what's under them: a little light by day, and all the light there is by night.
  const sprite = colour => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${colour}, 1)`);
    g.addColorStop(0.3, `rgba(${colour}, 0.55)`);
    g.addColorStop(1, `rgba(${colour}, 0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return c;
  };
  const SOFT = sprite('190, 236, 165');
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
    const near = aware + blob.over, dx = Math.cos(blob.la), dy = Math.sin(blob.la);
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
        if (cur.present) light += (0.2 * aware + blob.over) * bell(Math.hypot(x - cur.x, y - cur.y), 42);
        const size = m.size * (0.8 + 2.4 * m.depth);
        ctx.globalAlpha = Math.min(light * Math.exp(-1.5 * m.depth), 1) * glow.n;
        ctx.drawImage(SOFT, x - size, y - size, size * 2, size * 2);
        continue;
      }
      let a = 0.26 * m.bright * twinkle;
      if (blob.over > 0.01 && cur.present) a += blob.over * bell(Math.hypot(x - cur.x, y - cur.y), 34);
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

  // Light gets through where it's thin: by day, a bottle's green; by night, the ink's own.
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
    closed(ctx, ox, oy, OUTLINE);
    ctx.clip();
    motes();
    // Faint and broad, so it's round: nothing else lifts a black thing off a black thing
    const sheen = ctx.createRadialGradient(blob.x + glow.x * r * 0.42, blob.y + glow.y * r * 0.42, 0, blob.x, blob.y, r * 1.15);
    sheen.addColorStop(0, shine(0.2));
    sheen.addColorStop(0.45, shine(0.05));
    sheen.addColorStop(1, shine(0));
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, VIEW, VIEW);
    // The window: sky at the top of it, going dark towards the trees
    const pan = ctx.createRadialGradient(blob.x, blob.y, r * 0.5, blob.x, blob.y, r * 0.86);
    pan.addColorStop(0, shine(0.1));
    pan.addColorStop(0.45, shine(0.34));
    pan.addColorStop(1, shine(0.92));
    ctx.fillStyle = pan;
    ctx.shadowColor = shine(0.5);
    ctx.shadowBlur = 2.5 * scale * dpr;
    pane(ctx, light - 0.56, light - 0.05, 0.56, 0.84);
    pane(ctx, light + 0.05, light + 0.56, 0.56, 0.84);
    ctx.shadowBlur = 0;
    // And a small, sharp kick off the far side, moving with the surface
    const a = light + Math.PI + 0.7 + 0.2 * Math.sin(time * 0.6), k = radius(a) * (0.66 + 0.05 * Math.sin(time * 0.8));
    ctx.fillStyle = shine(0.55);
    ctx.beginPath();
    ctx.ellipse(blob.x + Math.cos(a) * k, blob.y + Math.sin(a) * k, 3.2, 1.3, a + Math.PI / 2, 0, 6.29);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    if (glow.night) return drawNight();
    const S = dpr * scale;
    outline();
    // The whole shape, once, so that its shadow's of the whole, however its parts overlap
    sil.setTransform(1, 0, 0, 1, 0, 0);
    sil.clearRect(0, 0, shape.width, shape.height);
    sil.setTransform(S, 0, 0, S, 0, 0);
    const body = rgb(DARK);
    sil.fillStyle = sil.strokeStyle = body;
    closed(sil, ox, oy, OUTLINE);
    sil.fill();
    for (const s of strands) { view(s); ribbon(sil); }
    for (const d of drops) {
      if (d.up > 0.5) continue;
      sil.beginPath();
      sil.ellipse(d.x, d.y, d.r * d.sq, d.r / d.sq, Math.atan2(d.dy, d.dx), 0, 6.29);
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

    ctx.setTransform(S, 0, 0, S, 0, 0);
    for (const s of strands) { view(s); flesh(ctx, s); }
    shaded();
    // Going back into the body, they're under its surface, and catch no light
    for (const s of strands) { if (s.state === 'recoil') continue; view(s); gloss(ctx); streaming(s); }
    // Off the table a bit's shadow comes away from it, fainter and softer the higher it is,
    // and it's a little nearer the eye. Seen from above, that's all there is to show height.
    for (const d of drops) {
      const lift = 1 + d.up * 0.028, r = d.r * lift, a = Math.atan2(d.dy, d.dx);
      if (d.up > 0.5) {
        const away = d.up * 0.5;
        ctx.shadowColor = `rgba(${glow.shadow}, ${(0.6 - d.up * 0.009).toFixed(3)})`;
        ctx.shadowBlur = (1 + d.up * 0.14) * 2 * S;
        ctx.shadowOffsetX = (-glow.x * away - 1000) * S;
        ctx.shadowOffsetY = -glow.y * away * S;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(d.x + 1000, d.y, d.r, d.r * 0.9, a, 0, 6.29);
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
        for (const s of strands) if (s.pin === 'anchor' && s.kind === 'reach') open *= 1 - 0.9 * bell(turn(a - s.a), 0.13);
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
  // draws, screened over the room as the ink is, so what's under it shows through: a thing
  // that shines adds to what's there. Light from all through it adds up along the line of
  // sight, so it's brightest where it's deepest. But it's a gel, not a gas: it has a surface,
  // so its edge is sharp however soft its inside, and at that surface what's coming out at a
  // shallow angle is turned back in, and gets out round the rim instead, so there's a thin,
  // uneven line of brighter light just inside its edge. And what it lights is lit from low
  // down, close to, which falls off fast (about as the cube of the distance), keeps to its
  // shape, and takes its side of the glass.
  const AWAY = 4000;
  function drawNight() {
    const S = dpr * scale, L = S / 3, n = glow.n, r = BODY * blob.size;
    sinceNight = clamp(time - lastNight, 0, 0.1);
    lastNight = time;
    const level = n * (0.68 + 0.42 * glow.stirred) * (0.94 + 0.06 * Math.sin(time * 0.9));
    outline();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Everything inside it stops at its surface
    ctx.save();
    ctx.setTransform(S, 0, 0, S, 0, 0);
    closed(ctx, ox, oy, OUTLINE);
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
      lo.globalCompositeOperation = 'source-over';
      lo.setTransform(L, 0, 0, L, 0, 0);
      lo.fillStyle = `rgb(${INK})`;
      closed(lo, ox, oy, OUTLINE);
      lo.fill();
      lo.save();
      lo.globalCompositeOperation = 'destination-out';
      lo.setTransform(L, 0, 0, L, -AWAY, 0);
      lo.shadowColor = '#000';
      lo.shadowOffsetX = AWAY;
      lo.shadowBlur = 2 * r * soft * L;
      lo.fillStyle = '#000';
      lo.beginPath();
      lo.rect(-300, -300, VIEW + 600, VIEW + 600);
      closed(lo, ox, oy, OUTLINE, inset, false);
      lo.fill('evenodd');
      lo.restore();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = amount * level;
      ctx.drawImage(low, 0, 0, canvas.width, canvas.height);
    });
    ctx.setTransform(S, 0, 0, S, 0, 0);
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
    ctx.globalAlpha = level;
    ctx.drawImage(spill, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    ctx.setTransform(S, 0, 0, S, 0, 0);
    // The lit side of the glass, nearest it, inside the rim
    const near = ctx.createRadialGradient(blob.x, blob.y, r * 0.6, blob.x, blob.y, WALL * 1.5);
    near.addColorStop(0, `rgba(${INK}, ${(0.5 * level).toFixed(3)})`);
    near.addColorStop(1, `rgba(${INK}, 0)`);
    ctx.strokeStyle = near;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(MID, MID, WALL + 4.5, 0, 6.29);
    ctx.stroke();

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
    const bit = (x, y, size, a) => { ctx.globalAlpha = a; ctx.drawImage(SOFT, x - size, y - size, size * 2, size * 2); };
    for (const m of spores) bit(m.x, m.y, m.size, n * 0.5 * Math.sin(Math.PI * Math.min(m.age / m.life, 1)));
    // A bit's a small drop of it, with an edge of its own, and off the table, in the air, it
    // lights nothing but itself
    for (const d of drops) {
      const r = d.r * (1 + d.up * 0.028), a = Math.atan2(d.dy, d.dx);
      if (d.up < 0.5) bit(d.x, d.y, r * 3, n * 0.16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${INK}, ${(0.34 * n).toFixed(3)})`;
      ctx.strokeStyle = `rgba(${INK}, ${(0.5 * n).toFixed(3)})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, r * d.sq, r / d.sq, a, 0, 6.29);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    makeGrain();
    const at = Math.round((canvas.width - grain.width) / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = n;
    ctx.drawImage(grain, at, at);
    ctx.globalAlpha = 1;
  }

  // ---- The leap ----
  // Point at the Polaroid and it's across the table and onto the man in it: it lands on his
  // face, runs out over the photo, then pulls itself back into a lump where his head was. And
  // the specks that shine in it drift together, into something like two eyes and a grin. No
  // more than something like. Move away and it lets go: it peels off him, strings stretching
  // till they give, balls up and hops home, leaving a wet mark that dries. Spilt liquid can't
  // run back up its own path, so that's a move of its own and not the leap played backwards.
  // Until it's left the dish, or left him, the pointer can change its mind; in the air, it can't.
  const LEAP = { crouch: 0.3, fly: 0.34, peel: 0.55 };
  // From when it lands: run over him; pulled together; and the specks, from each to the end
  const FACE = { spread: 0.16, gather: 0.9, eyes: 0.75, mouth: 1.05, end: 2.1 };
  const BACK = 1.7;
  // How long the last of what was thrown off takes to get back
  const DROPS = 1.75;
  // His head in the photo, in shares of the Polaroid, turned as it is: tilted, and looking off
  // to the left of the frame, so what's on his face wraps round a skull turned that way
  const HEAD = { x: 0.492, y: 0.35, size: 0.165, tilt: 8 * Math.PI / 180, yaw: -0.25 };
  // How near the Polaroid the pointer's got, in Polaroid widths, before it starts to get ready
  const SENSE = 0.9;
  let hovered = false, leap = null, gone = 0, kit = null, drying = 0, nearing = 0, ready = 0, aim = 0;
  const gaze = { x: 0, y: 0, tx: 0, ty: 0 };
  const about = document.getElementById('about'), polaroid = about && about.querySelector('.item');

  const wrap = (u, v) => {
    const round = Math.sqrt(Math.max(1 - u * u * 0.9, 0));
    return [u * Math.cos(HEAD.yaw) + round * Math.sin(HEAD.yaw), v];
  };
  function eyesPath(c) {
    c.beginPath();
    for (const s of [1, -1]) {
      const curve = (...p) => c.bezierCurveTo(...wrap(p[0] * s, p[1]), ...wrap(p[2] * s, p[3]), ...wrap(p[4] * s, p[5]));
      c.moveTo(...wrap(0.1 * s, -0.16));
      curve(0.22, -0.3, 0.42, -0.42, 0.66, -0.56);
      curve(0.66, -0.36, 0.56, -0.16, 0.42, -0.1);
      curve(0.3, -0.05, 0.16, -0.06, 0.1, -0.16);
      c.closePath();
    }
  }
  // A grin: the corners up, deep in the middle, and gone at the ends
  const grinTop = u => 0.16 + 0.17 * (1 - (u / 0.58) ** 2);
  const grinDeep = u => 0.32 * Math.max(1 - (u / 0.58) ** 2, 0) ** 0.6;
  function lumpPath(c) {
    c.beginPath();
    c.moveTo(0, -0.96);
    c.bezierCurveTo(0.6, -0.96, 0.84, -0.6, 0.82, -0.2);
    c.bezierCurveTo(0.8, 0.26, 0.56, 0.84, 0.04, 0.86);
    c.bezierCurveTo(-0.5, 0.84, -0.8, 0.3, -0.82, -0.2);
    c.bezierCurveTo(-0.84, -0.6, -0.6, -0.96, 0, -0.96);
    c.closePath();
  }

  // What it does on landing: its shape's a sum of soft balls, cut off at a level, so where two
  // come close they run together with a neck between them, as a liquid does
  function buildRun(W, H, cx, cy, R) {
    const N = W * H, G = new Float32Array(N), A = new Float32Array(N).fill(9), drops = [];
    const arrive = r => 0.12 * clamp((r - R * 0.5) / (R * 1.4), 0, 1) ** 1.3;
    const ball = (px, py, r) => {
      const reach = r * 2.2, inv = 1 / (reach * reach), time = arrive(Math.hypot(px - cx, py - cy));
      for (let y = Math.max(Math.floor(py - reach), 2); y <= Math.min(Math.ceil(py + reach), H - 3); y++) {
        for (let x = Math.max(Math.floor(px - reach), 2); x <= Math.min(Math.ceil(px + reach), W - 3); x++) {
          const dx = x - px, dy = y - py, q = 1 - (dx * dx + dy * dy) * inv;
          if (q <= 0) continue;
          const i = y * W + x;
          G[i] += q * q * q;
          if (time < A[i]) A[i] = time;
        }
      }
    };
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 + rand(-0.3, 0.3), r = i ? rand(0.25, 0.4) * R : 0;
      ball(cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * rand(0.42, 0.6));
    }
    for (let i = 0, n = 11; i < n; i++) {
      const reach = R * rand(1, 1.85), width = R * rand(0.09, 0.15);
      let a = ((i + rand(0.15, 0.85)) / n) * 6.28, go = R * 0.5;
      const curl = rand(-0.5, 0.5);
      let x = cx + Math.cos(a) * go, y = cy + Math.sin(a) * go;
      while (go < reach) {
        const f = (go - R * 0.5) / (reach - R * 0.5), r = Math.max(width * (1 - 0.7 * f), 1.1), hop = Math.max(r * 0.7, 1);
        ball(x, y, r);
        a += (curl * hop) / R;
        x += Math.cos(a) * hop; y += Math.sin(a) * hop; go += hop;
      }
      ball(x, y, width * 0.95);
      // Spat from the end of it
      for (let k = 0; k < 3; k++) {
        const far = rand(0.08, 0.5) * R, b = a + rand(-0.2, 0.2);
        // Most find their way back to the rest, each when it does, and the others never will
        drops.push({ x: x + Math.cos(b) * far, y: y + Math.sin(b) * far, r: rand(0.015, 0.05) * R, at: arrive(reach + far), go: rand(0.3, DROPS - 0.75), left: Math.random() < 0.3 });
      }
    }
    return { G, A, drops };
  }

  // The lump it pulls itself into, about the size of the head it's taken: drawn on a mask and
  // read back, so it's lit like everything else here. A soft edge makes a round one, and a few
  // bulges on it and what's run down onto the hoodie keep it from being a shape anyone drew.
  function buildLump(W, H, cx, cy, k) {
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const c = mask.getContext('2d', { willReadFrequently: true }), N = W * H, FAR = W + 60;
    const soft = (draw, blur) => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
      c.shadowColor = '#000'; c.shadowBlur = blur * 2; c.shadowOffsetX = FAR; c.shadowOffsetY = 0;
      const co = Math.cos(HEAD.tilt) * k, si = Math.sin(HEAD.tilt) * k;
      c.setTransform(co, si, -si, co, cx - FAR, cy);
      c.fillStyle = '#000';
      draw();
      c.shadowColor = 'transparent';
      const d = c.getImageData(0, 0, W, H).data, out = new Float32Array(N);
      for (let i = 0; i < N; i++) out[i] = d[i * 4 + 3] / 255;
      return out;
    };
    const bulges = Array.from({ length: 10 }, () => [rand(0, 6.28), rand(0.12, 0.26)]);
    const shape = () => {
      lumpPath(c);
      c.fill();
      for (const [a, r] of bulges) {
        c.beginPath();
        c.arc(Math.cos(a) * 0.68, Math.sin(a) * 0.74, r, 0, 6.29);
        c.fill();
      }
      c.beginPath(); c.arc(0.16, 0.86, 0.34, 0, 6.29); c.fill();
      c.beginPath(); c.arc(0.38, 1.12, 0.2, 0, 6.29); c.fill();
    };
    const edge = soft(shape, k * 0.07), wide = soft(shape, k * 0.26), C = new Float32Array(N);
    for (let i = 0; i < N; i++) C[i] = 0.42 + (edge[i] - 0.5) * 1.1 + wide[i] * 1.1;
    for (let pass = 0; pass < 2; pass++) {
      const out = C.slice();
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        out[i] = (C[i] * 4 + C[i - 1] + C[i + 1] + C[i - W] + C[i + W]) / 8;
      }
      C.set(out);
    }
    return C;
  }
  // The most of the stage the lump can ever reach, swells and all, which is all that's painted
  // once it's pulled together
  function extent(C, W, H) {
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      if (C[i] > 0.1) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { x0: Math.max(x0 - 12, 0), x1: Math.min(x1 + 12, W - 1), y0: Math.max(y0 - 12, 0), y1: Math.min(y1 + 12, H - 1) };
  }

  // What it leaves where it's been: a film, thin in the middle and thick at the edge, because
  // that's where a drying liquid leaves what was in it. It's only a picture, so it costs
  // nothing to hold or to fade.
  function paintFilm(el, F, level, night) {
    const W = el.width, H = el.height, c = el.getContext('2d'), image = c.createImageData(W, H), px = image.data;
    const [r, g, b] = night ? [130, 200, 140] : [74, 62, 38], most = night ? 0.16 : 0.22;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, v = F[i] - level, a = v > 0 ? 0.5 + 0.5 * bell(v, 0.22) : bell(v, 0.06);
        if (a < 0.01) continue;
        const o = i * 4, patchy = Math.sin(x * 0.043 + y * 0.021) + Math.sin(x * 0.017 - y * 0.051) + 0.6 * Math.sin(x * 0.11 + y * 0.083);
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
        px[o + 3] = 255 * most * a * clamp(0.6 + 0.3 * patchy, 0, 1);
      }
    }
    c.putImageData(image, 0, 0);
  }
  function paintFilms() {
    const K = kit;
    K.filmNight = glow.night;
    const F = K.run.G.slice(), { W, H } = K;
    for (const d of K.run.drops) {
      if (!d.left) continue;
      const L = Math.ceil(d.r);
      for (let v = -L; v <= L; v++) for (let u = -L; u <= L; u++) {
        const q = 1 - (u * u + v * v) / (d.r * d.r), at = Math.round(d.y + v) * W + Math.round(d.x + u);
        if (q > 0 && F[at] < 0.42 + 0.3 * q) F[at] = 0.42 + 0.3 * q;
      }
    }
    paintFilm(K.film, F, 0.42, glow.night);
    paintFilm(K.mark, K.lump, 0.42, glow.night);
  }
  const wet = (el, on) => {
    el.style.transition = on ? 'none' : 'opacity 7s cubic-bezier(0.5, 0, 0.9, 0.6)';
    el.style.opacity = on ? 1 : 0;
  };
  const sample = (F, W, H, x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) return 0;
    const i = iy * W + ix, u = x - ix, v = y - iy, top = F[i] + (F[i + 1] - F[i]) * u, under = F[i + W] + (F[i + W + 1] - F[i + W]) * u;
    return top + (under - top) * v;
  };

  // What the wet of it reflects: the sky that's in the photo, broad and soft, from over his
  // shoulder by day, and at night just the lamp
  function buildRoom(night) {
    const w = 96, h = 96, room = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      room[y * w + x] = night ? bell(u - 0.32, 0.05) * bell(v - 0.16, 0.05) : 0.04 + 0.96 * bell(u - 0.3, 0.2) * bell(v - 0.12, 0.2);
    }
    return { room, w, h, night };
  }

  function place(K, c) {
    const co = Math.cos(HEAD.tilt) * K.U, si = Math.sin(HEAD.tilt) * K.U;
    c.setTransform(co * K.px, si * K.px, -si * K.px, co * K.px, K.fx * K.px, K.fy * K.px);
  }
  // The specks. Each starts anywhere in the lump and has a place it's making for, in an eye or
  // the grin, and sets off when it sets off: what they make's a matter of where most of them
  // have got to, so it comes up slowly and it's never quite anything. They go on drifting, so
  // it's alive.
  function buildSpecks() {
    const test = document.createElement('canvas').getContext('2d'), specks = [];
    eyesPath(test);
    const add = (x, y, start, size, power, eye = 0) => {
      const a = rand(0, 6.28), d = Math.sqrt(Math.random()) * 0.74;
      specks.push({ x0: Math.cos(a) * d, y0: Math.sin(a) * d * 1.05 - 0.04, x, y, start, size, power, eye, ph: rand(0, 6.28), rate: rand(0.5, 1.5) });
    };
    for (let n = 0; n < 130;) {
      const x = rand(-1, 0.8), y = rand(-0.62, 0);
      if (!test.isPointInPath(x, y)) continue;
      add(x, y, FACE.eyes + rand(0, 0.5), rand(0.03, 0.07), rand(0.5, 1), 1);
      n++;
    }
    for (let n = 0; n < 150; n++) {
      const u = rand(-0.58, 0.58), v = grinTop(u) + grinDeep(u) * rand(0, 1) ** 0.9, [x] = wrap(u, 0);
      add(x, v, FACE.mouth + rand(0, 0.6), rand(0.025, 0.06), rand(0.4, 0.9));
    }
    for (let n = 0; n < 60; n++) add(rand(-0.7, 0.7), rand(-0.8, 0.8), 9, rand(0.02, 0.04), 0.5);
    return specks;
  }
  function paintSpecks(t, peel, dt) {
    const K = kit, c = K.tc, night = glow.night;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, K.top.width, K.top.height);
    const present = ease(FACE.spread, FACE.gather, t) * (1 - ease(0, 0.5, peel)), lit = night ? Math.max(K.stress, 0.34 * present) : 0;
    K.halo.style.opacity = lit.toFixed(2);
    if (present <= 0) return;
    place(K, c);
    c.globalCompositeOperation = 'lighter';
    const draw = (x, y, size, a) => { c.globalAlpha = Math.min(a, 1); c.drawImage(SOFT, x - size, y - size, size * 2, size * 2); };
    // It looks where you're pointing, it shuts its eyes now and then, and it breathes
    const follow = 1 - Math.exp(-dt * 7);
    gaze.x += (gaze.tx - gaze.x) * follow; gaze.y += (gaze.ty - gaze.y) * follow;
    if (time > K.blink + 0.3) K.blink = time + rand(3, 7);
    const shut = bell(time - K.blink, 0.075), breath = 0.88 + 0.12 * Math.sin(time * 1.25), lookX = gaze.x * 0.1, lookY = gaze.y * 0.08;
    // A breath of light round what's forming, as there's more of it there than anywhere
    const eyes = ease(FACE.eyes + 0.15, FACE.end, t), mouth = ease(FACE.mouth + 0.2, FACE.end, t), bloom = night ? 0.5 : 0.28, [left] = wrap(-0.36, 0), [right] = wrap(0.36, 0), [middle] = wrap(0, 0);
    if (eyes > 0) { const a = eyes * bloom * present * (1 - 0.8 * shut); draw(left + lookX, -0.27 + lookY, 0.46, a); draw(right + lookX, -0.27 + lookY, 0.46, a); }
    if (mouth > 0) draw(middle + lookX * 0.4, 0.38 + lookY * 0.4, 0.72, mouth * bloom * present);
    for (const m of K.specks) {
      const go = ease(m.start, m.start + 0.6, t);
      const shift = go * (m.eye ? 1 : 0.4), ty = m.eye ? -0.27 + (m.y + 0.27) * (1 - 0.88 * shut) : m.y;
      const x = m.x0 + (m.x - m.x0) * go + Math.sin(time * m.rate + m.ph) * 0.022 + lookX * shift, y = m.y0 + (ty - m.y0) * go + Math.cos(time * m.rate * 0.8 + m.ph * 2) * 0.022 + lookY * shift;
      const twinkle = 0.55 + 0.45 * Math.sin(time * 2.3 * m.rate + m.ph * 3);
      draw(x, y, m.size * (1 + go * 0.25), present * m.power * (0.28 + 0.72 * go) * twinkle * breath * (night ? 1 : 0.85));
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  // Everything's made the first time it's needed, then kept for as long as the window's size is
  function build() {
    const box = table.getBoundingClientRect(), r = polaroid.getBoundingClientRect(), w = polaroid.offsetWidth, h = polaroid.offsetHeight;
    // It doesn't know where the photo stops: the stage is as much bigger than the Polaroid, all
    // round, as the longest run off his face needs, so that nothing ever ends at an edge
    const U = w * HEAD.size, R = U * 1.5, far = R * 2.75, pad = Math.ceil(Math.max(far - w * HEAD.x, far - h * HEAD.y, 0)), sw = w + pad * 2, sh = h + pad * 2;
    const g = 0.5, W = Math.round(sw / g), H = Math.round(sh / g), px = Math.min(devicePixelRatio || 1, 2) * 1.5;
    const stage = document.createElement('div');
    stage.className = 'goo-face';
    stage.setAttribute('aria-hidden', 'true');
    const midX = r.left + r.width / 2 - box.left, midY = r.top + r.height / 2 - box.top, turned = getComputedStyle(polaroid).rotate;
    Object.assign(stage.style, { left: `${midX - sw / 2}px`, top: `${midY - sh / 2}px`, width: `${sw}px`, height: `${sh}px`, rotate: turned });
    const layer = (cw, ch) => { const el = document.createElement('canvas'); el.width = cw; el.height = ch; return el; };
    const skin = layer(W, H), top = layer(Math.round(sw * px), Math.round(sh * px)), film = layer(W, H), mark = layer(W, H);
    const halo = document.createElement('div');
    film.style.opacity = mark.style.opacity = halo.style.opacity = 0;
    stage.append(film, mark, halo, skin, top);
    const fly = layer(Math.round(box.width * Math.min(dpr, 1.5)), Math.round(box.height * Math.min(dpr, 1.5)));
    fly.className = 'goo-leap';
    table.append(fly, stage);
    const fx = pad + w * HEAD.x, fy = pad + h * HEAD.y, N = W * H, a = (parseFloat(turned) || 0) * Math.PI / 180;
    // At night it lights what's round it. Over a wide area and held for as long as he's pointed
    // at, so it's left to the browser and not drawn every frame.
    Object.assign(halo.style, { position: 'absolute', left: `${fx - U * 3.4}px`, top: `${fy - U * 3.4}px`, width: `${U * 6.8}px`, height: `${U * 6.8}px`, background: 'radial-gradient(closest-side, rgba(190, 236, 165, 0.3), rgba(190, 236, 165, 0.1) 45%, rgba(190, 236, 165, 0))' });
    const ox = fx - sw / 2, oy = fy - sh / 2;
    const c = skin.getContext('2d'), image = c.createImageData(W, H);
    const cx = fx / g, cy = fy / g, lump = buildLump(W, H, cx, cy, U / g), K = { stage, skin, top, fly, c, fc: fly.getContext('2d'), tc: top.getContext('2d'), image, data: new Uint32Array(image.data.buffer), rgba: image.data,
      W, H, g, U, fx, fy, cx, cy, px, inset: pad / g, near: extent(lump, W, H), film, mark, halo, filmNight: null, stress: 0, blink: 0, angle: a, flyScale: fly.width / box.width, height: new Float32Array(N), wx: new Float32Array(W), wy: new Float32Array(H),
      landX: midX + ox * Math.cos(a) - oy * Math.sin(a), landY: midY + ox * Math.sin(a) + oy * Math.cos(a),
      run: buildRun(W, H, cx, cy, R / g), lump, specks: buildSpecks(), env: buildRoom(glow.night), tails: Array.from({ length: 5 }, () => rand(0, 6.28)),
      strings: Array.from({ length: 8 }, (_, i) => ({ a: ((i + rand(0.2, 0.8)) / 8) * 6.28, snap: rand(0.4, 0.8), width: rand(0.05, 0.1) * U / g })) };
    return K;
  }

  // Lit a pixel at a time, as nothing else will do it. Where it's flat it shows the sky behind
  // whoever took the photo, and where it curves away it catches it from the side, strongly,
  // the way the edge of any water does. At night it still stands in front of what's behind
  // it: it's what it gives off that shows.
  function paintSkin(t, peel) {
    const K = kit, { W, H, cx, cy, height, rgba: px, lump: C } = K, { G, A, drops } = K.run;
    if (K.env.night !== glow.night) K.env = buildRoom(glow.night);
    const { room, w: EW, h: EH, night } = K.env, cells = K.U / K.g;
    // It hits, flattens further than it can hold, and draws back a little. Pulled off him it
    // draws in on itself, and the thin of it goes first.
    const m = ease(FACE.spread, FACE.gather, t), pull = ease(0, 1, peel), iso = 0.42 + 0.55 * Math.exp(-t * 20) - 0.09 * Math.exp(-t * 6) * Math.cos(t * 17) - 0.025 * m * Math.sin(time * 1.25) + 0.6 * peel * peel;
    const spreading = t < 0.22, shrink = 1 + 2.4 * pull, zoom = (1 + 2.2 * m) * shrink, solid = m >= 1 && t >= DROPS && !peel;
    // Never still: slow swells going through it, and it's what makes it a liquid
    const wx = K.wx, wy = K.wy, scaleX = K.g / K.U, heave = 0.09 * ease(0.4, 1, m);
    for (let x = 0; x < W; x++) wx[x] = Math.sin(x * scaleX * 2.6 + time * 1.3) + 0.6 * Math.sin(x * scaleX * 5.1 - time * 1.9);
    for (let y = 0; y < H; y++) wy[y] = Math.sin(y * scaleX * 2.2 - time * 1.1) + 0.6 * Math.sin(y * scaleX * 4.7 + time * 1.7);
    const { x0, x1, y0, y1 } = solid ? K.near : { x0: 0, x1: W - 1, y0: 0, y1: H - 1 };
    K.c.clearRect(0, 0, W, H);
    K.data.fill(0);
    height.fill(0);
    for (let y = y0; y <= y1; y++) {
      for (let i = y * W + x0, x = x0; x <= x1; x++, i++) {
        let value;
        if (solid) value = C[i] + heave * (wx[x] + wy[y]);
        else {
          const dx = x - cx, dy = y - cy;
          value = 0;
          if (m < 1) value = sample(G, W, H, cx + dx * zoom, cy + dy * zoom) * (1 - m);
          if (m > 0) value += ((peel ? sample(C, W, H, cx + dx * shrink, cy + dy * shrink) : C[i]) + heave * (wx[x] + wy[y])) * m;
        }
        const over = (value - iso) / 0.5;
        if (over <= 0) continue;
        let v = over >= 1 ? 1 + 0.16 * Math.min(over - 1, 7) : Math.sqrt(1 - (1 - over) * (1 - over));
        if (spreading) v *= clamp((t - A[i]) / 0.03, 0, 1);
        height[i] = v;
      }
    }
    // Stamped on after: a dome that stands up off whatever's there
    const dome = (x, y, r, tall) => {
      const L = Math.ceil(r), ix = Math.round(x), iy = Math.round(y), inv = 1 / (r * r);
      if (ix - L < 1 || iy - L < 1 || ix + L >= W - 1 || iy + L >= H - 1) return;
      for (let v = -L; v <= L; v++) for (let u = -L; u <= L; u++) {
        const d = u * u + v * v;
        if (d >= r * r) continue;
        const i = (iy + v) * W + ix + u, h = tall * Math.sqrt(1 - d * inv);
        if (h > height[i]) height[i] = h;
      }
    };
    if (!solid) {
      for (const d of drops) {
        const here = clamp((t - d.at) / 0.03, 0, 1);
        if (!here) continue;
        const dx = cx - d.x, dy = cy - d.y, near = 1 - (cells * 0.5) / Math.hypot(dx, dy);
        const back = d.left ? 0 : Math.max(ease(d.go, d.go + 0.75, t), ease(0, 0.8, peel));
        const r = d.r * (d.left ? 1 - ease(0.7, 1.5, t) * 0.9 - 0.1 * pull : 1 - ease(0.85, 1, back));
        if (r > 0.7) dome(d.x + dx * back * near, d.y + dy * back * near, r, 0.75 * here);
      }
    }
    // Strings of it, held fast to the photo while the rest pulls away, getting thinner till
    // they give: then each end runs back to where it belongs
    if (peel) {
      const rim = cells * (0.85 + 1.1 * (1 - m)), ball = (cells * 0.85) / shrink, side = K.g / K.U;
      for (const S of K.strings) {
        const xa = cx + Math.cos(S.a) * rim, ya = cy + Math.sin(S.a) * rim, xb = cx + Math.cos(S.a) * ball, yb = cy + Math.sin(S.a) * ball;
        const L = Math.hypot(xb - xa, yb - ya), broke = clamp((peel - S.snap) / (1 - S.snap), 0, 1), reach = 0.5 * (1 - broke), n = Math.ceil(L / 1.6);
        for (let k = 0; k <= n; k++) {
          const s = k / n;
          if (broke && s > reach && s < 1 - reach) continue;
          const waist = Math.abs(2 * s - 1), r = S.width * (1 - 0.72 * peel) * (0.3 + 0.7 * waist * waist) * (1 - broke * 0.8) * ease(0, 0.08, peel);
          dome(xa + (xb - xa) * s + Math.sin(s * 3.14 + S.a) * S.width * side * 8 * peel, ya + (yb - ya) * s, Math.max(r, 1), 0.8);
        }
      }
    }
    // Struck, it lights up, as sea sparkle does when a wave breaks: a ring going out from the
    // hit, and all of it for a moment after. It's torn just the same pulling away.
    const struck = 0.42 * Math.exp(-t * 2.4), hurt = 0.3 * Math.sin(Math.PI * Math.min(peel * 1.1, 1));
    K.stress = night ? Math.max(struck, hurt) : 0;
    const a0 = K.angle, sx = glow.x * Math.cos(a0) + glow.y * Math.sin(a0), sy = -glow.x * Math.sin(a0) + glow.y * Math.cos(a0), d1 = cells * 0.035;
    const at1 = Math.round(sy * d1) * W + Math.round(sx * d1), at2 = Math.round(sy * d1 * 2.2) * W + Math.round(sx * d1 * 2.2), at3 = Math.round(sy * d1 * 3.6) * W + Math.round(sx * d1 * 3.6);
    const [sr, sg, sb] = night ? [3, 5, 6] : [28, 34, 44], cast = night ? 0.4 : 0.42;
    const K2 = 6.4, far = EH * 0.5, lx = -0.42, ly = -0.62, hz = 1.66, hl = 1 / Math.sqrt(lx * lx + ly * ly + hz * hz), in0 = K.inset, rx = EW / (W - in0 * 2), ry = EH / (H - in0 * 2);
    for (let y = Math.max(y0, 1); y <= Math.min(y1, H - 2); y++) {
      const line = y * W;
      for (let x = Math.max(x0, 1); x <= Math.min(x1, W - 2); x++) {
        const i = line + x, h = height[i];
        if (h < 0.006) {
          // Its shadow: what's taller throws it further
          const dark = Math.min(height[i + at1] || 0, 1) * 0.5 + clamp((height[i + at2] || 0) - 0.5, 0, 1) * 0.35 + clamp((height[i + at3] || 0) - 0.95, 0, 0.5) * 0.3;
          if (dark > 0.004) { const o = i * 4; px[o] = sr; px[o + 1] = sg; px[o + 2] = sb; px[o + 3] = 255 * cast * dark; }
          continue;
        }
        const nx = (height[i - 1] - height[i + 1]) * K2, ny = (height[i - W] - height[i + W]) * K2;
        const c = 1 / Math.sqrt(nx * nx + ny * ny + 1), o = i * 4, steep = 1 - c, fresnel = steep * steep * steep;
        const seen = room[clamp(((y - in0) * ry - ny * c * far) | 0, 0, EH - 1) * EW + clamp(((x - in0) * rx - nx * c * far) | 0, 0, EW - 1)];
        const facing = Math.max((nx * lx + ny * ly + hz) * c * hl, 0), f2 = facing * facing, f4 = f2 * f2, f8 = f4 * f4, spec = f8 * f8 * f8 * f8 * f8;
        const reflect = (0.2 + 0.8 * fresnel) * seen, body = 1 - Math.exp(-h * 9);
        let r, g, b, a;
        if (night) {
          const ring = t < 0.9 ? 0.5 * bell(Math.hypot(x - cx, y - cy) / cells - 11 * t, 0.8) * Math.exp(-t * 3) : 0;
          // Thick, it's lit from inside, palest at the edge where the light's come through the
          // most of it: what's in the dish, on him
          const deep = Math.min(h, 1.6) / 1.6, cloud = 0.14 + 0.1 * deep, em = body * (cloud + 0.55 * steep + 0.08 * (wx[x] + wy[y]) * m + struck + hurt + ring), lamp = reflect * 0.7 + spec * 0.3;
          r = 10 + 182 * em + 255 * lamp; g = 26 + 226 * em + 228 * lamp; b = 20 + 150 * em + 196 * lamp;
          a = (1 - Math.exp(-h * h * 3.2)) * (0.86 + 0.14 * steep);
        } else {
          const lit = spec * 0.8 + reflect * 0.9, thin = 1 - body;
          r = (12 + 29 * thin) * (1 - lit) + 226 * lit;
          g = (30 + 86 * thin) * (1 - lit) + 232 * lit;
          b = (24 + 58 * thin) * (1 - lit) + 222 * lit;
          a = Math.max(1 - Math.exp(-h * h * 3.2), lit * (1 - Math.exp(-h * h * 3.2)));
        }
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255 * a;
      }
    }
    K.c.putImageData(K.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  // Over the table, in a high arc. From above all that shows of height is a shadow left
  // behind, and that it's a little nearer the eye.
  function paintFlight(z) {
    const K = kit, c = K.fc, night = glow.night, box = table.getBoundingClientRect(), from = canvas.getBoundingClientRect();
    c.setTransform(K.flyScale, 0, 0, K.flyScale, 0, 0);
    c.clearRect(0, 0, box.width, box.height);
    if (z === null) return;
    const x0 = from.left - box.left + blob.x * scale, y0 = from.top - box.top + blob.y * scale;
    const f = z * z * (3 - 2 * z), x = x0 + (K.landX - x0) * f, y = y0 + (K.landY - y0) * f, up = Math.sin(Math.PI * z), r0 = BODY * scale * 0.42, r = r0 * (1 + 0.42 * up);
    const sx = x - glow.x * up * r0 * 2.6, sy = y - glow.y * up * r0 * 2.6, sr = r0 * (1 + 0.8 * up);
    if (!night) {
      const shadow = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
      shadow.addColorStop(0, `rgba(${glow.shadow}, ${(0.5 - 0.22 * up).toFixed(3)})`);
      shadow.addColorStop(1, `rgba(${glow.shadow}, 0)`);
      c.fillStyle = shadow;
      c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    } else {
      const pool = c.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.4);
      pool.addColorStop(0, `rgba(${INK}, ${(0.24 - 0.14 * up).toFixed(3)})`);
      pool.addColorStop(1, `rgba(${INK}, 0)`);
      c.fillStyle = pool;
      c.fillRect(sx - sr * 2.4, sy - sr * 2.4, sr * 4.8, sr * 4.8);
    }
    // Strings of it, pulling out behind, till they give
    const tail = ease(0.5, 0.1, z), L = Math.hypot(x - x0, y - y0) || 1, nx = -(y - y0) / L, ny = (x - x0) / L;
    if (tail > 0.01) {
      for (const a of K.tails) {
        const ax = x0 + Math.cos(a) * r0, ay = y0 + Math.sin(a) * r0, off = Math.sin(a * 3) * r * 0.6, wide = r * 0.22 * tail, px = x + nx * off, py = y + ny * off;
        c.fillStyle = night ? `rgba(${INK}, ${(0.4 * tail).toFixed(3)})` : `rgba(${DARK}, ${tail.toFixed(3)})`;
        c.beginPath();
        c.moveTo(ax, ay);
        c.quadraticCurveTo((ax + px) / 2 + nx * wide, (ay + py) / 2 + ny * wide - up * r, px + nx * wide, py + ny * wide);
        c.lineTo(px - nx * wide, py - ny * wide);
        c.quadraticCurveTo((ax + px) / 2 - nx * wide, (ay + py) / 2 - ny * wide - up * r, ax, ay);
        c.fill();
      }
    }
    c.beginPath();
    const heading = Math.atan2(y - y0, x - x0), stretch = 1 + 0.4 * up;
    for (let i = 0; i <= 56; i++) {
      const a = (i / 56) * 6.283, q = r * (1 + 0.09 * Math.sin(3 * a + z * 11) + 0.05 * Math.sin(5 * a - z * 17));
      const u = Math.cos(a) * q * stretch, v = (Math.sin(a) * q) / stretch;
      c.lineTo(x + u * Math.cos(heading) - v * Math.sin(heading), y + u * Math.sin(heading) + v * Math.cos(heading));
    }
    c.closePath();
    const lx = x + glow.x * r * 0.35, ly = y + glow.y * r * 0.35, body = c.createRadialGradient(lx, ly, r * 0.1, x, y, r * 1.1);
    if (night) {
      body.addColorStop(0, 'rgb(120, 174, 124)');
      body.addColorStop(0.72, 'rgb(84, 136, 98)');
      body.addColorStop(0.88, 'rgb(196, 240, 174)');
      body.addColorStop(1, 'rgb(110, 164, 118)');
    } else {
      body.addColorStop(0, 'rgb(30, 72, 54)');
      body.addColorStop(0.6, rgb(DARK));
      body.addColorStop(1, 'rgb(11, 32, 24)');
    }
    c.fillStyle = body;
    c.fill();
    if (!night) {
      c.fillStyle = shine(0.75);
      c.beginPath();
      c.ellipse(x + glow.x * r * 0.54, y + glow.y * r * 0.54, r * 0.17, r * 0.07, Math.atan2(glow.y, glow.x) + Math.PI / 2, 0, 6.29);
      c.fill();
    }
  }

  // Made ahead, when nothing's going on, so that it can go the moment it's asked to
  const whenIdle = window.requestIdleCallback || (f => setTimeout(f, 200));
  function prepare() {
    if (polaroid && !still && matchMedia('(hover: hover)').matches) whenIdle(() => { if (!kit && polaroid.offsetWidth) kit = build(); });
  }

  function bearing() {
    const from = canvas.getBoundingClientRect(), box = table.getBoundingClientRect();
    return Math.atan2(kit.landY - (from.top - box.top + MID * scale), kit.landX - (from.left - box.left + MID * scale));
  }

  function setHovered(on) {
    hovered = on;
    if (!on || leap) return;
    kit = kit || build();
    clearTimeout(drying);
    kit.stage.style.rotate = getComputedStyle(polaroid).rotate;
    kit.stage.style.display = kit.fly.style.display = 'block';
    // However ready it was already is that much less to do
    leap = { t: LEAP.crouch * 0.7 * ready, off: false, peel: 0, home: null, dir: bearing(), last: performance.now() };
    requestAnimationFrame(leapFrame);
    wake();
  }

  function leapFrame(now) {
    const L = leap, K = kit, dt = Math.min((now - L.last) / 1000, 0.05), landed = LEAP.crouch + LEAP.fly, end = landed + FACE.end;
    L.last = now;
    if (L.home !== null) {
      // In the air, and nothing's turning it round. It lands with its weight still coming, away
      // from the photo, and if it's wanted again it's already half crouched.
      L.home -= dt / LEAP.fly;
      if (L.home <= 0) {
        L.home = null; L.peel = 0; L.off = false; L.t = LEAP.crouch * 0.5;
        for (let i = 0; i < 6; i++) ripple(i * 1.05, 1);
        flash(blob.x, blob.y, 0.8);
        blob.sizeV += 0.5;
      }
    } else if (L.peel > 0 || (!hovered && L.t >= landed + FACE.spread)) {
      if (!L.peel) { if (K.filmNight !== glow.night) paintFilms(); wet(K.mark, true); wet(K.film, false); }
      L.peel = clamp(L.peel + (hovered ? -dt * 1.6 : dt) / LEAP.peel, 0, 1);
      if (L.peel >= 1) { L.home = 1; wet(K.mark, false); }
    } else if (!hovered && L.t < LEAP.crouch) L.t = Math.max(L.t - dt * BACK, 0);
    else L.t = Math.min(L.t + dt, end);
    const fly = L.t - LEAP.crouch, hit = L.t - landed, flying = L.home !== null;
    if (L.t < LEAP.crouch) glow.stirred = Math.max(glow.stirred, 0.5 + L.t);
    else if (!L.off) {
      // Off it goes: it lets go of everything and the dish rings with it
      L.off = true;
      releaseAll(true);
      for (let i = 0; i < 6; i++) ripple(i * 1.05, 1.2);
      flash(blob.x, blob.y, 1);
      blob.sizeV -= 1.4;
      blob.tx = blob.ty = MID;
    }
    paintFlight(flying ? L.home : L.off && fly < LEAP.fly ? fly / LEAP.fly : null);
    const on = !flying && hit >= 0;
    if (on) {
      if (!L.wet && hit >= 0.15) { L.wet = true; if (K.filmNight !== glow.night) paintFilms(); wet(K.film, true); }
      if (L.wet === true && hit >= FACE.gather) { L.wet = 1; wet(K.film, false); }
      paintSkin(hit, L.peel);
      paintSpecks(hit, L.peel, dt);
    } else if (L.was) {
      K.c.clearRect(0, 0, K.W, K.H);
      K.tc.clearRect(0, 0, K.top.width, K.top.height);
      K.halo.style.opacity = 0;
      L.wet = false;
    }
    L.was = on;
    if (L.t <= 0 && !hovered && !flying) {
      K.fly.style.display = 'none';
      leap = null;
      // What it left's still drying
      drying = setTimeout(() => { if (!leap && kit === K) K.stage.style.display = 'none'; }, 8000);
      return;
    }
    requestAnimationFrame(leapFrame);
  }

  // ---- The table ----

  function layout() {
    const box = table.getBoundingClientRect(), item = dish.getBoundingClientRect();
    if (!item.width) return;
    scale = item.width / 216;
    dpr = Math.min(devicePixelRatio || 1, 2);
    const size = VIEW * scale, px = Math.round(size * dpr);
    const left = item.left + item.width / 2 - box.left - size / 2, topAt = item.top + item.height / 2 - box.top - size / 2;
    canvas.width = canvas.height = px;
    Object.assign(canvas.style, { width: `${size}px`, height: `${size}px`, left: `${left}px`, top: `${topAt}px` });
    shape.width = shape.height = px;
    low.width = low.height = spill.width = spill.height = Math.ceil(px / 3);
    read();
    trail(box, item);
    if (still) draw();
  }
  // A glow is a long, slow fade across very few of a screen's shades, and only some browsers
  // dither it, so in the others it shows as bands. A grain of a shade or two either way, over
  // all of it, breaks them up. It fades out with the glow, and it's only made once it's needed.
  let grain = null;
  function makeGrain() {
    const D = Math.ceil(620 * scale * dpr);
    if (grain && grain.width === D) return;
    grain = document.createElement('canvas');
    grain.width = grain.height = D;
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

  // Where it's been. In the same ink as the labels, so no one can see it till the lights go
  // out: spatter round the dish, a smear over the rim, and a broken trail, thinning as it
  // gets further from home, to the nearest thing written on the table, and a dab or two by
  // the next. Seeded, so they're where they were after a resize.
  const SEED = 1 + Math.floor(Math.random() * 1e6);
  function trail(box, item) {
    let seed = SEED;
    const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); };
    const k = item.width / 216, cx = item.left + item.width / 2 - box.left, cy = item.top + item.height / 2 - box.top;
    const labels = [...table.querySelectorAll('.tag > span, .polaroid-caption')].filter(el => !obj.contains(el)).map(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2 - box.left, y = r.top + r.height / 2 - box.top;
      return { x, y, w: r.width, d: Math.hypot(x - cx, y - cy) };
    }).sort((a, b) => a.d - b.d);
    if (!labels.length) return;
    const shapes = [];
    const dot = (x, y, r, stretch = 1, a = 0, o = 1) => shapes.push(
      `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(r * stretch).toFixed(2)}" ry="${r.toFixed(2)}" transform="rotate(${(a * 57.3).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" opacity="${o.toFixed(2)}"/>`);
    const home = labels[0], heading = Math.atan2(home.y - cy, home.x - cx);
    // Spatter, thrown out from the rim, most of it on the way it went
    for (let i = 0; i < 26; i++) {
      const a = heading + (rnd() < 0.6 ? rnd(-0.8, 0.8) : rnd(-3.1, 3.1)), r = (RIM + 4 + rnd() ** 2 * 44) * k;
      dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rnd(0.5, 2.1) * k, rnd(1, 2.4), a, rnd(0.5, 1));
    }
    // The trail: along a lazy curve, each stretch thinner, shorter and further from the last
    const sx = cx + Math.cos(heading) * (RIM - 6) * k, sy = cy + Math.sin(heading) * (RIM - 6) * k;
    const ex = home.x - Math.cos(heading) * home.w * 0.32, ey = home.y - Math.sin(heading) * home.w * 0.12;
    const L = Math.hypot(ex - sx, ey - sy), nx = -(ey - sy) / L, ny = (ex - sx) / L, bow = rnd(0.1, 0.2) * L * (rnd() < 0.5 ? -1 : 1);
    const along = t => {
      const b = 4 * t * (1 - t) * bow + Math.sin(t * 13 + 2) * 3 * k;
      return [sx + (ex - sx) * t + nx * b, sy + (ey - sy) * t + ny * b];
    };
    for (let t = 0; t < 1;) {
      const len = (0.15 - 0.11 * t) * rnd(0.6, 1.3), w = (3.6 - 2.9 * t) * k * rnd(0.75, 1.15), steps = 7;
      let left = '', right = '';
      for (let i = 0; i <= steps; i++) {
        const f = i / steps, [x, y] = along(t + len * f), h = w * Math.sin(Math.PI * Math.min(f * 1.06 + 0.04, 1)) ** 0.6 * (1 + 0.18 * Math.sin(i * 2.1 + t * 30));
        left += `${(x + nx * h).toFixed(1)},${(y + ny * h).toFixed(1)} `;
        right = `${(x - nx * h).toFixed(1)},${(y - ny * h).toFixed(1)} ` + right;
      }
      shapes.push(`<polygon points="${left}${right}" opacity="${(0.95 - 0.5 * t).toFixed(2)}"/>`);
      const [px, py] = along(t + len + 0.01);
      if (rnd() < 0.7) dot(px + nx * rnd(-5, 5) * k, py + ny * rnd(-5, 5) * k, rnd(0.5, 1.5) * k, rnd(1, 2), heading, 0.8);
      t += len + (0.02 + 0.05 * t) * rnd(0.7, 1.4);
    }
    // A dab beside each of the next two
    labels.slice(1, 3).forEach(l => {
      const a = rnd(0, 6.28), x = l.x + Math.cos(a) * l.w * 0.62, y = l.y + Math.sin(a) * l.w * 0.3 + 10 * k;
      dot(x, y, 3 * k, 1.5, a, 0.6);
      for (let i = 0; i < 6; i++) dot(x + rnd(-13, 13) * k, y + rnd(-9, 9) * k, rnd(0.5, 1.3) * k, 1.3, a, 0.5);
    });
    prints.innerHTML = `<svg width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}">${shapes.join('')}</svg>`;
  }

  // Which way the table's light falls here: what its script told the dish for its own shadow
  function read() {
    const style = getComputedStyle(obj), get = key => parseFloat(style.getPropertyValue(key)) || 0;
    const sx = get('--sx'), sy = get('--sy'), L = Math.hypot(sx, sy);
    if (L) { glow.x = -sx / L; glow.y = -sy / L; }
    const night = root.classList.contains('dark-mode');
    // The switch is its whole sky: light makes it flinch, and let go of what it's holding
    if (glow.night !== null && night !== glow.night && !still) {
      if (night) { blob.sizeV += 1.2; spawnProbe(); nextProbe = time + 0.7; flash(blob.x, blob.y, 0.9); } else {
        blob.sizeV -= 2.4;
        releaseAll(true);
        for (let i = 0; i < OUTLINE / 21; i++) ripple(i * 1.5, 0.9);
      }
    }
    if (glow.night === null && still) glow.n = night ? 1 : 0;
    glow.night = night;
    // What it's left is still there when the lights change, and looks as it should in the new light
    if (kit && kit.filmNight !== night && kit.stage.style.display === 'block') paintFilms();
    canvas.classList.toggle('shining', night);
    if (still) glow.n = night ? 1 : 0;
    glow.cast = [sx * 0.7, sy * 0.7, Math.max(get('--sb') * 0.6, 1)];
    glow.touch = [get('--cx') || 0.6, get('--cy') || 0.8, Math.max(get('--cb'), 0.6)];
    glow.shadow = style.getPropertyValue('--shadow').trim() || glow.shadow;
    if (still) draw();
  }
  new MutationObserver(read).observe(obj, { attributes: true, attributeFilter: ['style'] });
  new ResizeObserver(() => {
    if (kit && !leap) { kit.stage.remove(); kit.fly.remove(); kit = null; }
    layout();
    prepare();
  }).observe(table);
  dish.querySelector('img').addEventListener('load', layout);
  addEventListener('load', layout);

  if (still) { step(SUB); layout(); return; }

  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const x = (e.clientX - rect.left) / scale, y = (e.clientY - rect.top) / scale;
    if (cur.present) cur.vx = ((x - cur.x) / Math.max(e.timeStamp - cur.t, 1)) * 1000;
    cur.x = x; cur.y = y; cur.t = e.timeStamp;
    cur.present = Math.hypot(x - MID, y - MID) < LIMIT;
    if (polaroid && kit) {
      const r = polaroid.getBoundingClientRect(), off = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      nearing = ease(r.width * SENSE, 0, off);
      if (nearing) aim = bearing();
    }
    if (cur.present || nearing) wake();
  }, { passive: true });
  root.addEventListener('pointerleave', () => { cur.present = false; nearing = 0; });
  if (polaroid) {
    about.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') setHovered(true); });
    about.addEventListener('pointerleave', () => setHovered(false));
    about.addEventListener('pointermove', e => {
      if (!kit) return;
      const box = table.getBoundingClientRect(), x = (e.clientX - box.left - kit.landX) / (kit.U * 2.4), y = (e.clientY - box.top - kit.landY) / (kit.U * 2.4), most = Math.max(Math.hypot(x, y), 1);
      gaze.tx = x / most; gaze.ty = y / most;
    }, { passive: true });
    about.addEventListener('focus', () => { if (about.matches(':focus-visible')) setHovered(true); });
    about.addEventListener('blur', () => setHovered(false));
  }
  addEventListener('blur', () => { cur.present = false; nearing = 0; });

  // Runs while it can be seen, and at half speed when it's only itself to mind
  let running = false, seen = true, last = 0, acc = 0;
  function frame(now) {
    if (!seen || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= SUB && n < 14) { step(SUB); acc -= SUB; n++; }
    if (n === 14) acc = 0;
    const busy = cur.present || leap || ready > 0.01 || strands.some(s => s.kind !== 'probe') || drops.length;
    if (busy || !(frames++ & 1)) draw();
  }
  function wake() {
    if (running || !seen || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  new IntersectionObserver(([entry]) => { seen = entry.isIntersecting; if (seen) wake(); }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  layout();
  wake();
  // Already on it, before there was anything here to notice
  if (about && about.matches(':hover')) setHovered(true);
})();
