/* Nitro Apex — Player Controls Customizer (Keyboard Rebinding & Touch Layout) */

const STORAGE_KEY = 'na_controls_v2';

export const DEFAULT_BINDINGS = {
  gas: ['w', 'arrowup'],
  brake: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  nitro: ['shift'],
  drift: [' '],
  cam: ['c'],
  reset: ['r'],
};

export const DEFAULT_TOUCH = {
  size: 'medium',       // 'small', 'medium', 'large'
  opacity: '0.75',      // '0.45', '0.75', '1.0'
  layout: 'standard',   // 'standard', 'inverted'
  alwaysShow: false,
  haptics: true,
};

export const controlsConfig = {
  bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
  touch: { ...DEFAULT_TOUCH },
};

export function loadControlsConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.bindings) {
        Object.assign(controlsConfig.bindings, parsed.bindings);
      }
      if (parsed.touch) {
        Object.assign(controlsConfig.touch, parsed.touch);
      }
    }
  } catch (_) {}
}

export function saveControlsConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(controlsConfig));
  } catch (_) {}
}

export function formatKeyName(key) {
  if (!key) return '--';
  const k = key.toLowerCase();
  if (k === ' ') return 'SPACE';
  if (k === 'arrowup') return '↑ UP';
  if (k === 'arrowdown') return '↓ DOWN';
  if (k === 'arrowleft') return '← LEFT';
  if (k === 'arrowright') return '→ RIGHT';
  if (k === 'shift') return 'SHIFT';
  if (k === 'control') return 'CTRL';
  if (k === 'alt') return 'ALT';
  if (k === 'enter') return 'ENTER';
  if (k === 'tab') return 'TAB';
  if (k === 'backspace') return 'BKSP';
  if (k === 'escape') return 'ESC';
  return k.toUpperCase();
}

export function isActionActive(action, keys, touchState) {
  // Check touch
  if (touchState && touchState[action]) return true;
  // Check keyboard bindings
  const boundKeys = controlsConfig.bindings[action];
  if (!boundKeys || !boundKeys.length) return false;
  for (const k of boundKeys) {
    if (keys[k.toLowerCase()]) return true;
  }
  return false;
}

export function applyTouchStyles() {
  const touchEl = document.getElementById('touch');
  if (!touchEl) return;
  const cfg = controlsConfig.touch;

  // Layout mode
  touchEl.classList.toggle('touch-inverted', cfg.layout === 'inverted');
  touchEl.classList.toggle('touch-size-small', cfg.size === 'small');
  touchEl.classList.toggle('touch-size-large', cfg.size === 'large');

  // Opacity
  touchEl.style.opacity = cfg.opacity || '0.75';

  // Force show on desktop if requested
  if (cfg.alwaysShow) {
    touchEl.classList.add('force-visible');
  } else {
    touchEl.classList.remove('force-visible');
  }
}

// Current rebinding state
let _rebindingAction = null;
let _rebindingSlot = 0;
let _rebindingBtn = null;

export function initControlsUI(onConfigChanged) {
  loadControlsConfig();
  applyTouchStyles();

  const modal = document.getElementById('controlsModal');
  if (!modal) return;

  const btnOpenMenu = document.getElementById('btnMenuControls');
  const btnOpenPause = document.getElementById('btnControls');
  const btnClose = document.getElementById('btnControlsClose');
  const btnReset = document.getElementById('btnControlsReset');
  const tabKb = document.getElementById('tabControlsKb');
  const tabTouch = document.getElementById('tabControlsTouch');
  const secKb = document.getElementById('secControlsKb');
  const secTouch = document.getElementById('secControlsTouch');

  const openModal = () => {
    renderKeyboardBindings();
    updateTouchUIControls();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  };

  const closeModal = () => {
    cancelRebinding();
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    saveControlsConfig();
    applyTouchStyles();
    if (onConfigChanged) onConfigChanged();
  };

  if (btnOpenMenu) btnOpenMenu.onclick = openModal;
  if (btnOpenPause) btnOpenPause.onclick = openModal;
  if (btnClose) btnClose.onclick = closeModal;

  // Tabs
  if (tabKb && tabTouch && secKb && secTouch) {
    tabKb.onclick = () => {
      tabKb.classList.add('active'); tabTouch.classList.remove('active');
      secKb.style.display = 'block'; secTouch.style.display = 'none';
      cancelRebinding();
    };
    tabTouch.onclick = () => {
      tabTouch.classList.add('active'); tabKb.classList.remove('active');
      secTouch.style.display = 'block'; secKb.style.display = 'none';
      cancelRebinding();
    };
  }

  // Reset all to default
  if (btnReset) {
    btnReset.onclick = () => {
      cancelRebinding();
      controlsConfig.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      controlsConfig.touch = { ...DEFAULT_TOUCH };
      saveControlsConfig();
      renderKeyboardBindings();
      updateTouchUIControls();
      applyTouchStyles();
      if (onConfigChanged) onConfigChanged();
    };
  }

  // Preset buttons (WASD vs Arrows)
  const btnPresetWasd = document.getElementById('btnPresetWasd');
  const btnPresetArrows = document.getElementById('btnPresetArrows');
  if (btnPresetWasd) {
    btnPresetWasd.onclick = () => {
      controlsConfig.bindings.gas = ['w'];
      controlsConfig.bindings.brake = ['s'];
      controlsConfig.bindings.left = ['a'];
      controlsConfig.bindings.right = ['d'];
      controlsConfig.bindings.nitro = ['shift'];
      controlsConfig.bindings.drift = [' '];
      saveControlsConfig();
      renderKeyboardBindings();
      if (onConfigChanged) onConfigChanged();
    };
  }
  if (btnPresetArrows) {
    btnPresetArrows.onclick = () => {
      controlsConfig.bindings.gas = ['arrowup'];
      controlsConfig.bindings.brake = ['arrowdown'];
      controlsConfig.bindings.left = ['arrowleft'];
      controlsConfig.bindings.right = ['arrowright'];
      controlsConfig.bindings.nitro = ['control'];
      controlsConfig.bindings.drift = [' '];
      saveControlsConfig();
      renderKeyboardBindings();
      if (onConfigChanged) onConfigChanged();
    };
  }

  // Touch size buttons
  document.querySelectorAll('[data-touch-size]').forEach(btn => {
    btn.onclick = () => {
      controlsConfig.touch.size = btn.dataset.touchSize;
      saveControlsConfig();
      updateTouchUIControls();
      applyTouchStyles();
    };
  });

  // Touch opacity buttons
  document.querySelectorAll('[data-touch-opacity]').forEach(btn => {
    btn.onclick = () => {
      controlsConfig.touch.opacity = btn.dataset.touchOpacity;
      saveControlsConfig();
      updateTouchUIControls();
      applyTouchStyles();
    };
  });

  // Touch layout (standard vs inverted)
  document.querySelectorAll('[data-touch-layout]').forEach(btn => {
    btn.onclick = () => {
      controlsConfig.touch.layout = btn.dataset.touchLayout;
      saveControlsConfig();
      updateTouchUIControls();
      applyTouchStyles();
    };
  });

  // Touch always show toggle
  const chkAlwaysShow = document.getElementById('chkTouchAlwaysShow');
  if (chkAlwaysShow) {
    chkAlwaysShow.onchange = () => {
      controlsConfig.touch.alwaysShow = chkAlwaysShow.checked;
      saveControlsConfig();
      applyTouchStyles();
    };
  }

  // Touch haptics toggle
  const chkHaptics = document.getElementById('chkTouchHaptics');
  if (chkHaptics) {
    chkHaptics.onchange = () => {
      controlsConfig.touch.haptics = chkHaptics.checked;
      saveControlsConfig();
    };
  }

  // Global key listener for rebinding
  window.addEventListener('keydown', (e) => {
    if (!_rebindingAction) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      cancelRebinding();
      return;
    }

    const newKey = e.key.toLowerCase();
    const action = _rebindingAction;
    const slot = _rebindingSlot;

    // Ensure array exists
    controlsConfig.bindings[action] = controlsConfig.bindings[action] || [];
    controlsConfig.bindings[action][slot] = newKey;

    saveControlsConfig();
    cancelRebinding();
    renderKeyboardBindings();
    if (onConfigChanged) onConfigChanged();
  }, true);
}

function cancelRebinding() {
  if (_rebindingBtn) {
    _rebindingBtn.classList.remove('rebinding');
    _rebindingBtn.textContent = _rebindingBtn.dataset.originalText || '--';
  }
  _rebindingAction = null;
  _rebindingSlot = 0;
  _rebindingBtn = null;
}

function renderKeyboardBindings() {
  const container = document.getElementById('controlsKbGrid');
  if (!container) return;
  container.innerHTML = '';

  const actions = [
    { id: 'gas', label: 'ACCELERATE / GAS' },
    { id: 'brake', label: 'BRAKE / REVERSE' },
    { id: 'left', label: 'STEER LEFT' },
    { id: 'right', label: 'STEER RIGHT' },
    { id: 'nitro', label: 'NITRO BOOST (N₂O)' },
    { id: 'drift', label: 'HANDBRAKE DRIFT' },
    { id: 'cam', label: 'CAMERA VIEW' },
    { id: 'reset', label: 'RESPAWN / RESET' },
  ];

  actions.forEach(({ id, label }) => {
    const row = document.createElement('div');
    row.className = 'ctrl-row';

    const lbl = document.createElement('span');
    lbl.className = 'ctrl-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const keysDiv = document.createElement('div');
    keysDiv.className = 'ctrl-keys';

    const currentKeys = controlsConfig.bindings[id] || [];
    // Display 2 slots (Primary and Secondary)
    for (let slot = 0; slot < 2; slot++) {
      const k = currentKeys[slot];
      const btn = document.createElement('button');
      btn.className = 'ctrl-key-btn' + (k ? '' : ' empty');
      btn.textContent = k ? formatKeyName(k) : (slot === 0 ? 'UNBOUND' : '+ ADD');
      btn.dataset.originalText = btn.textContent;
      btn.title = `Click to rebind ${label} (Key ${slot + 1})`;

      btn.onclick = () => {
        if (_rebindingBtn) cancelRebinding();
        _rebindingAction = id;
        _rebindingSlot = slot;
        _rebindingBtn = btn;
        btn.classList.add('rebinding');
        btn.textContent = 'PRESS KEY…';
      };

      keysDiv.appendChild(btn);
    }

    row.appendChild(keysDiv);
    container.appendChild(row);
  });
}

function updateTouchUIControls() {
  const cfg = controlsConfig.touch;

  // Active states for size buttons
  document.querySelectorAll('[data-touch-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.touchSize === cfg.size);
  });

  // Active states for opacity buttons
  document.querySelectorAll('[data-touch-opacity]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.touchOpacity === cfg.opacity);
  });

  // Active states for layout buttons
  document.querySelectorAll('[data-touch-layout]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.touchLayout === cfg.layout);
  });

  // Checkboxes
  const chkAlwaysShow = document.getElementById('chkTouchAlwaysShow');
  if (chkAlwaysShow) chkAlwaysShow.checked = !!cfg.alwaysShow;

  const chkHaptics = document.getElementById('chkTouchHaptics');
  if (chkHaptics) chkHaptics.checked = cfg.haptics !== false;
}
