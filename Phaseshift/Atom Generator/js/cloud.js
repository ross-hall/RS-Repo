/*
 * Animation 3 — A cloud of alloy solutions; most drift and dim away while a
 * handful are selected, brighten, and converge into a tight group at the centre.
 */
class CloudAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rafId = null;
    this.startTime = null;
    this.cycleIndex = null;

    this.params = {
      particleCount: 220,
      selectedCount: 7,
      cloudRadiusFraction: 0.42,
      clusterPadding: 1.3,
      particleSize: 2,
      dimOpacity: 0.12,
      highlightOpacity: 1,
      driftSpeed: 1,
      cycleDuration: 10000,
      radialColor: '#d9822b',
      radialOpacity: 0.7,
      radialRingSpread: 16,
      radialPulsePeriod: 1200,
    };

    this.schema = [
      { key: 'particleCount', label: 'Particle Count', min: 40, max: 500, step: 10, needsReset: true },
      { key: 'selectedCount', label: 'Selected Count', min: 2, max: 24, step: 1 },
      { key: 'cloudRadiusFraction', label: 'Cloud Radius', min: 0.15, max: 0.5, step: 0.01 },
      { key: 'clusterPadding', label: 'Cluster Padding', min: 1, max: 2.5, step: 0.05 },
      { key: 'particleSize', label: 'Particle Size', min: 0.8, max: 5, step: 0.1 },
      { key: 'dimOpacity', label: 'Dim Opacity', min: 0, max: 0.5, step: 0.02 },
      { key: 'highlightOpacity', label: 'Highlight Opacity', min: 0.3, max: 1, step: 0.02 },
      { key: 'driftSpeed', label: 'Drift Speed', min: 0.1, max: 3, step: 0.05 },
      { key: 'cycleDuration', label: 'Cycle Duration (ms)', min: 4000, max: 24000, step: 500 },
      { key: 'radialColor', label: 'Radial Pulse Color', type: 'color' },
      { key: 'radialOpacity', label: 'Radial Pulse Opacity', min: 0, max: 1, step: 0.02 },
      { key: 'radialRingSpread', label: 'Radial Pulse Spread (px)', min: 2, max: 60, step: 1 },
      { key: 'radialPulsePeriod', label: 'Radial Pulse Period (ms)', min: 300, max: 4000, step: 50 },
    ];

    this.reset();
  }

  reset() {
    const rng = makeRng(77);
    const p = this.params;
    this.particles = Array.from({ length: p.particleCount }, () => ({
      angle: rng() * Math.PI * 2,
      radiusFrac: Math.sqrt(rng()),
      angleSpeed: (rng() - 0.5) * 0.6,
      radiusPhase: rng() * Math.PI * 2,
      radiusFreq: 0.3 + rng() * 0.5,
      groupSlotIndex: 0,
    }));
    this.cycleIndex = null;
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

  resize() { /* geometry is fraction-based, no rebuild needed */ }

  _prepareCycle(index) {
    const rng = makeRng(1000 + index);
    const p = this.params;
    const ids = this.particles.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const selectedIds = ids.slice(0, p.selectedCount);
    // Assign each selected particle a slot index into the packed cluster
    // layout (see _clusterOffsets) — a fixed mapping for the cycle, with
    // the actual pixel offsets recomputed live from the current particle
    // size so a mid-cycle slider change can't cause overlap.
    selectedIds.forEach((id, k) => {
      this.particles[id].groupSlotIndex = k;
    });
    this.selected = new Set(selectedIds);
    this.cycleIndex = index;
  }

  // `count` randomly scattered positions, each at least minDist from every
  // other — an organic clump rather than a tidy grid, but still guaranteed
  // not to overlap. Deterministic for a given seed so it holds steady
  // across frames of the same cycle. Places points one at a time, searching
  // outward from the center for the first open spot.
  _randomPackedOffsets(count, minDist, seed) {
    const rng = makeRng(seed);
    const pts = [];
    const step = minDist * 0.15;
    for (let i = 0; i < count; i++) {
      let placed = null;
      for (let radius = 0; radius < minDist * (count + 2) && !placed; radius += step) {
        for (let attempt = 0; attempt < 16; attempt++) {
          const angle = rng() * Math.PI * 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= minDist)) {
            placed = { x, y };
            break;
          }
        }
      }
      pts.push(placed || { x: 0, y: 0 });
    }
    return pts;
  }

  _cloudPos(particle, t, cx, cy, cloudRadius) {
    const p = this.params;
    const angle = particle.angle + particle.angleSpeed * t * p.driftSpeed;
    const r = cloudRadius * particle.radiusFrac *
      (1 + 0.06 * Math.sin(t * particle.radiusFreq + particle.radiusPhase));
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  }

  render(elapsedMs) {
    const { ctx, canvas } = this;
    const { w, h } = cssSize(canvas);
    const p = this.params;
    ctx.fillStyle = AppTheme.bgColor;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const cloudRadius = Math.min(w, h) * p.cloudRadiusFraction;
    const cycleIndex = Math.floor(elapsedMs / p.cycleDuration);
    if (cycleIndex !== this.cycleIndex) this._prepareCycle(cycleIndex);

    const t = elapsedMs / 1000;
    const tn = (elapsedMs % p.cycleDuration) / p.cycleDuration;
    const phases = cyclePhase(tn, [
      { len: 0.28, from: 0, to: 0, ease: easeInOutCubic },  // drift, baseline
      { len: 0.27, from: 0, to: 1, ease: easeInOutCubic },  // converge / select
      { len: 0.25, from: 1, to: 1, ease: easeInOutCubic },  // hold grouped
      { len: 0.20, from: 1, to: 0, ease: easeInOutCubic },  // release
    ]);
    const groupF = phases.value; // 0 = pure cloud, 1 = fully grouped

    const baseline = (p.dimOpacity + p.highlightOpacity) / 2;
    const positions = new Array(this.particles.length);
    const selectedDiameter = p.particleSize * (1 + 0.6 * groupF) * 2;
    const clusterSpacing = selectedDiameter * p.clusterPadding;
    const clusterOffsets = this._randomPackedOffsets(p.selectedCount, clusterSpacing, 5000 + this.cycleIndex);

    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      const cloud = this._cloudPos(particle, t, cx, cy, cloudRadius);
      const isSelected = this.selected.has(i);

      let x = cloud.x, y = cloud.y, opacity;
      if (isSelected) {
        const offset = clusterOffsets[particle.groupSlotIndex];
        const gx = cx + offset.x, gy = cy + offset.y;
        x = lerp(cloud.x, gx, groupF);
        y = lerp(cloud.y, gy, groupF);
        opacity = lerp(baseline, p.highlightOpacity, groupF);
      } else {
        opacity = lerp(baseline, p.dimOpacity, groupF);
      }
      positions[i] = { x, y, opacity, isSelected };
    }

    if (groupF > 0.02) {
      // A ring pulses outward from each selected dot and fades — a radial
      // "ping" rather than a line connecting anything.
      const pulseU = (elapsedMs % p.radialPulsePeriod) / p.radialPulsePeriod;
      const pulseSpread = easeOutCubic(pulseU) * p.radialRingSpread;
      const pulseOpacity = (1 - pulseU) * p.radialOpacity * groupF;
      if (pulseOpacity > 0.01) {
        ctx.strokeStyle = hexToRgba(p.radialColor, pulseOpacity);
        ctx.lineWidth = 1.5;
        for (const pt of positions) {
          if (!pt.isSelected) continue;
          const dotRadius = p.particleSize * (1 + 0.6 * groupF);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, dotRadius + pulseSpread, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    for (const pt of positions) {
      ctx.fillStyle = `rgba(255,255,255,${pt.opacity})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.particleSize * (pt.isSelected ? 1 + 0.6 * groupF : 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
