/* Procedural canvas textures — no external assets needed */
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  return t;
}

function noise(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = (Math.random() * 60) | 0;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/* Road: dark asphalt + lane markings. U spans road width, V along track. */
function asphalt() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#26282f'; x.fillRect(0, 0, 512, 512);
  noise(x, 512, 512, 9000, 0.14);
  // faint tire-worn darker bands in lane centers
  x.fillStyle = 'rgba(0,0,0,0.12)';
  x.fillRect(110, 0, 70, 512); x.fillRect(330, 0, 70, 512);
  // edge white lines
  x.fillStyle = 'rgba(235,235,235,0.85)';
  x.fillRect(10, 0, 7, 512); x.fillRect(495, 0, 7, 512);
  // dashed lane divider
  x.fillStyle = 'rgba(240,240,240,0.75)';
  for (let y = 0; y < 512; y += 128) x.fillRect(253, y, 6, 70);
  // occasional crack
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(60, 20); x.lineTo(90, 160); x.lineTo(70, 300); x.stroke();
  return c;
}

/* Red/white curb stripes, V along track */
function curb() {
  const [c, x] = canvas(64, 256);
  for (let y = 0; y < 256; y += 64) {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, y, 64, 64);
    x.fillStyle = '#c03030'; x.fillRect(0, y + 32, 64, 32);
  }
  noise(x, 64, 256, 400, 0.1);
  return c;
}

/* Checkered start line */
function checker() {
  const [c, x] = canvas(256, 64);
  const s = 32;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
    x.fillStyle = (i + j) % 2 ? '#111' : '#eee';
    x.fillRect(i * s, j * s, s, s);
  }
  return c;
}

/* Building facade: window grid, some lit. warm/cool variants */
function facade(litRatio, warm) {
  const [c, x] = canvas(128, 256);
  x.fillStyle = '#10131c'; x.fillRect(0, 0, 128, 256);
  const cw = 16, ch = 12, gx = 4, gy = 8;
  for (let wy = 6; wy < 244; wy += ch + gy) {
    for (let wx = 6; wx < 118; wx += cw + gx) {
      const lit = Math.random() < litRatio;
      if (lit) {
        const hue = Math.random() < warm ? '255,170,90' : '130,190,255';
        const b = 0.55 + Math.random() * 0.45;
        x.fillStyle = `rgba(${hue},${b})`;
      } else {
        x.fillStyle = 'rgba(40,50,70,0.5)';
      }
      x.fillRect(wx, wy, cw, ch);
    }
  }
  // floor slabs
  x.fillStyle = 'rgba(255,255,255,0.05)';
  for (let wy = 0; wy < 256; wy += ch + gy) x.fillRect(0, wy - 2, 128, 2);
  return c;
}

/* Skyline for far silhouettes (mostly dark, sparse lights) */
function farFacade() {
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#0a0c14'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = Math.random() < 0.75 ? 'rgba(120,150,220,0.5)' : 'rgba(255,170,90,0.6)';
    x.fillRect(8 + Math.random() * 112, 8 + Math.random() * 110, 3, 4);
  }
  return c;
}

/* Soft round particle sprite (smoke / glow) */
function puff() {
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return c;
}

/* Soft elliptical contact shadow under the car */
function blob() {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.52)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return c;
}

/* Streak sprite for speed lines / nitro flame core */
function streak() {
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  // elongate
  const [c2, x2] = canvas(64, 64);
  x2.drawImage(c, 8, 0, 48, 64);
  return c2;
}

/* Dark crosshatch mesh for kidney grilles */
function mesh() {
  const [c, x] = canvas(64, 64);
  x.fillStyle = '#0a0b0d'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(140,146,158,0.45)'; x.lineWidth = 2;
  for (let i = -64; i < 128; i += 9) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke();
    x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke();
  }
  return c;
}

/* Subtle ground dirt */
function ground() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#0e0f13'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 5000, 0.12);
  return c;
}

/* Metal panel for gantry */
function panel(text, bg, fg) {
  const [c, x] = canvas(512, 128);
  x.fillStyle = bg; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(6, 6, 500, 116);
  x.font = 'italic 900 72px Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = fg; x.fillText(text, 256, 70);
  return c;
}

/* Name tag above cars */
function nameTag(name, colorCss) {
  const [c, x] = canvas(256, 64);
  x.font = 'bold 34px Arial, sans-serif';
  const w = Math.min(246, x.measureText(name).width + 30);
  x.fillStyle = 'rgba(8,10,18,0.72)';
  x.beginPath(); x.roundRect((256 - w) / 2, 8, w, 46, 12); x.fill();
  x.strokeStyle = colorCss; x.lineWidth = 3;
  x.beginPath(); x.roundRect((256 - w) / 2, 8, w, 46, 12); x.stroke();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name, 128, 32);
  return c;
}

export function makeTextures() {
  return {
    asphalt: toTex(asphalt(), { repeat: [1, 1] }),
    curb: toTex(curb(), { repeat: [1, 1] }),
    checker: toTex(checker()),
    facadeA: toTex(facade(0.5, true)),
    facadeB: toTex(facade(0.35, false)),
    facadeC: toTex(facade(0.62, true)),
    facadeD: toTex(facade(0.15, false)),
    far: toTex(farFacade()),
    puff: toTex(puff()),
    streak: toTex(streak()),
    shadow: toTex(blob(), { srgb: false }),
    kidney: toTex(mesh(), { repeat: [2, 3] }),
    ground: toTex(ground(), { repeat: [160, 160] }),
    startPanel: toTex(panel('NITRO APEX', '#0a0e18', '#00e5ff')),
    nameTag: nameTag,
  };
}
