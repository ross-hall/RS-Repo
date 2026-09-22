/* Wires up tabs, instantiates each animation, and renders a live variable panel. */
(function () {
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const controlsEl = document.getElementById('controls');
  const panelTitle = document.getElementById('panel-title');
  const resetBtn = document.getElementById('reset-btn');
  const tabButtons = document.querySelectorAll('.tab');
  const bgColorInput = document.getElementById('bg-color-input');

  setupCanvas(canvas, stage);

  bgColorInput.addEventListener('input', () => {
    AppTheme.bgColor = bgColorInput.value;
  });

  const registry = {
    lattice: { label: 'Lattice Formation — Variables', ctor: LatticeAnimation },
    cooling: { label: 'Cooling & Grains — Variables', ctor: CoolingAnimation },
    cloud: { label: 'Solution Selection — Variables', ctor: CloudAnimation },
    assembly: { label: 'Assembly Line — Variables', ctor: AssemblyAnimation },
    material: { label: 'Material Card — Variables', ctor: MaterialAnimation },
  };

  const instances = {};
  function getInstance(key) {
    if (!instances[key]) instances[key] = new registry[key].ctor(canvas);
    return instances[key];
  }

  let current = null;
  let currentKey = null;

  function buildControls(key) {
    const inst = getInstance(key);
    controlsEl.innerHTML = '';
    panelTitle.textContent = registry[key].label;

    for (const field of inst.schema) {
      const wrap = document.createElement('div');
      wrap.className = 'control';

      if (field.type === 'checkbox') {
        wrap.innerHTML = `
          <div class="checkbox-row">
            <span>${field.label}</span>
            <input type="checkbox" ${inst.params[field.key] ? 'checked' : ''} />
          </div>`;
        const input = wrap.querySelector('input');
        input.addEventListener('change', () => {
          inst.params[field.key] = input.checked;
        });
      } else if (field.type === 'color') {
        wrap.innerHTML = `
          <div class="color-row">
            <span>${field.label}</span>
            <input type="color" value="${inst.params[field.key]}" />
          </div>`;
        const input = wrap.querySelector('input');
        input.addEventListener('input', () => {
          inst.params[field.key] = input.value;
        });
      } else {
        const val = inst.params[field.key];
        wrap.innerHTML = `
          <div class="control-row">
            <span>${field.label}</span>
            <span class="value">${formatVal(val)}</span>
          </div>
          <input type="range" min="${field.min}" max="${field.max}" step="${field.step}" value="${val}" />`;
        const input = wrap.querySelector('input');
        const valueEl = wrap.querySelector('.value');
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          inst.params[field.key] = v;
          valueEl.textContent = formatVal(v);
          if (field.needsReset) inst.reset();
        });
      }
      controlsEl.appendChild(wrap);
    }

    if (inst.imageSlots) buildImageControls(inst);
    if (inst.textFields) buildTextControls(inst);
  }

  function buildTextControls(inst) {
    const heading = document.createElement('div');
    heading.className = 'control-group-heading';
    heading.textContent = 'Card Text';
    controlsEl.appendChild(heading);

    for (const field of inst.textFields) {
      const wrap = document.createElement('div');
      wrap.className = 'control';
      const value = inst.getText(field.key);
      wrap.innerHTML = `
        <div class="control-row">
          <span>${field.label}</span>
        </div>
        ${field.multiline
          ? `<textarea rows="2">${escapeHtml(value)}</textarea>`
          : `<input type="text" value="${escapeHtml(value)}" />`}`;
      const input = wrap.querySelector('textarea, input');
      input.addEventListener('input', () => {
        inst.setText(field.key, input.value);
      });
      controlsEl.appendChild(wrap);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function buildImageControls(inst) {
    const heading = document.createElement('div');
    heading.className = 'control-group-heading';
    heading.textContent = 'Part Images';
    controlsEl.appendChild(heading);

    for (const slot of inst.imageSlots) {
      const wrap = document.createElement('div');
      wrap.className = 'control image-control';
      const hasImage = !!inst.images[slot.key];
      wrap.innerHTML = `
        <div class="control-row">
          <span>${slot.label}</span>
          <span class="value">${hasImage ? 'Custom' : 'Default'}</span>
        </div>
        <div class="image-control-actions">
          <label class="file-btn">
            Upload
            <input type="file" accept="image/*" hidden />
          </label>
          <button type="button" class="reset-image-btn">Reset</button>
        </div>`;

      const fileInput = wrap.querySelector('input[type=file]');
      const valueEl = wrap.querySelector('.value');
      const resetBtnEl = wrap.querySelector('.reset-image-btn');

      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
          inst.setImage(slot.key, img);
          valueEl.textContent = 'Custom';
        };
        img.src = URL.createObjectURL(file);
      });

      resetBtnEl.addEventListener('click', () => {
        inst.clearImage(slot.key);
        valueEl.textContent = 'Default';
        fileInput.value = '';
      });

      controlsEl.appendChild(wrap);
    }
  }

  function formatVal(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  function activate(key) {
    if (current) current.stop();
    currentKey = key;
    current = getInstance(key);
    current.resize();
    buildControls(key);
    current.start();

    tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.anim === key));
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.anim));
  });

  resetBtn.addEventListener('click', () => {
    if (current) current.reset();
  });

  window.addEventListener('resize', () => {
    if (current) current.resize();
  });

  activate('lattice');
})();
