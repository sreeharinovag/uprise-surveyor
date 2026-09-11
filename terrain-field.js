/* <terrain-field> — scroll-driven WebGL elevation field.
   One persistent canvas behind the page. Each [data-terrain] section names an
   environment; the camera and the height function morph between them as you scroll,
   so the page reads as one continuous survey flight rather than separate blocks. */
(() => {
  if (window.customElements && customElements.get('terrain-field')) return;

  const VERT = `#version 300 es
  precision highp float;
  in vec2 aGrid;
  uniform mat4 uProj, uView;
  uniform float uTime, uFreq, uAmp, uRidge, uTerrace, uBlocky, uWater, uWarp, uDrift;
  uniform vec2 uOrigin;
  out float vH; out float vD; out vec2 vP; out float vWater;

  float hash(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return s;
  }
  float height(vec2 p){
    vec2 q = p * uFreq + vec2(0.0, uDrift);
    q += uWarp * 0.7 * vec2(fbm(q * 0.5), fbm(q * 0.5 + 7.3));
    float h = fbm(q);
    float r = 1.0 - abs(2.0 * h - 1.0);
    h = mix(h, r * r * 0.95, uRidge);
    float steps = 7.0;
    h = mix(h, floor(h * steps) / steps + 0.02, uTerrace);
    vec2 cell = floor(p * 2.2);
    float bh = 0.18 + 0.72 * pow(hash(cell * 1.7), 2.2);
    float pad = 0.12;
    vec2 inCell = fract(p * 2.2);
    float road = step(pad, inCell.x) * step(pad, inCell.y) * step(inCell.x, 1.0 - pad) * step(inCell.y, 1.0 - pad);
    h = mix(h, mix(0.06, bh, road), uBlocky);
    return h * uAmp;
  }
  void main(){
    vec2 p = aGrid + uOrigin;
    float h = height(p);
    float w = 0.0;
    if (uWater > 0.001){ float wl = uWater * uAmp; if (h < wl){ h = wl + 0.004 * sin(p.x * 9.0 + uTime * 0.7) * cos(p.y * 7.0 - uTime * 0.5); w = 1.0; } }
    vH = h / max(uAmp, 0.001);
    vWater = w;
    vP = p;
    vec4 world = vec4(aGrid.x, h, aGrid.y, 1.0);
    vec4 eye = uView * world;
    vD = -eye.z;
    gl_Position = uProj * eye;
    gl_PointSize = 2.6;
  }`;

  const FRAG = `#version 300 es
  precision highp float;
  in float vH; in float vD; in vec2 vP; in float vWater;
  uniform vec3 uInk, uAccent;
  uniform float uMode, uContour, uSweep, uFade, uAlpha, uParcel;
  out vec4 o;
  void main(){
    float fog = clamp(1.0 - (vD - 1.2) / uFade, 0.0, 1.0);
    fog = pow(fog, 1.35);
    vec3 c;
    float a = uAlpha;
    if (uMode < 0.5){                              // filled ground
      c = mix(uInk * 0.55, uInk * 1.9, smoothstep(0.05, 0.85, vH));
      c = mix(c, vec3(0.06, 0.10, 0.11), vWater * 0.8);
    } else {                                        // wire / points
      float band = abs(fract(vH * uContour) - 0.5) * 2.0;
      float line = smoothstep(0.55, 1.0, band);
      c = mix(uInk * 3.4, uAccent, 0.3 + 0.6 * line);
      float parcel = max(abs(fract(vP.x * 2.2) - 0.5), abs(fract(vP.y * 2.2) - 0.5));
      c = mix(c, uAccent, uParcel * smoothstep(0.44, 0.5, parcel) * 0.5);
      a *= 0.22 + 0.78 * line;
      c = mix(c, vec3(0.42, 0.72, 0.86), vWater * 0.55);
    }
    float d = abs(vP.y - uSweep);                   // lidar sweep
    float scan = exp(-d * d * 9.0);
    c += uAccent * scan * (uMode < 0.5 ? 0.16 : 0.85);
    a += scan * (uMode < 0.5 ? 0.0 : 0.25);
    o = vec4(c * fog, clamp(a * fog, 0.0, 1.0));
  }`;

  // environment presets: freq, amp, ridge, terrace, blocky, water, warp, contour, parcel
  const ENV = {
    hero:      { f: 1.55, a: 0.95, r: 0.85, t: 0.00, b: 0, w: 0.00, wp: 0.15, c: 13, p: 0.0, cam: [0.0, 1.35, 2.60, -0.30, 0.00] },
    mountain:  { f: 1.70, a: 1.05, r: 0.95, t: 0.00, b: 0, w: 0.00, wp: 0.10, c: 15, p: 0.0, cam: [0.4, 1.25, 2.50, -0.28, 0.22] },
    geologic:  { f: 2.20, a: 0.80, r: 0.40, t: 0.85, b: 0, w: 0.00, wp: 0.25, c: 9,  p: 0.0, cam: [-0.5, 1.05, 2.30, -0.26, -0.28] },
    coastal:   { f: 1.15, a: 0.70, r: 0.20, t: 0.00, b: 0, w: 0.42, wp: 0.35, c: 11, p: 0.0, cam: [0.2, 0.95, 2.60, -0.22, 0.10] },
    urban:     { f: 1.00, a: 0.55, r: 0.00, t: 0.00, b: 1, w: 0.00, wp: 0.00, c: 8,  p: 0.6, cam: [0.0, 1.15, 2.20, -0.30, -0.12] },
    satellite: { f: 0.85, a: 0.30, r: 0.00, t: 0.00, b: 0, w: 0.00, wp: 0.20, c: 22, p: 0.9, cam: [0.0, 2.30, 2.00, -1.15, 0.00] },
    dtm:       { f: 1.40, a: 0.85, r: 0.30, t: 0.00, b: 0, w: 0.00, wp: 0.10, c: 18, p: 0.2, cam: [0.6, 1.20, 2.40, -0.30, 0.34] },
    abstract:  { f: 0.60, a: 0.60, r: 0.55, t: 0.00, b: 0, w: 0.00, wp: 1.00, c: 12, p: 0.0, cam: [-0.3, 1.10, 2.70, -0.26, -0.18] }
  };

  const mat4 = {
    persp(fov, ar, n, f) {
      const t = 1 / Math.tan(fov / 2);
      return [t / ar, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
    },
    look(e, c, u) {
      let z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -dot(x, e), -dot(y, e), -dot(z, e), 1];
    }
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  class TerrainField extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      this.style.display = 'block';
      this.style.position = 'absolute';
      this.style.inset = '0';
      this.style.background = 'radial-gradient(120% 62% at 50% 46%, rgba(140,198,63,.075), transparent 60%), linear-gradient(180deg, #050706 0%, #080b0a 38%, #0a0e0c 100%)';
      this.canvas = document.createElement('canvas');
      Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
      this.appendChild(this.canvas);

      this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' });
      if (!gl) { this.fallback(); return; }
      this.gl = gl;

      this.prog = this.build(VERT, FRAG);
      if (!this.prog) { this.fallback(); return; }
      this.u = {};
      ['uProj', 'uView', 'uTime', 'uFreq', 'uAmp', 'uRidge', 'uTerrace', 'uBlocky', 'uWater', 'uWarp',
        'uDrift', 'uOrigin', 'uInk', 'uAccent', 'uMode', 'uContour', 'uSweep', 'uFade', 'uAlpha', 'uParcel']
        .forEach(n => this.u[n] = gl.getUniformLocation(this.prog, n));

      this.mesh();
      this.state = Object.assign({}, ENV.hero);
      this.target = Object.assign({}, ENV.hero);
      this.cam = ENV.hero.cam.slice();
      this.camT = ENV.hero.cam.slice();
      this.sweep = -1.2;
      this.t0 = performance.now();

      this.onResize = () => this.size();
      addEventListener('resize', this.onResize, { passive: true });
      this.onScroll = () => { this.dirty = true; };
      addEventListener('scroll', this.onScroll, { passive: true });
      this.size();
      this.pick();
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
      this.vis = () => { if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; } else if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.loop); } };
      document.addEventListener('visibilitychange', this.vis);
    }

    disconnectedCallback() {
      cancelAnimationFrame(this.raf);
      removeEventListener('resize', this.onResize);
      removeEventListener('scroll', this.onScroll);
      document.removeEventListener('visibilitychange', this.vis);
    }

    fallback() {
      this.canvas.remove();
      this.style.background = 'radial-gradient(120% 80% at 70% 0%, rgba(140,198,63,.10), transparent 62%), #07090a';
    }

    build(vs, fs) {
      const gl = this.gl;
      const mk = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('terrain-field:', gl.getShaderInfoLog(s)); return null; }
        return s;
      };
      const a = mk(gl.VERTEX_SHADER, vs), b = mk(gl.FRAGMENT_SHADER, fs);
      if (!a || !b) return null;
      const p = gl.createProgram(); gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('terrain-field:', gl.getProgramInfoLog(p)); return null; }
      return p;
    }

    mesh() {
      const gl = this.gl;
      const N = innerWidth < 760 ? 108 : 168;          // grid resolution
      const SX = 8.6, Z0 = 2.9, Z1 = -7.4;             // field spans forward of the camera
      const pos = new Float32Array(N * N * 2);
      let k = 0;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        pos[k++] = (x / (N - 1) - 0.5) * SX;
        pos[k++] = Z0 + (Z1 - Z0) * (z / (N - 1));
      }
      const tri = [], lin = [], pts = [];
      const id = (x, z) => z * N + x;
      for (let z = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) {
        tri.push(id(x, z), id(x + 1, z), id(x, z + 1), id(x + 1, z), id(x + 1, z + 1), id(x, z + 1));
        if (x % 2 === 0) lin.push(id(x, z), id(x, z + 1));
        if (z % 2 === 0) lin.push(id(x, z), id(x + 1, z));
      }
      for (let z = 6; z < N - 6; z += 14) for (let x = 6; x < N - 6; x += 14) pts.push(id(x, z));
      this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      const ibo = (arr) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(arr), gl.STATIC_DRAW);
        return { buf: b, n: arr.length };
      };
      this.iTri = ibo(tri); this.iLin = ibo(lin); this.iPts = ibo(pts);
      this.loc = gl.getAttribLocation(this.prog, 'aGrid');
    }

    size() {
      const gl = this.gl, dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.6 : 2);
      const w = Math.max(1, Math.round(this.clientWidth * dpr)), h = Math.max(1, Math.round(this.clientHeight * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w; this.canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      this.ar = this.clientWidth / Math.max(1, this.clientHeight);
      this.dirty = true;
    }

    pick() {
      const secs = [...document.querySelectorAll('[data-terrain]')];
      if (!secs.length) return;
      const mid = innerHeight * 0.42;
      let cur = secs[0], next = secs[0], f = 0;
      for (let i = 0; i < secs.length; i++) {
        const r = secs[i].getBoundingClientRect();
        if (r.top <= mid) { cur = secs[i]; next = secs[Math.min(i + 1, secs.length - 1)];
          f = r.height ? Math.min(1, Math.max(0, (mid - r.top) / r.height)) : 0; }
      }
      const A = ENV[cur.dataset.terrain] || ENV.hero, B = ENV[next.dataset.terrain] || A;
      const e = f < 0.72 ? 0 : (f - 0.72) / 0.28;                   // hand over near the seam
      const m = e * e * (3 - 2 * e);
      const L = (a, b) => a + (b - a) * m;
      this.target = { f: L(A.f, B.f), a: L(A.a, B.a), r: L(A.r, B.r), t: L(A.t, B.t), b: L(A.b, B.b),
        w: L(A.w, B.w), wp: L(A.wp, B.wp), c: L(A.c, B.c), p: L(A.p, B.p) };
      this.camT = A.cam.map((v, i) => L(v, B.cam[i]));
    }

    loop(now) {
      this.raf = requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      this.pick();
      const k = this.reduced.matches ? 1 : 1 - Math.pow(0.001, dt);
      for (const key in this.target) { if (key === 'cam') continue; this.state[key] += (this.target[key] - this.state[key]) * k; }
      for (let i = 0; i < 5; i++) this.cam[i] += (this.camT[i] - this.cam[i]) * k;
      const t = this.reduced.matches ? 0 : (now - this.t0) / 1000;
      this.sweep = this.reduced.matches ? -1.5 : 1.2 - ((t * 0.55) % 9.2);
      this.draw(t);
    }

    draw(t) {
      const gl = this.gl, s = this.state, c = this.cam;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.prog);

      const eye = [c[0] + Math.sin(t * 0.06) * 0.05, c[1], c[2]];
      const look = [c[0] * 0.3 + Math.sin(c[4]) * 1.1, c[1] + c[3] * 2.2, c[2] - 3.2];
      gl.uniformMatrix4fv(this.u.uProj, false, mat4.persp(0.95, this.ar || 1.6, 0.05, 14.0));
      gl.uniformMatrix4fv(this.u.uView, false, mat4.look(eye, look, [0, 1, 0]));
      gl.uniform1f(this.u.uTime, t);
      gl.uniform1f(this.u.uFreq, s.f); gl.uniform1f(this.u.uAmp, s.a);
      gl.uniform1f(this.u.uRidge, s.r); gl.uniform1f(this.u.uTerrace, s.t);
      gl.uniform1f(this.u.uBlocky, s.b); gl.uniform1f(this.u.uWater, s.w);
      gl.uniform1f(this.u.uWarp, s.wp); gl.uniform1f(this.u.uContour, s.c);
      gl.uniform1f(this.u.uParcel, s.p);
      gl.uniform1f(this.u.uDrift, this.reduced.matches ? 0 : t * 0.035);
      gl.uniform2f(this.u.uOrigin, 0, this.reduced.matches ? 0 : t * 0.035);
      gl.uniform1f(this.u.uSweep, this.sweep);
      gl.uniform1f(this.u.uFade, 6.4);
      gl.uniform3f(this.u.uInk, 0.085, 0.105, 0.098);
      const ac = this.getAttribute('accent') || '#8cc63f';
      const rgb = [1, 3, 5].map(i => parseInt(ac.substr(i, 2), 16) / 255);
      gl.uniform3f(this.u.uAccent, rgb[0], rgb[1], rgb[2]);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(this.loc);
      gl.vertexAttribPointer(this.loc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(this.u.uMode, 0); gl.uniform1f(this.u.uAlpha, 0.96);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iTri.buf);
      gl.drawElements(gl.TRIANGLES, this.iTri.n, gl.UNSIGNED_INT, 0);

      gl.uniform1f(this.u.uMode, 1); gl.uniform1f(this.u.uAlpha, 0.62);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iLin.buf);
      gl.drawElements(gl.LINES, this.iLin.n, gl.UNSIGNED_INT, 0);

      gl.uniform1f(this.u.uMode, 1); gl.uniform1f(this.u.uAlpha, 0.95);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iPts.buf);
      gl.drawElements(gl.POINTS, this.iPts.n, gl.UNSIGNED_INT, 0);
    }
  }
  customElements.define('terrain-field', TerrainField);
})();
