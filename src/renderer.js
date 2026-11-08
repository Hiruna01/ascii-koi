// WebGL2 renderer.
//
// Pass 1 (scene): fish are drawn as soft grayscale "ink amount" (0 = paper,
// 1 = full ink) into a small R8 texture with one texel per output dot.
// Pass 2 (dither): every screen pixel finds its dot, reads the ink amount and
// compares it with an ordered-dither threshold (8x8 Bayer matrix, or a line
// screen). Above the threshold the dot is ink, otherwise it is background.

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

void main() {
  float kind = v_meta.x;
  float seed = v_meta.y;
  float depth = v_meta.z;
  float patchTh = v_meta.w;
  float u = v_uv.x;
  float v = v_uv.y;
  float av = abs(v);
  float ink;
  float a;

  if (kind < 0.5) {
    // Body: dense in the middle, softer towards the edges.
    a = 1.0 - smoothstep(0.6, 1.0, av);
    ink = 0.98 - 0.32 * av * av + 0.05 * (1.0 - u);
    // White patches from low-frequency noise in fish space (they move with the body).
    float n = vnoise(vec2(u * 3.4, v * 1.1) + seed * 91.7) * 0.72
            + vnoise(vec2(u * 8.0, v * 2.4) + seed * 13.1) * 0.28;
    float p = smoothstep(patchTh - 0.05, patchTh + 0.05, n);
    p *= 1.0 - smoothstep(0.7, 0.92, u); // keep the tail end coloured
    // White patches keep a faint fill and a dotted outline so the fish stays readable.
    float rim = smoothstep(0.45, 0.85, av);
    ink = mix(ink, mix(0.16, 0.6, rim), p);
    // Fade a little where the body meets the tail fin.
    ink *= mix(1.0, 0.72, smoothstep(0.82, 1.0, u));
  } else if (kind < 1.5) {
    // Tail fin: translucent, streaky, forked at the end.
    float cut = (u - 0.5) * 1.25;
    float notch = cut > 0.0 ? 1.0 - smoothstep(cut - 0.14, cut, av) : 0.0;
    float edge = 1.0 - smoothstep(0.62, 1.0, av);
    float tip = 1.0 - smoothstep(0.8, 1.0, u);
    a = edge * tip * (1.0 - notch);
    float streak = 0.7 + 0.3 * sin(v * 11.0 + seed * 20.0);
    ink = 0.58 * streak * (1.0 - 0.35 * u);
  } else {
    // Pectoral fin: a translucent teardrop.
    float w = pow(sin(3.14159 * clamp(u * 0.85 + 0.15, 0.0, 1.0)), 0.7);
    float r = av / max(w, 1e-3);
    a = 1.0 - smoothstep(0.55, 1.0, r);
    ink = 0.36 * (1.0 - 0.45 * u);
  }

  ink *= mix(1.0, 0.55, depth);
  o = vec4(ink, 0.0, 0.0, a);
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
  float on = k > th ? 1.0 : 0.0;
  vec4 bg = vec4(u_bg.rgb * u_bg.a, u_bg.a);
  o = mix(bg, vec4(u_ink, 1.0), on);
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
  };

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
     *          vertices: Float32Array, count, mode: 0|1, ink:[r,g,b], bg:[r,g,b,a] }
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
