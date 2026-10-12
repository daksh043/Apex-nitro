/* Nitro Apex — Graphics Quality Settings, Hardware Auto-Detection & Performance Optimizations */
import * as THREE from 'three';

const STORAGE_KEY = 'na_graphics';

export const PRESETS = {
  low: { res: 0.85, shadow: 'off', fx: 'off', fps: 60, name: 'Low (60 FPS Boost)' },
  medium: { res: 1.0, shadow: 'basic', fx: 'off', fps: 60, name: 'Medium (Balanced)' },
  high: { res: 1.25, shadow: 'soft', fx: 'on', fps: 0, name: 'High' },
  ultra: { res: 1.5, shadow: 'soft', fx: 'on', fps: 0, name: 'Ultra' },
};

export function isLowEndDevice() {
  try {
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const rend = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
        if (/intel|uhd|hd graphics|iris|mesa|llvmpipe|swiftshader|basic render|adreno|mali|powervr|radeon\(tm\) graphics|vega/i.test(rend)) {
          return true;
        }
      }
    }
  } catch (_) {}
  return false;
}

const defaultPreset = isLowEndDevice() ? 'low' : 'medium';

export const graphicsConfig = {
  preset: defaultPreset,
  res: PRESETS[defaultPreset].res,
  shadow: PRESETS[defaultPreset].shadow,
  fx: PRESETS[defaultPreset].fx,
  fps: PRESETS[defaultPreset].fps,
};

let _renderer = null;
let _fx = null;
let _lastFrameTime = 0;

// Live FPS Tracking
let _frameCount = 0;
let _lastFpsUpdate = performance.now();
export let currentFps = 60;

export function trackFps(now) {
  _frameCount++;
  if (now - _lastFpsUpdate >= 1000) {
    currentFps = Math.round((_frameCount * 1000) / (now - _lastFpsUpdate));
    _frameCount = 0;
    _lastFpsUpdate = now;
    const fpsBadge = document.getElementById('fpsBadge');
    if (fpsBadge) {
      fpsBadge.textContent = `${currentFps} FPS`;
      if (currentFps < 30) fpsBadge.style.color = '#ff4d4d';
      else if (currentFps < 50) fpsBadge.style.color = '#ffcc00';
      else fpsBadge.style.color = '#00ff88';
    }
  }
}

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

  // 1. Resolution / Pixel Ratio (Capped smartly to prevent fill-rate choke on laptops)
  const dpr = window.devicePixelRatio || 1;
  const targetPixelRatio = Math.min(dpr, graphicsConfig.res);
  _renderer.setPixelRatio(targetPixelRatio);
  _renderer.setSize(window.innerWidth, window.innerHeight);
  if (_fx && _fx.resize) {
    _fx.resize(window.innerWidth, window.innerHeight);
  }

  // 2. Dynamic Shadows (off / basic hardware shadow / soft PCF)
  if (graphicsConfig.shadow === 'off') {
    _renderer.shadowMap.enabled = false;
  } else {
    _renderer.shadowMap.enabled = true;
    _renderer.shadowMap.type = graphicsConfig.shadow === 'soft' 
      ? THREE.PCFSoftShadowMap 
      : THREE.BasicShadowMap;
  }
  _renderer.shadowMap.needsUpdate = true;

  // 3. Post-Processing / Bloom & Motion Warp (Direct render bypass when off)
  if (_fx) {
    const enableFx = graphicsConfig.fx === 'on';
    _fx.enabled = enableFx;
    if (_fx.bloom) _fx.bloom.enabled = enableFx;
    if (_fx.speedPass) _fx.speedPass.enabled = enableFx;
  }

  // 4. Update Quick Toggle Button State if present
  updateQuickToggleBtn();
}

function updateQuickToggleBtn() {
  const btn = document.getElementById('quickPerfBtn');
  if (btn) {
    const isPerf = graphicsConfig.preset === 'low';
    btn.textContent = isPerf ? '⚡ 60 FPS: ON' : '⚡ 60 FPS: OFF';
    btn.classList.toggle('active', isPerf);
    btn.style.borderColor = isPerf ? '#00e5ff' : '#444c56';
    btn.style.color = isPerf ? '#00e5ff' : '#8b949e';
  }
}

export function togglePerformanceMode() {
  if (graphicsConfig.preset === 'low') {
    // Switch to Medium/High
    graphicsConfig.preset = 'medium';
    graphicsConfig.res = PRESETS.medium.res;
    graphicsConfig.shadow = PRESETS.medium.shadow;
    graphicsConfig.fx = PRESETS.medium.fx;
    graphicsConfig.fps = PRESETS.medium.fps;
  } else {
    // Switch to Low (60 FPS Boost)
    graphicsConfig.preset = 'low';
    graphicsConfig.res = PRESETS.low.res;
    graphicsConfig.shadow = PRESETS.low.shadow;
    graphicsConfig.fx = PRESETS.low.fx;
    graphicsConfig.fps = PRESETS.low.fps;
  }
  saveGraphicsConfig();
  applyGraphics(_renderer, _fx);
  updateQuickToggleBtn();
}

export function shouldSkipFrame(now) {
  trackFps(now);
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
  const btnMenuGfx = $('btnMenuGraphics');
  const quickPerfBtn = $('quickPerfBtn');

  if (quickPerfBtn) {
    quickPerfBtn.onclick = () => {
      togglePerformanceMode();
      updateUI();
    };
    updateQuickToggleBtn();
  }

  if (btnMenuGfx && pauseGfx) {
    btnMenuGfx.onclick = () => {
      const soloPanel = $('soloPanel');
      if (soloPanel) soloPanel.style.display = 'none';
      pauseGfx.style.display = 'block';
      pauseGfx.style.position = 'fixed';
      pauseGfx.style.top = '50%';
      pauseGfx.style.left = '50%';
      pauseGfx.style.transform = 'translate(-50%, -50%)';
      pauseGfx.style.zIndex = '9999';
      updateUI();
    };
  }

  if (btnGfx && pauseMain && pauseGfx) {
    btnGfx.onclick = () => {
      pauseMain.style.display = 'none';
      pauseGfx.style.display = 'block';
      updateUI();
    };
  }

  if (btnBack && pauseGfx) {
    btnBack.onclick = () => {
      pauseGfx.style.display = 'none';
      const soloPanel = $('soloPanel');
      if (soloPanel && (!pauseMain || pauseMain.style.display === 'none')) {
        soloPanel.style.display = 'block';
      } else if (pauseMain) {
        pauseMain.style.display = 'block';
      }
    };
  }

  function updateUI() {
    updateQuickToggleBtn();
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
