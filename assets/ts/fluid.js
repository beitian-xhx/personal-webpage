// Liquid Ether adapted from React Bits by David Haz, 2026.
// Source: https://reactbits.dev/r/LiquidEther-JS-CSS.json
// MIT + Commons Clause. Full notice: docs/third-party/REACT-BITS-LICENSE.md
const PIXEL_BUDGET = 850000;
const MAX_CELLS = 36000;
// Bounds preserve continuous flow even when the page competes for GPU time.
const QUALITY = [
  { pixels: 1, grid: 1, fps: 30, mobileFps: 24, pressure: 12, mobilePressure: 8 },
  { pixels: 0.8, grid: 0.85, fps: 24, mobileFps: 20, pressure: 10, mobilePressure: 7 },
  { pixels: 0.65, grid: 0.72, fps: 20, mobileFps: 18, pressure: 8, mobilePressure: 6 }
];

const VERTEX = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vUv = corners[gl_VertexID] * 0.5 + 0.5;
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uTexel;
`;

const SPLAT = `${HEADER}
uniform sampler2D uVelocity;
uniform vec2 uSize;
uniform vec4 uSegment;
uniform vec2 uForce;
uniform float uRadius;

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(p - a - ab * t);
}

void main() {
  float d = segment(vUv * uSize, uSegment.xy, uSegment.zw) / uRadius;
  vec2 velocity = texture(uVelocity, vUv).xy + uForce * exp(-d * d * 6.0);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

const SMOOTH = `${HEADER}
uniform sampler2D uVelocity;
uniform float uAmount;

void main() {
  vec2 center = texture(uVelocity, vUv).xy;
  vec2 around =
    texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).xy +
    texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).xy +
    texture(uVelocity, vUv - vec2(0.0, uTexel.y)).xy +
    texture(uVelocity, vUv + vec2(0.0, uTexel.y)).xy;
  fragColor = vec4(mix(center, around * 0.25, uAmount), 0.0, 1.0);
}`;

const DIVERGENCE = `${HEADER}
uniform sampler2D uVelocity;
uniform float uWalls;

void main() {
  vec2 center = texture(uVelocity, vUv).xy;
  float left = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float down = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float up = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float edge = uWalls > 0.5 ? -1.0 : 0.0;
  if (vUv.x - uTexel.x < 0.0) left = edge * center.x;
  if (vUv.x + uTexel.x > 1.0) right = edge * center.x;
  if (vUv.y - uTexel.y < 0.0) down = edge * center.y;
  if (vUv.y + uTexel.y > 1.0) up = edge * center.y;
  fragColor = vec4(0.5 * (right - left + up - down), 0.0, 0.0, 1.0);
}`;

const EDGE = `
uniform float uWalls;

float pressureAt(sampler2D field, vec2 uv) {
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return texture(field, uv).x * mix(inside.x * inside.y, 1.0, uWalls);
}
`;

const PRESSURE = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
${EDGE}
void main() {
  vec2 reach = uTexel * 2.0;
  float sum =
    pressureAt(uPressure, vUv - vec2(reach.x, 0.0)) +
    pressureAt(uPressure, vUv + vec2(reach.x, 0.0)) +
    pressureAt(uPressure, vUv - vec2(0.0, reach.y)) +
    pressureAt(uPressure, vUv + vec2(0.0, reach.y));
  fragColor = vec4(sum * 0.25 - texture(uDivergence, vUv).x, 0.0, 0.0, 1.0);
}`;

const PROJECT = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
${EDGE}
void main() {
  float left = pressureAt(uPressure, vUv - vec2(uTexel.x, 0.0));
  float right = pressureAt(uPressure, vUv + vec2(uTexel.x, 0.0));
  float down = pressureAt(uPressure, vUv - vec2(0.0, uTexel.y));
  float up = pressureAt(uPressure, vUv + vec2(0.0, uTexel.y));
  vec2 velocity = texture(uVelocity, vUv).xy - 0.5 * vec2(right - left, up - down);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

const ADVECT = `${HEADER}
uniform sampler2D uVelocity;
uniform vec2 uStep;
uniform float uKeep;
uniform float uWalls;

vec2 at(vec2 uv) {
  vec2 outside = max(-uv, uv - 1.0) / uTexel;
  float open = clamp(1.0 - max(outside.x, outside.y) / 1.5, 0.0, 1.0);
  return texture(uVelocity, uv).xy * mix(open, 1.0, uWalls);
}

void main() {
  vec2 start = vUv - at(vUv) * uStep;
  vec2 back = start + at(start) * uStep;
  vec2 corrected = vUv - (back - vUv) * 0.5;
  vec2 origin = corrected - at(corrected) * uStep;
  vec2 a = at(origin + vec2(-0.5, -0.5) * uTexel);
  vec2 b = at(origin + vec2(0.5, -0.5) * uTexel);
  vec2 c = at(origin + vec2(-0.5, 0.5) * uTexel);
  vec2 d = at(origin + vec2(0.5, 0.5) * uTexel);
  vec2 velocity = clamp(at(origin), min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
  fragColor = vec4(velocity * uKeep, 0.0, 1.0);
}`;

// Premultiplied optical density + wetness: advection mixes pigments without
// turning overlapping strokes into additive neon. Only moving water picks up ink.
const DYE = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform sampler2D uWallpaper;
uniform vec2 uStep;
uniform vec2 uImageScale;
uniform vec2 uImageOffset;
uniform float uDt;
uniform float uReady;
uniform float uSpeedScale;
uniform vec2 uSize;
uniform vec4 uStroke0;
uniform vec4 uStroke1;
uniform vec4 uStroke2;
uniform vec3 uBrushRadii;
uniform int uStrokeCount;

float brush(vec4 stroke, float radius) {
  vec2 p = vUv * uSize, delta = stroke.zw - stroke.xy;
  float t = clamp(dot(p - stroke.xy, delta) / max(dot(delta, delta), 0.001), 0.0, 1.0);
  float distance = length(p - stroke.xy - delta * t) / max(radius, 1.0);
  return exp(-distance * distance * 3.5);
}

void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 origin = vUv - velocity * uStep * 1.8;
  vec4 pigment = texture(uDye, origin);
  vec4 around = (
    texture(uDye, origin + vec2(uTexel.x, 0.0)) +
    texture(uDye, origin - vec2(uTexel.x, 0.0)) +
    texture(uDye, origin + vec2(0.0, uTexel.y)) +
    texture(uDye, origin - vec2(0.0, uTexel.y))) * 0.25;
  pigment = mix(pigment, around, 1.0 - exp(-uDt * 5.0)) * exp(-uDt * 0.55);
  vec4 source = texture(uWallpaper, vUv * uImageScale + uImageOffset);
  vec3 density = -log(clamp(source.rgb, vec3(0.035), vec3(1.0)));
  // Pick up color only at the active brush, then transport it through the water.
  // Continuously sampling every moving pixel merely clones the background.
  float paint = 0.0;
  if (uStrokeCount > 0) paint = max(paint, brush(uStroke0, uBrushRadii.x));
  if (uStrokeCount > 1) paint = max(paint, brush(uStroke1, uBrushRadii.y));
  if (uStrokeCount > 2) paint = max(paint, brush(uStroke2, uBrushRadii.z));
  float uptake = (1.0 - exp(-uDt * 14.0 * paint)) * source.a * uReady;
  fragColor = mix(pigment, vec4(density, 1.0), uptake) * uReady;
}`;

const DISPLAY = `${HEADER}
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform vec2 uSimSize;
uniform float uSpeedScale;
uniform float uLight;

vec4 pigmentAt(vec2 uv) {
  vec2 st = uv * uSimSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / uSimSize;
  vec2 h1 = (i + 1.5 + w3 / g1) / uSimSize;
  vec4 a = texture(uDye, vec2(h0.x, h0.y));
  vec4 b = texture(uDye, vec2(h1.x, h0.y));
  vec4 c = texture(uDye, vec2(h0.x, h1.y));
  vec4 d = texture(uDye, vec2(h1.x, h1.y));
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}

void main() {
  vec4 pigment = pigmentAt(vUv);
  vec3 ink = exp(-pigment.rgb / max(pigment.a, 0.0001));
  vec2 velocity = texture(uVelocity, vUv).xy;
  float activity = smoothstep(0.03, 0.65, length(velocity) * uSpeedScale);
  vec2 reach = uTexel * 3.0;
  vec2 wetGradient = vec2(
    texture(uDye, vUv + vec2(reach.x, 0.0)).a - texture(uDye, vUv - vec2(reach.x, 0.0)).a,
    texture(uDye, vUv + vec2(0.0, reach.y)).a - texture(uDye, vUv - vec2(0.0, reach.y)).a);
  float rim = clamp(length(wetGradient) * 6.0, 0.0, 1.0);
  float facing = dot(wetGradient / max(length(wetGradient), 0.0001),
    velocity / max(length(velocity), 0.0001));
  // Same-hue light catches moving water; the trailing wet edge stays darker.
  // A scalar RGB gain preserves local color ratios, including saturated fixtures.
  float gain = (1.0 + activity * 2.4 + rim * 0.8) * (1.0 + facing * rim * 0.3);
  float peak = max(max(ink.r, ink.g), ink.b);
  ink *= min(gain, 0.94 / max(peak, 0.0001));
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  // Quiet paper granulation and feathered, translucent edges; never an opaque veil.
  float alpha = min(0.88, pigment.a * (0.4 + activity * 0.58) + rim * 0.28);
  alpha *= mix(1.0, 0.82, uLight);
  alpha *= 0.97 + grain * 0.03;
  fragColor = vec4(ink * alpha, alpha);
}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const keepFor = (persistence, dt) => Math.pow(0.5, dt / (0.35 + persistence * persistence * 12));

const compile = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const link = (gl, fragmentSource) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = vertex && fragment ? gl.createProgram() : null;
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index++) {
    const info = gl.getActiveUniform(program, index);
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
};


// Keep the CSS layer alive even when WebGL cannot start. No state on other layers.
export function mountFluid(canvas, container) {
  const root = document.documentElement;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposeRenderer;
  let disposed = false;
  let suspended = false;
  let rendererPaused = true;
  const backdrop = document.querySelector('.global-glass-backdrop');
  const syncWallpaper = () => {
    const style = backdrop && root.dataset.bg === 'on' ? getComputedStyle(backdrop) : null;
    const image = style && style.display !== 'none' ? style.backgroundImage : 'none';
    const url = image.match(/url\(\s*["']?(.*?)["']?\s*\)/)?.[1] || '';
    const fallbackImage = url ? image : 'none';
    if (container.style.getPropertyValue('--ambient-image') !== fallbackImage) {
      container.style.setProperty('--ambient-image', fallbackImage);
    }
    const scale = style?.transform && style.transform !== 'none'
      ? Math.max(1, Math.abs(new DOMMatrixReadOnly(style.transform).a)) : 1;
    container.style.setProperty('--ambient-overscan', String(scale));
    disposeRenderer?.setWallpaper?.(url, backdrop);
    if (!disposeRenderer?.setWallpaper) {
      canvas.dataset.wallpaperState = !url ? 'disabled' : motion.matches ? 'static' : 'failed';
    }
  };
  let audioBands = {bass:0,mid:0,treble:0,level:0,playing:false};
  const onAudio = event => {
    const input=event.detail;if(!input)return;
    const band=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
    audioBands={bass:band(input.bass),mid:band(input.mid),treble:band(input.treble),level:band(input.level),playing:input.playing===true};
    disposeRenderer?.setAudioBands?.(audioBands);
    container.style.setProperty('--music-glow',String(audioBands.playing&&!motion.matches?Math.min(.22,audioBands.level*.7):0));
  };
  const sync = () => {
    if (disposed) return;
    const paused = suspended || document.hidden || (root.dataset.portal === 'open' && root.dataset.portalMotion !== 'true') || root.dataset.glassPreparing === 'true' || root.dataset.glassReveal === 'true';
    const state = motion.matches ? 'static' : paused ? 'paused' : 'running';
    if (container.dataset.ambientState !== state) container.dataset.ambientState = state;
    if (motion.matches) {
      disposeRenderer?.();
      disposeRenderer = undefined;
      canvas.dataset.renderer = 'static-fallback';
    } else if (!paused && !disposeRenderer) {
      try { disposeRenderer = createFluid(canvas, container, syncWallpaper);disposeRenderer?.setAudioBands?.(audioBands); }
      catch (error) {
        canvas.dataset.renderer = 'static-fallback';
        console.warn('Ambient flow uses CSS fallback', error);
      }
    }
    // One owner for portal/glass/visibility state, including attribute-only changes.
    if (disposeRenderer && rendererPaused !== paused) disposeRenderer.setPaused?.(paused);
    rendererPaused = paused;
    syncWallpaper();
  };
  const hide = () => { suspended = true; sync(); };
  const show = () => { suspended = false; sync(); };
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('site:portal', sync);
  document.addEventListener('site:audio-energy', onAudio);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  motion.addEventListener('change', sync);
  const stateObserver = new MutationObserver(() => {
    sync();
    disposeRenderer?.setLight?.(root.dataset.scheme === 'light');
  });
  stateObserver.observe(root, { attributes: true, attributeFilter: ['data-portal', 'data-portal-motion', 'data-glass-preparing', 'data-glass-reveal', 'data-scheme', 'data-bg', 'style', 'class'] });
  if (backdrop) stateObserver.observe(backdrop, { attributes: true, attributeFilter: ['style', 'class'] });
  sync();
  return () => {
    if (disposed) return;
    disposed = true;
    disposeRenderer?.();
    stateObserver.disconnect();
    document.removeEventListener('visibilitychange', sync);
    document.removeEventListener('site:portal', sync);
    document.removeEventListener('site:audio-energy', onAudio);
    container.style.removeProperty('--music-glow');
    container.style.removeProperty('--ambient-image');
    container.style.removeProperty('--ambient-overscan');
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    motion.removeEventListener('change', sync);
    delete canvas.dataset.renderer;
    delete canvas.dataset.wallpaperState;
    delete container.dataset.ambientState;
  };
}

function createFluid(canvas, container, refreshWallpaper) {
 const settingsRef={current:{intensity:2.6,force:13,radius:160,persistence:.5,viscosity:.12,resolution:.3,walls:false,clickBurst:false,autoDemo:true,autoSpeed:.34,autoIntensity:1.35,autoResumeDelay:1000,intro:false,light:false,maxRatio:1.25}};
 let audioTarget={bass:0,mid:0,treble:0,level:0,playing:false},music=0,musicBass=0;
 const staticFallback = () => {
   canvas.dataset.renderer = 'static-fallback';
   canvas.dataset.wallpaperState = document.documentElement.dataset.bg === 'on' ? 'failed' : 'disabled';
   return () => { if (canvas.dataset.renderer === 'static-fallback') delete canvas.dataset.renderer; };
 };
    let gl;
    try { gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power'
    }); } catch (_) { return staticFallback(); }
    if (!gl) return staticFallback();
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return staticFallback();

    const programs = {
      splat: link(gl, SPLAT),
      smooth: link(gl, SMOOTH),
      divergence: link(gl, DIVERGENCE),
      pressure: link(gl, PRESSURE),
      project: link(gl, PROJECT),
      advect: link(gl, ADVECT),
      dye: link(gl, DYE),
      display: link(gl, DISPLAY)
    };
    if (Object.values(programs).some(entry => !entry)) {
      Object.values(programs).forEach(entry => { if (entry) gl.deleteProgram(entry.program); });
      return staticFallback();
    }

    const vao = gl.createVertexArray();
    const size = { width: 1, height: 1 };
    const grid = { width: 0, height: 0 };
    const targets = {};
    const pointer = {
      x: 0,
      y: 0,
      fromX: 0,
      fromY: 0,
      dx: 0,
      dy: 0,
      inside: false,
      ready: false,
      moved: false,
      last: 0
    };
    const auto = { phase: Math.random() * 100, x: 0, y: 0, ready: false, ramp: 0 };
    const opening = { active: settingsRef.current.intro, time: 0 };
    const splats = [];
    const strokePool = Array.from({ length: 3 }, () => ({}));
    const fromSpot = [0, 0];
    const toSpot = [0, 0];
    const puffs = [];
    let energy = 1;
    let lastInput = -Infinity;
    let raf = 0;
    let last = 0;
    let nextFrame = 0;
    let frameInterval = 1000 / 30;
    let pressureSteps = 12;
    let compact = false;
    let visible = true;
    let pageVisible = true; // mountFluid owns visibility and transition suspension.
    let lost = false;
    let disposed = false;
    let wallpaperUrl = '';
    let wallpaperLayer;
    let wallpaperImage;
    let wallpaperRequest;
    let wallpaperReady = false;
    let wallpaperRevision = 0;
    let nextWallpaperCheck = 0;
    const imageScale = [1, 1];
    const imageOffset = [0, 0];
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    let bounds;
    let boundsDirty = true;
    const spot = { x: 0, y: 0, inside: false };
    let quality = 0;
    let lastRaf = 0;
    let gapAverage = 16.7;
    let cpuAverage = 0;
    let gpuAverage = 0;
    let gpuSamples = 0;
    let budgetSince = 0;
    let slowWindows = 0;
    let fastWindows = 0;
    let qualityChanged = 0;
    let renderedFrames = 0;
    // Queries are optional, bounded and polled only when available; never finish().
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const queries = timer ? Array.from({ length: 3 }, () => ({ query: gl.createQuery(), pending: false })) : [];
    let activeQuery;
    let pendingQuery = 0;
    let nextQuery = 0;

    const wallpaperTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, wallpaperTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

    const makeTarget = (width, height, channels) => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        channels === 4 ? gl.RGBA16F : channels === 2 ? gl.RG16F : gl.R16F,
        width,
        height,
        0,
        channels === 4 ? gl.RGBA : channels === 2 ? gl.RG : gl.RED,
        gl.HALF_FLOAT,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        throw new Error('Fluid framebuffer unavailable');
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture, framebuffer };
    };

    const dropTargets = () => {
      Object.keys(targets).forEach(key => {
        gl.deleteTexture(targets[key].texture);
        gl.deleteFramebuffer(targets[key].framebuffer);
        delete targets[key];
      });
    };

    const resize = (measure = true) => {
      const s = settingsRef.current;
      if (measure || !bounds) { bounds = container.getBoundingClientRect(); boundsDirty = false; }
      const rect = bounds;
      const cssWidth = Math.max(1, rect.width);
      const cssHeight = Math.max(1, rect.height);
      compact = cssWidth <= 700 || coarsePointer.matches ||
        (navigator.deviceMemory && navigator.deviceMemory <= 4);
      const budget = QUALITY[quality];
      frameInterval = 1000 / (compact ? budget.mobileFps : budget.fps);
      pressureSteps = compact ? budget.mobilePressure : budget.pressure;
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        s.maxRatio,
        Math.sqrt((compact ? 360000 : PIXEL_BUDGET) * budget.pixels / (cssWidth * cssHeight))
      );
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      size.width = cssWidth;
      size.height = cssHeight;
      const base = (compact ? 0.22 : s.resolution) * 0.5;
      const scale = base * Math.min(1, Math.sqrt((compact ? 16000 : MAX_CELLS) / (cssWidth * cssHeight * base * base))) * budget.grid;
      const gridWidth = clamp(Math.round(cssWidth * scale), 16, 1024);
      const gridHeight = clamp(Math.round(cssHeight * scale), 16, 1024);
      if (gridWidth === grid.width && gridHeight === grid.height) return;
      // Allocate transactionally, then carry the velocity/pressure field across tiers.
      // Resetting it here would visibly extinguish the flow on every budget change.
      const replacement = {};
      try {
        replacement.velocity = makeTarget(gridWidth, gridHeight, 2);
        replacement.velocityNext = makeTarget(gridWidth, gridHeight, 2);
        replacement.divergence = makeTarget(gridWidth, gridHeight, 1);
        replacement.pressure = makeTarget(gridWidth, gridHeight, 1);
        replacement.pressureNext = makeTarget(gridWidth, gridHeight, 1);
        replacement.dye = makeTarget(gridWidth, gridHeight, 4);
        replacement.dyeNext = makeTarget(gridWidth, gridHeight, 4);
        if (targets.velocity) {
          for (const key of ['velocity', 'pressure', 'dye']) {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, targets[key].framebuffer);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, replacement[key].framebuffer);
            gl.blitFramebuffer(0, 0, grid.width, grid.height, 0, 0, gridWidth, gridHeight, gl.COLOR_BUFFER_BIT, gl.NEAREST);
          }
        }
      } catch (error) {
        Object.values(replacement).forEach(target => {
          gl.deleteTexture(target.texture);
          gl.deleteFramebuffer(target.framebuffer);
        });
        throw error;
      }
      dropTargets();
      Object.assign(targets, replacement);
      grid.width = gridWidth;
      grid.height = gridHeight;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const sampleBudget = now => {
      if (timer && pendingQuery) {
        const sample = queries[nextQuery];
        const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
        if (disjoint) {
          // Invalidate every outstanding result, including ones not ready yet.
          for (const item of queries) {
            if (item.query) gl.deleteQuery(item.query);
            item.query = gl.createQuery();
            item.pending = false;
          }
          pendingQuery = 0;
          nextQuery = 0;
          gpuAverage = 0;
          gpuSamples = 0;
        } else if (gl.getQueryParameter(sample.query, gl.QUERY_RESULT_AVAILABLE)) {
          const ms = gl.getQueryParameter(sample.query, gl.QUERY_RESULT) / 1e6;
          gpuAverage = gpuSamples ? gpuAverage * 0.8 + ms * 0.2 : ms;
          gpuSamples++;
          sample.pending = false;
          pendingQuery--;
          nextQuery = (nextQuery + 1) % queries.length;
        }
      }
      if (!budgetSince) budgetSince = now;
      if (now - budgetSince < 1000) return;
      budgetSince = now;
      const budgetMs = frameInterval * 0.35;
      const cost = Math.max(cpuAverage, gpuSamples >= 2 ? gpuAverage : 0);
      const slow = cost > budgetMs || gapAverage > 24;
      const fast = cost < budgetMs * 0.55 && gapAverage < 20;
      slowWindows = slow ? slowWindows + 1 : 0;
      fastWindows = fast ? fastWindows + 1 : 0;
      const lower = slowWindows >= 2 && quality < QUALITY.length - 1;
      const higher = fastWindows >= 6 && quality > 0;
      if ((!lower && !higher) || now - qualityChanged < 4000) return;
      quality += lower ? 1 : -1;
      qualityChanged = now;
      slowWindows = fastWindows = 0;
      try { resize(false); }
      catch (_) { cleanup(); staticFallback(); }
    };

    const swap = (a, b) => {
      const held = targets[a];
      targets[a] = targets[b];
      targets[b] = held;
    };

    const bindTexture = (unit, texture, location) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(location, unit);
    };

    const use = entry => {
      gl.useProgram(entry.program);
      gl.uniform2f(entry.uniforms.uTexel, 1 / grid.width, 1 / grid.height);
      return entry.uniforms;
    };
    const draw = output => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, output ? output.framebuffer : null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const clearPigment = () => {
      gl.clearColor(0, 0, 0, 0);
      for (const target of [targets.dye, targets.dyeNext, null]) {
        if (target === undefined) continue;
        gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer || null);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    };

    const setWallpaper = (url, layer) => {
      if (disposed || lost) return;
      wallpaperLayer = layer;
      if (url === wallpaperUrl && canvas.dataset.wallpaperState) return;
      wallpaperUrl = url;
      const revision = ++wallpaperRevision;
      wallpaperReady = false;
      wallpaperImage = undefined;
      if (wallpaperRequest) wallpaperRequest.onload = wallpaperRequest.onerror = null;
      wallpaperRequest = undefined;
      clearPigment();
      canvas.dataset.wallpaperState = url ? 'loading' : 'disabled';
      if (!url) return;
      const image = new Image();
      wallpaperRequest = image;
      image.decoding = 'async';
      image.crossOrigin = 'anonymous';
      const fail = error => {
        if (disposed || lost || revision !== wallpaperRevision) return;
        wallpaperRequest = undefined;
        canvas.dataset.wallpaperState = 'failed';
        console.warn('Ambient wallpaper unavailable; using static background wash', error);
      };
      image.onerror = () => fail(new Error('Wallpaper image could not be loaded with CORS access'));
      image.onload = () => {
        if (disposed || lost || revision !== wallpaperRevision) return;
        // Never upload a request that completed after its background was disabled.
        const current = layer && getComputedStyle(layer).backgroundImage.match(/url\(\s*["']?(.*?)["']?\s*\)/)?.[1];
        if (document.documentElement.dataset.bg !== 'on' || current !== url) {
          refreshWallpaper();
          return;
        }
        const previousUnit = gl.getParameter(gl.ACTIVE_TEXTURE);
        gl.activeTexture(gl.TEXTURE0);
        const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
        const previousFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
        const previousPremultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        try {
          // Bound the upload independently of the simulation's existing pixel budget.
          const limit = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
          const ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight),
            Math.sqrt(2000000 / (image.naturalWidth * image.naturalHeight)));
          let source = image;
          if (ratio < 1) {
            source = document.createElement('canvas');
            source.width = Math.max(1, Math.round(image.naturalWidth * ratio));
            source.height = Math.max(1, Math.round(image.naturalHeight * ratio));
            const context = source.getContext('2d');
            if (!context) throw new Error('Wallpaper resampling unavailable');
            context.drawImage(image, 0, 0, source.width, source.height);
          }
          gl.bindTexture(gl.TEXTURE_2D, wallpaperTexture);
          // vUv.y=0 is screen bottom; HTML images start at their top.
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('Wallpaper texture upload failed');
          wallpaperImage = image;
          wallpaperReady = true;
          wallpaperRequest = undefined;
          canvas.dataset.wallpaperState = 'ready';
        } catch (error) { fail(error); }
        finally {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply);
          gl.bindTexture(gl.TEXTURE_2D, previousTexture);
          gl.activeTexture(previousUnit);
        }
        wake();
      };
      image.src = url;
    };

    const mapWallpaper = () => {
      if (!wallpaperReady || !wallpaperLayer || !wallpaperImage) return;
      if (boundsDirty) { bounds = container.getBoundingClientRect(); boundsDirty = false; }
      const style = getComputedStyle(wallpaperLayer);
      if (style.display === 'none' || !wallpaperLayer.offsetWidth || !wallpaperLayer.offsetHeight) {
        refreshWallpaper();
        return;
      }
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
      const scaleY = Math.hypot(matrix.c, matrix.d) || 1;
      const rect = wallpaperLayer.getBoundingClientRect();
      // CSS cover is resolved BEFORE the centered overscan transform. Using the
      // viewport's aspect alone crops portrait/mobile backgrounds incorrectly.
      const cover = Math.max(wallpaperLayer.offsetWidth / wallpaperImage.naturalWidth,
        wallpaperLayer.offsetHeight / wallpaperImage.naturalHeight);
      const width = wallpaperImage.naturalWidth * cover * scaleX;
      const height = wallpaperImage.naturalHeight * cover * scaleY;
      const left = rect.left + (rect.width - width) * 0.5;
      const top = rect.top + (rect.height - height) * 0.5;
      imageScale[0] = bounds.width / width;
      imageScale[1] = bounds.height / height;
      imageOffset[0] = (bounds.left - left) / width;
      imageOffset[1] = 1 - (bounds.bottom - top) / height;
    };

    const simulate = (s, dt) => {
      gl.viewport(0, 0, grid.width, grid.height);
      const walls = s.walls ? 1 : 0;
      let u;
      if (splats.length) u = use(programs.splat);
      for (let index = 0; index < splats.length; index++) {
        const splat = splats[index];
        bindTexture(0, targets.velocity.texture, u.uVelocity);
        gl.uniform2f(u.uSize, size.width, size.height);
        gl.uniform4f(u.uSegment, splat.ax, splat.ay, splat.bx, splat.by);
        gl.uniform2f(u.uForce, splat.vx, splat.vy);
        gl.uniform1f(u.uRadius, splat.radius);
        draw(targets.velocityNext);
        swap('velocity', 'velocityNext');
      }
      const passes = Math.ceil(s.viscosity * 4);
      if (passes) u = use(programs.smooth);
      for (let pass = 0; pass < passes; pass++) {
        bindTexture(0, targets.velocity.texture, u.uVelocity);
        gl.uniform1f(u.uAmount, Math.min(1, s.viscosity * 4 - pass) * 0.9);
        draw(targets.velocityNext);
        swap('velocity', 'velocityNext');
      }
      u = use(programs.divergence);
      bindTexture(0, targets.velocity.texture, u.uVelocity);
      gl.uniform1f(u.uWalls, walls);
      draw(targets.divergence);
      u = use(programs.pressure);
      bindTexture(1, targets.divergence.texture, u.uDivergence);
      gl.uniform1f(u.uWalls, walls);
      for (let iteration = 0; iteration < pressureSteps; iteration++) {
        bindTexture(0, targets.pressure.texture, u.uPressure);
        draw(targets.pressureNext);
        swap('pressure', 'pressureNext');
      }
      u = use(programs.project);
      bindTexture(0, targets.pressure.texture, u.uPressure);
      bindTexture(1, targets.velocity.texture, u.uVelocity);
      gl.uniform1f(u.uWalls, walls);
      draw(targets.velocityNext);
      swap('velocity', 'velocityNext');
      u = use(programs.advect);
      bindTexture(0, targets.velocity.texture, u.uVelocity);
      gl.uniform2f(u.uStep, dt / size.width, dt / size.height);
      gl.uniform1f(u.uKeep, keepFor(s.persistence, dt));
      gl.uniform1f(u.uWalls, walls);
      draw(targets.velocityNext);
      swap('velocity', 'velocityNext');

      u = use(programs.dye);
      bindTexture(0, targets.velocity.texture, u.uVelocity);
      bindTexture(1, targets.dye.texture, u.uDye);
      bindTexture(2, wallpaperTexture, u.uWallpaper);
      gl.uniform2f(u.uStep, dt / size.width, dt / size.height);
      gl.uniform2f(u.uImageScale, imageScale[0], imageScale[1]);
      gl.uniform2f(u.uImageOffset, imageOffset[0], imageOffset[1]);
      gl.uniform1f(u.uDt, dt);
      gl.uniform1f(u.uReady, wallpaperReady ? 1 : 0);
      gl.uniform1f(u.uSpeedScale, (1.25 * s.intensity) / (0.84 * Math.max(size.width, size.height)));
      gl.uniform2f(u.uSize, size.width, size.height);
      gl.uniform1i(u.uStrokeCount, Math.min(3, splats.length));
      const brush0=splats[0],brush1=splats[1],brush2=splats[2];
      for (const [location,stroke] of [[u.uStroke0,brush0],[u.uStroke1,brush1],[u.uStroke2,brush2]]) {
        if(stroke)gl.uniform4f(location,stroke.ax,stroke.ay,stroke.bx,stroke.by);
        else gl.uniform4f(location,0,0,0,0);
      }
      gl.uniform3f(u.uBrushRadii,brush0?.radius||1,brush1?.radius||1,brush2?.radius||1);
      draw(targets.dyeNext);
      swap('dye', 'dyeNext');
      splats.length = 0;
    };

    const render = s => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      const u = use(programs.display);
      bindTexture(0, targets.dye.texture, u.uDye);
      bindTexture(1, targets.velocity.texture, u.uVelocity);
      gl.uniform2f(u.uSimSize, grid.width, grid.height);
      gl.uniform1f(u.uSpeedScale, (1.25 * s.intensity) / (0.84 * Math.max(size.width, size.height)));
      gl.uniform1f(u.uLight, s.light ? 1 : 0);
      draw(null);
    };

    const wander = (t, out) => {
      const x = 0.62 * Math.sin(t * 0.83 + 1.3) + 0.38 * Math.sin(t * 1.71 + 0.4);
      const y = 0.6 * Math.sin(t * 1.07 + 2.1) + 0.4 * Math.cos(t * 0.61 + 0.7);
      out[0] = (0.5 + 0.41 * x) * size.width;
      out[1] = (0.5 + 0.41 * y) * size.height;
    };

    const sweep = (t, out) => {
      const k = clamp(t / 1.4, 0, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      const angle = -0.6 + eased * 3.6;
      const reach = 0.08 + 0.3 * eased;
      out[0] = (0.5 + Math.cos(angle) * reach * 1.1) * size.width;
      out[1] = (0.5 + Math.sin(angle) * reach * (size.width / size.height) * 0.75) * size.height;
    };

    const addStroke = (ax, ay, bx, by, dt, scale, radius) => {
      const stroke = strokePool[splats.length];
      stroke.ax = ax;
      stroke.ay = ay;
      stroke.bx = bx;
      stroke.by = by;
      stroke.vx = clamp(((bx - ax) / dt) * scale, -6000, 6000);
      stroke.vy = clamp(((by - ay) / dt) * scale, -6000, 6000);
      stroke.radius = radius;
      splats.push(stroke);
    };

    const frame = now => {
      raf = 0;
      if (disposed || lost || !visible || !pageVisible) return;
      if (lastRaf) gapAverage += (Math.min(now - lastRaf, 100) - gapAverage) * 0.08;
      lastRaf = now;
      if (now < nextFrame - 0.5) {
        raf = requestAnimationFrame(frame);
        return;
      }
      if (now >= nextWallpaperCheck) {
        nextWallpaperCheck = now + 750;
        refreshWallpaper();
      }
      sampleBudget(now);
      if (disposed) return;
      const started = performance.now();
      mapWallpaper();
      const s = settingsRef.current;
      const dt = clamp((now - last) / 1000 || 0, 0, 0.067);
      const musicEase=1-Math.exp(-dt/.16);
      music+=((audioTarget.playing?audioTarget.level:0)-music)*musicEase;
      musicBass+=((audioTarget.playing?audioTarget.bass:0)-musicBass)*musicEase;
      s.intensity=2.6+music*2.6;
      s.autoSpeed=.34+music*.48;
      s.autoIntensity=1.35+musicBass*3.2;
      s.radius=160+musicBass*100;
      last = Math.max(last, now);
      // Carry fractional deadlines: 24fps on a 60Hz display alternates 2/3 ticks.
      nextFrame += frameInterval;
      if (nextFrame < now) nextFrame = now + frameInterval;
      const pace = Math.min(1, dt * 60);
      // A stationary mouse over the page must not extinguish the ambient flow.
      const idle = now - lastInput > s.autoResumeDelay;

      if (opening.active && dt > 0) {
        sweep(opening.time, fromSpot);
        opening.time += dt;
        const fade = Math.sin(Math.min(1, opening.time / 1.4) * Math.PI);
        sweep(opening.time, toSpot);
        addStroke(fromSpot[0], fromSpot[1], toSpot[0], toSpot[1], dt, 0.2 * fade, s.radius);
        energy = 1;
        if (opening.time > 1.4) opening.active = false;
      } else if (s.autoDemo && idle && dt > 0) {
        auto.ramp = Math.min(1, auto.ramp + dt / 0.8);
        auto.phase += dt * s.autoSpeed * 1.6;
        wander(auto.phase, toSpot);
        if (auto.ready) {
          const gust = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(auto.phase * 2.6), 2);
          const scale = (s.force / 20) * 0.45 * s.autoIntensity * auto.ramp * auto.ramp * gust * pace;
          addStroke(auto.x, auto.y, toSpot[0], toSpot[1], dt, scale, s.radius);
        }
        auto.x = toSpot[0];
        auto.y = toSpot[1];
        auto.ready = true;
        energy = 1;
      } else {
        auto.ramp = 0;
        auto.ready = false;
      }

      if (pointer.moved && dt > 0) {
        pointer.moved = false;
        const span = Math.max(now - pointer.last, 8) / 1000;
        addStroke(pointer.fromX, pointer.fromY, pointer.x, pointer.y, span, (s.force / 20) * 0.15 * pace, s.radius);
        pointer.fromX = pointer.x;
        pointer.fromY = pointer.y;
        pointer.last = now;
        energy = 1;
      }

      const puff = puffs.shift();
      if (puff) splats.push(puff);

      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      if (timer && pendingQuery < queries.length && renderedFrames % 8 === 0) {
        activeQuery = queries[(nextQuery + pendingQuery) % queries.length];
        if (activeQuery.query) gl.beginQuery(timer.TIME_ELAPSED_EXT, activeQuery.query);
        else activeQuery = undefined;
      }
      if (dt > 0) simulate(s, dt);
      render(s);
      if (activeQuery) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        activeQuery.pending = true;
        pendingQuery++;
        activeQuery = undefined;
      }
      const elapsed = performance.now() - started;
      cpuAverage = renderedFrames ? cpuAverage * 0.9 + elapsed * 0.1 : elapsed;
      renderedFrames++;

      energy *= keepFor(s.persistence, dt);
      const busy = opening.active || s.autoDemo || energy > 0.002 || puffs.length > 0 || pointer.moved;
      if (busy && visible && pageVisible) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (disposed || raf || lost || !visible || !pageVisible) return;
      last = performance.now();
      nextFrame = last + frameInterval;
      lastRaf = 0;
      gapAverage = 16.7;
      budgetSince = last;
      slowWindows = fastWindows = 0;
      raf = requestAnimationFrame(frame);
    };
    const locate = event => {
      if (boundsDirty) { bounds = container.getBoundingClientRect(); boundsDirty = false; }
      const rect = bounds;
      spot.x = event.clientX - rect.left;
      spot.y = rect.bottom - event.clientY;
      spot.inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
      return spot;
    };

    const onPointerMove = event => {
      if (disposed || !pageVisible || event.pointerType === 'touch') return;
      const spot = locate(event);
      pointer.inside = spot.inside;
      if (!spot.inside) {
        pointer.ready = false;
        return;
      }
      lastInput = performance.now();
      opening.active = false;
      if (!pointer.ready) {
        pointer.fromX = spot.x;
        pointer.fromY = spot.y;
        pointer.x = spot.x;
        pointer.y = spot.y;
        pointer.last = lastInput;
        pointer.ready = true;
      }
      const travelX = spot.x - pointer.x;
      const travelY = spot.y - pointer.y;
      if (Math.hypot(travelX, travelY) > 0.5) {
        pointer.dx = pointer.dx * 0.7 + travelX * 0.3;
        pointer.dy = pointer.dy * 0.7 + travelY * 0.3;
      }
      pointer.x = spot.x;
      pointer.y = spot.y;
      pointer.moved = true;
      wake();
    };

    const onPointerDown = event => {
      if (disposed || !pageVisible || event.pointerType === 'touch') return;
      const s = settingsRef.current;
      const spot = locate(event);
      if (!spot.inside) return;
      lastInput = performance.now();
      if (!s.clickBurst) return;
      const angle =
        Math.hypot(pointer.dx, pointer.dy) > 1 ? Math.atan2(pointer.dy, pointer.dx) : Math.random() * Math.PI * 2;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const reach = s.radius * 0.5;
      const push = 1400 * (s.force / 20);
      puffs.push({
        ax: spot.x - dirX * reach,
        ay: spot.y - dirY * reach,
        bx: spot.x + dirX * reach,
        by: spot.y + dirY * reach,
        vx: dirX * push,
        vy: dirY * push,
        radius: s.radius * 0.9
      });
      if (puffs.length > 4) puffs.shift();
      energy = 1;
      wake();
    };

    const onLeave = () => {
      pointer.inside = false;
      pointer.ready = false;
    };

    const onPointerUp = event => {
      if (event.pointerType !== 'mouse') onLeave();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    const invalidateBounds = () => { boundsDirty = true; };
    window.addEventListener('scroll', invalidateBounds, { passive: true, capture: true });
    window.addEventListener('resize', invalidateBounds, { passive: true });

    const onLost = event => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      raf = 0;
      staticFallback();
    };
    const onRestored = () => { cleanup(); staticFallback(); };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const resizeObserver = new ResizeObserver(() => {
      if (disposed || lost) return;
      try { resize(); wake(); }
      catch (_) { cleanup(); staticFallback(); }
    });
    resizeObserver.observe(container);
    const onPointerMode = () => {
      if (disposed || lost) return;
      try { resize(false); }
      catch (_) { cleanup(); staticFallback(); }
    };
    coarsePointer.addEventListener('change', onPointerMode);

    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) wake();
      else { cancelAnimationFrame(raf); raf = 0; }
    });
    intersection.observe(container);

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      wallpaperRevision++;
      if (wallpaperRequest) wallpaperRequest.onload = wallpaperRequest.onerror = null;
      wallpaperRequest = wallpaperImage = wallpaperLayer = undefined;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      coarsePointer.removeEventListener('change', onPointerMode);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', invalidateBounds, true);
      window.removeEventListener('resize', invalidateBounds);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      delete canvas.dataset.renderer;
      delete canvas.dataset.wallpaperState;
      delete canvas.dataset.audioReactive;
      if (!gl.isContextLost()) {
        dropTargets();
        gl.deleteTexture(wallpaperTexture);
        gl.deleteVertexArray(vao);
        Object.values(programs).forEach(entry => gl.deleteProgram(entry.program));
        for (const sample of queries) if (sample.query) gl.deleteQuery(sample.query);
      }
    };

    cleanup.setPaused = paused => {
      pageVisible = !paused;
      pointer.ready = pointer.moved = auto.ready = false;
      if (paused) { cancelAnimationFrame(raf); raf = 0; }
      else wake();
    };
    cleanup.setLight = light => { settingsRef.current.light = light; };
    cleanup.setAudioBands = bands => { audioTarget=bands;canvas.dataset.audioReactive=String(bands.playing); };
    cleanup.setWallpaper = setWallpaper;

    try {
      settingsRef.current.light = document.documentElement.dataset.scheme === 'light';
      resize();
    }
    catch (_) { cleanup(); return staticFallback(); }
    canvas.dataset.renderer = 'webgl-fluid';
    wake();

return cleanup;
}
