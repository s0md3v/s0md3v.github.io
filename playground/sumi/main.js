const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });

if (!gl) {
    alert('WebGL 2.0 not supported');
}

const COMMON_GLSL = `
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform float uBlend;
uniform int uDistortType;
uniform float uDistortStrength;
uniform float uDistortScale;
uniform float uNoise;
uniform float uDither;
uniform vec2 uMouse;
uniform float uChromatic;
uniform float uSymmetry;
uniform float uPaletteShift;
uniform vec2 uCenter;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec2 getSymmetry(vec2 uv) {
    if (uSymmetry < 0.5) return uv;
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float segments = floor(uSymmetry + 0.5);
    float tau = 6.283185;
    a = mod(a, tau / segments);
    a = abs(a - tau / (segments * 2.0));
    return vec2(cos(a), sin(a)) * r + 0.5;
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xx+p3.yz)*p3.zy);
}

vec2 swirlUV(vec2 uv) {
    vec2 c = uv - 0.5;
    float r = length(c);
    float angle = uDistortStrength * (1.0 - r);
    float ca = cos(angle);
    float sa = sin(angle);
    return vec2(ca * c.x - sa * c.y, sa * c.x + ca * c.y) + 0.5;
}

vec2 turbulentUV(vec2 uv) {
    float amp = uDistortStrength * 0.03;
    float freq = uDistortScale;
    uv.x += snoise(uv * freq) * amp;
    uv.y += snoise(uv * freq + vec2(10.0)) * amp;
    return uv;
}

vec2 lensUV(vec2 uv) {
    vec2 p = uv - 0.5;
    float r = length(p);
    float dr = r * (1.0 + uDistortStrength * 0.2 * r * r);
    return p * (dr / r) + 0.5;
}

vec2 polarUV(vec2 uv) {
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    a += uDistortStrength * r;
    return vec2(cos(a), sin(a)) * r + 0.5;
}

vec2 distortUV(vec2 uv) {
    uv = getSymmetry(uv);
    if (uDistortType == 1) return swirlUV(uv);
    if (uDistortType == 2) return turbulentUV(uv);
    if (uDistortType == 3) return lensUV(uv);
    if (uDistortType == 4) return polarUV(uv);
    return uv;
}

float getHeight(vec2 uv);

vec3 paletteColor(float t) {
    t = fract(t);
    
    float s = uPaletteShift * 4.0;
    int i = int(mod(floor(s), 4.0));
    float f = fract(s);
    
    vec3 cols[4] = vec3[4](uColor1, uColor2, uColor3, uColor4);
    vec3 c1 = mix(cols[i],          cols[(i+1)%4], f);
    vec3 c2 = mix(cols[(i+1)%4],    cols[(i+2)%4], f);
    vec3 c3 = mix(cols[(i+2)%4],    cols[(i+3)%4], f);
    vec3 c4 = mix(cols[(i+3)%4],    cols[i],       f);

    float p = 1.0 / max(uBlend * 0.5 + 0.1, 0.01);
    
    float w1 = pow(0.5 + 0.5 * cos(6.283185 * (t - 0.00)), p);
    float w2 = pow(0.5 + 0.5 * cos(6.283185 * (t - 0.25)), p);
    float w3 = pow(0.5 + 0.5 * cos(6.283185 * (t - 0.50)), p);
    float w4 = pow(0.5 + 0.5 * cos(6.283185 * (t - 0.75)), p);
    
    float totalW = w1 + w2 + w3 + w4;
    vec3 result = (c1 * w1 + c2 * w2 + c3 * w3 + c4 * w4) / totalW;

    float mixingMagnitude = 1.0 - (max(max(w1, w2), max(w3, w4)) / totalW);
    float boost = 1.0 + (uBlend * 0.4 * mixingMagnitude);
    
    float l = dot(result, vec3(0.2126, 0.7152, 0.0722));
    result = mix(vec3(l), result, boost);
    
    return result;
}

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float bayer4x4(vec2 p) {
    ivec2 i = ivec2(p) & 3;
    int idx = i.x + i.y * 4;
    int b[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
    return float(b[idx]) / 16.0;
}

vec3 applyDither(vec3 color, vec2 fragCoord) {
    if (uDither < 0.5) return color;
    float levels = 4.0;
    float threshold = bayer4x4(fragCoord) - 0.5;
    float step_ = 1.0 / levels;
    return floor(color / step_ + threshold + 0.5) * step_;
}

vec3 chromatic(vec2 uv, float t) {
    if (uChromatic < 0.0001) return paletteColor(t);
    float dist = length(uv - 0.5);
    float offset = dist * uChromatic;
    vec3 col;
    col.r = paletteColor(t + offset).r;
    col.g = paletteColor(t).g;
    col.b = paletteColor(t - offset).b;
    return col;
}

vec3 applyFilmGrain(vec3 col, float str) {
    if (str < 0.001) return col;
    float n = hash(gl_FragCoord.xy);
    n = n * 2.0 - 1.0; 
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float mask = 1.0 - smoothstep(0.8, 1.0, lum);
    return col + vec3(n) * str * mask * 0.3;
}
`;

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_PREFIX = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 iResolution;
uniform float iTime;
`;

const SHADERS = {
    Bars: `
        uniform float uAngle; uniform float uSpeed; uniform float uScale;
        ${COMMON_GLSL}
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv + uMouse * 0.02);
            vec2 dir = vec2(cos(uAngle), sin(uAngle));
            return fract(dot(duv * uScale - 0.5, dir) + 0.5 + uSpeed * 0.5);
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `,
    Circle: `
        uniform float uScale; uniform float uSpeed;
        ${COMMON_GLSL}
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv);
            float n = snoise(duv * 10.0 + uSpeed * 0.1) * 0.05;
            vec2 center = vec2(0.5 + uCenter.x * 0.4 + uMouse.x * 0.05, 0.5 - uCenter.y * 0.4 - uMouse.y * 0.05);
            float d = length(duv - center + n);
            return d * uScale - uSpeed * 0.5;
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `,
    Plasma: `
        uniform float uScale; uniform float uSpeed;
        ${COMMON_GLSL}
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv + uMouse * 0.015);
            float time = uSpeed;
            float v = 0.0;
            vec2 p = (duv - 0.5) * uScale * 10.0;
            v += sin(p.x + time);
            v += sin((p.y + time) * 0.5);
            v += sin((p.x + p.y + time) * 0.5);
            float cx = p.x + 0.5 * sin(time * 0.33);
            float cy = p.y + 0.5 * cos(time * 0.5);
            v += sin(sqrt(cx * cx + cy * cy + 1.0) + time);
            return sin(v * 3.14159 * 0.5) * 0.5 + 0.5;
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `,
    Waves: `
        uniform float uAngle; uniform float uScale; uniform float uSpeed;
        ${COMMON_GLSL}
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv + uMouse * 0.01);
            float time = uSpeed;
            vec2 center = duv - 0.5;
            float ca = cos(uAngle); float sa = sin(uAngle);
            vec2 ruv = vec2(ca * center.x - sa * center.y, sa * center.x + ca * center.y) + 0.5;
            float wave = 0.0;
            wave += sin(ruv.x * uScale * 20.0 + time * 2.0) * 0.25;
            wave += sin(ruv.x * uScale * 10.0 - time * 1.5 + ruv.y * 5.0) * 0.25;
            wave += sin(ruv.y * uScale * 15.0 + time * 1.0) * 0.15;
            wave += sin(length(center) * uScale * 15.0 - time * 2.0) * 0.2;
            return wave + ruv.y;
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `,
    Terrain: `
        uniform float uScale; uniform float uSpeed;
        ${COMMON_GLSL}
        vec2 hash2(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }
        float gnoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
            float a = dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
            float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
            float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
            float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.5 + 0.5;
        }
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv + uMouse * 0.02);
            vec2 p = (duv - 0.5) * uScale * 2.0 + vec2(uSpeed * 1.7, uSpeed * 1.3);
            float h = gnoise(p);
            h = clamp((h - 0.15) * 1.4, 0.0, 1.0);
            return h * h * (3.0 - 2.0 * h);
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `,
    Flow: `
        uniform float uScale; uniform float uSpeed;
        ${COMMON_GLSL}
        float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            vec2 shift = vec2(100.0);
            for(int i=0; i<5; i++) {
                v += a * snoise(p);
                p = p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv + uMouse * 0.01);
            vec2 p = (duv - 0.5) * uScale * 0.09;
            vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
            vec2 r = vec2(fbm(p + 2.0*q + vec2(1.7, 9.2) + 0.1*uSpeed), 
                          fbm(p + 2.0*q + vec2(8.3, 2.8) + 0.08*uSpeed));
            float f = fbm(p + 2.0*r);
            return clamp(f * f * 3.0, 0.0, 1.0);
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `,
    Nebula: `
        uniform float uScale; uniform float uSpeed;
        ${COMMON_GLSL}
        float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            for(int i=0; i<6; i++) {
                v += a * snoise(p);
                p = p * 2.1 + vec2(10.0);
                a *= 0.5;
            }
            return v;
        }
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv + uMouse * 0.05);
            vec2 p = (duv - 0.5) * uScale * 1.5;
            float n = fbm(p + uSpeed * 0.1);
            float n2 = fbm(p - uSpeed * 0.05 + n);
            return smoothstep(0.1, 0.9, n2 * 0.5 + 0.5);
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `,
    Particles: `
        uniform float uScale; uniform float uSpeed;
        ${COMMON_GLSL}
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv + uMouse * 0.1);
            vec2 p = (duv - 0.5) * uScale;
            float acc = 0.0;
            for(float i=0.0; i<20.0; i++) {
                vec2 pos = hash22(vec2(i, 123.4)) * 2.0 - vec2(1.0);
                pos.x += sin(uSpeed * 0.2 + i) * 0.2;
                pos.y += cos(uSpeed * 0.3 + i) * 0.2;
                float d = length(p - pos);
                acc += smoothstep(0.1 * uScale, 0.0, d);
            }
            return clamp(acc, 0.0, 1.0);
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `,
    Silk: `
        uniform float uScale; uniform float uSpeed;
        ${COMMON_GLSL}
        float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            for(int i=0; i<5; i++) {
                v += a * snoise(p);
                p = p * 2.0 + vec2(10.0);
                a *= 0.5;
            }
            return v;
        }
        float getHeight(vec2 uv) {
            vec2 duv = distortUV(uv + uMouse * 0.02);
            vec2 p = (duv - 0.5) * uScale;
            float n = fbm(p * 0.5 + fbm(p * 0.2 + uSpeed * 0.1));
            return smoothstep(0.2, 0.8, n * 0.5 + 0.5);
        }
        out vec4 fragColor;
        void main() {
            vec2 uv = gl_FragCoord.xy / iResolution.xy;
            float t = getHeight(uv);
            vec3 color = chromatic(uv, t);
            color = applyFilmGrain(color, uNoise);
            fragColor = vec4(color, 1.0);
        }
    `
};

const POST_SHADERS = {
    Threshold: `
        uniform sampler2D uTexture;
        out vec4 fragColor;
        void main() {
            vec3 col = texture(uTexture, vUv).rgb;
            float brightness = max(col.r, max(col.g, col.b));
            float threshold = 0.6; float knee = 0.2;
            float soft = brightness - threshold + knee;
            soft = clamp(soft, 0.0, 2.0 * knee);
            soft = soft * soft / (4.0 * knee + 0.00001);
            float contribution = max(soft, brightness - threshold);
            contribution /= max(brightness, 0.00001);
            fragColor = vec4(col * contribution, 1.0);
        }
    `,
    BlurH: `
        uniform sampler2D uTexture; uniform float uWidth;
        out vec4 fragColor;
        void main() {
            float weight[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
            vec3 col = texture(uTexture, vUv).rgb * weight[0];
            for(int i=1; i<5; i++) {
                float offset = float(i) * 1.2;
                col += texture(uTexture, vUv + vec2(offset/uWidth, 0.0)).rgb * weight[i];
                col += texture(uTexture, vUv - vec2(offset/uWidth, 0.0)).rgb * weight[i];
            }
            fragColor = vec4(col, 1.0);
        }
    `,
    BlurV: `
        uniform sampler2D uTexture; uniform float uHeight;
        out vec4 fragColor;
        void main() {
            float weight[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
            vec3 col = texture(uTexture, vUv).rgb * weight[0];
            for(int i=1; i<5; i++) {
                float offset = float(i) * 1.2;
                col += texture(uTexture, vUv + vec2(0.0, offset/uHeight)).rgb * weight[i];
                col += texture(uTexture, vUv - vec2(0.0, offset/uHeight)).rgb * weight[i];
            }
            fragColor = vec4(col, 1.0);
        }
    `,
    Composite: `
        uniform sampler2D uScene; uniform sampler2D uBloom; uniform float uBloomStrength;
        uniform float uContrast; uniform float uSaturation;
        out vec4 fragColor;
        void main() {
            vec3 scene = texture(uScene, vUv).rgb;
            vec3 bloom = texture(uBloom, vUv).rgb;
            vec3 result = scene + bloom * (uBloomStrength * 0.2);
            
            result = (result - 0.5) * uContrast + 0.5;
            
            float l = dot(result, vec3(0.2126, 0.7152, 0.0722));
            result = mix(vec3(l), result, uSaturation);
            
            fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
        }
    `
};

let currentProgram = null;
const postPrograms = {};
let palettes = {};
let startTime = Date.now();
let animate = false;

const current = {
    angle: 0, scale: 1, speed: 0, centerX: 0, centerY: 0, blend: 0.5, noise: 0.05,
    distortStrength: 0.0,
    distortScale: 3.0,
    contrast: 1.0,
    saturation: 1.0,
    bloom: 0.5, chromatic: 0.02, symmetry: 0, paletteShift: 0,
    color1: [0,0,0], color2: [0,0,0], color3: [0,0,0], color4: [0,0,0]
};
const targets = { ...current };

let mouseX = 0, mouseY = 0;
let targetMouseX = 0, targetMouseY = 0;
let fbos = { scene: null, bright: null, blur1: null, blur2: null };

function createFBO(width, height) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { fbo, texture };
}

function initFBOs() {
    const w = canvas.width, h = canvas.height;
    if (fbos.scene) {
        Object.values(fbos).forEach(f => { 
            if(f && f.fbo) gl.deleteFramebuffer(f.fbo); 
            if(f && f.texture) gl.deleteTexture(f.texture); 
        });
    }
    fbos.scene = createFBO(w, h);
    fbos.bright = createFBO(w / 4, h / 4);
    fbos.blur1 = createFBO(w / 4, h / 4);
    fbos.blur2 = createFBO(w / 4, h / 4);
}

function triggerRender() { if (!animate) requestAnimationFrame(render); }

window.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
    targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
    triggerRender();
});

window.addEventListener('touchmove', (e) => {
    if (e.touches[0]) {
        targetMouseX = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        targetMouseY = (e.touches[0].clientY / window.innerHeight) * 2 - 1;
        triggerRender();
    }
}, { passive: true });

let uiTimer;
const uiPanel = document.getElementById('ui');
function resetUITimer() {
    uiPanel.classList.remove('hide'); clearTimeout(uiTimer);
    uiTimer = setTimeout(() => { if (!uiPanel.matches(':hover')) uiPanel.classList.add('hide'); }, 5000);
}
document.addEventListener('mousemove', resetUITimer);
uiPanel.addEventListener('mouseenter', () => clearTimeout(uiTimer));
uiPanel.addEventListener('mouseleave', resetUITimer);

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-pane').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    };
});

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(shader)); gl.deleteShader(shader); return null; }
    return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader); gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(program)); return null; }
    return program;
}

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}

function getLuminance(rgb) {
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function getPaletteContrast(pal) {
    const lums = pal.map(hex => getLuminance(hexToRgb(hex)));
    return Math.max(...lums) - Math.min(...lums);
}

function updateUI(skipURL = false) {
    const preset = document.getElementById('preset-select').value;
    document.getElementById('group-angle').classList.toggle('hidden', preset !== 'Bars' && preset !== 'Waves');
    document.getElementById('group-center').classList.toggle('hidden', preset !== 'Circle');
    
    document.getElementById('label-speed').textContent = animate ? 'Flow Speed' : 'Time Offset';
    currentProgram = createProgram(gl, VERTEX_SHADER, FRAGMENT_PREFIX + SHADERS[preset]);
    if (!skipURL) syncToURL();
    triggerRender();
}

function lerp(a, b, t) { return a + (b - a) * t; }
function mix(a, b, t) { return lerp(a, b, t); }
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function render() {
    if (!currentProgram) return;
    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;

    const lf = 0.08;
    current.angle = lerp(current.angle, targets.angle, lf);
    current.scale = lerp(current.scale, targets.scale, lf);
    current.speed = lerp(current.speed, targets.speed, lf);
    current.centerX = lerp(current.centerX, targets.centerX, lf);
    current.centerY = lerp(current.centerY, targets.centerY, lf);
    current.blend = lerp(current.blend, targets.blend, lf);
    current.noise = lerp(current.noise, targets.noise, lf);
    current.bloom = lerp(current.bloom, targets.bloom, lf);
    current.chromatic = lerp(current.chromatic, targets.chromatic, lf);
    current.symmetry = lerp(current.symmetry, targets.symmetry, lf);
    current.paletteShift = lerp(current.paletteShift, targets.paletteShift, lf);
    current.distortStrength = lerp(current.distortStrength, targets.distortStrength, lf);
    current.distortScale = lerp(current.distortScale, targets.distortScale, lf);
    current.contrast = lerp(current.contrast, targets.contrast, lf);
    current.saturation = lerp(current.saturation, targets.saturation, lf);
    for (let i = 0; i < 3; i++) {
        current.color1[i] = lerp(current.color1[i], targets.color1[i], lf);
        current.color2[i] = lerp(current.color2[i], targets.color2[i], lf);
        current.color3[i] = lerp(current.color3[i], targets.color3[i], lf);
        current.color4[i] = lerp(current.color4[i], targets.color4[i], lf);
    }

    document.getElementById('val-angle').innerText = (targets.angle * 180 / Math.PI).toFixed(0) + '°';
    document.getElementById('val-scale').innerText = targets.scale.toFixed(1);
    document.getElementById('val-speed').innerText = targets.speed.toFixed(2);
    document.getElementById('val-center-x').innerText = targets.centerX.toFixed(2);
    document.getElementById('val-center-y').innerText = targets.centerY.toFixed(2);
    document.getElementById('val-blend').innerText = targets.blend.toFixed(2);
    document.getElementById('val-noise').innerText = targets.noise.toFixed(2);
    document.getElementById('val-bloom').innerText = targets.bloom.toFixed(2);
    document.getElementById('val-chromatic').innerText = targets.chromatic.toFixed(3);
    document.getElementById('val-hue').innerText = targets.paletteShift.toFixed(2);
    document.getElementById('val-distort-strength').innerText = targets.distortStrength.toFixed(1);
    document.getElementById('val-distort-scale').innerText = targets.distortScale.toFixed(1);
    document.getElementById('val-contrast').innerText = targets.contrast.toFixed(2);
    document.getElementById('val-saturation').innerText = targets.saturation.toFixed(2);
    document.getElementById('val-symmetry').innerText = Math.round(targets.symmetry);

    const elapsed = (Date.now() - startTime) * 0.001;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.scene.fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(currentProgram);
    gl.uniform3f(gl.getUniformLocation(currentProgram, 'iResolution'), canvas.width, canvas.height, 1.0);
    gl.uniform2f(gl.getUniformLocation(currentProgram, 'uMouse'), mouseX, mouseY);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'iTime'), elapsed);
    gl.uniform3fv(gl.getUniformLocation(currentProgram, 'uColor1'), current.color1);
    gl.uniform3fv(gl.getUniformLocation(currentProgram, 'uColor2'), current.color2);
    gl.uniform3fv(gl.getUniformLocation(currentProgram, 'uColor3'), current.color3);
    gl.uniform3fv(gl.getUniformLocation(currentProgram, 'uColor4'), current.color4);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uAngle'), current.angle);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uScale'), current.scale);
    let s = current.speed; if (animate) s += elapsed * 0.5;
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uSpeed'), s);
    gl.uniform2f(gl.getUniformLocation(currentProgram, 'uCenter'), current.centerX, current.centerY);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uBlend'), current.blend);
    gl.uniform1i(gl.getUniformLocation(currentProgram, 'uDistortType'), parseInt(document.getElementById('input-distort-type').value));
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uDistortStrength'), current.distortStrength);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uDistortScale'), current.distortScale);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uNoise'), current.noise);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uChromatic'), current.chromatic);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uSymmetry'), Math.round(current.symmetry));
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uPaletteShift'), current.paletteShift);
    gl.uniform1f(gl.getUniformLocation(currentProgram, 'uDither'), 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.bright.fbo);
    gl.viewport(0, 0, canvas.width / 4, canvas.height / 4);
    gl.useProgram(postPrograms.Threshold);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fbos.scene.texture);
    gl.uniform1i(gl.getUniformLocation(postPrograms.Threshold, 'uTexture'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blur1.fbo);
    gl.useProgram(postPrograms.BlurH);
    gl.bindTexture(gl.TEXTURE_2D, fbos.bright.texture);
    gl.uniform1i(gl.getUniformLocation(postPrograms.BlurH, 'uTexture'), 0);
    gl.uniform1f(gl.getUniformLocation(postPrograms.BlurH, 'uWidth'), canvas.width / 4);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blur2.fbo);
    gl.useProgram(postPrograms.BlurV);
    gl.bindTexture(gl.TEXTURE_2D, fbos.blur1.texture);
    gl.uniform1i(gl.getUniformLocation(postPrograms.BlurV, 'uTexture'), 0);
    gl.uniform1f(gl.getUniformLocation(postPrograms.BlurV, 'uHeight'), canvas.height / 4);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(postPrograms.Composite);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fbos.scene.texture);
    gl.uniform1i(gl.getUniformLocation(postPrograms.Composite, 'uScene'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fbos.blur2.texture);
    gl.uniform1i(gl.getUniformLocation(postPrograms.Composite, 'uBloom'), 1);
    gl.uniform1f(gl.getUniformLocation(postPrograms.Composite, 'uBloomStrength'), current.bloom);
    gl.uniform1f(gl.getUniformLocation(postPrograms.Composite, 'uContrast'), current.contrast);
    gl.uniform1f(gl.getUniformLocation(postPrograms.Composite, 'uSaturation'), current.saturation);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const thresh = 0.001;
    let needsMoreLerp = Math.abs(targets.angle - current.angle) > thresh || 
                        Math.abs(targets.scale - current.scale) > thresh || 
                        Math.abs(targets.speed - current.speed) > thresh ||
                        Math.abs(targets.centerX - current.centerX) > thresh ||
                        Math.abs(targets.centerY - current.centerY) > thresh ||
                        Math.abs(targets.blend - current.blend) > thresh ||
                        Math.abs(targets.noise - current.noise) > thresh ||
                        Math.abs(targets.bloom - current.bloom) > thresh || 
                        Math.abs(targets.chromatic - current.chromatic) > 0.0001 ||
                        Math.abs(targets.symmetry - current.symmetry) > 0.1 ||
                        Math.abs(targets.paletteShift - current.paletteShift) > 0.01 ||
                        Math.abs(targets.distortStrength - current.distortStrength) > thresh ||
                        Math.abs(targets.distortScale - current.distortScale) > thresh ||
                        Math.abs(targets.contrast - current.contrast) > thresh ||
                        Math.abs(targets.saturation - current.saturation) > thresh;
    for (let i = 0; i < 3; i++) {
        if (Math.abs(targets.color1[i] - current.color1[i]) > thresh) needsMoreLerp = true;
        if (Math.abs(targets.color2[i] - current.color2[i]) > thresh) needsMoreLerp = true;
        if (Math.abs(targets.color3[i] - current.color3[i]) > thresh) needsMoreLerp = true;
        if (Math.abs(targets.color4[i] - current.color4[i]) > thresh) needsMoreLerp = true;
    }
    if (animate || needsMoreLerp || Math.abs(targetMouseX - mouseX) > 0.001 || Math.abs(targetMouseY - mouseY) > 0.001) requestAnimationFrame(render);
}

function syncToURL() {
    const params = new URLSearchParams();
    params.set('p', document.getElementById('preset-select').value);
    params.set('a', targets.angle.toFixed(3)); params.set('s', targets.scale.toFixed(2));
    params.set('t', targets.speed.toFixed(2)); 
    params.set('cx', targets.centerX.toFixed(2));
    params.set('cy', targets.centerY.toFixed(2));
    params.set('b', targets.blend.toFixed(2)); params.set('n', targets.noise.toFixed(3));
    params.set('bm', targets.bloom.toFixed(2)); params.set('cr', targets.chromatic.toFixed(3));
    params.set('sy', Math.round(targets.symmetry));
    params.set('ps', targets.paletteShift.toFixed(2));
    params.set('dt', document.getElementById('input-distort-type').value);
    params.set('ds', targets.distortStrength.toFixed(2));
    params.set('dc', targets.distortScale.toFixed(2));
    params.set('ct', targets.contrast.toFixed(2));
    params.set('st', targets.saturation.toFixed(2));
    params.set('c1', document.getElementById('color-1').value.slice(1));
    params.set('c2', document.getElementById('color-2').value.slice(1));
    params.set('c3', document.getElementById('color-3').value.slice(1));
    params.set('c4', document.getElementById('color-4').value.slice(1));
    window.history.replaceState({}, '', `${location.pathname}?${params.toString()}`);
}

function readFromURL() {
    const params = new URLSearchParams(location.search);
    if (!params.has('p')) return false;
    document.getElementById('preset-select').value = params.get('p');
    targets.angle = parseFloat(params.get('a') || 0);
    targets.scale = parseFloat(params.get('s') || 1);
    targets.speed = parseFloat(params.get('t') || 0);
    targets.centerX = parseFloat(params.get('cx') || 0);
    targets.centerY = parseFloat(params.get('cy') || 0);
    targets.blend = parseFloat(params.get('b') || 0.5);
    targets.noise = parseFloat(params.get('n') || 0.05);
    targets.bloom = parseFloat(params.get('bm') || 0.5);
    targets.chromatic = parseFloat(params.get('cr') || 0.02);
    targets.symmetry = parseFloat(params.get('sy') || 0);
    targets.paletteShift = parseFloat(params.get('ps') || 0);
    document.getElementById('input-distort-type').value = params.get('dt') || 0;
    targets.distortStrength = parseFloat(params.get('ds') || 0);
    targets.distortScale = parseFloat(params.get('dc') || 3.0);
    targets.contrast = parseFloat(params.get('ct') || 1.0);
    targets.saturation = parseFloat(params.get('st') || 1.0);
    if (params.has('c1')) document.getElementById('color-1').value = '#' + params.get('c1');
    if (params.has('c2')) document.getElementById('color-2').value = '#' + params.get('c2');
    if (params.has('c3')) document.getElementById('color-3').value = '#' + params.get('c3');
    if (params.has('c4')) document.getElementById('color-4').value = '#' + params.get('c4');
    
    document.getElementById('input-angle').value = targets.angle;
    document.getElementById('input-scale').value = targets.scale;
    document.getElementById('input-speed').value = targets.speed;
    document.getElementById('input-center-x').value = targets.centerX;
    document.getElementById('input-center-y').value = targets.centerY;
    document.getElementById('input-blend').value = targets.blend;
    document.getElementById('input-noise').value = targets.noise;
    document.getElementById('input-bloom').value = targets.bloom;
    document.getElementById('input-chromatic').value = targets.chromatic;
    document.getElementById('input-symmetry').value = targets.symmetry;
    document.getElementById('input-hue').value = targets.paletteShift;
    document.getElementById('input-distort-strength').value = targets.distortStrength;
    document.getElementById('input-distort-scale').value = targets.distortScale;
    document.getElementById('input-contrast').value = targets.contrast;
    document.getElementById('input-saturation').value = targets.saturation;
    updateTargetsFromUI(); return true;
}

function updateTargetsFromUI() {
    targets.angle = parseFloat(document.getElementById('input-angle').value);
    targets.scale = parseFloat(document.getElementById('input-scale').value);
    targets.speed = parseFloat(document.getElementById('input-speed').value);
    targets.centerX = parseFloat(document.getElementById('input-center-x').value);
    targets.centerY = parseFloat(document.getElementById('input-center-y').value);
    targets.blend = parseFloat(document.getElementById('input-blend').value);
    targets.noise = parseFloat(document.getElementById('input-noise').value);
    targets.bloom = parseFloat(document.getElementById('input-bloom').value);
    targets.chromatic = parseFloat(document.getElementById('input-chromatic').value);
    targets.symmetry = parseFloat(document.getElementById('input-symmetry').value);
    targets.paletteShift = parseFloat(document.getElementById('input-hue').value);
    targets.distortStrength = parseFloat(document.getElementById('input-distort-strength').value);
    targets.distortScale = parseFloat(document.getElementById('input-distort-scale').value);
    targets.contrast = parseFloat(document.getElementById('input-contrast').value);
    targets.saturation = parseFloat(document.getElementById('input-saturation').value);
    targets.color1 = hexToRgb(document.getElementById('color-1').value);
    targets.color2 = hexToRgb(document.getElementById('color-2').value);
    targets.color3 = hexToRgb(document.getElementById('color-3').value);
    targets.color4 = hexToRgb(document.getElementById('color-4').value);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; initFBOs(); triggerRender(); }
window.addEventListener('resize', resize);
resize();

document.getElementById('preset-select').addEventListener('change', () => updateUI());
document.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', () => { updateTargetsFromUI(); syncToURL(); triggerRender(); });
});

function toggleAnimate(forceValue) {
    animate = forceValue !== undefined ? forceValue : !animate;
    const playIcon = document.getElementById('play-icon'), pauseIcon = document.getElementById('pause-icon');
    if (animate) {
        startTime = Date.now(); playIcon.classList.add('hidden'); pauseIcon.classList.remove('hidden'); requestAnimationFrame(render);
    } else {
        const elapsed = (Date.now() - startTime) * 0.001;
        current.speed += elapsed * 0.5; targets.speed = current.speed;
        document.getElementById('input-speed').value = targets.speed;
        playIcon.classList.remove('hidden'); pauseIcon.classList.add('hidden'); syncToURL(); triggerRender();
    }
}

document.getElementById('btn-play').onclick = () => toggleAnimate();
document.getElementById('btn-prev').onclick = () => { if (animate) toggleAnimate(false); targets.speed = Math.max(0, targets.speed - 0.5); current.speed = targets.speed; document.getElementById('input-speed').value = targets.speed; syncToURL(); render(); };
document.getElementById('btn-next').onclick = () => { if (animate) toggleAnimate(false); targets.speed += 0.5; current.speed = targets.speed; document.getElementById('input-speed').value = targets.speed; syncToURL(); render(); };

function randomize() {
    const categories = Object.keys(palettes);
    const premiumCategories = ['Deep', 'Organic', 'Muted', 'Airy', 'Arctic', 'Solar', 'Celestial', 'Ethereal'];
    const cat = (Math.random() < 0.85) 
        ? premiumCategories[Math.floor(Math.random() * premiumCategories.length)]
        : categories[Math.floor(Math.random() * categories.length)];
    
    const catPalettes = palettes[cat];
    const pal = catPalettes[Math.floor(Math.random() * catPalettes.length)];
    const contrast = getPaletteContrast(pal);
    
    document.getElementById('color-1').value = pal[0]; document.getElementById('color-2').value = pal[1];
    document.getElementById('color-3').value = pal[2]; document.getElementById('color-4').value = pal[3];
    document.getElementById('input-hue').value = (Math.random() < 0.2) ? Math.random() : 0.0;

    const presets = Object.keys(SHADERS);
    const preset = presets[Math.floor(Math.random() * presets.length)];
    document.getElementById('preset-select').value = preset;

    let scale;
    const scaleBase = Math.random();
    
    if (preset === 'Waves') scale = 0.5 + scaleBase * 1.0; 
    else if (preset === 'Plasma') scale = 0.3 + scaleBase * 0.9;
    else if (preset === 'Nebula') scale = 0.2 + scaleBase * 0.6;
    else if (preset === 'Flow') scale = 0.4 + scaleBase * 1.2;
    else if (preset === 'Circle') scale = 0.4 + scaleBase * 1.8;
    else if (preset === 'Silk') scale = 0.6 + scaleBase * 2.1; 
    else if (preset === 'Bars') scale = 1.0 + scaleBase * 0.5; 
    else scale = 0.5 + scaleBase * 3.5;

    if (['Bars', 'Silk'].includes(preset) && contrast < 0.4) {
        scale *= 0.3; 
    } else if (contrast < 0.35) {
        scale *= 0.4; 
    } else if (contrast < 0.5) {
        scale *= 0.7;
    }
    
    document.getElementById('input-scale').value = scale;

    let distortType = Math.floor(Math.random() * 5);
    if (preset === 'Circle' && Math.random() < 0.6) distortType = (Math.random() > 0.5) ? 1 : 4;
    if (['Plasma', 'Nebula', 'Flow'].includes(preset) && distortType === 2 && Math.random() < 0.7) distortType = 0;
    document.getElementById('input-distort-type').value = distortType;
    document.getElementById('input-distort-scale').value = 1.0 + Math.random() * 6.0;

    let maxDistort = mix(6.0, 1.5, smoothstep(1.0, 4.0, scale));
    if (distortType === 2 || distortType === 3) maxDistort *= 0.7; 
    const distStr = Math.random() * Math.min(maxDistort, 6.0); 
    document.getElementById('input-distort-strength').value = distStr;

    document.getElementById('input-angle').value = Math.random() * 6.28;
    document.getElementById('input-speed').value = Math.random() * 20;
    document.getElementById('input-center-x').value = (Math.random() - 0.5) * 1.5;
    document.getElementById('input-center-y').value = (Math.random() - 0.5) * 1.5;    
    
    const blendRoll = Math.random();
    let blendVal = (blendRoll < 0.1) ? 0.0 : 0.5 + Math.random() * 1.5;
    
    if (contrast < 0.45) blendVal += 0.5; 
    if (scale > 1.5) blendVal += 0.4;     
    
    document.getElementById('input-blend').value = Math.min(blendVal, 3.0);
    
    document.getElementById('input-contrast').value = 0.9 + Math.random() * 0.4;
    document.getElementById('input-saturation').value = 0.8 + Math.random() * 0.5;

    updateTargetsFromUI(); updateUI();
}
document.getElementById('random-btn').onclick = randomize;

async function downloadImage() {
    const resSelect = document.getElementById('resolution-select');
    const originalW = canvas.width;
    const originalH = canvas.height;
    
    let targetW, targetH;
    if (resSelect.value === 'window') {
        targetW = originalW;
        targetH = originalH;
    } else {
        const [w, h] = resSelect.value.split('x').map(Number);
        targetW = w;
        targetH = h;
    }

    canvas.width = targetW;
    canvas.height = targetH;
    initFBOs();
    
    render(); 
    
    const link = document.createElement('a');
    link.download = `sumi-${resSelect.value}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();

    canvas.width = originalW;
    canvas.height = originalH;
    initFBOs();
    triggerRender();
}
document.getElementById('export-btn').onclick = downloadImage;

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); toggleAnimate(); }
    if (e.code === 'KeyR') randomize();
    if (e.code === 'KeyE') downloadImage();
    if (e.code === 'KeyS') uiPanel.classList.toggle('hide');
});

function setPalette(palette) {
    document.getElementById('color-1').value = palette[0];
    document.getElementById('color-2').value = palette[1];
    document.getElementById('color-3').value = palette[2];
    document.getElementById('color-4').value = palette[3];
    updateTargetsFromUI(); syncToURL(); triggerRender();
}

async function init() {
    gl.getExtension('EXT_color_buffer_float');
    for (const [name, source] of Object.entries(POST_SHADERS)) { 
        postPrograms[name] = createProgram(gl, VERTEX_SHADER, FRAGMENT_PREFIX + source); 
    }
    const response = await fetch('palettes.json'); 
    palettes = await response.json();
    
    showPalettes('All');
    document.getElementById('category-select').onchange = (e) => showPalettes(e.target.value);

    if (!readFromURL()) updateTargetsFromUI();
    Object.assign(current, targets);
    current.color1 = [...targets.color1]; current.color2 = [...targets.color2];
    current.color3 = [...targets.color3]; current.color4 = [...targets.color4];
    updateUI(true); resetUITimer();
}

function showPalettes(category = 'All') {
    const container = document.getElementById('palette-picker'); 
    container.innerHTML = '';
    
    let displayList = [];
    if (category === 'All') {
        displayList = Object.values(palettes).flat();
    } else {
        displayList = palettes[category] || [];
    }

    displayList.forEach(palette => {
        const item = document.createElement('div'); 
        item.className = 'palette-item';
        palette.forEach(color => { 
            const div = document.createElement('div'); 
            div.className = 'palette-color'; 
            div.style.background = color; 
            item.appendChild(div); 
        });
        item.onclick = () => {
            setPalette(palette);
            document.querySelectorAll('.palette-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        };
        container.appendChild(item);
    });
}

init();
