/*
 * Animation 5 — Material properties card.
 *
 * A DOM/CSS overlay (not canvas-drawn) rather than a generative animation:
 * a card tracking five alloy properties against target bands as the
 * material moves through four stages —
 *   1. Requirement — the client's target range is fixed; no measured
 *      values shown yet.
 *   2. Design — simulation searches the design space: each bar jitters to
 *      a new value on an interval, lighting up whenever it lands inside
 *      its band. A "Simulating…" indicator with animated dots signals
 *      it's actively computing.
 *   3. Testing — properties are verified one at a time, top to bottom:
 *      the row in progress shows its bar filled with an animated diagonal
 *      hash (still computing) until a tick appears in the space beside
 *      it, then the next row starts. Once tested, a row stays ticked.
 *   4. Supply — the real, measured material: every bar is locked inside
 *      its band, all ticked.
 *
 * The four stages auto-advance and loop, matching the rest of the app's
 * self-playing animations; clicking a stage pill manually pins the card
 * to it (Reset resumes the auto-cycle from Requirement).
 */
class MaterialAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rafId = null;
    this.startTime = null;
    this.manualStage = null;
    this.currentStage = null;

    this.params = {
      requirementDuration: 3000,
      designDuration: 6000,
      testPerRowDuration: 900,
      testHoldDuration: 900,
      supplyDuration: 3000,
      jitterInterval: 450,
      accentColor: '#d9822b',
    };

    this.schema = [
      { key: 'requirementDuration', label: 'Requirement Hold (ms)', min: 1000, max: 8000, step: 100 },
      { key: 'designDuration', label: 'Design Hold (ms)', min: 2000, max: 15000, step: 200 },
      { key: 'testPerRowDuration', label: 'Testing Time Per Row (ms)', min: 300, max: 3000, step: 100 },
      { key: 'testHoldDuration', label: 'Testing Complete Hold (ms)', min: 200, max: 4000, step: 100 },
      { key: 'supplyDuration', label: 'Supply Hold (ms)', min: 1000, max: 8000, step: 100 },
      { key: 'jitterInterval', label: 'Simulation Jitter Interval (ms)', min: 150, max: 1500, step: 50 },
      { key: 'accentColor', label: 'In-Range Accent Color', type: 'color' },
    ];

    this.rows = [
      { key: 'hardness', label: 'Hardness', bandMin: 38, bandMax: 56, lockPct: 47 },
      { key: 'wear', label: 'Wear Resistance', bandMin: 60, bandMax: 82, lockPct: 71 },
      { key: 'strength', label: 'Strength', bandMin: 22, bandMax: 42, lockPct: 33 },
      { key: 'corrosion', label: 'Corrosion Resistance', bandMin: 66, bandMax: 86, lockPct: 78 },
      { key: 'printability', label: 'Printability', bandMin: 48, bandMax: 66, lockPct: 58 },
    ];

    this.stageMeta = {
      requirement: { label: 'Range Fixed', caption: "The client's target range is fixed from the start — it never moves." },
      design: { label: 'Simulating', caption: 'Simulation searches the design space; values drift and light up whenever they land inside range.' },
      testing: { label: 'Testing', caption: 'Each property is verified in turn — ticked off once confirmed, then on to the next.' },
      supply: { label: 'Locked', caption: 'Measured on real material — every property sits inside range, locked.' },
    };

    this.title = 'Material Properties';

    // Lets the control panel offer plain-text editing of everything the
    // card displays, without cluttering `params` (numeric/color schema).
    this.textFields = [
      { key: 'title', label: 'Card Title' },
      { key: 'row.hardness', label: 'Row 1 Label' },
      { key: 'row.wear', label: 'Row 2 Label' },
      { key: 'row.strength', label: 'Row 3 Label' },
      { key: 'row.corrosion', label: 'Row 4 Label' },
      { key: 'row.printability', label: 'Row 5 Label' },
      { key: 'stage.requirement.label', label: 'Requirement State Label' },
      { key: 'stage.requirement.caption', label: 'Requirement Caption', multiline: true },
      { key: 'stage.design.label', label: 'Design State Label' },
      { key: 'stage.design.caption', label: 'Design Caption', multiline: true },
      { key: 'stage.testing.label', label: 'Testing State Label' },
      { key: 'stage.testing.caption', label: 'Testing Caption', multiline: true },
      { key: 'stage.supply.label', label: 'Supply State Label' },
      { key: 'stage.supply.caption', label: 'Supply Caption', multiline: true },
    ];

    this._buildDom();
  }

  getText(key) {
    if (key === 'title') return this.title;
    const rowKey = key.match(/^row\.(.+)$/);
    if (rowKey) return this.rows.find((r) => r.key === rowKey[1]).label;
    const stageKey = key.match(/^stage\.(.+)\.(label|caption)$/);
    if (stageKey) return this.stageMeta[stageKey[1]][stageKey[2]];
    return '';
  }

  setText(key, value) {
    if (key === 'title') {
      this.title = value;
      this.overlay.querySelector('.material-card-head h2').textContent = value;
      return;
    }
    const rowKey = key.match(/^row\.(.+)$/);
    if (rowKey) {
      const row = this.rows.find((r) => r.key === rowKey[1]);
      row.label = value;
      this.overlay.querySelector(`.material-row[data-key="${row.key}"] .material-row-label`).textContent = value;
      return;
    }
    const stageKey = key.match(/^stage\.(.+)\.(label|caption)$/);
    if (stageKey) {
      const [, stage, field] = stageKey;
      this.stageMeta[stage][field] = value;
      // The label is re-painted unconditionally every frame, but the
      // caption only on a stage change — patch it directly so an edit to
      // the currently visible stage shows immediately either way.
      if (stage === this.currentStage && field === 'caption') this.captionEl.textContent = value;
    }
  }

  _buildDom() {
    this.overlay = document.getElementById('material-overlay');

    const rowsHtml = this.rows.map((r) => `
      <div class="material-row" data-key="${r.key}">
        <div class="material-row-label">${r.label}</div>
        <div class="material-row-main">
          <div class="material-bar-track">
            <div class="material-band"></div>
            <div class="material-bar-fill hidden"></div>
          </div>
          <span class="material-tick">&#10003;</span>
        </div>
      </div>`).join('');

    this.overlay.innerHTML = `
      <div class="material-stage">
        <div class="material-tabs">
          <button data-stage="requirement">01 Requirement</button>
          <button data-stage="design">02 Design</button>
          <button data-stage="testing">03 Testing</button>
          <button data-stage="supply">04 Supply</button>
        </div>
        <div class="material-card">
          <div class="material-card-head">
            <h2>${this.title}</h2>
            <span class="material-card-state"><span class="label"></span><span class="dots"></span></span>
          </div>
          ${rowsHtml}
        </div>
        <p class="material-caption"></p>
      </div>`;

    for (const r of this.rows) {
      const band = this.overlay.querySelector(`.material-row[data-key="${r.key}"] .material-band`);
      band.style.left = r.bandMin + '%';
      band.style.width = (r.bandMax - r.bandMin) + '%';
    }

    this.tabButtons = this.overlay.querySelectorAll('.material-tabs button');
    this.stateLabelEl = this.overlay.querySelector('.material-card-state .label');
    this.dotsEl = this.overlay.querySelector('.material-card-state .dots');
    this.captionEl = this.overlay.querySelector('.material-caption');

    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => { this.manualStage = btn.dataset.stage; });
    });
  }

  setImage() {}
  clearImage() {}

  reset() {
    this.manualStage = null;
    this.currentStage = null;
  }

  start() {
    this.overlay.classList.add('active');
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
    this.overlay.classList.remove('active');
  }

  resize() {}

  // Cheap seeded hash -> [0,1), used so each row's jittered value is a
  // pure function of (row, time slot) rather than persisted state.
  _hash01(a, b) {
    let h = (a * 374761393 + b * 668265263) ^ (a << 13);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  render(elapsed) {
    const { ctx, canvas } = this;
    const { w, h } = cssSize(canvas);
    ctx.fillStyle = AppTheme.bgColor;
    ctx.fillRect(0, 0, w, h);

    const p = this.params;
    // Room for every row's turn, plus a hold at the end so the last row
    // actually gets to show its "done" state before the stage loops —
    // testElapsed below wraps at testingDuration and never quite reaches
    // it, so the last row's own threshold must fall strictly inside it.
    const testingRowsDuration = p.testPerRowDuration * this.rows.length;
    const testingDuration = testingRowsDuration + p.testHoldDuration;
    const total = p.requirementDuration + p.designDuration + testingDuration + p.supplyDuration;
    let stage, stageElapsed;
    if (this.manualStage) {
      stage = this.manualStage;
      stageElapsed = elapsed;
    } else {
      const te = elapsed % total;
      if (te < p.requirementDuration) { stage = 'requirement'; stageElapsed = te; }
      else if (te < p.requirementDuration + p.designDuration) { stage = 'design'; stageElapsed = te - p.requirementDuration; }
      else if (te < p.requirementDuration + p.designDuration + testingDuration) { stage = 'testing'; stageElapsed = te - p.requirementDuration - p.designDuration; }
      else { stage = 'supply'; stageElapsed = te - p.requirementDuration - p.designDuration - testingDuration; }
    }

    if (stage !== this.currentStage) {
      this.currentStage = stage;
      this.tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.stage === stage));
      this.captionEl.textContent = this.stageMeta[stage].caption;
    }
    this.stateLabelEl.textContent = this.stageMeta[stage].label;
    this.dotsEl.textContent = (stage === 'design' || stage === 'testing') ? '.'.repeat(1 + Math.floor(elapsed / 350) % 3) : '';

    // Testing walks the list top to bottom: wrap on testingDuration so a
    // row's progress is a genuine repeating loop, whether auto-cycling or
    // pinned here indefinitely (stageElapsed is otherwise unbounded when pinned).
    const testElapsed = stageElapsed % testingDuration;

    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      const rowEl = this.overlay.querySelector(`.material-row[data-key="${r.key}"]`);
      const fillEl = rowEl.querySelector('.material-bar-fill');
      const tickEl = rowEl.querySelector('.material-tick');
      tickEl.style.color = p.accentColor;

      if (stage === 'requirement') {
        fillEl.classList.add('hidden');
        fillEl.classList.remove('testing-active');
        tickEl.classList.remove('visible');
        continue;
      }
      fillEl.classList.remove('hidden');

      if (stage === 'supply') {
        fillEl.classList.remove('testing-active');
        fillEl.style.width = r.lockPct + '%';
        fillEl.style.backgroundColor = p.accentColor;
        tickEl.classList.add('visible');
      } else if (stage === 'testing') {
        const rowDone = testElapsed >= (i + 1) * p.testPerRowDuration;
        const rowActive = !rowDone && testElapsed >= i * p.testPerRowDuration;
        if (rowDone) {
          fillEl.classList.remove('testing-active');
          fillEl.classList.remove('hidden');
          fillEl.style.width = r.lockPct + '%';
          fillEl.style.backgroundColor = p.accentColor;
          tickEl.classList.add('visible');
        } else if (rowActive) {
          fillEl.classList.add('testing-active');
          fillEl.classList.remove('hidden');
          fillEl.style.width = r.lockPct + '%';
          fillEl.style.backgroundColor = p.accentColor;
          tickEl.classList.remove('visible');
        } else {
          fillEl.classList.add('hidden');
          fillEl.classList.remove('testing-active');
          tickEl.classList.remove('visible');
        }
      } else {
        fillEl.classList.remove('testing-active');
        tickEl.classList.remove('visible');
        const slot = Math.floor((stageElapsed % p.designDuration) / p.jitterInterval);
        const pct = this._hash01(i, slot) * 100;
        const inRange = pct >= r.bandMin && pct <= r.bandMax;
        fillEl.style.width = pct + '%';
        fillEl.style.backgroundColor = inRange ? p.accentColor : '';
      }
    }
  }
}
