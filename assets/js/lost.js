/* The page that isn't there. The card says so, and says where you were probably going. What's
   under the card only points. */
(function () {
  const { pages, sections } = JSON.parse(document.getElementById('known').textContent);
  const way = document.querySelector('.way');

  // ---- Where you were going ----

  const tidy = url => {
    let path = url;
    try { path = decodeURIComponent(url); } catch (e) { /* Not a real address, but it's still one to compare */ }
    return path.toLowerCase().replace(/\.html?$/, '').replace(/^\/+|\/+$/g, '');
  };
  // How many letters out, a pair the wrong way round being one
  function apart(a, b) {
    let before = null, last = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(last[j] + 1, row[j - 1] + 1, last[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
      }
      before = last;
      last = row;
    }
    return last[b.length];
  }
  // By its whole address or its last part, so that /dishtance finds it on the blog. The address
  // that's been cut short in pasting is the other way to get here.
  function nearest(path) {
    const want = tidy(path), end = want.split('/').pop();
    let best = null, least = Infinity;
    for (const known of pages) {
      const full = tidy(known.url) || 'home', tail = full.split('/').pop();
      const off = Math.min(apart(want, full), apart(end, tail), end.length > 3 && tail.startsWith(end) ? 1 : Infinity);
      if (off < least && off <= Math.min(3, Math.floor(full.length / 3))) { best = known; least = off; }
    }
    return best;
  }
  // Its tab in the bar, if it's one of the bar's places (/blog/x is the blog's). The same rule as
  // _includes/page_section.html.
  function section(url) {
    let id = null;
    for (const s of sections) if (url === s.url || (s.url.endsWith('/') && url.startsWith(s.url))) id = s.id;
    return id;
  }

  const page = nearest(location.pathname);
  if (page && tidy(page.url)) {
    const link = document.createElement('a');
    link.href = page.url;
    link.textContent = page.title;
    way.replaceChildren('You probably want ', link, '.');
  }

  // ---- What's under the card ----

  const item = document.querySelector(`.nav-item[data-page="${(page && section(page.url)) || 'home'}"]`);
  if (!matchMedia('(min-width: 769px) and (prefers-reduced-motion: no-preference)').matches) return;

  const { clamp, rand, SUB } = Fizz;
  const R = 42, CHEEK = 0.2, UNDER = 1.3, WAKE = 0.5, REACH = 1.5, SHY = 120, SETTLE = 1.2;
  const card = document.querySelector('.wrapper');
  // Whatever's showing of it: home is a name at this width, and the rest are icons
  const mark = [...item.children].find(el => el.getBoundingClientRect().width) || item;
  const canvas = document.createElement('canvas');
  const fizz = Fizz({ body: R, most: 4, blend: 'lighter', root: 60, mound: 2.2 });
  const { blob, glow } = fizz;
  const eyes = fizz.eyes();
  const c = canvas.getContext('2d');
  const rise = document.createElement('i');
  const target = { x: 0, y: 0, present: true };
  const cursor = { x: null, y: null, moved: -Infinity };
  let arm = null, dpr = 1, ox = 0, oy = 0, last = 0, acc = 0, peek = 0, lump = 0, age = 0, tapped = -1, nextTap = 0;

  canvas.className = 'fizz';
  canvas.setAttribute('aria-hidden', 'true');
  rise.className = 'rise';
  card.append(rise);
  document.body.append(canvas);
  fizz.mount(canvas);

  // The canvas is on the page, only as big as what's on it, and everything here is measured from
  // its corner
  function fit() {
    const box = card.getBoundingClientRect(), to = item.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    ox = Math.floor(Math.min(box.left, to.left) - 70) + scrollX;
    oy = Math.floor(to.top - 30) + scrollY;
    const w = Math.ceil(Math.max(box.right, to.right) + 70 + scrollX - ox), h = Math.ceil(box.top + R * 3.5 + scrollY - oy);
    canvas.style.left = `${ox}px`;
    canvas.style.top = `${oy}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    fizz.size(Math.round(w * dpr), Math.round(h * dpr), dpr);
  }
  // Across the top of the card, as far towards where it's pointing as it can get
  function perch() {
    const box = card.getBoundingClientRect(), to = item.getBoundingClientRect(), icon = mark.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    return {
      top: box.top,
      box,
      x: clamp(mid + (to.left + to.width / 2 - mid) * 0.5, box.left + R * 1.6, box.right - R * 1.6),
      tx: to.left + to.width / 2,
      ty: icon.bottom + 1,
    };
  }

  function step(dt) {
    fizz.time += dt;
    age += dt;
    fizz.stir(dt);
    const at = perch();
    const near = cursor.x !== null && Math.hypot(cursor.x - at.x, cursor.y - at.top) < SHY && age - cursor.moved < SETTLE;
    peek += ((age > WAKE && !near ? 1 : 0) - peek) * (1 - Math.exp(-dt * 6));
    lump += (1 - lump) * (1 - Math.exp(-dt * 4));
    blob.x = at.x - ox + scrollX;
    blob.y = at.top - oy + scrollY + R * (UNDER + (CHEEK - UNDER) * peek);

    // Twice, every so often, in case you hadn't noticed
    if (arm && arm.state === 'attached') {
      if (!item.classList.contains('pointed')) { item.classList.add('pointed'); nextTap = age + 3; }
      if (age > nextTap) { tapped = age; nextTap = age + rand(4, 8); }
    }
    const since = tapped < 0 ? 1 : age - tapped;
    target.x = at.tx - ox + scrollX;
    target.y = at.ty - oy + scrollY + (since < 0.5 ? 5 * Math.abs(Math.sin(since * Math.PI * 4)) : 0);
    if (age > REACH && !arm) arm = fizz.reach(target, { hold: [0, 0] });
    // What's thin hardly shines, so it's more of an arm by night
    if (arm) arm.vol = glow.night ? 4200 : 1500;
    fizz.move(dt);
    fizz.ebb(dt);
  }

  function look() {
    const at = perch(), x = cursor.x !== null ? cursor.x : arm ? at.tx : at.x + Math.sin(age * 2.6) * R;
    return clamp((x - at.x) / (R * 3), -1, 1) * R * 0.1;
  }
  function frame(now) {
    const dt = Math.min((now - last) / 1000 || SUB, 0.1);
    last = now;
    glow.night = !!document.querySelector('.dark-mode');
    for (acc += dt; acc >= SUB; acc -= SUB) step(SUB);
    fizz.draw();
    if (peek > 0.02) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      fizz.drawEyes(c, eyes, blob.x, blob.y - R * 0.55, R, 0, -1, look(), peek);
    }
    const box = card.getBoundingClientRect();
    rise.style.transform = `translate(${blob.x + ox - scrollX - box.left}px, ${blob.y + oy - scrollY - box.top}px)`;
    rise.style.opacity = lump * (1 + 0.1 * Math.sin(fizz.time * 1.6));
    requestAnimationFrame(frame);
  }

  addEventListener('pointermove', e => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.moved = age;
  }, { passive: true });
  addEventListener('resize', fit);
  fit();
  glow.night = !!document.querySelector('.dark-mode');
  glow.n = glow.night ? 1 : 0;
  requestAnimationFrame(frame);
})();
