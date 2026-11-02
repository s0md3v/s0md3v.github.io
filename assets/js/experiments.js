// The experiments page (playground/index.html): an apple that rolls away from the pointer, a toy
// soldier that aims at it, and a little open water that inks are dropped on. Each is drawn on its
// own canvas, and only works while it's on screen and something's happening.
(() => {
  const page = document.querySelector('.experiments-page');
  if (!page) return;

  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  const night = () => root.classList.contains('dark-mode');
  const TAU = Math.PI * 2;
  // The light, from the window at the top left, and the eye, straight above
  const LIGHT = (() => {
    const l = [-0.45, -0.55, 0.7];
    const n = Math.hypot(...l);
    return l.map(c => c / n);
  })();
  const HALF = (() => {
    const h = [LIGHT[0], LIGHT[1], LIGHT[2] + 1];
    const n = Math.hypot(...h);
    return h.map(c => c / n);
  })();

  function seeded(seed) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  // Smooth value noise, about 0 to 1, with a feature every unit
  function valueNoise(seed) {
    const r = seeded(seed);
    const table = new Float32Array(256 * 256);
    for (let i = 0; i < table.length; i++) table[i] = r();
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
      const a = table[x0 + y0], b = table[x1 + y0], c = table[x0 + y1], d = table[x1 + y1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // ---- What runs them ----

  const things = [];
  let raf = 0;
  let last = 0;

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    let awake = false;
    // Each only while it's moving, or has something to do: one that's still is left alone, though
    // another one by it isn't
    for (const thing of things) {
      if (!thing.seen || !thing.w || !thing.awake) continue;
      thing.awake = thing.step(dt);
      thing.draw();
      if (thing.awake) awake = true;
    }
    if (awake) schedule();
    else last = 0;
  }

  // Something's happened that it might move for
  function wake(thing) {
    thing.awake = true;
    schedule();
  }

  function schedule() {
    if (raf || still.matches || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    last = 0;
    for (const thing of things) wake(thing);
  });

  const seen = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const thing = things.find(t => t.el === entry.target);
      if (thing) {
        thing.seen = entry.isIntersecting;
        if (thing.seen) thing.awake = true;
      }
    }
    schedule();
  });

  function size(thing) {
    // As fine as the screen, to twice the page's own pixels; or less, for one that needn't be
    const dpr = Math.min(thing.density || 2, window.devicePixelRatio || 1);
    const w = Math.round(thing.box.offsetWidth * dpr);
    const h = Math.round(thing.box.offsetHeight * dpr);
    if (!w || !h || (w === thing.w && h === thing.h)) return;
    thing.w = w;
    thing.h = h;
    if (thing.canvas) {
      thing.canvas.width = w;
      thing.canvas.height = h;
    }
    thing.resize();
    if (still.matches) thing.settle();
    thing.draw(true);
    wake(thing);
  }

  // (One that's drawn has a canvas; one that's only turned hasn't, and is measured as it is)
  function setUp(id, make) {
    const el = document.getElementById(id);
    if (!el) return;
    const canvas = el.querySelector('canvas');
    const box = canvas || el;
    const thing = { el, canvas, box, ctx: canvas && canvas.getContext('2d'), w: 0, h: 0, seen: false, awake: true };
    Object.assign(thing, make(thing));
    things.push(thing);
    new ResizeObserver(() => size(thing)).observe(box);
    seen.observe(el);
  }

  // The pointer, wherever it is on the page
  let pointer = null;
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    pointer = { x: e.clientX, y: e.clientY, time: e.timeStamp };
    // (each says whether it minds)
    for (const thing of things) if (thing.seen && thing.follow(pointer)) wake(thing);
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    pointer = null;
  });
  // Scrolling moves things under a pointer that's still
  window.addEventListener('scroll', () => {
    if (!pointer) return;
    for (const thing of things) if (thing.seen && thing.follow(pointer, true)) wake(thing);
  }, { passive: true });

  // Where a point on the screen is on a thing's canvas, in its pixels
  function onCanvas(thing, p) {
    const box = thing.box.getBoundingClientRect();
    return { x: ((p.x - box.left) / box.width) * thing.w, y: ((p.y - box.top) / box.height) * thing.h };
  }

  function layer(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ---- Red is pain: a green plastic soldier, lying down, aiming at the pointer ----
  //
  // Moulded, so it's lit as a shape is: he's built once as a relief (a height for every point of
  // him, from the capsules and domes he's made of), and every time he turns, that's lit again
  // from the window, which doesn't turn with him. His shadow doesn't either.

  setUp('soldier', thing => {
    // Lengthwise, his rifle's way; across, to his left. In units of his length.
    const X0 = -0.65, X1 = 0.79, Y0 = -0.3, Y1 = 0.3;
    // Finer than he's ever drawn, and no finer
    const RES = 240;
    const HW = Math.round((X1 - X0) * RES), HH = Math.round((Y1 - Y0) * RES);
    const n = HW * HH;
    const raw = new Float32Array(n);

    // A rod with rounded ends, risen to `k` of its radius, from `z` up
    function capsule(ax, ay, bx, by, r, z = 0, k = 0.9) {
      k *= 0.6;
      z *= 0.6;
      const minX = Math.min(ax, bx) - r, maxX = Math.max(ax, bx) + r;
      const minY = Math.min(ay, by) - r, maxY = Math.max(ay, by) + r;
      const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy || 1e-9;
      for (let j = Math.max(0, Math.floor((minY - Y0) * RES)); j < Math.min(HH, Math.ceil((maxY - Y0) * RES)); j++) {
        const y = Y0 + (j + 0.5) / RES;
        for (let i = Math.max(0, Math.floor((minX - X0) * RES)); i < Math.min(HW, Math.ceil((maxX - X0) * RES)); i++) {
          const x = X0 + (i + 0.5) / RES;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2));
          const dx = x - ax - t * vx, dy = y - ay - t * vy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          const h = z + k * Math.sqrt(r * r - d2);
          const at = i + HW * j;
          if (h > raw[at]) raw[at] = h;
        }
      }
    }

    // A dome over an ellipse, `tall` at its middle
    function dome(cx, cy, rx, ry, tall, z = 0) {
      tall *= 0.6;
      z *= 0.6;
      for (let j = Math.max(0, Math.floor((cy - ry - Y0) * RES)); j < Math.min(HH, Math.ceil((cy + ry - Y0) * RES)); j++) {
        const y = Y0 + (j + 0.5) / RES;
        for (let i = Math.max(0, Math.floor((cx - rx - X0) * RES)); i < Math.min(HW, Math.ceil((cx + rx - X0) * RES)); i++) {
          const x = X0 + (i + 0.5) / RES;
          const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (e >= 1) continue;
          const h = z + tall * Math.sqrt(1 - e);
          const at = i + HW * j;
          if (h > raw[at]) raw[at] = h;
        }
      }
    }

    // Prone, as a rifleman lies to fire: on his front, his rifle to his cheek; his left leg
    // straight back and a little out, his right drawn up, knee out to the side, which takes
    // his weight off his chest; his feet turned out, lying on their insides
    capsule(-0.2, 0.05, -0.38, 0.08, 0.052, 0, 0.8);
    capsule(-0.38, 0.08, -0.56, 0.1, 0.044, 0, 0.8);
    capsule(-0.2, -0.05, -0.29, -0.2, 0.052, 0, 0.8);
    capsule(-0.29, -0.2, -0.465, -0.175, 0.044, 0, 0.8);
    capsule(-0.565, 0.1, -0.585, 0.15, 0.03, 0.01, 0.9);
    capsule(-0.47, -0.175, -0.49, -0.222, 0.03, 0.01, 0.9);
    dome(-0.15, 0, 0.1, 0.105, 0.07);
    dome(0.03, 0, 0.19, 0.13, 0.085);
    // His pack, and the belt round him
    dome(-0.01, 0, 0.11, 0.08, 0.05, 0.065);
    capsule(-0.1, -0.11, -0.1, 0.11, 0.022, 0.035, 0.8);
    // Arms: elbows down and out, hands on the rifle
    capsule(0.15, 0.115, 0.27, 0.185, 0.04, 0.01, 0.85);
    capsule(0.27, 0.185, 0.43, 0.0, 0.034, 0.01, 0.85);
    capsule(0.15, -0.115, 0.25, -0.17, 0.04, 0.01, 0.85);
    capsule(0.25, -0.17, 0.27, -0.06, 0.034, 0.01, 0.85);
    // The rifle, along his right cheek: stock, body, barrel, and its sight
    capsule(0.17, -0.05, 0.5, -0.04, 0.022, 0.06, 0.8);
    capsule(0.5, -0.04, 0.75, -0.035, 0.011, 0.06, 0.9);
    dome(0.47, -0.04, 0.018, 0.012, 0.02, 0.075);
    // His helmet, and its brim
    dome(0.28, 0.005, 0.1, 0.092, 0.035, 0.03);
    dome(0.27, 0.005, 0.082, 0.078, 0.085, 0.03);

    function blur(src, radius) {
      const tmp = new Float32Array(n), out = new Float32Array(n);
      const span = 2 * radius + 1;
      for (let j = 0; j < HH; j++) {
        let sum = 0;
        for (let i = -radius; i <= radius; i++) sum += src[Math.max(0, Math.min(HW - 1, i)) + HW * j];
        for (let i = 0; i < HW; i++) {
          tmp[i + HW * j] = sum / span;
          sum += src[Math.min(HW - 1, i + radius + 1) + HW * j] - src[Math.max(0, i - radius) + HW * j];
        }
      }
      for (let i = 0; i < HW; i++) {
        let sum = 0;
        for (let j = -radius; j <= radius; j++) sum += tmp[i + HW * Math.max(0, Math.min(HH - 1, j))];
        for (let j = 0; j < HH; j++) {
          out[i + HW * j] = sum / span;
          sum += tmp[i + HW * Math.min(HH - 1, j + radius + 1)] - tmp[i + HW * Math.max(0, j - radius)];
        }
      }
      return out;
    }

    const solid = new Float32Array(n);
    for (let k = 0; k < n; k++) solid[k] = raw[k] > 0 ? 1 : 0;
    // Moulded: where its parts meet, filled in a little, as plastic is
    const height = blur(blur(raw, 1), 1);
    const cover = blur(solid, 1);
    const shade = blur(solid, 4);
    // Him, blurred well past his edges: what he carries along as he turns
    const wide = blur(blur(solid, 6), 6);
    // Down in the creases, where less light gets
    const around = blur(height, 6);
    const nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n), crease = new Float32Array(n);
    for (let j = 1; j < HH - 1; j++) {
      for (let i = 1; i < HW - 1; i++) {
        const k = i + HW * j;
        const gx = (height[k + 1] - height[k - 1]) * RES * 0.5;
        const gy = (height[k + HW] - height[k - HW]) * RES * 0.5;
        const len = Math.hypot(gx, gy, 1);
        nx[k] = -gx / len;
        ny[k] = -gy / len;
        nz[k] = 1 / len;
        crease[k] = Math.min(0.45, Math.max(0, around[k] - height[k]) * 9);
      }
    }

    // How thick he is about each place: the most he stands up anywhere near it, so the edges
    // of his thick parts aren't taken for thin ones
    function most(src, radius) {
      const tmp = new Float32Array(n), out = new Float32Array(n);
      for (let j = 0; j < HH; j++) {
        for (let i = 0; i < HW; i++) {
          let m = 0;
          for (let d = Math.max(0, i - radius); d <= Math.min(HW - 1, i + radius); d++) m = Math.max(m, src[d + HW * j]);
          tmp[i + HW * j] = m;
        }
      }
      for (let i = 0; i < HW; i++) {
        for (let j = 0; j < HH; j++) {
          let m = 0;
          for (let d = Math.max(0, j - radius); d <= Math.min(HH - 1, j + radius); d++) m = Math.max(m, tmp[i + HW * d]);
          out[i + HW * j] = m;
        }
      }
      return out;
    }
    const thick = most(raw, 7);

    // What he's made of, and it isn't even: the colour swirls a little, as cheap plastic does,
    // with a fine grain through it; where he's thin (rifle, hands, boots), light gets in and he's
    // paler and yellower; and his sheen comes and goes over him
    const swirlNoise = valueNoise(41), sheenNoise = valueNoise(47);
    const tone = new Float32Array(n), thin = new Float32Array(n), sheen = new Float32Array(n), hue = new Float32Array(n);
    const hueNoise = valueNoise(53);
    for (let j = 0; j < HH; j++) {
      for (let i = 0; i < HW; i++) {
        const k = i + HW * j;
        const x = i / RES, y = j / RES;
        tone[k] = 0.8 + 0.34 * swirlNoise(x * 9, y * 9 + swirlNoise(x * 4, y * 4) * 2.5);
        // Olive here, bluer there, where the batch wasn't mixed through
        hue[k] = (hueNoise(x * 5 + 7, y * 5) - 0.5) * 2;
        thin[k] = 1 - smooth(0.016, 0.034, thick[k]);
        sheen[k] = 0.25 + 1.7 * sheenNoise(x * 7, y * 7) ** 1.5;
      }
    }

    // About his middle, which is what he turns on; and how big he is, in what he's drawn on
    const PX = 0.06;
    const SIZE = 0.42;
    let angle = -0.3, speed = 0, target = -0.3, drawn = NaN;
    let bloodPainted = 0, shown = null;
    // His farthest from what he turns on, rifle tip or boot
    const FAR = 0.7;

    // ---- The blood under him ----
    //
    // On the paper, not on him, so it stays put as he turns. It's a film, and spreads as one:
    // what flows between two places goes as the cube of how deep it is there, so a pool runs
    // out quickly while it's deep and all but stops once it's thin, which gives it a rounded
    // edge; the paper's not quite even, so that edge isn't either. His wound bleeds where it
    // lies, as long as it isn't lying in enough already. Turning, he drags through it.
    const G = 120;
    const pool = new Float32Array(G * G), next = new Float32Array(G * G);
    const rough = new Float32Array(G * G);
    const roughNoise = valueNoise(61);
    // Some of it soaks up and holds the blood, some lets it run, in patches and finer within them
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const n = 0.65 * roughNoise(i * 0.16, j * 0.16) + 0.35 * roughNoise(i * 0.5 + 30, j * 0.5);
        rough[i + G * j] = 0.06 + 1.9 * smooth(0.3, 0.75, n);
      }
    }
    const SG = SIZE * G;
    // In his side, so as he turns it's carried over clean paper
    const WOUND = [0.03, 0.11];
    let total = 0, bloodChanged = true;
    // How long since he died: from then, the blood thickens as it clots, and stops spreading
    let deadFor = 0;
    // The part of the grid that's wet, give or take a cell: all there is to work on
    let wx0 = G, wx1 = -1, wy0 = G, wy1 = -1;
    function wetAlso(i0, j0, i1, j1) {
      wx0 = Math.max(0, Math.min(wx0, i0));
      wy0 = Math.max(0, Math.min(wy0, j0));
      wx1 = Math.min(G - 1, Math.max(wx1, i1));
      wy1 = Math.min(G - 1, Math.max(wy1, j1));
    }
    // All he has in him, which is what the wound's pressure goes by; and how much of it he can
    // lose: about two thirds, and then the wound stops. Lying still, that's some 20 seconds after
    // he's first seen; the more he moves, the harder it pours, and the sooner.
    const CAP = 1450, LETHAL = 930;
    // How hard he's been moving, lately: how fast he's turned, over the last half second or so
    let strain = 0;

    // Where a point of him is on the paper's grid, as he's turned now
    function onGrid(lx, ly) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const ex = lx - PX, ey = ly;
      return [G / 2 + (cos * ex - sin * ey) * SG, G / 2 + (sin * ex + cos * ey) * SG];
    }

    // The part of the grid he's over as he lies now, with a little to spare for his blur
    function under() {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      let i0 = G, i1 = 0, j0 = G, j1 = 0;
      for (const [lx, ly] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) {
        const ex = lx - PX, ey = ly;
        const gx = G / 2 + (cos * ex - sin * ey) * SG, gy = G / 2 + (sin * ex + cos * ey) * SG;
        i0 = Math.min(i0, gx); i1 = Math.max(i1, gx);
        j0 = Math.min(j0, gy); j1 = Math.max(j1, gy);
      }
      return [Math.max(1, Math.floor(i0) - 2), Math.min(G - 2, Math.ceil(i1) + 2), Math.max(1, Math.floor(j0) - 2), Math.min(G - 2, Math.ceil(j1) + 2)];
    }

    // Some blood put down at a place between cells, shared among the four round it
    function splat(into, x, y, amount) {
      x = Math.max(0, Math.min(G - 1.001, x));
      y = Math.max(0, Math.min(G - 1.001, y));
      const i = x | 0, j = y | 0, tx = x - i, ty = y - j, a = i + G * j;
      into[a] += amount * (1 - tx) * (1 - ty);
      into[a + 1] += amount * tx * (1 - ty);
      into[a + G] += amount * (1 - tx) * ty;
      into[a + G + 1] += amount * tx * ty;
      wetAlso(i - 1, j - 1, i + 2, j + 2);
    }

    // Turning, he scoops it: what's under him goes where he goes, and outward as it does, so
    // it bunches up ahead of each limb, is left in a lobe wherever he stops, and he wipes a way
    // through behind. His outline's taken well blurred, so all that's near a place moves much
    // as it does, and it's moved without streaks. It's moved, never made.
    // The ways the paper lets it run out, fixed to the page: a few, uneven, as a sheet's dips
    // and grain go; so what he pushes out goes in tongues, not all round
    const RUN = new Float32Array(G * G);
    {
      const runNoise = valueNoise(67);
      for (let j = 0; j < G; j++) {
        for (let i = 0; i < G; i++) {
          const t = Math.atan2(j - G / 2, i - G / 2), d = Math.hypot(i - G / 2, j - G / 2);
          const n = runNoise(Math.cos(t) * 1.7 + 9 + d * 0.02, Math.sin(t) * 1.7 + 9);
          RUN[i + G * j] = smooth(0.4, 0.7, n) * smooth(0.12 * SG, 0.3 * SG, d);
        }
      }
    }
    let carriedAt = angle;
    function carry() {
      const turned = angle - carriedAt;
      if (Math.abs(turned) < 1e-4) return false;
      carriedAt = angle;
      // Not when he's simply put somewhere else, all at once, as he is without motion
      if (Math.abs(turned) > 0.4 || wx1 < 0) return false;
      const mid = angle - turned / 2, cos = Math.cos(mid), sin = Math.sin(mid);
      // Only where he is, and there's blood
      const [ui0, ui1, uj0, uj1] = under();
      const i0 = Math.max(ui0, wx0), i1 = Math.min(ui1, wx1), j0 = Math.max(uj0, wy0), j1 = Math.min(uj1, wy1);
      const out = Math.abs(turned) * 0.6;
      next.set(pool);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const a = i + G * j, h = pool[a];
          if (h <= 0.001) continue;
          // How much of him's about here
          const rx = i - G / 2, ry = j - G / 2;
          const lx = PX + (cos * rx + sin * ry) / SG, ly = (-sin * rx + cos * ry) / SG;
          const u = ((lx - X0) * RES) | 0, v = ((ly - Y0) * RES) | 0;
          const w = u >= 0 && v >= 0 && u < HW && v < HH ? wide[u + HW * v] : 0;
          if (w < 0.02) continue;
          next[a] -= h;
          // Round with him, less than he goes, and not out where his ends are, or they'd fling it
          // off in arcs; out, where the paper lets it
          const round = 0.35 * turned * w * (1 - smooth(0.35 * SG, 0.6 * SG, Math.hypot(rx, ry))), run = out * w * RUN[a];
          splat(next, i - ry * round + rx * run, j + rx * round + ry * run, h);
        }
      }
      pool.set(next);
      return true;
    }

    function bleed(dt) {
      let changed = carry();
      // From the wound, until there's no more to come, and less as there's less behind it
      const [wx, wy] = onGrid(WOUND[0], WOUND[1]);
      const wi = Math.round(wx), wj = Math.round(wy);
      if (total < LETHAL && wi > 2 && wj > 2 && wi < G - 3 && wj < G - 3) {
        // (a little turning costs him little; thrashing round, a great deal)
        const pressure = (0.3 + 0.7 * (1 - total / CAP)) * (1 + Math.min(4, strain * strain));
        for (let j = wj - 2; j <= wj + 2; j++) {
          for (let i = wi - 2; i <= wi + 2; i++) {
            const add = 5 * pressure * dt * Math.exp(-((i - wx) ** 2 + (j - wy) ** 2) / 2.5);
            pool[i + G * j] += add;
            total += add;
          }
        }
        wetAlso(wi - 2, wj - 2, wi + 2, wj + 2);
        changed = true;
      }
      if (wx1 < 0) return changed;
      // Spreading, in steps small enough to be steady however long the frame was (each moves at
      // most a fifth of the difference between two cells); each can wet one more cell round
      let most = 0;
      const PASSES = Math.max(8, Math.ceil((dt * 48 * 2) / 0.2));
      for (let pass = 0; pass < PASSES; pass++) {
        wetAlso(wx0 - 1, wy0 - 1, wx1 + 1, wy1 + 1);
        next.set(pool);
        const k = (48 * dt * Math.exp(-deadFor / 12)) / PASSES;
        for (let j = wy0; j <= wy1; j++) {
          for (let i = wx0; i <= wx1; i++) {
            const a = i + G * j, ha = pool[a];
            if (i < G - 1) {
              const b = a + 1, hb = pool[b];
              if (ha > 0.001 || hb > 0.001) {
                const mean = 0.5 * (ha + hb);
                const flow = k * Math.min(1, mean * mean * mean) * (ha - hb) * 0.5 * (rough[a] + rough[b]);
                next[a] -= flow;
                next[b] += flow;
                if (Math.abs(flow) > most) most = Math.abs(flow);
              }
            }
            if (j < G - 1) {
              const b = a + G, hb = pool[b];
              if (ha > 0.001 || hb > 0.001) {
                const mean = 0.5 * (ha + hb);
                const flow = k * Math.min(1, mean * mean * mean) * (ha - hb) * 0.5 * (rough[a] + rough[b]);
                next[a] -= flow;
                next[b] += flow;
                if (Math.abs(flow) > most) most = Math.abs(flow);
              }
            }
          }
        }
        pool.set(next);
      }
      // Back to what's wet now
      let i0 = G, i1 = -1, j0 = G, j1 = -1;
      for (let j = wy0; j <= wy1; j++) {
        for (let i = wx0; i <= wx1; i++) {
          if (pool[i + G * j] > 0.001) {
            if (i < i0) i0 = i;
            if (i > i1) i1 = i;
            if (j < j0) j0 = j;
            if (j > j1) j1 = j;
          }
        }
      }
      wx0 = G; wx1 = -1; wy0 = G; wy1 = -1;
      if (i1 >= 0) wetAlso(i0 - 1, j0 - 1, i1 + 1, j1 + 1);
      if (changed || most > 1e-5) bloodChanged = true;
      return changed || most > 4e-5;
    }

    // Hit a while ago: lying in a good pool already, run out ragged as a pool does, and the
    // rest comes as he's watched
    {
      const [wx, wy] = onGrid(WOUND[0], WOUND[1]);
      for (let j = 0; j < G; j++) {
        for (let i = 0; i < G; i++) {
          const d2 = (i - wx) ** 2 + (j - wy) ** 2;
          if (d2 > 196) continue;
          const add = 0.9 * (1 - d2 / 196);
          pool[i + G * j] += add;
          total += add;
        }
      }
      wetAlso(Math.floor(wx - 14), Math.floor(wy - 14), Math.ceil(wx + 14), Math.ceil(wy + 14));
    }
    for (let n = 0; n < 60 * 5; n++) bleed(1 / 60);

    // What he had left in him when he's first seen, and how much of that's left now: as it
    // goes, so does he, and once it's all out, the wound stops and he's still
    const START = total;
    const life = () => Math.max(0, Math.min(1, (LETHAL - total) / (LETHAL - START)));
    let phase = 0;

    const BR = G * 2;
    const blood = layer(BR, BR);
    const bloodCtx = blood.getContext('2d');
    const bloodImage = bloodCtx.createImageData(BR, BR);
    let painted = [BR, BR, -1, -1];

    function paintBlood(dark, near) {
      const data = bloodImage.data;
      const sample = (x, y) => {
        x = Math.max(0, Math.min(G - 1.001, x));
        y = Math.max(0, Math.min(G - 1.001, y));
        const i = x | 0, j = y | 0, tx = x - i, ty = y - j, a = i + G * j;
        return (1 - ty) * ((1 - tx) * pool[a] + tx * pool[a + 1]) + ty * ((1 - tx) * pool[a + G] + tx * pool[a + G + 1]);
      };
      const step = G / BR;
      // What's wet, in its pixels, and what was last time, so what's dried off's cleared
      const now = wx1 < 0 ? [BR, BR, -1, -1] : [Math.floor(wx0 / step), Math.floor(wy0 / step), Math.ceil((wx1 + 1) / step), Math.ceil((wy1 + 1) / step)];
      let x0 = Math.max(0, Math.min(now[0], painted[0])), y0 = Math.max(0, Math.min(now[1], painted[1]));
      let x1 = Math.min(BR - 1, Math.max(now[2], painted[2])), y1 = Math.min(BR - 1, Math.max(now[3], painted[3]));
      // Only about him, when that's all that's needed now; the rest when it's due
      if (near) {
        x0 = Math.max(x0, Math.floor(near[0] / step)); x1 = Math.min(x1, Math.ceil((near[1] + 1) / step));
        y0 = Math.max(y0, Math.floor(near[2] / step)); y1 = Math.min(y1, Math.ceil((near[3] + 1) / step));
      } else painted = now;
      if (x1 < x0 || y1 < y0) return;
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const x = (px + 0.5) * step - 0.5, y = (py + 0.5) * step - 0.5;
          const h = sample(x, y);
          const o = 4 * (px + BR * py);
          // Only where it's pooled: what's run thinner than that doesn't show
          if (h < 0.04) {
            data[o + 3] = 0;
            continue;
          }
          const hx = sample(x + 1, y) - sample(x - 1, y), hy = sample(x, y + 1) - sample(x, y - 1);
          // With an edge a pixel wide, however gently it slopes there
          const slope = Math.hypot(hx, hy) * 0.5 * step + 1e-5;
          const wet = Math.max(0, Math.min(1, 0.5 + (h - 0.08) / slope));
          if (wet <= 0.001) {
            data[o + 3] = 0;
            continue;
          }
          // Deep, it's nearly black; thin, a clear dark red
          const deep = smooth(0.12, 0.9, h);
          let r = 132 - 80 * deep, g = 16 - 10 * deep, b = 18 - 10 * deep;
          // Its surface: flat where it's deep, curving down at its edge; and it's glossy
          const gx = hx * 0.9, gy = hy * 0.9;
          const len = Math.hypot(gx, gy, 1);
          const nx = -gx / len, ny = -gy / len, nz = 1 / len;
          const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const facing = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
          const f3 = facing * facing * facing, f6 = f3 * f3, f12 = f6 * f6, f24 = f12 * f12;
          const f90 = f24 * f24 * f24 * f12 * f6;
          const shine = (f90 * 1.4 + f12 * 0.1) * wet;
          const lit = 0.7 + 0.4 * diffuse;
          r = r * lit + 255 * shine;
          g = g * lit + 240 * shine;
          b = b * lit + 235 * shine;
          if (dark) {
            r *= 0.75; g *= 0.75; b *= 0.75;
          }
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
          data[o + 3] = 255 * wet;
        }
      }
      bloodCtx.putImageData(bloodImage, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }

    // He's drawn at full resolution, or, while he's turning fast, where it can't be seen, at half
    let bodies = null;
    function resize() {
      bodies = [1, 0.5].map(q => {
        const w = Math.round(thing.w * q), h = Math.round(thing.h * q), canvas = layer(w, h);
        return { q, w, h, canvas, image: canvas.getContext('2d').createImageData(w, h), was: null };
      });
      drawn = NaN;
      bloodChanged = true;
    }

    function paintBody(at) {
      const { w, h, q } = at;
      const data = at.image.data;
      const s = Math.min(thing.w, thing.h) * SIZE * q;
      const cx = w / 2, cy = h / 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      // His shadow's cast away from the window, whichever way he's turned
      const ox = 0.028, oy = 0.04;
      const sox = cos * ox + sin * oy, soy = -sin * ox + cos * oy;
      const dark = night();
      const base = dark ? [58, 76, 32] : [70, 92, 38];
      const shadowAlpha = dark ? 0.5 : 0.3;
      // Only where he, or his shadow, can be: round the box he's drawn in, turned as he is
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [lx, ly] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) {
        const ex = lx - PX, ey = ly;
        const sx = cx + (cos * ex - sin * ey) * s, sy = cy + (sin * ex + cos * ey) * s;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx + ox * s);
        y0 = Math.min(y0, sy); y1 = Math.max(y1, sy + oy * s);
      }
      // Only what's changed: where he was last time, cleared, and where he is now
      const bx0 = Math.max(0, Math.floor(x0)), bx1 = Math.min(w, Math.ceil(x1));
      const by0 = Math.max(0, Math.floor(y0)), by1 = Math.min(h, Math.ceil(y1));
      if (at.was) {
        const [ax0, ay0, ax1, ay1] = at.was;
        for (let y = ay0; y < ay1; y++) data.fill(0, 4 * (ax0 + w * y), 4 * (ax1 + w * y));
      }
      const dirty = at.was ? [Math.min(bx0, at.was[0]), Math.min(by0, at.was[1]), Math.max(bx1, at.was[2]), Math.max(by1, at.was[3])] : [0, 0, w, h];
      at.was = [bx0, by0, bx1, by1];
      // Everything about him at a place, blended between the four nearest, so his curves are smooth
      let a = 0, w00 = 0, w10 = 0, w01 = 0, w11 = 0;
      const blend = f => w00 * f[a] + w10 * f[a + 1] + w01 * f[a + HW] + w11 * f[a + HW + 1];
      for (let y = by0; y < by1; y++) {
        const dy = (y + 0.5 - cy) / s;
        for (let x = bx0; x < bx1; x++) {
          const dx = (x + 0.5 - cx) / s;
          const lx = PX + cos * dx + sin * dy, ly = -sin * dx + cos * dy;
          const fx = (lx - X0) * RES - 0.5, fy = (ly - Y0) * RES - 0.5;
          const i = Math.floor(fx), j = Math.floor(fy);
          let c = 0;
          w00 = w10 = w01 = w11 = 0;
          a = 0;
          if (i >= 0 && j >= 0 && i < HW - 1 && j < HH - 1) {
            const tx = fx - i, ty = fy - j;
            a = i + HW * j;
            w00 = (1 - tx) * (1 - ty); w10 = tx * (1 - ty); w01 = (1 - tx) * ty; w11 = tx * ty;
            c = blend(cover);
          }
          const si = ((lx - sox - X0) * RES) | 0, sj = ((ly - soy - Y0) * RES) | 0;
          const sh = si >= 0 && sj >= 0 && si < HW && sj < HH ? shade[si + HW * sj] * shadowAlpha : 0;
          if (c <= 0.002 && sh <= 0.002) continue;
          const o = 4 * (x + w * y);
          if (c > 0.002) {
            // His normal, turned as he is
            let px = blend(nx), py = blend(ny), pz = blend(nz);
            const pl = Math.hypot(px, py, pz) || 1;
            px /= pl; py /= pl; pz /= pl;
            const ax = cos * px - sin * py, ay = sin * px + cos * py, az = pz;
            const diffuse = Math.max(0, ax * LIGHT[0] + ay * LIGHT[1] + az * LIGHT[2]);
            const facing = Math.max(0, ax * HALF[0] + ay * HALF[1] + az * HALF[2]);
            // Satin, as the cheap plastic they're made of is
            const f2 = facing * facing, f4 = f2 * f2, f16 = f4 * f4 * f4 * f4;
            const gloss = (f16 * f2 * 0.16 + f4 * 0.035) * blend(sheen);
            const lit = (0.4 + 0.72 * diffuse) * (1 - blend(crease)) * blend(tone);
            const glow = blend(thin) * (0.25 + 0.5 * diffuse);
            const alpha = c + (1 - c) * sh;
            const tint = blend(hue) * lit;
            data[o] = (c * (base[0] * lit + 12 * tint + 72 * glow + 255 * gloss)) / alpha;
            data[o + 1] = (c * (base[1] * lit + 2 * tint + 78 * glow + 255 * gloss)) / alpha;
            data[o + 2] = (c * (base[2] * lit - 8 * tint + 20 * glow + 230 * gloss)) / alpha;
            data[o + 3] = 255 * alpha;
          } else {
            data[o + 3] = 255 * sh;
          }
        }
      }
      at.canvas.getContext('2d').putImageData(at.image, 0, 0, dirty[0], dirty[1], dirty[2] - dirty[0], dirty[3] - dirty[1]);
    }

    function draw(force) {
      // Redrawn when his ends have moved half a pixel; at half resolution while they're moving
      // two a frame or more, and sharp again as soon as he's slower
      const reach = Math.min(thing.w, thing.h) * SIZE * FAR;
      const fast = Math.abs(speed) * reach > 120;
      const turned = !(Math.abs(angle - drawn) * reach < 0.5) || (!fast && shown && shown.q < 1);
      // While it's only spreading, it's slow: twenty times a second shows it as well as sixty.
      // While he's turning, he's moving what's under him, so that's every time.
      const now = performance.now();
      const due = bloodChanged && (force || now - bloodPainted >= 50);
      if (!force && !turned && !due) return;
      const dark = night();
      if (force || turned) {
        drawn = angle;
        shown = bodies[fast && !force ? 1 : 0];
        paintBody(shown);
      }
      if (due) {
        paintBlood(dark);
        bloodChanged = false;
        bloodPainted = now;
      } else if (turned && bloodChanged) paintBlood(dark, under());
      const { ctx, w, h } = thing;
      ctx.clearRect(0, 0, w, h);
      // The grid's the whole of what he's drawn on, square, in its middle
      const side = Math.min(w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(blood, (w - side) / 2, (h - side) / 2, side, side);
      ctx.drawImage(shown.canvas, 0, 0, w, h);
    }

    function follow(p) {
      const box = thing.canvas.getBoundingClientRect();
      const want = Math.atan2(p.y - (box.top + box.height / 2), p.x - (box.left + box.width / 2));
      // Dead, he doesn't; or the nearer way round
      if (life() <= 0) return false;
      target = angle + ((((want - angle) % TAU) + TAU * 1.5) % TAU) - Math.PI;
      if (still.matches) {
        angle = target;
        speed = 0;
        thing.draw();
      }
      return true;
    }

    function step(dt) {
      const left = life();
      if (left <= 0) {
        target = angle;
        deadFor += dt;
      }
      // Without a pointer to aim at, he watches the page, slowly, and slower as he weakens
      else if (!fine.matches) {
        phase += dt * 0.35 * (0.3 + 0.7 * left);
        target = -0.3 + Math.sin(phase) * 0.7;
      }
      // Turned on his belly: quick, but he has to get round, and settles; less and less so
      const pull = 38 * (0.04 + 0.96 * left ** 1.5);
      speed += ((target - angle) * pull - speed * 2 * Math.sqrt(pull)) * dt;
      angle += speed * dt;
      strain += (Math.abs(speed) - strain) * Math.min(1, dt * 2);
      const bleeding = bleed(dt);
      // (and awake till what's changed in the blood has been shown)
      return bleeding || bloodChanged || (left > 0 && !fine.matches) || Math.abs(target - angle) > 0.002 || Math.abs(speed) > 0.002;
    }

    // Without motion, the pool as it'd be after he'd lain a while, worked out once
    let settled = false;
    function settle() {
      if (settled) return;
      settled = true;
      for (let n = 0; n < 60 * 4; n++) bleed(1 / 60);
    }

    return { step, draw, resize, follow, settle };
  });

  // ---- Feel Better, Fast: an apple ----
  //
  // An apple a day; and low-hanging fruit. It lies on the page, and rolls away from what comes at
  // it. It's a ball, lit from the window: its skin, stalk and all, turns as it rolls.

  setUp('apple', thing => {
    const streaks = valueNoise(17);
    let R = 0;
    let x = 0, y = 0, vx = 0, vy = 0;
    let home = { x: 0, y: 0 };
    let at = null;
    // How it's turned: its own axes, on the page's (x right, y down, z up out of the page)
    let m = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
    let ball = null;

    // How far its skin's rolled since it was last drawn, in pixels; and whether it has to be
    // drawn whatever
    let rolled = 0, moved = true;
    function turn(ax, ay, az, by) {
      const c = Math.cos(by), s = Math.sin(by), t = 1 - c;
      const r = [
        t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
        t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
        t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
      ];
      const o = new Float64Array(9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[3 * i + j] = r[3 * i] * m[j] + r[3 * i + 1] * m[3 + j] + r[3 * i + 2] * m[6 + j];
      m = o;
    }
    // Lying stalk up, as an apple settles, tipped a little toward the window
    turn(1, 0, 0, 0.32);
    turn(0, 1, 0, -0.22);

    // Its canvas reaches past its place, so its shadow has room when it's rolled to the edge;
    // the apple stays in its place
    let pad = 0;
    function resize() {
      const { w, h } = thing;
      pad = ((thing.canvas.offsetWidth - thing.el.offsetWidth) / 2) * (w / thing.canvas.offsetWidth);
      R = (h - 2 * pad) * 0.25;
      home = { x: w / 2, y: pad + (h - 2 * pad) * 0.48 };
      if (!at) {
        x = home.x;
        y = home.y;
      } else {
        x = Math.max(pad + R, Math.min(w - pad - R, x));
        y = Math.max(pad + R, Math.min(h - pad - R, y));
      }
      at = true;
      moved = true;
      // Drawn at half resolution and laid on scaled up: softer, as an apple's skin is, and a
      // quarter of the work. Big enough for its widest.
      const q = 0.5, size = Math.ceil(R * q * 2 * Math.sqrt(OUTER2) + 4), canvas = layer(size, size);
      ball = {
        q, size, canvas, image: canvas.getContext('2d').createImageData(size, size),
        // How much of each pixel's the apple, and where on its skin
        inside: new Float32Array(size * size), locals: new Int32Array(size * size),
        // Where on each row it was, last it was drawn (none yet)
        from: new Int32Array(size).fill(size), to: new Int32Array(size).fill(-1),
      };
    }

    function skin(qx, qy, qz) {
      const theta = Math.acos(Math.max(-1, Math.min(1, qz)));
      const phi = Math.atan2(qy, qx);
      // Red, finely streaked down from the stalk, deepest on the cheek that saw the sun, and
      // a little of the yellow-green under it showing on the other
      const fine = streaks(Math.cos(phi) * 22 + 20, Math.sin(phi) * 22 + theta * 2.5);
      const broad = streaks(Math.cos(phi) * 4 + 40, Math.sin(phi) * 4 + theta * 0.8);
      const cheek = 0.5 + 0.5 * qx;
      const deep = Math.max(0, Math.min(1, cheek * 0.7 + (broad - 0.5) * 0.8 + 0.2));
      let r = 196 - 70 * deep, g = 52 - 34 * deep, b = 42 - 18 * deep;
      const light = (fine - 0.5) * 0.5;
      r += 60 * light;
      g += 26 * light;
      b += 12 * light;
      const ground = smooth(0.25, 0.85, (1 - cheek) * (1 - broad * 0.6)) * 0.55;
      r = r * (1 - ground) + 196 * ground;
      g = g * (1 - ground) + 164 * ground;
      b = b * (1 - ground) + 72 * ground;
      // The hollow the stalk's in, greener and in shadow; the dry calyx underneath
      const hollow = smooth(0.42, 0.1, theta);
      r = r * (1 - hollow) + 120 * hollow;
      g = g * (1 - hollow) + 112 * hollow;
      b = b * (1 - hollow) + 52 * hollow;
      const calyx = smooth(2.75, 3.05, theta);
      r = r * (1 - calyx) + 70 * calyx;
      g = g * (1 - calyx) + 52 * calyx;
      b = b * (1 - calyx) + 30 * calyx;
      return [r, g, b, hollow];
    }

    // Its shape, as how far its skin is from its middle, every way out from it: broad at the
    // shoulders, narrowing to its base, hollowed at the stalk and the calyx, and faintly
    // five-lobed, most toward its base. By how far from the stalk's way, a table.
    const ALONG = new Float32Array(513);
    for (let n = 0; n <= 512; n++) {
      const t = n / 256 - 1;
      ALONG[n] = 0.95 + 0.06 * t - 0.09 * t * t - 0.2 * Math.exp(-(1 - t) * 14) - 0.1 * Math.exp(-(1 + t) * 16);
    }
    function shapeAt(qx, qy, qz) {
      // Blended between its two nearest, so its hollows are smooth, not stepped
      const f = Math.max(0, Math.min(511.999, (qz + 1) * 256)), i = f | 0;
      let r = ALONG[i] + (f - i) * (ALONG[i + 1] - ALONG[i]);
      const across2 = qx * qx + qy * qy;
      if (across2 > 1e-6) {
        const c = qx / Math.sqrt(across2), c2 = c * c;
        r += 0.025 * c * (16 * c2 * c2 - 20 * c2 + 5) * across2 * (0.6 - 0.4 * qz);
      }
      return r;
    }

    // Its skin, and which way it faces, worked out once for every way out from its middle and
    // kept in a square, folded as an octahedron is unfolded, so finding a point's is a lookup
    const MAP = 256;
    let maps = null;
    function texel(qx, qy, qz) {
      const s = Math.abs(qx) + Math.abs(qy) + Math.abs(qz) || 1;
      let u = qx / s, v = qy / s;
      if (qz < 0) {
        const fu = (1 - Math.abs(v)) * (u < 0 ? -1 : 1);
        v = (1 - Math.abs(u)) * (v < 0 ? -1 : 1);
        u = fu;
      }
      const i = Math.max(0, Math.min(MAP - 1, Math.round((u + 1) * 0.5 * MAP - 0.5)));
      const j = Math.max(0, Math.min(MAP - 1, Math.round((v + 1) * 0.5 * MAP - 0.5)));
      return i + MAP * j;
    }

    // How far a point's inside its skin (or, less than nothing, outside it), for a point on the
    // eye's line through (dx, dy), z toward the eye
    // (shapeAt's own sums, done here without making the point's length one first)
    function gap(dx, dy, d2, z) {
      const l2 = d2 + z * z, l = Math.sqrt(l2);
      const qx = m[0] * dx + m[3] * dy + m[6] * z, qy = m[1] * dx + m[4] * dy + m[7] * z, qz = (m[2] * dx + m[5] * dy + m[8] * z) / l;
      const f = Math.max(0, Math.min(511.999, (qz + 1) * 256)), i = f | 0;
      let r = ALONG[i] + (f - i) * (ALONG[i + 1] - ALONG[i]);
      const across2 = qx * qx + qy * qy;
      if (across2 > 1e-6 * l2) {
        const c = qx / Math.sqrt(across2), c2 = c * c;
        r += 0.025 * c * (16 * c2 * c2 - 20 * c2 + 5) * (across2 / l2) * (0.6 - 0.4 * qz);
      }
      return r - l;
    }
    // The ball it fits in, for where to look for its skin
    let OUTER2 = 0;
    {
      let most = 0;
      for (let n = 0; n < 40000; n++) {
        const z = 1 - (2 * (n + 0.5)) / 40000, a = n * 2.399963, r = Math.sqrt(1 - z * z);
        most = Math.max(most, shapeAt(r * Math.cos(a), r * Math.sin(a), z));
      }
      OUTER2 = (most + 0.01) ** 2;
    }
    function bake() {
      const colour = new Float32Array(MAP * MAP * 4), normal = new Float32Array(MAP * MAP * 3);
      // Where its skin is, a little way off this way, for its slope there
      const skinPoint = (x, y, z) => {
        const l = Math.hypot(x, y, z);
        const r = shapeAt(x / l, y / l, z / l);
        return [(x / l) * r, (y / l) * r, (z / l) * r];
      };
      for (let j = 0; j < MAP; j++) {
        for (let i = 0; i < MAP; i++) {
          const u = ((i + 0.5) / MAP) * 2 - 1, v = ((j + 0.5) / MAP) * 2 - 1;
          let qx = u, qy = v;
          const qz = 1 - Math.abs(u) - Math.abs(v);
          if (qz < 0) {
            qx = (1 - Math.abs(v)) * (u < 0 ? -1 : 1);
            qy = (1 - Math.abs(u)) * (v < 0 ? -1 : 1);
          }
          const len = Math.hypot(qx, qy, qz);
          const k = i + MAP * j;
          const ox = qx / len, oy = qy / len, oz = qz / len;
          colour.set(skin(ox, oy, oz), 4 * k);
          // Two ways along its skin from here, and the way out of it, square to both
          let ax = -oy, ay = ox, az = 0;
          if (Math.abs(oz) > 0.9) { ax = 1; ay = 0; az = 0; }
          const al = Math.hypot(ax, ay, az);
          ax /= al; ay /= al; az /= al;
          const bx = oy * az - oz * ay, by = oz * ax - ox * az, bz = ox * ay - oy * ax;
          const e = 0.004;
          const p1 = skinPoint(ox + ax * e, oy + ay * e, oz + az * e), p2 = skinPoint(ox - ax * e, oy - ay * e, oz - az * e);
          const p3 = skinPoint(ox + bx * e, oy + by * e, oz + bz * e), p4 = skinPoint(ox - bx * e, oy - by * e, oz - bz * e);
          const ux = p1[0] - p2[0], uy = p1[1] - p2[1], uz = p1[2] - p2[2];
          const vx = p3[0] - p4[0], vy = p3[1] - p4[1], vz = p3[2] - p4[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const nl = Math.hypot(nx, ny, nz) || 1;
          normal[3 * k] = nx / nl;
          normal[3 * k + 1] = ny / nl;
          normal[3 * k + 2] = nz / nl;
        }
      }
      maps = { colour, normal };
    }


    // Its outline, as it's turned now, every way out from its middle. All of it that's seen that
    // way lies in the half of the plane through the eye's line and that way, and as all of it
    // is seen from its middle, the furthest it reaches that way is the furthest its skin does
    // in that half: across the half, the most of how far out it is, times how far from the
    // eye's line that is
    const RIM = 96, ACROSS = 36;
    const rim = new Float32Array(RIM);
    function outline() {
      for (let k = 0; k < RIM; k++) {
        const a = (k / RIM) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        let best = -1, b0 = 0, b1 = 0, b2 = 0, prev = 0;
        for (let n = 0; n < ACROSS; n++) {
          const f = ((n + 0.5) / ACROSS) * Math.PI, sf = Math.sin(f), cf = Math.cos(f);
          const wx = sf * ca, wy = sf * sa, wz = cf;
          const reach = shapeAt(m[0] * wx + m[3] * wy + m[6] * wz, m[1] * wx + m[4] * wy + m[7] * wz, m[2] * wx + m[5] * wy + m[8] * wz) * sf;
          if (reach > best) {
            best = reach;
            b0 = n > 0 ? prev : reach;
            b1 = reach;
            b2 = -1;
          } else if (b2 < 0) {
            b2 = reach;
          }
          prev = reach;
        }
        // Between the samples, where a curve through the best and those either side tops out
        const bend = b0 - 2 * b1 + b2;
        rim[k] = b2 >= 0 && bend < 0 ? b1 - ((b0 - b2) * (b0 - b2)) / (8 * bend) : best;
      }
      return rim;
    }

    function draw(force) {
      // Redrawn when it's rolled half a pixel of its own
      if (!force && !moved && rolled * ball.q < 0.5) return;
      // Turned only a little since it was last drawn, it's nowhere much past where it was then,
      // so only near that is it looked for
      const near = !force && !moved && rolled * ball.q < 2;
      rolled = 0;
      const r = R * ball.q;
      moved = false;
      const { ctx, w, h } = thing;
      ctx.clearRect(0, 0, w, h);
      const dark = night();

      // Its shadow: thrown away from the window, soft as it goes, and darkest right where it
      // touches the page
      const away = Math.atan2(-LIGHT[1], -LIGHT[0]);
      ctx.save();
      ctx.translate(x + Math.cos(away) * R * 0.42, y + Math.sin(away) * R * 0.42);
      ctx.rotate(away);
      ctx.scale(1.3, 1);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
      const cast = dark ? 0.42 : 0.2;
      g.addColorStop(0, `rgba(0, 0, 0, ${cast})`);
      g.addColorStop(0.5, `rgba(0, 0, 0, ${cast * 0.7})`);
      g.addColorStop(0.8, `rgba(0, 0, 0, ${cast * 0.25})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);
      ctx.restore();
      g = ctx.createRadialGradient(x + R * 0.08, y + R * 0.1, R * 0.55, x + R * 0.08, y + R * 0.1, R * 1.0);
      g.addColorStop(0, `rgba(0, 0, 0, ${dark ? 0.6 : 0.42})`);
      g.addColorStop(0.7, `rgba(0, 0, 0, ${dark ? 0.25 : 0.12})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + R * 0.08, y + R * 0.1, R * 1.0, 0, TAU);
      ctx.fill();

      if (!maps) bake();
      const size = ball.size, c = size / 2;
      const { inside, locals, from, to } = ball;
      // Where it was on each row, and three pixels round that, if that's all that's looked at
      const NEAR = 3;
      const lo = new Int32Array(size).fill(0), hi = new Int32Array(size).fill(size - 1);
      if (near) {
        for (let py = 0; py < size; py++) {
          let a = size, b = -1;
          for (let j = Math.max(0, py - NEAR); j <= Math.min(size - 1, py + NEAR); j++) {
            if (from[j] < a) a = from[j];
            if (to[j] > b) b = to[j];
          }
          lo[py] = Math.max(0, a - NEAR);
          hi[py] = Math.min(size - 1, b + NEAR);
        }
      }
      from.fill(size);
      to.fill(-1);
      // Where the eye's line through each point meets its skin, and where on it that is
      inside.fill(0);
      for (let py = 0; py < size; py++) {
        const dy = (py + 0.5 - c) / r;
        for (let px = lo[py]; px <= hi[py]; px++) {
          const dx = (px + 0.5 - c) / r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= OUTER2) continue;
          // Down the eye's line from the front of the ball it fits in, until it's in its skin,
          // then closer: as it lies tipped, its shoulders can stand out nearer than its middle
          const top = Math.sqrt(OUTER2 - d2);
          const stride = Math.max(0.05, top / 3);
          // (how far outside it is at the top's only wanted if it's still the nearest outside)
          let out = top, outGap = NaN, z = top, margin = -1;
          for (let n = 0; n < 8 && z > -top; n++) {
            z -= stride;
            const g = gap(dx, dy, d2, z);
            if (g >= 0) {
              margin = g;
              break;
            }
            out = z;
            outGap = g;
          }
          if (margin < 0) continue;
          let into = z, intoGap = margin;
          for (let n = 0; n < 2; n++) {
            const mid = 0.5 * (out + into), g = gap(dx, dy, d2, mid);
            if (g >= 0) {
              into = mid;
              intoGap = g;
            } else {
              out = mid;
              outGap = g;
            }
          }
          // Then straight to where its skin is, between the two, so there's no stepping
          if (outGap !== outGap) outGap = gap(dx, dy, d2, out);
          const hit = out + ((into - out) * outGap) / (outGap - intoGap);
          const t = texel(m[0] * dx + m[3] * dy + m[6] * hit, m[1] * dx + m[4] * dy + m[7] * hit, m[2] * dx + m[5] * dy + m[8] * hit);
          if (px < from[py]) from[py] = px;
          if (px > to[py]) to[py] = px;
          const k = px + size * py;
          inside[k] = 1;
          locals[k] = t;
        }
      }

      const data = ball.image.data;
      data.fill(0);
      const ambient = dark ? 0.24 : 0.32;
      for (let py = 1; py < size - 1; py++) {
        for (let px = 1; px < size - 1; px++) {
          const k = px + size * py;
          if (inside[k] <= 0) continue;
          // Its slope there, as it was worked out once, turned as it's turned
          const q = 3 * locals[k], nm = maps.normal;
          const nx = m[0] * nm[q] + m[1] * nm[q + 1] + m[2] * nm[q + 2];
          const ny = m[3] * nm[q] + m[4] * nm[q + 1] + m[5] * nm[q + 2];
          const nz = m[6] * nm[q] + m[7] * nm[q + 1] + m[8] * nm[q + 2];
          const t = 4 * locals[k];
          const col = maps.colour;
          const r = col[t], gg = col[t + 1], b = col[t + 2], hollow = col[t + 3];
          const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const facing = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
          // Waxy: a tight shine, and a broad soft one
          const f2 = facing * facing, f4 = f2 * f2, f8 = f4 * f4, f32 = f8 * f8 * f8 * f8;
          const gloss = (f32 * f8 * f4 * 0.32 + f4 * f2 * 0.05) * (1 - hollow * 0.6);
          const lit = (ambient + 0.82 * diffuse) * (1 - 0.15 * hollow) * (0.8 + 0.2 * nz);
          const o = 4 * k;
          data[o] = r * lit + 255 * gloss;
          data[o + 1] = gg * lit + 250 * gloss;
          data[o + 2] = b * lit + 235 * gloss;
          data[o + 3] = 255;
        }
      }
      // Its colour carried a little way past where it was found, so that what's just inside its
      // edge, scaled up, isn't thinned by what's outside it (or missed, where the eye's line
      // only grazes it)
      for (let ring = 2; ring <= 3; ring++) {
        for (let py = 1; py < size - 1; py++) {
          for (let px = 1; px < size - 1; px++) {
            const k = px + size * py;
            if (inside[k]) continue;
            const from = inside[k - 1] && inside[k - 1] < ring ? k - 1 : inside[k + 1] && inside[k + 1] < ring ? k + 1
              : inside[k - size] && inside[k - size] < ring ? k - size : inside[k + size] && inside[k + size] < ring ? k + size : -1;
            if (from < 0) continue;
            inside[k] = ring;
            data.copyWithin(4 * k, 4 * from, 4 * from + 4);
          }
        }
      }
      ball.canvas.getContext('2d').putImageData(ball.image, 0, 0);
      // And cut to its outline, at the screen's own resolution: smooth, however coarse its colour
      ctx.save();
      ctx.beginPath();
      const rim = outline();
      for (let k = 0; k < RIM; k++) {
        const a = (k / RIM) * TAU;
        ctx.lineTo(x + Math.cos(a) * rim[k] * R, y + Math.sin(a) * rim[k] * R);
      }
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(ball.canvas, x - c / ball.q, y - c / ball.q, size / ball.q, size / ball.q);
      ctx.restore();

    }

    function step(dt) {
      const { w, h } = thing;
      if (pointer && fine.matches) {
        const p = onCanvas(thing, pointer);
        const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1;
        const reach = R * 2.2;
        if (d < reach) {
          const push = (1 - d / reach) ** 1.5 * R * 26;
          vx += (dx / d) * push * dt;
          vy += (dy / d) * push * dt;
        }
      }
      // It lies in the slightest dip, so it comes back, slowly
      vx += (home.x - x) * 0.9 * dt;
      vy += (home.y - y) * 0.9 * dt;
      const drag = Math.exp(-1.7 * dt);
      vx *= drag;
      vy *= drag;
      x += vx * dt;
      y += vy * dt;
      const lo = pad + R;
      if (x < lo) { x = lo; vx = Math.abs(vx) * 0.35; }
      if (x > w - lo) { x = w - lo; vx = -Math.abs(vx) * 0.35; }
      if (y < lo) { y = lo; vy = Math.abs(vy) * 0.35; }
      if (y > h - lo) { y = h - lo; vy = -Math.abs(vy) * 0.35; }
      // Rolling, not sliding: it turns about the line across its way, as far as it's gone
      const v = Math.hypot(vx, vy);
      // Rolled nearly back, and barely moving, it stops where it is: no creeping the last few
      // pixels home (far off, slow's only it turning back, and it goes on)
      const awake = v > R * 0.1 || Math.hypot(home.x - x, home.y - y) > R * 0.15;
      if (!awake) {
        vx = vy = 0;
        return false;
      }
      if (v > 0.01) {
        turn(-vy / v, vx / v, 0, (v * dt) / R);
        rolled += v * dt;
      }
      return true;
    }

    // (whether it's near enough to mind's for it to see, as it steps)
    const follow = () => true;

    return { step, draw, resize, follow, settle() {} };
  });

  // ---- Sumi: a little open water, and inks dropped on it ----
  //
  // Suminagashi: ink floats on water, and each new drop spreads out on the surface, pushing
  // what's there out round it in rings. The water's a small grid of stable fluid (Stam's) that
  // carries the inks; a drop's spreading is a flow of its own, out
  // from where it fell. The pointer stirs it and ripples it; otherwise it lies still, as water in
  // a tray does. The inks absorb light as dyes do, so where they mix, they darken toward each
  // other's colours, as inks do.

  setUp('water', thing => {
    const N = 100;
    const S = N + 2;
    // What's measured in cells below was made for a grid of 120 across: each's scaled by this, so
    // it's the same on the water however fine the grid is
    const G = N / 120;
    const cells = S * S;

    // Its outline: how far out it lies at each angle round its middle, in widths of what it's
    // drawn on; round-ish, as water lies, and a little squashed top to bottom
    const edge = a => 0.43 * (1 + 0.045 * Math.sin(3 * a + 1.2) + 0.035 * Math.sin(5 * a + 2.3) + 0.02 * Math.sin(8 * a + 0.4));
    const SQUASH = 0.97;
    let widest = 0;
    for (let k = 0; k < 720; k++) widest = Math.max(widest, edge((k / 720) * TAU));
    // The grid over it, just big enough for it, a couple of cells to spare all round; in widths
    const CELL = (2 * widest) / (N - 4);
    const BOX = 0.5 - (N / 2) * CELL;

    // Only what's water is worked out: each row, from where it starts to where it ends, with a
    // cell to spare past its edge so it's drawn right up to it. Past that, it's walled in.
    const inside = new Float32Array(cells);
    const from = new Int32Array(S).fill(S), to = new Int32Array(S).fill(-1);
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        const x = BOX + (i - 0.5) * CELL - 0.5, y = (BOX + (j - 0.5) * CELL - 0.5) / SQUASH;
        if (Math.hypot(x, y) < edge(Math.atan2(y, x)) + 1.2 * CELL) {
          inside[i + S * j] = 1;
          from[j] = Math.min(from[j], i);
          to[j] = Math.max(to[j], i);
        }
      }
    }
    // How many of each cell's four neighbours are water, for its pressure; and, for each cell
    // just past the water, the cell of water next to it, whose ink it's given so the edge reads
    const shared = new Float32Array(cells);
    const past = [], next2 = [];
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        const k = i + S * j;
        const near = inside[k - 1] + inside[k + 1] + inside[k - S] + inside[k + S];
        shared[k] = 1 / Math.max(1, near);
        if (!inside[k] && near) {
          past.push(k);
          next2.push(inside[k - 1] ? k - 1 : inside[k + 1] ? k + 1 : inside[k - S] ? k - S : k + S);
        }
      }
    }
    const pastCells = Int32Array.from(past), pastFrom = Int32Array.from(next2);
    // Near its edge, ripples are taken up, more the nearer, so each goes out once and is gone
    // rather than coming back off it: over the last few cells, gently enough that the taking up
    // doesn't itself send one back
    const BAND = 10 * G;
    const calm = new Float32Array(cells);
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        const x = BOX + (i - 0.5) * CELL - 0.5, y = (BOX + (j - 0.5) * CELL - 0.5) / SQUASH;
        const short = Math.max(0, 1 - (edge(Math.atan2(y, x)) - Math.hypot(x, y)) / CELL / BAND);
        calm[i + S * j] = 0.986 * (1 - 0.3 * short * short);
      }
    }
    function extend(f) {
      for (let n = 0; n < pastCells.length; n++) f[pastCells[n]] = f[pastFrom[n]];
    }

    let u = new Float32Array(cells), v = new Float32Array(cells), u0 = new Float32Array(cells), v0 = new Float32Array(cells);
    const p = new Float32Array(cells), div = new Float32Array(cells);
    const cu = new Float32Array(cells), cv = new Float32Array(cells);
    // How much each ink takes out of red, green, and blue: now, and last time
    let ink = [new Float32Array(cells), new Float32Array(cells), new Float32Array(cells)];
    let old = [new Float32Array(cells), new Float32Array(cells), new Float32Array(cells)];
    const there = [new Float32Array(cells), new Float32Array(cells), new Float32Array(cells)];
    const back = [new Float32Array(cells), new Float32Array(cells), new Float32Array(cells)];
    const traced = new Int32Array(cells), tracedX = new Float32Array(cells), tracedY = new Float32Array(cells);
    let wave = new Float32Array(cells), was = new Float32Array(cells);
    const INKS = [
      [1.5, 1.05, 0.2],   // indigo
      [0.12, 1.15, 1.5],  // vermilion
      [0.06, 0.3, 1.3],   // ochre
      [1.3, 0.3, 0.45],   // teal
      [0.28, 1.35, 0.55], // magenta
      [1.05, 1.05, 0.95], // sumi
    ];
    const random = seeded(31);
    const drops = [];
    let lastInk = -1;
    let clock = 0;
    let due = 0.3;
    let stir = null;
    let wasAt = null;
    // The inks are carried every other step, twice as far: as sharp as every step, since it's
    // each carrying that blurs them, for half the work. (How long since they last were.)
    let uncarried = 0, carryNext = false;
    // How long since they last thinned: lying still, they're thinned a quarter second at a time,
    // too little each time to be seen
    let unfaded = 0;
    // Whether anything's changed that's seen, since it was last drawn
    let changed = true;
    // Whether the inks' way has anything in it to clear
    let swept = true;
    // Whether the water's flowing, and whether there are ripples on it: when neither, and no
    // drop's spreading, the inks lie exactly where they are
    let flowing = false, rippling = false;
    // Slower than this, in cells a second, the water's stopped; and ripples lower than this are
    // gone. Neither's to be seen by then.
    const STOPPED = 0.2 * G, FLAT = 0.01;

    const tiny = layer(N, N);
    const tinyCtx = tiny.getContext('2d');
    const tinyImage = tinyCtx.createImageData(N, N);
    // (opaque, wherever it's drawn)
    for (let j = 1; j <= N; j++) {
      for (let i = from[j]; i <= to[j]; i++) tinyImage.data[4 * (i - 1 + N * (j - 1)) + 3] = 255;
    }
    let shape = null, overlay = null;
    let box = { x: 0, y: 0, size: 0, cell: 1 };

    function resize() {
      const { w } = thing;
      box = { x: BOX * w, y: BOX * w, size: N * CELL * w, cell: CELL * w };
      shape = new Path2D();
      for (let k = 0; k <= 180; k++) {
        const a = (k / 180) * TAU, r = edge(a) * w;
        const px = w / 2 + Math.cos(a) * r, py = w / 2 + Math.sin(a) * r * SQUASH;
        if (k) shape.lineTo(px, py);
        else shape.moveTo(px, py);
      }
      shape.closePath();
      overlay = null;
    }

    // Where the water a cell's at now was a moment ago, and what was there, for both ways it moves
    function advectWater(dt) {
      for (let j = 1; j <= N; j++) {
        for (let i = from[j]; i <= to[j]; i++) {
          const k = i + S * j;
          const x = Math.max(0.5, Math.min(N + 0.5, i - dt * u0[k])), y = Math.max(0.5, Math.min(N + 0.5, j - dt * v0[k]));
          const i0 = x | 0, j0 = y | 0, s = x - i0, t = y - j0, a = i0 + S * j0;
          u[k] = (1 - s) * ((1 - t) * u0[a] + t * u0[a + S]) + s * ((1 - t) * u0[a + 1] + t * u0[a + 1 + S]);
          v[k] = (1 - s) * ((1 - t) * v0[a] + t * v0[a + S]) + s * ((1 - t) * v0[a + 1] + t * v0[a + 1 + S]);
        }
      }
    }

    // Ink's carried more carefully than the water: once there and back, to see how much the trip
    // blurs it, and again with that taken off, but never past what it came from. It keeps the
    // rings sharp a good while longer. All three of its colours go together, so each cell's way
    // is worked out once, not for each.
    function carryInks(dt, fade) {
      const [r0, g0, b0] = old, [r1, g1, b1] = there, [r2, g2, b2] = back;
      for (let j = 1; j <= N; j++) {
        for (let i = from[j]; i <= to[j]; i++) {
          const k = i + S * j;
          const x = Math.max(0.5, Math.min(N + 0.5, i - dt * cu[k])), y = Math.max(0.5, Math.min(N + 0.5, j - dt * cv[k]));
          const i0 = x | 0, j0 = y | 0, s = x - i0, t = y - j0, a = i0 + S * j0;
          traced[k] = a;
          tracedX[k] = s;
          tracedY[k] = t;
          const w00 = (1 - s) * (1 - t), w01 = (1 - s) * t, w10 = s * (1 - t), w11 = s * t;
          r1[k] = w00 * r0[a] + w01 * r0[a + S] + w10 * r0[a + 1] + w11 * r0[a + 1 + S];
          g1[k] = w00 * g0[a] + w01 * g0[a + S] + w10 * g0[a + 1] + w11 * g0[a + 1 + S];
          b1[k] = w00 * b0[a] + w01 * b0[a + S] + w10 * b0[a + 1] + w11 * b0[a + 1 + S];
        }
      }
      extend(r1); extend(g1); extend(b1);
      for (let j = 1; j <= N; j++) {
        for (let i = from[j]; i <= to[j]; i++) {
          const k = i + S * j;
          const x = Math.max(0.5, Math.min(N + 0.5, i + dt * cu[k])), y = Math.max(0.5, Math.min(N + 0.5, j + dt * cv[k]));
          const i0 = x | 0, j0 = y | 0, s = x - i0, t = y - j0, a = i0 + S * j0;
          const w00 = (1 - s) * (1 - t), w01 = (1 - s) * t, w10 = s * (1 - t), w11 = s * t;
          r2[k] = 1.5 * r0[k] - 0.5 * (w00 * r1[a] + w01 * r1[a + S] + w10 * r1[a + 1] + w11 * r1[a + 1 + S]);
          g2[k] = 1.5 * g0[k] - 0.5 * (w00 * g1[a] + w01 * g1[a + S] + w10 * g1[a + 1] + w11 * g1[a + 1 + S]);
          b2[k] = 1.5 * b0[k] - 0.5 * (w00 * b1[a] + w01 * b1[a + S] + w10 * b1[a + 1] + w11 * b1[a + 1 + S]);
        }
      }
      extend(r2); extend(g2); extend(b2);
      const [r, g, b] = ink;
      for (let j = 1; j <= N; j++) {
        for (let i = from[j]; i <= to[j]; i++) {
          const k = i + S * j, a = traced[k], s = tracedX[k], t = tracedY[k];
          const w00 = (1 - s) * (1 - t), w01 = (1 - s) * t, w10 = s * (1 - t), w11 = s * t;
          let q = w00 * r2[a] + w01 * r2[a + S] + w10 * r2[a + 1] + w11 * r2[a + 1 + S];
          r[k] = fade * Math.max(Math.min(r0[a], r0[a + 1], r0[a + S], r0[a + S + 1]), Math.min(Math.max(r0[a], r0[a + 1], r0[a + S], r0[a + S + 1]), q));
          q = w00 * g2[a] + w01 * g2[a + S] + w10 * g2[a + 1] + w11 * g2[a + 1 + S];
          g[k] = fade * Math.max(Math.min(g0[a], g0[a + 1], g0[a + S], g0[a + S + 1]), Math.min(Math.max(g0[a], g0[a + 1], g0[a + S], g0[a + S + 1]), q));
          q = w00 * b2[a] + w01 * b2[a + S] + w10 * b2[a + 1] + w11 * b2[a + 1 + S];
          b[k] = fade * Math.max(Math.min(b0[a], b0[a + 1], b0[a + S], b0[a + S + 1]), Math.min(Math.max(b0[a], b0[a + 1], b0[a + S], b0[a + S + 1]), q));
        }
      }
      extend(r); extend(g); extend(b);
    }

    // So the water's never squeezed nor stretched: once a frame, starting from where the last
    // left off, which is near enough right already that a few rounds settle it. Past its edge
    // is wall: nothing flows through it.
    function project() {
      for (let j = 1; j <= N; j++) {
        for (let i = from[j]; i <= to[j]; i++) {
          const k = i + S * j;
          div[k] = -0.5 * (u[k + 1] - u[k - 1] + v[k + S] - v[k - S]);
        }
      }
      for (let n = 0; n < 6; n++) {
        for (let j = 1; j <= N; j++) {
          for (let i = from[j]; i <= to[j]; i++) {
            const k = i + S * j;
            // (past the water, p's always nothing, so it needn't be asked whether it's water)
            p[k] = (div[k] + p[k - 1] + p[k + 1] + p[k - S] + p[k + S]) * shared[k];
          }
        }
      }
      for (let j = 1; j <= N; j++) {
        for (let i = from[j]; i <= to[j]; i++) {
          const k = i + S * j, here = p[k];
          const e = inside[k + 1] ? p[k + 1] : here, west = inside[k - 1] ? p[k - 1] : here;
          const south = inside[k + S] ? p[k + S] : here, north = inside[k - S] ? p[k - S] : here;
          u[k] -= 0.5 * (e - west);
          v[k] -= 0.5 * (south - north);
        }
      }
    }

    function letFall() {
      let pick;
      do pick = Math.floor(random() * INKS.length); while (pick === lastInk);
      lastInk = pick;
      const a = random() * TAU, r = Math.sqrt(random()) * N * 0.22;
      const size = (5 + random() * 8) * G;
      drops.push({
        x: N / 2 + 0.5 + Math.cos(a) * r, y: N / 2 + 0.5 + Math.sin(a) * r, age: 0,
        // How much surface it'll spread over, in cells
        flow: (Math.PI * size * size) / 0.5, ink: INKS[pick], strength: 0.9 + random() * 0.7,
      });
      // It lands with a ripple
      ripple(drops[drops.length - 1].x, drops[drops.length - 1].y, 1.6, 2.2);
    }

    function ripple(x, y, by, spread) {
      rippling = true;
      changed = true;
      const reach = 5 * G;
      spread *= G * G;
      for (let j = Math.max(1, Math.floor(y - reach)); j <= Math.min(N, y + reach); j++) {
        for (let i = Math.max(1, Math.floor(x - reach)); i <= Math.min(N, x + reach); i++) {
          wave[i + S * j] -= inside[i + S * j] * by * Math.exp(-((i - x) ** 2 + (j - y) ** 2) / spread);
        }
      }
    }

    // The way the surface slopes at a cell, flat where it meets the edge
    function slopeX(f, k) {
      return (inside[k + 1] ? f[k + 1] : f[k]) - (inside[k - 1] ? f[k - 1] : f[k]);
    }
    function slopeY(f, k) {
      return (inside[k + S] ? f[k + S] : f[k]) - (inside[k - S] ? f[k - S] : f[k]);
    }

    function step(dt) {
      clock += dt;
      if (clock >= due) {
        letFall();
        // The first few close together, so it isn't long bare
        due = clock + (clock < 3 ? 0.9 : 2.5 + random() * 4.5);
      }
      const keep = 1 - 0.5 * dt;
      let fastest = 0;
      if (flowing) {
        for (let j = 1; j <= N; j++) {
          for (let i = from[j]; i <= to[j]; i++) {
            const k = i + S * j;
            u[k] *= keep;
            v[k] *= keep;
            fastest = Math.max(fastest, Math.abs(u[k]), Math.abs(v[k]));
          }
        }
      }
      if (stir) {
        const { x, y, dx, dy } = stir, reach = 7 * G, wide = 10 * G * G;
        for (let j = Math.max(1, Math.floor(y - reach)); j <= Math.min(N, y + reach); j++) {
          for (let i = Math.max(1, Math.floor(x - reach)); i <= Math.min(N, x + reach); i++) {
            const k = i + S * j, f = inside[k] * Math.exp(-((i - x) ** 2 + (j - y) ** 2) / wide);
            u[k] += dx * f;
            v[k] += dy * f;
          }
        }
        stir = null;
        fastest = Infinity;
      }
      // Slowed to nothing, it's stopped, all of it
      if (fastest < STOPPED) {
        if (flowing) {
          for (const f of [u, v, u0, v0, p]) f.fill(0);
          flowing = false;
        }
      } else {
        flowing = true;
        [u0, u] = [u, u0];
        [v0, v] = [v, v0];
        advectWater(dt);
        project();
      }

      // The inks go where the water goes; out from where each drop is spreading; and a little
      // on with each ripple that passes, the way it's going, more the taller it is, so the
      // rings are left crinkled where one's been through
      // (and how fast the ripples alone move them: in a ripple's last low tail, by nothing)
      let nudging = 0;
      if (rippling) {
        for (let j = 1; j <= N; j++) {
          for (let i = from[j]; i <= to[j]; i++) {
            const k = i + S * j, rising = 20 * G * G * (wave[k] - was[k]);
            const nx = rising * slopeX(wave, k), ny = rising * slopeY(wave, k);
            cu[k] = u[k] - nx;
            cv[k] = v[k] - ny;
            nudging = Math.max(nudging, Math.abs(nx), Math.abs(ny));
          }
        }
        swept = true;
      } else if (flowing) {
        cu.set(u);
        cv.set(v);
        swept = true;
      } else if (swept) {
        cu.fill(0);
        cv.fill(0);
        swept = false;
      }
      let spreading = false;
      for (const drop of drops) {
        drop.age += dt;
        const q = drop.flow * Math.exp(-drop.age / 0.5);
        if (q < G * G) continue;
        spreading = true;
        swept = true;
        const spread = drop.flow * 0.5 * (1 - Math.exp(-drop.age / 0.5));
        const core = Math.sqrt(spread / Math.PI) * 0.8;
        const out = q / TAU;
        for (let j = 1; j <= N; j++) {
          for (let i = from[j]; i <= to[j]; i++) {
            const k = i + S * j, dx = i - drop.x, dy = j - drop.y;
            const f = out / Math.max(1.44 * G * G, dx * dx + dy * dy);
            cu[k] += dx * f;
            cv[k] += dy * f;
          }
        }
        // Where it's welling up, it's all the new ink
        const [r, g, b] = ink, [ir, ig, ib] = drop.ink, st = drop.strength;
        for (let j = Math.max(1, Math.floor(drop.y - core)); j <= Math.min(N, Math.ceil(drop.y + core)); j++) {
          for (let i = Math.max(1, Math.floor(drop.x - core)); i <= Math.min(N, Math.ceil(drop.x + core)); i++) {
            const k = i + S * j, d2 = (i - drop.x) ** 2 + (j - drop.y) ** 2;
            if (d2 >= core * core || !inside[k]) continue;
            const f = Math.min(1, ((core - Math.max(1.2 * G, Math.sqrt(d2))) * 0.8) / G);
            r[k] += (ir * st - r[k]) * f;
            g[k] += (ig * st - g[k]) * f;
            b[k] += (ib * st - b[k]) * f;
          }
        }
      }
      while (drops.length && drops[0].age > 4) drops.shift();
      // Slowly the inks sink and thin, so the water never silts up with them
      if (spreading) changed = true;
      uncarried += dt;
      unfaded += dt;
      carryNext = !carryNext;
      if (carryNext) {
        if (flowing || spreading || nudging > 0.02 * G) {
          [old, ink] = [ink, old];
          carryInks(uncarried, Math.exp(-unfaded / 50));
          unfaded = 0;
          changed = true;
        } else if (unfaded >= 0.25) {
          // Nothing's moving it: it only thins
          const fade = Math.exp(-unfaded / 50);
          for (const f of ink) {
            for (let j = 1; j <= N; j++) {
              for (let k = from[j] + S * j, end = to[j] + S * j; k <= end; k++) f[k] *= fade;
            }
            extend(f);
          }
          unfaded = 0;
          changed = true;
        }
        uncarried = 0;
      }

      // Ripples, each going out once, taken up at its edge; and when they're too low to be seen,
      // they're gone
      if (rippling) {
        changed = true;
        let highest = 0;
        for (let j = 1; j <= N; j++) {
          for (let i = from[j]; i <= to[j]; i++) {
            const k = i + S * j, h = wave[k];
            const around = inside[k - 1] * (wave[k - 1] - h) + inside[k + 1] * (wave[k + 1] - h) + inside[k - S] * (wave[k - S] - h) + inside[k + S] * (wave[k + S] - h);
            was[k] = (2 * h - was[k] + 0.32 * G * G * around) * calm[k];
            highest = Math.max(highest, Math.abs(was[k]), Math.abs(h));
          }
        }
        [was, wave] = [wave, was];
        if (highest < FLAT) {
          wave.fill(0);
          was.fill(0);
          rippling = false;
        }
      }
      return true;
    }

    // The paper it's on, wetted: a shade darker
    let paper = null;
    function wetPaper() {
      const probe = document.createElement('span');
      probe.style.color = getComputedStyle(root).getPropertyValue('--background-color') || '#f4f1ea';
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
      probe.remove();
      return rgb.map(c => c * 0.94);
    }

    // What doesn't change as it moves: the sky in it, faintly, brightest toward the window; and
    // its edge, a meniscus lit on the window's side, and the wet line round it
    function paintOverlay(dark) {
      const { w } = thing;
      // (its lines no thinner on the page than they'd be at the page's own pixels)
      const px = w / thing.box.offsetWidth;
      overlay = layer(w, w);
      const c = overlay.getContext('2d');
      c.save();
      c.clip(shape);
      const sky = c.createLinearGradient(0, 0, w, w);
      sky.addColorStop(0, dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.18)');
      sky.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, w);
      c.restore();
      c.lineWidth = Math.max(px, w * 0.004);
      c.strokeStyle = dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(80, 74, 64, 0.16)';
      c.stroke(shape);
      const rim = c.createLinearGradient(0, 0, w, w);
      rim.addColorStop(0, dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.95)');
      rim.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
      rim.addColorStop(1, 'rgba(255, 255, 255, 0)');
      c.save();
      c.clip(shape);
      c.lineWidth = Math.max(1.5 * px, w * 0.008);
      c.strokeStyle = rim;
      c.stroke(shape);
      c.restore();
    }

    function draw(force) {
      const { ctx, w } = thing;
      if (!shape || (!force && !changed)) return;
      changed = false;
      const dark = night();
      if (force || !paper) paper = wetPaper();
      if (force || !overlay) paintOverlay(dark);
      const [ar, ag, ab] = ink;
      const data = tinyImage.data;
      const base = dark ? [236, 234, 228] : paper;
      for (let j = 1; j <= N; j++) {
        for (let i = from[j]; i <= to[j]; i++) {
          const k = i + S * j;
          // Seen through the ripples, bent; when there are any
          let gx = 0, gy = 0, sk = k;
          if (rippling) {
            // (how steep it is, as the grid of 120 would see it)
            gx = slopeX(wave, k) * G;
            gy = slopeY(wave, k) * G;
            sk = Math.max(1, Math.min(N, Math.round(i + gx * 5 * G))) + S * Math.max(1, Math.min(N, Math.round(j + gy * 5 * G)));
            if (!inside[sk]) sk = k;
          }
          const er = Math.exp(-ar[sk]), eg = Math.exp(-ag[sk]), eb = Math.exp(-ab[sk]);
          let r = base[0] * er, g = base[1] * eg, b = base[2] * eb;
          if (dark) {
            // At night, the water's dark, and the inks are the colours they'd be in light
            const cover = 1 - Math.exp(-(ar[sk] + ag[sk] + ab[sk]) * 0.9);
            r = paper[0] * (1 - cover) + r * 0.7 * cover;
            g = paper[1] * (1 - cover) + g * 0.7 * cover;
            b = paper[2] * (1 - cover) + b * 0.7 * cover;
          }
          const o = 4 * (i - 1 + N * (j - 1));
          if (rippling) {
            // Its surface, catching the window where it tilts toward it
            const tilt = -(gx * 0.55 + gy * 0.65);
            const shine = Math.max(0, tilt) ** 2 * (dark ? 200 : 300);
            const lit = 1 + tilt * 0.6;
            r = r * lit + shine;
            g = g * lit + shine;
            b = b * lit + shine;
          }
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
        }
      }
      tinyCtx.putImageData(tinyImage, 0, 0);
      ctx.clearRect(0, 0, w, w);
      ctx.save();
      ctx.clip(shape);
      ctx.drawImage(tiny, box.x, box.y, box.size, box.size);
      ctx.restore();
      ctx.drawImage(overlay, 0, 0);
    }

    function follow(pt) {
      const at = onCanvas(thing, pt);
      const gx = (at.x - box.x) / box.cell + 0.5;
      const gy = (at.y - box.y) / box.cell + 0.5;
      if (gx < 1 || gy < 1 || gx > N || gy > N || !thing.ctx.isPointInPath(shape, at.x, at.y)) {
        wasAt = null;
        return false;
      }
      if (wasAt && pt.time > wasAt.time) {
        const k = Math.min(1, 16 / (pt.time - wasAt.time));
        stir = { x: gx, y: gy, dx: (gx - wasAt.x) * 5 * k, dy: (gy - wasAt.y) * 5 * k };
        ripple(gx, gy, Math.min(0.25, (Math.hypot(gx - wasAt.x, gy - wasAt.y) * 0.05) / G), 3);
      }
      wasAt = { x: gx, y: gy, time: pt.time };
      return true;
    }

    // Without motion, how it'd look after a while: worked out once, a little at a time between
    // other things so the page isn't held up, and shown when it's done
    let settling = false;
    function settle() {
      if (settling || clock > 0) return;
      settling = true;
      let left = 22 * 30;
      const work = () => {
        const until = performance.now() + 8;
        while (left > 0 && performance.now() < until) {
          step(1 / 30);
          left--;
        }
        if (left > 0) {
          setTimeout(work, 0);
          return;
        }
        wave.fill(0);
        was.fill(0);
        if (thing.w) thing.draw(true);
      };
      work();
    }

    // (It's only drawn when it's changed, so if the browser lets go of what's on its canvas, it's
    // drawn again)
    thing.canvas.addEventListener('contextrestored', () => draw(true));

    // Soft as it is, it's drawn no finer than the page's own pixels
    return { step, draw, resize, follow, settle, density: 1 };
  });

  // ---- Links: a chain of paper clips ----
  //
  // Hooked one into the next, lying on the page. Pushed about by the pointer, each drags the next
  // and the chain swings round and settles. Drawn as wire, round, steel, lit from the window.

  setUp('links', thing => {
    // A clip, in widths of it: its wire's way round, as straight legs and half turns
    const WIRE = 0.072;
    // x, and from y to y
    const LEGS = Float64Array.of(0, 0.5, 3.3, 1, 0.5, 3.585, 0.17, 0.9, 3.585, 0.72, 0.9, 2.6);
    // middle x, middle y, radius, and which half: below its middle (-1) or above (1)
    const TURNS = Float64Array.of(0.5, 0.5, 0.5, -1, 0.585, 3.585, 0.415, 1, 0.445, 0.9, 0.275, -1);
    // Where it's hooked to the one before it, and to the one after: its bottom turn round the top
    // turn of the one before
    const LOW = 0.15, HIGH = 3.85, SPAN = HIGH - LOW;
    const COUNT = 3;

    // How far a point (in a clip's widths) is from its wire, and which way, out from the wire
    let gx = 0, gy = 0;
    function wire(X, Y) {
      let best = Infinity;
      for (let k = 0; k < LEGS.length; k += 3) {
        const y = Y < LEGS[k + 1] ? LEGS[k + 1] : Y > LEGS[k + 2] ? LEGS[k + 2] : Y;
        const dx = X - LEGS[k], dy = Y - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) {
          best = d;
          gx = dx;
          gy = dy;
        }
      }
      for (let k = 0; k < TURNS.length; k += 4) {
        const dx = X - TURNS[k], dy = Y - TURNS[k + 1];
        if (dy * TURNS[k + 3] < 0) continue;
        const l = Math.sqrt(dx * dx + dy * dy) || 1e-9, d = Math.abs(l - TURNS[k + 2]);
        if (d < best) {
          best = d;
          const out = l > TURNS[k + 2] ? 1 : -1;
          gx = (dx / l) * out;
          gy = (dy / l) * out;
        }
      }
      const g = Math.sqrt(gx * gx + gy * gy) || 1;
      gx /= g;
      gy /= g;
      return best;
    }

    // The chain: where each hook is, and how fast it's going; in the canvas's pixels
    const x = new Float64Array(COUNT + 1), y = new Float64Array(COUNT + 1);
    const vx = new Float64Array(COUNT + 1), vy = new Float64Array(COUNT + 1);
    const nx0 = new Float64Array(COUNT + 1), ny0 = new Float64Array(COUNT + 1);
    let unit = 0, home = { x: 0, y: 0 }, laid = false;
    // Lying in a loose wave, at first
    const BENDS = [0.42, -0.5];

    let image = null, buffers = null, was = null, moved = true;
    function resize() {
      const { w, h } = thing;
      const old = unit, oldHome = home;
      // Long enough to lie across most of its place
      unit = (0.8 * w) / (SPAN * COUNT + 0.4);
      home = { x: w / 2, y: h / 2 };
      if (!laid) {
        let a = -0.1 - (BENDS[0] + BENDS[1]) / 3;
        x[0] = 0;
        y[0] = 0;
        for (let i = 0; i < COUNT; i++) {
          x[i + 1] = x[i] + Math.cos(a) * SPAN;
          y[i + 1] = y[i] + Math.sin(a) * SPAN;
          a += BENDS[i] || 0;
        }
        let mx = 0, my = 0;
        for (let i = 0; i <= COUNT; i++) {
          mx += x[i] / (COUNT + 1);
          my += y[i] / (COUNT + 1);
        }
        for (let i = 0; i <= COUNT; i++) {
          x[i] = home.x + (x[i] - mx) * unit;
          y[i] = home.y + (y[i] - my) * unit;
        }
        laid = true;
      } else {
        for (let i = 0; i <= COUNT; i++) {
          x[i] = home.x + ((x[i] - oldHome.x) * unit) / old;
          y[i] = home.y + ((y[i] - oldHome.y) * unit) / old;
        }
      }
      image = thing.ctx.createImageData(w, h);
      const n = w * h;
      // What's seen at each pixel: the nearer clip's wire, and what's under it; and how much wire
      // there is there, for the shadow
      buffers = {
        top: new Int8Array(n).fill(-1), under: new Int8Array(n).fill(-1),
        topCover: new Float32Array(n), underCover: new Float32Array(n),
        topNormal: new Float32Array(3 * n), underNormal: new Float32Array(3 * n),
        mask: new Float32Array(n),
      };
      was = null;
      moved = true;
    }

    // Which of two clips lies on the other, here: where two are hooked, each lies over the other
    // on one side of the hook and under it on the other; anywhere else, the later one's on top
    function over(a, b, px, py) {
      if (Math.abs(a - b) !== 1) return a > b;
      const i = Math.min(a, b), j = i + 1;
      const dx = x[j] - x[i], dy = y[j] - y[i];
      const side = dx * (py - y[j]) - dy * (px - x[j]) > 0;
      return side ? a === i : a === j;
    }

    function draw(force) {
      if (!image || (!force && !moved)) return;
      moved = false;
      const { ctx, w, h } = thing;
      const data = image.data;
      const { top, under, topCover, underCover, topNormal, underNormal, mask } = buffers;
      const dark = night();
      // What polished wire shows, seen from above: the room over it along its middle, the paper
      // round it down its sides
      const room = dark ? [62, 64, 68] : [104, 107, 112];
      const paper = dark ? [118, 118, 120] : [226, 223, 214];
      const shadowAlpha = dark ? 0.55 : 0.32;
      const r = WIRE * unit;
      // Where its shadow falls, away from the window, from wire lying on the page
      const sx = Math.round((-LIGHT[0] / LIGHT[2]) * r * 1.6), sy = Math.round((-LIGHT[1] / LIGHT[2]) * r * 1.6);

      // Where the clips are, and where they were last time
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      const frames = [];
      for (let i = 0; i < COUNT; i++) {
        const dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], l = Math.hypot(dx, dy) || 1;
        // Along it, from the hook below to the hook above, and across it
        const ex = -dy / l, ey = dx / l, fx = dx / l, fy = dy / l;
        let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
        for (const [X, Y] of [[-0.2, -0.2], [1.2, -0.2], [-0.2, 4.2], [1.2, 4.2]]) {
          const px = x[i] + ((X - 0.5) * ex + (Y - LOW) * fx) * unit, py = y[i] + ((X - 0.5) * ey + (Y - LOW) * fy) * unit;
          bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px);
          by0 = Math.min(by0, py); by1 = Math.max(by1, py);
        }
        const box = [Math.max(0, Math.floor(bx0)), Math.max(0, Math.floor(by0)), Math.min(w, Math.ceil(bx1)), Math.min(h, Math.ceil(by1))];
        frames.push({ ex, ey, fx, fy, box });
        x0 = Math.min(x0, box[0]); y0 = Math.min(y0, box[1]);
        x1 = Math.max(x1, box[2]); y1 = Math.max(y1, box[3]);
      }
      // (and its shadow, a little way off)
      x1 = Math.min(w, x1 + Math.abs(sx) + 2); y1 = Math.min(h, y1 + Math.abs(sy) + 2);
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
      if (was) {
        for (let py = was[1]; py < was[3]; py++) data.fill(0, 4 * (was[0] + w * py), 4 * (was[2] + w * py));
      }
      const dirty = was ? [Math.min(x0, was[0]), Math.min(y0, was[1]), Math.max(x1, was[2]), Math.max(y1, was[3])] : [0, 0, w, h];
      was = [x0, y0, x1, y1];

      // Each clip's wire, where it is
      for (let i = 0; i < COUNT; i++) {
        const { ex, ey, fx, fy, box } = frames[i];
        for (let py = box[1]; py < box[3]; py++) {
          for (let px = box[0]; px < box[2]; px++) {
            const qx = px + 0.5 - x[i], qy = py + 0.5 - y[i];
            const X = (qx * ex + qy * ey) / unit + 0.5, Y = (qx * fx + qy * fy) / unit + LOW;
            if (X < -0.1 || X > 1.1 || Y < -0.1 || Y > 4.1) continue;
            const d = wire(X, Y);
            const cover = Math.min(1, (WIRE - d) * unit + 0.5);
            if (cover <= 0) continue;
            const k = px + w * py;
            if (cover > mask[k]) mask[k] = cover;
            // Round: square to the page along its middle, and turned out to its sides
            const t = Math.min(1, d / WIRE);
            const nx = (gx * ex + gy * fx) * t, ny = (gx * ey + gy * fy) * t, nz = Math.sqrt(1 - t * t);
            if (top[k] < 0 || over(i, top[k], px + 0.5, py + 0.5)) {
              under[k] = top[k];
              underCover[k] = topCover[k];
              underNormal[3 * k] = topNormal[3 * k];
              underNormal[3 * k + 1] = topNormal[3 * k + 1];
              underNormal[3 * k + 2] = topNormal[3 * k + 2];
              top[k] = i;
              topCover[k] = cover;
              topNormal[3 * k] = nx;
              topNormal[3 * k + 1] = ny;
              topNormal[3 * k + 2] = nz;
            } else if (under[k] < 0 || over(i, under[k], px + 0.5, py + 0.5)) {
              under[k] = i;
              underCover[k] = cover;
              underNormal[3 * k] = nx;
              underNormal[3 * k + 1] = ny;
              underNormal[3 * k + 2] = nz;
            }
          }
        }
      }

      // Steel's all it reflects: the room, the paper, and where it's turned to the window, the
      // window. (Its glint's kept broad enough not to fall between pixels on so thin a wire.)
      const shade = (n, k, out) => {
        const ax = n[k], ay = n[k + 1], az = n[k + 2];
        const facing = Math.max(0, ax * HALF[0] + ay * HALF[1] + az * HALF[2]);
        const f2 = facing * facing, f4 = f2 * f2, f8 = f4 * f4, f16 = f8 * f8;
        const glint = f16 * 0.75 + f4 * 0.12;
        const toward = 0.85 + 0.3 * (ax * LIGHT[0] + ay * LIGHT[1]);
        const side = Math.min(1, (1 - az) * 1.3) * toward;
        out[0] = room[0] * (1 - side) + paper[0] * side + 255 * glint;
        out[1] = room[1] * (1 - side) + paper[1] * side + 255 * glint;
        out[2] = room[2] * (1 - side) + paper[2] * side + 250 * glint;
      };
      const a = [0, 0, 0], b = [0, 0, 0];
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const k = px + w * py;
          // Its shadow: the wire's, a little way off, softened
          let sh = 0;
          const cx = px - sx, cy = py - sy;
          if (cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1) {
            const c = cx + w * cy;
            sh = (mask[c] * 4 + mask[c - 1] + mask[c + 1] + mask[c - w] + mask[c + w]) / 8;
          }
          sh *= shadowAlpha;
          const tc = top[k] >= 0 ? topCover[k] : 0, uc = under[k] >= 0 ? underCover[k] : 0;
          if (sh <= 0.003 && tc <= 0) continue;
          // Laid down from the paper up: shadow, the wire under, the wire over
          let R = 0, G = 0, B = 0, A = sh;
          if (uc > 0) {
            shade(underNormal, 3 * k, b);
            R = R * (1 - uc) + b[0] * uc;
            G = G * (1 - uc) + b[1] * uc;
            B = B * (1 - uc) + b[2] * uc;
            A = A + (1 - A) * uc;
          }
          if (tc > 0) {
            shade(topNormal, 3 * k, a);
            R = R * (1 - tc) + a[0] * tc;
            G = G * (1 - tc) + a[1] * tc;
            B = B * (1 - tc) + a[2] * tc;
            A = A + (1 - A) * tc;
          }
          const o = 4 * k;
          data[o] = R / A;
          data[o + 1] = G / A;
          data[o + 2] = B / A;
          data[o + 3] = 255 * A;
        }
      }
      // Ready for next time
      for (let py = y0; py < y1; py++) {
        const k0 = x0 + w * py, k1 = x1 + w * py;
        top.fill(-1, k0, k1);
        under.fill(-1, k0, k1);
        mask.fill(0, k0, k1);
      }
      ctx.putImageData(image, 0, 0, dirty[0], dirty[1], dirty[2] - dirty[0], dirty[3] - dirty[1]);
    }

    function step(dt) {
      const { w, h } = thing;
      // Pushed where the pointer comes at it: whichever clip it's near, at either end, as much as
      // it's nearer that end
      if (pointer && fine.matches) {
        const p = onCanvas(thing, pointer);
        const reach = unit * 2.4;
        for (let i = 0; i < COUNT; i++) {
          const dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], l2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((p.x - x[i]) * dx + (p.y - y[i]) * dy) / l2));
          const cx = x[i] + dx * t - p.x, cy = y[i] + dy * t - p.y, d = Math.hypot(cx, cy) || 1;
          if (d >= reach) continue;
          const push = (1 - d / reach) ** 1.5 * unit * 140 * dt;
          vx[i] += (cx / d) * push * (1 - t);
          vy[i] += (cy / d) * push * (1 - t);
          vx[i + 1] += (cx / d) * push * t;
          vy[i + 1] += (cy / d) * push * t;
        }
      }
      // It lies in the slightest dip, as the apple does, and slides on the paper, and stops
      let mx = 0, my = 0;
      for (let i = 0; i <= COUNT; i++) {
        mx += x[i] / (COUNT + 1);
        my += y[i] / (COUNT + 1);
      }
      const drag = Math.exp(-3 * dt);
      for (let i = 0; i <= COUNT; i++) {
        vx[i] = (vx[i] + (home.x - mx) * 0.9 * dt) * drag;
        vy[i] = (vy[i] + (home.y - my) * 0.9 * dt) * drag;
        nx0[i] = x[i] + vx[i] * dt;
        ny0[i] = y[i] + vy[i] * dt;
      }
      // Hooked: each the same length; bent no further than a hook lets it; and kept on its place
      const span = SPAN * unit, closest = span * 1.05, edge = unit * 0.9;
      for (let n = 0; n < 8; n++) {
        for (let i = 0; i < COUNT; i++) {
          const dx = nx0[i + 1] - nx0[i], dy = ny0[i + 1] - ny0[i], l = Math.hypot(dx, dy) || 1;
          const f = ((l - span) / l) * 0.5;
          nx0[i] += dx * f; ny0[i] += dy * f;
          nx0[i + 1] -= dx * f; ny0[i + 1] -= dy * f;
        }
        for (let i = 1; i < COUNT; i++) {
          const dx = nx0[i + 1] - nx0[i - 1], dy = ny0[i + 1] - ny0[i - 1], l = Math.hypot(dx, dy) || 1;
          if (l >= closest) continue;
          const f = ((l - closest) / l) * 0.5;
          nx0[i - 1] += dx * f; ny0[i - 1] += dy * f;
          nx0[i + 1] -= dx * f; ny0[i + 1] -= dy * f;
        }
        for (let i = 0; i <= COUNT; i++) {
          nx0[i] = Math.max(edge, Math.min(w - edge, nx0[i]));
          ny0[i] = Math.max(edge, Math.min(h - edge, ny0[i]));
        }
      }
      let fastest = 0;
      for (let i = 0; i <= COUNT; i++) {
        vx[i] = (nx0[i] - x[i]) / dt;
        vy[i] = (ny0[i] - y[i]) / dt;
        fastest = Math.max(fastest, Math.hypot(vx[i], vy[i]));
        x[i] = nx0[i];
        y[i] = ny0[i];
      }
      // Barely moving, and nearly back, it stops where it is
      const awake = fastest > unit * 0.2 || Math.hypot(home.x - mx, home.y - my) > unit * 0.6;
      if (!awake) {
        vx.fill(0);
        vy.fill(0);
        return false;
      }
      if (fastest * dt > 0.05) moved = true;
      return true;
    }

    // (whether it's near enough to mind's for it to see, as it steps)
    const follow = () => true;

    return { step, draw, resize, follow, settle() {} };
  });

  // ---- Bhagavad Gītā: the wheel of a chariot, in stone ----
  //
  // A photograph of it, turned. Where the pointer sweeps across it, it's dragged round the way it
  // went, the more the further out; heavy, so it's slow to start and slow to stop. Kept slower
  // than its spokes can be seen to turn at, without seeming to turn back.

  setUp('gita', thing => {
    const wheel = thing.el.querySelector('.wheel'), shadow = thing.el.querySelector('.shadow');
    let angle = 0, spin = 0, shown = null, from = null;
    const FASTEST = 4;

    function step(dt) {
      const { w, h } = thing;
      const R = Math.min(w, h) / 2;
      let held = false;
      if (pointer && fine.matches) {
        const p = onCanvas(thing, pointer);
        const rx = p.x - w / 2, ry = p.y - h / 2, r = Math.hypot(rx, ry);
        if (r < R * 0.95) {
          held = true;
          if (from) {
            const dx = p.x - from.x, dy = p.y - from.y;
            if (dx || dy) {
              // How fast the pointer's going round it, there; caught as much as it's far out
              const round = (rx * dy - ry * dx) / Math.max(r, R * 0.3) ** 2 / dt;
              spin += (round - spin) * Math.min(1, dt * 2.5) * (r / R);
            }
          }
          from = p;
        }
      }
      if (!held) from = null;
      spin = Math.max(-FASTEST, Math.min(FASTEST, spin)) * Math.exp(-1.1 * dt);
      angle += spin * dt;
      // Turning hardly at all, it's stopped
      if (Math.abs(spin) < 0.03) {
        spin = 0;
        return false;
      }
      return true;
    }

    function draw() {
      if (angle === shown) return;
      shown = angle;
      wheel.style.rotate = shadow.style.rotate = `${angle}rad`;
    }

    // Only near it; and when it's left, it's left
    function follow(p) {
      const box = thing.box.getBoundingClientRect();
      const near = p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom;
      if (!near) from = null;
      return near;
    }

    return { step, draw, resize() {}, follow, settle() { spin = 0; } };
  });

  // Night and day draw them differently
  new MutationObserver(() => {
    for (const thing of things) if (thing.w) thing.draw(true);
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  still.addEventListener('change', () => {
    for (const thing of things) {
      if (!thing.w) continue;
      if (still.matches) thing.settle();
      thing.draw(true);
      wake(thing);
    }
  });
})();
