/* What's in the Petri dish: Fizz (assets/js/fizz.js), and here's how it lives. It wanders,
   feels the glass, and when a pointer comes close it leans over, climbs out, takes hold of it
   and feeds. Pull hard enough and a tentacle necks and snaps, and what's left crawls home.
   At night it glows, the colour of the ink on the table's labels, which is no coincidence:
   it's been out. And it knows who's in the Polaroid: point at him and see. Its prints, and the
   trail to the nearest of them, only show in the dark. */
(function () {
  const obj = document.getElementById('playground');
  const canvas = document.querySelector('.fizz');
  const prints = document.querySelector('.fizz-prints');
  if (!obj || !canvas || !prints) return;
  const dish = obj.querySelector('.item');
  const table = obj.closest('.table');
  const root = document.documentElement;
  // It's a lot to ask of a phone, so there it just lies in its dish
  const still = matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches;

  // Everything's worked out in units of a dish 216 across, in the middle of a square VIEW
  // across, which is as far as it can reach
  const VIEW = 780, MID = VIEW / 2, WALL = 98, BODY = 50;
  // The outside of the dish's rim; how far off it a bit gathers itself; and how high it's
  // got to get to clear it, about as high as the dish is
  const RIM = 108, TAKEOFF = 13, CLEAR = 26;
  const MAX_STRANDS = 14;
  const P = { reach: 200, awareness: 290, maxStrands: 7 };
  const LIMIT = VIEW / 2 - 52;

  const { clamp, ease, rand, turn, bell, layer, rgb, shine, INK, DARK, SOFT, NP, SUB } = Fizz;
  // Where a box's middle is, from the corner of another
  const middle = (r, box) => [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];

  const ctx = canvas.getContext('2d');

  let scale = 1, dpr = 1, frames = 0;
  const cur = { x: -1e4, y: -1e4, present: false };
  let lastSnap = -1, lastSpawn = -1, lastMicro = -1, nextProbe = 2.2, lastFeel = 6;
  const fizz = Fizz({
    body: BODY, most: MAX_STRANDS, snap: { stretch: 1.75, len: 285 },
    time: still ? 40 : rand(0, 100), flow: rand(0, 50), probeAt: Math.random() * 6.28,
    blob: { x: MID, y: MID, tx: MID, ty: MID, next: 3, grow: still ? 1 : 0.2 },
    area: () => [VIEW, VIEW], bound: glass, parted, stepBit: stepDrop, lit: litGlass,
  });
  const { blob, strands, drops, glow, edge, at, flash, ripple } = fizz;
  fizz.focus = cur;
  fizz.mount(canvas);

  // ---- What it hears ----
  // It lives in that dish; nothing's keeping it there. And it can't stand noise. Earphones in,
  // it starts, tears round the wall to get up speed, lets go at the point where its path runs
  // to the Polaroid, and squeezes in under it. There it stays till they're out: a lump in the
  // photo and a bit of it showing, and by night a glow from under the edge. Then it looks out,
  // thinks about it, and creeps home.
  // Out of the dish it's the same thing, drawn the same way: its canvas just goes with it, and
  // has the Polaroid cut out of it. `den.c` is only for what's on the photo, and the eyes.
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
  // Where everything is, across the table. It goes under by the edge nearest the dish, and not
  // near a corner.
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
    den.canvas.width = Math.round(box.width * s); den.canvas.height = Math.round(box.height * s);
    den.s = s; den.W = box.width; den.H = box.height;
    plot();
  }
  function openDen() {
    if (!den.canvas) {
      den.canvas = layer();
      den.canvas.className = 'fizz-leap';
      den.canvas.setAttribute('aria-hidden', 'true');
      den.c = den.canvas.getContext('2d');
      table.append(den.canvas);
      den.eyes = fizz.eyes();
    }
    sizeDen();
    den.canvas.style.display = 'block';
  }
  // Round the wall, faster and faster, on the glass: it's what's holding it to the curve. The
  // laps come out so that it's going straight for the Polaroid when it's done.
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
    // It goes as the square of how fast it's going, and the thinner it is the nearer the wall
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
      // Let go, nothing's holding it to the curve, and it pulls itself in as it flies
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
      // In heaves, drawing itself up and letting itself go, and it's in no hurry
      den.t += dt;
      const heave = Math.sin(den.t * 5) ** 2;
      den.done += (den.trip / CREEP) * (0.3 + 1.4 * heave) * dt;
      const f = Math.min(den.done / den.trip, 1);
      go(den.rx, den.ry, f);
      den.tilt = Math.atan2(den.ry - den.y0, den.rx - den.x0);
      smear = 0.24 * heave;
      if (den.heard) {
        // That's it, back it goes
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
    // Height's a matter of being a little nearer the eye
    den.lift = 1 + 0.24 * up;
    blob.smear = smear;
    blob.x = blob.tx = blob.y = blob.ty = MID;
    blob.next = fizz.time + 9;
    blob.la = den.tilt;
    canvas.style.translate = `${(den.x - den.dx).toFixed(2)}px ${(den.y - den.dy).toFixed(2)}px`;
    canvas.style.scale = den.lift.toFixed(3);
    paintDen();
  }
  // It's under the Polaroid, so where the Polaroid is there's none of it
  function cutOut() {
    const k = dpr * scale, f = 1 / (scale * den.lift);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    for (const [x, y] of den.quad) ctx.lineTo((x - den.x) * f + MID, (y - den.y) * f + MID);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  function paintDen() {
    const c = den.c, night = glow.night, R = den.R, s = den.s, hideX = den.hx, hideY = den.hy;
    const quad = () => { c.moveTo(...den.quad[0]); for (let i = 1; i < 4; i++) c.lineTo(...den.quad[i]); c.closePath(); };
    c.setTransform(s, 0, 0, s, 0, 0);
    c.clearRect(0, 0, den.W, den.H);
    // Under the photo, it shows as a rise in it, lit on one side
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
      c.beginPath(); c.rect(0, 0, den.W, den.H); quad(); c.clip('evenodd');
      paintEyes(c, den.ex + den.nx * R * 0.2, den.ey + den.ny * R * 0.2, R);
      c.restore();
    }
  }
  // At whoever's there
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

  // ---- What's different in a dish ----

  // Driven against the glass, it's the glass that stops it
  function glass(r, a) {
    if (den.press > 0.01) {
      const dx = blob.x - MID, dy = blob.y - MID, b = dx * Math.cos(a) + dy * Math.sin(a), wall = Math.sqrt(Math.max(b * b - dx * dx - dy * dy + (WALL - 1) ** 2, 0)) - b;
      if (r > wall) r -= (r - wall) * den.press;
    }
    return r;
  }
  // The lit side of the glass, nearest it, inside the rim
  function litGlass(c, level, r) {
    if (den.out) return;
    const near = c.createRadialGradient(blob.x, blob.y, r * 0.6, blob.x, blob.y, WALL * 1.5);
    near.addColorStop(0, `rgba(${INK}, ${(0.5 * level).toFixed(3)})`);
    near.addColorStop(1, `rgba(${INK}, 0)`);
    c.strokeStyle = near;
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(MID, MID, WALL + 4.5, 0, 6.29);
    c.stroke();
  }

  function spawnReach(toward, k) {
    if (strands.length >= MAX_STRANDS - 1) return;
    fizz.reach(cur, { toward, lean: [0, 0.5, -0.5, 0.95, -0.95, 1.35, -1.35][k % 7] });
  }

  // And now and then one goes all the way to the glass, and feels along it for a way out
  function spawnFeeler() {
    const a = fizz.probeAt += rand(1.6, 4.7), s = fizz.sprout('probe', a);
    const [x, y] = at(a);
    const dx = x - MID, dy = y - MID, b = dx * Math.cos(a) + dy * Math.sin(a), c = dx * dx + dy * dy - (WALL - 6) ** 2;
    s.probe = { dist: Math.max(-b + Math.sqrt(Math.max(b * b - c, 0)), 14), dir: Math.random() < 0.5 ? -1 : 1, delay: 0, glide: 70 };
    s.ttl = rand(2.2, 3);
    s.vol = Math.PI * 1.1 * 1.1 * 80;
    strands.push(s);
  }
  // However it came to part, what's left starts over. One's thrown off, as a bit.
  function parted(s, base, tip) {
    const o = (NP - 1) * 2;
    base.retract = tip.retract = 0;
    lastSnap = fizz.time;
    if (drops.length < 6) {
      // However far away it was flung, it lands where it can be seen getting back
      const L = Math.hypot(s.pos[o] - MID, s.pos[o + 1] - MID) || 1, far = Math.min(L, rand(190, 235)) / L;
      const a = Math.atan2(s.pos[o + 1] - MID, s.pos[o] - MID) + rand(-0.3, 0.3);
      const x = MID + Math.cos(a) * L * far, y = MID + Math.sin(a) * L * far;
      drops.push({ x, y, r: rand(2.6, 4.2), t: rand(0, 3), phase: rand(0, 6.28), dx: 1, dy: 0, sq: 1, up: 0, land: 0, step: 0,
        state: 'crawl', outside: Math.hypot(x - MID, y - MID) > RIM, tries: 0 });
    }
  }

  // The dish stands on the table, so a bit that's crawled home has to get back into it: it
  // stops at the foot of the wall, gathers itself, and jumps. Some don't make it the first
  // time, hit the glass, and drop back for another go.
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
      const f = fizz.flight(d, dt);
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
    fizz.stir(dt, 0.25 + 0.45 * Math.max(fizz.aware, ready) + 0.6 * blob.over);
    gone +=((leap && leap.off ? 1 : 0) - gone) * (1 - Math.exp(-dt * 8));
    // Point near him and it's seen where you're going: it gets ready, by as much as you're near
    ready += (nearing - ready) * (1 - Math.exp(-dt * (nearing > ready ? 5 : 3)));
    const winding = leap && !leap.off, coil = winding ? 1 : leap || den.state ? 0 : ready, tense = coil > 0.02;
    // It doesn't care for daylight. By night it spreads out, and it's braver.
    const size = (glow.night ? 1.08 : 0.94) * (1 - 0.24 * coil) * (1 - 0.5 * gone), w = leap || den.state ? 18 : tense ? 10 : 3;
    blob.sizeV += (w * w * (size - blob.size) - w * blob.sizeV) * dt;
    blob.size += blob.sizeV * dt;
    const reach = P.reach * (glow.night ? 1.15 : 1);
    fizz.aware = present && !inside ? ease(P.awareness * (glow.night ? 1.15 : 1), 18, e.d) : 0;

    // Leans, and shifts its weight, towards the pointer. Left alone it sets off somewhere else.
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
    // Winding up: it draws back from where it's going, and holds there, quite still
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
  function paintFilm(el, F) {
    const W = el.width, H = el.height, c = el.getContext('2d'), image = c.createImageData(W, H), px = image.data;
    const [r, g, b] = glow.night ? [130, 200, 140] : [74, 62, 38], most = glow.night ? 0.16 : 0.22;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, v = F[i] - 0.42, a = v > 0 ? 0.5 + 0.5 * bell(v, 0.22) : bell(v, 0.06);
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

  // The specks. Each starts anywhere in the lump and has a place it's making for, in an eye or
  // the grin, and sets off when it sets off: what they make's a matter of where most of them
  // have got to, so it comes up slowly and it's never quite anything. They go on drifting, so
  // it's alive.
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
    // It looks where you're pointing, it shuts its eyes now and then, and it breathes
    const follow = 1 - Math.exp(-dt * 7);
    gaze.x += (gaze.tx - gaze.x) * follow; gaze.y += (gaze.ty - gaze.y) * follow;
    if (fizz.time > K.blink + 0.3) K.blink = fizz.time + rand(3, 7);
    const shut = bell(fizz.time - K.blink, 0.075), breath = 0.88 + 0.12 * Math.sin(fizz.time * 1.25), lookX = gaze.x * 0.1, lookY = gaze.y * 0.08;
    // A breath of light round what's forming, as there's more of it there than anywhere
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

  // Everything's made the first time it's needed, then kept for as long as the window's size is
  function build() {
    const box = table.getBoundingClientRect(), r = polaroid.getBoundingClientRect(), w = polaroid.offsetWidth, h = polaroid.offsetHeight;
    // It doesn't know where the photo stops: the stage is as much bigger than the Polaroid, all
    // round, as the longest run off his face needs, so that nothing ever ends at an edge
    const U = w * HEAD.size, R = U * 1.5, far = R * 2.75, pad = Math.ceil(Math.max(far - w * HEAD.x, far - h * HEAD.y, 0)), sw = w + pad * 2, sh = h + pad * 2;
    const g = 0.5, W = Math.round(sw / g), H = Math.round(sh / g), px = Math.min(devicePixelRatio || 1, 2) * 1.5;
    const stage = document.createElement('div');
    stage.className = 'fizz-face';
    stage.setAttribute('aria-hidden', 'true');
    const [midX, midY] = middle(r, box), turned = getComputedStyle(polaroid).rotate;
    Object.assign(stage.style, { left: `${midX - sw / 2}px`, top: `${midY - sh / 2}px`, width: `${sw}px`, height: `${sh}px`, rotate: turned });
    const skin = layer(W, H), top = layer(Math.round(sw * px), Math.round(sh * px)), film = layer(W, H), mark = layer(W, H);
    const halo = document.createElement('div');
    film.style.opacity = mark.style.opacity = halo.style.opacity = 0;
    stage.append(film, mark, halo, skin, top);
    const fly = layer(Math.round(box.width * Math.min(dpr, 1.5)), Math.round(box.height * Math.min(dpr, 1.5)));
    fly.className = 'fizz-leap';
    table.append(fly, stage);
    const fx = pad + w * HEAD.x, fy = pad + h * HEAD.y, N = W * H, a = (parseFloat(turned) || 0) * Math.PI / 180;
    // At night it lights what's round it. Over a wide area and held for as long as he's pointed
    // at, so it's left to the browser and not drawn every frame.
    Object.assign(halo.style, { position: 'absolute', left: `${fx - U * 3.4}px`, top: `${fy - U * 3.4}px`, width: `${U * 6.8}px`, height: `${U * 6.8}px`, background: 'radial-gradient(closest-side, rgba(190, 236, 165, 0.3), rgba(190, 236, 165, 0.1) 45%, rgba(190, 236, 165, 0))' });
    const ox = fx - sw / 2, oy = fy - sh / 2;
    const c = skin.getContext('2d'), image = c.createImageData(W, H);
    const cx = fx / g, cy = fy / g, lump = buildLump(W, H, cx, cy, U / g), K = { stage, top, fly, c, fc: fly.getContext('2d'), tc: top.getContext('2d'), image, data: new Uint32Array(image.data.buffer), rgba: image.data,
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
    const m = ease(FACE.spread, FACE.gather, t), pull = ease(0, 1, peel), iso = 0.42 + 0.55 * Math.exp(-t * 20) - 0.09 * Math.exp(-t * 6) * Math.cos(t * 17) - 0.025 * m * Math.sin(fizz.time * 1.25) + 0.6 * peel * peel;
    const spreading = t < 0.22, shrink = 1 + 2.4 * pull, zoom = (1 + 2.2 * m) * shrink, solid = m >= 1 && t >= DROPS && !peel;
    // Never still: slow swells going through it, and it's what makes it a liquid
    const wx = K.wx, wy = K.wy, scaleX = K.g / K.U, heave = 0.09 * ease(0.4, 1, m);
    for (let x = 0; x < W; x++) wx[x] = Math.sin(x * scaleX * 2.6 + fizz.time * 1.3) + 0.6 * Math.sin(x * scaleX * 5.1 - fizz.time * 1.9);
    for (let y = 0; y < H; y++) wy[y] = Math.sin(y * scaleX * 2.2 - fizz.time * 1.1) + 0.6 * Math.sin(y * scaleX * 4.7 + fizz.time * 1.7);
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
    paintLump(c, x, y, r, Math.atan2(y - y0, x - x0), 1 + 0.4 * up, z * 14, night);
  }
  // All of it, or most, off the dish: drawn out along the way it's going
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
    if (!on || leap || den.state) return;
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
    const [cx, cy] = middle(item, box), left = cx - size / 2, topAt = cy - size / 2;
    fizz.size(px, px, dpr, scale);
    Object.assign(canvas.style, { width: `${size}px`, height: `${size}px`, left: `${left}px`, top: `${topAt}px` });
    read();
    trail(box, item);
  }

  // Where it's been. In the same ink as the labels, so no one can see it till the lights go
  // out: spatter round the dish, a smear over the rim, and a broken trail, thinning as it
  // gets further from home, to the nearest thing written on the table, and a dab or two by
  // the next. Seeded, so they're where they were after a resize.
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
      if (night) { blob.sizeV += 1.2; fizz.probe(); nextProbe = fizz.time + 0.7; flash(blob.x, blob.y, 0.9); } else {
        blob.sizeV -= 2.4;
        fizz.release(true);
        for (let i = 0; i < 4; i++) ripple(i * 1.5, 0.9);
      }
    }
    glow.night = night;
    // What it's left is still there when the lights change, and looks as it should in the new light
    if (kit && kit.filmNight !== night && kit.stage.style.display === 'block') paintFilms();
    canvas.classList.toggle('shining', night);
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

  // Runs while it can be seen, and at half speed when it's only itself to mind
  let running = false, seen = true, last = 0, acc = 0;
  function frame(now) {
    if ((!seen && !den.out) || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    hear(dt);
    let n = 0;
    while (acc >= SUB && n < 14) { step(SUB); acc -= SUB; n++; }
    if (n === 14) acc = 0;
    const busy = cur.present || leap || ready > 0.01 || den.state || strands.some(s => s.kind !== 'probe') || drops.length;
    if (busy || !(frames++ & 1)) fizz.draw();
    if (den.out) cutOut();
  }
  function wake() {
    if (running || (!seen && !den.out) || document.hidden) return;
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