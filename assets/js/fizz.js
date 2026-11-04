/* Fizz.

     const fizz = Fizz({ body: 50 });
     fizz.mount(canvas);
     fizz.size(canvas.width, canvas.height, dpr);
     each 1 / 120 of a second: fizz.time += dt; fizz.stir(dt); fizz.move(dt); fizz.ebb(dt);
     each frame: fizz.draw();

   An arm that goes to something and stays there is fizz.reach({ x, y, present: true }). A pair of
   eyes is fizz.eyes(), drawn with fizz.drawEyes(), on any canvas, or on it with fizz.peer().
   Where something's in front of it, fizz.hole = [[x, y], ...].

   The way its tentacles move is adapted from Venom Button by exteestudio, which draws them in
   3D with WebGL; here they're flat.

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

  const NP = 14, SUB = 1 / 120, ITER = 3;
  const P = { creep: 0.25, magnet: 1.6 };
  const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
  const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const DARK = [17, 46, 34], THIN = [46, 132, 92];
  const shine = alpha => `rgba(232, 240, 255, ${alpha})`;
  const sprite = colour => {
    const c = layer(32, 32);
    // willReadFrequently: sprites never change and are read hundreds of times a frame, so keep them in memory.
    const x = c.getContext('2d', { willReadFrequently: true }), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${colour}, 1)`);
    g.addColorStop(0.3, `rgba(${colour}, 0.55)`);
    g.addColorStop(1, `rgba(${colour}, 0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return c;
  };
  const SOFT = sprite('190, 236, 165');
  const GLOW = sprite('128, 196, 136');
  const LIT = '128, 196, 136', DEEP = [12, 20, 16], LAMP = '255, 232, 206';

  const GLSL = `#version 300 es
precision highp float;
precision highp int;
uniform vec4 u_view;
uniform vec2 u_shift;
vec4 place(vec2 w) {
  vec2 p = vec2(w.x, w.y - u_view.y) * u_view.x + u_shift;
  return vec4(p.x / u_view.z * 2. - 1., 1. - p.y / u_view.w * 2., 0., 1.);
}
float erf(float x) {
  float a = abs(x), t = 1. + (.278393 + (.230389 + .078108 * a * a) * a) * a;
  t *= t;
  return sign(x) * (1. - 1. / (t * t));
}
float phi(float x) { return .5 + .5 * erf(x * .70710678); }
float stops(float t, float a0, float m, float am, float a1) {
  t = clamp(t, 0., 1.);
  return t < m ? mix(a0, am, t / m) : mix(am, a1, (t - m) / (1. - m));
}
`;
  const BODY_FN = `
uniform highp sampler2D u_rad;
uniform vec3 u_body;
vec2 radAt(float th, int ch) {
  float N = u_body.z, u = fract(th * .15915494) * N, f = floor(u);
  int n = int(N), i = int(f) % n, j = (i + 1) % n;
  float a = texelFetch(u_rad, ivec2(i, 0), 0)[ch], b = texelFetch(u_rad, ivec2(j, 0), 0)[ch];
  return vec2(mix(a, b, u - f), (b - a) * N * .15915494);
}
float inside(vec2 w, int ch, float k) {
  vec2 v = w - u_body.xy, r = radAt(atan(v.y, v.x + 1e-6), ch) * k;
  float q = r.y / max(r.x, 1e-3);
  return (r.x - length(v)) * inversesqrt(1. + q * q);
}
float cover(vec2 w) { return clamp(inside(w, 0, 1.) * u_view.x + .5, 0., 1.); }
`;
  const MESH_VS = `
in vec2 a_p;
in vec4 a_c;
in vec2 a_e;
out vec4 v_c;
out vec2 v_e;
void main() { v_c = a_c; v_e = a_e; gl_Position = place(a_p); }
`;
  const MESH_FS = `
in vec4 v_c;
in vec2 v_e;
out vec4 o;
void main() { o = v_c * clamp(v_e.y + .5 - abs(v_e.x), 0., 1.); }
`;
  const INST_VS = `
in vec4 i_a;
in vec4 i_b;
in vec4 i_c;
in vec4 i_d;
out vec2 v_l;
out vec2 v_w;
flat out vec4 v_a;
flat out vec4 v_b;
flat out vec4 v_c;
flat out vec4 v_d;
void main() {
  vec2 q = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1., w, l;
  float S = u_view.x;
  int kind = int(i_d.x + .5);
  if (kind == 1) {
    vec2 d = i_a.zw - i_a.xy;
    float len = length(d), h = max(i_b.x * S, .5) + 1.;
    vec2 u = len > 1e-6 ? d / len : vec2(1., 0.), n = vec2(-u.y, u.x);
    l = vec2(q.x < 0. ? -h : len * S + h, q.y * h);
    w = i_a.xy + (u * l.x + n * l.y) / S;
  } else if (kind == 3) {
    l = q * (i_a.z + i_a.w + 1.5 / S);
    w = i_a.xy + l;
  } else {
    vec2 r = i_a.zw + (kind == 2 ? (1.5 + 3. * i_b.y) / S : 0.);
    float c = cos(i_b.x), s = sin(i_b.x);
    l = q * r;
    w = i_a.xy + vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  }
  v_l = l; v_w = w; v_a = i_a; v_b = i_b; v_c = i_c; v_d = i_d;
  gl_Position = place(w);
}
`;
  const INST_FS = `
in vec2 v_l;
in vec2 v_w;
flat in vec4 v_a;
flat in vec4 v_b;
flat in vec4 v_c;
flat in vec4 v_d;
out vec4 o;
float line(float d, float w) { return clamp(max(w, .5) + .5 - d, 0., 1.) * min(2. * w, 1.); }
float sharp(vec2 p, vec2 r) {
  float f = length(p / r);
  return f < 1e-4 ? 1. : clamp((1. - f) * f / length(p / (r * r)) + .5, 0., 1.);
}
float soft(vec2 p, vec2 r, float s) {
  float sum = 0., k = .70710678 / s, dy = r.y / 8.;
  for (int i = 0; i < 16; i++) {
    float y = -r.y + (float(i) + .5) * dy, q = y / r.y, w = r.x * sqrt(max(1. - q * q, 0.)), g = (p.y - y) / s;
    sum += exp(-.5 * g * g) * (erf((p.x + w) * k) - erf((p.x - w) * k));
  }
  return sum * .5 * dy / (s * 2.5066283);
}
void main() {
  int kind = int(v_d.x + .5);
  float S = u_view.x, a;
  if (kind == 0) a = stops(length(v_l / v_a.zw), v_b.z, v_b.y, v_b.w, 0.);
  else if (kind == 1) {
    float len = length(v_a.zw - v_a.xy) * S;
    a = line(length(vec2(v_l.x - clamp(v_l.x, 0., len), v_l.y)), v_b.x * S);
  } else if (kind == 2) a = v_b.y < .3 ? sharp(v_l * S, v_a.zw * S) : soft(v_l * S, v_a.zw * S, v_b.y);
  else a = line(abs(length(v_l) - v_a.z) * S, v_a.w * S) * (1. - clamp((length(v_w - v_b.xy) - v_b.z) / max(v_b.w - v_b.z, 1e-3), 0., 1.));
  if (v_d.y > .5) a *= cover(v_w);
  a *= v_c.a;
  o = vec4(v_c.rgb * a, a);
}
`;
  const RECT_VS = `
uniform vec4 u_rect;
out vec2 v_w;
void main() {
  vec2 q = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  v_w = mix(u_rect.xy, u_rect.zw, q);
  gl_Position = place(v_w);
}
`;
  const BODY_FS = `
in vec2 v_w;
out vec4 o;
uniform int u_mode;
uniform vec4 u_col;
uniform vec4 u_p;
uniform vec4 u_q;
uniform vec4 u_map;
uniform sampler2D u_tex;
float pane(float L, float ph, float t0, float t1, float R0, float s, out float halo) {
  float S = u_view.x, d0 = L - .56 * R0, d1 = .84 * R0 - L, e0 = (ph - t0) * L, e1 = (t1 - ph) * L;
  halo = s > 0. ? max(phi(d0 * S / s) + phi(d1 * S / s) - 1., 0.) * max(phi(e0 * S / s) + phi(e1 * S / s) - 1., 0.) : 0.;
  return clamp(min(min(d0, d1), min(e0, e1)) * S + .5, 0., 1.);
}
void main() {
  vec2 v = v_w - u_body.xy;
  float S = u_view.x, L = length(v);
  if (u_mode == 5) {
    o = vec4(clamp(inside(v_w, 0, .28) * S + .5, 0., 1.), clamp(inside(v_w, 0, .52) * S + .5, 0., 1.), clamp(inside(v_w, 0, .83) * S + .5, 0., 1.), 1.);
    return;
  }
  float c = cover(v_w);
  if (u_mode == 0) { o = u_col * c; return; }
  if (u_mode == 1) { float a = mix(.96, .8, clamp(L / u_p.x, 0., 1.)) * c; o = vec4(u_col.rgb * a, a); return; }
  if (u_mode == 3) {
    vec2 p = vec2(v_w.x, v_w.y - u_view.y) * u_map.x + u_map.y;
    float a = dot(texture(u_tex, vec2(p.x / u_map.z, 1. - p.y / u_map.w)).rgb, u_p.xyz) * c;
    o = vec4(u_col.rgb * a, a);
    return;
  }
  float th = atan(v.y, v.x + 1e-6), ph = th - u_q.x;
  ph = atan(sin(ph), cos(ph));
  float R0 = radAt(th, 1).x, r = u_q.y, h1, h2, a;
  float p1 = pane(L, ph, -.56, -.05, R0, u_q.z, h1), p2 = pane(L, ph, .05, .56, R0, u_q.z, h2), t = (L - .5 * r) / (.36 * r);
  if (u_mode == 2) {
    vec2 cd = u_body.xy - u_p.xy, pd = v_w - u_p.xy;
    float A = dot(cd, cd) - u_p.z * u_p.z, B = dot(pd, cd), C = dot(pd, pd);
    float sheen = stops((B - sqrt(max(B * B - A * C, 0.))) / A, .2, .45, .05, 0.), pan = stops(t, .1, .45, .34, .92);
    a = 1. - (1. - sheen) * (1. - .5 * pan * h1) * (1. - pan * p1) * (1. - .5 * pan * h2) * (1. - pan * p2);
  } else {
    float pan = stops(t, 0., .45, .08 * u_q.w, .26 * u_q.w);
    a = 1. - (1. - pan * p1) * (1. - pan * p2);
  }
  a *= c;
  o = vec4(u_col.rgb * a, a);
}
`;
  const POLY_FS = `
in vec2 v_w;
out vec4 o;
uniform vec4 u_pts[64];
uniform int u_n;
uniform int u_mode;
uniform vec4 u_col;
uniform vec4 u_sp[9];
uniform vec3 u_lit;
uniform vec3 u_soft;
uniform float u_glow;
vec2 at(int i) { vec4 v = u_pts[i >> 1]; return (i & 1) == 0 ? v.xy : v.zw; }
float speck(float t) { return stops(t, 1., .3, .55, 0.); }
void main() {
  float S = u_view.x, d = 1e9;
  bool inside = false;
  vec2 a = at(u_n - 1);
  for (int i = 0; i < 128; i++) {
    if (i >= u_n) break;
    vec2 b = at(i), e = b - a, pa = v_w - a;
    d = min(d, length(pa - e * clamp(dot(pa, e) / max(dot(e, e), 1e-9), 0., 1.)));
    if ((a.y > v_w.y) != (b.y > v_w.y) && v_w.x < e.x * (v_w.y - a.y) / e.y + a.x) inside = !inside;
    a = b;
  }
  float c = clamp((inside ? d : -d) * S + .5, 0., 1.);
  if (u_mode == 0) { o = u_col * c; return; }
  float px = d * S, lit = (clamp(4.5 * S + .5 - px, 0., 1.) * .12 + clamp(1.5 * S + .5 - px, 0., 1.) * .4) * u_glow, A = lit;
  vec3 rgb = u_lit * lit;
  for (int k = 0; k < 9; k++) {
    vec4 s = u_sp[k];
    float g = speck(length(v_w - s.xy) / 8.) * .45 * s.z * u_glow, h = speck(length(v_w - s.xy) / 1.4) * .8 * s.z * u_glow;
    rgb += u_lit * g + u_soft * h;
    A += g + h;
  }
  o = vec4(rgb, A) * c;
}
`;
  const FULL_VS = `
void main() { vec2 q = vec2(gl_VertexID & 1, gl_VertexID >> 1); gl_Position = vec4(q * 2. - 1., 0., 1.); }
`;
  const PASS = `
uniform vec4 u_tgt;
out vec4 o;
vec2 full() { return (vec2(gl_FragCoord.x, u_tgt.x - gl_FragCoord.y) - u_tgt.z) * u_tgt.y; }
vec2 uvAt(vec2 p, vec4 m) { vec2 q = p / m.x + m.w; return vec2(q.x / m.y, 1. - q.y / m.z); }
`;
  const BLUR_FS = `
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform vec4 u_sig;
uniform int u_n;
void main() {
  vec2 size = vec2(textureSize(u_src, 0)), uv = gl_FragCoord.xy / size, d = u_dir / size;
  vec4 acc = vec4(0.), sum = vec4(0.), k = -.5 / (u_sig * u_sig);
  for (int i = -u_n; i <= u_n; i++) {
    float x = float(i);
    vec2 q = uv + d * x;
    vec4 w = exp(k * x * x);
    acc += w * texture(u_src, q) * (step(0., q.x) * step(q.x, 1.) * step(0., q.y) * step(q.y, 1.));
    sum += w;
  }
  o = acc / sum;
}
`;
  const DOWN_FS = `
uniform sampler2D u_src;
uniform vec4 u_m;
void main() { o = texture(u_src, uvAt(full(), u_m)); }
`;
  const SHADOW_FS = `
uniform sampler2D u_sil;
uniform sampler2D u_cast;
uniform sampler2D u_touch;
uniform vec4 u_ms;
uniform vec4 u_mc;
uniform vec4 u_mt;
uniform vec4 u_off;
uniform vec3 u_sc;
uniform vec3 u_dark;
void main() {
  vec2 p = full();
  float c = texture(u_cast, uvAt(p - u_off.xy, u_mc)).r * .42, t = texture(u_touch, uvAt(p - u_off.zw, u_mt)).r * .6, s = texture(u_sil, uvAt(p, u_ms)).r;
  vec4 sh = vec4(u_sc * t, t) + vec4(u_sc * c, c) * (1. - t);
  o = vec4(u_dark * s, s) + sh * (1. - s);
}
`;
  const POOL_FS = `
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_c;
uniform vec4 u_ma;
uniform vec4 u_mb;
uniform vec4 u_mc;
uniform vec4 u_k;
uniform vec3 u_lit;
void main() {
  vec2 p = full();
  float a = min(texture(u_a, uvAt(p, u_ma)).r * u_k.x + texture(u_b, uvAt(p, u_mb)).r * u_k.y + texture(u_c, uvAt(p, u_mc)).r * u_k.z, 1.) * u_k.w;
  o = vec4(u_lit * a, a);
}
`;
  const GRAIN_FS = `
uniform vec3 u_g;
uniform float u_n;
uvec3 pcg(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
void main() {
  vec2 p = floor(full() - u_g.xy);
  float D = u_g.z;
  if (p.x < 0. || p.y < 0. || p.x >= D || p.y >= D) discard;
  float d = length(p - D * .5) / (D * .5), fade = d < 1. ? pow(1. - d * d, 1.2) : 0.;
  uvec3 h = pcg(uvec3(uvec2(p), 17u));
  float c = float(h.x >> 31u), a = floor(float(h.y >> 8u) / 16777216. * 6. * fade + .5) / 255. * u_n;
  o = vec4(vec3(c * a), a);
}
`;

  function kit(el) {
    let gl = null;
    try {
      gl = el.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true });
    } catch (e) { return null; }
    if (!gl) return null;
    const K = { el, lost: false, W: 0, H: 0 };
    el.addEventListener('webglcontextlost', () => { K.lost = true; });
    function build(vs, fs, names = []) {
      const p = gl.createProgram();
      const parts = [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].map(([type, src]) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, GLSL + src);
        gl.compileShader(s);
        gl.attachShader(p, s);
        return s;
      });
      names.forEach((n, i) => gl.bindAttribLocation(p, i, n));
      gl.linkProgram(p);
      const at = new Map();
      return { p, parts, u(n) { if (!at.has(n)) at.set(n, gl.getUniformLocation(p, n)); return at.get(n); } };
    }
    // Querying program status blocks (seconds on first visit): build in parallel, draw on the canvas until ready.
    const quick = gl.getExtension('KHR_parallel_shader_compile');
    let P, done = false;
    K.ready = () => {
      if (done) return true;
      const all = Object.values(P);
      if (quick && !all.every(q => gl.getProgramParameter(q.p, quick.COMPLETION_STATUS_KHR))) return false;
      for (const q of all) {
        if (!gl.getProgramParameter(q.p, gl.LINK_STATUS)) {
          if (!gl.isContextLost()) console.warn('Fizz is drawing on a canvas, as WebGL failed:', q.parts.map(s => gl.getShaderInfoLog(s)).join('\n') + gl.getProgramInfoLog(q.p));
          K.lost = true;
          return false;
        }
      }
      return (done = true);
    };
    try {
      P = {
        mesh: build(MESH_VS, MESH_FS, ['a_p', 'a_c', 'a_e']),
        inst: build(INST_VS, BODY_FN + INST_FS, ['i_a', 'i_b', 'i_c', 'i_d']),
        body: build(RECT_VS, BODY_FN + BODY_FS),
        poly: build(RECT_VS, POLY_FS),
        blur: build(FULL_VS, PASS + BLUR_FS),
        down: build(FULL_VS, PASS + DOWN_FS),
        shadow: build(FULL_VS, PASS + SHADOW_FS),
        pool: build(FULL_VS, PASS + POOL_FS),
        grain: build(FULL_VS, PASS + GRAIN_FS),
      };
    } catch (e) {
      console.warn('Fizz is drawing on a canvas, as WebGL failed:', e);
      return null;
    }

    const ib = gl.createBuffer(), mb = gl.createBuffer(), mi = gl.createBuffer();
    const instVao = gl.createVertexArray();
    gl.bindVertexArray(instVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 64, i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    const meshVao = gl.createVertexArray();
    gl.bindVertexArray(meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mb);
    [[0, 2, 0], [1, 4, 8], [2, 2, 24]].forEach(([i, n, off]) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, n, gl.FLOAT, false, 32, off);
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mi);
    const none = gl.createVertexArray();
    gl.bindVertexArray(null);

    const sampling = filter => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    // Bound to texture unit 0 permanently.
    const N = 384, radData = new Float32Array(N * 2), rad = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rad);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG32F, N, 1);
    sampling(gl.NEAREST);
    const blank = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    sampling(gl.NEAREST);

    const T = new Map();
    let frame = 0, cur = null, S = 1, top = 0, bx = 0, by = 0;
    const screen = { fb: null, w: 0, h: 0, f: 1, m: 0 };
    function target(name, f, fmt, m = 0) {
      const w = Math.ceil(K.W / f) + 2 * m, h = Math.ceil(K.H / f) + 2 * m;
      let t = T.get(name);
      if (!t || t.w !== w || t.h !== h) {
        if (t) { gl.deleteTexture(t.t); gl.deleteFramebuffer(t.fb); }
        const tx = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.texStorage2D(gl.TEXTURE_2D, 1, fmt === 'r' ? gl.R8 : gl.RGBA8, w, h);
        sampling(gl.LINEAR);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
        t = { name, t: tx, fb, w, h, f, m, fmt, frame: -1 };
        T.set(name, t);
        if (cur) gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb);
      }
      return t;
    }
    const map = t => [t.f, t.w, t.h, t.m];
    function to(t) {
      cur = t;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
    }
    function wipe() {
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    function only(R) {
      if (!R) { gl.disable(gl.SCISSOR_TEST); return; }
      const t = cur, c = (v, n) => (v < 0 ? 0 : v > n ? n : v);
      const x0 = c(Math.floor(R[0] / t.f) + t.m - 1, t.w), y0 = c(Math.floor(R[1] / t.f) + t.m - 1, t.h);
      const x1 = c(Math.ceil(R[2] / t.f) + t.m + 1, t.w), y1 = c(Math.ceil(R[3] / t.f) + t.m + 1, t.h);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x0, t.h - y1, Math.max(x1 - x0, 0), Math.max(y1 - y0, 0));
    }
    function blend(mode) {
      if (mode === 'none') { gl.disable(gl.BLEND); return; }
      gl.enable(gl.BLEND);
      if (mode === 'max') { gl.blendEquation(gl.MAX); return; }
      gl.blendEquation(gl.FUNC_ADD);
      if (mode === 'out') gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFunc(gl.ONE, mode === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    }
    function use(prog) {
      gl.useProgram(prog.p);
      gl.uniform4f(prog.u('u_view'), S / cur.f, top, cur.w, cur.h);
      gl.uniform2f(prog.u('u_shift'), cur.m, cur.m);
      gl.uniform3f(prog.u('u_body'), bx, by, N);
      gl.uniform1i(prog.u('u_rad'), 0);
      gl.uniform4f(prog.u('u_tgt'), cur.h, cur.f, cur.m, 0);
      return prog;
    }
    function bind(unit, prog, name, t) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t ? t.t : blank);
      gl.uniform1i(prog.u(name), unit);
    }
    function quad() {
      gl.bindVertexArray(none);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const ZERO = [0, 0, 0, 0];

    Object.assign(K, {
      N, radData, screen, target, to, wipe, only, blend,
      begin(W, H, s, y, x0, y0) {
        frame++;
        K.W = W; K.H = H; S = s; top = y; bx = x0; by = y0;
        if (el.width !== W) el.width = W;
        if (el.height !== H) el.height = H;
        screen.w = W; screen.h = H;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, rad);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, 1, gl.RG, gl.FLOAT, radData);
        to(screen);
        wipe();
      },
      inst(l) {
        if (!l.n) return;
        use(P.inst);
        gl.bindVertexArray(instVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, ib);
        gl.bufferData(gl.ARRAY_BUFFER, l.f.subarray(0, l.n * 16), gl.STREAM_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, l.n);
      },
      mesh(m) {
        if (!m.k) return;
        use(P.mesh);
        gl.bindVertexArray(meshVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, mb);
        gl.bufferData(gl.ARRAY_BUFFER, m.v.subarray(0, m.n * 8), gl.STREAM_DRAW);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.ix.subarray(0, m.k), gl.STREAM_DRAW);
        gl.drawElements(gl.TRIANGLES, m.k, gl.UNSIGNED_INT, 0);
      },
      body(mode, rect, o = {}) {
        const p = use(P.body);
        gl.uniform4fv(p.u('u_rect'), rect);
        gl.uniform1i(p.u('u_mode'), mode);
        gl.uniform4fv(p.u('u_col'), o.col || ZERO);
        gl.uniform4fv(p.u('u_p'), o.p || ZERO);
        gl.uniform4fv(p.u('u_q'), o.q || ZERO);
        const t = o.tex;
        gl.uniform4fv(p.u('u_map'), t ? [S / t.f, t.m, t.w, t.h] : ZERO);
        bind(1, p, 'u_tex', t);
        quad();
      },
      poly(g, mode, col, n = 0, specks = null) {
        const p = use(P.poly);
        gl.uniform4fv(p.u('u_rect'), g.rect);
        gl.uniform4fv(p.u('u_pts'), g.pts);
        gl.uniform1i(p.u('u_n'), g.n);
        gl.uniform1i(p.u('u_mode'), mode);
        gl.uniform4fv(p.u('u_col'), col);
        if (specks) gl.uniform4fv(p.u('u_sp'), specks);
        gl.uniform1f(p.u('u_glow'), n);
        gl.uniform3f(p.u('u_lit'), 128 / 255, 196 / 255, 136 / 255);
        gl.uniform3f(p.u('u_soft'), 190 / 255, 236 / 255, 165 / 255);
        quad();
      },
      gauss(name, src, sig, R, cap = 6) {
        const most = Math.max(...sig);
        if (most < 0.3) return src;
        let at = src;
        while (most / at.f > cap) at = K.down(at, R);
        const tmp = target(name + '~', at.f, at.fmt, at.m), out = target(name, at.f, at.fmt, at.m);
        const Rb = [R[0] - Math.ceil(3 * most) - 2 * at.f, R[1] - Math.ceil(3 * most) - 2 * at.f, R[2] + Math.ceil(3 * most) + 2 * at.f, R[3] + Math.ceil(3 * most) + 2 * at.f];
        const n = Math.min(Math.ceil((3 * most) / at.f), 48), s = sig.map(v => Math.max(v / at.f, 0.05));
        for (const [from, into, dir] of [[at, tmp, [1, 0]], [tmp, out, [0, 1]]]) {
          to(into);
          wipe();
          only(Rb);
          blend('none');
          const p = use(P.blur);
          bind(1, p, 'u_src', from);
          gl.uniform2fv(p.u('u_dir'), dir);
          gl.uniform4fv(p.u('u_sig'), s);
          gl.uniform1i(p.u('u_n'), n);
          quad();
        }
        return out;
      },
      down(src, R) {
        const t = target(src.name + '/', src.f * 2, src.fmt);
        if (t.frame !== frame) {
          t.frame = frame;
          to(t);
          wipe();
          only([R[0] - 4 * t.f, R[1] - 4 * t.f, R[2] + 4 * t.f, R[3] + 4 * t.f]);
          blend('none');
          const p = use(P.down);
          bind(1, p, 'u_src', src);
          gl.uniform4fv(p.u('u_m'), map(src));
          quad();
        }
        return t;
      },
      shadow(sil, cast, touch, off, sc, dark) {
        const p = use(P.shadow);
        bind(1, p, 'u_sil', sil);
        bind(2, p, 'u_cast', cast);
        bind(3, p, 'u_touch', touch);
        gl.uniform4fv(p.u('u_ms'), map(sil));
        gl.uniform4fv(p.u('u_mc'), map(cast));
        gl.uniform4fv(p.u('u_mt'), map(touch));
        gl.uniform4fv(p.u('u_off'), off);
        gl.uniform3fv(p.u('u_sc'), sc);
        gl.uniform3fv(p.u('u_dark'), dark);
        quad();
      },
      pool(t, k, lit) {
        const p = use(P.pool);
        ['a', 'b', 'c'].forEach((c, i) => {
          bind(i + 1, p, 'u_' + c, t[i]);
          gl.uniform4fv(p.u('u_m' + c), map(t[i]));
        });
        gl.uniform4fv(p.u('u_k'), k);
        gl.uniform3fv(p.u('u_lit'), lit);
        quad();
      },
      grain(x, y, D, n) {
        const p = use(P.grain);
        gl.uniform3f(p.u('u_g'), x, y, D);
        gl.uniform1f(p.u('u_n'), n);
        quad();
      },
    });
    return K;
  }

  // All of these are optional, and a page only has the ones it needs.
  //   body, most, bit: how big it is, how many strands it'll have out, and how big its bits are
  //   snap: { stretch, len }, how far an arm goes before it parts. Without it, none does by itself.
  //   time, flow, probeAt, blob: how it starts
  //   aims: { kind: (s, R, dt) => [x, y] }, where the tips of a page's own kinds of strand go
  //   haul: (s, length, dt) => length, for a strand that's being pulled in
  //   bound: (r, a) => r, the last word on where its surface is, for something in the way
  //   parted: (s, base, tip), once a strand's parted. stepBit: (d, dt), how a bit gets home.
  //   glass: () => ({ x, y, r, width, far }), a ring of glass round it, lit at night from close to
  //   area, under: as far as it can get, as [w, h], and how far past the bottom of that
  //   aside: how far to throw a shape that's only there for its shadow
  //   grainAt: (size, S) => [x, y], for the grain.
  //   root: how far up a long, thin arm it comes out of the body. By default it's a share of the
  //   arm, which is right for short, thick ones. mound: how much the body comes up round it.
  //   gl: false, to draw it on the canvas itself, and not with WebGL. Fizz.gl = false, for all of them.
  function Fizz(opts = {}) {
    const BODY = opts.body || 50, MAX_STRANDS = opts.most || 14, BIT = opts.bit || 1, SNAP = opts.snap;
    const area = opts.area || (() => [canvas.width / (dpr * scale), canvas.height / (dpr * scale)]);
    const aside = opts.aside || (() => 1000), under = opts.under || 0;
    const MOUND = opts.mound || 1;
    const rooted = s => (opts.root ? Math.min(1, opts.root / Math.max(s.len, 1)) : 1);
    let canvas = null, ctx = null, shape = null, sil = null, low = null, lo = null, spill = null, pool = null, cut = null, cutter = null;
    let scale = 1, dpr = 1, top = 0, sinceNight = 0, lastNight = 0;
    let peering = null, hole = null;

    let time = opts.time ?? rand(0, 100), flow = opts.flow ?? rand(0, 50), aware = 0, focus = null, probeAt = opts.probeAt || 0;
    const strands = [], drops = [], ripples = [], tracks = [], flashes = [];
    const blob = { x: 0, y: 0, tx: 0, ty: 0, next: 0, lean: 0, la: 0, grow: 1, size: 1, sizeV: 0, over: 0, smear: 0, take: 0, takeAt: 0, ...opts.blob };
    const glow = { x: -0.53, y: -0.85, cast: [8, 12, 4], touch: [1, 1, 1], shadow: '28, 34, 44', night: null, n: 0, stirred: 0.25 };

    function radius(a) {
      const t = time * 1.5, R = BODY * blob.grow * blob.size;
      let r = R * (1 + 0.085 * Math.sin(2 * a + t * 0.31 + 1) + 0.06 * Math.sin(3 * a - t * 0.23 + 2) +
        0.034 * Math.sin(5 * a + t * 0.41) + 0.016 * Math.sin(8 * a - t * 0.7 + 4));
      if (blob.smear > 0.01) {
        const c = Math.cos(a - blob.la), s = Math.sin(a - blob.la), along = 1 + blob.smear * (c > 0 ? 0.8 : 1.5), across = 1 / (1 + blob.smear * 0.75);
        r /= Math.sqrt((c * c) / (along * along) + (s * s) / (across * across));
      }
      if (blob.lean > 0.001) r += blob.lean * R * 0.3 * bell(turn(a - blob.la), 0.62);
      for (const s of strands) if (s.mound > 0.05 && s.pin === 'anchor') r += s.mound * bell(turn(a - s.a), 0.13 + 0.09 * s.elong);
      if (blob.take > 0.5) r += blob.take * bell(turn(a - blob.takeAt), 0.58);
      for (const w of ripples) r += w.amp * 7 * Math.exp(-w.age * 4) * bell(turn(a - w.a), 0.3 + w.age);
      return opts.bound ? opts.bound(r, a) : r;
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
    function reach(target, { toward = edge(target.x, target.y).a, lean = 0, vol = Math.PI * 2.5 * 2.5 * 170, hold = [2, 6] } = {}) {
      const lat = lean + rand(-0.1, 0.1), s = sprout('reach', toward + lat);
      s.lat = lat;
      s.vol = vol;
      s.target = target;
      s.hold = { r: rand(hold[0], hold[1]), a: rand(0, 6.28), spin: rand(0.7, 1.5) * (Math.random() < 0.5 ? -1 : 1), x: target.x, y: target.y };
      strands.push(s);
      return s;
    }
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
      taper(base, base.len);
    }
    function release(absorb) {
      for (const s of strands) {
        if (s.kind === 'reach') {
          if (absorb || s.state === 'grow') { s.state = 'recoil'; s.kind = 'piece'; } else if (!s.pinch) s.pinch = 1e-4;
        }
      }
    }

    const pulse = (s, sp) => {
      const beat = (time * (0.7 + 0.5 * clamp(s.stretch - 1, 0, 1)) + s.phase) % 1.5;
      return bell(sp - (1.2 - beat), 0.1);
    };

    const aims = {
      reach(s, R, dt) {
        const h = s.hold, to = s.target, k = 1 - Math.exp(-dt * 24);
        h.a += h.spin * dt;
        h.x += (to.x + Math.cos(h.a) * h.r - h.x) * k;
        h.y += (to.y + Math.sin(h.a) * h.r - h.y) * k;
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

      let moundT = 0, elongT = 0;
      if (s.pin === 'anchor') {
        if (s.state === 'grow') { moundT = 7; elongT = 0.9; }
        else if (s.state === 'attached') { moundT = 6 + 6 * clamp(s.stretch - 1, 0, 1.4); elongT = 1 + 1.6 * clamp(s.stretch - 0.8, 0, 1.4); }
        if (s.kind === 'micro') { moundT *= 0.35; elongT *= 0.6; }
        if (s.kind === 'probe') { moundT *= 0.2; elongT *= 0.4; }
      }
      s.mound += (moundT * 0.55 * MOUND - s.mound) * (1 - Math.exp(-dt * (moundT > s.mound ? 10 : 5)));
      s.elong += (elongT - s.elong) * (1 - Math.exp(-dt * 8));

      if (s.state === 'recoil' && (s.rest * (NP - 1) < 12 || L < 5)) {
        s.dead = true;
        if (s.pin === 'anchor' && s.kind !== 'micro') ripple(s.a, 0.5);
      }
    }
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

    function stir(dt, calm = 0.25 + 0.6 * blob.over) {
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

    const world = (c, k, x = 0) => c.setTransform(k, 0, 0, k, x, -top * k);
    const ext = [0, 0, 0, 0], hull = [0, 0, 0, 0];
    const reset = () => { ext[0] = ext[1] = Infinity; ext[2] = ext[3] = -Infinity; };
    const cover = (x0, y0, x1, y1) => {
      if (x0 < ext[0]) ext[0] = x0;
      if (y0 < ext[1]) ext[1] = y0;
      if (x1 > ext[2]) ext[2] = x1;
      if (y1 > ext[3]) ext[3] = y1;
    };
    const tracer = {
      beginPath() {}, closePath() {},
      moveTo(x, y) { cover(x, y, x, y); }, lineTo(x, y) { cover(x, y, x, y); },
      quadraticCurveTo(a, b, x, y) { cover(a, b, a, b); cover(x, y, x, y); },
      bezierCurveTo(a, b, c, d, x, y) { cover(a, b, a, b); cover(c, d, c, d); cover(x, y, x, y); },
      arc(x, y, r) { cover(x - r, y - r, x + r, y + r); },
      ellipse(x, y, rx, ry) { const r = Math.max(rx, ry); cover(x - r, y - r, x + r, y + r); },
      rect(x, y, w, h) { cover(Math.min(x, x + w), Math.min(y, y + h), Math.max(x, x + w), Math.max(y, y + h)); },
    };
    function rect(e, k, pad, c) {
      const x0 = Math.max(Math.floor(e[0] * k) - pad, 0), y0 = Math.max(Math.floor((e[1] - top) * k) - pad, 0);
      const x1 = Math.min(Math.ceil(e[2] * k) + pad, c.width), y1 = Math.min(Math.ceil((e[3] - top) * k) + pad, c.height);
      return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
    }
    const widen = (r, by, c) => {
      if (!r) return null;
      const x0 = Math.max(r[0] - by, 0), y0 = Math.max(r[1] - by, 0);
      return [x0, y0, Math.min(r[0] + r[2] + by, c.width) - x0, Math.min(r[1] + r[3] + by, c.height) - y0];
    };
    const blowUp = (c, from, r) => {
      const kx = canvas.width / from.width, ky = canvas.height / from.height;
      c.drawImage(from, r[0], r[1], r[2], r[3], r[0] * kx, r[1] * ky, r[2] * kx, r[3] * ky);
    };
    let silAt = null, loAt = null, spillAt = null;
    const OUTLINE = 84, ox = new Float32Array(OUTLINE), oy = new Float32Array(OUTLINE);
    function outline() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < OUTLINE; i++) {
        const a = (i / OUTLINE) * Math.PI * 2, r = radius(a), x = blob.x + Math.cos(a) * r, y = blob.y + Math.sin(a) * r;
        ox[i] = x;
        oy[i] = y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      hull[0] = x0; hull[1] = y0; hull[2] = x1; hull[3] = y1;
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
    function edges(width) {
      for (let i = 0; i < VP; i++) {
        const a = Math.max(i - 1, 0), b = Math.min(i + 1, VP - 1);
        let tx = vx[b] - vx[a], ty = vy[b] - vy[a];
        const L = Math.hypot(tx, ty) || 1, r = vr[i] * width;
        tx /= L; ty /= L;
        edgeX[i] = vx[i] - ty * r; edgeY[i] = vy[i] + tx * r;
        const j = VP * 2 - 1 - i;
        edgeX[j] = vx[i] + ty * r; edgeY[j] = vy[i] - tx * r;
      }
      const tr = vr[VP - 1] * width;
      let x0 = vx[VP - 1] - tr, y0 = vy[VP - 1] - tr, x1 = vx[VP - 1] + tr, y1 = vy[VP - 1] + tr;
      for (let i = 0; i < VP * 2; i++) {
        const x = edgeX[i], y = edgeY[i];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      cover(x0, y0, x1, y1);
    }
    function ribbon(c, width = 1) {
      edges(width);
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
    const puts = c => (img, x, y, h, a) => { c.globalAlpha = a; c.drawImage(img, x - h, y - h, h * 2, h * 2); };
    const lines = c => (x0, y0, x1, y1, w, colour, a) => {
      c.strokeStyle = `rgba(${colour}, ${a.toFixed(3)})`;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    };
    const SHINE = '232, 240, 255';
    const MOTES = Array.from({ length: 260 }, () => {
      let x, y, z;
      do { x = rand(-1, 1); y = rand(-1, 1); z = rand(0, 1); } while (x * x + y * y + z * z > 1);
      const rho = Math.hypot(x, y);
      return { rho: rho * 0.96, depth: Math.sqrt(1 - rho * rho) - z, th: Math.atan2(y, x), spin: rand(0.05, 0.2) * (Math.random() < 0.8 ? 1 : -1),
        size: Math.random() < 0.1 ? rand(2.6, 4.4) : rand(1, 2.4), ph: rand(0, 6.28), rate: rand(0.5, 1.6), bright: rand(0.3, 1), spark: 0, ready: 0, store: 1 };
    });
    let lastX = null, lastY = 0, touchX = null, touchY = 0;
    function shaken() {
      const dt = Math.max(sinceNight, 1e-3), on = focus && focus.present;
      const sway = lastX === null ? 0 : Math.min(Math.hypot(blob.x - lastX, blob.y - lastY) / dt / 400, 1);
      const rub = on && touchX !== null ? Math.min((blob.over * Math.hypot(focus.x - touchX, focus.y - touchY)) / dt / 300, 2) : 0;
      lastX = blob.x; lastY = blob.y;
      if (on) { touchX = focus.x; touchY = focus.y; } else touchX = null;
      const work = [];
      for (const s of strands) {
        if (s.pin !== 'anchor' || s.state === 'recoil') continue;
        const k = s.state === 'grow' ? 2 : 2 * clamp(s.stretch - 1, 0, 1);
        if (k > 0.05) work.push([...at(s.a), k]);
      }
      return { sway, rub, work };
    }
    function motes(put) {
      const near = aware + blob.over, dx = Math.cos(blob.la), dy = Math.sin(blob.la), on = focus && focus.present;
      const push = glow.night ? shaken() : null;
      for (const m of MOTES) {
        const th = m.th + flow * m.spin * (1.4 - m.rho), rho = m.rho + 0.05 * Math.sin(flow * 0.4 * m.rate + m.ph), r = radius(th) * rho;
        const x = blob.x + Math.cos(th) * r + dx * near * 16 * (1 - m.rho * 0.6), y = blob.y + Math.sin(th) * r + dy * near * 16 * (1 - m.rho * 0.6);
        const twinkle = 0.55 + 0.45 * Math.sin(flow * m.rate + m.ph * 3);
        if (glow.night) {
          m.spark *= Math.exp(-sinceNight / 0.1);
          m.store = Math.min(m.store + sinceNight / 20, 1);
          let kick = 0.01 + 0.6 * push.sway, light = 0.07;
          for (const [wx, wy, k] of push.work) kick += 3 * k * bell(Math.hypot(x - wx, y - wy), 22);
          if (push.rub) kick += 8 * push.rub * bell(Math.hypot(x - focus.x, y - focus.y), 30);
          for (const f of flashes) {
            const front = bell(Math.hypot(x - f.x, y - f.y) - f.age * 230, 14) * Math.exp(-f.age * 2.6);
            kick += 60 * f.amp * front;
            light += 0.4 * f.amp * front;
          }
          if (time >= m.ready && Math.random() < sinceNight * kick) {
            m.spark = m.store * rand(0.6, 1);
            m.store *= 0.55;
            m.ready = time + rand(1.2, 2.4);
          }
          light += m.spark;
          const size = m.size * (0.8 + 2.4 * m.depth), a = Math.min(light * Math.exp(-1.5 * m.depth), 1) * glow.n;
          put(GLOW, x, y, size * (3 + 2 * m.depth), Math.min(a * 0.4, 1));
          put(SOFT, x, y, size, a);
          continue;
        }
        let a = 0.26 * m.bright * twinkle;
        if (blob.over > 0.01 && on) a += blob.over * bell(Math.hypot(x - focus.x, y - focus.y), 34);
        put(SOFT, x, y, m.size, Math.min(a, 1));
      }
    }
    function streaming(s, put) {
      if (s.state !== 'attached') return;
      const strength = glow.night ? 0.5 * glow.n : 0.4;
      for (let i = 0; i < 7; i++) {
        const f = 1 - ((flow * 0.5 + i / 7 + s.phase) % 1), at = Math.min(Math.floor(f * (VP - 1)), VP - 1), size = 1.1 + (i % 3) * 0.5;
        put(SOFT, vx[at], vy[at], size, strength * Math.sin(Math.PI * f) ** 0.5);
      }
    }
    function stream2d(s) {
      ctx.globalCompositeOperation = 'lighter';
      streaming(s, puts(ctx));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    const fleshAt = (s, i) => mix(DARK, THIN, ease(3.4, 0.8, s.rad[i]));
    function flesh(c, s) {
      const fill = c.createLinearGradient(vx[0], vy[0], vx[VP - 1] + 0.01, vy[VP - 1]);
      for (let i = 0; i < NP; i++) fill.addColorStop(i / (NP - 1), rgb(fleshAt(s, i)));
      c.fillStyle = fill;
      ribbon(c, 0.74);
    }
    function gloss(line) {
      for (let i = 0; i + 2 < VP; i += 2) {
        const r = (vr[i] + vr[i + 2]) / 2;
        if (r < 0.75) continue;
        const tx = vx[i + 2] - vx[i], ty = vy[i + 2] - vy[i], L = Math.hypot(tx, ty) || 1;
        const nx = -ty / L, ny = tx / L, f = nx * glow.x + ny * glow.y, off = (f < 0 ? -1 : 1) * r * 0.42;
        line(vx[i] + nx * off, vy[i] + ny * off, vx[i + 2] + nx * off, vy[i + 2] + ny * off, Math.max(0.35, r * 0.28), SHINE, 0.1 + 0.62 * Math.abs(f) ** 1.6);
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
    // Hundreds of small shapes are much slower through a clip: draw on a layer cut to the body once, then add it.
    function within(paint) {
      const at = rect(hull, dpr * scale, 2, shape);
      sil.setTransform(1, 0, 0, 1, 0, 0);
      if (silAt) sil.clearRect(...silAt);
      silAt = at;
      if (!at) return;
      sil.save();
      sil.beginPath();
      sil.rect(...at);
      sil.clip();
      world(sil, dpr * scale);
      paint(sil);
      world(sil, dpr * scale);
      sil.globalAlpha = 1;
      sil.globalCompositeOperation = 'destination-in';
      sil.fillStyle = '#000';
      closed(sil);
      sil.fill();
      sil.restore();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(shape, ...at, ...at);
      ctx.restore();
    }
    const lightAt = () => Math.atan2(glow.y, glow.x);
    function kickAt() {
      const a = lightAt() + Math.PI + 0.7 + 0.2 * Math.sin(time * 0.6), k = radius(a) * (0.66 + 0.05 * Math.sin(time * 0.8));
      return [blob.x + Math.cos(a) * k, blob.y + Math.sin(a) * k, a + Math.PI / 2];
    }
    function shaded() {
      const light = lightAt(), r = radius(light);
      within(c => {
        c.globalCompositeOperation = 'lighter';
        motes(puts(c));
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      });
      ctx.save();
      closed(ctx);
      ctx.clip();
      const sheen = ctx.createRadialGradient(blob.x + glow.x * r * 0.42, blob.y + glow.y * r * 0.42, 0, blob.x, blob.y, r * 1.15);
      sheen.addColorStop(0, shine(0.2));
      sheen.addColorStop(0.45, shine(0.05));
      sheen.addColorStop(1, shine(0));
      ctx.fillStyle = sheen;
      const [w, h] = area();
      ctx.fillRect(0, 0, w, h + under);
      const pan = ctx.createRadialGradient(blob.x, blob.y, r * 0.5, blob.x, blob.y, r * 0.86);
      pan.addColorStop(0, shine(0.1));
      pan.addColorStop(0.45, shine(0.34));
      pan.addColorStop(1, shine(0.92));
      ctx.fillStyle = pan;
      const take = blob.take;
      blob.take = 0;
      ctx.shadowColor = shine(0.5);
      ctx.shadowBlur = 2.5 * scale * dpr;
      pane(ctx, light - 0.56, light - 0.05, 0.56, 0.84);
      pane(ctx, light + 0.05, light + 0.56, 0.56, 0.84);
      ctx.shadowBlur = 0;
      blob.take = take;
      const [kx, ky, ka] = kickAt();
      ctx.fillStyle = shine(0.55);
      ctx.beginPath();
      ctx.ellipse(kx, ky, 3.2, 1.3, ka, 0, 6.29);
      ctx.fill();
      ctx.restore();
    }

    function byDay() {
      const S = dpr * scale, body = rgb(DARK);
      sil.setTransform(1, 0, 0, 1, 0, 0);
      if (silAt) sil.clearRect(...silAt);
      world(sil, S);
      sil.fillStyle = body;
      closed(sil);
      sil.fill();
      reset();
      cover(...hull);
      for (const s of strands) { view(s); ribbon(sil); }
      for (const d of drops) {
        if (d.up > 0.5) continue;
        sil.beginPath();
        if (d.path) { d.path(sil); d.path(tracer); } else {
          const r = d.r * Math.max(d.sq, 1 / d.sq);
          sil.ellipse(d.x, d.y, d.r * d.sq, d.r / d.sq, Math.atan2(d.dy, d.dx), 0, 6.29);
          cover(d.x - r, d.y - r, d.x + r, d.y + r);
        }
        sil.fill();
      }
      silAt = rect(ext, S, 2, shape);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (silAt) {
        ctx.shadowColor = `rgba(${glow.shadow}, 0.42)`;
        ctx.shadowOffsetX = glow.cast[0] * dpr; ctx.shadowOffsetY = glow.cast[1] * dpr; ctx.shadowBlur = glow.cast[2] * 2 * dpr;
        ctx.drawImage(shape, ...silAt, ...silAt);
        ctx.shadowColor = `rgba(${glow.shadow}, 0.6)`;
        ctx.shadowOffsetX = glow.touch[0] * dpr; ctx.shadowOffsetY = glow.touch[1] * dpr; ctx.shadowBlur = glow.touch[2] * 2 * dpr;
        ctx.drawImage(shape, ...silAt, ...silAt);
      }
      ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      world(ctx, S);
      for (const s of strands) { view(s); flesh(ctx, s); }
      shaded();
      for (const s of strands) {
        if (s.state === 'recoil') continue;
        view(s);
        ctx.lineCap = 'round';
        gloss(lines(ctx));
        stream2d(s);
      }
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

    function glowAt(s, i, amount) {
      const strain = s.state === 'attached' ? clamp(s.stretch - 1, 0, 1) : 0, sp = i / (NP - 1);
      const a = (0.08 + 0.55 * ease(0.7, 3.6, s.rad[i]) + 0.45 * strain) * amount;
      return Math.min(a, 1) * ease(0, 0.2 * rooted(s), sp);
    }
    function emission(c, s, width = 1, amount = 1) {
      const fill = c.createLinearGradient(vx[0], vy[0], vx[VP - 1] + 0.01, vy[VP - 1]);
      for (let i = 0; i < NP; i++) fill.addColorStop(i / (NP - 1), `rgba(${LIT}, ${glowAt(s, i, amount).toFixed(3)})`);
      c.fillStyle = fill;
      ribbon(c, width);
    }

    const CLOUDS = Array.from({ length: 13 }, () => ({ rho: Math.sqrt(Math.random()) * 0.72, th: rand(0, 6.28), spin: rand(0.03, 0.09), size: rand(0.3, 0.62), a: rand(0.05, 0.12), ph: rand(0, 6.28) }));
    function clouds(put, level) {
      for (const k of CLOUDS) {
        const th = k.th + flow * k.spin, cr = radius(th), size = cr * k.size;
        put(GLOW, blob.x + Math.cos(th) * cr * k.rho, blob.y + Math.sin(th) * cr * k.rho, size, Math.min(k.a * (1.1 + 0.4 * Math.sin(flow * 0.3 + k.ph)) * level * 0.6, 1));
      }
    }

    function rim(line, level) {
      for (const [width, amount] of [[7, 0.14], [2.6, 0.5]]) {
        for (let i = 0; i < OUTLINE; i++) {
          const j = (i + 1) % OUTLINE, a = (i / OUTLINE) * Math.PI * 2;
          const v = 0.5 + 0.26 * Math.sin(3 * a + time * 0.4 + 1) + 0.15 * Math.sin(7 * a - time * 0.6) + 0.09 * Math.sin(13 * a + time * 0.9);
          let open = 1;
          for (const s of strands) if (s.kind === 'reach') open *= 1 - 0.9 * bell(turn(a - s.a), 0.13);
          line(ox[i], oy[i], ox[j], oy[j], width, LIT, amount * level * (0.14 + v * v * 1.3) * open);
        }
      }
    }
    function surface(c, level) {
      c.lineCap = 'round';
      rim(lines(c), level);
      const light = lightAt(), r = radius(light), lamp = glow.n;
      c.save();
      c.translate(blob.x + glow.x * r * 0.66, blob.y + glow.y * r * 0.66);
      c.rotate(light);
      c.scale(0.28, 0.8);
      const sheen = c.createRadialGradient(0, 0, 0, 0, 0, r);
      sheen.addColorStop(0, `rgba(255, 228, 196, ${(0.13 * lamp).toFixed(3)})`);
      sheen.addColorStop(1, 'rgba(255, 228, 196, 0)');
      c.fillStyle = sheen;
      c.beginPath();
      c.arc(0, 0, r, 0, 6.29);
      c.fill();
      c.restore();
      const k = r * 0.62;
      c.save();
      c.translate(blob.x + glow.x * k, blob.y + glow.y * k);
      c.rotate(light + Math.PI / 2);
      c.scale(1, 0.5);
      const bulb = c.createRadialGradient(0, 0, 0, 0, 0, 3.4);
      bulb.addColorStop(0, `rgba(${LAMP}, ${(0.32 * lamp).toFixed(3)})`);
      bulb.addColorStop(0.5, `rgba(${LAMP}, ${(0.12 * lamp).toFixed(3)})`);
      bulb.addColorStop(1, `rgba(${LAMP}, 0)`);
      c.fillStyle = bulb;
      c.beginPath();
      c.arc(0, 0, 3.4, 0, 6.29);
      c.fill();
      c.restore();
    }

    function skin(s, level, stroke) {
      const line = (at, phase) => {
        for (let i = 0; i < VP - 1; i++) {
          const j = at(i), k = at(i + 1), sp = i / (VP - 1), r = vr[i];
          const v = 0.55 + 0.3 * Math.sin(sp * 11 + s.phase + phase + time * 0.7) + 0.15 * Math.sin(sp * 27 - time * 1.1 + phase);
          const a = level * ease(0.05 * k, 0.3 * k, sp) * ease(0.5, 1.6, r) * (0.1 + 0.75 * v * v);
          stroke(edgeX[j], edgeY[j], edgeX[k], edgeY[k], Math.min(0.45 + r * 0.2, 1.1), LIT, a);
        }
      };
      line(i => i, 0);
      line(i => VP * 2 - 1 - i, 2.1);
    }
    function trail(line) {
      for (let i = 1; i < tracks.length; i++) {
        const t = tracks[i];
        let before = null;
        for (let j = i - 1; j >= Math.max(i - 8, 0); j--) if (tracks[j].of === t.of) { before = tracks[j]; break; }
        if (!before || Math.hypot(t.x - before.x, t.y - before.y) > 40) continue;
        line(before.x, before.y, t.x, t.y, t.r * 1.4 * (1 - t.age / 6), LIT, 0.16 * glow.n * (1 - t.age / 3));
      }
    }

    const AWAY = 4000;
    // Glow gradients band where the browser does not dither: a grain of a shade or two breaks them up.
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
    const grainAt = D => (opts.grainAt ? opts.grainAt(D, dpr * scale) : [Math.round((canvas.width - D) / 2), Math.round((canvas.height - D) / 2)]);
    function nightLevel() {
      sinceNight = clamp(time - lastNight, 0, 0.1);
      lastNight = time;
      return glow.n * (0.68 + 0.42 * glow.stirred) * (0.94 + 0.06 * Math.sin(time * 0.9));
    }
    function byNight() {
      const S = dpr * scale, L = S / 3, n = glow.n, r = BODY * blob.size, level = nightLevel();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      lo.setTransform(1, 0, 0, 1, 0, 0);
      if (loAt) lo.clearRect(...loAt);
      world(lo, L);
      lo.fillStyle = `rgba(${LIT}, 0.8)`;
      closed(lo);
      lo.fill();
      reset();
      cover(...hull);
      for (const s of strands) { view(s); emission(lo, s); }
      loAt = rect(ext, L, 2, low);
      pool.setTransform(1, 0, 0, 1, 0, 0);
      if (spillAt) pool.clearRect(...spillAt);
      pool.globalCompositeOperation = 'lighter';
      pool.shadowOffsetX = AWAY;
      spillAt = widen(loAt, Math.ceil(3 * 48 * L) + 2, spill);
      if (loAt) {
        [[5, 0.45], [16, 0.32], [48, 0.2]].forEach(([spread, amount]) => {
          pool.shadowColor = `rgba(${LIT}, ${amount})`;
          pool.shadowBlur = 2 * spread * L;
          pool.drawImage(low, ...loAt, loAt[0] - AWAY, loAt[1], loAt[2], loAt[3]);
        });
        ctx.globalAlpha = level;
        blowUp(ctx, spill, spillAt);
        ctx.globalAlpha = 1;
      }

      world(ctx, S);
      const g = opts.glass && opts.glass();
      if (g) {
        const near = ctx.createRadialGradient(blob.x, blob.y, r * 0.6, blob.x, blob.y, g.far);
        near.addColorStop(0, `rgba(${LIT}, ${(0.5 * level).toFixed(3)})`);
        near.addColorStop(1, `rgba(${LIT}, 0)`);
        ctx.strokeStyle = near;
        ctx.lineWidth = g.width;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, 6.29);
        ctx.stroke();
      }
      const deep = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, r * 1.1);
      deep.addColorStop(0, `rgba(${DEEP}, 0.96)`);
      deep.addColorStop(1, `rgba(${DEEP}, 0.8)`);
      ctx.fillStyle = deep;
      closed(ctx);
      ctx.fill();
      for (const s of strands) {
        view(s);
        const fill = ctx.createLinearGradient(vx[0], vy[0], vx[VP - 1] + 0.01, vy[VP - 1]);
        for (let i = 0; i < NP; i++) fill.addColorStop(i / (NP - 1), `rgba(${DEEP}, ${(0.7 * ease(0.4, 2.4, s.rad[i])).toFixed(3)})`);
        ctx.fillStyle = fill;
        ribbon(ctx);
      }

      const inside = rect(hull, L, 2, low);
      within(c => {
        c.globalCompositeOperation = 'lighter';
        c.setTransform(1, 0, 0, 1, 0, 0);
        [[0.72, 0.26, 0.045], [0.48, 0.18, 0.025], [0.17, 0.08, 0.018]].forEach(([inset, soft, amount]) => {
          if (!inside) return;
          lo.setTransform(1, 0, 0, 1, 0, 0);
          if (loAt) lo.clearRect(...loAt);
          loAt = inside;
          world(lo, L);
          lo.fillStyle = `rgb(${LIT})`;
          closed(lo);
          lo.fill();
          // Draw first, then blur as a picture: a shape blurred on the CPU is slower than all the rest.
          const m = 4 * r * soft + 4, P = Math.ceil(m * L) + 4;
          if (cut.width < low.width + 2 * P || cut.height < low.height + 2 * P) {
            cut.width = low.width + 2 * P;
            cut.height = low.height + 2 * P;
          }
          const x0 = Math.max(Math.floor((hull[0] - m) * L) - 2, -P), x1 = Math.min(Math.ceil((hull[2] + m) * L) + 2, low.width + P);
          const y0 = Math.max(Math.floor((hull[1] - m - top) * L) - 2, -P), y1 = Math.min(Math.ceil((hull[3] + m - top) * L) + 2, low.height + P);
          if (x1 > x0 && y1 > y0) {
            cutter.setTransform(1, 0, 0, 1, 0, 0);
            cutter.clearRect(x0 + P, y0 + P, x1 - x0, y1 - y0);
            cutter.setTransform(L, 0, 0, L, P, P - top * L);
            cutter.fillStyle = '#000';
            cutter.beginPath();
            cutter.rect(hull[0] - m, hull[1] - m, hull[2] - hull[0] + 2 * m, hull[3] - hull[1] + 2 * m);
            closed(cutter, inset, false);
            cutter.fill('evenodd');
            lo.save();
            lo.setTransform(1, 0, 0, 1, 0, 0);
            lo.globalCompositeOperation = 'destination-out';
            lo.shadowColor = '#000';
            lo.shadowOffsetX = AWAY;
            lo.shadowBlur = 2 * r * soft * L;
            lo.drawImage(cut, x0 + P, y0 + P, x1 - x0, y1 - y0, x0 - AWAY, y0, x1 - x0, y1 - y0);
            lo.restore();
          }
          c.globalAlpha = amount * level;
          blowUp(c, low, inside);
        });
        world(c, S);
        clouds(puts(c), level);
        motes(puts(c));
        c.globalAlpha = 1;
        surface(c, level * 0.7);
      });
      ctx.save();
      closed(ctx);
      ctx.clip();
      ctx.globalCompositeOperation = 'source-over';
      const light = lightAt(), lr = radius(light);
      const pan = ctx.createRadialGradient(blob.x, blob.y, lr * 0.5, blob.x, blob.y, lr * 0.86);
      pan.addColorStop(0, `rgba(${LAMP}, 0)`);
      pan.addColorStop(0.45, `rgba(${LAMP}, ${(0.08 * n).toFixed(3)})`);
      pan.addColorStop(1, `rgba(${LAMP}, ${(0.26 * n).toFixed(3)})`);
      ctx.fillStyle = pan;
      const take = blob.take;
      blob.take = 0;
      pane(ctx, light - 0.56, light - 0.05, 0.56, 0.84);
      pane(ctx, light + 0.05, light + 0.56, 0.56, 0.84);
      blob.take = take;
      ctx.restore();

      world(ctx, S);
      for (const s of strands) {
        view(s);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = level;
        emission(ctx, s, 0.22, 0.7);
        emission(ctx, s, 0.5, 0.3);
        emission(ctx, s, 0.85, 0.12);
        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        skin(s, level * 0.35, lines(ctx));
        ctx.globalCompositeOperation = 'source-over';
        if (s.state === 'recoil') continue;
        ctx.globalAlpha = 0.3 * n;
        gloss(lines(ctx));
        ctx.globalAlpha = 1;
      }
      for (const s of strands) { view(s); stream2d(s); }

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      trail(lines(ctx));
      for (const d of drops) {
        const dr = d.r * (1 + d.up * 0.028), a = Math.atan2(d.dy, d.dx);
        if (d.up < 0.5) { ctx.globalAlpha = n * 0.14; ctx.drawImage(GLOW, d.x - dr * 3, d.y - dr * 3, dr * 6, dr * 6); }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(${DEEP}, 0.92)`;
        ctx.beginPath();
        if (d.path) d.path(ctx);
        else ctx.ellipse(d.x, d.y, dr * d.sq, dr / d.sq, a, 0, 6.29);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        if (d.path) {
          ctx.save();
          ctx.beginPath();
          d.path(ctx);
          ctx.clip();
          ctx.lineJoin = 'round';
          for (const [width, amount] of [[9, 0.12], [3, 0.4]]) {
            ctx.strokeStyle = `rgba(${LIT}, ${(amount * n).toFixed(3)})`;
            ctx.lineWidth = width;
            ctx.beginPath();
            d.path(ctx);
            ctx.stroke();
          }
          for (const [sx, sy, b] of specksOf(d)) {
            ctx.globalAlpha = n * 0.45 * b;
            ctx.drawImage(GLOW, d.x + sx - 8, d.y + sy - 8, 16, 16);
            ctx.globalAlpha = n * 0.8 * b;
            ctx.drawImage(SOFT, d.x + sx - 1.4, d.y + sy - 1.4, 2.8, 2.8);
          }
          ctx.restore();
          continue;
        }
        ctx.globalAlpha = n * 0.7;
        ctx.drawImage(GLOW, d.x - dr, d.y - dr, dr * 2, dr * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(${LAMP}, ${(0.5 * n).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(d.x + glow.x * dr * 0.4, d.y + glow.y * dr * 0.4, dr * 0.2, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      makeGrain();
      const [gx, gy] = grainAt(grain.width);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = n;
      ctx.drawImage(grain, gx, gy);
      ctx.globalAlpha = 1;
    }
    const specksOf = d => (d.specks = d.specks || Array.from({ length: 9 }, () => [rand(-22, 22), rand(-16, 16), rand(0.4, 1)]));

    const batch = () => ({ f: new Float32Array(16 * 128), n: 0 });
    const shapes = () => ({ v: new Float32Array(8 * 2048), n: 0, ix: new Uint32Array(3 * 2048), k: 0 });
    const B = { sil: batch(), clip: batch(), over: batch(), add: batch(), drops: batch(), ring: batch(), skin: batch(), gloss: batch(), a: batch(), b: batch(), c: batch(), eyes: batch() };
    const M = { sil: shapes(), flesh: shapes(), pool: shapes(), gel: shapes(), em: shapes() };
    const tints = new Map();
    const tint = c => {
      let t = tints.get(c);
      if (!t) { t = (typeof c === 'string' ? c.split(',') : c).map(v => +v / 255); tints.set(c, t); }
      return t;
    };
    const cSOFT = tint('190, 236, 165'), cGLOW = tint(LIT), cSHINE = tint(SHINE), cLAMP = tint(LAMP), cDARK = tint(DARK), cDEEP = tint(DEEP), cWHITE = [1, 1, 1];
    function put(l, kind, clip, a0, a1, a2, a3, b0, b1, b2, b3, c, alpha) {
      if (l.f.length < (l.n + 1) * 16) { const f = new Float32Array(l.f.length * 2); f.set(l.f); l.f = f; }
      const f = l.f, i = l.n++ * 16;
      f[i] = a0; f[i + 1] = a1; f[i + 2] = a2; f[i + 3] = a3;
      f[i + 4] = b0; f[i + 5] = b1; f[i + 6] = b2; f[i + 7] = b3;
      f[i + 8] = c[0]; f[i + 9] = c[1]; f[i + 10] = c[2]; f[i + 11] = alpha;
      f[i + 12] = kind; f[i + 13] = clip; f[i + 14] = 0; f[i + 15] = 0;
    }
    const dots = (l, clip = 0) => (img, x, y, h, a) => put(l, 0, clip, x, y, h, h, 0, 0.3, 1, 0.55, img === GLOW ? cGLOW : cSOFT, a);
    const strokes = (l, clip = 0, k = 1) => (x0, y0, x1, y1, w, colour, a) => put(l, 1, clip, x0, y0, x1, y1, w / 2, 0, 0, 0, tint(colour), a * k);
    const ellipse = (l, x, y, rx, ry, rot, soft, c, a, clip = 0) => put(l, 2, clip, x, y, rx, ry, rot, soft, 0, 0, c, a);

    const NS = VP * 2, gx = new Float32Array(NS), gy = new Float32Array(NS), hx = new Float32Array(NS), hy = new Float32Array(NS);
    const stop = new Float32Array(NP * 4), hue = [0, 0, 0];
    let fx = 0, fy = 0, fdx = 0, fdy = 0, finv = 0;
    function sections() {
      edges(1);
      let k = 0;
      const two = (lx, ly, rx, ry) => { gx[k] = (lx + rx) / 2; gy[k] = (ly + ry) / 2; hx[k] = (lx - rx) / 2; hy[k] = (ly - ry) / 2; k++; };
      const R = i => VP * 2 - 1 - i;
      two(edgeX[0], edgeY[0], edgeX[R(0)], edgeY[R(0)]);
      for (let i = 1; i < VP; i++) {
        const lx = (edgeX[i - 1] + edgeX[i]) / 2, ly = (edgeY[i - 1] + edgeY[i]) / 2, rx = (edgeX[R(i - 1)] + edgeX[R(i)]) / 2, ry = (edgeY[R(i - 1)] + edgeY[R(i)]) / 2;
        const l2x = (edgeX[i] + edgeX[i + 1]) / 2, l2y = (edgeY[i] + edgeY[i + 1]) / 2, r2x = (edgeX[R(i)] + edgeX[R(i + 1)]) / 2, r2y = (edgeY[R(i)] + edgeY[R(i + 1)]) / 2;
        two(lx, ly, rx, ry);
        two(0.25 * lx + 0.5 * edgeX[i] + 0.25 * l2x, 0.25 * ly + 0.5 * edgeY[i] + 0.25 * l2y, 0.25 * rx + 0.5 * edgeX[R(i)] + 0.25 * r2x, 0.25 * ry + 0.5 * edgeY[R(i)] + 0.25 * r2y);
      }
      two(vx[VP - 1], vy[VP - 1], vx[VP - 1], vy[VP - 1]);
      fx = vx[0]; fy = vy[0]; fdx = vx[VP - 1] + 0.01 - fx; fdy = vy[VP - 1] - fy; finv = 1 / (fdx * fdx + fdy * fdy);
    }
    function along(x, y) {
      const t = clamp(((x - fx) * fdx + (y - fy) * fdy) * finv, 0, 1), f = t * (NP - 1), j = Math.min(Math.floor(f), NP - 2), u = f - j, a = j * 4, b = a + 4;
      hue[0] = stop[a] + (stop[b] - stop[a]) * u;
      hue[1] = stop[a + 1] + (stop[b + 1] - stop[a + 1]) * u;
      hue[2] = stop[a + 2] + (stop[b + 2] - stop[a + 2]) * u;
      return stop[a + 3] + (stop[b + 3] - stop[a + 3]) * u;
    }
    function paint(c, alpha) {
      for (let i = 0; i < NP; i++) {
        const k = typeof c === 'function' ? c(i) : c;
        stop[i * 4] = k[0]; stop[i * 4 + 1] = k[1]; stop[i * 4 + 2] = k[2]; stop[i * 4 + 3] = alpha(i);
      }
    }
    function vert(m, x, y, a, across, half) {
      if (m.v.length < (m.n + 1) * 8) { const v = new Float32Array(m.v.length * 2); v.set(m.v); m.v = v; }
      const v = m.v, i = m.n * 8;
      v[i] = x; v[i + 1] = y; v[i + 2] = hue[0] * a; v[i + 3] = hue[1] * a; v[i + 4] = hue[2] * a; v[i + 5] = a; v[i + 6] = across; v[i + 7] = half;
      return m.n++;
    }
    function tri(m, a, b, c) {
      if (m.ix.length < m.k + 3) { const ix = new Uint32Array(m.ix.length * 2); ix.set(m.ix); m.ix = ix; }
      m.ix[m.k++] = a; m.ix[m.k++] = b; m.ix[m.k++] = c;
    }
    function band(m, width, k) {
      let nx = 1, ny = 0;
      for (let i = 0; i < NS; i++) {
        const ux = hx[i] * width, uy = hy[i] * width, len = Math.hypot(ux, uy);
        if (len > 1e-6) { nx = ux / len; ny = uy / len; }
        const h = len * k, half = Math.max(h, 0.5), thin = Math.min(2 * h, 1), out = (half + 0.5) / k;
        const x0 = gx[i] + nx * out, y0 = gy[i] + ny * out, x1 = gx[i] - nx * out, y1 = gy[i] - ny * out;
        const v = vert(m, x0, y0, along(x0, y0) * thin, half + 0.5, half);
        vert(m, x1, y1, along(x1, y1) * thin, -half - 0.5, half);
        if (i) { tri(m, v - 2, v - 1, v); tri(m, v - 1, v + 1, v); }
      }
      const x = vx[VP - 1], y = vy[VP - 1], h = vr[VP - 1] * width * k, half = Math.max(h, 0.5), thin = Math.min(2 * h, 1), out = (half + 0.5) / k;
      const c = vert(m, x, y, along(x, y) * thin, 0, half);
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2, px = x + Math.cos(t) * out, py = y + Math.sin(t) * out;
        vert(m, px, py, along(px, py) * thin, half + 0.5, half);
        tri(m, c, c + 1 + i, c + 1 + ((i + 1) % 24));
      }
    }
    const pen = {
      buf: new Float32Array(1024), n: 0, x: 0, y: 0,
      add(x, y) { if (this.n < 512) { this.buf[this.n * 2] = x; this.buf[this.n * 2 + 1] = y; this.n++; } this.x = x; this.y = y; },
      beginPath() {}, closePath() {},
      moveTo(x, y) { this.add(x, y); }, lineTo(x, y) { this.add(x, y); },
      quadraticCurveTo(a, b, x, y) {
        const x0 = this.x, y0 = this.y;
        for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; this.add(u * u * x0 + 2 * u * t * a + t * t * x, u * u * y0 + 2 * u * t * b + t * t * y); }
      },
      bezierCurveTo(a, b, c, d, x, y) {
        const x0 = this.x, y0 = this.y;
        for (let i = 1; i <= 12; i++) {
          const t = i / 12, u = 1 - t;
          this.add(u * u * u * x0 + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * x, u * u * u * y0 + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * y);
        }
      },
      ellipse(x, y, rx, ry, rot = 0, s = 0, e = Math.PI * 2) {
        const c = Math.cos(rot), si = Math.sin(rot);
        for (let i = 0; i <= 24; i++) { const t = s + ((e - s) * i) / 24, px = Math.cos(t) * rx, py = Math.sin(t) * ry; this.add(x + c * px - si * py, y + si * px + c * py); }
      },
      arc(x, y, r, s = 0, e = Math.PI * 2) { this.ellipse(x, y, r, r, 0, s, e); },
      rect(x, y, w, h) { this.add(x, y); this.add(x + w, y); this.add(x + w, y + h); this.add(x, y + h); },
    };
    function traced(d) {
      pen.n = 0;
      d.path(pen);
      const step = Math.ceil(pen.n / 128) || 1, pts = new Float32Array(256);
      let k = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pen.n; i += step) {
        const x = pen.buf[i * 2], y = pen.buf[i * 2 + 1];
        pts[k * 2] = x; pts[k * 2 + 1] = y; k++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      cover(x0, y0, x1, y1);
      return { pts, n: k, rect: [x0 - 2, y0 - 2, x1 + 2, y1 + 2] };
    }
    function start() {
      for (const k in B) B[k].n = 0;
      for (const k in M) M[k].n = M[k].k = 0;
      reset();
      cover(...hull);
      const N = G.N, d = G.radData, take = blob.take;
      for (let i = 0; i < N; i++) d[i * 2] = radius((i / N) * Math.PI * 2);
      blob.take = 0;
      for (let i = 0; i < N; i++) d[i * 2 + 1] = take > 0.5 ? radius((i / N) * Math.PI * 2) : d[i * 2];
      blob.take = take;
    }
    function pixels(e, pad, free) {
      const S = dpr * scale;
      let x0 = Math.floor(e[0] * S) - pad, y0 = Math.floor((e[1] - top) * S) - pad, x1 = Math.ceil(e[2] * S) + pad, y1 = Math.ceil((e[3] - top) * S) + pad;
      if (!free) { x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, canvas.width); y1 = Math.min(y1, canvas.height); }
      return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
    }
    const grow = (R, by) => [R[0] - by, R[1] - by, R[2] + by, R[3] + by];
    const box = () => [hull[0] - 3, hull[1] - 3, hull[2] + 3, hull[3] + 3];
    function glDay() {
      const S = dpr * scale, light = lightAt(), r = radius(light);
      start();
      const [kx, ky, ka] = kickAt();
      ellipse(B.over, kx, ky, 3.2, 1.3, ka, 0, cSHINE, 0.55, 1);
      for (const s of strands) {
        view(s);
        sections();
        paint(cWHITE, () => 1);
        band(M.sil, 1, S);
        paint(i => fleshAt(s, i).map(v => v / 255), () => 1);
        band(M.flesh, 0.74, S);
        if (s.state === 'recoil') continue;
        gloss(strokes(B.over));
        streaming(s, dots(B.add));
      }
      motes(dots(B.clip, 1));
      const own = [];
      for (const d of drops) {
        const lift = 1 + d.up * 0.028, r = d.r * lift, a = Math.atan2(d.dy, d.dx);
        if (d.up <= 0.5) {
          if (d.path) own.push(traced(d));
          else {
            const k = d.r * Math.max(d.sq, 1 / d.sq);
            ellipse(B.sil, d.x, d.y, d.r * d.sq, d.r / d.sq, a, 0, cWHITE, 1);
            cover(d.x - k, d.y - k, d.x + k, d.y + k);
          }
        } else {
          const away = d.up * 0.5 * BIT;
          ellipse(B.drops, d.x - glow.x * away, d.y - glow.y * away, d.r, d.r * 0.9, a, (1 + d.up * 0.14) * S * BIT, tint(glow.shadow), 0.6 - d.up * 0.009);
          ellipse(B.drops, d.x, d.y, r * d.sq, r / d.sq, a, 0, cDARK, 1);
        }
        ellipse(B.drops, d.x + glow.x * r * 0.4, d.y + glow.y * r * 0.4, r * 0.22, r * 0.22, 0, 0, cSHINE, 0.7);
      }

      G.begin(canvas.width, canvas.height, S, top, blob.x, blob.y);
      const R = pixels(ext, 2);
      if (R) {
        const sil = G.target('sil', 1, 'r');
        G.to(sil);
        G.wipe();
        G.only(R);
        G.blend('max');
        G.body(0, box(), { col: [1, 1, 1, 1] });
        G.mesh(M.sil);
        G.inst(B.sil);
        for (const p of own) G.poly(p, 0, [1, 1, 1, 1]);
        const sc = glow.cast[2] * dpr, st = glow.touch[2] * dpr;
        const cast = G.gauss('cast', sil, [sc, sc, sc, sc], R), touch = G.gauss('touch', sil, [st, st, st, st], R);
        const off = [glow.cast[0] * dpr, glow.cast[1] * dpr, glow.touch[0] * dpr, glow.touch[1] * dpr];
        G.to(G.screen);
        G.only(grow(R, Math.ceil(3 * Math.max(sc, st) + Math.max(...off.map(Math.abs))) + 2));
        G.blend('over');
        G.shadow(sil, cast, touch, off, tint(glow.shadow), cDARK);
      }
      G.to(G.screen);
      G.only(null);
      G.blend('over');
      G.mesh(M.flesh);
      G.blend('add');
      G.inst(B.clip);
      G.blend('over');
      G.body(2, box(), { col: [...cSHINE, 1], p: [blob.x + glow.x * r * 0.42, blob.y + glow.y * r * 0.42, r * 1.15, 0], q: [light, r, 1.25 * scale * dpr, 0] });
      G.inst(B.over);
      G.blend('add');
      G.inst(B.add);
      G.blend('over');
      G.inst(B.drops);
      glOver();
    }
    function glNight() {
      const S = dpr * scale, n = glow.n, r = BODY * blob.size, level = nightLevel(), light = lightAt(), lr = radius(light), PF = 3;
      start();
      for (const s of strands) {
        view(s);
        sections();
        paint(cWHITE, i => glowAt(s, i, 1));
        band(M.pool, 1, S / PF);
        paint(cDEEP, i => 0.7 * ease(0.4, 2.4, s.rad[i]));
        band(M.gel, 1, S);
        for (const [width, amount] of [[0.22, 0.7], [0.5, 0.3], [0.85, 0.12]]) {
          paint(cGLOW, i => glowAt(s, i, amount) * level);
          band(M.em, width, S);
        }
        edges(0.85);
        skin(s, level * 0.35, strokes(B.skin));
        if (s.state !== 'recoil') gloss(strokes(B.gloss, 0, 0.3 * n));
        streaming(s, dots(B.add));
      }
      trail(strokes(B.add));
      clouds(dots(B.clip, 1), level);
      motes(dots(B.clip, 1));
      rim(strokes(B.clip, 1), level * 0.7);
      const k = lr * 0.62;
      put(B.clip, 0, 1, blob.x + glow.x * lr * 0.66, blob.y + glow.y * lr * 0.66, lr * 0.28, lr * 0.8, light, 0.5, 1, 0.5, tint('255, 228, 196'), 0.13 * n);
      put(B.clip, 0, 1, blob.x + glow.x * k, blob.y + glow.y * k, 3.4, 1.7, light + Math.PI / 2, 0.5, 1, 0.375, cLAMP, 0.32 * n);
      const g = opts.glass && opts.glass();
      if (g) put(B.ring, 3, 0, g.x, g.y, g.r, g.width / 2, blob.x, blob.y, r * 0.6, g.far, cGLOW, 0.5 * level);
      const own = [];
      for (const d of drops) {
        const dr = d.r * (1 + d.up * 0.028), a = Math.atan2(d.dy, d.dx);
        if (d.up < 0.5) dots(B.a)(GLOW, d.x, d.y, dr * 3, n * 0.14);
        if (d.path) {
          const p = traced(d), sp = new Float32Array(36);
          specksOf(d).forEach(([x, y, b], i) => { sp[i * 4] = d.x + x; sp[i * 4 + 1] = d.y + y; sp[i * 4 + 2] = b; });
          p.specks = sp;
          own.push(p);
          continue;
        }
        ellipse(B.b, d.x, d.y, dr * d.sq, dr / d.sq, a, 0, cDEEP, 0.92);
        dots(B.c)(GLOW, d.x, d.y, dr, n * 0.7);
        ellipse(B.c, d.x + glow.x * dr * 0.4, d.y + glow.y * dr * 0.4, dr * 0.2, dr * 0.2, 0, 0, cLAMP, 0.5 * n);
      }

      G.begin(canvas.width, canvas.height, S, top, blob.x, blob.y);
      const R = pixels(ext, 2);
      if (R) {
        const src = G.target('pool', PF, 'r');
        G.to(src);
        G.wipe();
        G.only(R);
        G.blend('over');
        G.body(0, box(), { col: [0.8, 0.8, 0.8, 0.8] });
        G.mesh(M.pool);
        const t = [5, 16, 48].map((spread, i) => G.gauss('pool' + i, src, [spread * S, spread * S, spread * S, spread * S], R));
        G.to(G.screen);
        G.only(grow(R, Math.ceil(3 * 48 * S) + 2));
        G.blend('add');
        G.pool(t, [0.45, 0.32, 0.2, level], cGLOW);
      }
      G.to(G.screen);
      G.only(null);
      G.blend('over');
      G.inst(B.ring);
      G.body(1, box(), { col: [...cDEEP, 1], p: [r * 1.1, 0, 0, 0] });
      G.mesh(M.gel);
      const Ri = pixels(hull, 2, true);
      if (Ri) {
        const sig = [0.26, 0.18, 0.08, 0.26].map(soft => r * soft * S);
        let f = 3;
        while (sig[0] / f > 14) f *= 2;
        const masks = G.target('inner', f, 'rgba', 16 * Math.ceil((3 * sig[0]) / f / 16 + 0.25));
        G.to(masks);
        G.wipe();
        G.only(Ri);
        G.blend('none');
        G.body(5, box());
        const lit = G.gauss('inner*', masks, sig, Ri, 14);
        G.to(G.screen);
        G.only(Ri);
        G.blend('add');
        G.body(3, box(), { col: [...cGLOW, 1], p: [0.045 * level, 0.025 * level, 0.018 * level, 0], tex: lit });
      }
      G.only(null);
      G.blend('add');
      G.inst(B.clip);
      G.blend('over');
      G.body(4, box(), { col: [...cLAMP, 1], q: [light, lr, 0, n] });
      G.blend('add');
      G.mesh(M.em);
      G.inst(B.skin);
      G.blend('over');
      G.inst(B.gloss);
      G.blend('add');
      G.inst(B.add);
      G.inst(B.a);
      G.blend('over');
      G.inst(B.b);
      for (const p of own) G.poly(p, 0, [cDEEP[0] * 0.92, cDEEP[1] * 0.92, cDEEP[2] * 0.92, 0.92]);
      G.blend('add');
      G.inst(B.c);
      for (const p of own) G.poly(p, 1, [0, 0, 0, 0], n, p.specks);
      const D = Math.ceil(620 * scale * dpr), [x, y] = grainAt(D);
      G.blend('over');
      G.only([x, y, x + D, y + D]);
      G.grain(x, y, D, n);
      glOver();
    }
    function glOver() {
      G.only(null);
      if (peering) {
        const put = dots(B.eyes);
        eyesOf(...peering, (x, y, size, a) => put(SOFT, x, y, size, a));
        G.blend('add');
        G.inst(B.eyes);
      }
      if (hole && hole.length > 2) {
        const pts = new Float32Array(256), n = Math.min(hole.length, 128);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < n; i++) {
          const [x, y] = hole[i];
          pts[i * 2] = x; pts[i * 2 + 1] = y;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        G.blend('out');
        G.poly({ pts, n, rect: [x0 - 2, y0 - 2, x1 + 2, y1 + 2] }, 0, [1, 1, 1, 1]);
      }
    }
    function over() {
      if (peering) {
        world(ctx, dpr * scale);
        drawEyes(ctx, ...peering);
      }
      if (hole && hole.length > 2) {
        world(ctx, dpr * scale);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.beginPath();
        for (const [x, y] of hole) ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Making a WebGL context waits on a busy GPU at page load: wait for steady frames (or ~4s). Until then, draw on the canvas. prepare() resolves true if on the GPU.
    let G = null, tried = false, waiting = null;
    function prepare() {
      if (waiting) return waiting;
      waiting = new Promise(done => {
        if ((opts.gl ?? Fizz.gl) === false) { tried = true; return done(false); }
        let since = 0, last = 0, calm = 0;
        const tick = now => {
          if (!tried) {
            if (document.readyState === 'complete') {
              since = since || now;
              calm = last && now - last < 20 ? calm + 1 : 0;
              last = now;
              const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0], loaded = (nav && nav.loadEventEnd) || 0;
              if (calm >= 20 || now - since > 4000 || (loaded && now - loaded > 3000)) {
                tried = true;
                // Never copy between the two canvases: in Firefox that reads the whole picture back from the GPU every frame.
                G = kit(layer(canvas ? canvas.width : 1, canvas ? canvas.height : 1));
              }
            }
          } else if (!G || G.lost || G.ready()) return done(!!G && !G.lost);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return waiting;
    }
    function card() {
      prepare();
      if (G && G.lost) {
        G.el.remove();
        if (shown) shown.disconnect();
        shown = G = null;
      }
      return G && G.ready() ? G : null;
    }
    function draw() {
      if (!canvas.width || !canvas.height) return;
      outline();
      if (card()) {
        show();
        if (glow.night) glNight();
        else glDay();
      } else {
        flat();
        if (glow.night) byNight();
        else byDay();
        over();
      }
      peering = null;
    }
    let shown = null;
    function show() {
      if (!shown) {
        shown = new MutationObserver(match);
        shown.observe(canvas, { attributes: true, attributeFilter: ['class', 'style'] });
        G.el.setAttribute('aria-hidden', 'true');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        match();
      }
      if (G.el.previousSibling !== canvas && canvas.parentNode) {
        canvas.after(G.el);
        shown.observe(canvas.parentNode, { childList: true });
      }
    }
    function match() {
      if (!G) return;
      if (!canvas.isConnected) { G.el.remove(); return; }
      G.el.className = canvas.className;
      G.el.style.cssText = canvas.style.cssText;
    }

    function mount(el) {
      if (shown) { shown.disconnect(); shown = null; }
      if (G) G.el.remove();
      canvas = el;
      ctx = canvas.getContext('2d');
    }
    function flat() {
      if (shape) return;
      shape = layer();
      sil = shape.getContext('2d');
      low = layer();
      lo = low.getContext('2d');
      cut = layer();
      cutter = cut.getContext('2d');
      spill = layer();
      pool = spill.getContext('2d');
      fit();
    }
    function fit() {
      // Sizing a canvas clears it.
      silAt = loAt = spillAt = null;
      if (!shape) return;
      shape.width = canvas.width;
      shape.height = canvas.height;
      low.width = spill.width = Math.ceil(canvas.width / 3);
      low.height = spill.height = Math.ceil(canvas.height / 3);
    }
    function size(w, h, ratio = 1, zoom = 1, from = 0) {
      dpr = ratio; scale = zoom; top = from;
      canvas.width = w;
      canvas.height = h;
      fit();
    }

    function eyes() {
      return { blink: 3, pair: [-1, 1].map(side => Array.from({ length: 16 }, () => {
        const a = rand(0, 6.28), d = Math.sqrt(Math.random());
        return { side, u: Math.cos(a) * d, v: Math.sin(a) * d, size: rand(0.05, 0.1), ph: rand(0, 6.28) };
      })) };
    }
    function drawEyes(c, e, x, y, R, nx, ny, look, open) {
      c.globalCompositeOperation = 'lighter';
      eyesOf(e, x, y, R, nx, ny, look, open, (ex, ey, size, a) => {
        c.globalAlpha = a;
        c.drawImage(SOFT, ex - size, ey - size, size * 2, size * 2);
      });
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    function eyesOf(e, x, y, R, nx, ny, look, open, put) {
      if (time > e.blink + 0.3) e.blink = time + rand(2, 5);
      const tx = -ny, ty = nx, shut = 1 - 0.9 * bell(time - e.blink, 0.08);
      for (const eye of e.pair) for (const m of eye) {
        const ex = x + tx * (m.side * R * 0.3 + look) + tx * m.u * R * 0.075 + nx * m.v * R * 0.09 * shut, ey = y + ty * (m.side * R * 0.3 + look) + ty * m.u * R * 0.075 + ny * m.v * R * 0.09 * shut;
        put(ex, ey, m.size * R * 1.1, open * (0.68 + 0.3 * Math.sin(time * 2 + m.ph)));
      }
    }
    function peer(...at) { peering = at; }

    return {
      blob, strands, drops, tracks, glow,
      get time() { return time; }, set time(t) { time = t; },
      get aware() { return aware; }, set aware(a) { aware = a; },
      get focus() { return focus; }, set focus(f) { focus = f; },
      get probeAt() { return probeAt; }, set probeAt(a) { probeAt = a; },
      radius, edge, at, flash, ripple,
      sprout, reach, hair, probe, release,
      trace, flight, stir, move, ebb,
      get hole() { return hole; }, set hole(h) { hole = h; },
      mount, size, draw, eyes, drawEyes, peer, prepare,
    };
  }

  window.Fizz = Object.assign(Fizz, { clamp, ease, rand, turn, bell, layer, rgb, shine, DARK, SOFT, NP, SUB, LIT });
})();
