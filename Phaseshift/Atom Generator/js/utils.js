/* Shared helpers used by all animations. */

// Global canvas background color, shared across every animation and
// controlled by the "BG" picker in the topbar (see app.js). Animations
// read AppTheme.bgColor each frame instead of hardcoding black.
const AppTheme = { bgColor: '#000000' };

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// '#rrggbb' + alpha (0-1) -> 'rgba(r,g,b,a)', for combining a user-picked
// hex color with a computed opacity in a canvas fillStyle/strokeStyle.
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }

/* Seeded PRNG (mulberry32) so a given seed always reproduces the same layout. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Walks a value through a sequence of eased segments over normalized time t (0..1).
 * segments: [{ len, from, to, ease }]  -- len fractions must sum to 1.
 * Returns { value, segmentIndex, localT } so callers can branch on which phase is active.
 */
function cyclePhase(t, segments) {
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const end = acc + seg.len;
    if (t <= end || i === segments.length - 1) {
      const localT = seg.len > 0 ? clamp((t - acc) / seg.len, 0, 1) : 1;
      const ease = seg.ease || ((x) => x);
      const value = lerp(seg.from, seg.to, ease(localT));
      return { value, segmentIndex: i, localT };
    }
    acc = end;
  }
  return { value: segments[segments.length - 1].to, segmentIndex: segments.length - 1, localT: 1 };
}

/* Sets up a HiDPI-correct canvas that tracks its container's size. */
function setupCanvas(canvas, container) {
  const ctx = canvas.getContext('2d');
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  return { ctx, resize, disconnect: () => ro.disconnect() };
}

function cssSize(canvas) {
  return {
    w: parseFloat(canvas.style.width) || canvas.width,
    h: parseFloat(canvas.style.height) || canvas.height,
  };
}
