/*
 * Animation 2 — Cooling of metal into packed grains.
 *
 * The canvas holds a dense, regular matrix of dots. Several nucleation
 * points appear at once; each behaves like a growing circular mask that
 * reveals the matrix underneath it. A dot belongs to whichever seed is
 * nearest to it (a Voronoi cell), so as two neighbouring masks grow toward
 * each other their circular fronts naturally clip into straight-edged
 * polygons instead of overlapping — exactly how real grain boundaries form.
 * A thin band of dots straddling any boundary is suppressed so the seam
 * between grains stays empty.
 *
 * Phase 1: the matrix jitters gently (liquid).
 * Phase 2: it decelerates and comes to a stop.
 * Phase 3: masks expand outward from the nucleation points until they meet.
 * Phase 4: hold the fully packed grain structure.
 * Phase 5: crossfade back to the liquid matrix and loop.
 */
class CoolingAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rafId = null;
    this.startTime = null;

    this.params = {
      matrixSpacing: 9,
      grainSeedCount: 12,
      meltDuration: 2200,
      settleDuration: 900,
      growDuration: 3600,
      holdDuration: 2600,
      resetDuration: 1200,
      pointSize: 1,
      grainExpandScale: 1.8,
      liquidOpacity: 0.22,
      grainOpacity: 1,
      boundaryGap: 12,
      revealSoftness: 8,
      jitterAmount: 2.5,
    };

    this.schema = [
      { key: 'matrixSpacing', label: 'Matrix Spacing (px)', min: 5, max: 24, step: 1, needsReset: true },
      { key: 'grainSeedCount', label: 'Grain Seed Count', min: 2, max: 60, step: 1, needsReset: true },
      { key: 'meltDuration', label: 'Melt Duration (ms)', min: 500, max: 6000, step: 100 },
      { key: 'settleDuration', label: 'Settle Duration (ms)', min: 200, max: 3000, step: 100 },
      { key: 'growDuration', label: 'Grain Growth Duration (ms)', min: 500, max: 8000, step: 100 },
      { key: 'holdDuration', label: 'Hold Duration (ms)', min: 500, max: 8000, step: 100 },
      { key: 'resetDuration', label: 'Reset/Crossfade (ms)', min: 300, max: 3000, step: 100 },
      { key: 'pointSize', label: 'Dot Size', min: 0.4, max: 3, step: 0.1 },
      { key: 'grainExpandScale', label: 'Grain Expand Scale', min: 1, max: 3, step: 0.1 },
      { key: 'liquidOpacity', label: 'Liquid Opacity', min: 0, max: 0.6, step: 0.02 },
      { key: 'grainOpacity', label: 'Grain Fill Opacity', min: 0.3, max: 1, step: 0.02 },
      { key: 'boundaryGap', label: 'Boundary Gap (px)', min: 2, max: 40, step: 1 },
      { key: 'revealSoftness', label: 'Reveal Softness (px)', min: 2, max: 40, step: 1 },
      { key: 'jitterAmount', label: 'Liquid Jitter (px)', min: 0, max: 10, step: 0.5 },
    ];

    this.reset();
  }

  reset() {
    const { w, h } = cssSize(this.canvas);
    const rng = makeRng(2024);
    const p = this.params;

    const spacing = p.matrixSpacing;
    const cols = Math.max(1, Math.round(w / spacing));
    const rows = Math.max(1, Math.round(h / spacing));
    const offsetX = (w - cols * spacing) / 2;
    const offsetY = (h - rows * spacing) / 2;

    const atoms = [];
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        atoms.push({
          x: offsetX + col * spacing,
          y: offsetY + row * spacing,
          phase: rng() * Math.PI * 2,
          speed: 0.6 + rng() * 0.8,
          g1: 0, g2: 0,
        });
      }
    }

    const seeds = Array.from({ length: p.grainSeedCount }, () => ({
      x: rng() * w, y: rng() * h,
    }));

    // Distance from each grid point to its nearest (g1) and second-nearest
    // (g2) seed. Fixed once positions are set, so computed only here.
    let maxG1 = 0;
    for (const a of atoms) {
      let d1 = Infinity, d2 = Infinity;
      for (const s of seeds) {
        const d = Math.hypot(a.x - s.x, a.y - s.y);
        if (d < d1) { d2 = d1; d1 = d; }
        else if (d < d2) { d2 = d; }
      }
      a.g1 = d1; a.g2 = d2;
      if (d1 > maxG1) maxG1 = d1;
    }

    this.atoms = atoms;
    this.seeds = seeds;
    this.maxG1 = maxG1 || 1;
  }

  start() {
    this.startTime = performance.now();
    const loop = (now) => {
      this.render(now - this.startTime);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  resize() { this.reset(); }

  render(elapsed) {
    const { ctx, canvas, atoms } = this;
    const { w, h } = cssSize(canvas);
    const p = this.params;
    ctx.fillStyle = AppTheme.bgColor;
    ctx.fillRect(0, 0, w, h);

    const tMeltEnd = p.meltDuration;
    const tSettleEnd = tMeltEnd + p.settleDuration;
    const tGrowEnd = tSettleEnd + p.growDuration;
    const tHoldEnd = tGrowEnd + p.holdDuration;
    const total = tHoldEnd + p.resetDuration;
    const te = elapsed % total;

    // Front must clear the farthest grid point's g1 by a full revealSoftness
    // margin, otherwise that point (and its neighbours) never fully crystallize.
    const frontTarget = this.maxG1 + p.revealSoftness;

    let jitterAmp, front, grainFade;
    if (te < tMeltEnd) {
      jitterAmp = 1; front = 0; grainFade = 1;
    } else if (te < tSettleEnd) {
      jitterAmp = 1 - easeInOutCubic((te - tMeltEnd) / p.settleDuration);
      front = 0; grainFade = 1;
    } else if (te < tGrowEnd) {
      jitterAmp = 0;
      front = easeOutCubic((te - tSettleEnd) / p.growDuration) * frontTarget;
      grainFade = 1;
    } else if (te < tHoldEnd) {
      jitterAmp = 0; front = frontTarget; grainFade = 1;
    } else {
      const localT = (te - tHoldEnd) / p.resetDuration;
      jitterAmp = easeInCubic(localT);
      front = frontTarget;
      grainFade = 1 - easeInCubic(localT);
    }

    // Bucket points by quantized opacity so we issue a handful of fill()
    // calls instead of one per point (there can be several thousand).
    const BUCKETS = 24;
    const buckets = Array.from({ length: BUCKETS + 1 }, () => []);
    const hasJitter = jitterAmp > 0.001;

    for (const a of atoms) {
      const x = hasJitter ? a.x + Math.sin(elapsed * 0.003 * a.speed + a.phase) * p.jitterAmount * jitterAmp : a.x;
      const y = hasJitter ? a.y + Math.cos(elapsed * 0.0035 * a.speed + a.phase * 1.4) * p.jitterAmount * jitterAmp : a.y;

      const revealT = clamp((front - a.g1) / p.revealSoftness, 0, 1);
      const boundaryT = clamp((a.g2 - a.g1) / p.boundaryGap, 0, 1);

      // boundaryT -> 0 near a seam between two grains: the dot fades to
      // nothing instead of filling in, leaving that seam empty.
      const crystalOpacity = lerp(0, p.grainOpacity, boundaryT);
      const crystalSize = lerp(p.pointSize, p.pointSize * p.grainExpandScale, boundaryT);

      const opacity = lerp(p.liquidOpacity, crystalOpacity, revealT * grainFade);
      if (opacity <= 0.01) continue;
      const size = lerp(p.pointSize, crystalSize, revealT * grainFade);

      buckets[Math.round(opacity * BUCKETS)].push(x, y, size);
    }

    for (let i = 1; i <= BUCKETS; i++) {
      const pts = buckets[i];
      if (!pts.length) continue;
      ctx.fillStyle = `rgba(255,255,255,${i / BUCKETS})`;
      ctx.beginPath();
      for (let j = 0; j < pts.length; j += 3) {
        const x = pts[j], y = pts[j + 1], size = pts[j + 2];
        ctx.moveTo(x + size, y);
        ctx.arc(x, y, size, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
}
