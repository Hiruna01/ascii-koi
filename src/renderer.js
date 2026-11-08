// WebGL2 renderer.
//
// Pass 1 (scene): fish are drawn as soft grayscale "ink amount" (0 = paper,
// 1 = full ink) into a small R8 texture with one texel per output dot.
// Pass 2 (dither): every screen pixel finds its dot, reads the ink amount and
// picks one of a few palette tones (paper, pale, light, mid, deep ink). Between
// two tones, an ordered-dither threshold (8x8 Bayer matrix, or a line screen)
// decides which of the two the dot gets.

const SCENE_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_meta;
uniform vec2 u_res;
out vec2 v_uv;
out vec4 v_meta;
void main() {
  v_uv = a_uv;
  v_meta = a_meta;
  vec2 c = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const SCENE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_meta;
out vec4 o;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Patches: blobs that stretch across the back, like real koi markings.
float blobs(vec2 p) {
  return vnoise(p) * 0.62 + vnoise(p * 2.1 + 3.1) * 0.27 + vnoise(p * 4.7 + 7.7) * 0.11;
}

const float WHITE = 0.25;   // "white" skin: a fill of the palest dots
const float RIM = 0.44;     // the outline around every fish, a step darker than white skin

void main() {
  float kind = v_meta.x;
  float seed = v_meta.y;
  float depth = v_meta.z;
  float variety = v_meta.w;
  float u = v_uv.x;
  float v = v_uv.y;
  float av = abs(v);
  float ink;
  float a;

  if (kind < 0.5) {
    // ---------- Body ----------
    a = 1.0 - smoothstep(0.9, 1.0, av);
    float edge = smoothstep(0.62, 0.97, av);        // 0 along the spine, 1 at the rim
    float ridge = 1.0 - smoothstep(0.0, 0.38, av);  // darker line down the back

    vec2 sd = seed * vec2(37.1, 11.7);
    float n = blobs(vec2(u * 2.7, v * 0.7) + sd);
    float n2 = blobs(vec2(u * 3.9, v * 0.9) + sd.yx * 1.7);

    // Scales: an offset grid of small rounded cells along the body.
    vec2 sc = vec2(u * 13.0, v * 2.3);
    sc.y += 0.5 * mod(floor(sc.x), 2.0);
    float scaleRim = smoothstep(0.24, 0.5, length((fract(sc) - 0.5) * vec2(1.0, 1.2)));

    float base;
    if (variety < 0.5) {
      // Kohaku: white body with large deep patches.
      base = mix(WHITE, 0.97, smoothstep(0.47, 0.505, n));
    } else if (variety < 1.5) {
      // Showa: deep body broken by white and mid-tone patches.
      base = mix(0.97, 0.6, smoothstep(0.55, 0.58, n2));
      base = mix(base, WHITE, smoothstep(0.58, 0.61, n));
    } else if (variety < 2.5) {
      // Asagi: mid-tone body with a net of lighter scale edges and a darker back.
      base = 0.6 + 0.2 * ridge - 0.16 * scaleRim * (1.0 - ridge * 0.6);
    } else if (variety < 3.5) {
      // Solid: deep all over, scales just catching the light.
      base = 0.93 - 0.12 * scaleRim * (1.0 - ridge);
    } else {
      // Tancho-like: white with a deep spot on the head and a few small marks.
      float head = 1.0 - smoothstep(0.7, 1.0, length(vec2((u - 0.14) * 9.0, v * 1.9)));
      float marks = smoothstep(0.62, 0.65, n);
      base = mix(WHITE, 0.95, max(head, marks));
    }

    // White skin shows a faint scale texture too.
    float isWhite = 1.0 - smoothstep(WHITE, WHITE + 0.2, base);
    base += isWhite * 0.05 * (1.0 - scaleRim);

    ink = base + 0.05 * ridge;
    // Pale outline: dark areas fade to the rim tone, white areas gain it.
    ink = mix(ink, RIM, edge * 0.8);
    // Snout and tail stem are a touch lighter, so the head reads rounded.
    ink = mix(ink, min(ink, 0.55), (1.0 - smoothstep(0.0, 0.06, u)) * 0.7);
    ink = mix(ink, 0.5, smoothstep(0.88, 1.0, u) * 0.6);

    // Eyes: tiny dark points on each side of the head.
    float eye = 1.0 - smoothstep(0.012, 0.022, length(vec2(u - 0.085, (av - 0.62) * 0.13)));
    ink = mix(ink, 1.0, eye);
  } else if (kind < 1.5) {
    // ---------- Tail fin: big, pale and forked, with fin rays ----------
    float cut = (u - 0.5) * 0.85;
    float notch = cut > 0.0 ? 1.0 - smoothstep(cut - 0.16, cut + 0.02, av) : 0.0;
    float edge = 1.0 - smoothstep(0.72, 1.0, av);
    float tip = 1.0 - smoothstep(0.78, 1.0, u + 0.18 * (1.0 - av));
    a = edge * tip * (1.0 - notch);
    float rays = 0.85 + 0.15 * sin(v * 15.0 + seed * 20.0);
    ink = mix(0.42, 0.15, smoothstep(0.0, 0.5, u)) * rays;
  } else {
    // ---------- Paired fins: translucent rounded fans with rays ----------
    float r = length(vec2((u - 0.55) / 0.5, v / (0.3 + 0.7 * u)));
    a = 1.0 - smoothstep(0.62, 1.0, r);
    float rays = 0.88 + 0.12 * sin(v * 10.0 + u * 3.0);
    ink = mix(0.3, 0.13, u) * rays;
  }

  // Deeper fish are paler.
  ink *= mix(1.0, 0.6, depth);
  o = vec4(clamp(ink, 0.0, 1.0), 0.0, 0.0, a);
}`;

const DITHER_VS = `#version 300 es
void main() {
  // Full-screen triangle.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const DITHER_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_scene;
uniform float u_canvasH;
uniform float u_dot;
uniform int u_mode;
uniform vec3 u_ink;
uniform vec4 u_bg;
uniform float u_stops[9]; // ink amount of each palette tone, u_stops[0] = 0 (paper)
uniform int u_count;      // number of tones including paper
out vec4 o;

float bayer8(ivec2 p) {
  int x = p.x & 7;
  int y = p.y & 7;
  int xy = x ^ y;
  int v = ((xy & 1) << 5) | ((y & 1) << 4) | ((xy & 2) << 2)
        | ((y & 2) << 1) | ((xy & 4) >> 1) | ((y & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}

void main() {
  vec2 fc = vec2(gl_FragCoord.x, u_canvasH - gl_FragCoord.y);
  ivec2 cell = ivec2(floor(fc / u_dot));
  ivec2 ts = textureSize(u_scene, 0);
  ivec2 tc = ivec2(min(cell.x, ts.x - 1), ts.y - 1 - min(cell.y, ts.y - 1));
  float k = texelFetch(u_scene, tc, 0).r;

  float b = bayer8(cell);
  float th;
  if (u_mode == 1) {
    // Line screen: horizontal lines that get thicker as ink increases.
    float l = abs(fract((float(cell.y) + 0.5) / 5.0) - 0.5) * 2.0;
    th = l * 0.86 + b * 0.14;
  } else {
    th = b;
  }
  // Ordered dither between the two palette tones around k.
  int i = 0;
  for (int j = 1; j < 9; j++) {
    if (j >= u_count) break;
    if (k >= u_stops[j]) i = j;
  }
  float tone;
  if (i >= u_count - 1) {
    tone = u_stops[u_count - 1];
  } else {
    float lo = u_stops[i];
    float hi = u_stops[i + 1];
    tone = (k - lo) / (hi - lo) > th ? hi : lo;
  }
  vec3 bgP = u_bg.rgb * u_bg.a; // premultiplied
  o = vec4(mix(bgP, u_ink, tone), mix(u_bg.a, 1.0, tone));
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('koi-pond: shader compile failed: ' + log);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('koi-pond: program link failed: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

export function createRenderer(gl) {
  const sceneProg = program(gl, SCENE_VS, SCENE_FS);
  const ditherProg = program(gl, DITHER_VS, DITHER_FS);
  const loc = {
    res: gl.getUniformLocation(sceneProg, 'u_res'),
    scene: gl.getUniformLocation(ditherProg, 'u_scene'),
    canvasH: gl.getUniformLocation(ditherProg, 'u_canvasH'),
    dot: gl.getUniformLocation(ditherProg, 'u_dot'),
    mode: gl.getUniformLocation(ditherProg, 'u_mode'),
    ink: gl.getUniformLocation(ditherProg, 'u_ink'),
    bg: gl.getUniformLocation(ditherProg, 'u_bg'),
    stops: gl.getUniformLocation(ditherProg, 'u_stops'),
    count: gl.getUniformLocation(ditherProg, 'u_count'),
  };
  const stopBuf = new Float32Array(9);

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = 8 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
  gl.bindVertexArray(null);

  const emptyVao = gl.createVertexArray();

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  let sceneW = 0;
  let sceneH = 0;

  function resizeScene(w, h) {
    if (w === sceneW && h === sceneH) return;
    sceneW = w;
    sceneH = h;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return {
    /**
     * frame: { canvasW, canvasH (device px), dot (device px per dot), cssPerDot,
     *          vertices: Float32Array, count, mode: 0|1, ink:[r,g,b], bg:[r,g,b,a],
     *          stops: [0, ..., 1] ink amount of each palette tone }
     */
    render(frame) {
      const sw = Math.max(1, Math.ceil(frame.canvasW / frame.dot));
      const sh = Math.max(1, Math.ceil(frame.canvasH / frame.dot));
      resizeScene(sw, sh);

      // Pass 1: scene.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, sw, sh);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (frame.count > 0) {
        gl.useProgram(sceneProg);
        gl.uniform2f(loc.res, sw * frame.cssPerDot, sh * frame.cssPerDot);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, frame.vertices.subarray(0, frame.count * 8), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, frame.count);
        gl.disable(gl.BLEND);
      }

      // Pass 2: dither to the canvas.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, frame.canvasW, frame.canvasH);
      gl.useProgram(ditherProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc.scene, 0);
      gl.uniform1f(loc.canvasH, frame.canvasH);
      gl.uniform1f(loc.dot, frame.dot);
      gl.uniform1i(loc.mode, frame.mode);
      gl.uniform3fv(loc.ink, frame.ink);
      gl.uniform4fv(loc.bg, frame.bg);
      stopBuf.fill(1);
      stopBuf.set(frame.stops.slice(0, 9));
      gl.uniform1fv(loc.stops, stopBuf);
      gl.uniform1i(loc.count, Math.min(9, frame.stops.length));
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },

    dispose() {
      gl.deleteProgram(sceneProg);
      gl.deleteProgram(ditherProg);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(emptyVao);
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
    },
  };
}
