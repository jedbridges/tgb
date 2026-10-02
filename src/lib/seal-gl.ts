/**
 * Putting the light on the wax, and keeping it cheap.
 *
 * The performance rules this file exists to enforce, all of them learned on this page:
 *
 * There is no animation loop. The seal is drawn once and then only when something has
 * actually changed: the pointer moved, the element resized, the colour scheme flipped.
 * When the light is settling toward a new direction it schedules itself, and it stops
 * scheduling the moment it arrives. A still page costs nothing at all.
 *
 * Nothing is written to the DOM per frame. The old seal set two custom properties on every
 * pointer move, which is a style invalidation on every pointer move; here the pointer
 * writes two numbers into a local object and the only thing that reaches the browser is
 * three uniforms and a draw call.
 *
 * Layout is never read inside a handler. Rects are measured once, cached, and dropped on
 * scroll and resize, then re-measured lazily in the next frame. Scroll is listened for
 * with capture, because base.css makes the body the scroll container and a scroll event
 * from an element does not bubble to window: the previous version missed this and its
 * cached rects went stale as soon as the page moved.
 *
 * If anything is missing or goes wrong, the server-rendered SVG is still sitting
 * underneath and simply stays visible.
 */
import { P, R_MAX, FIELD_C, RELIEF_HALF } from './seal-geometry';
import { VERT, frag } from './seal-shader';
import { buildRelief } from './seal-relief';

/** Rest light: over the left shoulder, which is where the old deboss was lit from.
 *  Raking rather than overhead. A light high on the z axis flattens everything it touches,
 *  and relief is only visible as the shadow it throws, so this sits low enough to model
 *  the lettering and the meniscus and still high enough not to look theatrical. */
const REST: [number, number, number] = [-0.34, -0.62, 0.52];
/** Backing store cap. Past this the extra pixels are invisible and the fill is not. */
const MAX_PX = 1400;

const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** sRGB to linear, for colours going to a shader that works in linear light. */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function makeColourReader() {
  /* Custom properties compute to whatever token they were written as, and a computed
     colour may serialise as oklch(), which no amount of string parsing should be asked to
     handle. The browser already has a colour parser, so: paint the value into one pixel
     and read the pixel back. */
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return (css: string, fallback: [number, number, number]): [number, number, number] => {
    if (!ctx) return fallback;
    ctx.fillStyle = '#010203';
    ctx.fillStyle = css;
    // An unparseable value leaves fillStyle at the sentinel, which is how we detect it.
    if (ctx.fillStyle === '#010203') return fallback;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [toLinear(d[0] / 255), toLinear(d[1] / 255), toLinear(d[2] / 255)];
  };
}

export function mountWaxSeal(root: HTMLElement): void {
  const svg = root.querySelector<SVGSVGElement>('.seal__svg');
  if (!svg) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'seal__gl';
  canvas.setAttribute('aria-hidden', 'true');

  const ctx0 = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false,
    depth: false, stencil: false, preserveDrawingBuffer: false,
    powerPreference: 'low-power',
    // Software GL would render this correctly and slowly, and the SVG is both cheaper and
    // better on such a machine.
    failIfMajorPerformanceCaveat: true,
  }) as WebGLRenderingContext | null;
  if (!ctx0) return;
  // A separately typed binding, because the narrowing from that guard does not follow
  // into the handlers declared below.
  const gl: WebGLRenderingContext = ctx0;

  // Finite differences across four hundred units need real precision. mediump quantises
  // the gradient and the whole surface goes faceted.
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!hp || hp.precision < 23) return;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram()!;
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, frag());
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    if (import.meta.env.DEV) console.warn('[seal]', gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // One triangle big enough to cover the clip square. Two fewer vertices than a quad and
  // no shared edge for the rasteriser to seam along.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const U = (n: string) => gl.getUniformLocation(prog, n);
  const uBox = U('uBox'), uTexU = U('uTexU'), uUPP = U('uUPP'), uLight = U('uL');
  const uShadowOff = U('uShadowOff'), uStrike = U('uStrike'), uShadowA = U('uShadowA');
  const uWax = U('uWax'), uWaxDeep = U('uWaxDeep'), uWaxEdge = U('uWaxEdge'), uTilt = U('uTilt');
  const uPaper = U('uPaper'), uShadowInk = U('uShadowInk');

  gl.uniform2f(uBox, 400, 400);
  gl.uniform1i(U('uRelief'), 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const readColour = makeColourReader();
  const probes = root.querySelectorAll<HTMLElement>('.seal__probe i');

  function readColours() {
    const cs = getComputedStyle(root);
    const get = (i: number, fb: [number, number, number]) =>
      probes[i] ? readColour(getComputedStyle(probes[i]).color, fb) : fb;
    gl.uniform3fv(uWax, get(0, [0.17, 0.04, 0.02]));
    gl.uniform3fv(uWaxDeep, get(1, [0.08, 0.02, 0.01]));
    gl.uniform3fv(uWaxEdge, get(2, [0.34, 0.10, 0.05]));
    gl.uniform3fv(uPaper, get(3, [0.85, 0.80, 0.77]));
    state.colours = probes.length ? [...probes].map((i) => getComputedStyle(i).color).join() : 'none';
    const ink = (cs.getPropertyValue('--shadow-ink') || '20 12 8').trim().split(/\s+/).map(Number);
    gl.uniform3f(uShadowInk, toLinear((ink[0] || 20) / 255), toLinear((ink[1] || 12) / 255), toLinear((ink[2] || 8) / 255));
    gl.uniform1f(uShadowA, Number(cs.getPropertyValue('--shadow-a')) || 1);
  }

  /* --seal-rotate is a contract with whatever places the seal: the element may be turned,
     but the light comes from the page, not from the element. Rotating the light the other
     way keeps the highlight where the room is, instead of letting the shadow travel round
     to the top when the seal is tilted. */
  const rotation = () => {
    const v = getComputedStyle(root).getPropertyValue('--seal-rotate').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? (-n * Math.PI) / 180 : 0;
  };

  const state = {
    cur: [...REST] as [number, number, number],
    tgt: [...REST] as [number, number, number],
    // Radians about x and y. The disc turns toward the pointer as well as catching its
    // light, which is the difference between a lit picture and a thing on a table.
    tilt: [0, 0] as [number, number],
    tiltTgt: [0, 0] as [number, number],
    strike: 1,
    strikeFrom: 0,
    raf: 0,
    visible: false,
    dirty: true,
    rot: 0,
    colours: '',
    size: 0,
    px: 0,
    lost: false,
    /* A signature of everything draw() actually depends on.
       Not scheduling when nothing changed relies on every caller being disciplined, and
       in Safari one of them is not: a sweep that measured a clean sixty frames a second
       still counted 179 draws across three idle seconds, so some observer was asking for
       frames that Chrome never asked for. Rather than keep hunting the caller, the draw
       itself refuses: if the inputs are identical to the last frame there is nothing to
       paint and nothing to schedule, whoever asked and whatever browser they are in. */
    sig: '',
    heroRect: null as DOMRect | null,
    sealRect: null as DOMRect | null,
    pointer: null as { x: number; y: number } | null,
  };

  const hero = root.closest('section');
  const forget = () => { state.heroRect = null; state.sealRect = null; };
  const measure = () => {
    state.heroRect = hero?.getBoundingClientRect() ?? null;
    state.sealRect = root.getBoundingClientRect();
  };

  function resize(): boolean {
    const css = root.clientWidth;
    if (!css) return false;
    const px = Math.min(MAX_PX, Math.round(css * Math.min(window.devicePixelRatio || 1, 2)));
    if (px === state.px) return false;
    state.px = px;
    canvas.width = canvas.height = px;
    gl.viewport(0, 0, px, px);
    gl.uniform1f(uUPP, 400 / px);
    return true;
  }

  function uploadRelief() {
    const r = buildRelief(svg!, root.clientWidth || 400);
    if (!r) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, r.size, r.size, 0,
      gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, r.data);
    gl.uniform1f(uTexU, r.unitsPerTexel);
  }

  function draw() {
    const c = Math.cos(state.rot), s = Math.sin(state.rot);
    const [lx, ly, lz] = state.cur;
    gl.uniform3f(uLight, lx * c - ly * s, lx * s + ly * c, lz);
    // The shadow falls away from the light, further the lower the light sits.
    const k = Math.min(10, 8 / Math.max(lz, 0.3));
    const sx = -lx * k, sy = -ly * k;
    gl.uniform2f(uShadowOff, sx * c - sy * s, sx * s + sy * c);
    gl.uniform1f(uStrike, state.strike);
    // Tilt rides the same rotation contract as the light, so a seal set at an angle on the
    // page still turns about the axes the reader's pointer is moving along.
    const [tx, ty] = state.tilt;
    gl.uniform2f(uTilt, tx * c - ty * s, tx * s + ty * c);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const schedule = () => {
    if (!state.raf && state.visible && !document.hidden && !state.lost) {
      state.raf = requestAnimationFrame(frame);
    }
  };

  function frame(now: number) {
    state.raf = 0;
    if (!state.sealRect) measure();

    // Exponential approach. Bounded: once it is within a thousandth of the target it
    // stops asking for frames, so a settled page schedules nothing.
    let moving = false;
    for (let i = 0; i < 3; i++) {
      const d = state.tgt[i] - state.cur[i];
      if (Math.abs(d) > 0.0015) { state.cur[i] += d * 0.22; moving = true; }
      else state.cur[i] = state.tgt[i];
    }
    for (let i = 0; i < 2; i++) {
      const d = state.tiltTgt[i] - state.tilt[i];
      // A heavier disc than the light: the lamp can move instantly, a lump of wax should
      // look like it has mass.
      if (Math.abs(d) > 0.00008) { state.tilt[i] += d * 0.14; moving = true; }
      else state.tilt[i] = state.tiltTgt[i];
    }
    if (state.strike < 1) {
      /* 560ms, not the 820 the wrapper's fade uses. A press is a fast movement that stops
         dead: most of the travel happens in the first third and the rest is the wax
         settling under the metal. Quartic ease-out gives exactly that shape. */
      const t = Math.min(1, (now - state.strikeFrom) / 560);
      state.strike = 1 - Math.pow(1 - t, 4);
      if (t < 1) moving = true; else state.strike = 1;
    }

    const sig = state.cur.map((v) => v.toFixed(4)).join() + '|' +
      state.tilt.map((v) => v.toFixed(5)).join() + '|' + state.strike.toFixed(4) + '|' +
      state.px + '|' + state.rot.toFixed(3) + '|' + state.colours;
    if (sig !== state.sig || state.dirty) {
      state.sig = sig;
      draw();
      state.dirty = false;
      if (!root.hasAttribute('data-gl')) root.setAttribute('data-gl', '');
    } else {
      // Identical to the last frame. Stop, whatever asked for this one.
      moving = false;
    }
    if (moving) schedule();
  }

  readColours();
  resize();
  uploadRelief();

  /* The entrance. The wrapper's own CSS animation holds the seal at zero opacity for its
     first fifth of a second, so if the shader is ready inside that window the strike can
     play underneath and nobody sees the swap. If it is not ready, the seal simply arrives
     already struck, which is the right way for this to degrade. */
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  /* Whether the wax gets struck in front of the reader.
     The first version asked whether the wrapper's own fade was still inside its opening
     delay, which sounded careful and meant the press never played: the renderer is a
     dynamic import, so it is always later than that. The question that actually matters
     is whether the page is young enough that a press reads as part of its arrival rather
     than as the seal redrawing itself for no reason. */
  const young = performance.now() < 1800;
  const willPress = young && !reduced.matches && !document.documentElement.hasAttribute('data-vt-nav');
  if (willPress) {
    state.strike = 0;
    state.strikeFrom = performance.now();
    /* The fallback is already struck, so crossfading into an unstruck canvas would show
       the impression dissolving away and then being made again. data-press cuts instantly
       instead, under cover of the wrapper's own opening fade. */
    root.setAttribute('data-press', '');
  }

  const io = new IntersectionObserver(([e]) => {
    state.visible = e.isIntersecting;
    if (state.visible && state.dirty) schedule();
  }, { rootMargin: '100px' });
  io.observe(root);

  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    forget();
    if (resize()) {
      state.dirty = true;
      clearTimeout(resizeTimer);
      // The texture is the expensive part of a resize, so it waits for the drag to stop.
      resizeTimer = window.setTimeout(() => { uploadRelief(); state.dirty = true; schedule(); }, 150);
      schedule();
    }
  });
  ro.observe(root);

  // Capture, because the body is the scroll container and its scroll does not bubble.
  addEventListener('scroll', forget, { passive: true, capture: true });
  addEventListener('resize', forget, { passive: true });

  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  if (fine.matches && !reduced.matches) {
    addEventListener('pointermove', (e) => {
      state.pointer = { x: e.clientX, y: e.clientY };
      if (state.raf) return;
      state.raf = requestAnimationFrame((t) => {
        state.raf = 0;
        if (!state.sealRect) measure();
        const r = state.sealRect, h = state.heroRect, p = state.pointer;
        if (!r || !r.width || !p) return;
        if (h && (p.y < h.top || p.y > h.bottom)) { state.tgt = [...REST]; state.tiltTgt = [0, 0]; }
        else {
          // The light comes from wherever the pointer is, like a lamp held over the page,
          // and drops toward the surface as the pointer moves away from the centre.
          let vx = (p.x - (r.left + r.width / 2)) / (0.9 * r.width);
          let vy = (p.y - (r.top + r.height / 2)) / (0.9 * r.width);
          const m = Math.hypot(vx, vy);
          if (m > 1) { vx /= m; vy /= m; }
          state.tgt = norm([0.85 * vx, 0.85 * vy, 1.2 - 0.65 * Math.min(1, m)]);
          /* Eight degrees at the far edge. Enough that the lip comes round and the
             lettering on the near side catches, little enough that it never reads as a
             card flipping. The sign is inverted on x so the disc leans toward the pointer
             rather than away from it. */
          const MAX = (8 * Math.PI) / 180;
          state.tiltTgt = [-vy * MAX, vx * MAX];
        }
        frame(t);
      });
    }, { passive: true });

    const rest = () => { state.tgt = [...REST]; state.tiltTgt = [0, 0]; schedule(); };
    addEventListener('blur', rest);
    document.addEventListener('mouseleave', rest);
  }

  const reread = () => { readColours(); state.dirty = true; schedule(); };
  new MutationObserver(reread).observe(document.documentElement, { attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', reread);

  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.dirty) schedule(); });
  // Restored from the back/forward cache, where the context may have been dropped.
  addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) { state.dirty = true; schedule(); } });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    state.lost = true;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    root.removeAttribute('data-gl');   // the SVG comes back on its own
  });
  canvas.addEventListener('webglcontextrestored', () => {
    state.lost = false;
    readColours(); resize(); uploadRelief();
    state.dirty = true; schedule();
  });

  state.rot = rotation();
  root.appendChild(canvas);
  state.visible = true;
  schedule();
}
