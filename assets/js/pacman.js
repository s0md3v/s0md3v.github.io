(function () {
  const { clamp, ease, rand, turn, bell, NP, SUB } = Fizz;

  function underThePage(host) {
    const BODY = 90, MAX_STRANDS = 26;
    const REACH_VOL = Math.PI * 3 * 3 * 170;
    const PULL = 15, THRUST = 1500, DRAG = 5;
    const BOLTS = [{ at: 1.6, cut: 0, line: true }, { at: 2.45, cut: 2 }, { at: 3.15, cut: 2 }];
    const MORE = [{ at: 2.8, arms: 2 }, { at: 3.5, arms: 6 }];
    const LEAN = [0.5, -0.5, 0.95, -0.95, 0.2, -0.2, 0.7, -0.7, 1.2, -1.2, 0.35, -0.35];
    const REEL_AT = 4.5;
    const YANK = 0.22;
    // Bits are drawn at 0.7 of the dish's size; HOP stays in the dish's units because that's what swells a bit and lifts its shadow.
    const BIT = 0.7, HOP = 34;
    const CANVAS = 560;

    const UP = -Math.PI / 2;
    const fizz = Fizz({
      body: BODY, most: MAX_STRANDS, bit: BIT, blob: { la: UP, takeAt: UP },
      area: () => [innerWidth, innerHeight], under: 300,
      aside: () => canvas.width / dpr + 100,
      grainAt: (size, S) => [Math.round(blob.x * S - size / 2), Math.round((blob.y - top) * S - size / 2)],
      aims: { line: () => [gag.x, gag.y] },
      haul, parted, stepBit: stepDrop,
    });
    const { blob, strands, drops, tracks, glow, edge, at, flash, ripple } = fizz;
    let meal = null, bait = null, line = null, gag = null;
    let prey = null, sated = 0;
    let canvas = null, dpr = 1, top = 0;
    let last = 0, acc = 0;
    // Pre-draw once by day and by night while unseen: the first draw costs the most and shouldn't land on the bite.
    fizz.prepare().then(on => {
      if (!on) return;
      if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2000 });
      else setTimeout(warm, 500);
    });
    function warm() {
      if (canvas) return;
      canvas = document.createElement('canvas');
      fizz.mount(canvas);
      fit();
      blob.x = innerWidth / 2;
      blob.y = innerHeight - BODY / 2;
      const night = host.night();
      for (const n of [!night, night]) {
        glow.night = n;
        glow.n = n ? 1 : 0;
        fizz.draw();
      }
      canvas = null;
    }

    const rest = () => innerHeight + BODY * 1.2;

    function spawnReach(ready) {
      if (strands.length >= MAX_STRANDS - 1) return;
      const s = fizz.reach(prey, { toward: edge(prey.x, prey.y).a, lean: LEAN[prey.sent++ % LEAN.length], vol: REACH_VOL, hold: [8, 13] }), R = at(s.a, 5);
      if (ready) s.u = clamp((R[1] - innerHeight) / Math.hypot(prey.x - R[0], prey.y - R[1]), 0, 0.6);
    }
    function parted(s) {
      const o = (NP - 1) * 2;
      fling(s.pos[o], s.pos[o + 1], 30, 80);
      fling(s.pos[o], s.pos[o + 1], 30, 80);
      if (s === line) loose();
    }
    function haul(s, Lr, dt) {
      if (s.kind === 'line') Lr = Math.max(40, Lr - (prey.t < YANK ? 260 : 0) * dt);
      if (prey.reeling && s.kind === 'reach') Lr = Math.max(24, Lr - (50 + 300 * ease(0, 1.3, prey.reeling)) * dt);
      return Lr;
    }

    function layLine(to) {
      const s = fizz.sprout('line', UP), [x0, y0] = at(UP, 5);
      s.state = 'attached';
      s.wave = 140;
      s.vol = Math.PI * 0.7 * 0.7 * 200;
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
        const w = 11 * bell(phi, 0.8) + 4 * bell(phi - 1.15, 0.3) + 4.5 * bell(phi + 1, 0.28) + 2 * Math.sin(phi * 3.3 + 1) + 1.1 * Math.sin(phi * 6 + fizz.time * 4) + 16 * pull * bell(phi, 0.26);
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
      if (d.state === 'gag') {
        const mx = Math.sin(prey.face), my = -Math.cos(prey.face);
        d.x = prey.x + mx * (FACE + 11);
        d.y = prey.y + my * (FACE + 11);
        d.r = 8;
        return;
      }
      if (d.y > innerHeight + 6) { d.dead = true; return; }
      fizz.trace(d, dt);
      if (d.state === 'crouch') {
        d.wait -= dt;
        d.sq = 1 + 0.75 * (1 - Math.max(d.wait, 0) / d.crouch) + d.land;
        if (d.wait > 0) return;
        const e = edge(d.x, d.y);
        if (e.d < 4) { d.dead = true; ripple(e.a, 1); return; }
        const far = Math.min(e.d + 8, rand(33, 41) * BIT);
        Object.assign(d, { state: 'air', flight: 0, x0: d.x, y0: d.y, x1: d.x - e.nx * far, y1: d.y - e.ny * far, time: 0.42, dx: -e.nx, dy: -e.ny });
      }
      if (d.state === 'air') {
        const f = fizz.flight(d, dt);
        d.up = HOP * 4 * f * (1 - f);
        d.sq = 1 + 0.5 * Math.abs(1 - 2 * f);
        if (f < 1) return;
        d.up = 0;
        d.state = 'crawl';
        d.land = 1.1;
        d.crawl = rand(0.5, 1.1);
      }
      const e = edge(d.x, d.y), pulse = Math.sin(d.t * 9) ** 2, speed = (34 + 96 * pulse) * BIT, wob = Math.sin(d.t * 11 + d.phase) * 22 * BIT;
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
      if (stuck && t < prey.dashUntil) {
        const tired = (1 - 0.5 * ease(0, 5, t)) * (prey.reeling ? 0.4 : 1) * (t < prey.boltUntil ? 2.6 : 1) * ease(620, 480, Math.hypot(prey.x - blob.x, prey.y - blob.y));
        ax += prey.dx * THRUST * tired;
        ay += prey.dy * THRUST * tired;
        if (!line && !biting) prey.face += turn(Math.atan2(prey.dx, -prey.dy) - prey.face) * (1 - Math.exp(-dt * 26));
      }
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
    function swallow() {
      const a = edge(prey.x, prey.y).a;
      meal = { x: prey.x, y: prey.y, face: prey.face, t: 0, move: prey.move, gone: prey.gone };
      flash(prey.x, prey.y, 1.4);
      prey = null;
      fizz.focus = null;
      sated = fizz.time;
      if (line) { line.kind = 'piece'; line.state = 'recoil'; line = null; }
      if (gag) { drops.splice(drops.indexOf(gag), 1); gag = null; }
      ripple(a, 2);
      ripple(a + 0.9, 1.2);
      ripple(a - 0.9, 1.2);
      fizz.release(true);
    }

    function step(dt) {
      fizz.time += dt;
      fizz.aware += ((prey ? 1 : 0) - fizz.aware) * (1 - Math.exp(-dt * 4));
      fizz.stir(dt);
      if (prey) blob.la += turn(edge(prey.x, prey.y).a - blob.la) * (1 - Math.exp(-dt * 8));
      else blob.take *= Math.exp(-dt * 2.5);
      if (meal) {
        meal.t += dt;
        const k = 1 - Math.exp(-dt * 6);
        meal.x += (blob.x - meal.x) * k;
        meal.y += (blob.y - BODY * 0.25 - meal.y) * k;
        if (meal.t > 0.8) { meal.gone(); meal = null; }
      }
      fizz.ebb(dt);
      if (prey) fight(dt);
      else if (sated) { if (fizz.time - sated > 0.8) blob.ty = rest(); }
      blob.y += (blob.ty - blob.y) * (1 - Math.exp(-dt * (prey ? 7 : 3.5)));
      fizz.move(dt);
    }

    function fit() {
      const height = Math.min(innerHeight, CANVAS);
      dpr = Math.min(devicePixelRatio || 1, 2);
      top = innerHeight - height;
      fizz.size(Math.round(document.documentElement.clientWidth * dpr), Math.round(height * dpr), dpr, 1, top);
      canvas.style.height = `${height}px`;
    }
    function open() {
      glow.night = host.night();
      glow.n = glow.night ? 1 : 0;
      canvas = document.createElement('canvas');
      canvas.className = 'fizz';
      canvas.setAttribute('aria-hidden', 'true');
      fizz.mount(canvas);
      fit();
      addEventListener('resize', fit);
      document.body.append(canvas);
    }
    function close() {
      removeEventListener('resize', fit);
      canvas.remove();
    }
    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      acc += dt;
      let n = 0;
      while (acc >= SUB && n < 14) { step(SUB); acc -= SUB; n++; }
      if (n === 14) acc = 0;
      if (prey) prey.move(prey.x, prey.y, prey.face, 1);
      if (meal) meal.move(meal.x, meal.y, meal.face, 1 - ease(0.1, 0.8, meal.t));
      glow.night = host.night();
      fizz.draw();
      if (bait) { bait.take(); bait = null; }
      if (!prey && !meal && !strands.length && !drops.length && (!tracks.length || !glow.night) && blob.y > rest() - 2) return close();
      requestAnimationFrame(frame);
    }
    function run() {
      open();
      last = performance.now();
      requestAnimationFrame(frame);
    }

    return {
      strike(x, y, chunk, move, freed, gone) {
        blob.x = chunk.x;
        blob.y = blob.ty = rest();
        bait = chunk;
        prey = { x, y, vx: 0, vy: 0, t: 0, face: Math.PI, side: Math.random() < 0.5 ? -1 : 1, nextDash: 0.2, dashUntil: 0, boltUntil: 0, bolts: 0, more: 0, sent: 0, breaks: null, dx: 0, dy: 0, reeling: 0, present: true, freed, move, gone };
        fizz.focus = prey;
        layLine(chunk);
        gag = { x: chunk.x, y: chunk.y, x0: chunk.x, y0: chunk.y, r: chunk.r, r0: chunk.r, t: 0, up: 0, state: 'gag', path: grip };
        drops.push(gag);
        spawnReach(true);
        spawnReach(true);
        run();
      },
    };
  }

  const chart = document.querySelector('.chart');
  if (!chart || !chart.trail) return;
  const pac = chart.querySelector('.pac');
  const face = pac.firstElementChild;
  const header = document.querySelector('header');
  const wide = matchMedia('(min-width: 1160px)');
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  let trail = chart.trail;
  let s = 0;
  let angle = 180;
  const place = () => {
    const p = trail.at(s);
    pac.style.transform = `translate(${p.x}px, ${p.y}px)`;
    face.style.transform = `rotate(${angle}deg)`;
  };

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const still = () => { trail = chart.trail; s = trail.sAtY(14); place(); };
    still();
    chart.addEventListener('trail', still);
    return;
  }

  // Arcade level one: 60.6 px/s for a sprite 13 px across.
  const SPEED = (60.6 / 13) * pac.offsetWidth;

  let food = [];
  let stop = 0;
  let last = 0;
  let frame = 0;
  let taken = false;

  const under = underThePage({
    night: () => !!pac.closest('.dark-mode'),
  });

  const fromBottom = () => document.documentElement.scrollHeight - innerHeight - scrollY;
  const atBottom = () => fromBottom() < 3;
  const top = () => chart.getBoundingClientRect().top;
  const eat = () => {
    for (const bit of food) {
      if (bit.s <= s + 12) bit.el.classList.add('eaten');
    }
  };

  function survey() {
    const y = trail.at(s).y;
    trail = chart.trail;
    const { end } = trail;
    stop = trail.sAtY(end.y - end.height / 2 - 13);
    food = [...trail.bits];
    if (!wide.matches || !mouse.matches) food.push({ el: end.el, s: trail.sAtY(end.y - end.height), y: end.y - end.height });
    s = Math.min(trail.sAtY(y), stop);
    eat();
    place();
  }

  function wanted() {
    const bar = header.getBoundingClientRect();
    const t = top();
    const floor = (bar.top > innerHeight / 2 ? bar.top : innerHeight) - 24 - t;
    const { end } = trail;
    if (end.y - end.height / 2 - 13 <= floor) return stop;
    let next = -Infinity;
    for (const bit of food) {
      if (bit.y <= floor && !bit.el.classList.contains('eaten')) next = Math.max(next, bit.s - 10);
    }
    if (next > -Infinity) return next;
    return trail.sAtY(clamp(trail.at(s).y, Math.min(innerHeight * 0.25 - t, floor), floor));
  }

  const swing = (facing, dt) => {
    angle += (((facing - angle + 540) % 360) - 180) * Math.min(1, dt * 18);
  };

  function walk(time) {
    const dt = Math.min(0.05, (time - last) / 1000 || 0.016);
    last = time;
    const t = top();
    const seenAt = trail.at(s).y + t;
    if (seenAt < -40 || seenAt > innerHeight + 40) {
      s = trail.sAtY(clamp(seenAt, -40, innerHeight + 40) - t);
      eat();
      place();
    }
    const away = clamp(wanted(), trail.sAtY(-40 - t), trail.sAtY(innerHeight + 40 - t)) - s;

    if (Math.abs(away) < 1.5) {
      frame = 0;
      pac.classList.remove('walking');
      if (atBottom() && wide.matches && mouse.matches && !taken) snatch();
      return;
    }

    s += Math.sign(away) * Math.min(Math.abs(away), SPEED * dt);
    const p = trail.at(s);
    swing(Math.atan2(p.dx, -p.dy) * 180 / Math.PI + (away > 0 ? 0 : 180), dt);
    if (away > 0) eat();

    pac.classList.add('walking');
    place();
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
  chart.addEventListener('trail', () => {
    if (taken) return;
    survey();
    wake();
  });
  addEventListener('resize', () => {
    if (taken) return;
    survey();
    wake();
  });

  function snatch() {
    taken = true;
    const box = pac.getBoundingClientRect();
    chart.append(pac);
    const where = chart.getBoundingClientRect();
    const { end } = trail;
    const bait = { x: where.left + end.x, y: where.top + end.y, r: (end.width + end.height) / 4, take: () => end.el.classList.add('eaten') };
    pac.style.position = 'fixed';
    pac.style.left = '0';
    pac.style.top = '0';
    pac.style.transform = `translate(${box.left + box.width / 2}px, ${box.top + box.height / 2}px)`;
    pac.classList.remove('walking');
    under.strike(box.left + box.width / 2, box.top + box.height / 2, bait, (x, y, facing, seen) => {
      pac.style.transform = `translate(${x}px, ${y}px)`;
      pac.style.opacity = seen;
      face.style.transform = `rotate(${facing}rad)`;
    }, () => pac.classList.add('walking'), () => {
      pac.hidden = true;
    });
  }

  const bar = header.getBoundingClientRect().bottom;
  s = trail.sAtY((bar < innerHeight / 2 ? bar : 0) - pac.offsetHeight - 2 - top());
  survey();
  wake();
})();
