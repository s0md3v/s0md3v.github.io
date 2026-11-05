(() => {
  const page = document.querySelector('.experiments-page');
  if (!page) return;

  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  const night = () => root.classList.contains('dark-mode');
  const TAU = Math.PI * 2;
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

  const things = [];
  let raf = 0;
  let last = 0;

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    let awake = false;
    for (const thing of things) {
      if (!thing.seen || !thing.w || !thing.awake) continue;
      thing.awake = thing.step(dt);
      thing.draw();
      if (thing.awake) awake = true;
    }
    if (awake) schedule();
    else last = 0;
  }

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

  let pointer = null;
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    pointer = { x: e.clientX, y: e.clientY, time: e.timeStamp };
    for (const thing of things) if (thing.seen && thing.follow(pointer)) wake(thing);
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    pointer = null;
  });
  window.addEventListener('scroll', () => {
    if (!pointer) return;
    for (const thing of things) if (thing.seen && thing.follow(pointer, true)) wake(thing);
  }, { passive: true });

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

  const glsl = v => `vec3(${v.map(c => c.toFixed(6)).join(', ')})`;
  const GLSL = `#version 300 es
precision highp float;
precision highp int;
const vec3 LIGHT = ${glsl(LIGHT)}, HALF = ${glsl(HALF)};
uniform vec3 u_area;
vec2 px() { return vec2(u_area.x + gl_FragCoord.x, u_area.y + u_area.z - gl_FragCoord.y); }
out vec4 o;
`;
  const QUAD = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1., 0, 1); }`;

  const wanted = [];
  function program(src) {
    const at = new Map();
    const w = { src, p: null, u: n => { if (!at.has(n)) at.set(n, w.gl.getUniformLocation(w.p, n)); return at.get(n); } };
    wanted.push(w);
    return w;
  }

  const GREATEST = program(`
uniform sampler2D u_f;
uniform int u_n;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy) * u_n, size = textureSize(u_f, 0);
  vec4 m = vec4(0);
  for (int j = 0; j < u_n; j++) for (int i = 0; i < u_n; i++) {
    ivec2 k = b + ivec2(i, j);
    if (k.x < size.x && k.y < size.y) m = max(m, abs(texelFetch(u_f, k, 0)));
  }
  o = m;
}`);

  let K = null, asked = false, built = false;
  function kit() {
    // Firefox swaps red and blue when a bitmap is copied from a WebGL canvas
    const OPTS = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true };
    let el = null, gl = null, bitmaps = false;
    try {
      if (window.OffscreenCanvas) {
        el = new OffscreenCanvas(1, 1);
        gl = el.getContext('webgl2', OPTS);
        bitmaps = !!gl;
      }
      if (!gl) {
        el = layer(1, 1);
        gl = el.getContext('webgl2', OPTS);
      }
    } catch (e) { return null; }
    if (!gl) return null;
    const k = { gl, el, lost: false };
    el.addEventListener('webglcontextlost', () => {
      k.lost = true;
      redraw();
    });
    k.quick = gl.getExtension('KHR_parallel_shader_compile');
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, QUAD);
    gl.compileShader(vs);
    k.build = w => {
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, GLSL + w.src);
      gl.compileShader(fs);
      w.gl = gl;
      w.fs = fs;
      w.p = gl.createProgram();
      gl.attachShader(w.p, vs);
      gl.attachShader(w.p, fs);
      gl.linkProgram(w.p);
    };
    k.use = (w, x, y, width, height) => {
      if (el.width < width) el.width = width;
      if (el.height < height) el.height = height;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(w.p);
      gl.uniform3f(w.u('u_area'), x, y, height);
      k.width = width;
      k.height = height;
      return w;
    };
    k.floats = !!gl.getExtension('EXT_color_buffer_float');
    const target = t => {
      if (!t.fb) {
        t.fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        t.complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      } else gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
      return t.complete;
    };
    k.into = (w, t) => {
      target(t);
      gl.useProgram(w.p);
      return w;
    };
    k.clear = (...ts) => {
      gl.clearColor(0, 0, 0, 0);
      return ts.every(t => target(t) && (gl.clear(gl.COLOR_BUFFER_BIT), true));
    };
    k.go = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    k.watch = () => {
      let blocks = null, asked = null;
      const most = k.texture(1, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, null), got = new Float32Array(4);
      let read = null;
      const W = {
        told: null,
        hear() {
          if (asked && gl.clientWaitSync(asked.sync, 0, 0) !== gl.TIMEOUT_EXPIRED) {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, read);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, got);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
            gl.deleteSync(asked.sync);
            W.told = { step: asked.step, most: Array.from(got) };
            asked = null;
          }
        },
        since: step => (W.told && W.told.step > step ? W.told.most : null),
        ask(t, step) {
          if (asked) return;
          const n = Math.ceil(t.w / 8), m = Math.ceil(t.h / 8);
          if (!blocks || blocks.w !== n || blocks.h !== m) blocks = k.texture(n, m, gl.RGBA32F, gl.RGBA, gl.FLOAT, null);
          for (const [from, to, by] of [[t, blocks, 8], [blocks, most, Math.max(n, m)]]) {
            k.into(GREATEST, to);
            k.bind(GREATEST, 'u_f', 0, from);
            gl.uniform1i(GREATEST.u('u_n'), by);
            k.go();
          }
          // created on first read, not before, or it counts as written twice
          if (!read) {
            read = gl.createBuffer();
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, read);
            gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ);
          } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, read);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          asked = { step, sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) };
        },
      };
      return W;
    };
    k.put = (ctx, x, y, w = k.width, h = k.height) => {
      if (!bitmaps) return ctx.drawImage(el, 0, el.height - k.height, k.width, k.height, x, y, w, h);
      const b = el.transferToImageBitmap();
      ctx.drawImage(b, 0, b.height - k.height, k.width, k.height, x, y, w, h);
      b.close();
    };
    k.texture = (w, h, internal, format, type, data, linear) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      const f = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
      Object.assign(t, { w, h, format, type });
      return t;
    };
    k.update = (t, data) => {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, t.w, t.h, t.format, t.type, data);
    };
    k.bind = (w, name, unit, t) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(w.u(name), unit);
    };
    return k;
  }

  function ready() {
    if (built) return true;
    const { gl, quick } = K;
    if (quick && !wanted.every(w => gl.getProgramParameter(w.p, quick.COMPLETION_STATUS_KHR))) return false;
    for (const w of wanted) {
      if (!gl.getProgramParameter(w.p, gl.LINK_STATUS)) {
        if (!gl.isContextLost()) console.warn('The experiments are drawn on canvases, as WebGL failed:', gl.getShaderInfoLog(w.fs) + gl.getProgramInfoLog(w.p));
        K.lost = true;
        return false;
      }
    }
    return (built = true);
  }

  function prepare() {
    if (asked || !wanted.length) return;
    asked = true;
    let since = 0, last = 0, calm = 0, made = false, next = 0;
    const tick = now => {
      if (!made) {
        if (document.readyState === 'complete') {
          since = since || now;
          calm = last && now - last < 20 ? calm + 1 : 0;
          last = now;
          if (calm >= 20 || now - since > 4000) {
            made = true;
            K = kit();
          }
        }
      } else if (!K || K.lost) return;
      else if (next < wanted.length) K.build(wanted[next++]);
      else if (ready()) return redraw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function card() {
    return K && !K.lost && built && !K.gl.isContextLost() ? K : null;
  }

  function redraw() {
    for (const thing of things) if (thing.w) thing.draw(true);
  }

  setUp('soldier', thing => {
    const X0 = -0.65, X1 = 0.79, Y0 = -0.3, Y1 = 0.3;
    const RES = 240;
    const HW = Math.round((X1 - X0) * RES), HH = Math.round((Y1 - Y0) * RES);
    const n = HW * HH;
    const raw = new Float32Array(n);

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

    capsule(-0.2, 0.05, -0.38, 0.08, 0.052, 0, 0.8);
    capsule(-0.38, 0.08, -0.56, 0.1, 0.044, 0, 0.8);
    capsule(-0.2, -0.05, -0.29, -0.2, 0.052, 0, 0.8);
    capsule(-0.29, -0.2, -0.465, -0.175, 0.044, 0, 0.8);
    capsule(-0.565, 0.1, -0.585, 0.15, 0.03, 0.01, 0.9);
    capsule(-0.47, -0.175, -0.49, -0.222, 0.03, 0.01, 0.9);
    dome(-0.15, 0, 0.1, 0.105, 0.07);
    dome(0.03, 0, 0.19, 0.13, 0.085);
    dome(-0.01, 0, 0.11, 0.08, 0.05, 0.065);
    capsule(-0.1, -0.11, -0.1, 0.11, 0.022, 0.035, 0.8);
    capsule(0.15, 0.115, 0.27, 0.185, 0.04, 0.01, 0.85);
    capsule(0.27, 0.185, 0.43, 0.0, 0.034, 0.01, 0.85);
    capsule(0.15, -0.115, 0.25, -0.17, 0.04, 0.01, 0.85);
    capsule(0.25, -0.17, 0.27, -0.06, 0.034, 0.01, 0.85);
    capsule(0.17, -0.05, 0.5, -0.04, 0.022, 0.06, 0.8);
    capsule(0.5, -0.04, 0.75, -0.035, 0.011, 0.06, 0.9);
    dome(0.47, -0.04, 0.018, 0.012, 0.02, 0.075);
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
    const height = blur(blur(raw, 1), 1);
    const cover = blur(solid, 1);
    const shade = blur(solid, 4);
    const wide = blur(blur(solid, 6), 6);
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

    const swirlNoise = valueNoise(41), sheenNoise = valueNoise(47);
    const tone = new Float32Array(n), thin = new Float32Array(n), sheen = new Float32Array(n), hue = new Float32Array(n);
    const hueNoise = valueNoise(53);
    for (let j = 0; j < HH; j++) {
      for (let i = 0; i < HW; i++) {
        const k = i + HW * j;
        const x = i / RES, y = j / RES;
        tone[k] = 0.8 + 0.34 * swirlNoise(x * 9, y * 9 + swirlNoise(x * 4, y * 4) * 2.5);
        hue[k] = (hueNoise(x * 5 + 7, y * 5) - 0.5) * 2;
        thin[k] = 1 - smooth(0.016, 0.034, thick[k]);
        sheen[k] = 0.25 + 1.7 * sheenNoise(x * 7, y * 7) ** 1.5;
      }
    }

    const PX = 0.06;
    const SIZE = 0.42;
    let angle = -0.3, speed = 0, target = -0.3, drawn = NaN;
    let bloodPainted = 0, shown = null;
    const FAR = 0.7;

    const G = 120;
    const pool = new Float32Array(G * G), next = new Float32Array(G * G);
    const rough = new Float32Array(G * G);
    const roughNoise = valueNoise(61);
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const n = 0.65 * roughNoise(i * 0.16, j * 0.16) + 0.35 * roughNoise(i * 0.5 + 30, j * 0.5);
        rough[i + G * j] = 0.06 + 1.9 * smooth(0.3, 0.75, n);
      }
    }
    const SG = SIZE * G;
    const WOUND = [0.03, 0.11];
    let total = 0, bloodChanged = true;
    let deadFor = 0;
    let wx0 = G, wx1 = -1, wy0 = G, wy1 = -1;
    function wetAlso(i0, j0, i1, j1) {
      wx0 = Math.max(0, Math.min(wx0, i0));
      wy0 = Math.max(0, Math.min(wy0, j0));
      wx1 = Math.min(G - 1, Math.max(wx1, i1));
      wy1 = Math.min(G - 1, Math.max(wy1, j1));
    }
    const CAP = 1450, LETHAL = 930;
    let strain = 0;

    function onGrid(lx, ly) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const ex = lx - PX, ey = ly;
      return [G / 2 + (cos * ex - sin * ey) * SG, G / 2 + (sin * ex + cos * ey) * SG];
    }

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
      if (Math.abs(turned) > 0.4 || wx1 < 0) return false;
      const mid = angle - turned / 2, cos = Math.cos(mid), sin = Math.sin(mid);
      const [ui0, ui1, uj0, uj1] = under();
      const i0 = Math.max(ui0, wx0), i1 = Math.min(ui1, wx1), j0 = Math.max(uj0, wy0), j1 = Math.min(uj1, wy1);
      const out = Math.abs(turned) * 0.6;
      next.set(pool);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const a = i + G * j, h = pool[a];
          if (h <= 0.001) continue;
          const rx = i - G / 2, ry = j - G / 2;
          const lx = PX + (cos * rx + sin * ry) / SG, ly = (-sin * rx + cos * ry) / SG;
          const u = ((lx - X0) * RES) | 0, v = ((ly - Y0) * RES) | 0;
          const w = u >= 0 && v >= 0 && u < HW && v < HH ? wide[u + HW * v] : 0;
          if (w < 0.02) continue;
          next[a] -= h;
          const round = 0.35 * turned * w * (1 - smooth(0.35 * SG, 0.6 * SG, Math.hypot(rx, ry))), run = out * w * RUN[a];
          splat(next, i - ry * round + rx * run, j + rx * round + ry * run, h);
        }
      }
      pool.set(next);
      return true;
    }

    function bleed(dt) {
      const K = card(), T = K && filmFor(K);
      if (T) return bleedOnCard(T, dt);
      let changed = carry();
      const [wx, wy] = onGrid(WOUND[0], WOUND[1]);
      const wi = Math.round(wx), wj = Math.round(wy);
      if (total < LETHAL && wi > 2 && wj > 2 && wi < G - 3 && wj < G - 3) {
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
      const now = wx1 < 0 ? [BR, BR, -1, -1] : [Math.floor(wx0 / step), Math.floor(wy0 / step), Math.ceil((wx1 + 1) / step), Math.ceil((wy1 + 1) / step)];
      let x0 = Math.max(0, Math.min(now[0], painted[0])), y0 = Math.max(0, Math.min(now[1], painted[1]));
      let x1 = Math.min(BR - 1, Math.max(now[2], painted[2])), y1 = Math.min(BR - 1, Math.max(now[3], painted[3]));
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
          if (h < 0.04) {
            data[o + 3] = 0;
            continue;
          }
          const hx = sample(x + 1, y) - sample(x - 1, y), hy = sample(x, y + 1) - sample(x, y - 1);
          const slope = Math.hypot(hx, hy) * 0.5 * step + 1e-5;
          const wet = Math.max(0, Math.min(1, 0.5 + (h - 0.08) / slope));
          if (wet <= 0.001) {
            data[o + 3] = 0;
            continue;
          }
          const deep = smooth(0.12, 0.9, h);
          let r = 132 - 80 * deep, g = 16 - 10 * deep, b = 18 - 10 * deep;
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

    const n4 = v => v.toFixed(5);
    const BODY = program(`
uniform sampler2D u_fa, u_fb, u_fc;
uniform vec2 u_turn, u_mid, u_cast;
uniform float u_s, u_shadow;
uniform vec3 u_base;
const vec2 FROM = vec2(${n4(X0)}, ${n4(Y0)}), SIZE = vec2(${HW}, ${HH});
const float RES = ${n4(RES)}, PX = ${n4(PX)};

void main() {
  vec2 d = (px() - u_mid) / u_s;
  float cs = u_turn.x, sn = u_turn.y;
  vec2 l = vec2(PX + cs * d.x + sn * d.y, -sn * d.x + cs * d.y);
  vec2 f = (l - FROM) * RES - .5;
  float c = 0., hue = 0.;
  vec4 A = vec4(0), B = vec4(0);
  if (f.x >= 0. && f.y >= 0. && f.x < SIZE.x - 1. && f.y < SIZE.y - 1.) {
    vec2 uv = (f + .5) / SIZE;
    A = texture(u_fa, uv);
    B = texture(u_fb, uv);
    hue = texture(u_fc, uv).r;
    c = A.x;
  }
  ivec2 si = ivec2((l - u_cast - FROM) * RES);
  float sh = si.x >= 0 && si.y >= 0 && si.x < int(SIZE.x) && si.y < int(SIZE.y) ? texelFetch(u_fc, si, 0).g * u_shadow : 0.;
  if (c <= .002 && sh <= .002) { o = vec4(0); return; }
  if (c <= .002) { o = vec4(0, 0, 0, sh); return; }
  float nl = length(A.yzw);
  vec3 n = A.yzw / (nl > 0. ? nl : 1.);
  vec3 a = vec3(cs * n.x - sn * n.y, sn * n.x + cs * n.y, n.z);
  float diffuse = max(0., dot(a, LIGHT)), facing = max(0., dot(a, HALF));
  float f2 = facing * facing, f4 = f2 * f2, f16 = f4 * f4 * f4 * f4;
  float gloss = (f16 * f2 * .16 + f4 * .035) * B.w;
  float lit = (.4 + .72 * diffuse) * (1. - B.x) * B.y;
  float glow = B.z * (.25 + .5 * diffuse);
  float alpha = c + (1. - c) * sh, tint = hue * lit;
  vec3 col = c * (u_base * lit + vec3(12, 2, -8) * tint + vec3(72, 78, 20) * glow + vec3(255, 255, 230) * gloss);
  o = vec4(clamp(col / alpha, 0., 255.) * alpha / 255., alpha);
}`);
    const BLOOD = program(`
uniform sampler2D u_pool;
uniform float u_dark;
const float G = ${G}., STEP = ${G / (G * 2)};

float at(ivec2 i) { return texelFetch(u_pool, i, 0).r; }
float deep(vec2 x) {
  x = clamp(x, 0., G - 1.001);
  ivec2 i = ivec2(x);
  vec2 t = x - vec2(i);
  return mix(mix(at(i), at(i + ivec2(1, 0)), t.x), mix(at(i + ivec2(0, 1)), at(i + ivec2(1, 1)), t.x), t.y);
}

void main() {
  vec2 x = px() * STEP - .5;
  float h = deep(x);
  if (h < .04) { o = vec4(0); return; }
  float hx = deep(x + vec2(1, 0)) - deep(x - vec2(1, 0)), hy = deep(x + vec2(0, 1)) - deep(x - vec2(0, 1));
  float slope = length(vec2(hx, hy)) * .5 * STEP + 1e-5;
  float wet = clamp(.5 + (h - .08) / slope, 0., 1.);
  if (wet <= .001) { o = vec4(0); return; }
  float thick = smoothstep(.12, .9, h);
  vec3 col = vec3(132, 16, 18) - vec3(80, 10, 10) * thick;
  vec3 n = normalize(vec3(-hx * .9, -hy * .9, 1));
  float diffuse = max(0., dot(n, LIGHT)), facing = max(0., dot(n, HALF));
  float f3 = facing * facing * facing, f6 = f3 * f3, f12 = f6 * f6, f24 = f12 * f12;
  float f90 = f24 * f24 * f24 * f12 * f6;
  float shine = (f90 * 1.4 + f12 * .1) * wet;
  col = col * (.7 + .4 * diffuse) + vec3(255, 240, 235) * shine;
  if (u_dark > 0.) col *= .75;
  o = vec4(clamp(col, 0., 255.) / 255. * wet, wet);
}`);
    let onCard = null;
    function cardFor(K) {
      if (onCard && onCard.K === K) return onCard;
      const gl = K.gl, pack = (...fields) => {
        const out = new Float32Array(4 * n);
        fields.forEach((f, c) => { for (let k = 0; k < n; k++) out[4 * k + c] = f[k]; });
        return K.texture(HW, HH, gl.RGBA16F, gl.RGBA, gl.FLOAT, out, true);
      };
      return (onCard = {
        K, a: pack(cover, nx, ny, nz), b: pack(crease, tone, thin, sheen), c: pack(hue, shade, wide),
        pool: K.texture(G, G, gl.R32F, gl.RED, gl.FLOAT, pool),
      });
    }
    let carded = false;

    const REACH = 6;
    const FILM = `
const float G = ${G}.;
ivec2 here() { return ivec2(gl_FragCoord.xy); }
bool on(ivec2 k) { return k.x >= 0 && k.y >= 0 && k.x < ${G} && k.y < ${G}; }
`;
    const WOUNDED = program(FILM + `
uniform sampler2D u_pool;
uniform vec2 u_at;
uniform ivec2 u_cell;
uniform float u_amount;
void main() {
  ivec2 k = here(), d = k - u_cell;
  vec4 h = texelFetch(u_pool, k, 0);
  vec2 e = vec2(k) - u_at;
  if (abs(d.x) <= 2 && abs(d.y) <= 2) h.r += u_amount * exp(-dot(e, e) / 2.5);
  o = h;
}`);
    const SPREAD = program(FILM + `
uniform sampler2D u_pool, u_paper;
uniform float u_k, u_first;
void main() {
  ivec2 k = here();
  vec2 a = texelFetch(u_pool, k, 0).rg;
  float ra = texelFetch(u_paper, k, 0).r, h = a.x, most = u_first > 0. ? 0. : a.y;
  const ivec2 BY[4] = ivec2[](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
  for (int n = 0; n < 4; n++) {
    ivec2 b = k + BY[n];
    if (!on(b)) continue;
    float hb = texelFetch(u_pool, b, 0).r;
    if (a.x <= .001 && hb <= .001) continue;
    float mean = .5 * (a.x + hb);
    float flow = u_k * min(1., mean * mean * mean) * (a.x - hb) * .5 * (ra + texelFetch(u_paper, b, 0).r);
    h -= flow;
    most = max(most, abs(flow));
  }
  o = vec4(h, most, 0, 0);
}`);
    const MOVE = program(FILM + `
uniform sampler2D u_pool, u_paper, u_fc;
uniform vec2 u_turn;
uniform float u_turned, u_out;
uniform vec4 u_box;
const vec2 FROM = vec2(${n4(X0)}, ${n4(Y0)});
const float RES = ${n4(RES)}, PX = ${n4(PX)}, SG = ${n4(SG)};
const ivec2 SIZE = ivec2(${HW}, ${HH});
void main() {
  ivec2 k = here();
  float h = texelFetch(u_pool, k, 0).r;
  o = vec4(0);
  if (h <= .001 || float(k.x) < u_box.x || float(k.x) > u_box.y || float(k.y) < u_box.z || float(k.y) > u_box.w) return;
  vec2 r = vec2(k) - G / 2.;
  float cs = u_turn.x, sn = u_turn.y;
  ivec2 at = ivec2((vec2(PX + (cs * r.x + sn * r.y) / SG, (-sn * r.x + cs * r.y) / SG) - FROM) * RES);
  float w = at.x >= 0 && at.y >= 0 && at.x < SIZE.x && at.y < SIZE.y ? texelFetch(u_fc, at, 0).b : 0.;
  if (w < .02) return;
  float round_ = .35 * u_turned * w * (1. - smoothstep(.35 * SG, .6 * SG, length(r))), run = u_out * w * texelFetch(u_paper, k, 0).g;
  vec2 by = vec2(-r.y * round_ + r.x * run, r.x * round_ + r.y * run);
  float far = length(by);
  if (far > ${REACH - 1}.) by *= ${REACH - 1}. / far;
  o = vec4(clamp(vec2(k) + by, 0., G - 1.001), h, 0);
}`);
    const GATHER = program(FILM + `
uniform sampler2D u_pool, u_moves;
uniform vec4 u_box;
uniform int u_reach;
void main() {
  ivec2 k = here();
  vec2 p = texelFetch(u_pool, k, 0).rg;
  float h = texelFetch(u_moves, k, 0).z > 0. ? 0. : p.x;
  if (float(k.x) >= u_box.x && float(k.x) <= u_box.y && float(k.y) >= u_box.z && float(k.y) <= u_box.w) {
    for (int j = -u_reach; j <= u_reach; j++) for (int i = -u_reach; i <= u_reach; i++) {
      ivec2 s = k + ivec2(i, j);
      if (!on(s)) continue;
      vec4 q = texelFetch(u_moves, s, 0);
      if (q.z <= 0.) continue;
      vec2 d = abs(q.xy - vec2(k));
      if (d.x < 1. && d.y < 1.) h += q.z * (1. - d.x) * (1. - d.y);
    }
  }
  o = vec4(h, p.y, 0, 0);
}`);

    let film = null, bled = 0, stirredAt = 0;
    function filmFor(K) {
      if (film && film.K === K) return film;
      film = null;
      if (!K.floats) return null;
      const gl = K.gl, field = (internal, format, data) => K.texture(G, G, internal, format, gl.FLOAT, data);
      const deep = new Float32Array(2 * G * G), paper = new Float32Array(2 * G * G);
      for (let k = 0; k < G * G; k++) {
        deep[2 * k] = pool[k];
        paper[2 * k] = rough[k];
        paper[2 * k + 1] = RUN[k];
      }
      const T = {
        K, C: cardFor(K), paper: field(gl.RG32F, gl.RG, paper), moves: field(gl.RGBA32F, gl.RGBA, null),
        pool: { now: field(gl.RG32F, gl.RG, deep), next: field(gl.RG32F, gl.RG, null), swap() { [this.now, this.next] = [this.next, this.now]; } },
      };
      if (!K.clear(T.pool.next, T.moves)) return null;
      T.watch = K.watch();
      return (film = T);
    }
    function spill(T, P, into, set, fields) {
      const { K } = T;
      K.into(P, into);
      Object.entries(fields).forEach(([n, t], i) => K.bind(P, n, i, t));
      set(K.gl, P);
      K.go();
    }

    function carryOnCard(T) {
      const turned = angle - carriedAt;
      if (Math.abs(turned) < 1e-4) return false;
      carriedAt = angle;
      if (Math.abs(turned) > 0.4) return false;
      const mid = angle - turned / 2, [i0, i1, j0, j1] = under();
      spill(T, MOVE, T.moves, (gl, P) => {
        gl.uniform2f(P.u('u_turn'), Math.cos(mid), Math.sin(mid));
        gl.uniform1f(P.u('u_turned'), turned);
        gl.uniform1f(P.u('u_out'), Math.abs(turned) * 0.6);
        gl.uniform4f(P.u('u_box'), i0, i1, j0, j1);
      }, { u_pool: T.pool.now, u_paper: T.paper, u_fc: T.C.c });
      spill(T, GATHER, T.pool.next, (gl, P) => {
        gl.uniform4f(P.u('u_box'), i0 - REACH, i1 + REACH, j0 - REACH, j1 + REACH);
        gl.uniform1i(P.u('u_reach'), REACH);
      }, { u_pool: T.pool.now, u_moves: T.moves });
      T.pool.swap();
      return true;
    }

    function bleedOnCard(T, dt) {
      T.watch.hear();
      bled++;
      let changed = carryOnCard(T);
      const [wx, wy] = onGrid(WOUND[0], WOUND[1]);
      const wi = Math.round(wx), wj = Math.round(wy);
      if (total < LETHAL && wi > 2 && wj > 2 && wi < G - 3 && wj < G - 3) {
        const amount = 5 * (0.3 + 0.7 * (1 - total / CAP)) * (1 + Math.min(4, strain * strain)) * dt;
        for (let j = wj - 2; j <= wj + 2; j++) {
          for (let i = wi - 2; i <= wi + 2; i++) total += amount * Math.exp(-((i - wx) ** 2 + (j - wy) ** 2) / 2.5);
        }
        spill(T, WOUNDED, T.pool.next, (gl, P) => {
          gl.uniform2f(P.u('u_at'), wx, wy);
          gl.uniform2i(P.u('u_cell'), wi, wj);
          gl.uniform1f(P.u('u_amount'), amount);
        }, { u_pool: T.pool.now });
        T.pool.swap();
        changed = true;
      }
      const PASSES = Math.max(8, Math.ceil((dt * 48 * 2) / 0.2));
      const k = (48 * dt * Math.exp(-deadFor / 12)) / PASSES;
      for (let pass = 0; pass < PASSES; pass++) {
        spill(T, SPREAD, T.pool.next, (gl, P) => {
          gl.uniform1f(P.u('u_k'), k);
          gl.uniform1f(P.u('u_first'), pass ? 0 : 1);
        }, { u_pool: T.pool.now, u_paper: T.paper });
        T.pool.swap();
      }
      T.watch.ask(T.pool.now, bled);
      if (changed) stirredAt = bled;
      const told = T.watch.since(stirredAt), most = told ? told[1] : Infinity;
      if (changed || most > 1e-5) bloodChanged = true;
      return changed || most > 4e-5;
    }

    let bodies = null;
    function resize() {
      bodies = [1, 0.5].map(q => {
        const w = Math.round(thing.w * q), h = Math.round(thing.h * q), canvas = layer(w, h);
        return { q, w, h, canvas, image: canvas.getContext('2d').createImageData(w, h), was: null };
      });
      drawn = NaN;
      bloodChanged = true;
    }

    const ox = 0.028, oy = 0.04;
    function where(w, h, s) {
      const cx = w / 2, cy = h / 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [lx, ly] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) {
        const ex = lx - PX, ey = ly;
        const sx = cx + (cos * ex - sin * ey) * s, sy = cy + (sin * ex + cos * ey) * s;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx + ox * s);
        y0 = Math.min(y0, sy); y1 = Math.max(y1, sy + oy * s);
      }
      return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(w, Math.ceil(x1)), Math.min(h, Math.ceil(y1))];
    }

    function paintBody(at) {
      const { w, h, q } = at;
      const data = at.image.data;
      const s = Math.min(thing.w, thing.h) * SIZE * q;
      const cx = w / 2, cy = h / 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const sox = cos * ox + sin * oy, soy = -sin * ox + cos * oy;
      const dark = night();
      const base = dark ? [58, 76, 32] : [70, 92, 38];
      const shadowAlpha = dark ? 0.5 : 0.3;
      const [bx0, by0, bx1, by1] = where(w, h, s);
      if (at.was) {
        const [ax0, ay0, ax1, ay1] = at.was;
        for (let y = ay0; y < ay1; y++) data.fill(0, 4 * (ax0 + w * y), 4 * (ax1 + w * y));
      }
      const dirty = at.was ? [Math.min(bx0, at.was[0]), Math.min(by0, at.was[1]), Math.max(bx1, at.was[2]), Math.max(by1, at.was[3])] : [0, 0, w, h];
      at.was = [bx0, by0, bx1, by1];
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
            let px = blend(nx), py = blend(ny), pz = blend(nz);
            const pl = Math.hypot(px, py, pz) || 1;
            px /= pl; py /= pl; pz /= pl;
            const ax = cos * px - sin * py, ay = sin * px + cos * py, az = pz;
            const diffuse = Math.max(0, ax * LIGHT[0] + ay * LIGHT[1] + az * LIGHT[2]);
            const facing = Math.max(0, ax * HALF[0] + ay * HALF[1] + az * HALF[2]);
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
      const reach = Math.min(thing.w, thing.h) * SIZE * FAR;
      const fast = Math.abs(speed) * reach > 120;
      const turned = !(Math.abs(angle - drawn) * reach < 0.5) || (!fast && shown && shown.q < 1);
      const now = performance.now();
      const due = bloodChanged && (force || now - bloodPainted >= 50);
      if (!force && !turned && !due) return;
      const dark = night();
      const { ctx, w, h } = thing;
      const side = Math.min(w, h);
      const K = card();
      if (K) {
        const C = cardFor(K), gl = K.gl;
        drawn = angle;
        shown = bodies[0];
        if (force || due || (turned && bloodChanged)) {
          const T = film && film.K === K ? film : null;
          if (!T) K.update(C.pool, pool);
          const P = K.use(BLOOD, 0, 0, BR, BR);
          gl.uniform1f(P.u('u_dark'), dark ? 1 : 0);
          K.bind(P, 'u_pool', 0, T ? T.pool.now : C.pool);
          K.go();
          bloodCtx.clearRect(0, 0, BR, BR);
          K.put(bloodCtx, 0, 0);
          bloodChanged = false;
          bloodPainted = now;
          carded = true;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(blood, (w - side) / 2, (h - side) / 2, side, side);
        const s = side * SIZE, [bx0, by0, bx1, by1] = where(w, h, s);
        if (bx1 <= bx0 || by1 <= by0) return;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const P = K.use(BODY, bx0, by0, bx1 - bx0, by1 - by0);
        gl.uniform2f(P.u('u_turn'), cos, sin);
        gl.uniform2f(P.u('u_mid'), w / 2, h / 2);
        gl.uniform2f(P.u('u_cast'), cos * ox + sin * oy, -sin * ox + cos * oy);
        gl.uniform1f(P.u('u_s'), s);
        gl.uniform1f(P.u('u_shadow'), dark ? 0.5 : 0.3);
        gl.uniform3fv(P.u('u_base'), dark ? [58, 76, 32] : [70, 92, 38]);
        K.bind(P, 'u_fa', 0, C.a);
        K.bind(P, 'u_fb', 1, C.b);
        K.bind(P, 'u_fc', 2, C.c);
        K.go();
        K.put(ctx, bx0, by0);
        return;
      }
      if (carded) {
        painted = [0, 0, BR - 1, BR - 1];
        carded = false;
      }
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
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(blood, (w - side) / 2, (h - side) / 2, side, side);
      ctx.drawImage(shown.canvas, 0, 0, w, h);
    }

    function follow(p) {
      const box = thing.canvas.getBoundingClientRect();
      const want = Math.atan2(p.y - (box.top + box.height / 2), p.x - (box.left + box.width / 2));
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
      else if (!fine.matches) {
        phase += dt * 0.35 * (0.3 + 0.7 * left);
        target = -0.3 + Math.sin(phase) * 0.7;
      }
      const pull = 38 * (0.04 + 0.96 * left ** 1.5);
      speed += ((target - angle) * pull - speed * 2 * Math.sqrt(pull)) * dt;
      angle += speed * dt;
      strain += (Math.abs(speed) - strain) * Math.min(1, dt * 2);
      const bleeding = bleed(dt);
      return bleeding || bloodChanged || (left > 0 && !fine.matches) || Math.abs(target - angle) > 0.002 || Math.abs(speed) > 0.002;
    }

    let settled = false;
    function settle() {
      if (settled) return;
      settled = true;
      for (let n = 0; n < 60 * 4; n++) bleed(1 / 60);
    }

    function nudge(row) {
      const words = row.querySelector('.words').getBoundingClientRect();
      follow({ x: words.left + words.width / 2, y: words.top + words.height / 2 });
    }

    return { step, draw, resize, follow, settle, nudge };
  });

  setUp('apple', thing => {
    const streaks = valueNoise(17);
    let R = 0;
    let x = 0, y = 0, vx = 0, vy = 0;
    let home = { x: 0, y: 0 };
    let at = null;
    let m = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
    let ball = null;

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
    turn(1, 0, 0, 0.32);
    turn(0, 1, 0, -0.22);

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
      const q = 0.5, size = Math.ceil(R * q * 2 * Math.sqrt(OUTER2) + 4), canvas = layer(size, size);
      ball = {
        q, size, canvas, image: canvas.getContext('2d').createImageData(size, size),
        inside: new Float32Array(size * size), locals: new Int32Array(size * size),
        from: new Int32Array(size).fill(size), to: new Int32Array(size).fill(-1),
      };
    }

    function skin(qx, qy, qz) {
      const theta = Math.acos(Math.max(-1, Math.min(1, qz)));
      const phi = Math.atan2(qy, qx);
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

    const ALONG = new Float32Array(513);
    for (let n = 0; n <= 512; n++) {
      const t = n / 256 - 1;
      ALONG[n] = 0.95 + 0.06 * t - 0.09 * t * t - 0.2 * Math.exp(-(1 - t) * 14) - 0.1 * Math.exp(-(1 + t) * 16);
    }
    function shapeAt(qx, qy, qz) {
      const f = Math.max(0, Math.min(511.999, (qz + 1) * 256)), i = f | 0;
      let r = ALONG[i] + (f - i) * (ALONG[i + 1] - ALONG[i]);
      const across2 = qx * qx + qy * qy;
      if (across2 > 1e-6) {
        const c = qx / Math.sqrt(across2), c2 = c * c;
        r += 0.025 * c * (16 * c2 * c2 - 20 * c2 + 5) * across2 * (0.6 - 0.4 * qz);
      }
      return r;
    }

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

    const BALL = program(`
uniform mat3 u_m;
uniform float u_r, u_c, u_outer2, u_ambient;
uniform int u_steps;
uniform sampler2D u_colour, u_normal;
const int MAP = ${MAP};

float gap(vec2 d, float d2, float z) {
  float l2 = d2 + z * z, l = sqrt(l2);
  vec3 q = u_m * vec3(d, z);
  float t = clamp(q.z / l, -1., 0.99999);
  float r = .95 + .06 * t - .09 * t * t - .2 * exp(-(1. - t) * 14.) - .1 * exp(-(1. + t) * 16.);
  float across2 = dot(q.xy, q.xy);
  if (across2 > 1e-6 * l2) {
    float c = q.x / sqrt(across2), c2 = c * c;
    r += .025 * c * (16. * c2 * c2 - 20. * c2 + 5.) * (across2 / l2) * (.6 - .4 * q.z / l);
  }
  return r - l;
}

bool meet(vec2 d, out vec3 q) {
  float d2 = dot(d, d);
  if (d2 >= u_outer2) return false;
  float top = sqrt(u_outer2 - d2), stride = max(.05, top / 3.);
  float out_ = top, outGap = 0., z = top, margin = -1.;
  bool known = false;
  for (int n = 0; n < u_steps && z > -top; n++) {
    z -= stride;
    float g = gap(d, d2, z);
    if (g >= 0.) { margin = g; break; }
    out_ = z; outGap = g; known = true;
  }
  if (margin < 0.) return false;
  float into = z, intoGap = margin;
  for (int n = 0; n < 2; n++) {
    float mid = .5 * (out_ + into), g = gap(d, d2, mid);
    if (g >= 0.) { into = mid; intoGap = g; }
    else { out_ = mid; outGap = g; known = true; }
  }
  if (!known) outGap = gap(d, d2, out_);
  q = u_m * vec3(d, out_ + (into - out_) * outGap / (outGap - intoGap));
  return true;
}

ivec2 texel(vec3 q) {
  float s = abs(q.x) + abs(q.y) + abs(q.z);
  vec2 uv = q.xy / (s > 0. ? s : 1.);
  if (q.z < 0.) uv = (1. - abs(uv.yx)) * vec2(uv.x < 0. ? -1. : 1., uv.y < 0. ? -1. : 1.);
  return clamp(ivec2(floor((uv + 1.) * .5 * float(MAP))), 0, MAP - 1);
}

void main() {
  vec2 d = (px() - u_c) / u_r;
  vec3 q;
  bool found = false;
  float l = length(d) * u_r;
  for (int k = 0; k < u_steps / 4 + 1 && !found && (k == 0 || l > float(k)); k++) found = meet(k == 0 ? d : d * (1. - float(k) / l), q);
  if (!found) { o = vec4(0); return; }
  ivec2 t = texel(q);
  vec3 n = texelFetch(u_normal, t, 0).xyz * u_m;
  vec4 c = texelFetch(u_colour, t, 0);
  float diffuse = max(0., dot(n, LIGHT)), facing = max(0., dot(n, HALF));
  float f2 = facing * facing, f4 = f2 * f2, f8 = f4 * f4, f32 = f8 * f8 * f8 * f8;
  float gloss = (f32 * f8 * f4 * .32 + f4 * f2 * .05) * (1. - c.a * .6);
  float lit = (u_ambient + .82 * diffuse) * (1. - .15 * c.a) * (.8 + .2 * n.z);
  o = vec4(clamp(c.rgb * lit + vec3(255, 250, 235) * gloss, 0., 255.) / 255., 1);
}`);
    let onCard = null;
    const turned = new Float32Array(9);

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
        const bend = b0 - 2 * b1 + b2;
        rim[k] = b2 >= 0 && bend < 0 ? b1 - ((b0 - b2) * (b0 - b2)) / (8 * bend) : best;
      }
      return rim;
    }

    function draw(force) {
      if (!force && !moved && rolled * ball.q < 0.5) return;
      const near = !force && !moved && rolled * ball.q < 2;
      rolled = 0;
      const r = R * ball.q;
      moved = false;
      const { ctx, w, h } = thing;
      ctx.clearRect(0, 0, w, h);
      const dark = night();

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
      const cut = put => {
        ctx.save();
        ctx.beginPath();
        const rim = outline();
        for (let k = 0; k < RIM; k++) {
          const a = (k / RIM) * TAU;
          ctx.lineTo(x + Math.cos(a) * rim[k] * R, y + Math.sin(a) * rim[k] * R);
        }
        ctx.closePath();
        ctx.clip();
        put(x - c / ball.q, y - c / ball.q, size / ball.q, size / ball.q);
        ctx.restore();
      };
      const K = card();
      if (K) {
        const gl = K.gl;
        if (!onCard || onCard.K !== K) {
          onCard = {
            K, colour: K.texture(MAP, MAP, gl.RGBA32F, gl.RGBA, gl.FLOAT, maps.colour),
            normal: K.texture(MAP, MAP, gl.RGB32F, gl.RGB, gl.FLOAT, maps.normal),
          };
        }
        const P = K.use(BALL, 0, 0, size, size);
        turned.set(m);
        gl.uniformMatrix3fv(P.u('u_m'), false, turned);
        gl.uniform1f(P.u('u_r'), r);
        gl.uniform1f(P.u('u_c'), c);
        gl.uniform1f(P.u('u_outer2'), OUTER2);
        gl.uniform1f(P.u('u_ambient'), dark ? 0.24 : 0.32);
        gl.uniform1i(P.u('u_steps'), 8);
        K.bind(P, 'u_colour', 0, onCard.colour);
        K.bind(P, 'u_normal', 1, onCard.normal);
        K.go();
        cut((dx, dy, dw, dh) => K.put(ctx, dx, dy, dw, dh));
        return;
      }
      const { inside, locals, from, to } = ball;
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
      inside.fill(0);
      for (let py = 0; py < size; py++) {
        const dy = (py + 0.5 - c) / r;
        for (let px = lo[py]; px <= hi[py]; px++) {
          const dx = (px + 0.5 - c) / r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= OUTER2) continue;
          const top = Math.sqrt(OUTER2 - d2);
          const stride = Math.max(0.05, top / 3);
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
          const q = 3 * locals[k], nm = maps.normal;
          const nx = m[0] * nm[q] + m[1] * nm[q + 1] + m[2] * nm[q + 2];
          const ny = m[3] * nm[q] + m[4] * nm[q + 1] + m[5] * nm[q + 2];
          const nz = m[6] * nm[q] + m[7] * nm[q + 1] + m[8] * nm[q + 2];
          const t = 4 * locals[k];
          const col = maps.colour;
          const r = col[t], gg = col[t + 1], b = col[t + 2], hollow = col[t + 3];
          const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const facing = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
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
      cut((dx, dy, dw, dh) => ctx.drawImage(ball.canvas, dx, dy, dw, dh));
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
      const v = Math.hypot(vx, vy);
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

    const follow = () => true;

    function nudge() {
      vx += R * 3;
    }

    return { step, draw, resize, follow, settle() {}, nudge };
  });

  setUp('water', thing => {
    const N = 100;
    const S = N + 2;
    // Cell counts below were tuned for a 120-wide grid; G rescales them
    const G = N / 120;
    const cells = S * S;

    const edge = a => 0.43 * (1 + 0.045 * Math.sin(3 * a + 1.2) + 0.035 * Math.sin(5 * a + 2.3) + 0.02 * Math.sin(8 * a + 0.4));
    const SQUASH = 0.97;
    let widest = 0;
    for (let k = 0; k < 720; k++) widest = Math.max(widest, edge((k / 720) * TAU));
    const CELL = (2 * widest) / (N - 4);
    const BOX = 0.5 - (N / 2) * CELL;

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
    let uncarried = 0, carryNext = false;
    let unfaded = 0;
    let changed = true;
    let swept = true;
    let flowing = false, rippling = false;
    const STOPPED = 0.2 * G, FLAT = 0.01;

    const tiny = layer(N, N);
    const tinyCtx = tiny.getContext('2d');
    const tinyImage = tinyCtx.createImageData(N, N);
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
        flow: (Math.PI * size * size) / 0.5, ink: INKS[pick], strength: 0.9 + random() * 0.7,
      });
      ripple(drops[drops.length - 1].x, drops[drops.length - 1].y, 1.6, 2.2);
    }

    function ripple(x, y, by, spread) {
      rippling = true;
      changed = true;
      const reach = 5 * G;
      spread *= G * G;
      if (onCard) return splashes.push([x, y, by, spread]);
      for (let j = Math.max(1, Math.floor(y - reach)); j <= Math.min(N, y + reach); j++) {
        for (let i = Math.max(1, Math.floor(x - reach)); i <= Math.min(N, x + reach); i++) {
          wave[i + S * j] -= inside[i + S * j] * by * Math.exp(-((i - x) ** 2 + (j - y) ** 2) / spread);
        }
      }
    }

    function slopeX(f, k) {
      return (inside[k + 1] ? f[k + 1] : f[k]) - (inside[k - 1] ? f[k - 1] : f[k]);
    }
    function slopeY(f, k) {
      return (inside[k + S] ? f[k + S] : f[k]) - (inside[k - S] ? f[k - S] : f[k]);
    }

    const SIM = `
uniform sampler2D u_cell;
const float N = ${N}., G = ${G.toFixed(6)};
const int S = ${S};
ivec2 here() { return ivec2(gl_FragCoord.xy); }
vec4 info(ivec2 k) { return texelFetch(u_cell, k, 0); }
bool water(ivec2 k) { return info(k).x > 0.; }
bool from_(out ivec2 k) {
  k = here();
  float c = info(k).w;
  if (water(k)) return true;
  if (c == 0.) return false;
  k += c == 1. ? ivec2(-1, 0) : c == 2. ? ivec2(1, 0) : c == 3. ? ivec2(0, -1) : ivec2(0, 1);
  return true;
}
vec4 at(sampler2D f, ivec2 k) { return texelFetch(f, k, 0); }
vec4 between(sampler2D f, vec2 x) {
  x = clamp(x, .5, N + .5);
  ivec2 i = ivec2(x);
  vec2 t = x - vec2(i);
  return mix(mix(at(f, i), at(f, i + ivec2(1, 0)), t.x), mix(at(f, i + ivec2(0, 1)), at(f, i + ivec2(1, 1)), t.x), t.y);
}
vec2 slope(sampler2D f, ivec2 k) {
  float h = at(f, k).x;
  ivec2 X = ivec2(1, 0), Y = ivec2(0, 1);
  return vec2((water(k + X) ? at(f, k + X).x : h) - (water(k - X) ? at(f, k - X).x : h), (water(k + Y) ? at(f, k + Y).x : h) - (water(k - Y) ? at(f, k - Y).x : h));
}
`;
    const MOST = 8;
    const SPLASH = program(SIM + `
uniform sampler2D u_waves;
uniform vec4 u_drop[${MOST}];
uniform int u_count;
uniform float u_reach;
void main() {
  ivec2 k = here();
  vec4 w = at(u_waves, k);
  vec2 p = vec2(k);
  if (water(k)) for (int n = 0; n < u_count; n++) {
    vec4 d = u_drop[n];
    if (p.x < floor(d.x - u_reach) || p.x > d.x + u_reach || p.y < floor(d.y - u_reach) || p.y > d.y + u_reach) continue;
    vec2 e = p - d.xy;
    w.x -= d.z * exp(-dot(e, e) / d.w);
  }
  o = w;
}`);
    const STIR = program(SIM + `
uniform sampler2D u_vel;
uniform float u_keep, u_stirring, u_reach, u_wide;
uniform vec4 u_stir;
void main() {
  ivec2 k = here();
  if (!water(k)) { o = vec4(0); return; }
  vec2 v = at(u_vel, k).xy * u_keep, p = vec2(k);
  if (u_stirring > 0. && p.x >= floor(u_stir.x - u_reach) && p.x <= u_stir.x + u_reach && p.y >= floor(u_stir.y - u_reach) && p.y <= u_stir.y + u_reach) {
    vec2 e = p - u_stir.xy;
    v += u_stir.zw * exp(-dot(e, e) / u_wide);
  }
  o = vec4(v, 0, 0);
}`);
    const ADVECT = program(SIM + `
uniform sampler2D u_vel;
uniform float u_dt;
void main() {
  ivec2 k = here();
  o = water(k) ? vec4(between(u_vel, vec2(k) - u_dt * at(u_vel, k).xy).xy, 0, 0) : vec4(0);
}`);
    const DIVERGE = program(SIM + `
uniform sampler2D u_vel;
void main() {
  ivec2 k = here(), X = ivec2(1, 0), Y = ivec2(0, 1);
  o = water(k) ? vec4(-.5 * (at(u_vel, k + X).x - at(u_vel, k - X).x + at(u_vel, k + Y).y - at(u_vel, k - Y).y), 0, 0, 0) : vec4(0);
}`);
    const PRESS = program(SIM + `
uniform sampler2D u_p, u_div;
uniform int u_parity;
void main() {
  ivec2 k = here(), X = ivec2(1, 0), Y = ivec2(0, 1);
  float p = at(u_p, k).x;
  if (water(k) && ((k.x + k.y) & 1) == u_parity) p = (at(u_div, k).x + at(u_p, k - X).x + at(u_p, k + X).x + at(u_p, k - Y).x + at(u_p, k + Y).x) * info(k).y;
  o = vec4(p, 0, 0, 0);
}`);
    const UNSQUEEZE = program(SIM + `
uniform sampler2D u_vel, u_p;
float p(ivec2 k, float h) { return water(k) ? at(u_p, k).x : h; }
void main() {
  ivec2 k = here(), X = ivec2(1, 0), Y = ivec2(0, 1);
  if (!water(k)) { o = vec4(0); return; }
  float h = at(u_p, k).x;
  o = vec4(at(u_vel, k).xy - .5 * vec2(p(k + X, h) - p(k - X, h), p(k + Y, h) - p(k - Y, h)), 0, 0);
}`);
    const COURSE = program(SIM + `
uniform sampler2D u_vel, u_waves;
uniform float u_rippling;
uniform vec4 u_drop[${MOST}];
uniform int u_count;
void main() {
  ivec2 k = here();
  if (!water(k)) { o = vec4(0); return; }
  vec2 c = at(u_vel, k).xy;
  if (u_rippling > 0.) {
    vec4 w = at(u_waves, k);
    c -= 20. * G * G * (w.x - w.y) * slope(u_waves, k);
  }
  for (int n = 0; n < u_count; n++) {
    vec2 d = vec2(k) - u_drop[n].xy;
    c += d * u_drop[n].z / max(1.44 * G * G, dot(d, d));
  }
  o = vec4(c, 0, 0);
}`);
    const WELL = program(SIM + `
uniform sampler2D u_ink;
uniform vec4 u_drop[${MOST}], u_tint[${MOST}];
uniform int u_count;
void main() {
  ivec2 k = here();
  vec4 c = at(u_ink, k);
  if (water(k)) for (int n = 0; n < u_count; n++) {
    vec2 d = vec2(k) - u_drop[n].xy;
    float d2 = dot(d, d), core = u_drop[n].z;
    if (d2 >= core * core) continue;
    c.rgb += (u_tint[n].rgb - c.rgb) * min(1., (core - max(1.2 * G, sqrt(d2))) * .8 / G);
  }
  o = c;
}`);
    const THERE = program(SIM + `
uniform sampler2D u_old, u_course;
uniform float u_dt;
void main() {
  ivec2 k;
  o = from_(k) ? between(u_old, vec2(k) - u_dt * at(u_course, k).xy) : vec4(0);
}`);
    const BACK = program(SIM + `
uniform sampler2D u_old, u_there, u_course;
uniform float u_dt;
void main() {
  ivec2 k;
  o = from_(k) ? 1.5 * at(u_old, k) - .5 * between(u_there, vec2(k) + u_dt * at(u_course, k).xy) : vec4(0);
}`);
    const CARRY = program(SIM + `
uniform sampler2D u_old, u_back, u_course;
uniform float u_dt, u_fade;
void main() {
  ivec2 k;
  if (!from_(k)) { o = vec4(0); return; }
  vec2 x = clamp(vec2(k) - u_dt * at(u_course, k).xy, .5, N + .5);
  ivec2 i = ivec2(x);
  vec4 a = at(u_old, i), b = at(u_old, i + ivec2(1, 0)), c = at(u_old, i + ivec2(0, 1)), d = at(u_old, i + ivec2(1, 1));
  o = u_fade * max(min(min(a, b), min(c, d)), min(max(max(a, b), max(c, d)), between(u_back, x)));
}`);
    const FADE = program(SIM + `
uniform sampler2D u_ink;
uniform float u_fade;
void main() { o = at(u_ink, here()) * u_fade; }`);
    const WAVES = program(SIM + `
uniform sampler2D u_waves;
void main() {
  ivec2 k = here(), X = ivec2(1, 0), Y = ivec2(0, 1);
  if (!water(k)) { o = vec4(0); return; }
  vec2 w = at(u_waves, k).xy;
  float h = w.x;
  float around = (water(k - X) ? at(u_waves, k - X).x - h : 0.) + (water(k + X) ? at(u_waves, k + X).x - h : 0.) + (water(k - Y) ? at(u_waves, k - Y).x - h : 0.) + (water(k + Y) ? at(u_waves, k + Y).x - h : 0.);
  o = vec4((2. * h - w.y + .32 * G * G * around) * info(k).z, h, 0, 0);
}`);
    const MEASURE = program(SIM + `
uniform sampler2D u_vel, u_waves;
void main() {
  ivec2 k = here();
  if (!water(k)) { o = vec4(0); return; }
  vec2 v = abs(at(u_vel, k).xy), w = at(u_waves, k).xy, n = abs(20. * G * G * (w.x - w.y) * slope(u_waves, k));
  o = vec4(max(v.x, v.y), max(n.x, n.y), max(abs(w.x), abs(w.y)), 0);
}`);

    const CELLS = new Float32Array(4 * cells);
    for (let k = 0; k < cells; k++) {
      CELLS[4 * k] = inside[k];
      CELLS[4 * k + 1] = shared[k];
      CELLS[4 * k + 2] = calm[k];
    }
    pastCells.forEach((k, n) => { CELLS[4 * k + 3] = [-1, 1, -S, S].indexOf(pastFrom[n] - k) + 1; });

    let sim = null, steps = 0, stirredAt = 0, rippledAt = 0, onCard = false;
    const splashes = [];
    function simFor(K) {
      if (sim && sim.K === K) return sim;
      sim = null;
      if (!K.floats) return null;
      const gl = K.gl, T = { K };
      const field = (internal, format, data) => K.texture(S, S, internal, format, gl.FLOAT, data);
      const both = (internal, format, data) => ({ now: field(internal, format, data), next: field(internal, format, null), swap() { [this.now, this.next] = [this.next, this.now]; } });
      const mix = (n, ...fs) => {
        const out = new Float32Array(n * cells);
        fs.forEach((f, c) => { for (let k = 0; k < cells; k++) out[n * k + c] = f[k]; });
        return out;
      };
      T.cell = K.texture(S, S, gl.RGBA32F, gl.RGBA, gl.FLOAT, CELLS);
      T.vel = both(gl.RG32F, gl.RG, mix(2, u, v));
      T.p = both(gl.R32F, gl.RED, p);
      T.div = field(gl.R32F, gl.RED, null);
      T.course = field(gl.RG32F, gl.RG, null);
      T.ink = both(gl.RGBA32F, gl.RGBA, mix(4, ...ink));
      T.there = field(gl.RGBA32F, gl.RGBA, null);
      T.back = field(gl.RGBA32F, gl.RGBA, null);
      T.waves = both(gl.RG32F, gl.RG, mix(2, wave, was));
      T.stats = field(gl.RGBA32F, gl.RGBA, null);
      if (!K.clear(T.vel.next, T.p.next, T.div, T.course, T.ink.next, T.there, T.back, T.waves.next, T.stats)) return null;
      T.watch = K.watch();
      return (sim = T);
    }

    function pass(T, P, into, set, fields) {
      const { K } = T, gl = K.gl;
      K.into(P, into);
      K.bind(P, 'u_cell', 0, T.cell);
      Object.entries(fields).forEach(([n, t], i) => K.bind(P, n, i + 1, t));
      if (set) set(gl, P);
      K.go();
    }

    const told = (T, since) => {
      const m = T.watch.since(since);
      return m && { fastest: m[0], nudging: m[1], highest: m[2] };
    };

    function stepOnCard(T, dt, spreading, wells) {
      T.watch.hear();
      steps++;
      const keep = 1 - 0.5 * dt;
      while (splashes.length) {
        const some = splashes.splice(0, MOST);
        pass(T, SPLASH, T.waves.next, (gl, P) => {
          gl.uniform4fv(P.u('u_drop'), some.flat());
          gl.uniform1i(P.u('u_count'), some.length);
          gl.uniform1f(P.u('u_reach'), 5 * G);
        }, { u_waves: T.waves.now });
        T.waves.swap();
        rippledAt = steps;
      }
      const heard = told(T, stirredAt);
      if (!stir && flowing && heard && heard.fastest * keep < STOPPED) {
        T.K.clear(T.vel.now, T.vel.next, T.p.now, T.p.next);
        flowing = false;
      } else if (stir || flowing) {
        pass(T, STIR, T.vel.next, (gl, P) => {
          gl.uniform1f(P.u('u_keep'), flowing ? keep : 1);
          gl.uniform1f(P.u('u_stirring'), stir ? 1 : 0);
          gl.uniform1f(P.u('u_reach'), 7 * G);
          gl.uniform1f(P.u('u_wide'), 10 * G * G);
          if (stir) gl.uniform4f(P.u('u_stir'), stir.x, stir.y, stir.dx, stir.dy);
        }, { u_vel: T.vel.now });
        T.vel.swap();
        if (stir) stirredAt = steps;
        stir = null;
        flowing = true;
        pass(T, ADVECT, T.vel.next, (gl, P) => gl.uniform1f(P.u('u_dt'), dt), { u_vel: T.vel.now });
        T.vel.swap();
        pass(T, DIVERGE, T.div, null, { u_vel: T.vel.now });
        for (let n = 0; n < 12; n++) {
          pass(T, PRESS, T.p.next, (gl, P) => gl.uniform1i(P.u('u_parity'), n & 1), { u_p: T.p.now, u_div: T.div });
          T.p.swap();
        }
        pass(T, UNSQUEEZE, T.vel.next, null, { u_vel: T.vel.now, u_p: T.p.now });
        T.vel.swap();
      }

      if (spreading) {
        pass(T, WELL, T.ink.next, (gl, P) => {
          gl.uniform4fv(P.u('u_drop'), wells.flatMap(d => [d.x, d.y, d.core, 0]));
          gl.uniform4fv(P.u('u_tint'), wells.flatMap(d => [...d.tint, 0]));
          gl.uniform1i(P.u('u_count'), wells.length);
        }, { u_ink: T.ink.now });
        T.ink.swap();
        changed = true;
      }
      uncarried += dt;
      unfaded += dt;
      carryNext = !carryNext;
      if (carryNext) {
        const nudged = told(T, rippledAt);
        if (flowing || spreading || (rippling && !(nudged && nudged.nudging <= 0.02 * G))) {
          pass(T, COURSE, T.course, (gl, P) => {
            gl.uniform1f(P.u('u_rippling'), rippling ? 1 : 0);
            if (wells.length) gl.uniform4fv(P.u('u_drop'), wells.flatMap(d => [d.x, d.y, d.out, 0]));
            gl.uniform1i(P.u('u_count'), wells.length);
          }, { u_vel: T.vel.now, u_waves: T.waves.now });
          const set = (gl, P) => {
            gl.uniform1f(P.u('u_dt'), uncarried);
            gl.uniform1f(P.u('u_fade'), Math.exp(-unfaded / 50));
          };
          pass(T, THERE, T.there, set, { u_old: T.ink.now, u_course: T.course });
          pass(T, BACK, T.back, set, { u_old: T.ink.now, u_there: T.there, u_course: T.course });
          pass(T, CARRY, T.ink.next, set, { u_old: T.ink.now, u_back: T.back, u_course: T.course });
          T.ink.swap();
          unfaded = 0;
          changed = true;
        } else if (unfaded >= 0.25) {
          pass(T, FADE, T.ink.next, (gl, P) => gl.uniform1f(P.u('u_fade'), Math.exp(-unfaded / 50)), { u_ink: T.ink.now });
          T.ink.swap();
          unfaded = 0;
          changed = true;
        }
        uncarried = 0;
      }

      if (rippling) {
        changed = true;
        pass(T, WAVES, T.waves.next, null, { u_waves: T.waves.now });
        T.waves.swap();
        const heard = told(T, rippledAt);
        if (heard && heard.highest < FLAT) {
          T.K.clear(T.waves.now, T.waves.next);
          rippling = false;
        }
      }
      if (flowing || rippling) {
        pass(T, MEASURE, T.stats, null, { u_vel: T.vel.now, u_waves: T.waves.now });
        T.watch.ask(T.stats, steps);
      }
      return true;
    }

    function step(dt) {
      const K = card(), T = K && simFor(K);
      if (onCard && !T) splashes.length = 0;
      onCard = !!T;
      clock += dt;
      if (clock >= due) {
        letFall();
        due = clock + (clock < 3 ? 0.9 : 2.5 + random() * 4.5);
      }
      if (T) {
        let spreading = false;
        const wells = [];
        for (const drop of drops) {
          drop.age += dt;
          const q = drop.flow * Math.exp(-drop.age / 0.5);
          if (q < G * G) continue;
          spreading = true;
          const spread = drop.flow * 0.5 * (1 - Math.exp(-drop.age / 0.5));
          wells.push({ x: drop.x, y: drop.y, core: Math.sqrt(spread / Math.PI) * 0.8, out: q / TAU, tint: drop.ink.map(c => c * drop.strength) });
        }
        while (drops.length && drops[0].age > 4) drops.shift();
        return stepOnCard(T, dt, spreading, wells.slice(0, MOST));
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

    let paper = null;
    function wetPaper() {
      const probe = document.createElement('span');
      probe.style.color = getComputedStyle(root).getPropertyValue('--background-color') || '#f4f1ea';
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
      probe.remove();
      return rgb.map(c => c * 0.94);
    }

    function paintOverlay(dark) {
      const { w } = thing;
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

    const SURFACE = program(`
uniform sampler2D u_ink, u_waves, u_cell;
uniform vec3 u_base, u_paper;
uniform float u_dark, u_rippling;
const float N = ${N}., G = ${G.toFixed(6)};

bool water(ivec2 k) { return texelFetch(u_cell, k, 0).x > 0.; }
float wave(ivec2 k) { return texelFetch(u_waves, k, 0).x; }
float slope(ivec2 k, ivec2 by) {
  float h = wave(k);
  return (water(k + by) ? wave(k + by) : h) - (water(k - by) ? wave(k - by) : h);
}

void main() {
  ivec2 k = ivec2(px()) + 1;
  if (!water(k)) { o = vec4(0); return; }
  float gx = 0., gy = 0.;
  ivec2 sk = k;
  if (u_rippling > 0.) {
    gx = slope(k, ivec2(1, 0)) * G;
    gy = slope(k, ivec2(0, 1)) * G;
    sk = ivec2(clamp(floor(vec2(k) + vec2(gx, gy) * 5. * G + .5), 1., N));
    if (!water(sk)) sk = k;
  }
  vec3 ink = texelFetch(u_ink, sk, 0).rgb;
  vec3 c = u_base * exp(-ink);
  if (u_dark > 0.) {
    float cover = 1. - exp(-(ink.r + ink.g + ink.b) * .9);
    c = u_paper * (1. - cover) + c * .7 * cover;
  }
  if (u_rippling > 0.) {
    float tilt = -(gx * .55 + gy * .65);
    c = c * (1. + tilt * .6) + pow(max(0., tilt), 2.) * (u_dark > 0. ? 200. : 300.);
  }
  o = vec4(clamp(c, 0., 255.) / 255., 1);
}`);
    let shown = null;
    function shownFor(K) {
      if (shown && shown.K === K) return shown;
      const gl = K.gl;
      return (shown = {
        K, cell: K.texture(S, S, gl.RGBA32F, gl.RGBA, gl.FLOAT, CELLS),
        ink: K.texture(S, S, gl.RGBA32F, gl.RGBA, gl.FLOAT, null), waves: K.texture(S, S, gl.R32F, gl.RED, gl.FLOAT, null),
        inks: new Float32Array(4 * cells),
      });
    }

    function draw(force) {
      const { ctx, w } = thing;
      if (!shape || (!force && !changed)) return;
      changed = false;
      const dark = night();
      if (force || !paper) paper = wetPaper();
      if (force || !overlay) paintOverlay(dark);
      const K = card();
      if (K) {
        const gl = K.gl;
        let fields = onCard && sim && sim.K === K ? { cell: sim.cell, ink: sim.ink.now, waves: sim.waves.now } : null;
        if (!fields) {
          const C = shownFor(K), [r, g, b] = ink;
          for (let k = 0; k < cells; k++) {
            C.inks[4 * k] = r[k];
            C.inks[4 * k + 1] = g[k];
            C.inks[4 * k + 2] = b[k];
          }
          K.update(C.ink, C.inks);
          if (rippling) K.update(C.waves, wave);
          fields = C;
        }
        const P = K.use(SURFACE, 0, 0, N, N);
        gl.uniform3fv(P.u('u_base'), dark ? [236, 234, 228] : paper);
        gl.uniform3fv(P.u('u_paper'), paper);
        gl.uniform1f(P.u('u_dark'), dark ? 1 : 0);
        gl.uniform1f(P.u('u_rippling'), rippling ? 1 : 0);
        K.bind(P, 'u_ink', 0, fields.ink);
        K.bind(P, 'u_waves', 1, fields.waves);
        K.bind(P, 'u_cell', 2, fields.cell);
        K.go();
        ctx.clearRect(0, 0, w, w);
        ctx.save();
        ctx.clip(shape);
        K.put(ctx, box.x, box.y, box.size, box.size);
        ctx.restore();
        ctx.drawImage(overlay, 0, 0);
        return;
      }
      const [ar, ag, ab] = ink;
      const data = tinyImage.data;
      const base = dark ? [236, 234, 228] : paper;
      for (let j = 1; j <= N; j++) {
        for (let i = from[j]; i <= to[j]; i++) {
          const k = i + S * j;
          let gx = 0, gy = 0, sk = k;
          if (rippling) {
            gx = slopeX(wave, k) * G;
            gy = slopeY(wave, k) * G;
            sk = Math.max(1, Math.min(N, Math.round(i + gx * 5 * G))) + S * Math.max(1, Math.min(N, Math.round(j + gy * 5 * G)));
            if (!inside[sk]) sk = k;
          }
          const er = Math.exp(-ar[sk]), eg = Math.exp(-ag[sk]), eb = Math.exp(-ab[sk]);
          let r = base[0] * er, g = base[1] * eg, b = base[2] * eb;
          if (dark) {
            const cover = 1 - Math.exp(-(ar[sk] + ag[sk] + ab[sk]) * 0.9);
            r = paper[0] * (1 - cover) + r * 0.7 * cover;
            g = paper[1] * (1 - cover) + g * 0.7 * cover;
            b = paper[2] * (1 - cover) + b * 0.7 * cover;
          }
          const o = 4 * (i - 1 + N * (j - 1));
          if (rippling) {
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
        if (onCard && sim) sim.K.clear(sim.waves.now, sim.waves.next);
        if (thing.w) thing.draw(true);
      };
      work();
    }

    thing.canvas.addEventListener('contextrestored', () => draw(true));

    function nudge() {
      due = clock;
    }

    return { step, draw, resize, follow, settle, nudge, density: 1 };
  });

  setUp('links', thing => {
    const WIRE = 0.072;
    const LEGS = Float64Array.of(0, 0.5, 3.3, 1, 0.5, 3.585, 0.17, 0.9, 3.585, 0.72, 0.9, 2.6);
    const TURNS = Float64Array.of(0.5, 0.5, 0.5, -1, 0.585, 3.585, 0.415, 1, 0.445, 0.9, 0.275, -1);
    const LOW = 0.15, HIGH = 3.85, SPAN = HIGH - LOW;
    const COUNT = 3;

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

    const x = new Float64Array(COUNT + 1), y = new Float64Array(COUNT + 1);
    const vx = new Float64Array(COUNT + 1), vy = new Float64Array(COUNT + 1);
    const nx0 = new Float64Array(COUNT + 1), ny0 = new Float64Array(COUNT + 1);
    let unit = 0, home = { x: 0, y: 0 }, laid = false;
    const BENDS = [0.42, -0.5];

    let image = null, buffers = null, was = null, moved = true;
    function resize() {
      const { w, h } = thing;
      const old = unit, oldHome = home;
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
      buffers = {
        top: new Int8Array(n).fill(-1), under: new Int8Array(n).fill(-1),
        topCover: new Float32Array(n), underCover: new Float32Array(n),
        topNormal: new Float32Array(3 * n), underNormal: new Float32Array(3 * n),
        mask: new Float32Array(n),
      };
      was = null;
      moved = true;
    }

    const f = n => n.toFixed(4);
    const CLIPS = program(`
uniform vec2 u_hook[${COUNT + 1}];
uniform float u_unit;
uniform vec2 u_size, u_cast;
uniform vec3 u_room, u_paper;
uniform float u_shadow;
uniform int u_count, u_taps;
const float WIRE = ${f(WIRE)}, LOW = ${f(LOW)};
const vec3 LEGS[${LEGS.length / 3}] = vec3[](${Array.from({ length: LEGS.length / 3 }, (_, k) => `vec3(${f(LEGS[3 * k])}, ${f(LEGS[3 * k + 1])}, ${f(LEGS[3 * k + 2])})`).join(', ')});
const vec4 TURNS[${TURNS.length / 4}] = vec4[](${Array.from({ length: TURNS.length / 4 }, (_, k) => `vec4(${f(TURNS[4 * k])}, ${f(TURNS[4 * k + 1])}, ${f(TURNS[4 * k + 2])}, ${f(TURNS[4 * k + 3])})`).join(', ')});

float wire(vec2 P, out vec2 g) {
  float best = 1e9;
  g = vec2(0);
  for (int k = 0; k < LEGS.length(); k++) {
    vec2 d = P - vec2(LEGS[k].x, clamp(P.y, LEGS[k].y, LEGS[k].z));
    float l = length(d);
    if (l < best) { best = l; g = d; }
  }
  for (int k = 0; k < TURNS.length(); k++) {
    vec2 d = P - TURNS[k].xy;
    if (d.y * TURNS[k].w < 0.) continue;
    float l = max(length(d), 1e-9), e = abs(l - TURNS[k].z);
    if (e < best) { best = e; g = d / l * (l > TURNS[k].z ? 1. : -1.); }
  }
  float l = length(g);
  if (l > 0.) g /= l;
  return best;
}

float clip(int i, vec2 p, out vec3 n) {
  vec2 d = u_hook[i + 1] - u_hook[i], f = d / max(length(d), 1e-9), e = vec2(-f.y, f.x), q = p - u_hook[i];
  vec2 P = vec2(dot(q, e) / u_unit + .5, dot(q, f) / u_unit + LOW);
  n = vec3(0);
  if (P.x < -.1 || P.x > 1.1 || P.y < -.1 || P.y > 4.1) return 0.;
  vec2 g;
  float w = wire(P, g), t = min(1., w / WIRE);
  n = vec3((g.x * e.x + g.y * f.x) * t, (g.x * e.y + g.y * f.y) * t, sqrt(1. - t * t));
  return min(1., (WIRE - w) * u_unit + .5);
}

float mask(vec2 p) {
  vec3 n;
  float most = 0.;
  for (int i = 0; i < u_count; i++) most = max(most, clip(i, p, n));
  return most;
}

bool over(int a, int b, vec2 p) {
  if (abs(a - b) != 1) return a > b;
  int i = min(a, b), j = i + 1;
  vec2 d = u_hook[j] - u_hook[i];
  return d.x * (p.y - u_hook[j].y) - d.y * (p.x - u_hook[j].x) > 0. ? a == i : a == j;
}

vec3 shade(vec3 n) {
  float facing = max(0., dot(n, HALF));
  float f2 = facing * facing, f4 = f2 * f2, f8 = f4 * f4, f16 = f8 * f8;
  float glint = f16 * .75 + f4 * .12;
  float side = min(1., (1. - n.z) * 1.3) * (.85 + .3 * dot(n.xy, LIGHT.xy));
  return mix(u_room, u_paper, side) + vec3(255, 255, 250) * glint;
}

void main() {
  vec2 p = px();
  int top = -1, under = -1;
  float tc = 0., uc = 0.;
  vec3 tn = vec3(0), un = vec3(0);
  for (int i = 0; i < u_count; i++) {
    vec3 n;
    float c = clip(i, p, n);
    if (c <= 0.) continue;
    if (top < 0 || over(i, top, p)) {
      under = top; uc = tc; un = tn;
      top = i; tc = c; tn = n;
    } else if (under < 0 || over(i, under, p)) {
      under = i; uc = c; un = n;
    }
  }
  float sh = 0.;
  vec2 c = floor(p) - u_cast;
  if (c.x > 0. && c.y > 0. && c.x < u_size.x - 1. && c.y < u_size.y - 1.) {
    const vec3 TAPS[5] = vec3[](vec3(0, 0, .5), vec3(-1, 0, .125), vec3(1, 0, .125), vec3(0, -1, .125), vec3(0, 1, .125));
    for (int t = 0; t < u_taps; t++) sh += mask(c + .5 + TAPS[t].xy) * TAPS[t].z;
  }
  sh *= u_shadow;
  if (sh <= .003 && tc <= 0.) { o = vec4(0); return; }
  vec4 C = vec4(0, 0, 0, sh);
  if (under >= 0) C = C * (1. - uc) + vec4(shade(un), 1) * uc;
  if (top >= 0) C = C * (1. - tc) + vec4(shade(tn), 1) * tc;
  o = vec4(clamp(C.rgb / C.a, 0., 255.) * C.a / 255., C.a);
}`);
    const hooks = new Float32Array(2 * (COUNT + 1));
    let carded = false;

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
      const room = dark ? [62, 64, 68] : [104, 107, 112];
      const paper = dark ? [118, 118, 120] : [226, 223, 214];
      const shadowAlpha = dark ? 0.55 : 0.32;
      const r = WIRE * unit;
      const sx = Math.round((-LIGHT[0] / LIGHT[2]) * r * 1.6), sy = Math.round((-LIGHT[1] / LIGHT[2]) * r * 1.6);

      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      const frames = [];
      for (let i = 0; i < COUNT; i++) {
        const dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], l = Math.hypot(dx, dy) || 1;
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
      x1 = Math.min(w, x1 + Math.abs(sx) + 2); y1 = Math.min(h, y1 + Math.abs(sy) + 2);
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
      const K = card();
      if (K) {
        ctx.clearRect(0, 0, w, h);
        carded = true;
        if (x1 <= x0 || y1 <= y0) return;
        const P = K.use(CLIPS, x0, y0, x1 - x0, y1 - y0), gl = K.gl;
        for (let i = 0; i <= COUNT; i++) {
          hooks[2 * i] = x[i];
          hooks[2 * i + 1] = y[i];
        }
        gl.uniform2fv(P.u('u_hook'), hooks);
        gl.uniform1f(P.u('u_unit'), unit);
        gl.uniform2f(P.u('u_size'), w, h);
        gl.uniform2f(P.u('u_cast'), sx, sy);
        gl.uniform3fv(P.u('u_room'), room);
        gl.uniform3fv(P.u('u_paper'), paper);
        gl.uniform1f(P.u('u_shadow'), shadowAlpha);
        gl.uniform1i(P.u('u_count'), COUNT);
        gl.uniform1i(P.u('u_taps'), 5);
        K.go();
        K.put(ctx, x0, y0);
        return;
      }
      if (was) {
        for (let py = was[1]; py < was[3]; py++) data.fill(0, 4 * (was[0] + w * py), 4 * (was[2] + w * py));
      }
      const dirty = was && !carded ? [Math.min(x0, was[0]), Math.min(y0, was[1]), Math.max(x1, was[2]), Math.max(y1, was[3])] : [0, 0, w, h];
      carded = false;
      was = [x0, y0, x1, y1];

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
          let sh = 0;
          const cx = px - sx, cy = py - sy;
          if (cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1) {
            const c = cx + w * cy;
            sh = (mask[c] * 4 + mask[c - 1] + mask[c + 1] + mask[c - w] + mask[c + w]) / 8;
          }
          sh *= shadowAlpha;
          const tc = top[k] >= 0 ? topCover[k] : 0, uc = under[k] >= 0 ? underCover[k] : 0;
          if (sh <= 0.003 && tc <= 0) continue;
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
      const awake = fastest > unit * 0.2 || Math.hypot(home.x - mx, home.y - my) > unit * 0.6;
      if (!awake) {
        vx.fill(0);
        vy.fill(0);
        return false;
      }
      if (fastest * dt > 0.05) moved = true;
      return true;
    }

    const follow = () => true;

    return { step, draw, resize, follow, settle() {} };
  });

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

    function follow(p) {
      const box = thing.box.getBoundingClientRect();
      const near = p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom;
      if (!near) from = null;
      return near;
    }

    function nudge() {
      spin += 1.5;
    }

    return { step, draw, resize() {}, follow, settle() { spin = 0; }, nudge };
  });

  for (const row of page.querySelectorAll('.experiment')) {
    const thing = things.find(t => row.contains(t.el));
    let nudged = -Infinity;
    const nudge = () => {
      const now = performance.now();
      if (!thing || !thing.nudge || still.matches || now - nudged < 1000) return;
      nudged = now;
      thing.nudge(row);
      wake(thing);
    };
    row.addEventListener('focus', () => {
      if (row.matches(':focus-visible')) nudge();
    });
    row.addEventListener('pointerenter', e => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') nudge();
    });

    // A press that moves (a fling, a text selection) shouldn't open the link
    let down = null, moved = false;
    row.addEventListener('pointerdown', e => {
      down = e.pointerType === 'touch' ? null : { x: e.clientX, y: e.clientY };
      moved = false;
    });
    row.addEventListener('pointermove', e => {
      if (down && e.buttons && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) moved = true;
    }, { passive: true });
    row.addEventListener('click', e => {
      if (moved && e.detail) e.preventDefault();
      down = null;
      moved = false;
    });
  }

  // iOS Safari applies :active only when a touchstart listener exists
  page.addEventListener('touchstart', () => {}, { passive: true });

  new MutationObserver(redraw).observe(root, { attributes: true, attributeFilter: ['class'] });

  still.addEventListener('change', () => {
    for (const thing of things) {
      if (!thing.w) continue;
      if (still.matches) thing.settle();
      thing.draw(true);
      wake(thing);
    }
  });

  prepare();
})();
