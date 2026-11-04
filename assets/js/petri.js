(function () {
  const obj = document.getElementById('playground');
  const canvas = document.querySelector('.fizz');
  const prints = document.querySelector('.fizz-prints');
  if (!obj || !canvas || !prints) return;
  const dish = obj.querySelector('.item');
  const table = obj.closest('.table');
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches;

  // Units of a dish 216 across, centred in a square VIEW.
  const VIEW = 780, MID = VIEW / 2, WALL = 98, BODY = 50;
  const RIM = 108, TAKEOFF = 13, CLEAR = 26;
  const MAX_STRANDS = 14;
  const P = { reach: 200, awareness: 290, maxStrands: 7 };
  const LIMIT = VIEW / 2 - 52;

  const { clamp, ease, rand, turn, bell, layer, rgb, shine, DARK, SOFT, NP, SUB, LIT } = Fizz;
  const middle = (r, box) => [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];

  let scale = 1, dpr = 1, frames = 0;
  const cur = { x: -1e4, y: -1e4, present: false };
  let lastSnap = -1, lastSpawn = -1, lastMicro = -1, nextProbe = 2.2, lastFeel = 6;
  const fizz = Fizz({
    body: BODY, most: MAX_STRANDS, snap: { stretch: 1.75, len: 285 },
    time: still ? 40 : rand(0, 100), flow: rand(0, 50), probeAt: Math.random() * 6.28,
    blob: { x: MID, y: MID, tx: MID, ty: MID, next: 3, grow: still ? 1 : 0.2 },
    area: () => [VIEW, VIEW], bound: glass, parted, stepBit: stepDrop, glass: litGlass,
  });
  const { blob, strands, drops, glow, edge, at, flash, ripple } = fizz;
  fizz.focus = cur;
  fizz.mount(canvas);

  const phone = document.getElementById('phone');
  const WAIT = 1.4, SWIRL = 1.35, LAPS = 2, CREEP = 3.2;
  const den = { state: null, out: false, t: 0, press: 0, lean: 0, quiet: 0, heard: false, bulge: 0, p: 0 };

  function startle() {
    fizz.release(true);
    ripple(rand(0, 6.28), 1.6);
    ripple(rand(0, 6.28), 1.2);
    blob.sizeV -= 2;
    flash(blob.x, blob.y, 1);
    den.state = 'startle'; den.t = 0;
  }
  function plot() {
    const box = table.getBoundingClientRect(), r = polaroid.getBoundingClientRect(), d = dish.getBoundingClientRect();
    const w = polaroid.offsetWidth, h = polaroid.offsetHeight, a = (parseFloat(getComputedStyle(polaroid).rotate) || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    const [mx, my] = middle(r, box), [dx, dy] = middle(d, box);
    const world = (u, v) => [mx + u * co - v * si, my + u * si + v * co], hw = w / 2, hh = h / 2;
    const lx = (dx - mx) * co + (dy - my) * si, ly = -(dx - mx) * si + (dy - my) * co, sideways = Math.abs(lx) / hw > Math.abs(ly) / hh;
    const eu = sideways ? Math.sign(lx) * hw : clamp(lx, -hw * 0.55, hw * 0.55), ev = sideways ? clamp(ly, -hh * 0.55, hh * 0.55) : Math.sign(ly) * hh;
    const nu = sideways ? Math.sign(lx) : 0, nv = sideways ? 0 : Math.sign(ly), R = BODY * scale * (glow.night ? 1.08 : 0.94);
    const nx = nu * co - nv * si, ny = nu * si + nv * co, [ex, ey] = world(eu, ev);
    Object.assign(den, { R, dx, dy, ex, ey, nx, ny, quad: [world(-hw, -hh), world(hw, -hh), world(hw, hh), world(-hw, hh)],
      hx: ex - nx * R * 0.86, hy: ey - ny * R * 0.86, px: ex - nx * R * 0.3, py: ey - ny * R * 0.3 });
  }
  function sizeDen() {
    const box = table.getBoundingClientRect(), s = Math.min(dpr, 1.5);
    plot();
    const xs = den.quad.map(q => q[0]), ys = den.quad.map(q => q[1]), m = den.R * 1.2;
    const x0 = Math.floor(Math.max(Math.min(...xs) - m, 0)), y0 = Math.floor(Math.max(Math.min(...ys) - m, 0));
    const x1 = Math.ceil(Math.min(Math.max(...xs) + m, box.width)), y1 = Math.ceil(Math.min(Math.max(...ys) + m, box.height));
    Object.assign(den.canvas.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
    const cw = Math.max(Math.round((x1 - x0) * s), 1), ch = Math.max(Math.round((y1 - y0) * s), 1);
    if (den.canvas.width !== cw) den.canvas.width = cw;
    if (den.canvas.height !== ch) den.canvas.height = ch;
    Object.assign(den, { s: den.canvas.width / (x1 - x0), bx: x0, by: y0, W: x1 - x0, H: y1 - y0 });
  }
  function makeDen() {
    if (!den.canvas) {
      den.canvas = layer();
      den.canvas.className = 'fizz-leap';
      den.canvas.setAttribute('aria-hidden', 'true');
      den.c = den.canvas.getContext('2d');
      table.append(den.canvas);
      den.eyes = fizz.eyes();
    }
    sizeDen();
  }
  function openDen() {
    makeDen();
    den.canvas.style.display = 'block';
  }
  function beginSwirl() {
    openDen();
    const from = canvas.getBoundingClientRect(), box = table.getBoundingClientRect();
    const tx = (den.ex + box.left - from.left) / scale, ty = (den.ey + box.top - from.top) / scale, far = WALL - BODY * blob.size * 0.72;
    const dir = Math.random() < 0.5 ? -1 : 1, D = Math.hypot(tx - MID, ty - MID), leave = Math.atan2(ty - MID, tx - MID) - dir * Math.acos(clamp(far / D, -1, 1));
    const th0 = Math.atan2(blob.y - MID, blob.x - MID), more = (((leave - th0) * dir) % 6.283 + 6.283) % 6.283;
    Object.assign(den, { state: 'swirl', t: 0, th0, dir, far, rho0: Math.hypot(blob.x - MID, blob.y - MID), sweep: 6.283 * LAPS + more });
  }
  function swirl(dt) {
    den.t += dt;
    if (den.state === 'startle') { if (den.t > 0.16) beginSwirl(); return; }
    const u = clamp(den.t / SWIRL, 0, 1), th = den.th0 + den.dir * den.sweep * u * u;
    blob.smear = 1.35 * u * u;
    const hug = WALL - (BODY * blob.size * 0.72) / (1 + blob.smear * 0.75), rho = den.rho0 + (hug - den.rho0) * ease(0, 0.22, u);
    blob.x = blob.tx = MID + Math.cos(th) * rho; blob.y = blob.ty = MID + Math.sin(th) * rho;
    blob.next = fizz.time + 1;
    blob.la = th + (den.dir * Math.PI) / 2;
    den.lean = 0.5 * ease(0.1, 0.8, u);
    den.press = ease(0.08, 0.3, u);
    if (u >= 1) launch();
  }
  function launch() {
    const from = canvas.getBoundingClientRect(), box = table.getBoundingClientRect();
    den.x = from.left - box.left + blob.x * scale; den.y = from.top - box.top + blob.y * scale;
    const speed = ((2 * den.sweep) / SWIRL) * den.far * scale;
    Object.assign(den, { out: true, state: 'dash', t: 0, x0: den.x, y0: den.y, trip: Math.max(Math.hypot(den.ex - den.x, den.ey - den.y) / speed, 0.14), press: 0, lean: 0, tilt: 0 });
    strands.length = 0;
  }
  function home() {
    Object.assign(den, { out: false, state: null, p: 0 });
    blob.smear = 0;
    den.canvas.style.display = 'none';
    canvas.style.translate = canvas.style.scale = '';
    const from = canvas.getBoundingClientRect(), box = table.getBoundingClientRect();
    blob.x = blob.tx = (den.x - from.left + box.left) / scale; blob.y = blob.ty = (den.y - from.top + box.top) / scale;
    blob.next = fizz.time + 2;
    for (let i = 0; i < 5; i++) ripple(i * 1.25, 0.9);
    blob.sizeV += 0.8;
    flash(blob.x, blob.y, 0.5);
    if (hovered) setHovered(true);
  }
  let arrived = false;
  function getReady() {
    if (arrived) return;
    const K = kit, leaps = polaroid && polaroid.offsetWidth && matchMedia('(hover: hover)').matches;
    if (leaps && !(K && (K.gpu || K.pending === false) && K.warm)) return setTimeout(() => whenIdle(getReady), 100);
    fizz.draw();
    warmDen().then(() => requestAnimationFrame(arrive));
  }
  function warmDen() {
    if (!polaroid || !polaroid.offsetWidth || !window.createImageBitmap) return Promise.resolve();
    makeDen();
    Object.assign(den, { bulge: 1, p: 1 });
    paintDen();
    Object.assign(den, { bulge: 0, p: 0 });
    return createImageBitmap(den.canvas).then(b => b.close(), () => {}).then(paintDen);
  }
  function arrive() {
    if (arrived) return;
    arrived = true;
    canvas.style.transition = 'opacity 0.8s';
    canvas.style.opacity = '';
    if (about && about.matches(':hover')) hovered = true;
    if (polaroid && polaroid.offsetWidth) {
      blob.grow = 1;
      strands.length = drops.length = 0;
      makeDen();
      den.canvas.style.opacity = 0;
      openDen();
      getComputedStyle(den.canvas).opacity;
      den.canvas.style.transition = 'opacity 0.8s';
      den.canvas.style.opacity = '';
      Object.assign(den, { out: true, state: 'hidden', t: 0, p: 0, bulge: 0, quiet: 0, x: den.hx, y: den.hy, tilt: Math.atan2(-den.ny, -den.nx), lift: 1 });
    }
    wake();
  }
  function roam(dt) {
    const go = (x, y, f) => { den.x = den.x0 + (x - den.x0) * f; den.y = den.y0 + (y - den.y0) * f; };
    const from = (x, y) => { den.x0 = x; den.y0 = y; den.t = 0; };
    let up = 0, smear = 0;
    den.bulge += ((['hidden', 'peek'].includes(den.state) || (den.state === 'squeeze' && den.t > 0.3) ? 1 : 0) - den.bulge) * (1 - Math.exp(-dt * 7));
    den.p += (((den.state === 'hidden' && hovered) || den.state === 'peek' ? 1 : 0) - den.p) * (1 - Math.exp(-dt * 6));
    if (den.state === 'dash') {
      den.t += dt / den.trip;
      const f = Math.min(den.t, 1);
      go(den.ex, den.ey, f);
      den.tilt = Math.atan2(den.ey - den.y0, den.ex - den.x0);
      up = 0.55 * Math.sin(Math.PI * f); smear = 1.35 - 1.05 * f;
      if (f >= 1) { from(den.ex, den.ey); den.state = 'squeeze'; }
    } else if (den.state === 'squeeze') {
      den.t += dt / 0.42;
      const f = Math.min(den.t, 1);
      go(den.hx, den.hy, 1 - (1 - f) ** 3);
      den.tilt = Math.atan2(-den.ny, -den.nx);
      smear = 0.3 * (1 - f);
      if (f >= 1) den.state = 'hidden';
    } else if (den.state === 'hidden') {
      den.x = den.hx + (den.px - den.hx) * den.p; den.y = den.hy + (den.py - den.hy) * den.p;
      if (den.quiet > WAIT) { den.state = 'peek'; den.t = 0; }
    } else if (den.state === 'peek') {
      den.t += dt;
      den.x = den.hx + (den.px - den.hx) * den.p; den.y = den.hy + (den.py - den.hy) * den.p;
      if (den.heard) den.state = 'hidden';
      else if (den.t > 1.7) {
        plot();
        const a = Math.atan2(den.ey - den.dy, den.ex - den.dx), rim = (RIM + 12) * scale + den.R * 0.3;
        den.rx = den.dx + Math.cos(a) * rim; den.ry = den.dy + Math.sin(a) * rim;
        den.ix = den.dx + Math.cos(a) * rim * 0.4; den.iy = den.dy + Math.sin(a) * rim * 0.4;
        from(den.x, den.y);
        den.state = 'creep'; den.done = 0; den.trip = Math.hypot(den.rx - den.x, den.ry - den.y);
      }
    } else if (den.state === 'creep') {
      den.t += dt;
      const heave = Math.sin(den.t * 5) ** 2;
      den.done += (den.trip / CREEP) * (0.3 + 1.4 * heave) * dt;
      const f = Math.min(den.done / den.trip, 1);
      go(den.rx, den.ry, f);
      den.tilt = Math.atan2(den.ry - den.y0, den.rx - den.x0);
      smear = 0.24 * heave;
      if (den.heard) {
        from(den.x, den.y);
        den.trip = Math.max(Math.hypot(den.ex - den.x, den.ey - den.y) / (1100 * scale), 0.1);
        den.state = 'dash';
      } else if (f >= 1) { from(den.x, den.y); den.state = 'hop'; }
    } else if (den.state === 'hop') {
      den.t += dt / 0.36;
      const f = Math.min(den.t, 1);
      go(den.ix, den.iy, f);
      up = 0.6 * Math.sin(Math.PI * f); smear = 0.12;
      if (f >= 1) return home();
    }
    den.lift = 1 + 0.24 * up;
    blob.smear = smear;
    blob.x = blob.tx = blob.y = blob.ty = MID;
    blob.next = fizz.time + 9;
    blob.la = den.tilt;
    canvas.style.translate = `${(den.x - den.dx).toFixed(2)}px ${(den.y - den.dy).toFixed(2)}px`;
    canvas.style.scale = den.lift.toFixed(3);
    paintDen();
  }
  function underneath() {
    const f = 1 / (scale * den.lift);
    return den.quad.map(([x, y]) => [(x - den.x) * f + MID, (y - den.y) * f + MID]);
  }
  function paintDen() {
    const c = den.c, night = glow.night, R = den.R, s = den.s, hideX = den.hx, hideY = den.hy;
    const quad = () => { c.moveTo(...den.quad[0]); for (let i = 1; i < 4; i++) c.lineTo(...den.quad[i]); c.closePath(); };
    c.setTransform(s, 0, 0, s, -den.bx * s, -den.by * s);
    c.clearRect(den.bx, den.by, den.W, den.H);
    if (den.bulge > 0.01) {
      c.save();
      c.beginPath(); quad(); c.clip();
      const reach = R * 1.45, a = den.bulge * (1 + 0.1 * Math.sin(fizz.time * 1.6));
      const spot = (px, py, color, alpha) => {
        const g = c.createRadialGradient(px, py, 0, px, py, reach);
        g.addColorStop(0, `rgba(${color}, ${(alpha * a).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${color}, ${(alpha * a * 0.42).toFixed(3)})`);
        g.addColorStop(1, `rgba(${color}, 0)`);
        c.fillStyle = g;
        c.fillRect(px - reach, py - reach, reach * 2, reach * 2);
      };
      spot(hideX - glow.x * R * 0.42, hideY - glow.y * R * 0.42, '30, 26, 22', night ? 0.42 : 0.34);
      spot(hideX + glow.x * R * 0.42, hideY + glow.y * R * 0.42, '255, 252, 240', night ? 0.1 : 0.34);
      c.restore();
    }
    if (den.p > 0.02) {
      c.save();
      c.beginPath(); c.rect(den.bx, den.by, den.W, den.H); quad(); c.clip('evenodd');
      paintEyes(c, den.ex + den.nx * R * 0.2, den.ey + den.ny * R * 0.2, R);
      c.restore();
    }
  }
  function paintEyes(c, x, y, R) {
    const tx = -den.ny, ty = den.nx, box = table.getBoundingClientRect();
    const look = hovered && cur.at ? clamp(((cur.at[0] - box.left - x) * tx + (cur.at[1] - box.top - y) * ty) / (R * 3), -1, 1) * R * 0.1 : Math.sin(den.t * 2.6) * R * 0.1;
    fizz.drawEyes(c, den.eyes, x, y, R, den.nx, den.ny, look, den.p);
  }
  function hear(dt) {
    den.heard = !!phone && phone.classList.contains('connected');
    den.quiet = den.heard ? 0 : den.quiet + dt;
    if (den.heard && !den.state && !leap && polaroid && blob.grow > 0.9) startle();
    if (den.out) roam(dt);
  }

  function glass(r, a) {
    if (den.press > 0.01) {
      const dx = blob.x - MID, dy = blob.y - MID, b = dx * Math.cos(a) + dy * Math.sin(a), wall = Math.sqrt(Math.max(b * b - dx * dx - dy * dy + (WALL - 1) ** 2, 0)) - b;
      if (r > wall) r -= (r - wall) * den.press;
    }
    return r;
  }
  function litGlass() {
    return den.out ? null : { x: MID, y: MID, r: WALL + 4.5, width: 2.2, far: WALL * 1.5 };
  }

  function spawnReach(toward, k) {
    if (strands.length >= MAX_STRANDS - 1) return;
    fizz.reach(cur, { toward, lean: [0, 0.5, -0.5, 0.95, -0.95, 1.35, -1.35][k % 7] });
  }

  function spawnFeeler() {
    const a = fizz.probeAt += rand(1.6, 4.7), s = fizz.sprout('probe', a);
    const [x, y] = at(a);
    const dx = x - MID, dy = y - MID, b = dx * Math.cos(a) + dy * Math.sin(a), c = dx * dx + dy * dy - (WALL - 6) ** 2;
    s.probe = { dist: Math.max(-b + Math.sqrt(Math.max(b * b - c, 0)), 14), dir: Math.random() < 0.5 ? -1 : 1, delay: 0, glide: 70 };
    s.ttl = rand(2.2, 3);
    s.vol = Math.PI * 1.1 * 1.1 * 80;
    strands.push(s);
  }
  function parted(s, base, tip) {
    const o = (NP - 1) * 2;
    base.retract = tip.retract = 0;
    lastSnap = fizz.time;
    if (drops.length < 6) {
      const L = Math.hypot(s.pos[o] - MID, s.pos[o + 1] - MID) || 1, far = Math.min(L, rand(190, 235)) / L;
      const a = Math.atan2(s.pos[o + 1] - MID, s.pos[o] - MID) + rand(-0.3, 0.3);
      const x = MID + Math.cos(a) * L * far, y = MID + Math.sin(a) * L * far;
      drops.push({ x, y, r: rand(2.6, 4.2), t: rand(0, 3), phase: rand(0, 6.28), dx: 1, dy: 0, sq: 1, up: 0, land: 0, step: 0,
        state: 'crawl', outside: Math.hypot(x - MID, y - MID) > RIM, tries: 0 });
    }
  }

  function stepDrop(d, dt) {
    d.t += dt;
    fizz.trace(d, dt);
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
      const f = fizz.flight(d, dt);
      d.up = (d.short ? CLEAR * 0.72 * Math.sin(f * Math.PI / 2) : (CLEAR + 8) * 4 * f * (1 - f));
      d.sq = 1 + 0.5 * Math.abs(1 - 2 * f);
      if (f < 1) return;
      if (d.short) {
        Object.assign(d, { state: 'fall', flight: 0, time: 0.24, top: d.up, land: 0.5, x1: d.x0, y1: d.y0, x0: d.x, y0: d.y });
        return;
      }
      d.up = 0;
      d.state = 'crawl';
      d.outside = false;
      d.land = 1.1;
    }
    if (d.state === 'fall') {
      const f = fizz.flight(d, dt);
      d.up = d.top * (1 - f * f);
      if (f < 1) return;
      Object.assign(d, { state: 'crouch', up: 0, land: 0.9, crouch: 0.42, wait: 0.42 });
      return;
    }
    const e = edge(d.x, d.y), pulse = Math.sin(d.t * 9) ** 2, speed = 34 + 96 * pulse, wob = Math.sin(d.t * 11 + d.phase) * 22;
    d.dx = -e.nx; d.dy = -e.ny;
    d.x += (-e.nx * speed - e.ny * wob) * dt;
    d.y += (-e.ny * speed + e.nx * wob) * dt;
    d.sq = 1 + 0.4 * pulse + d.land;
    if (d.outside && Math.hypot(d.x - MID, d.y - MID) < RIM + TAKEOFF) {
      Object.assign(d, { state: 'crouch', crouch: rand(0.16, 0.3) });
      d.wait = d.crouch;
    }
    if (e.d < 0) { d.dead = true; ripple(e.a, 1); flash(d.x, d.y, 0.5); }
  }

  function step(dt) {
    if (!still) fizz.time += dt;
    blob.grow += (1 - blob.grow) * (1 - Math.exp(-dt * 1.4));
    const e = edge(cur.x, cur.y), present = cur.present && blob.grow > 0.6 && !(leap && leap.off) && !den.state;
    const inside = present && e.d < -4;
    blob.over += ((inside ? 1 : 0) - blob.over) * (1 - Math.exp(-dt * 6));
    fizz.stir(dt, 0.25 + 0.45 * ready + 0.6 * blob.over);
    gone +=((leap && leap.off ? 1 : 0) - gone) * (1 - Math.exp(-dt * 8));
    ready += (nearing - ready) * (1 - Math.exp(-dt * (nearing > ready ? 5 : 3)));
    const winding = leap && !leap.off, coil = winding ? 1 : leap || den.state ? 0 : ready, tense = coil > 0.02;
    const size = (glow.night ? 1.08 : 0.94) * (1 - 0.24 * coil) * (1 - 0.5 * gone), w = leap || den.state ? 18 : tense ? 10 : 3;
    blob.sizeV += (w * w * (size - blob.size) - w * blob.sizeV) * dt;
    blob.size += blob.sizeV * dt;
    const reach = P.reach * (glow.night ? 1.15 : 1);
    fizz.aware = present && !inside ? ease(P.awareness * (glow.night ? 1.15 : 1), 18, e.d) : 0;

    if (fizz.aware > 0.02 || inside) {
      const dx = cur.x - MID, dy = cur.y - MID, L = Math.hypot(dx, dy) || 1, far = Math.min(L, 36);
      blob.tx = MID + (dx / L) * far; blob.ty = MID + (dy / L) * far;
      blob.next = fizz.time + rand(3, 6);
      blob.la += turn(e.a - blob.la) * (1 - Math.exp(-dt * 8));
    } else if (fizz.time > blob.next) {
      const a = rand(0, 6.28), far = rand(0, 34);
      blob.tx = MID + Math.cos(a) * far; blob.ty = MID + Math.sin(a) * far;
      blob.next = fizz.time + rand(4, 8);
    }
    if (den.state === 'startle' || den.state === 'swirl') swirl(dt);
    if (tense) {
      const dir = winding ? leap.dir : aim;
      blob.tx = MID - Math.cos(dir) * 30 * coil; blob.ty = MID - Math.sin(dir) * 30 * coil;
      blob.next = fizz.time + 2;
      nextProbe = Math.max(nextProbe, fizz.time + 1);
      blob.la += turn(dir - blob.la) * (1 - Math.exp(-dt * (8 + 22 * coil)));
    }
    const k = 1 - Math.exp(-dt * (winding ? 16 : tense ? 6 : fizz.aware > 0.02 ? 2.2 : 0.5));
    blob.x += (blob.tx - blob.x) * k;
    blob.y += (blob.ty - blob.y) * k;
    const strain = Math.max(fizz.aware, 1.5 * coil, den.lean), quiver = (1 - coil) * 0.03 * Math.sin(fizz.time * 19);
    blob.lean += (strain * (1 + quiver) - blob.lean) * (1 - Math.exp(-dt * (6 + 16 * Math.max(coil, den.press))));

    if (!still) {
      const active = strands.filter(s => s.kind === 'reach').length;
      if (!present) fizz.release(false);
      else if (inside) fizz.release(true);
      else {
        const want = e.d < reach ? Math.round(4 + (P.maxStrands - 4) * ease(reach, reach * 0.45, e.d)) : 0;
        if (active < want && fizz.time - lastSpawn > rand(0.03, 0.06) && fizz.time - lastSnap > 0.15) { spawnReach(e.a, active); lastSpawn = fizz.time; }
        const micro = strands.filter(s => s.kind === 'micro' && s.state !== 'recoil').length;
        if (micro < Math.round(7 * ease(0.1, 0.8, fizz.aware)) && fizz.time - lastMicro > rand(0.03, 0.07)) { fizz.hair(cur, e.a); lastMicro = fizz.time; }
      }
      if (!inside && fizz.aware < 0.02 && fizz.time > nextProbe && blob.grow > 0.95 && !den.state) {
        if (strands.every(s => s.kind === 'probe' || s.state === 'recoil')) {
          if (fizz.time - lastFeel > 9) { spawnFeeler(); lastFeel = fizz.time; } else fizz.probe();
        }
        nextProbe = fizz.time + rand(1.8, 3.4) * (glow.night ? 0.6 : 1);
      }
    }

    fizz.move(dt);
    fizz.ebb(dt);
  }

  const LEAP = { crouch: 0.3, fly: 0.34, peel: 0.55 };
  const FACE = { spread: 0.16, gather: 0.9, eyes: 0.75, mouth: 1.05, end: 2.1 };
  const BACK = 1.7;
  const DROPS = 1.75;
  const HEAD = { x: 0.492, y: 0.35, size: 0.165, tilt: 8 * Math.PI / 180, yaw: -0.25 };
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
      for (let k = 0; k < 3; k++) {
        const far = rand(0.08, 0.5) * R, b = a + rand(-0.2, 0.2);
        drops.push({ x: x + Math.cos(b) * far, y: y + Math.sin(b) * far, r: rand(0.015, 0.05) * R, at: arrive(reach + far), go: rand(0.3, DROPS - 0.75), left: Math.random() < 0.3 });
      }
    }
    return { G, A, drops };
  }

  function buildLump(W, H, cx, cy, k) {
    const mask = layer(W, H);
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
  function extent(C, W, H) {
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      if (C[i] > 0.1) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { x0: Math.max(x0 - 12, 0), x1: Math.min(x1 + 12, W - 1), y0: Math.max(y0 - 12, 0), y1: Math.min(y1 + 12, H - 1) };
  }

  const FILM = (() => {
    const lo = -0.15, step = 1 / 2048, n = Math.ceil((1.2 - lo) / step) + 1, a = new Float32Array(n);
    for (let k = 0; k < n; k++) { const v = lo + k * step; a[k] = v > 0 ? 0.5 + 0.5 * bell(v, 0.22) : bell(v, 0.06); }
    return { lo, inv: 1 / step, a, last: n - 1 };
  })();
  function paintFilm(el, F) {
    const W = el.width, H = el.height, c = el.getContext('2d'), image = c.createImageData(W, H), px = image.data;
    const [r, g, b] = glow.night ? [130, 200, 140] : [74, 62, 38], most = 255 * (glow.night ? 0.16 : 0.22);
    const waves = [[0.043, 0.021, 1], [0.017, -0.051, 1], [0.11, 0.083, 0.6]];
    const along = waves.map(([kx, , w]) => [Float32Array.from({ length: W }, (_, x) => w * Math.sin(x * kx)), Float32Array.from({ length: W }, (_, x) => w * Math.cos(x * kx))]);
    const down = waves.map(([, ky]) => [Float32Array.from({ length: H }, (_, y) => Math.cos(y * ky)), Float32Array.from({ length: H }, (_, y) => Math.sin(y * ky))]);
    const { lo, inv, a: A, last } = FILM, [[s0, c0], [s1, c1], [s2, c2]] = along;
    for (let y = 1; y < H - 1; y++) {
      const C0 = down[0][0][y], S0 = down[0][1][y], C1 = down[1][0][y], S1 = down[1][1][y], C2 = down[2][0][y], S2 = down[2][1][y];
      for (let x = 0, i = y * W; x < W; x++, i++) {
        const v = F[i] - 0.42;
        if (v < lo) continue;
        const a = A[Math.min(((v - lo) * inv + 0.5) | 0, last)];
        if (a < 0.01) continue;
        const o = i * 4, patchy = s0[x] * C0 + c0[x] * S0 + s1[x] * C1 + c1[x] * S1 + s2[x] * C2 + c2[x] * S2;
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
        px[o + 3] = most * a * clamp(0.6 + 0.3 * patchy, 0, 1);
      }
    }
    c.putImageData(image, 0, 0);
  }
  function paintFilms() {
    const K = kit;
    K.filmNight = glow.night;
    const F = K.run.G.slice(), { W } = K;
    for (const d of K.run.drops) {
      if (!d.left) continue;
      const L = Math.ceil(d.r);
      for (let v = -L; v <= L; v++) for (let u = -L; u <= L; u++) {
        const q = 1 - (u * u + v * v) / (d.r * d.r), at = Math.round(d.y + v) * W + Math.round(d.x + u);
        if (q > 0 && F[at] < 0.42 + 0.3 * q) F[at] = 0.42 + 0.3 * q;
      }
    }
    paintFilm(K.film, F);
    paintFilm(K.mark, K.lump);
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

  function buildRoom(night) {
    const w = 96, h = 96, room = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      room[y * w + x] = night ? bell(u - 0.32, 0.05) * bell(v - 0.16, 0.05) : 0.04 + 0.96 * bell(u - 0.3, 0.2) * bell(v - 0.12, 0.2);
    }
    return { room, w, h, night };
  }

  function buildSpecks() {
    const test = layer().getContext('2d'), specks = [];
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
    const co = Math.cos(HEAD.tilt) * K.U, si = Math.sin(HEAD.tilt) * K.U;
    c.setTransform(co * K.px, si * K.px, -si * K.px, co * K.px, K.fx * K.px, K.fy * K.px);
    c.globalCompositeOperation = 'lighter';
    const draw = (x, y, size, a) => { c.globalAlpha = Math.min(a, 1); c.drawImage(SOFT, x - size, y - size, size * 2, size * 2); };
    const follow = 1 - Math.exp(-dt * 7);
    gaze.x += (gaze.tx - gaze.x) * follow; gaze.y += (gaze.ty - gaze.y) * follow;
    if (fizz.time > K.blink + 0.3) K.blink = fizz.time + rand(3, 7);
    const shut = bell(fizz.time - K.blink, 0.075), breath = 0.88 + 0.12 * Math.sin(fizz.time * 1.25), lookX = gaze.x * 0.1, lookY = gaze.y * 0.08;
    const eyes = ease(FACE.eyes + 0.15, FACE.end, t), mouth = ease(FACE.mouth + 0.2, FACE.end, t), bloom = night ? 0.5 : 0.28, [left] = wrap(-0.36, 0), [right] = wrap(0.36, 0), [middle] = wrap(0, 0);
    if (eyes > 0) { const a = eyes * bloom * present * (1 - 0.8 * shut); draw(left + lookX, -0.27 + lookY, 0.46, a); draw(right + lookX, -0.27 + lookY, 0.46, a); }
    if (mouth > 0) draw(middle + lookX * 0.4, 0.38 + lookY * 0.4, 0.72, mouth * bloom * present);
    for (const m of K.specks) {
      const go = ease(m.start, m.start + 0.6, t);
      const shift = go * (m.eye ? 1 : 0.4), ty = m.eye ? -0.27 + (m.y + 0.27) * (1 - 0.88 * shut) : m.y;
      const x = m.x0 + (m.x - m.x0) * go + Math.sin(fizz.time * m.rate + m.ph) * 0.022 + lookX * shift, y = m.y0 + (ty - m.y0) * go + Math.cos(fizz.time * m.rate * 0.8 + m.ph * 2) * 0.022 + lookY * shift;
      const twinkle = 0.55 + 0.45 * Math.sin(fizz.time * 2.3 * m.rate + m.ph * 3);
      draw(x, y, m.size * (1 + go * 0.25), present * m.power * (0.28 + 0.72 * go) * twinkle * breath * (night ? 1 : 0.85));
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function build() {
    const box = table.getBoundingClientRect(), r = polaroid.getBoundingClientRect(), w = polaroid.offsetWidth, h = polaroid.offsetHeight;
    const U = w * HEAD.size, R = U * 1.5, far = R * 2.75, pad = Math.ceil(Math.max(far - w * HEAD.x, far - h * HEAD.y, 0)), sw = w + pad * 2, sh = h + pad * 2;
    const g = 0.5, W = Math.round(sw / g), H = Math.round(sh / g), px = Math.min(devicePixelRatio || 1, 2) * 1.5;
    const stage = document.createElement('div');
    stage.className = 'fizz-face';
    stage.setAttribute('aria-hidden', 'true');
    const [midX, midY] = middle(r, box), turned = getComputedStyle(polaroid).rotate;
    Object.assign(stage.style, { left: `${midX - sw / 2}px`, top: `${midY - sh / 2}px`, width: `${sw}px`, height: `${sh}px`, rotate: turned });
    const skin = layer(W, H);
    const top = layer(Math.round(sw * px), Math.round(sh * px)), film = layer(W, H), mark = layer(W, H);
    const halo = document.createElement('div');
    film.style.opacity = mark.style.opacity = halo.style.opacity = 0;
    stage.append(film, mark, halo, skin, top);
    const fly = layer(1, 1);
    fly.className = 'fizz-leap';
    table.append(fly, stage);
    const fx = pad + w * HEAD.x, fy = pad + h * HEAD.y, a = (parseFloat(turned) || 0) * Math.PI / 180;
    Object.assign(halo.style, { position: 'absolute', left: `${fx - U * 3.4}px`, top: `${fy - U * 3.4}px`, width: `${U * 6.8}px`, height: `${U * 6.8}px`, background: 'radial-gradient(closest-side, rgba(190, 236, 165, 0.3), rgba(190, 236, 165, 0.1) 45%, rgba(190, 236, 165, 0))' });
    const ox = fx - sw / 2, oy = fy - sh / 2;
    const cx = fx / g, cy = fy / g, lump = buildLump(W, H, cx, cy, U / g), K = { stage, top, fly, skin, gpu: null, fc: fly.getContext('2d'), tc: top.getContext('2d'),
      W, H, g, U, fx, fy, cx, cy, px, inset: pad / g, near: extent(lump, W, H), film, mark, halo, filmNight: null, stress: 0, blink: 0, angle: a, domes: [],
      landX: midX + ox * Math.cos(a) - oy * Math.sin(a), landY: midY + ox * Math.sin(a) + oy * Math.cos(a),
      run: buildRun(W, H, cx, cy, R / g), lump, specks: buildSpecks(), env: buildRoom(glow.night), tails: Array.from({ length: 5 }, () => rand(0, 6.28)),
      strings: Array.from({ length: 8 }, (_, i) => ({ a: ((i + rand(0.2, 0.8)) / 8) * 6.28, snap: rand(0.4, 0.8), width: rand(0.05, 0.1) * U / g })) };
    const from = canvas.getBoundingClientRect(), dx = from.left - box.left + MID * scale, dy = from.top - box.top + MID * scale, reach = WALL * scale * 1.3, M = BODY * scale * 4;
    const x0 = Math.floor(Math.max(Math.min(dx - reach, K.landX) - M, 0)), y0 = Math.floor(Math.max(Math.min(dy - reach, K.landY) - M, 0));
    const x1 = Math.ceil(Math.min(Math.max(dx + reach, K.landX) + M, box.width)), y1 = Math.ceil(Math.min(Math.max(dy + reach, K.landY) + M, box.height)), s = Math.min(dpr, 1.5);
    Object.assign(fly.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
    fly.width = Math.max(Math.round((x1 - x0) * s), 1);
    fly.height = Math.max(Math.round((y1 - y0) * s), 1);
    Object.assign(K, { flyScale: fly.width / (x1 - x0), flyBox: [x0, y0, x1 - x0, y1 - y0] });
    flatSkin(K, true);
    return K;
  }

  function paintSkin(t, peel) {
    const K = kit, { W, H, cx, cy } = K, { drops } = K.run;
    if (K.gpu && K.gpu.lost) flatSkin(K);
    if (K.env.night !== glow.night) { K.env = buildRoom(glow.night); if (K.gpu) K.gpu.room(K.env); }
    const { w: EW, h: EH, night } = K.env, cells = K.U / K.g;
    const m = ease(FACE.spread, FACE.gather, t), pull = ease(0, 1, peel), iso = 0.42 + 0.55 * Math.exp(-t * 20) - 0.09 * Math.exp(-t * 6) * Math.cos(t * 17) - 0.025 * m * Math.sin(fizz.time * 1.25) + 0.6 * peel * peel;
    const spreading = t < 0.22, shrink = 1 + 2.4 * pull, zoom = (1 + 2.2 * m) * shrink, solid = m >= 1 && t >= DROPS && !peel;
    const scaleX = K.g / K.U, heave = 0.09 * ease(0.4, 1, m);
    const { x0, x1, y0, y1 } = solid ? K.near : { x0: 0, x1: W - 1, y0: 0, y1: H - 1 };
    const domes = K.domes;
    domes.length = 0;
    const dome = (x, y, r, tall) => {
      const L = Math.ceil(r), ix = Math.round(x), iy = Math.round(y);
      if (ix - L < 1 || iy - L < 1 || ix + L >= W - 1 || iy + L >= H - 1) return;
      domes.push(ix, iy, r, tall);
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
    const struck = 0.42 * Math.exp(-t * 2.4), hurt = 0.3 * Math.sin(Math.PI * Math.min(peel * 1.1, 1));
    K.stress = night ? Math.max(struck, hurt) : 0;
    const a0 = K.angle, sx = glow.x * Math.cos(a0) + glow.y * Math.sin(a0), sy = -glow.x * Math.sin(a0) + glow.y * Math.cos(a0), d1 = cells * 0.035;
    const off = [1, 2.2, 3.6].map(k => [Math.round(sx * d1 * k), Math.round(sy * d1 * k)]);
    const shade = night ? [3, 5, 6] : [28, 34, 44], cast = night ? 0.4 : 0.42;
    const K2 = 6.4, far = EH * 0.5, lx = -0.42, ly = -0.62, hz = 1.66, hl = 1 / Math.sqrt(lx * lx + ly * ly + hz * hz), in0 = K.inset, rx = EW / (W - in0 * 2), ry = EH / (H - in0 * 2);
    if (K.gpu) {
      K.gpu.paint({ cx, cy, m, zoom, shrink, heave, iso, t, scaleX, time: fizz.time, solid, peel: !!peel, spreading, domes, x0, y0, x1, y1,
        K2, far, lx, ly, hz, hl, in0, rx, ry, cells, struck, hurt, cast, night, shade, off });
      return;
    }

    const { height, rgba: px, lump: C } = K, { G, A } = K.run, room = K.env.room, wx = K.wx, wy = K.wy;
    for (let x = 0; x < W; x++) wx[x] = Math.sin(x * scaleX * 2.6 + fizz.time * 1.3) + 0.6 * Math.sin(x * scaleX * 5.1 - fizz.time * 1.9);
    for (let y = 0; y < H; y++) wy[y] = Math.sin(y * scaleX * 2.2 - fizz.time * 1.1) + 0.6 * Math.sin(y * scaleX * 4.7 + fizz.time * 1.7);
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
    for (let k = 0; k < domes.length; k += 4) {
      const ix = domes[k], iy = domes[k + 1], r = domes[k + 2], tall = domes[k + 3], L = Math.ceil(r), inv = 1 / (r * r);
      for (let v = -L; v <= L; v++) for (let u = -L; u <= L; u++) {
        const d = u * u + v * v;
        if (d >= r * r) continue;
        const i = (iy + v) * W + ix + u, h = tall * Math.sqrt(1 - d * inv);
        if (h > height[i]) height[i] = h;
      }
    }
    const [at1, at2, at3] = off.map(([x, y]) => y * W + x), [sr, sg, sb] = shade;
    for (let y = Math.max(y0, 1); y <= Math.min(y1, H - 2); y++) {
      const line = y * W;
      for (let x = Math.max(x0, 1); x <= Math.min(x1, W - 2); x++) {
        const i = line + x, h = height[i];
        if (h < 0.006) {
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

  const SKIN_VS = `#version 300 es
void main() { vec2 q = vec2(gl_VertexID & 1, gl_VertexID >> 1); gl_Position = vec4(q * 2. - 1., 0., 1.); }
`;
  const SKIN_HEIGHT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_G;
uniform highp sampler2D u_A;
uniform highp sampler2D u_C;
uniform highp sampler2D u_D;
uniform vec2 u_size;
uniform vec2 u_c;
uniform vec4 u_k;
uniform vec4 u_j;
uniform ivec4 u_f;
out vec4 o;
float at(highp sampler2D s, int x, int y) { return texelFetch(s, ivec2(x, y), 0).r; }
float sampled(highp sampler2D s, float x, float y) {
  float fx = floor(x), fy = floor(y);
  int ix = int(fx), iy = int(fy);
  if (ix < 0 || iy < 0 || ix >= int(u_size.x) - 1 || iy >= int(u_size.y) - 1) return 0.;
  float u = x - fx, v = y - fy, a = at(s, ix, iy), b = at(s, ix + 1, iy), c = at(s, ix, iy + 1), d = at(s, ix + 1, iy + 1);
  float top = a + (b - a) * u, under = c + (d - c) * u;
  return top + (under - top) * v;
}
void main() {
  int x = int(gl_FragCoord.x), y = int(u_size.y) - 1 - int(gl_FragCoord.y);
  float fx = float(x), fy = float(y), m = u_k.x, heave = u_k.w, sc = u_j.z, tm = u_j.w;
  float swell = sin(fx * sc * 2.6 + tm * 1.3) + .6 * sin(fx * sc * 5.1 - tm * 1.9) + sin(fy * sc * 2.2 - tm * 1.1) + .6 * sin(fy * sc * 4.7 + tm * 1.7);
  float value = 0.;
  if (u_f.x == 1) value = at(u_C, x, y) + heave * swell;
  else {
    float dx = fx - u_c.x, dy = fy - u_c.y;
    if (m < 1.) value = sampled(u_G, u_c.x + dx * u_k.y, u_c.y + dy * u_k.y) * (1. - m);
    if (m > 0.) value += ((u_f.y == 1 ? sampled(u_C, u_c.x + dx * u_k.z, u_c.y + dy * u_k.z) : at(u_C, x, y)) + heave * swell) * m;
  }
  float over = (value - u_j.x) / .5, h = 0.;
  if (over > 0.) {
    h = over >= 1. ? 1. + .16 * min(over - 1., 7.) : sqrt(1. - (1. - over) * (1. - over));
    if (u_f.z == 1) h *= clamp((u_j.y - at(u_A, x, y)) / .03, 0., 1.);
  }
  for (int k = 0; k < u_f.w; k++) {
    vec4 d = texelFetch(u_D, ivec2(k, 0), 0);
    float u = fx - d.x, v = fy - d.y, L = ceil(d.z), dd = u * u + v * v;
    if (abs(u) > L || abs(v) > L || dd >= d.z * d.z) continue;
    h = max(h, d.w * sqrt(1. - dd / (d.z * d.z)));
  }
  float q = floor(clamp(h / 2.5, 0., 1.) * 65535. + .5), hi = floor(q / 256.);
  o = vec4(hi / 255., (q - hi * 256.) / 255., 0., 1.);
}
`;
  const SKIN_LIGHT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_H;
uniform highp sampler2D u_R;
uniform vec2 u_size;
uniform vec2 u_c;
uniform vec4 u_l1;
uniform vec4 u_l2;
uniform vec4 u_l3;
uniform vec4 u_l4;
uniform vec4 u_l5;
uniform vec3 u_shade;
uniform ivec4 u_o1;
uniform ivec2 u_o3;
uniform ivec2 u_env;
out vec4 o;
float height(int x, int y) {
  if (x < 0 || y < 0 || x >= int(u_size.x) || y >= int(u_size.y)) return 0.;
  vec2 v = texelFetch(u_H, ivec2(x, int(u_size.y) - 1 - y), 0).rg;
  return (v.x * 65280. + v.y * 255.) / 65535. * 2.5;
}
void main() {
  int x = int(gl_FragCoord.x), y = int(u_size.y) - 1 - int(gl_FragCoord.y);
  float fx = float(x), fy = float(y), h = height(x, y);
  float K2 = u_l1.x, far = u_l1.y, lx = u_l1.z, ly = u_l1.w, hz = u_l2.x, hl = u_l2.y, in0 = u_l2.z, rx = u_l2.w;
  float ry = u_l3.x, cells = u_l3.y, t = u_l3.z, m = u_l3.w, struck = u_l4.x, hurt = u_l4.y, shed = u_l4.z, night = u_l4.w;
  if (h < .006) {
    float dark = min(height(x + u_o1.x, y + u_o1.y), 1.) * .5 + clamp(height(x + u_o1.z, y + u_o1.w) - .5, 0., 1.) * .35 + clamp(height(x + u_o3.x, y + u_o3.y) - .95, 0., .5) * .3;
    float a = dark > .004 ? shed * dark : 0.;
    o = vec4(u_shade / 255. * a, a);
    return;
  }
  float nx = (height(x - 1, y) - height(x + 1, y)) * K2, ny = (height(x, y - 1) - height(x, y + 1)) * K2;
  float c = 1. / sqrt(nx * nx + ny * ny + 1.), steep = 1. - c, fresnel = steep * steep * steep;
  int ex = clamp(int((fx - in0) * rx - nx * c * far), 0, u_env.x - 1), ey = clamp(int((fy - in0) * ry - ny * c * far), 0, u_env.y - 1);
  float seen = texelFetch(u_R, ivec2(ex, ey), 0).r;
  float facing = max((nx * lx + ny * ly + hz) * c * hl, 0.), f2 = facing * facing, f4 = f2 * f2, f8 = f4 * f4, spec = f8 * f8 * f8 * f8 * f8;
  float reflect = (.2 + .8 * fresnel) * seen, body = 1. - exp(-h * 9.), r, g, b, a;
  if (night > .5) {
    float sc = u_l5.x, tm = u_l5.y, swell = sin(fx * sc * 2.6 + tm * 1.3) + .6 * sin(fx * sc * 5.1 - tm * 1.9) + sin(fy * sc * 2.2 - tm * 1.1) + .6 * sin(fy * sc * 4.7 + tm * 1.7);
    float ringAt = length(vec2(fx - u_c.x, fy - u_c.y)) / cells - 11. * t, ring = t < .9 ? .5 * exp(-(ringAt / .8) * (ringAt / .8)) * exp(-t * 3.) : 0.;
    float deep = min(h, 1.6) / 1.6, cloud = .14 + .1 * deep, em = body * (cloud + .55 * steep + .08 * swell * m + struck + hurt + ring), lamp = reflect * .7 + spec * .3;
    r = 10. + 182. * em + 255. * lamp; g = 26. + 226. * em + 228. * lamp; b = 20. + 150. * em + 196. * lamp;
    a = (1. - exp(-h * h * 3.2)) * (.86 + .14 * steep);
  } else {
    float lit = spec * .8 + reflect * .9, thin = 1. - body;
    r = (12. + 29. * thin) * (1. - lit) + 226. * lit;
    g = (30. + 86. * thin) * (1. - lit) + 232. * lit;
    b = (24. + 58. * thin) * (1. - lit) + 222. * lit;
    a = max(1. - exp(-h * h * 3.2), lit * (1. - exp(-h * h * 3.2)));
  }
  a = clamp(a, 0., 1.);
  o = vec4(clamp(vec3(r, g, b), 0., 255.) / 255. * a, a);
}
`;
  function skinner(el, W, H) {
    let gl = null;
    try { gl = el.getContext('webgl2', { premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch (e) { return null; }
    if (!gl) return null;
    const build = fs => {
      const p = gl.createProgram();
      const parts = [[gl.VERTEX_SHADER, SKIN_VS], [gl.FRAGMENT_SHADER, fs]].map(([type, src]) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        gl.attachShader(p, s);
        return s;
      });
      gl.linkProgram(p);
      const at = new Map();
      return { p, parts, u: n => { if (!at.has(n)) at.set(n, gl.getUniformLocation(p, n)); return at.get(n); } };
    };
    const rise = build(SKIN_HEIGHT), light = build(SKIN_LIGHT), quick = gl.getExtension('KHR_parallel_shader_compile');
    let done = false;
    const field = (w, h, data, format = gl.R32F, layout = gl.RED) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, layout, gl.FLOAT, data);
      return t;
    };
    const tall = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tall);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG8, W, H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tall, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const vao = gl.createVertexArray();
    let G = null, A = null, C = null, R = null, env = [1, 1], D = null, most = 0;
    const S = { lost: false };
    el.addEventListener('webglcontextlost', () => { S.lost = true; });
    const bind = (prog, unit, name, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u(name), unit); };
    const only = (x0, y0, x1, y1) => { gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, H - 1 - y1, x1 - x0 + 1, y1 - y0 + 1); };
    const wipe = () => { gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); };
    return Object.assign(S, {
      ready() {
        if (done || S.lost) return done;
        if (quick && ![rise, light].every(q => gl.getProgramParameter(q.p, quick.COMPLETION_STATUS_KHR))) return false;
        for (const q of [rise, light]) {
          if (!gl.getProgramParameter(q.p, gl.LINK_STATUS)) {
            if (!gl.isContextLost()) console.warn('The skin is drawn on a canvas, as WebGL failed:', q.parts.map(s => gl.getShaderInfoLog(s)).join('\n') + gl.getProgramInfoLog(q.p));
            S.lost = true;
            return false;
          }
        }
        return (done = true);
      },
      load(K) { G = field(W, H, K.run.G); A = field(W, H, K.run.A); C = field(W, H, K.lump); S.room(K.env); },
      room(e) { if (R) gl.deleteTexture(R); R = field(e.w, e.h, e.room); env = [e.w, e.h]; },
      clear() { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); wipe(); },
      paint(p) {
        const n = p.domes.length / 4;
        if (n > most || !D) {
          most = Math.max(64, n * 2);
          if (D) gl.deleteTexture(D);
          D = field(most, 1, null, gl.RGBA32F, gl.RGBA);
        }
        if (n) {
          gl.bindTexture(gl.TEXTURE_2D, D);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, 1, gl.RGBA, gl.FLOAT, new Float32Array(p.domes));
        }
        gl.bindVertexArray(vao);
        gl.disable(gl.BLEND);
        gl.viewport(0, 0, W, H);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        wipe();
        only(p.x0, p.y0, p.x1, p.y1);
        gl.useProgram(rise.p);
        bind(rise, 0, 'u_G', G); bind(rise, 1, 'u_A', A); bind(rise, 2, 'u_C', C); bind(rise, 3, 'u_D', D);
        gl.uniform2f(rise.u('u_size'), W, H);
        gl.uniform2f(rise.u('u_c'), p.cx, p.cy);
        gl.uniform4f(rise.u('u_k'), p.m, p.zoom, p.shrink, p.heave);
        gl.uniform4f(rise.u('u_j'), p.iso, p.t, p.scaleX, p.time);
        gl.uniform4i(rise.u('u_f'), p.solid ? 1 : 0, p.peel ? 1 : 0, p.spreading ? 1 : 0, n);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        wipe();
        only(Math.max(p.x0, 1), Math.max(p.y0, 1), Math.min(p.x1, W - 2), Math.min(p.y1, H - 2));
        gl.useProgram(light.p);
        bind(light, 0, 'u_H', tall); bind(light, 1, 'u_R', R);
        gl.uniform2f(light.u('u_size'), W, H);
        gl.uniform2f(light.u('u_c'), p.cx, p.cy);
        gl.uniform4f(light.u('u_l1'), p.K2, p.far, p.lx, p.ly);
        gl.uniform4f(light.u('u_l2'), p.hz, p.hl, p.in0, p.rx);
        gl.uniform4f(light.u('u_l3'), p.ry, p.cells, p.t, p.m);
        gl.uniform4f(light.u('u_l4'), p.struck, p.hurt, p.cast, p.night ? 1 : 0);
        gl.uniform4f(light.u('u_l5'), p.scaleX, p.time, 0, 0);
        gl.uniform3f(light.u('u_shade'), ...p.shade);
        gl.uniform4i(light.u('u_o1'), p.off[0][0], p.off[0][1], p.off[1][0], p.off[1][1]);
        gl.uniform2i(light.u('u_o3'), p.off[2][0], p.off[2][1]);
        gl.uniform2i(light.u('u_env'), env[0], env[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    });
  }
  function flatSkin(K, kept) {
    const skin = kept ? K.skin : layer(K.W, K.H), c = skin.getContext('2d'), image = c.createImageData(K.W, K.H);
    if (!kept) K.skin.replaceWith(skin);
    Object.assign(K, { skin, gpu: null, c, image, data: new Uint32Array(image.data.buffer), rgba: image.data, height: new Float32Array(K.W * K.H), wx: new Float32Array(K.W), wy: new Float32Array(K.H) });
  }
  function cardSkin(K) {
    if (K.gpu || K.pending === false) return;
    if (!K.pending) {
      const el = layer(K.W, K.H), gpu = skinner(el, K.W, K.H);
      if (!gpu) { K.pending = false; return; }
      gpu.load(K);
      K.pending = { el, gpu };
    }
    const { el, gpu } = K.pending;
    if (!gpu.ready()) { if (gpu.lost) K.pending = false; return; }
    if (leap) return;
    gpu.room(K.env);
    el.style.cssText = K.skin.style.cssText;
    K.skin.replaceWith(el);
    Object.assign(K, { skin: el, gpu, pending: null, c: null, image: null, data: null, rgba: null, height: null });
  }

  function paintFlight(z) {
    const K = kit, c = K.fc, night = glow.night, box = table.getBoundingClientRect(), from = canvas.getBoundingClientRect(), [bx, by, bw, bh] = K.flyBox;
    c.setTransform(K.flyScale, 0, 0, K.flyScale, -bx * K.flyScale, -by * K.flyScale);
    c.clearRect(bx, by, bw, bh);
    if (z === null) return;
    const x0 = from.left - box.left + blob.x * scale, y0 = from.top - box.top + blob.y * scale;
    const f = ease(0, 1, z), x = x0 + (K.landX - x0) * f, y = y0 + (K.landY - y0) * f, up = Math.sin(Math.PI * z), r0 = BODY * scale * 0.42, r = r0 * (1 + 0.42 * up);
    const sx = x - glow.x * up * r0 * 2.6, sy = y - glow.y * up * r0 * 2.6, sr = r0 * (1 + 0.8 * up);
    if (!night) {
      const shadow = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
      shadow.addColorStop(0, `rgba(${glow.shadow}, ${(0.5 - 0.22 * up).toFixed(3)})`);
      shadow.addColorStop(1, `rgba(${glow.shadow}, 0)`);
      c.fillStyle = shadow;
      c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    } else {
      const pool = c.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.4);
      pool.addColorStop(0, `rgba(${LIT}, ${(0.24 - 0.14 * up).toFixed(3)})`);
      pool.addColorStop(1, `rgba(${LIT}, 0)`);
      c.fillStyle = pool;
      c.fillRect(sx - sr * 2.4, sy - sr * 2.4, sr * 4.8, sr * 4.8);
    }
    const tail = ease(0.5, 0.1, z), L = Math.hypot(x - x0, y - y0) || 1, nx = -(y - y0) / L, ny = (x - x0) / L;
    if (tail > 0.01) {
      for (const a of K.tails) {
        const ax = x0 + Math.cos(a) * r0, ay = y0 + Math.sin(a) * r0, off = Math.sin(a * 3) * r * 0.6, wide = r * 0.22 * tail, px = x + nx * off, py = y + ny * off;
        c.fillStyle = night ? `rgba(${LIT}, ${(0.4 * tail).toFixed(3)})` : `rgba(${DARK}, ${tail.toFixed(3)})`;
        c.beginPath();
        c.moveTo(ax, ay);
        c.quadraticCurveTo((ax + px) / 2 + nx * wide, (ay + py) / 2 + ny * wide - up * r, px + nx * wide, py + ny * wide);
        c.lineTo(px - nx * wide, py - ny * wide);
        c.quadraticCurveTo((ax + px) / 2 - nx * wide, (ay + py) / 2 - ny * wide - up * r, ax, ay);
        c.fill();
      }
    }
    paintLump(c, x, y, r, Math.atan2(y - y0, x - x0), 1 + 0.4 * up, z * 14, night);
  }
  function paintLump(c, x, y, r, heading, stretch, phase, night) {
    c.save();
    c.translate(x, y);
    c.rotate(heading);
    c.scale(stretch, 1 / stretch);
    c.beginPath();
    for (let i = 0; i <= 56; i++) {
      const a = (i / 56) * 6.283, q = r * (1 + 0.09 * Math.sin(3 * a + phase * 0.8) + 0.05 * Math.sin(5 * a - phase * 1.2));
      c.lineTo(Math.cos(a) * q, Math.sin(a) * q);
    }
    c.closePath();
    const co = Math.cos(heading), si = Math.sin(heading), gx = glow.x * co + glow.y * si, gy = -glow.x * si + glow.y * co;
    const body = c.createRadialGradient(gx * r * 0.35, gy * r * 0.35, r * 0.1, 0, 0, r * 1.1);
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
    c.restore();
    if (!night) {
      c.fillStyle = shine(0.75);
      c.beginPath();
      c.ellipse(x + glow.x * r * 0.54, y + glow.y * r * 0.54, r * 0.17, r * 0.07, Math.atan2(glow.y, glow.x) + Math.PI / 2, 0, 6.29);
      c.fill();
    }
  }

  const whenIdle = window.requestIdleCallback || (f => setTimeout(f, 200));
  function prepare() {
    if (polaroid && !still && matchMedia('(hover: hover)').matches) whenIdle(() => { if (!kit && polaroid.offsetWidth) { kit = build(); dry(); fizz.prepare().then(upgrade); whenIdle(warm); } });
  }
  // The first leap-like draw compiles on the GPU and takes a frame or two, so draw it once unseen beforehand.
  function warm() {
    const K = kit;
    if (!K || leap || !window.createImageBitmap) { if (K) K.warm = true; return; }
    paintFlight(0.5);
    const done = () => { K.warm = true; if (kit === K && !leap) paintFlight(null); };
    createImageBitmap(K.fly).then(b => { b.close(); done(); }, done);
  }
  function upgrade() {
    const K = kit;
    if (!K || K.gpu || K.pending === false) return;
    if (!leap) cardSkin(K);
    if (kit === K && !K.gpu && K.pending !== false) setTimeout(() => whenIdle(upgrade), 250);
  }
  function dry() {
    whenIdle(() => { if (kit && kit.filmNight !== glow.night) paintFilms(); });
  }

  function bearing() {
    const from = canvas.getBoundingClientRect(), box = table.getBoundingClientRect();
    return Math.atan2(kit.landY - (from.top - box.top + MID * scale), kit.landX - (from.left - box.left + MID * scale));
  }

  function setHovered(on) {
    hovered = on;
    if (!on || leap || den.state || !arrived) return;
    kit = kit || build();
    clearTimeout(drying);
    kit.stage.style.rotate = getComputedStyle(polaroid).rotate;
    kit.stage.style.display = kit.fly.style.display = 'block';
    leap = { t: LEAP.crouch * 0.7 * ready, off: false, peel: 0, home: null, dir: bearing(), last: performance.now() };
    requestAnimationFrame(leapFrame);
    wake();
  }

  function leapFrame(now) {
    const L = leap, K = kit, dt = Math.min((now - L.last) / 1000, 0.05), landed = LEAP.crouch + LEAP.fly, end = landed + FACE.end;
    L.last = now;
    if (L.home !== null) {
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
      L.off = true;
      fizz.release(true);
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
      if (K.gpu) K.gpu.clear();
      else K.c.clearRect(0, 0, K.W, K.H);
      K.tc.clearRect(0, 0, K.top.width, K.top.height);
      K.halo.style.opacity = 0;
      L.wet = false;
    }
    L.was = on;
    if (L.t <= 0 && !hovered && !flying) {
      K.fly.style.display = 'none';
      leap = null;
      drying = setTimeout(() => { if (!leap && kit === K) K.stage.style.display = 'none'; }, 8000);
      return;
    }
    requestAnimationFrame(leapFrame);
  }

  function layout() {
    const box = table.getBoundingClientRect(), item = dish.getBoundingClientRect();
    if (!item.width) return;
    scale = item.width / 216;
    dpr = Math.min(devicePixelRatio || 1, 2);
    const size = VIEW * scale, px = Math.round(size * dpr);
    const [cx, cy] = middle(item, box), left = cx - size / 2, topAt = cy - size / 2;
    fizz.size(px, px, dpr, scale);
    Object.assign(canvas.style, { width: `${size}px`, height: `${size}px`, left: `${left}px`, top: `${topAt}px` });
    read();
    trail(box, item);
  }

  const SEED = 1 + Math.floor(Math.random() * 1e6);
  function trail(box, item) {
    let seed = SEED;
    const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); };
    const k = item.width / 216, [cx, cy] = middle(item, box);
    const labels = [...table.querySelectorAll('.tag > span, .polaroid-caption')].filter(el => !obj.contains(el)).map(el => {
      const r = el.getBoundingClientRect(), [x, y] = middle(r, box);
      return { x, y, w: r.width, d: Math.hypot(x - cx, y - cy) };
    }).sort((a, b) => a.d - b.d);
    if (!labels.length) return;
    const shapes = [];
    const dot = (x, y, r, stretch = 1, a = 0, o = 1) => shapes.push(
      `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(r * stretch).toFixed(2)}" ry="${r.toFixed(2)}" transform="rotate(${(a * 57.3).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" opacity="${o.toFixed(2)}"/>`);
    const home = labels[0], heading = Math.atan2(home.y - cy, home.x - cx);
    for (let i = 0; i < 26; i++) {
      const a = heading + (rnd() < 0.6 ? rnd(-0.8, 0.8) : rnd(-3.1, 3.1)), r = (RIM + 4 + rnd() ** 2 * 44) * k;
      dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rnd(0.5, 2.1) * k, rnd(1, 2.4), a, rnd(0.5, 1));
    }
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
    labels.slice(1, 3).forEach(l => {
      const a = rnd(0, 6.28), x = l.x + Math.cos(a) * l.w * 0.62, y = l.y + Math.sin(a) * l.w * 0.3 + 10 * k;
      dot(x, y, 3 * k, 1.5, a, 0.6);
      for (let i = 0; i < 6; i++) dot(x + rnd(-13, 13) * k, y + rnd(-9, 9) * k, rnd(0.5, 1.3) * k, 1.3, a, 0.5);
    });
    prints.innerHTML = `<svg width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}">${shapes.join('')}</svg>`;
  }

  function read() {
    const style = getComputedStyle(obj), get = key => parseFloat(style.getPropertyValue(key)) || 0;
    const sx = get('--sx'), sy = get('--sy'), L = Math.hypot(sx, sy);
    if (L) { glow.x = -sx / L; glow.y = -sy / L; }
    const night = root.classList.contains('dark-mode');
    if (glow.night !== null && night !== glow.night && !still) {
      if (night) { blob.sizeV += 1.2; fizz.probe(); nextProbe = fizz.time + 0.7; flash(blob.x, blob.y, 0.9); } else {
        blob.sizeV -= 2.4;
        fizz.release(true);
        for (let i = 0; i < 4; i++) ripple(i * 1.5, 0.9);
      }
    }
    glow.night = night;
    if (kit && kit.filmNight !== night) {
      if (kit.stage.style.display === 'block') paintFilms();
      else dry();
    }
    if (still) glow.n = night ? 1 : 0;
    glow.cast = [sx * 0.7, sy * 0.7, Math.max(get('--sb') * 0.6, 1)];
    glow.touch = [get('--cx') || 0.6, get('--cy') || 0.8, Math.max(get('--cb'), 0.6)];
    glow.shadow = style.getPropertyValue('--shadow').trim() || glow.shadow;
    if (still) fizz.draw();
  }
  new MutationObserver(read).observe(obj, { attributes: true, attributeFilter: ['style'] });
  new ResizeObserver(() => {
    if (kit && !leap) { kit.stage.remove(); kit.fly.remove(); kit = null; }
    layout();
    if (den.out) sizeDen();
    prepare();
  }).observe(table);
  dish.querySelector('img').addEventListener('load', layout);
  addEventListener('load', layout);

  if (still) { step(SUB); layout(); return; }

  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const x = (e.clientX - rect.left) / scale, y = (e.clientY - rect.top) / scale;
    cur.x = x; cur.y = y; cur.at = [e.clientX, e.clientY];
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

  let running = false, seen = true, last = 0, acc = 0;
  function frame(now) {
    if (!arrived || (!seen && !den.out) || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    hear(dt);
    let n = 0;
    while (acc >= SUB && n < 14) { step(SUB); acc -= SUB; n++; }
    if (n === 14) acc = 0;
    const busy = cur.present || leap || ready > 0.01 || den.state || strands.some(s => s.kind !== 'probe') || drops.length;
    fizz.hole = den.out ? underneath() : null;
    if (busy || !(frames++ & 1)) fizz.draw();
  }
  function wake() {
    if (running || !arrived || (!seen && !den.out) || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  new IntersectionObserver(([entry]) => { seen = entry.isIntersecting; if (seen) wake(); }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  layout();
  if (still) arrived = true;
  else {
    canvas.style.opacity = 0;
    fizz.prepare().then(getReady);
    const late = () => setTimeout(arrive, 6000);
    if (document.readyState === 'complete') late();
    else addEventListener('load', late, { once: true });
  }
  wake();
})();