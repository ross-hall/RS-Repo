/*
 * Animation 4 — Assembly line.
 *
 * A continuous stream, left to right, in three stages:
 *   1. A dense grid of raw material squares scrolls into a red laser line.
 *   2. Past the laser, a single continuous solid sheet (the melted,
 *      assembled metal) fills on into a grey die line.
 *   3. The grey line is a die: finished parts emerge from it and
 *      continue off the right edge.
 *
 * Unlike the other animations this one never "loops" in the traditional
 * sense — it just keeps generating. Positions are computed analytically
 * from elapsed time (using modulo phases for the scrolling grid, and a
 * spawn interval for the discrete parts), so only a small, bounded window
 * of in-flight geometry is ever iterated — no ever-growing arrays — which
 * keeps it cheap to run indefinitely.
 *
 * Each of the three stages can show a custom image in place of its
 * default look (see `imageSlots` / setImage / clearImage).
 */
class AssemblyAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rafId = null;
    this.startTime = null;

    this.params = {
      speed: 90,
      gridRows: 9,
      squareSize: 28,
      squareGap: 8,
      partSize: 64,
      partInterval: 1400,
      laserXFrac: 0.32,
      greyXFrac: 0.64,
      sheetHeight: 32,
      flowSpeed: 60,
      gatePadding: 40,
      pulseDuration: 260,
      monochrome: true,
    };

    this.schema = [
      { key: 'speed', label: 'Belt Speed (px/s)', min: 20, max: 300, step: 5 },
      { key: 'gridRows', label: 'Material Grid Rows', min: 2, max: 40, step: 1 },
      { key: 'squareSize', label: 'Raw Material Size', min: 8, max: 140, step: 1 },
      { key: 'squareGap', label: 'Raw Material Gap', min: 0, max: 40, step: 1 },
      { key: 'partSize', label: 'Part Size', min: 10, max: 200, step: 2 },
      { key: 'partInterval', label: 'Part Output Interval (ms)', min: 150, max: 4000, step: 50 },
      { key: 'laserXFrac', label: 'Laser Position', min: 0.1, max: 0.45, step: 0.01 },
      { key: 'greyXFrac', label: 'Die Line Position', min: 0.5, max: 0.85, step: 0.01 },
      { key: 'sheetHeight', label: 'Sheet Thickness', min: 4, max: 320, step: 2 },
      { key: 'flowSpeed', label: 'Sheet Flow Speed', min: 0, max: 200, step: 5 },
      { key: 'gatePadding', label: 'Laser/Die Overhang', min: 0, max: 100, step: 2 },
      { key: 'pulseDuration', label: 'Pulse Duration (ms)', min: 100, max: 800, step: 20 },
      { key: 'monochrome', label: 'Monochrome Images', type: 'checkbox' },
    ];

    // Lets the control panel offer an image upload + reset for each stage.
    this.imageSlots = [
      { key: 'square', label: 'Raw Material Image' },
      { key: 'sheet', label: 'Sheet Image' },
      { key: 'part', label: 'Part Image' },
    ];
    this.images = { square: null, sheet: null, part: null };

    this.reset();
  }

  setImage(key, img) { this.images[key] = img; }
  clearImage(key) { this.images[key] = null; }

  reset() {
    // No persistent geometry — everything is derived from elapsed time.
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

  resize() {}

  // Returns the x positions of every item currently between startX and
  // endX in a stream that spawns one item every `interval` ms (starting
  // at `phase`) and moves it at `speedPxMs` px/ms.
  _streamPositions(elapsed, interval, phase, speedPxMs, startX, endX) {
    const travelTime = (endX - startX) / speedPxMs;
    const iMax = Math.floor((elapsed - phase) / interval);
    const iMin = Math.ceil((elapsed - travelTime - phase) / interval);
    const positions = [];
    for (let i = iMin; i <= iMax; i++) {
      const spawnT = i * interval + phase;
      const x = startX + (elapsed - spawnT) * speedPxMs;
      if (x >= startX - 1 && x <= endX + 1) positions.push(x);
    }
    return positions;
  }

  _pulse(elapsed, interval, phase, duration) {
    const lastHit = Math.floor((elapsed - phase) / interval) * interval + phase;
    const age = elapsed - lastHit;
    if (age < 0 || age > duration) return 0;
    return 1 - age / duration;
  }

  _drawImageFit(img, cx, cy, boxW, boxH) {
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * scale, h = img.height * scale;
    const { ctx } = this;
    ctx.filter = this.params.monochrome ? 'grayscale(1) contrast(1.15) brightness(1.25)' : 'none';
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.filter = 'none';
  }

  _drawSquare(x, y, size) {
    const img = this.images.square;
    if (img) { this._drawImageFit(img, x, y, size, size); return; }
    this.ctx.fillStyle = 'rgba(255,255,255,0.95)';
    this.ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  _drawPart(x, y, size) {
    const img = this.images.part;
    if (img) { this._drawImageFit(img, x, y, size, size); return; }
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = x + Math.cos(a) * size / 2, py = y + Math.sin(a) * size / 2;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }

  render(elapsed) {
    const { ctx, canvas } = this;
    const { w, h } = cssSize(canvas);
    const p = this.params;
    ctx.fillStyle = AppTheme.bgColor;
    ctx.fillRect(0, 0, w, h);

    const beltY = h / 2;
    const laserX = w * p.laserXFrac;
    const greyX = w * p.greyXFrac;
    const speedPxMs = p.speed / 1000;

    const cell = p.squareSize + p.squareGap;
    const channelHeight = p.gridRows * cell - p.squareGap;
    const channelTop = beltY - channelHeight / 2;

    // --- Raw material: a dense grid of squares scrolling into the laser ---
    // `phase` counts up from 0 to `cell` and each column's rightEdge rises
    // with it (moving right, toward the laser); when phase wraps back to 0
    // a new column has already taken over one cell further left, so the
    // whole grid reads as continuously feeding rightward with no pop.
    const phase = (elapsed * speedPxMs) % cell;
    const maxCols = Math.ceil((laserX + p.squareSize) / cell) + 2;
    for (let row = 0; row < p.gridRows; row++) {
      const y = channelTop + row * cell + p.squareSize / 2;
      for (let k = 0; k <= maxCols; k++) {
        const rightEdge = laserX - (k + 1) * cell + phase;
        const cx = rightEdge - p.squareSize / 2;
        if (cx + p.squareSize / 2 < -1) continue;
        this._drawSquare(cx, y, p.squareSize);
      }
    }

    // --- Sheet (continuous, thin ribbon between laser and die line) ---
    const sheetTop = beltY - p.sheetHeight / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(laserX, sheetTop, greyX - laserX, p.sheetHeight);

    if (this.images.sheet) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(laserX, sheetTop, greyX - laserX, p.sheetHeight);
      ctx.clip();
      this._drawImageFit(this.images.sheet, (laserX + greyX) / 2, beltY, greyX - laserX, p.sheetHeight);
      ctx.restore();
    } else {
      // Diagonal flow hatching to read as continuously moving material.
      // Clipped to the sheet rect so full-length diagonals crop cleanly
      // instead of having their endpoints clamped (which would distort them).
      const hatchGap = 14;
      const offset = (elapsed * p.flowSpeed / 1000) % hatchGap;
      ctx.save();
      ctx.beginPath();
      ctx.rect(laserX, sheetTop, greyX - laserX, p.sheetHeight);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lx = laserX - p.sheetHeight - offset; lx < greyX + p.sheetHeight; lx += hatchGap) {
        ctx.moveTo(lx, sheetTop + p.sheetHeight);
        ctx.lineTo(lx + p.sheetHeight, sheetTop);
      }
      ctx.stroke();
      ctx.restore();
    }

    // --- Finished parts emerging from the die line ---
    // _drawPart centers its shape on x, so start the stream half a part
    // width past greyX — otherwise a freshly spawned part's near half
    // would poke back over the sheet instead of clearing the die line.
    const partPositions = this._streamPositions(
      elapsed, p.partInterval, 0, speedPxMs, greyX + p.partSize / 2, w + p.partSize
    );
    for (const x of partPositions) this._drawPart(x, beltY, p.partSize);

    // --- Laser line (red, pulses each time a material column reaches it) ---
    const gateHalf = channelHeight / 2 + p.gatePadding;
    const laserPulse = this._pulse(elapsed, cell / speedPxMs, 0, p.pulseDuration);
    const laserGlow = 0.55 + 0.45 * Math.sin(elapsed * 0.006) * 0.5 + laserPulse * 0.5;
    ctx.strokeStyle = `rgba(255,45,45,${clamp(laserGlow, 0.4, 1)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laserX, beltY - gateHalf);
    ctx.lineTo(laserX, beltY + gateHalf);
    ctx.stroke();
    if (laserPulse > 0) {
      ctx.strokeStyle = `rgba(255,120,120,${laserPulse * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(laserX, beltY, 6 + (1 - laserPulse) * 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- Die line (grey, pulses each time a part is emitted) ---
    const diePulse = this._pulse(elapsed, p.partInterval, 0, p.pulseDuration);
    ctx.strokeStyle = `rgba(170,170,170,${0.7 + diePulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(greyX, beltY - gateHalf);
    ctx.lineTo(greyX, beltY + gateHalf);
    ctx.stroke();
    if (diePulse > 0) {
      ctx.strokeStyle = `rgba(200,200,200,${diePulse * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(greyX, beltY, 6 + (1 - diePulse) * 22, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
