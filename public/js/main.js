/* Nitro Apex — game orchestrator */
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { Track, buildEnvironment } from './track.js';
import { CARS, CarController, AIDriver, preloadModels, preloadCar, isCarLoaded } from './car.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { GameAudio } from './audio.js';
import { Net, RemoteCar } from './net.js';
import { initCompliance } from './compliance.js';
import { initGraphicsUI, applyGraphics, shouldSkipFrame } from './graphics.js';

const LAPS = 3;

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const els = {
  menu: $('menu'), soloPanel: $('soloPanel'), mpPanel: $('mpPanel'),
  name: $('playerName'), opponents: $('opponents'), difficulty: $('difficulty'),
  carTabs: $('carTabs'), statVmax: $('statVmax'), statAccel: $('statAccel'), statGrip: $('statGrip'),
  carSub: $('carSub'),
  colorRow: $('colorRow'), btnSolo: $('btnSolo'), btnMulti: $('btnMulti'),
  joinCode: $('joinCode'), btnCreate: $('btnCreate'), btnJoin: $('btnJoin'),
  lbPanel: $('lbPanel'), btnStartRace: $('btnStartRace'), btnLobbyLeave: $('btnLobbyLeave'),
  pause: $('pause'), pauseMainPanel: $('pauseMainPanel'), pauseGraphicsPanel: $('pauseGraphicsPanel'),
  btnResume: $('btnResume'), btnGraphics: $('btnGraphics'), btnGraphicsBack: $('btnGraphicsBack'), btnQuit: $('btnQuit'),
  loading: $('loading'), loadMsg: $('loadMsg'), musicToggle: $('musicToggle'),
  touch: $('touch'), backToLobbyBtn: $('btnBackToLobby'),
};

/* ---------- singletons ---------- */
let renderer, scene, camera, track, fx, hud, audio;
let net = null;
let textures;
const state = {
  mode: 'menu',            // menu | race
  mptype: 'solo',          // solo | mp
  racing: false,
  countdownActive: false,
  startedAt: 0,
  cars: [],                // CarControllers (incl. player at index 0? no — playerCar ref below)
  rigs: new Map(),         // controller -> rig
  ais: new Map(),
  remotes: new Map(),      // id -> RemoteCar
  player: null,
  playerRig: null,
  finishOrder: [],
  raceOverSent: false,
  mpResults: [],
  camMode: 0,              // 0 chase 1 hood
  paused: false,
  wrongTimer: 0,
  netSendAcc: 0,
  resultsShown: false,
  playersInfo: [],         // mp lobby list
  carSel: 0,               // selected car index (player)
};
const selSpec = () => CARS[state.carSel] || CARS[0];

/* ---------- input ---------- */
const keys = {};
const touchState = { left: false, right: false, gas: false, brake: false, nitro: false, drift: false };
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || ('msMaxTouchPoints' in navigator);
addEventListener('keydown', (e) => {
  if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    if (e.key === 'Escape') {
      e.target.blur();
      if (window.__closeAllComplianceModals) window.__closeAllComplianceModals();
    }
    return;
  }
  if (window.__isComplianceModalOpen && window.__isComplianceModalOpen()) {
    if (e.key === 'Escape') {
      if (window.__closeAllComplianceModals) window.__closeAllComplianceModals();
    }
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'c' || e.key === 'C') state.camMode = (state.camMode + 1) % 2;
  if (e.key === 'r' || e.key === 'R') { if (state.player && state.mode === 'race') state.player.resetToTrack(track); }
  if (e.key === 'm' || e.key === 'M') { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Audio muted' : 'Audio on'); }
  if (e.key === 'Escape') togglePause();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function playerInput() {
  const steer = (keys['a'] || keys['arrowleft'] || touchState.left ? 1 : 0) +
    (keys['d'] || keys['arrowright'] || touchState.right ? -1 : 0);
  const throttle = (keys['w'] || keys['arrowup'] || touchState.gas) ? 1 : 0;
  const brake = !!(keys['s'] || keys['arrowdown'] || touchState.brake);
  const nitro = !!(keys['shift'] || touchState.nitro);
  const hand = !!(keys[' '] || touchState.drift);
  return { steer, throttle, brake, nitro, hand };
}

/* ---------- boot ---------- */
async function boot() {
  els.loadMsg.textContent = 'Building city…';
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  document.getElementById('gl').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 2600);
  camera.position.set(0, 30, 60);

  textures = makeTextures();
  track = new Track(scene, textures, renderer);
  scene.environment = buildEnvironment(renderer, track);
  fx = new FX(scene, camera, renderer, textures);
  hud = new HUD();
  audio = new GameAudio();

  // Initialize graphics quality and performance settings tailored to user GPU/hardware
  initGraphicsUI(renderer, fx);

  // player headlights
  headL = new THREE.SpotLight(0xcfe4ff, 170, 95, 0.52, 0.55, 1.4);
  headR = new THREE.SpotLight(0xcfe4ff, 170, 95, 0.52, 0.55, 1.4);
  for (const l of [headL, headR]) { scene.add(l); scene.add(l.target); }
  // showroom fill light (menu only)
  fillLight = new THREE.DirectionalLight(0xcdd6e4, 0.7);
  fillLight.visible = false;
  scene.add(fillLight); scene.add(fillLight.target);

  try {
    buildMenuScene();
    wireUI();
    hud.buildMinimap(track);
    buildPreview();
  } catch (e) {
    window.__errs.push('boot: ' + (e.stack || e));
    throw e;
  }
  // when the GLB model finishes loading, swap the showroom preview to the real body
  const activeCarSpec = selSpec();
  preloadModels(activeCarSpec ? activeCarSpec.id : 'm3').then(() => {
    if (state.mode === 'menu' && state.previewRig) buildPreview();
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    applyGraphics(renderer, fx);
  });

  els.loading.classList.add('hidden');
  window.__dbg = { state, track, camera };
  requestAnimationFrame(loop);
}

let headL, headR;
let fillLight = null;
const menuCam = { angle: 0.49 }; // nose toward the camera on load — front-3/4 like a press photo

/* Showroom: rotating preview of the selected car, framed like a press photo */
function buildPreview() {
  const prevRotY = (state.previewRig && state.previewRig.group) ? state.previewRig.group.rotation.y : null;
  if (state.previewRig) { scene.remove(state.previewRig.group); state.previewRig = null; }
  if (state.mode === 'race' || !state._color) return;
  const spec = selSpec();
  let rig = null;
  try {
    rig = spec.build(state._color(), { shadowTex: textures.shadow, softGlowTex: textures.softGlow, kidneyTex: textures.kidney });
  } catch (e) {
    window.__errs.push('preview build: ' + (e.stack || e));
    return;
  }
  const s = track.sampleAtArc(300); // midway between street lamps — no flare in frame
  rig.group.position.set(s.p.x, s.p.y + 0.08, s.p.z);
  if (prevRotY !== null) {
    rig.group.rotation.y = prevRotY;
  }
  scene.add(rig.group);
  state.previewRig = rig;
  menuCam.init = false; // re-snap the showroom camera on return to menu
}

function buildMenuScene() { /* backdrop is the live track scene */ }

function updateMenuCam(dt) {
  // slow ping-pong sweep that stays on the front hemisphere (showroom turntable)
  menuCam.angle += dt * 0.16;
  if (state.previewRig) state.previewRig.group.rotation.y = 0.30 + 0.52 * Math.sin(menuCam.angle);
  const s = track.sampleAtArc(300);
  const tp = new THREE.Vector3(s.p.x + 4.4, s.p.y + 2.1, s.p.z + 9.6);
  if (!menuCam.init) { camera.position.copy(tp); camera.fov = 38; menuCam.init = true; }
  else camera.position.lerp(tp, Math.min(1, dt * 2.5));
  camera.lookAt(s.p.x - 0.35, s.p.y + 0.4, s.p.z);
  camera.fov += (38 - camera.fov) * Math.min(1, dt * 2);
  camera.updateProjectionMatrix();
  // studio fill so the showroom side facing the camera isn't backlit
  fillLight.position.set(s.p.x + 6, s.p.y + 7, s.p.z + 8);
  fillLight.target.position.set(s.p.x, s.p.y, s.p.z);
  fillLight.visible = true;
}

/* ---------- UI wiring ---------- */
function wireUI() {
  // name persist
  els.name.value = localStorage.getItem('na_name') || 'Racer' + ((Math.random() * 900 + 100) | 0);
  els.name.addEventListener('change', () => localStorage.setItem('na_name', els.name.value.slice(0, 14)));

  // car selection
  state.carSel = Math.min(CARS.length - 1, +localStorage.getItem('na_car') || 0);
  const buildSwatches = () => {
    const spec = selSpec();
    const saved = +localStorage.getItem('na_color_' + spec.id);
    let chosen = spec.colors.includes(saved) ? saved : spec.colors[0];
    els.colorRow.innerHTML = '';
    spec.colors.forEach((p) => {
      const b = document.createElement('button');
      const hex = '#' + p.toString(16).padStart(6, '0');
      b.className = 'swatch' + (p === chosen ? ' sel' : '');
      b.style.background = hex;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', p === chosen ? 'true' : 'false');
      b.setAttribute('aria-label', `Color ${hex}`);
      b.onclick = () => {
        chosen = p;
        localStorage.setItem('na_color_' + spec.id, p);
        els.colorRow.querySelectorAll('.swatch').forEach(s => {
          s.classList.remove('sel');
          s.setAttribute('aria-checked', 'false');
        });
        b.classList.add('sel');
        b.setAttribute('aria-checked', 'true');
        buildPreview();
      };
      els.colorRow.appendChild(b);
    });
    state._color = () => chosen;
    // stat bars
    const bar = (el, v) => { el.style.width = Math.round(v * 100) + '%'; };
    bar(els.statVmax, (spec.vmax - 70) / 25);
    bar(els.statAccel, (spec.accel - 12) / 6);
    bar(els.statGrip, (spec.grip - 8) / 2.5);
    els.carSub.textContent = spec.sub;
  };
  CARS.forEach((c, i) => {
    const t = document.createElement('button');
    t.className = 'car-tab' + (i === state.carSel ? ' sel' : '');
    t.textContent = c.name;
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', i === state.carSel ? 'true' : 'false');
    t.setAttribute('aria-label', `${c.name} - ${c.sub}`);

    // Speculatively load car model as soon as cursor moves over the tab
    t.onmouseenter = () => preloadCar(c.id);
    t.onfocus = () => preloadCar(c.id);

    t.onclick = () => {
      state.carSel = i;
      localStorage.setItem('na_car', i);
      els.carTabs.querySelectorAll('.car-tab').forEach(x => {
        x.classList.remove('sel');
        x.setAttribute('aria-selected', 'false');
      });
      t.classList.add('sel');
      t.setAttribute('aria-selected', 'true');
      buildSwatches();
      buildPreview();

      // If the 3D model is still loading, upgrade preview as soon as it resolves
      preloadCar(c.id).then(() => {
        if (state.mode === 'menu' && state.carSel === i && state.previewRig) {
          buildPreview();
        }
      });
    };
    els.carTabs.appendChild(t);
  });
  buildSwatches();
  const getNameColor = () => ({ name: els.name.value.slice(0, 14) || 'Racer', color: state._color(), car: state.carSel });

  els.btnSolo.onclick = async () => {
    audio.ensure(); audio.resume(); audio.startMusic();
    const { name, color } = getNameColor();
    const spec = selSpec();
    if (spec && !isCarLoaded(spec.id)) {
      await preloadCar(spec.id).catch(() => {});
    }
    startSolo(name, color);
  };
  els.btnMulti.onclick = () => {
    audio.ensure(); audio.resume();
    els.soloPanel.style.display = 'none';
    els.mpPanel.style.display = 'block';
  };
  els.btnCreate.onclick = async () => {
    const { name, color } = getNameColor();
    const spec = selSpec();
    if (spec && !isCarLoaded(spec.id)) await preloadCar(spec.id).catch(() => {});
    connectMP(name, color, null);
  };
  els.btnJoin.onclick = async () => {
    const code = els.joinCode.value.trim().toUpperCase();
    if (code.length !== 4) return hud.toast('Enter a 4-letter room code');
    const { name, color } = getNameColor();
    const spec = selSpec();
    if (spec && !isCarLoaded(spec.id)) await preloadCar(spec.id).catch(() => {});
    connectMP(name, color, code);
  };
  els.btnStartRace.onclick = () => { if (net && net.host) net.sendStart(); };
  $('btnMpBack').onclick = () => { els.mpPanel.style.display = 'none'; els.soloPanel.style.display = 'block'; };
  els.btnLobbyLeave.onclick = () => { if (net) net.close(); net = null; hud.hideLobby(); els.mpPanel.style.display = 'block'; };
  els.btnResume.onclick = () => togglePause();
  els.btnQuit.onclick = () => quitRace(true);
  els.musicToggle.onclick = () => {
    audio.ensure(); audio.resume();
    audio.setMusic(!audio.musicEnabled);
    if (audio.musicEnabled) audio.startMusic();
    els.musicToggle.textContent = audio.musicEnabled ? '♪ MUSIC ON' : '♪ MUSIC OFF';
  };

  // touch controls & mobile bindings (Android & iOS)
  const setupTouchBtn = (id, key) => {
    const el = $(id);
    if (!el) return;
    const onDown = (e) => {
      if (e.cancelable) e.preventDefault();
      touchState[key] = true;
      el.classList.add('active');
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
    };
    const onUp = (e) => {
      if (e.cancelable) e.preventDefault();
      touchState[key] = false;
      el.classList.remove('active');
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
    // Touch event fallbacks for WebKit iOS
    el.addEventListener('touchstart', onDown, { passive: false });
    el.addEventListener('touchend', onUp, { passive: false });
    el.addEventListener('touchcancel', onUp, { passive: false });
  };

  setupTouchBtn('tLeft', 'left');
  setupTouchBtn('tRight', 'right');
  setupTouchBtn('tGas', 'gas');
  setupTouchBtn('tBrake', 'brake');
  setupTouchBtn('tNitro', 'nitro');
  setupTouchBtn('tDrift', 'drift');

  // Mobile top action bar (Pause, Cam, Respawn)
  const btnPause = $('tPause');
  if (btnPause) {
    btnPause.addEventListener('pointerdown', (e) => { e.preventDefault(); togglePause(); });
    btnPause.addEventListener('touchstart', (e) => { e.preventDefault(); togglePause(); }, { passive: false });
  }
  const btnCam = $('tCam');
  if (btnCam) {
    btnCam.addEventListener('pointerdown', (e) => { e.preventDefault(); state.camMode = (state.camMode + 1) % 2; });
    btnCam.addEventListener('touchstart', (e) => { e.preventDefault(); state.camMode = (state.camMode + 1) % 2; }, { passive: false });
  }
  const btnReset = $('tReset');
  if (btnReset) {
    btnReset.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (state.player && state.mode === 'race') state.player.resetToTrack(track);
    });
    btnReset.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (state.player && state.mode === 'race') state.player.resetToTrack(track);
    }, { passive: false });
  }

  // Audio unlock on initial mobile user gesture
  const unlockAudio = () => {
    audio.ensure();
    audio.resume();
  };
  ['touchstart', 'touchend', 'pointerdown', 'click'].forEach((evt) => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });

  // Handle visibility changes on mobile
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.mode === 'race' && !state.paused) togglePause();
      if (audio && audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend();
    } else {
      if (audio && audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    }
  });

  // Handle mobile orientation resize
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      applyGraphics(renderer, fx);
    }, 150);
  });

  // Initialize compliance, cookie banner, legal center, and accessibility controls
  initCompliance();
  initGraphicsUI(renderer, fx);

  // Time of Day controls (Day / Night / Dusk)
  const btnTod = $('btnTimeOfDay');
  const btnMenuTod = $('btnMenuTimeOfDay');
  const updateTodUI = () => {
    const tod = track ? track.timeOfDay : 'dusk';
    const label = tod === 'day' ? '☀️ DAY' : (tod === 'night' ? '🌙 NIGHT' : '🌅 DUSK');
    const color = tod === 'day' ? '#ffd000' : (tod === 'night' ? '#00e5ff' : '#ff7b33');
    if (btnTod) {
      btnTod.textContent = label;
      btnTod.style.borderColor = color;
      btnTod.style.color = color;
    }
    if (btnMenuTod) {
      btnMenuTod.textContent = `TIME: ${label}`;
      btnMenuTod.style.borderColor = color;
      btnMenuTod.style.color = color;
    }
    if (headL && headR) {
      const intens = tod === 'day' ? 0 : (tod === 'night' ? 250 : 170);
      headL.intensity = intens; headR.intensity = intens;
    }
  };
  if (btnTod) {
    btnTod.onclick = () => {
      if (track) { track.toggleTimeOfDay(); updateTodUI(); }
    };
  }
  if (btnMenuTod) {
    btnMenuTod.onclick = () => {
      if (track) { track.toggleTimeOfDay(); updateTodUI(); }
    };
  }
  updateTodUI();
}

function connectMP(name, color, room, car) {
  els.loadMsg.textContent = 'Connecting…';
  els.loading.classList.remove('hidden');
  net = new Net({
    onWelcome: (m) => {
      els.loading.classList.add('hidden');
      els.mpPanel.style.display = 'none';
      state.playersInfo = m.players;
      hud.lobby(m.players, m.host, m.code, m.racing);
      if (m.racing) hud.toast('Race in progress — waiting for next round');
    },
    onJoin: (m) => { state.playersInfo = m.players; if (state.mode !== 'race') hud.lobby(m.players, net.host, net.code, false); hud.toast(`${m.player.name} joined`); },
    onLeave: (m) => { state.playersInfo = m.players; if (state.mode !== 'race') hud.lobby(m.players, net.host, net.code, false); hud.toast(`Player left`); },
    onStart: (m) => { if (m.players) state.playersInfo = m.players; startMP(m.startAt); },
    onStates: (d) => {
      for (const [id, s] of Object.entries(d)) {
        const r = state.remotes.get(id);
        if (r) r.push(s);
      }
    },
    onFinished: (m) => {
      hud.toast(`${m.name} finished!`);
      if (!state.mpResults.find(r => r.id === m.id)) state.mpResults.push({ id: m.id, name: m.name, color: m.color, time: m.time });
      if (state.player && state.player.finished) showMPLiveResults();
    },
    onRaceOver: (m) => { if (state.mode === 'race') showMPResults(m.results); },
    onLobby: () => backToLobby(),
    onError: (m) => { els.loading.classList.add('hidden'); hud.toast(m.msg || 'Connection error'); },
    onClose: () => {
      if (state.mode === 'race') { hud.toast('Disconnected from server'); quitRace(true); }
      else { hud.hideLobby(); els.mpPanel.style.display = 'block'; hud.toast('Disconnected'); }
    },
  });
  net.connect(name, color, room, car);
}

/* ---------- race setup ---------- */
function clearRaceObjects() {
  if (state.previewRig) { scene.remove(state.previewRig.group); state.previewRig = null; }
  for (const [, rig] of state.rigs) scene.remove(rig.group);
  for (const [, r] of state.remotes) r.dispose(scene);
  state.rigs.clear(); state.ais.clear(); state.remotes.clear();
  state.cars = [];
  state.player = null;
  state.finishOrder = [];
  state.resultsShown = false;
}

function startSolo(name, color) {
  clearRaceObjects();
  state.mptype = 'solo';
  const spec = selSpec();
  const diff = els.difficulty.value;
  const skillBase = diff === 'easy' ? 0.86 : diff === 'hard' ? 0.99 : 0.93;
  const n = +els.opponents.value;
  const grid = track.spawnGrid(n + 1);
  // AI cars fill grid front, player at back — mixed garage
  const used = new Set([color]);
  let placed = 0;
  for (let i = 0; i < n; i++) {
    const pool = CARS.filter(c => !c.aiExclude);
    const aiSpec = pool[(Math.random() * pool.length) | 0];
    let paint = aiSpec.colors[(Math.random() * aiSpec.colors.length) | 0];
    let guard = 0;
    while (used.has(paint) && guard++ < 12) paint = aiSpec.colors[(Math.random() * aiSpec.colors.length) | 0];
    used.add(paint);
    const car = new CarController(false, 'CPU ' + (i + 1), paint, aiSpec);
    const slot = grid[placed++];
    car.placeAt(slot.pos, slot.yaw);
    const rig = aiSpec.build(paint, { shadowTex: textures.shadow, softGlowTex: textures.softGlow, kidneyTex: textures.kidney });
    scene.add(rig.group);
    state.cars.push(car); state.rigs.set(car, rig);
    fx.setFlame(rig, false);
    state.ais.set(car, new AIDriver(car, skillBase + Math.random() * 0.08, (i % 2 ? 1 : -1) * (1 + Math.random() * 2)));
  }
  const car = new CarController(true, name, color, spec);
  const slot = grid[placed];
  car.placeAt(slot.pos, slot.yaw);
  const rig = spec.build(color, { shadowTex: textures.shadow, softGlowTex: textures.softGlow, kidneyTex: textures.kidney, interior: true, cluster: true });
  scene.add(rig.group);
  state.cars.push(car); state.rigs.set(car, rig);
  state.player = car; state.playerRig = rig;
  fx.setFlame(rig, false);
  beginCountdown(performance.now() + 3600);
}

function startMP(startAtServer) {
  clearRaceObjects();
  state.mptype = 'mp';
  state.mpResults = [];
  const now = Date.now() + (net ? net.clockOffset : 0);
  const players = state.playersInfo.length ? state.playersInfo : (net ? net.players : []);
  const grid = track.spawnGrid(Math.max(2, players.length));
  players.forEach((p, i) => {
    const spec = CARS[p.car | 0] || CARS[0];
    if (p.id === net.id) {
      const car = new CarController(true, p.name, p.color, spec);
      const slot = grid[i];
      car.placeAt(slot.pos, slot.yaw);
      const rig = spec.build(p.color, { shadowTex: textures.shadow, softGlowTex: textures.softGlow, kidneyTex: textures.kidney, interior: true, cluster: true });
      scene.add(rig.group);
      state.cars.push(car); state.rigs.set(car, rig);
      state.player = car; state.playerRig = rig;
      fx.setFlame(rig, false);
    } else {
      const r = new RemoteCar(p.id, p.name, p.color, scene, textures, p.car | 0);
      const slot = grid[i];
      r.car.pos.copy(slot.pos); r.car.yaw = slot.yaw;
      r.car.applyVisual(r.rig, 0);
      state.cars.push(r.car); state.remotes.set(p.id, r);
    }
  });
  beginCountdown(now + (startAtServer - now));
}

function beginCountdown(goAtPerfNow) {
  state.mode = 'race';
  state.racing = true;
  state.countdownActive = true;
  state.startedAt = goAtPerfNow;
  els.menu.style.display = 'none';
  hud.hideLobby();
  hud.show(true);
  hud.hideResults();
  hud.centerMsg('');
  if (els.touch && isTouchDevice) els.touch.classList.add('touch-active');
  if (state.mptype === 'solo') audio.beep(false);
  updateMenuOrRaceCam(0.016, true);
}

/* ---------- camera ---------- */
const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
function updateChaseCam(dt, snap) {
  const car = state.player;
  const rig = state.playerRig;
  if (!car) return updateMenuCam(dt);
  const fx2 = Math.sin(car.yaw), fz2 = Math.cos(car.yaw);
  const speedN = Math.min(1, Math.abs(car.vF) / 88);
  let desired, look;
  if (state.camMode === 0) {
    const dist = 6.9 + speedN * 2.4;
    const h = 2.5;
    desired = new THREE.Vector3(car.pos.x - fx2 * dist, car.pos.y + h, car.pos.z - fz2 * dist);
    look = new THREE.Vector3(car.pos.x + fx2 * 10, car.pos.y + 1.2, car.pos.z + fz2 * 10);
  } else {
    // cockpit: driver's eye (per-car override — low supercars sit lower)
    const eye = (car.spec && car.spec.eye) || { x: 0.36, y: 1.08, z: -0.15 };
    const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
    desired = new THREE.Vector3(
      car.pos.x + fx2 * eye.z + lx * eye.x,
      car.pos.y + eye.y,
      car.pos.z + fz2 * eye.z + lz * eye.x
    );
    look = new THREE.Vector3(car.pos.x + fx2 * 30, car.pos.y + eye.y - 0.1, car.pos.z + fz2 * 30);
  }
  if (!camState.init || snap) { camState.pos.copy(desired); camState.look.copy(look); camState.init = true; }
  const k = snap ? 1 : (state.camMode === 1 ? 1 : 1 - Math.exp(-dt * 8.5));
  camState.pos.lerp(desired, k);
  camState.look.lerp(look, state.camMode === 0 ? 1 - Math.exp(-dt * 9) : 1);
  // keep camera above ground
  const minY = track.closest(camState.pos, state.player.trackHint).height + 0.6;
  if (camState.pos.y < minY) camState.pos.y = minY;
  camera.position.copy(camState.pos);
  camera.lookAt(camState.look);
  camera.rotation.z += -car.roll * 1.4 + (state.player.drifting ? Math.sin(performance.now() * 0.02) * 0.004 : 0);
  const targetFov = (state.camMode === 0 ? 62 : state.camMode === 1 ? 64 : 72) + speedN * 16 + (car.nitroOn ? 9 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}

function updateMenuOrRaceCam(dt, snap = false) {
  if (state.mode === 'race' && state.player) updateChaseCam(dt, snap);
  else updateMenuCam(dt);
}

/* ---------- race loop ---------- */
let lastT = performance.now();
let timeAcc = 0;

function loop(now) {
  requestAnimationFrame(loop);
  if (shouldSkipFrame(now)) return;
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.05);
  timeAcc += dt;

  if (state.mode === 'menu' || !state.player) {
    updateMenuCam(dt);
    track.update(dt, timeAcc, camera.position);
    fx.update(dt, null);
    fx.render();
    return;
  }
  if (state.paused) { fx.render(); return; }
  fillLight.visible = false;

  const car = state.player;

  // countdown
  if (state.countdownActive) {
    const remain = (state.startedAt - (state.mptype === 'mp' ? Date.now() + net.clockOffset : performance.now())) / 1000;
    if (remain > 0.05) {
      const n = Math.ceil(remain);
      const prev = hud._lastCount;
      hud.countdown(n > 3 ? 'GET READY' : n);
      if (prev !== n && n <= 3) audio.beep(false);
      car.inputBrake = true;
    } else {
      hud.countdown('GO!');
      audio.beep(true);
      state.countdownActive = false;
      state.goTime = performance.now();
      setTimeout(() => hud.countdown(null), 900);
    }
  }

  // update all cars
  let input;
  if (state.countdownActive) {
    input = { throttle: 0, brake: false, steer: 0, nitro: false, hand: true };
  } else if (car.finished) {
    // victory lap cruise: auto-drive along the centerline
    const c = track.closest(car.pos, car.trackHint);
    const look = track.sampleAtArc(c.arc + Math.max(12, Math.abs(car.vF) * 0.5));
    const desired = Math.atan2(look.p.x - car.pos.x, look.p.z - car.pos.z);
    let err = desired - car.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    input = { throttle: car.vF < 25 ? 0.5 : 0, brake: car.vF > 34, steer: Math.max(-1, Math.min(1, err * 1.6)), nitro: false, hand: false };
  } else {
    input = playerInput();
  }
  car.inputBrake = input.brake;
  car.update(dt, input, track);

  for (const [aiCar, ai] of state.ais) {
    const aiInput = state.countdownActive ? { throttle: 0, brake: false, steer: 0, nitro: false, hand: true } : ai.think(dt, track, state.cars);
    aiCar.update(dt, aiInput, track);
  }
  for (const [, r] of state.remotes) r.update(dt, fx);

  // car-car collisions, takedowns and wreckage
  resolveCarCollisions(dt);

  // boost pads along the track
  checkBoosterPads(car);
  for (const [aiCar] of state.ais) checkBoosterPads(aiCar);

  // draft
  car.draft = computeDraft(car);
  for (const [aiCar] of state.ais) aiCar.draft = computeDraft(aiCar);

  // effects per car
  updateCarFX(car, dt, true);
  for (const [aiCar] of state.ais) updateCarFX(aiCar, dt, false);

  // headlights follow player
  const fx3 = Math.sin(car.yaw), fz3 = Math.cos(car.yaw);
  headL.position.set(car.pos.x + fx3 * 2.2 - Math.cos(car.yaw) * 0.6, car.pos.y + 0.7, car.pos.z + fz3 * 2.2 + Math.sin(car.yaw) * 0.6);
  headR.position.set(car.pos.x + fx3 * 2.2 + Math.cos(car.yaw) * 0.6, car.pos.y + 0.7, car.pos.z + fz3 * 2.2 - Math.sin(car.yaw) * 0.6);
  headL.target.position.set(car.pos.x + fx3 * 30, car.pos.y, car.pos.z + fz3 * 30);
  headR.target.position.copy(headL.target.position);

  // audio
  audio.setEngine(car.rpm, input.throttle, car.nitroOn, Math.min(1, Math.abs(car.vF) / 88));
  audio.setSkid((car.drifting ? car.driftAmt : 0) * (state.countdownActive ? 0 : 1));

  // nitro whoosh on activation
  if (car.nitroOn && !state._nitroWasOn) audio.whoosh();
  state._nitroWasOn = car.nitroOn;

  // wall hit feedback
  if (car.hitInfo && car.wallHit > 0.95) {
    fx.sparks(new THREE.Vector3(car.hitInfo.x, car.hitInfo.y, car.hitInfo.z), 10, car.hitInfo.nx, car.hitInfo.nz);
    fx.shake = Math.min(1, fx.shake + car.hitInfo.force * 0.05);
    audio.crash(car.hitInfo.force);
    car.hitInfo = null;
  }

  // camera & world
  updateMenuOrRaceCam(dt);
  track.update(dt, timeAcc, car.pos);
  fx.update(dt, car);

  // cockpit interior: show shell, hide everything else on the car, spin wheel, draw live cluster
  const pRig = state.playerRig;
  const cockpit = state.camMode === 1;
  for (const ch of pRig.group.children) {
    ch.visible = (pRig.interior && ch === pRig.interior.group) ? cockpit : !cockpit;
  }
  if (cockpit && pRig.steerWheel) pRig.steerWheel.rotation.z = car.steerVis * 1.9;
  if (cockpit && pRig.cluster) {
    state._clusterAcc = (state._clusterAcc || 0) + 1;
    if (state._clusterAcc % 2 === 0) {
      const { ctx, tex } = pRig.cluster;
      ctx.fillStyle = '#04070c'; ctx.fillRect(0, 0, 256, 96);
      ctx.strokeStyle = 'rgba(0,229,255,0.45)'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, 250, 90);
      ctx.fillStyle = '#e8f6ff'; ctx.font = 'italic 900 46px Arial'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(car.kmh), 178, 60);
      ctx.font = '700 15px Arial'; ctx.fillStyle = '#7fd8e8';
      ctx.fillText('KM/H', 176, 84);
      ctx.fillStyle = car.nitroOn ? '#7df9ff' : '#00b8d4';
      ctx.font = '900 32px Arial'; ctx.textAlign = 'left';
      ctx.fillText(car.gear, 205, 60);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(18, 72, 108, 8);
      ctx.fillStyle = '#00e5ff'; ctx.fillRect(18, 72, 108 * car.nitro / 100, 8);
      tex.needsUpdate = true;
    }
  }

  // hud
  const rank = computeRank(car);
  hud.setRaceInfo(rank, state.cars.length, car.lap, LAPS, car.raceTime,
    car.lapTimes.length ? car.lapTimes[car.lapTimes.length - 1] : 0, car.bestLap);
  hud.drawSpeedo(car.kmh, car.gear, car.nitro, car.nitroOn);
  hud.setNitro(car.nitro, car.nitroOn);
  for (const c of state.cars) c.mapXY = track.mapToXY(c.pos.x, c.pos.z);
  hud.drawMinimap(state.cars);

  // wrong way
  if (!state.countdownActive) {
    const c = track.closest(car.pos, car.trackHint);
    const along = car.vel.x * c.tan.x + car.vel.z * c.tan.z;
    state.wrongTimer = along < -3 ? state.wrongTimer + dt : 0;
    hud.wrongWay(state.wrongTimer > 1.2);
  }

  // race events
  checkRaceEvents(car, rank);

  // network send
  if (state.mptype === 'mp' && net && net.connected) {
    state.netSendAcc += dt;
    if (state.netSendAcc > 0.05) {
      state.netSendAcc = 0;
      net.sendState({
        p: [+car.pos.x.toFixed(2), +car.pos.y.toFixed(2), +car.pos.z.toFixed(2)],
        ry: +car.yaw.toFixed(3), s: +car.vF.toFixed(1),
        n: car.nitroOn ? 1 : 0, dr: car.drifting ? 1 : 0,
        lap: car.lap, prog: +car.prog.toFixed(3), fin: car.finished ? 1 : 0,
        ct: state.carSel,
      });
    }
  }

  fx.render();
}

function updateCarFX(car, dt, isPlayer) {
  const rig = state.rigs.get(car) || (state.remotes.get(car.remoteId) || {}).rig;
  if (!rig) return;
  const speed = Math.abs(car.vF);
  // drift smoke + skid marks at rear wheels
  if (car.drifting || (speed > 20 && Math.abs(car.vL) > 2.5)) {
    const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
    const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
    for (const side of [1, -1]) {
      const wx = car.pos.x - s * 1.42 + rx * side * 0.88;
      const wz = car.pos.z - c * 1.42 + rz * side * 0.88;
      const wy = car.pos.y + 0.055;
      if (Math.random() < 0.55) {
        fx.smoke(new THREE.Vector3(wx, wy + 0.1, wz),
          new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), 0.3);
      }
      const p1 = new THREE.Vector3(wx + rx * 0.15, wy, wz + rz * 0.15);
      const p2 = new THREE.Vector3(wx - rx * 0.15, wy, wz - rz * 0.15);
      fx.skid.add(car.name + ':' + side, p1, p2);
    }
  } else {
    fx.skid.clear(car.name + ':1'); fx.skid.clear(car.name + ':-1');
  }
  // nitro flames
  fx.setFlame(rig, car.nitroOn);
  car.applyVisual(rig, dt);
  // player-only extras
  if (isPlayer) { /* camera fx handled elsewhere */ }
}

/* ---------- car-car collisions, takedowns & wreckage ---------- */
function resolveCarCollisions(dt) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.wrecked) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.wrecked) continue;

      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
      const d2 = dx * dx + dz * dz;
      const minD = 2.65;
      if (d2 > minD * minD || d2 < 0.0001) continue;

      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d; // normal from b to a
      const overlap = minD - d;

      // Elastic separation
      a.pos.x += nx * overlap * 0.52;
      a.pos.z += nz * overlap * 0.52;
      b.pos.x -= nx * overlap * 0.52;
      b.pos.z -= nz * overlap * 0.52;

      // Relative approach velocity along contact normal
      const rvx = a.vel.x - b.vel.x;
      const rvz = a.vel.z - b.vel.z;
      const relSpeed = -(rvx * nx + rvz * nz); // positive when closing in

      // Check TAKEDOWN DESTRUCTION:
      // Takedown happens if one car is boosting (nitroOn) or ramming at high speed difference
      const speedDiff = Math.abs(a.vF) - Math.abs(b.vF);
      let aWrecksB = false;
      let bWrecksA = false;

      if (a.invulnerableTimer <= 0 && b.invulnerableTimer <= 0) {
        if (a.nitroOn && !b.nitroOn) {
          aWrecksB = true;
        } else if (b.nitroOn && !a.nitroOn) {
          bWrecksA = true;
        } else if (speedDiff > 9 && relSpeed > 4) {
          aWrecksB = true;
        } else if (speedDiff < -9 && relSpeed > 4) {
          bWrecksA = true;
        } else if (relSpeed > 24) {
          // Violent mutual crash
          aWrecksB = true;
          bWrecksA = true;
        }
      }

      if (aWrecksB && !bWrecksA) {
        triggerWreck(b, a);
        a.nitro = 100; // Reward attacker with full nitro
        a.takedowns = (a.takedowns || 0) + 1;
      } else if (bWrecksA && !aWrecksB) {
        triggerWreck(a, b);
        b.nitro = 100; // Reward attacker with full nitro
        b.takedowns = (b.takedowns || 0) + 1;
      } else if (aWrecksB && bWrecksA) {
        triggerWreck(a, b);
        triggerWreck(b, a);
      } else {
        // Physical glance / scrape
        if (relSpeed > 0) {
          a.vF *= 0.95; b.vF *= 0.95;
          if (relSpeed > 4) {
            const midX = (a.pos.x + b.pos.x) * 0.5;
            const midY = (a.pos.y + b.pos.y) * 0.5 + 0.4;
            const midZ = (a.pos.z + b.pos.z) * 0.5;
            fx.sparks(new THREE.Vector3(midX, midY, midZ), 12, nx, nz);
            audio.crash(relSpeed * 0.5);
            if (a === state.player || b === state.player) {
              fx.shake = Math.min(1, fx.shake + 0.2);
              if (navigator.vibrate) try { navigator.vibrate(25); } catch (_) {}
            }
          }
        }
      }
    }
  }
}

function triggerWreck(victim, attacker) {
  if (!victim.wreck(attacker)) return;
  const isPlayerVictim = victim === state.player;
  const isPlayerAttacker = attacker === state.player;

  // Massive explosion of sparks & smoke debris
  fx.sparks(new THREE.Vector3(victim.pos.x, victim.pos.y + 0.6, victim.pos.z), 40, 0, 0);
  for (let k = 0; k < 4; k++) {
    fx.smoke(new THREE.Vector3(victim.pos.x + (Math.random() - 0.5) * 1.5, victim.pos.y + 0.4, victim.pos.z + (Math.random() - 0.5) * 1.5),
      new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), 0.7);
  }
  audio.wreck();

  if (isPlayerVictim || isPlayerAttacker) {
    fx.shake = 0.85;
    if (navigator.vibrate) try { navigator.vibrate(isPlayerVictim ? [50, 40, 80] : [30, 20, 50]); } catch (_) {}
  }

  if (isPlayerAttacker) {
    hud.centerMsg(`💥 TAKEDOWN! ${victim.name} (+FULL NITRO)`, 1800);
  } else if (isPlayerVictim) {
    hud.centerMsg(`⚠️ WRECKED BY ${attacker.name}! RESPAWNING…`, 1800);
  }
}

/* ---------- booster pad speed strips ---------- */
function checkBoosterPads(car) {
  if (!track || !track.boosters || car.wrecked || car.boostCooldown > 0) return;
  for (const b of track.boosters) {
    const dx = car.pos.x - b.pos.x;
    const dz = car.pos.z - b.pos.z;
    const distSq = dx * dx + dz * dz;
    // Booster pad trigger radius (~5.5m)
    if (distSq < 5.5 * 5.5) {
      car.boostCooldown = 2.0; // avoid immediate re-trigger on same pad
      car.vF = Math.max(car.vF + 26, car.vmax * 1.25);
      car.nitro = 100;
      car.nitroOn = true;

      // Sparks & jet effects
      fx.sparks(new THREE.Vector3(car.pos.x, car.pos.y + 0.3, car.pos.z), 24, Math.sin(b.angle), Math.cos(b.angle));

      if (car === state.player) {
        audio.boost();
        fx.shake = 0.35;
        if (navigator.vibrate) try { navigator.vibrate(35); } catch (_) {}
        hud.centerMsg('⚡ BOOST PAD! ⚡', 900);
      }
      break;
    }
  }
}

function computeDraft(car) {
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 17 || dist < 1) continue;
    const fx4 = Math.sin(car.yaw), fz4 = Math.cos(car.yaw);
    const ahead = dx * fx4 + dz * fz4;
    if (ahead > 3) {
      const latv = dx * Math.cos(car.yaw) + dz * (-Math.sin(car.yaw));
      if (Math.abs(latv) < 3) return 1;
    }
  }
  return 0;
}

function computeRank(player) {
  let rank = 1;
  for (const c of state.cars) {
    if (c === player) continue;
    if (c.finished && !player.finished) rank++;
    else if (c.finished && player.finished) { if (c.finishTime < player.finishTime) rank++; }
    else if (!c.finished && !player.finished) { if (c.prog > player.prog) rank++; }
    else if (!c.finished && player.finished) { /* they're behind */ }
  }
  return rank;
}

function checkRaceEvents(car, rank) {
  // lap / final lap / finish toasts
  const key = 'lap_' + car.lap;
  if (car.lap >= 0 && state['_' + key] !== true) {
    state['_' + key] = true;
    if (car.lap === LAPS - 1) hud.centerMsg('FINAL LAP', 1500);
    else if (car.lap > 0 && !car.finished) hud.centerMsg(`LAP ${car.lap + 1}/${LAPS}`, 1300);
  }
  if (car.finished && !state.resultsShown) {
    state.resultsShown = true;
    if (state.mptype === 'solo') {
      hud.centerMsg(`FINISH — ${rank}${['st', 'nd', 'rd'][((rank + 90) % 100 - 10) % 10 - 1] || 'th'}`, 3000);
      // give AI a moment to cross the line before the standings
      const wait = setInterval(() => {
        const allDone = [...state.ais.keys()].every(c => c.finished);
        if (allDone || car.raceTime > car.finishTime + 9) { clearInterval(wait); showSoloResults(); }
      }, 500);
    } else {
      net.sendFinish(car.finishTime);
      hud.centerMsg('FINISH!', 3000);
    }
  }
  // AI finish into results (solo)
  if (state.mptype === 'solo' && !state.resultsShown && [...state.ais.keys()].every(c => c.finished) && state.ais.size) {
    // all AI done before player — let player still race
  }
}

function showSoloResults() {
  const rows = [...state.cars]
    .sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.prog - a.prog;
    })
    .map(c => ({
      name: c.name, color: c.paint, you: c === state.player,
      time: c.finished ? c.finishTime : null,
      best: c.bestLap === Infinity ? null : c.bestLap,
    }));
  hud.results('RACE COMPLETE', rows, [
    { label: 'RESTART', primary: true, fn: () => { hud.hideResults(); startSolo(state.player.name, state.player.paint); } },
    { label: 'MAIN MENU', fn: () => { hud.hideResults(); quitRace(true); } },
  ]);
}

function showMPLiveResults() {
  const rows = state.playersInfo.map(p => {
    const r = state.mpResults.find(x => x.id === p.id);
    return { name: p.name, color: p.color, you: p.id === net.id, time: r ? r.time : null, best: null };
  }).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
  hud.results('FINISH — WAITING FOR RACERS…', rows, [
    { label: 'BACK TO LOBBY', primary: net.host, fn: () => { if (net.host) net.sendBackToLobby(); } },
    { label: 'LEAVE', fn: () => quitRace(true) },
  ]);
}

function showMPResults(serverResults) {
  const rows = serverResults
    .sort((a, b) => a.time - b.time)
    .map(r => ({ name: r.name, color: r.color, you: r.id === net.id, time: r.time, best: null }));
  hud.results('RACE COMPLETE', rows, [
    { label: 'BACK TO LOBBY', primary: net.host, fn: () => { if (net.host) net.sendBackToLobby(); } },
    { label: 'LEAVE', fn: () => quitRace(true) },
  ]);
}

function backToLobby() {
  // server told us: return to lobby
  clearRaceObjects();
  state.mode = 'menu';
  state.racing = false;
  hud.show(false);
  hud.hideResults();
  if (els.touch) els.touch.classList.remove('touch-active');
  els.menu.style.display = 'flex';
  els.soloPanel.style.display = 'none';
  els.mpPanel.style.display = 'none';
  if (net && net.connected) hud.lobby(net.players, net.host, net.code, false);
  buildPreview();
}

function quitRace(toMenu) {
  clearRaceObjects();
  state.mode = 'menu';
  state.racing = false;
  state.paused = false;
  els.pause.style.display = 'none';
  hud.show(false);
  hud.hideResults();
  hud.wrongWay(false);
  hud.countdown(null);
  if (els.touch) els.touch.classList.remove('touch-active');
  els.menu.style.display = 'flex';
  if (state.mptype === 'mp' && net) { net.close(); net = null; }
  els.soloPanel.style.display = 'block';
  els.mpPanel.style.display = 'none';
  camState.init = false;
  buildPreview();
}

function togglePause() {
  if (state.mode !== 'race') return;
  if (state.mptype === 'mp') return; // no pausing in MP
  state.paused = !state.paused;
  els.pause.style.display = state.paused ? 'flex' : 'none';
  if (els.touch && isTouchDevice) {
    if (state.paused) els.touch.classList.remove('touch-active');
    else els.touch.classList.add('touch-active');
  }
  if (state.paused) {
    if (els.pauseMainPanel) els.pauseMainPanel.style.display = 'block';
    if (els.pauseGraphicsPanel) els.pauseGraphicsPanel.style.display = 'none';
  }
  audio.setEngine(0.2, 0, false, 0);
}

/* ---------- go ---------- */
boot();
