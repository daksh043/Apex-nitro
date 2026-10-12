/* Nitro Apex — car model, arcade physics, AI driver */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { shortAngle } from './track.js';

/* ---------- GLB car models (user asset packs) ----------
   Each model cfg: url, normalization mode, wheel hookups, tail/exhaust anchors.
   bmw.glb  (M3): nose = +Z already, cm-scale via root 0.01, wheels = 8 "Circle*" meshes
                  (sanitized to "Circle00N" by GLTFLoader), wheelbase 1.92 m raw.
   m4.glb   (M4): Z-up authoring (length along Y), generic node names, 57 meshes,
                  no textures → auto-orient + geometric wheel detection. */
const modelCache = new Map();   // url -> Promise<Object3D|null>
const modelTemplates = new Map(); // url -> normalized Object3D

function finishModel(src, cfg) {
  if (cfg.autoOrient) {
    // bring the longest axis to Z, upright
    let box = new THREE.Box3().setFromObject(src);
    let size = box.getSize(new THREE.Vector3());
    if (size.y >= size.x && size.y >= size.z) src.rotateX(-Math.PI / 2);
    box = new THREE.Box3().setFromObject(src);
    size = box.getSize(new THREE.Vector3());
    if (size.x > size.z) src.rotateY(Math.PI / 2);
    if (cfg.rotateY) src.rotateY(cfg.rotateY);
    // scale to target length, ground and center
    box = new THREE.Box3().setFromObject(src);
    size = box.getSize(new THREE.Vector3());
    const s = cfg.targetLen / Math.max(size.x, size.z);
    src.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(src);
    const c = box.getCenter(new THREE.Vector3());
    src.position.x -= c.x;
    src.position.z -= c.z;
    src.position.y -= box.min.y;
    if (cfg.yOff) src.position.y += cfg.yOff;
  } else {
    src.scale.setScalar(cfg.scale);
    src.position.y = cfg.yOff;
    if (cfg.autoCenter) {
      const box = new THREE.Box3().setFromObject(src);
      const c = box.getCenter(new THREE.Vector3());
      src.position.x -= c.x;
      src.position.z -= c.z;
    }
  }
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    // hide environment-scale geometry (demo ground planes shipped in the GLB)
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    if (size.y < 0.12 && size.x > 7 && size.z > 7) o.visible = false;
  });
  return src;
}

function preloadModel(url, cfg) {
  if (modelCache.has(url)) return modelCache.get(url);
  const p = new Promise((resolve) => {
    const done = (src) => {
      try {
        modelTemplates.set(url, finishModel(src, cfg));
        resolve(modelTemplates.get(url));
      } catch (e) {
        window.__errs.push('model ' + url + ': ' + String(e && e.message || e).slice(0, 200));
        modelCache.set(url, null); resolve(null);
      }
    };
    const fail = (e) => {
      window.__errs.push('model ' + url + ': ' + String(e && e.message || e).slice(0, 200));
      modelCache.set(url, null); resolve(null);
    };
    if (cfg.obj) {
      // OBJ + MTL (MTL may reference nonexistent texture files — MTLLoader falls back to material colors)
      const mtlLoader = new MTLLoader();
      mtlLoader.setPath(url.slice(0, url.lastIndexOf('/') + 1));
      mtlLoader.load(cfg.mtl, (mtl) => {
        mtl.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(mtl);
        objLoader.load(url, (obj) => done(obj), undefined, fail);
      }, undefined, fail);
    } else {
      new GLTFLoader().load(url, (gltf) => done(gltf.scene), undefined, fail);
    }
  });
  modelCache.set(url, p);
  return p;
}

/* ---------- cockpit premium textures (canvas-drawn, BMW styling) ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let _roundel = null;
function roundelTex() {
  if (_roundel) return _roundel;
  const [c, x] = makeCanvas(128, 128);
  // outer ring: black with a silver rim
  x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fillStyle = '#0b0d10'; x.fill();
  x.lineWidth = 2.5; x.strokeStyle = '#c9cfd8'; x.stroke();
  // quartered core (checkerboard, blue top-left / bottom-right)
  const quads = [
    [Math.PI, Math.PI * 1.5, '#2e79c1'],
    [Math.PI * 1.5, Math.PI * 2, '#e8ecf1'],
    [0, Math.PI * 0.5, '#2e79c1'],
    [Math.PI * 0.5, Math.PI, '#e8ecf1'],
  ];
  for (const [a0, a1, col] of quads) {
    x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, 44, a0, a1); x.closePath();
    x.fillStyle = col; x.fill();
  }
  // subtle dish shading
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 44);
  g.addColorStop(0, 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.fillStyle = g; x.fill();
  // BMW lettering on the top arc, dots on the bottom
  x.fillStyle = '#e6eaef'; x.font = 'bold 17px Arial'; x.textAlign = 'center';
  x.fillText('B', 37, 18); x.fillText('M', 64, 11); x.fillText('W', 91, 18);
  for (const a of [Math.PI * 0.85, Math.PI, Math.PI * 1.15]) {
    x.beginPath(); x.arc(64 + Math.cos(a) * 53, 64 + Math.sin(a) * 53, 2.2, 0, Math.PI * 2); x.fill();
  }
  _roundel = canvasTex(c);
  return _roundel;
}
let _mBadge = null;
function mBadgeTex() {
  if (_mBadge) return _mBadge;
  const [c, x] = makeCanvas(128, 48);
  const cols = ['#8fc4e8', '#1e5f9e', '#d31118'];
  cols.forEach((col, i) => {
    const bx = 8 + i * 17;
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(bx + 9, 4); x.lineTo(bx, 44); x.lineTo(bx + 9, 44); x.lineTo(bx + 18, 4);
    x.closePath(); x.fill();
  });
  x.fillStyle = '#eef1f5'; x.font = 'italic 900 36px Arial'; x.textAlign = 'left';
  x.fillText('M', 66, 38);
  _mBadge = canvasTex(c);
  return _mBadge;
}
let _leather = null;
function leatherTex() {
  if (_leather) return _leather;
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#15171b'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  x.strokeStyle = 'rgba(120,132,152,0.5)'; x.lineWidth = 2; x.setLineDash([7, 6]);
  x.beginPath(); x.moveTo(0, 16); x.lineTo(256, 16); x.stroke();
  x.beginPath(); x.moveTo(0, 240); x.lineTo(256, 240); x.stroke();
  _leather = canvasTex(c);
  _leather.wrapS = _leather.wrapT = THREE.RepeatWrapping;
  return _leather;
}
let _carbon = null;
function carbonTex() {
  if (_carbon) return _carbon;
  const [c, x] = makeCanvas(128, 128);
  const b = 16;
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
    const dark = (gx + gy) % 2 === 0;
    const g = x.createLinearGradient(gx * b, gy * b, (gx + 1) * b, (gy + 1) * b);
    g.addColorStop(0, dark ? '#1a1d22' : '#262a31');
    g.addColorStop(1, dark ? '#24272e' : '#121418');
    x.fillStyle = g;
    x.fillRect(gx * b, gy * b, b, b);
  }
  _carbon = canvasTex(c);
  return _carbon;
}

/* ---------- cockpit interior (driver = left-hand drive, car-local x +0.36) ---------- */
function buildInterior(darkMat, opts = {}) {
  const g = new THREE.Group();
  const trim = new THREE.MeshStandardMaterial({ color: 0x15181e, roughness: 0.8, metalness: 0.2 });
  const soft = new THREE.MeshStandardMaterial({ color: 0x1c2027, roughness: 0.95 });

  // cabin dome light (toggles with the interior)
  const lamp = new THREE.PointLight(0xaebfd8, 4.5, 3.2, 1.6);
  lamp.position.set(0, 1.24, 0.35);
  g.add(lamp);

  // cabin shell: floor, ceiling, rear wall, side panels (inward-facing, keeps sky out)
  const shell = [
    [1.50, 0.03, 2.30, 0, 0.42, -0.30],   // floor
    [1.46, 0.03, 1.90, 0, 1.33, -0.40],   // ceiling (front edge at the roofline)
    [1.46, 0.95, 0.04, 0, 0.88, -1.30],   // rear wall
    [0.04, 0.92, 2.10, 0.74, 0.86, -0.30],// left panel
    [0.04, 0.92, 2.10, -0.74, 0.86, -0.30],// right panel
  ];
  for (const [w, h, d, x, y, z] of shell) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), darkMat);
    m.position.set(x, y, z);
    g.add(m);
  }

  // dashboard + top pad (stitched leather)
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.24, 0.48), trim);
  dash.position.set(0, 0.83, 0.60);
  const dashTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.50, 0.035, 0.54),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: leatherTex(), roughness: 0.85 })
  );
  dashTop.position.set(0, 0.955, 0.60);
  g.add(dash, dashTop);

  // A-pillars
  for (const x of [0.64, -0.64]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), trim);
    p.position.set(x, 1.05, 0.42);
    p.rotation.x = -0.62;
    p.rotation.z = x > 0 ? -0.14 : 0.14;
    g.add(p);
  }

  // rearview mirror
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.03), trim);
  mirror.position.set(0, 1.21, 0.68);
  g.add(mirror);

  // seats + headrests
  for (const x of [0.36, -0.36]) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.58, 0.15), soft);
    back.position.set(x, 0.82, -0.85);
    back.rotation.x = 0.14;
    const rest = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.17, 0.11), soft);
    rest.position.set(x, 1.16, -0.94);
    g.add(back, rest);
  }

  // steering wheel on a tilted column; rim + spokes spin, horn pad with roundel stays fixed
  const steer = new THREE.Group();
  steer.position.set(0.36, 0.87, 0.40);
  steer.rotation.x = -0.45;
  const spin = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.026, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x131418, roughness: 0.55 }));
  spin.add(rim);
  for (const [w, h, x, y] of [[0.16, 0.035, -0.095, 0], [0.16, 0.035, 0.095, 0], [0.035, 0.15, 0, -0.085]]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), trim);
    sp.position.set(x, y, 0);
    spin.add(sp);
  }
  steer.add(spin);
  // horn pad with the BMW roundel — fixed to the column so the logo stays readable
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24),
    new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.55, metalness: 0.3 }));
  pad.rotation.y = Math.PI;
  pad.position.z = -0.018;
  steer.add(pad);
  const roundel = new THREE.Mesh(new THREE.CircleGeometry(0.044, 24),
    new THREE.MeshBasicMaterial({ map: roundelTex() }));
  roundel.rotation.y = Math.PI;
  roundel.scale.x = -1;              // undo the mirror from facing the driver
  roundel.position.z = -0.024;
  steer.add(roundel);
  g.add(steer);

  // digital instrument cluster (live canvas texture, player only)
  let cluster = null;
  if (opts.cluster) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.135),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    face.position.set(0.36, 1.015, 0.545);
    face.rotation.x = -0.34;
    face.rotation.y = -0.10;
    g.add(face);
    cluster = { tex, ctx, canvas: cv };
  }

  // center touchscreen (static glow)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x0c2b36 })
  );
  screen.position.set(0.0, 0.93, 0.585);
  screen.rotation.x = -0.22;
  g.add(screen);

  // ----- premium trim package -----
  // ambient light strip along the dash top edge
  const ambient = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 0.012, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x062a33, emissive: 0x00e5ff, emissiveIntensity: 1.5 })
  );
  ambient.position.set(0, 0.978, 0.345);
  g.add(ambient);
  // carbon trim strip on the dash face
  const carbon = new THREE.Mesh(
    new THREE.BoxGeometry(1.44, 0.05, 0.012),
    new THREE.MeshStandardMaterial({ map: carbonTex(), color: 0xffffff, roughness: 0.35, metalness: 0.55 })
  );
  carbon.position.set(0, 0.86, 0.352);
  g.add(carbon);
  // M badge on the dash, right of the wheel
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.06),
    new THREE.MeshBasicMaterial({ map: mBadgeTex(), transparent: true })
  );
  badge.rotation.y = Math.PI;
  badge.position.set(-0.16, 0.865, 0.345);
  g.add(badge);
  // center console + shifter
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 1.0), trim);
  consoleBox.position.set(0, 0.58, -0.45);
  const shifter = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.028, 0.12, 10), trim);
  shifter.position.set(0, 0.72, -0.02);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), soft);
  knob.position.set(0, 0.79, -0.02);
  g.add(consoleBox, shifter, knob);
  // seat side bolsters
  for (const sx of [0.36, -0.36]) {
    for (const dx of [0.30, -0.30]) {
      const bol = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.52, 0.16), soft);
      bol.position.set(sx + dx, 0.80, -0.86);
      bol.rotation.x = 0.14;
      bol.rotation.z = dx > 0 ? -0.12 : 0.12;
      g.add(bol);
    }
  }

  g.visible = false;
  return { group: g, steerWheel: spin, cluster };
}

/* ---------- mesh factory ----------
   Built in driving orientation: nose = +Z, width = X, up = Y (matches yaw physics). */
export function createCarMesh(paint, opts = {}) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paint, metalness: 0.85, roughness: 0.32,
    clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 1.3,
  });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.55, metalness: 0.35 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x05070c, metalness: 0.9, roughness: 0.08, envMapIntensity: 1.1,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd4dae4, metalness: 1.0, roughness: 0.18 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.95 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.9, roughness: 0.35 });

  /* body: lower slab from a side profile (drawn nose-at-+x, rotated so nose -> +z).
     Bevel rounds the rocker/beltline edges for a less slab-like silhouette. */
  const prof = new THREE.Shape();
  prof.moveTo(-2.28, 0.22);
  prof.lineTo(-2.40, 0.52);   // rear bumper face
  prof.lineTo(-2.34, 0.82);   // tail deck corner
  prof.lineTo(-1.45, 0.90);   // trunk lid
  prof.lineTo(-0.35, 0.92);   // beltline
  prof.lineTo(0.75, 0.88);    // cowl
  prof.lineTo(1.85, 0.70);    // hood slope
  prof.lineTo(2.36, 0.58);    // nose top
  prof.lineTo(2.44, 0.36);    // nose face
  prof.lineTo(2.30, 0.16);    // under-nose
  prof.lineTo(1.30, 0.12);
  prof.lineTo(-1.30, 0.12);   // floor
  prof.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(prof, {
    depth: 1.44, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.18, bevelSegments: 3, curveSegments: 6,
  });
  bodyGeo.translate(0, 0, -0.72);
  bodyGeo.rotateY(-Math.PI / 2); // (+x nose) -> +z ; extrusion z (width) -> x
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, paintMat);
  body.castShadow = true;
  group.add(body);

  /* greenhouse: dark glass canopy with raked windshield and fastback rear */
  const cab = new THREE.Shape();
  cab.moveTo(-1.20, 0.78);
  cab.lineTo(-0.95, 1.14);
  cab.lineTo(0.05, 1.18);
  cab.lineTo(0.72, 0.80);
  cab.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cab, {
    depth: 1.02, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4,
  });
  cabGeo.translate(0, 0, -0.51);
  cabGeo.rotateY(-Math.PI / 2);
  cabGeo.computeVertexNormals();
  const canopy = new THREE.Mesh(cabGeo, glassMat);
  canopy.castShadow = true;
  group.add(canopy);

  /* wheels: torus tire + chrome rim + brake disc, axle along X.
     Outer group steers (Y), inner group spins (X). */
  const tireGeo = new THREE.TorusGeometry(0.26, 0.12, 10, 22);
  tireGeo.rotateY(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.155, 0.155, 0.235, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.26, 12);
  discGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wheelPos = [[0.88, 1.42], [-0.88, 1.42], [0.88, -1.42], [-0.88, -1.42]];
  for (const [wx, wz] of wheelPos) {
    const steerG = new THREE.Group();
    steerG.position.set(wx, 0.37, wz);
    const spinG = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinG.add(tire, new THREE.Mesh(rimGeo, chromeMat), new THREE.Mesh(discGeo, brakeMat));
    steerG.add(spinG);
    steerG.userData.spin = spinG;
    group.add(steerG);
    wheels.push(steerG);
  }

  /* front LED headlights + grille */
  const headMat = new THREE.MeshStandardMaterial({ color: 0x1c2128, emissive: 0xdfeaff, emissiveIntensity: 5 });
  for (const x of [0.52, -0.52]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, 0.10), headMat);
    h.position.set(x, 0.60, 2.40);
    group.add(h);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 0.07), blackMat);
  grille.position.set(0, 0.30, 2.41);
  group.add(grille);

  /* full-width rear light bar */
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff1822, emissiveIntensity: 1.2 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.05, 0.05), tailMat);
  tail.position.set(0, 0.80, -2.36);
  group.add(tail);
  const rearGrille = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.14, 0.05), blackMat);
  rearGrille.position.set(0, 0.34, -2.50);
  group.add(rearGrille);

  /* spoiler */
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.40), blackMat);
  wing.position.set(0, 1.04, -2.05);
  wing.rotation.x = -0.10;
  wing.castShadow = true;
  group.add(wing);
  for (const x of [0.55, -0.55]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.16), blackMat);
    strut.position.set(x, 0.90, -2.06);
    group.add(strut);
  }

  /* aero: splitter, diffuser, skirts */
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 0.45), blackMat);
  splitter.position.set(0, 0.15, 2.24);
  group.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.10, 0.35), blackMat);
  diffuser.position.set(0, 0.18, -2.30);
  group.add(diffuser);
  for (const x of [0.84, -0.84]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 2.3), blackMat);
    skirt.position.set(x, 0.16, 0);
    group.add(skirt);
  }

  /* side mirrors */
  for (const x of [0.97, -0.97]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), blackMat);
    stalk.position.set(x * 0.94, 0.94, 0.62);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.16), paintMat);
    cap.position.set(x, 0.97, 0.62);
    group.add(stalk, cap);
  }

  /* exhaust tips */
  const exGeo = new THREE.CylinderGeometry(0.06, 0.075, 0.20, 10);
  exGeo.rotateX(Math.PI / 2);
  const exhausts = [];
  for (const x of [0.40, -0.40]) {
    const e = new THREE.Mesh(exGeo, blackMat);
    e.position.set(x, 0.30, -2.40);
    group.add(e);
    exhausts.push(new THREE.Vector3(x, 0.30, -2.48));
  }

  /* contact shadow + subtle underglow */
  if (opts.shadowTex) {
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.3, 5.4),
      new THREE.MeshBasicMaterial({ map: opts.shadowTex, transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    sh.renderOrder = 1;
    group.add(sh);
  }
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 5.0),
    new THREE.MeshBasicMaterial({
      map: opts.softGlowTex || opts.shadowTex,
      color: paint, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.045;
  group.add(glow);

  let interior = null;
  if (opts.interior) {
    interior = buildInterior(blackMat, opts);
    group.add(interior.group);
  }

  return { group, wheels, tail, exhausts, paintMat, glow, body, canopy, interior };
}

/* ---------- BMW M3 Competition style sport sedan ----------
   Same driving orientation: nose = +Z. Signature cues: tall kidney grilles,
   quad exhausts, sedan greenhouse with rear glass, power-dome hood, fender gills. */
export function createM3Mesh(paint, opts = {}) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paint, metalness: 0.75, roughness: 0.36,
    clearcoat: 1.0, clearcoatRoughness: 0.09, envMapIntensity: 0.95,
  });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.55, metalness: 0.35 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x05070c, metalness: 0.9, roughness: 0.08, envMapIntensity: 1.1, side: THREE.DoubleSide,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd4dae4, metalness: 1.0, roughness: 0.18 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.95 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.9, roughness: 0.35 });
  const glossBlack = new THREE.MeshStandardMaterial({ color: 0x060708, roughness: 0.3, metalness: 0.5 });
  const chromeTrim = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 1.0, roughness: 0.3 });
  const carbonMat = new THREE.MeshPhysicalMaterial({
    color: 0x121419, metalness: 0.4, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25,
  });
  const kidneyMeshMat = opts.kidneyTex
    ? new THREE.MeshStandardMaterial({ map: opts.kidneyTex, color: 0xffffff, roughness: 0.6, metalness: 0.4 })
    : glossBlack;
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xc0181f, roughness: 0.4, metalness: 0.3 });
  const darkRimMat = new THREE.MeshStandardMaterial({ color: 0x191b1f, metalness: 0.8, roughness: 0.35 });

  /* body: sedan flanks up to the beltline */
  const prof = new THREE.Shape();
  prof.moveTo(-2.42, 0.24);
  prof.lineTo(-2.52, 0.55);   // rear bumper face
  prof.lineTo(-2.46, 0.88);   // trunk edge
  prof.lineTo(-1.75, 0.92);   // trunk lid
  prof.lineTo(-0.45, 0.94);   // beltline
  prof.lineTo(0.85, 0.90);    // cowl
  prof.lineTo(1.95, 0.78);    // hood
  prof.lineTo(2.42, 0.66);    // nose top
  prof.lineTo(2.50, 0.40);    // nose face
  prof.lineTo(2.36, 0.18);    // under-nose
  prof.lineTo(1.35, 0.13);
  prof.lineTo(-1.35, 0.13);   // floor
  prof.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(prof, {
    depth: 1.52, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.17, bevelSegments: 3, curveSegments: 6,
  });
  bodyGeo.translate(0, 0, -0.76);
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, paintMat);
  body.castShadow = true;
  group.add(body);

  /* greenhouse: carbon-fibre roof (M Competition), body-color pillars */
  const cab = new THREE.Shape();
  cab.moveTo(-1.72, 0.86);
  cab.lineTo(-1.38, 1.34);
  cab.lineTo(0.55, 1.36);
  cab.lineTo(1.05, 0.86);
  cab.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(cab, {
    depth: 1.30, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4,
  });
  cabGeo.translate(0, 0, -0.65);
  cabGeo.rotateY(-Math.PI / 2);
  cabGeo.computeVertexNormals();
  const roof = new THREE.Mesh(cabGeo, carbonMat);
  roof.castShadow = true;
  group.add(roof);

  /* side windows: dark glass panels just outside the greenhouse */
  const glassPanels = [];
  const win = new THREE.Shape();
  win.moveTo(-1.58, 0.88);
  win.lineTo(-1.30, 1.28);
  win.lineTo(0.45, 1.30);
  win.lineTo(0.86, 0.90);
  win.closePath();
  const winGeo = new THREE.ShapeGeometry(win);
  winGeo.rotateY(-Math.PI / 2);
  for (const x of [0.705, -0.705]) {
    const w = new THREE.Mesh(winGeo, glassMat);
    w.position.x = x;
    group.add(w);
    glassPanels.push(w);
  }
  /* windshield + rear glass */
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.74), glassMat);
  windshield.position.set(0, 1.11, 0.80);
  windshield.rotation.x = -0.78;
  group.add(windshield);
  glassPanels.push(windshield);
  const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.52), glassMat);
  rearGlass.position.set(0, 1.08, -1.55);
  rearGlass.rotation.x = 0.60;
  group.add(rearGlass);
  glassPanels.push(rearGlass);

  /* wheels: 20" 826M-style dark rims + red M calipers */
  const tireGeo = new THREE.TorusGeometry(0.26, 0.115, 10, 22);
  tireGeo.rotateY(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.24, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.26, 12);
  discGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wheelPos = [[0.88, 1.48], [-0.88, 1.48], [0.88, -1.48], [-0.88, -1.48]];
  for (const [wx, wz] of wheelPos) {
    const steerG = new THREE.Group();
    steerG.position.set(wx, 0.37, wz);
    const spinG = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinG.add(tire, new THREE.Mesh(rimGeo, darkRimMat), new THREE.Mesh(discGeo, brakeMat));
    steerG.add(spinG);
    // caliper stays fixed to the upright (does not spin)
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.09), caliperMat);
    caliper.position.set(wx > 0 ? -0.05 : 0.05, 0.03, 0.10);
    steerG.add(caliper);
    steerG.userData.spin = spinG;
    group.add(steerG);
    wheels.push(steerG);
  }

  /* huge vertical kidney grilles — chrome surround, dark mesh, slight rake */
  for (const x of [0.20, -0.20]) {
    const frame = new THREE.Mesh(new RoundedBoxGeometry(0.40, 0.56, 0.07, 2, 0.05), chromeTrim);
    frame.position.set(x, 0.47, 2.58);
    frame.rotation.x = -0.05;
    const kidney = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.48, 0.10, 2, 0.04), kidneyMeshMat);
    kidney.position.set(x, 0.47, 2.615);
    kidney.rotation.x = -0.05;
    group.add(frame, kidney);
  }

  /* slim swept-back LED headlights */
  const headMat = new THREE.MeshStandardMaterial({ color: 0x1c2128, emissive: 0xdfeaff, emissiveIntensity: 4.5 });
  for (const x of [0.60, -0.60]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.045, 0.12), headMat);
    h.position.set(x, 0.65, 2.52);
    h.rotation.y = x > 0 ? 0.22 : -0.22;
    h.rotation.z = x > 0 ? -0.05 : 0.05;
    group.add(h);
  }
  /* large bumper intakes */
  for (const x of [0.62, -0.62]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.20, 0.09), glossBlack);
    intake.position.set(x, 0.26, 2.60);
    group.add(intake);
  }
  const centerIntake = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.12, 0.09), glossBlack);
  centerIntake.position.set(0, 0.22, 2.60);
  group.add(centerIntake);

  /* hood power dome */
  const dome = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.045, 1.15), paintMat);
  dome.position.set(0, 0.875, 1.55);
  dome.rotation.x = 0.11;
  group.add(dome);

  /* fender gills */
  for (const x of [0.88, -0.88]) {
    const gill = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.26), glossBlack);
    gill.position.set(x, 0.60, 0.98);
    group.add(gill);
  }

  /* rear light bar + trunk lip spoiler */
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff1822, emissiveIntensity: 1.2 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.05, 0.05), tailMat);
  tail.position.set(0, 0.80, -2.64);
  group.add(tail);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.045, 0.24), glossBlack);
  lip.position.set(0, 0.945, -2.30);
  group.add(lip);

  /* aero: splitter, diffuser, skirts */
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.05, 0.50), glossBlack);
  splitter.position.set(0, 0.13, 2.42);
  group.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.11, 0.35), blackMat);
  diffuser.position.set(0, 0.18, -2.52);
  group.add(diffuser);
  for (const x of [0.86, -0.86]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 2.4), blackMat);
    skirt.position.set(x, 0.16, 0);
    group.add(skirt);
  }

  /* M mirrors with gloss-black caps */
  for (const x of [0.99, -0.99]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), blackMat);
    stalk.position.set(x * 0.94, 0.95, 0.78);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.16), glossBlack);
    cap.position.set(x, 0.98, 0.78);
    group.add(stalk, cap);
  }

  /* quad exhaust tips */
  const exGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.18, 10);
  exGeo.rotateX(Math.PI / 2);
  const exhausts = [];
  for (const x of [0.62, 0.46, -0.46, -0.62]) {
    const e = new THREE.Mesh(exGeo, glossBlack);
    e.position.set(x, 0.30, -2.60);
    group.add(e);
    exhausts.push(new THREE.Vector3(x, 0.30, -2.66));
  }

  /* contact shadow + subtle underglow */
  if (opts.shadowTex) {
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 5.6),
      new THREE.MeshBasicMaterial({ map: opts.shadowTex, transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    sh.renderOrder = 1;
    group.add(sh);
  }
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3, 5.1),
    new THREE.MeshBasicMaterial({
      map: opts.softGlowTex || opts.shadowTex,
      color: paint, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.045;
  group.add(glow);

  let interior = null;
  if (opts.interior) {
    interior = buildInterior(blackMat, opts);
    group.add(interior.group);
  }

  return { group, wheels, tail, exhausts, paintMat, glow, body, canopy: roof, glassPanels, interior };
}

/* ---------- cars built from GLB asset packs (procedural M3 as fallback) ---------- */
export const MODEL_CFGS = {
  m3: {
    url: '/models/bmw_m3/bmw_m3_game/bmw.glb',
    scale: 2.96 / 1.917,
    yOff: 0.37 - 0.227 * (2.96 / 1.917),
    wheelPattern: /^Circle00[1-8]/,
    tail: { y: 0.78, z: -1.92, w: 1.5 },
    exhaust: { x: 0.55, y: 0.32, z: -1.95 },
    paint: /car_paint/i,
  },
  revuelto: {
    url: '/models/lambo_revuelto/revuelto.glb',
    scale: 1, yOff: 0.01,       // meters already, wheels sit ~grounded
    wheelNames: { FL: /^Wheel_FL$/, FR: /^Wheel_FR$/, RL: /^Wheel_RL$/, RR: /^Wheel_RR$/ },
    ctrlPattern: /^CTRL_Wheel_([FL][LR])$/,   // hub pivot nodes shipped with the model
    paint: /carpaint/i,
    interior: false,            // the model ships its own full Revuelto interior
    tail: false,                // own taillights
    exhaust: { x: 0.55, y: 0.55, z: -2.35 },
    eye: { x: 0.36, y: 1.02, z: -0.35 },   // low supercar seating, pulled back a touch
    aiExclude: true,            // 504 meshes — too heavy for AI opponents
  },
  mk5: {
    url: '/models/vw_mk5/mk5_game/mk5o.obj',
    mtl: 'MKVA90.mtl',
    obj: true,                  // OBJ + MTL (textures stripped — baked colors only)
    scale: 4.4 / 4.59,          // target length 4.4 m (Golf)
    yOff: 0,
    autoCenter: true,           // raw z center +0.09 → recenter
    wheelPattern: null,         // geometric detection in car space
    paint: /^MKV\.Paint$/i,
    interior: false,            // the OBJ ships its own interior (Leather/Alcantara/Screen)
    tail: false,                // own taillights (MKV.Taillight)
    exhaust: { x: 0.45, y: 0.38, z: -2.15 },
    eye: { x: 0.36, y: 1.05, z: -0.1 },
  },
  porsche: {
    url: '/models/porsche_911/porsche.glb',
    autoOrient: true,
    targetLen: 4.52,
    wheelPivots: false,
    paintMat: /paint/i,
    tail: { y: 0.72, z: -2.12, w: 1.40 },
    exhaust: { x: 0.50, y: 0.30, z: -2.10 },
  },
  gtr: {
    url: '/models/nissan_gtr/gtr.glb',
    autoOrient: true,
    targetLen: 4.69,
    wheelPivots: false,
    paintMat: /^nismo_gtr_paint$/i,
    tail: { y: 0.76, z: -2.25, w: 1.45 },
    exhaust: { x: 0.60, y: 0.32, z: -2.25 },
  },
  terzo: {
    url: '/models/lambo_terzo/terzo.glb',
    autoOrient: true,
    rotateY: Math.PI,
    targetLen: 4.85,
    wheelPivots: false,
    paintMat: /carosserie/i,
    tail: false,
    exhaust: { x: 0.45, y: 0.45, z: -2.35 },
    eye: { x: 0.36, y: 0.98, z: -0.35 },
    aiExclude: true,
  },
};

export function preloadModels() {
  return Promise.all(Object.values(MODEL_CFGS).map((cfg) => preloadModel(cfg.url, cfg)));
}

function buildModelWheels(group, body, cfg) {
  const found = [];
  body.updateMatrixWorld(true);
  if (cfg.wheelNames) {
    // named wheels (e.g. Revuelto "Wheel_FL" group + "CTRL_Wheel_FL" hub node)
    const ctrls = {};
    if (cfg.ctrlPattern) {
      body.traverse((o) => {
        const m = cfg.ctrlPattern.exec(o.name || '');
        if (m) ctrls[m[1]] = o.getWorldPosition(new THREE.Vector3());
      });
    }
    body.traverse((o) => {
      for (const [key, re] of Object.entries(cfg.wheelNames)) {
        if (re.test(o.name || '')) {
          found.push({ node: o, key, pos: ctrls[key] || o.getWorldPosition(new THREE.Vector3()) });
        }
      }
    });
  } else if (cfg.wheelPattern) {
    body.traverse((o) => {
      if (o.isMesh && cfg.wheelPattern.test(o.name) && o.visible) {
        found.push({ node: o, pos: o.getWorldPosition(new THREE.Vector3()) });
      }
    });
  } else {
    // geometric detection: small round-ish parts near the ground at the four corners
    body.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());
      const ratio = Math.max(s.x, s.z) / Math.max(0.01, Math.min(s.x, s.z));
      if (s.x < 0.9 && s.z < 0.9 && s.y < 0.75 && c.y < 0.55 &&
          Math.abs(c.x) > 0.5 && ratio < 3) {
        found.push({ node: o, pos: c });
      }
    });
  }
  const buckets = {};
  for (const f of found) {
    const key = f.key || ((f.pos.z > 0 ? 'F' : 'R') + (f.pos.x < 0 ? 'L' : 'R'));
    (buckets[key] = buckets[key] || []).push(f);
  }
  const wheels = [];
  for (const key of ['FL', 'FR', 'RL', 'RR']) {
    const list = buckets[key];
    if (!list || !list.length || list.length > 8) continue;
    const mid = list.reduce((a, f) => a.add(f.pos), new THREE.Vector3()).multiplyScalar(1 / list.length);
    const pivot = new THREE.Group();
    pivot.position.copy(group.worldToLocal(mid.clone()));
    group.add(pivot);
    for (const f of list) pivot.attach(f.node);       // keep world transform, reparent
    pivot.userData.spin = pivot;
    pivot.userData.front = key[0] === 'F';
    wheels.push(pivot);
  }
  // our applyVisual treats wheels[0..1] as the steered front pair
  wheels.sort((a, b) => (b.userData.front ? 1 : 0) - (a.userData.front ? 1 : 0));
  return wheels;
}

export function createModelMesh(paint, opts = {}, cfg) {
  const template = modelTemplates.get(cfg.url);
  if (!template) return createM3Mesh(paint, opts);    // fallback until loaded / on failure
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.55, metalness: 0.35 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff1822, emissiveIntensity: 1.2 });
  const paintTint = new THREE.Color(paint);

  // body from the asset pack
  const body = template.clone(true);
  group.add(body);

  // paint tint (multiplies the model's own base color / baked texture)
  if (cfg.paintMat instanceof RegExp) {
    body.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const applyMat = (mat) => {
        if (mat && cfg.paintMat.test(mat.name || '')) {
          const m = mat.clone();
          m.color = paintTint;
          return m;
        }
        return mat;
      };
      if (Array.isArray(o.material)) {
        o.material = o.material.map(applyMat);
      } else {
        o.material = applyMat(o.material);
      }
    });
  } else if (cfg.paint instanceof RegExp) {
    body.traverse((o) => {
      if (o.isMesh && cfg.paint.test(o.name) && o.material) {
        o.material = o.material.clone();
        o.material.color = paintTint;
      }
    });
  } else if (cfg.paint === 'largest') {
    let best = null, bestV = 0;
    body.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3());
      const glassy = o.material.transparent || (o.material.opacity !== undefined && o.material.opacity < 0.9);
      const v = s.x * s.y * s.z;
      if (!glassy && v > bestV) { bestV = v; best = o; }
    });
    if (best && best.material) {
      best.material = best.material.clone();
      best.material.color = paintTint;
    }
  }

  const wheels = cfg.wheelPivots === false ? [] : buildModelWheels(group, body, cfg);

  // our tail-light bar + exhaust anchors (skipped when the model has its own lights)
  let tail = null;
  if (cfg.tail !== false) {
    tail = new THREE.Mesh(new THREE.BoxGeometry(cfg.tail.w, 0.05, 0.05), tailMat);
    tail.position.set(0, cfg.tail.y, cfg.tail.z);
    group.add(tail);
  }
  const exGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.18, 10);
  exGeo.rotateX(Math.PI / 2);
  const exhausts = [];
  for (const x of [cfg.exhaust.x, -cfg.exhaust.x]) {
    const e = new THREE.Mesh(exGeo, blackMat);
    e.position.set(x, cfg.exhaust.y, cfg.exhaust.z);
    group.add(e);
    exhausts.push(new THREE.Vector3(x, cfg.exhaust.y, cfg.exhaust.z - 0.08));
  }

  // cockpit interior (ours — live cluster + steering wheel)
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.55, metalness: 0.35 });
  let interior = null;
  if (opts.interior && cfg.interior !== false) {
    interior = buildInterior(darkMat, opts);
    group.add(interior.group);
  }

  // contact shadow + underglow
  if (opts.shadowTex) {
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 5.6),
      new THREE.MeshBasicMaterial({ map: opts.shadowTex, transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    sh.renderOrder = 1;
    group.add(sh);
  }
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3, 5.1),
    new THREE.MeshBasicMaterial({
      map: opts.softGlowTex || opts.shadowTex,
      color: paint, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.045;
  group.add(glow);

  return { group, wheels, tail, exhausts, paintMat: null, glow, body, canopy: null, interior };
}

/* ---------- car catalog ----------
   Per-car physics: vmax (m/s), accel (m/s²), nitro boost accel, grip. */
export const CARS = [
  {
    id: 'm3', name: 'BMW M3 COMPETITION', sub: 'SPORT SEDAN · 510 HP',
    vmax: 81, accel: 15.2, nitro: 8.6, grip: 9.6, topKmh: 291,
    colors: [0x71767e, 0x2d6a4f, 0xf3d34a, 0xf2f3f5, 0x4a7fb5, 0x8a1114, 0x0e1013],
    build: (p, o) => createModelMesh(p, o, MODEL_CFGS.m3),
  },
  {
    id: 'revuelto', name: 'LAMBORGHINI REVUELTO', sub: 'V12 HYBRID · 1015 HP',
    vmax: 97, accel: 18, nitro: 10, grip: 9.4, topKmh: 352,
    colors: [0x7cc576, 0xf06511, 0x7b2d8b, 0xf7e017, 0xf2f3f5, 0x15161a],
    build: (p, o) => createModelMesh(p, o, MODEL_CFGS.revuelto),
  },
  {
    id: 'mk5', name: 'TOYOTA GR SUPRA', sub: 'SPORT COUPE · 382 HP',
    vmax: 80, accel: 14, nitro: 8.2, grip: 9.5, topKmh: 290,
    colors: [0xf2f3f5, 0x1b3a6b, 0x8a1114, 0x15161a, 0x6b7076, 0xc0c3c9],
    build: (p, o) => createModelMesh(p, o, MODEL_CFGS.mk5),
  },
  {
    id: 'porsche', name: 'PORSCHE 911 CARRERA 4S', sub: 'SPORT COUPE · 443 HP',
    vmax: 85, accel: 16.0, nitro: 9.0, grip: 9.6, topKmh: 306,
    colors: [0xf2f3f5, 0xd91424, 0xf5d000, 0x1b3b6f, 0x595b61, 0x121316],
    build: (p, o) => createModelMesh(p, o, MODEL_CFGS.porsche),
  },
  {
    id: 'gtr', name: 'NISSAN GT-R NISMO', sub: 'TWIN-TURBO AWD · 600 HP',
    vmax: 92, accel: 17.2, nitro: 9.6, grip: 9.8, topKmh: 330,
    colors: [0xf4f5f8, 0x65686f, 0x121314, 0xc8102e, 0x1d4ed8],
    build: (p, o) => createModelMesh(p, o, MODEL_CFGS.gtr),
  },
  {
    id: 'terzo', name: 'LAMBORGHINI TERZO MILLENNIO', sub: 'ELECTRIC CONCEPT · 1000+ HP',
    vmax: 101, accel: 19.0, nitro: 10.5, grip: 9.7, topKmh: 365,
    colors: [0x18191c, 0xff6600, 0x7cc576, 0xf4f5f8, 0x6b21a8],
    build: (p, o) => createModelMesh(p, o, MODEL_CFGS.terzo),
  },
];

/* ---------- arcade physics ---------- */
const BRAKE = 30;

export class CarController {
  constructor(isPlayer, name, paint, spec = CARS[0]) {
    this.isPlayer = isPlayer;
    this.name = name;
    this.paint = paint;
    this.spec = spec;
    this.vmax = spec.vmax;
    this.accelP = spec.accel;
    this.nitroA = spec.nitro;
    this.grip = spec.grip;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vel = new THREE.Vector3();     // world planar velocity
    this.vF = 0; this.vL = 0;           // car-frame components
    this.nitro = 50; this.nitroOn = false;
    this.drifting = false; this.driftAmt = 0;
    this.steer = 0; this.steerVis = 0;
    this.gear = 1; this.rpm = 0.2;
    this.lap = -1; this.prevT = 0; this.prog = -1;
    this.lapTimes = []; this.lapStart = 0; this.bestLap = Infinity;
    this.finished = false; this.finishTime = 0; this.raceTime = 0;
    this.pitch = 0; this.roll = 0;
    this.trackHint = -1;
    this.track = null;
    this.wallHit = 0; this.hitInfo = null;
    this.draft = 0;
    this.wheelSpin = 0;
  }

  get speed() { return this.vF; }
  get kmh() { return Math.max(0, this.vF * 3.6); }

  placeAt(pos, yaw) {
    this.pos.copy(pos); this.yaw = yaw;
    this.vel.set(0, 0, 0); this.vF = 0; this.vL = 0;
    this.trackHint = -1;
  }

  resetToTrack(track) {
    const c = track.closest(this.pos, this.trackHint);
    const s = track.samples[c.i];
    this.pos.set(s.p.x, s.p.y, s.p.z);
    this.yaw = s.a;
    this.vF *= 0.25; this.vL = 0;
    this.trackHint = c.i;
  }

  update(dt, input, track) {
    if (!this.track) this.track = track;
    if (this.finished && this.isPlayer === false) input = { throttle: 0.3, brake: false, steer: 0, nitro: false, hand: false };

    // nitro
    const canNitro = input.nitro && this.nitro > 1 && this.vF > 3;
    this.nitroOn = canNitro;
    if (canNitro) this.nitro = Math.max(0, this.nitro - 28 * dt);
    else this.nitro = Math.min(100, this.nitro + (3.5 + this.draft * 8 + this.driftAmt * 0.9) * dt);

    // longitudinal
    const vmax = canNitro ? this.vmax * 1.24 : this.vmax;
    let a = 0;
    const t = input.throttle || 0;
    if (t > 0) {
      const head = Math.max(0, 1 - this.vF / vmax);
      a += t * (this.accelP + (canNitro ? this.nitroA : 0) + this.draft * 3.2) * (0.25 + 0.75 * head);
    }
    if (input.brake) {
      if (this.vF > 0.3) a -= BRAKE;
      else if (this.vF > -14) a -= 9; // reverse
    }
    // drag + rolling
    a -= Math.sign(this.vF) * (this.accelP / (this.vmax * this.vmax)) * this.vF * this.vF * (this.vF > 0 ? 1 : 0);
    if (Math.abs(this.vF) > 0.4) a -= Math.sign(this.vF) * 0.6;
    if (input.hand && Math.abs(this.vF) > 0.5) a -= 6;
    if (this.drifting) a -= Math.abs(this.vL) * 0.10;
    this.vF += a * dt;
    if (this.vF < -14) this.vF = -14;
    if (!input.throttle && !input.brake && Math.abs(this.vF) < 0.25) this.vF = 0;

    // steering
    const steerIn = input.steer || 0;
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 10);
    const Rmin = 5 + 0.050 * this.vF * this.vF;
    let omega = (this.vF / Rmin) * this.steer;
    if (input.hand) omega *= 1.4;
    // drift adds rotation from slip
    const slip = Math.atan2(this.vL, Math.max(2, Math.abs(this.vF)));
    if (Math.abs(this.vL) > 3) omega += slip * 0.55;
    if (Math.abs(this.vF) < 0.3) omega = 0;
    this.yaw += omega * dt;
    if (this.vF < -0.5) { /* reversing steer feel */ }

    // lateral grip
    const grip = input.hand ? 2.1 : (canNitro ? this.grip * 0.83 : this.grip);
    this.vL *= Math.exp(-grip * dt);
    // centrifugal transfer: turning generates lateral velocity
    this.vL += -omega * this.vF * dt * 0.85;

    // compose world velocity
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.vel.set(fx * this.vF + rx * this.vL, 0, fz * this.vF + rz * this.vL);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // track constraints
    const c = track.closest(this.pos, this.trackHint);
    this.trackHint = c.i;
    const half = track.WALL_LAT - 1.0;
    if (Math.abs(c.lat) > half) {
      const s = track.samples[c.i];
      const rx2 = Math.cos(s.a), rz2 = -Math.sin(s.a);
      const over = Math.abs(c.lat) - half;
      const sign = Math.sign(c.lat);
      this.pos.x -= rx2 * sign * over;
      this.pos.z -= rz2 * sign * over;
      // reflect lateral velocity — hard bounce on real impacts, gentle scrape otherwise
      const latv = this.vel.x * rx2 + this.vel.z * rz2;
      const alongv = this.vel.x * Math.sin(s.a) + this.vel.z * Math.cos(s.a);
      const impact = Math.abs(latv);
      const bounce = impact > 4 ? 0.38 : 0.06;
      const scrub = impact > 4 ? 0.86 : 0.999;
      const newLat = -latv * bounce;
      const newAlong = alongv * scrub;
      this.vel.set(Math.sin(s.a) * newAlong + rx2 * newLat, 0, Math.cos(s.a) * newAlong + rz2 * newLat);
      this.vF = Math.max(-5, Math.min(this.vmax, newAlong));
      this.vL = newLat * (rx * rx2 + rz * rz2);
      if (impact > 3) {
        this.wallHit = 1;
        this.hitInfo = { x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z, nx: -rx2 * sign, nz: -rz2 * sign, force: impact };
      }
      // wall-kiss assist: rotate nose along the barrier so the car slides, never wedges
      const align = shortAngle(s.a - this.yaw) * (this.vF >= 0 ? 1 : -1);
      this.yaw += align * Math.min(1, dt * 3);
    }

    // height + attitude (grounded on elevated +0.08m road surface)
    this.pos.y = c.height + 0.08;
    const ahead = track.sampleAtArc(c.arc + 4), behind = track.sampleAtArc(c.arc - 4);
    const slope = (ahead.p.y - behind.p.y) / 8;
    const align = Math.cos(shortAngle(this.yaw - c.a));
    const targetPitch = -Math.atan(slope * align) * 0.9;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);
    const targetRoll = Math.max(-0.09, Math.min(0.09, omega * this.vF * 0.004)) ;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5);

    // drift state
    this.driftAmt = Math.min(1, Math.abs(this.vL) / 12);
    this.drifting = Math.abs(this.vL) > 4.2 && Math.abs(this.vF) > 8;

    // gear/rpm (for audio + hud)
    const sp = Math.abs(this.vF);
    const bands = [0, 9, 17, 27, 39, 54, 72, 92].map(b => b * this.vmax / 88);
    let g = 1;
    for (let i = 1; i < bands.length; i++) if (sp >= bands[i - 1]) g = i;
    const lo = bands[g - 1], hi = bands[g];
    const targetRpm = 0.18 + 0.82 * Math.min(1, (sp - lo) / (hi - lo));
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 7);
    this.gear = g;

    // lap tracking
    if (!this.finished) {
      if (this.prevT > 0.85 && c.t < 0.15 && this.vF > 1) {
        this.lap++;
        if (this.lap > 0 && this.raceTime > 0) {
          const lt = this.raceTime - this.lapStart;
          this.lapTimes.push(lt);
          if (lt < this.bestLap) this.bestLap = lt;
        }
        this.lapStart = this.raceTime;
        if (this.lap >= 3 && !this.finished) { this.finished = true; this.finishTime = this.raceTime; }
      } else if (this.prevT < 0.15 && c.t > 0.85 && this.vF < -1) {
        this.lap--;
      }
    }
    this.prevT = c.t;
    this.prog = this.lap + c.t;
    this.raceTime += dt;
    this.wallHit = Math.max(0, this.wallHit - dt * 3);
    this.wheelSpin += (this.vF / 0.36) * dt;
  }

  applyVisual(rig, dt) {
    rig.group.position.copy(this.pos);
    rig.group.rotation.y = this.yaw;
    rig.group.rotation.x = this.pitch;
    rig.group.rotation.z = this.roll;
    this.steerVis += (this.steer * 0.5 - this.steerVis) * Math.min(1, dt * 12);
    for (let i = 0; i < rig.wheels.length; i++) {
      const w = rig.wheels[i];
      const spin = w.userData.spin || w;
      spin.rotation.x = this.wheelSpin;
      if (i < 2) w.rotation.y = this.steerVis;
    }
    const braking = this.isPlayer ? this.inputBrake : false;
    if (rig.tail) rig.tail.material.emissiveIntensity = braking ? 6 : 1.2;
    rig.glow.material.opacity = this.nitroOn ? 0.38 : 0.0;
  }
}

/* ---------- AI ---------- */
export class AIDriver {
  constructor(car, skill, lane) {
    this.car = car;
    this.skill = skill;        // 0.88 .. 1.04
    this.lane = lane;          // preferred lateral offset
    this.laneTimer = 0;
    this.avoid = 0;
  }

  think(dt, track, cars) {
    const car = this.car;
    this.laneTimer -= dt;
    if (this.laneTimer < 0) { this.laneTimer = 4 + Math.random() * 5; this._laneTarget = (Math.random() * 2 - 1) * 3.2; }
    // avoid cars ahead
    let avoid = 0;
    for (const o of cars) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > 20 * 20) continue;
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const ahead = dx * fx + dz * fz;
      if (ahead < 1 || ahead > 16) continue;
      const latOff = dx * Math.cos(car.yaw) + dz * (-Math.sin(car.yaw));
      if (Math.abs(latOff - this.lane) < 2.2) avoid = latOff > this.lane ? -2.6 : 2.6;
      car.draft = ahead < 18 ? 1 : car.draft;
    }
    this.lane += ((this._laneTarget || 0) + avoid - this.lane) * Math.min(1, dt * 0.8);

    // steering: pure pursuit
    const lookArc = car.trackHint >= 0 ? track.samples[car.trackHint].arc : 0;
    const aheadDist = Math.min(58, 8 + Math.abs(car.vF) * 0.75);
    const target = track.sampleAtArc(lookArc + aheadDist);
    const right = new THREE.Vector3(Math.cos(target.a), 0, -Math.sin(target.a));
    const tp = target.p.clone().addScaledVector(right, this.lane);
    const dx = tp.x - car.pos.x, dz = tp.z - car.pos.z;
    const desired = Math.atan2(dx, dz);
    let steer = Math.max(-1, Math.min(1, shortAngle(desired - car.yaw) * 1.7));

    // target speed from curvature ahead
    let targetV = car.vmax * this.skill;
    let dist = 0;
    for (let d = 0; d < 130 && d < aheadDist + 130; d += 8) {
      const s = track.sampleAtArc(lookArc + d);
      const vc = Math.sqrt(24 * this.skill / Math.max(0.0018, s.curv));
      const vAllow = Math.sqrt(vc * vc + 2 * BRAKE * 0.85 * d);
      targetV = Math.min(targetV, vAllow);
    }
    // rubber-band vs player handled outside via skill mod
    let throttle = 0, brake = false;
    if (car.vF < targetV) throttle = car.vF < targetV - 1 ? 1 : 0.35;
    else if (car.vF > targetV + 2) brake = true;

    const straight = track.sampleAtArc(lookArc + 30).curv < 0.004 && track.sampleAtArc(lookArc + 60).curv < 0.006;
    const nitro = straight && car.nitro > 45 && car.vF > 20;

    return { throttle, brake, steer, nitro, hand: false };
  }
}
