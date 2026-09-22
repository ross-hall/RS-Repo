/*
 * Animation 1 — Atoms of alloy metals organising into a lattice.
 * A cloud of atoms starts scattered at random, eases into an ordered
 * triangular lattice with bonds drawn between neighbours, holds, then
 * scatters again. Loops forever.
 */
class LatticeAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rafId = null;
    this.startTime = null;

    this.params = {
      spacing: 46,
      atomRadius: 3.2,
      lineWidth: 1,
      bondOpacity: 0.5,
      jitter: 10,
      scatterSpread: 1.0,
      cycleDuration: 9000,
    };

    this.schema = [
      { key: 'spacing', label: 'Lattice Spacing', min: 24, max: 90, step: 1, needsReset: true },
      { key: 'atomRadius', label: 'Atom Radius', min: 1, max: 8, step: 0.1 },
      { key: 'lineWidth', label: 'Bond Line Width', min: 0.3, max: 3, step: 0.1 },
      { key: 'bondOpacity', label: 'Bond Opacity', min: 0, max: 1, step: 0.05 },
      { key: 'jitter', label: 'Atom Jitter', min: 0, max: 40, step: 1 },
      { key: 'scatterSpread', label: 'Scatter Spread', min: 0.3, max: 1.6, step: 0.05, needsReset: true },
      { key: 'cycleDuration', label: 'Cycle Duration (ms)', min: 3000, max: 20000, step: 500 },
    ];

    this.reset();
  }

  reset() {
    const { w, h } = cssSize(this.canvas);
    const rng = makeRng(1337);
    const p = this.params;

    const dx = p.spacing;
    const dy = p.spacing * Math.sqrt(3) / 2;
    const margin = p.spacing;
    const cols = Math.ceil((w + margin * 2) / dx) + 1;
    const rows = Math.ceil((h + margin * 2) / dy) + 1;

    const atoms = [];
    const index = new Map();
    for (let row = 0; row < rows; row++) {
      const rowOffset = (row % 2) * (dx / 2);
      for (let col = 0; col < cols; col++) {
        const lx = col * dx + rowOffset - margin;
        const ly = row * dy - margin;
        if (lx < -dx || lx > w + dx || ly < -dy || ly > h + dy) continue;
        const id = atoms.length;
        index.set(row + ',' + col, id);
        const spreadW = w * p.scatterSpread;
        const spreadH = h * p.scatterSpread;
        atoms.push({
          tx: lx, ty: ly,
          sx: (w - spreadW) / 2 + rng() * spreadW,
          sy: (h - spreadH) / 2 + rng() * spreadH,
          phase: rng() * Math.PI * 2,
          row, col,
        });
      }
    }

    // Bonds: connect each atom to its right and lower-diagonal neighbours
    // (enough to cover every triangular-lattice edge exactly once).
    const bonds = [];
    for (let id = 0; id < atoms.length; id++) {
      const { row, col } = atoms[id];
      const neighbourKeys = row % 2 === 0
        ? [[row, col + 1], [row + 1, col - 1], [row + 1, col]]
        : [[row, col + 1], [row + 1, col], [row + 1, col + 1]];
      for (const [nr, nc] of neighbourKeys) {
        const nid = index.get(nr + ',' + nc);
        if (nid !== undefined) bonds.push([id, nid]);
      }
    }

    this.atoms = atoms;
    this.bonds = bonds;
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
    const { ctx, canvas, atoms, bonds, params: p } = this;
    const { w, h } = cssSize(canvas);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = AppTheme.bgColor;
    ctx.fillRect(0, 0, w, h);

    const t = (elapsed % p.cycleDuration) / p.cycleDuration;
    // Breathing order parameter: 0 = fully scattered, 1 = fully formed lattice.
    const f = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
    const eased = easeInOutCubic(f);

    const positions = new Array(atoms.length);
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      const jx = Math.sin(elapsed * 0.0016 + a.phase) * p.jitter * (1 - eased);
      const jy = Math.cos(elapsed * 0.0021 + a.phase * 1.3) * p.jitter * (1 - eased);
      positions[i] = {
        x: lerp(a.sx, a.tx, eased) + jx,
        y: lerp(a.sy, a.ty, eased) + jy,
      };
    }

    ctx.strokeStyle = `rgba(255,255,255,${p.bondOpacity * eased})`;
    ctx.lineWidth = p.lineWidth;
    ctx.beginPath();
    for (const [i, j] of bonds) {
      const a = positions[i], b = positions[j];
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.45 * eased})`;
    ctx.lineWidth = 1;
    for (const pos of positions) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.atomRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
