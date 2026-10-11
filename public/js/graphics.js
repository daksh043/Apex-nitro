/* Nitro Apex — Graphics Quality Settings & Live Adjustments */
import * as THREE from 'three';

const STORAGE_KEY = 'na_graphics';

export const PRESETS = {
  low: { res: 0.75, shadow: 'off', fx: 'off', fps: 60 },
  medium: { res: 1.0, shadow: 'med', fx: 'on', fps: 60 },
  high: { res: 1.5, shadow: 'soft', fx: 'on', fps: 0 },
  ultra: { res: 2.0, shadow: 'soft', fx: 'on', fps: 0 },
};

export const graphicsConfig = {
  preset: 'high',
  res: 1.5,
  shadow: 'soft',
  fx: 'on',
  fps: 0,
};

let _renderer = null;
let _fx = null;
let _lastFrameTime = 0;

export function loadGraphicsConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      Object.assign(graphicsConfig, JSON.parse(saved));
    }
  } catch (_) {}
}

export function saveGraphicsConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graphicsConfig));
  } catch (_) {}
}

export function applyGraphics(renderer, fx) {
  _renderer = renderer || _renderer;
  _fx = fx || _fx;
  if (!_renderer) return;

  // 1. Resolution / Pixel Ratio
  const dpr = window.devicePixelRatio || 1;
  const targetPixelRatio = Math.min(dpr, graphicsConfig.res);
  _renderer.setPixelRatio(targetPixelRatio);
  _renderer.setSize(window.innerWidth, window.innerHeight);
  if (_fx && _fx.resize) {
    _fx.resize(window.innerWidth, window.innerHeight);
  }

  // 2. Dynamic Shadows
  if (graphicsConfig.shadow === 'off') {
    _renderer.shadowMap.enabled = false;
  } else {
    _renderer.shadowMap.enabled = true;
    _renderer.shadowMap.type = graphicsConfig.shadow === 'soft' 
      ? THREE.PCFSoftShadowMap 
      : THREE.BasicShadowMap;
  }
  _renderer.shadowMap.needsUpdate = true;

  // 3. Post-Processing / Bloom & Motion Warp
  if (_fx) {
    const enableFx = graphicsConfig.fx === 'on';
    if (_fx.bloom) _fx.bloom.enabled = enableFx;
    if (_fx.speedPass) _fx.speedPass.enabled = enableFx;
  }
}

export function shouldSkipFrame(now) {
  if (graphicsConfig.fps <= 0) return false;
  const minDelta = 1000 / graphicsConfig.fps;
  if (now - _lastFrameTime < minDelta - 1.5) {
    return true;
  }
  _lastFrameTime = now;
  return false;
}

export function initGraphicsUI(renderer, fx) {
  loadGraphicsConfig();
  applyGraphics(renderer, fx);

  const $ = (id) => document.getElementById(id);
  const pauseMain = $('pauseMainPanel');
  const pauseGfx = $('pauseGraphicsPanel');
  const btnGfx = $('btnGraphics');
  const btnBack = $('btnGraphicsBack');

  if (btnGfx && pauseMain && pauseGfx) {
    btnGfx.onclick = () => {
      pauseMain.style.display = 'none';
      pauseGfx.style.display = 'block';
      updateUI();
    };
  }

  if (btnBack && pauseMain && pauseGfx) {
    btnBack.onclick = () => {
      pauseGfx.style.display = 'none';
      pauseMain.style.display = 'block';
    };
  }

  function updateUI() {
    // Presets
    document.querySelectorAll('#gfxGroupPreset .gfx-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === graphicsConfig.preset);
    });
    // Resolution
    document.querySelectorAll('#gfxGroupRes .gfx-btn').forEach((btn) => {
      btn.classList.toggle('active', parseFloat(btn.dataset.res) === graphicsConfig.res);
    });
    // Shadows
    document.querySelectorAll('#gfxGroupShadows .gfx-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.shadow === graphicsConfig.shadow);
    });
    // Post FX
    document.querySelectorAll('#gfxGroupFx .gfx-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.fx === graphicsConfig.fx);
    });
    // FPS
    document.querySelectorAll('#gfxGroupFps .gfx-btn').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.fps, 10) === graphicsConfig.fps);
    });
  }

  function checkPresetMatch() {
    let matched = null;
    for (const [key, p] of Object.entries(PRESETS)) {
      if (
        p.res === graphicsConfig.res &&
        p.shadow === graphicsConfig.shadow &&
        p.fx === graphicsConfig.fx &&
        p.fps === graphicsConfig.fps
      ) {
        matched = key;
        break;
      }
    }
    graphicsConfig.preset = matched || 'custom';
  }

  // Preset buttons
  document.querySelectorAll('#gfxGroupPreset .gfx-btn').forEach((btn) => {
    btn.onclick = () => {
      const p = PRESETS[btn.dataset.preset];
      if (p) {
        graphicsConfig.preset = btn.dataset.preset;
        graphicsConfig.res = p.res;
        graphicsConfig.shadow = p.shadow;
        graphicsConfig.fx = p.fx;
        graphicsConfig.fps = p.fps;
        saveGraphicsConfig();
        applyGraphics(renderer, fx);
        updateUI();
      }
    };
  });

  // Resolution buttons
  document.querySelectorAll('#gfxGroupRes .gfx-btn').forEach((btn) => {
    btn.onclick = () => {
      graphicsConfig.res = parseFloat(btn.dataset.res);
      checkPresetMatch();
      saveGraphicsConfig();
      applyGraphics(renderer, fx);
      updateUI();
    };
  });

  // Shadow buttons
  document.querySelectorAll('#gfxGroupShadows .gfx-btn').forEach((btn) => {
    btn.onclick = () => {
      graphicsConfig.shadow = btn.dataset.shadow;
      checkPresetMatch();
      saveGraphicsConfig();
      applyGraphics(renderer, fx);
      updateUI();
    };
  });

  // Post FX buttons
  document.querySelectorAll('#gfxGroupFx .gfx-btn').forEach((btn) => {
    btn.onclick = () => {
      graphicsConfig.fx = btn.dataset.fx;
      checkPresetMatch();
      saveGraphicsConfig();
      applyGraphics(renderer, fx);
      updateUI();
    };
  });

  // FPS buttons
  document.querySelectorAll('#gfxGroupFps .gfx-btn').forEach((btn) => {
    btn.onclick = () => {
      graphicsConfig.fps = parseInt(btn.dataset.fps, 10);
      checkPresetMatch();
      saveGraphicsConfig();
      applyGraphics(renderer, fx);
      updateUI();
    };
  });

  updateUI();
}
