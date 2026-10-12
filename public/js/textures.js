/* Procedural canvas textures — no external assets needed */
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { srgb = true, repeat = null, wrap = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap || repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  if (repeat) {
    t.repeat.set(repeat[0], repeat[1]);
  }
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

/* Ultra-Realistic Road: 1024x1024 dark volcanic mineral aggregate, racing rubber grooves, thermoplastic paint, asphalt seams */
function asphalt() {
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  // Rich dark bituminous asphalt base
  x.fillStyle = '#1a1c21';
  x.fillRect(0, 0, W, H);

  // Multi-frequency mineral aggregate noise (crushed granite, basalt, slate)
  noise(x, W, H, 28000, 0.18);
  for (let i = 0; i < 7000; i++) {
    const v = (130 + Math.random() * 85) | 0;
    x.fillStyle = `rgba(${v},${v + 4},${v + 8},0.13)`;
    x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  // Polished rubber racing groove in both driving lines
  const groove = x.createLinearGradient(0, 0, W, 0);
  groove.addColorStop(0, 'rgba(0,0,0,0)');
  groove.addColorStop(0.12, 'rgba(8,9,12,0.48)');
  groove.addColorStop(0.36, 'rgba(8,9,12,0.52)');
  groove.addColorStop(0.46, 'rgba(0,0,0,0)');
  groove.addColorStop(0.56, 'rgba(8,9,12,0.52)');
  groove.addColorStop(0.82, 'rgba(8,9,12,0.48)');
  groove.addColorStop(0.96, 'rgba(0,0,0,0)');
  x.fillStyle = groove;
  x.fillRect(0, 0, W, H);

  // Dynamic curved braking/skid marks from high-speed racing
  x.strokeStyle = 'rgba(10,12,15,0.35)';
  x.lineWidth = 16;
  x.beginPath();
  x.moveTo(W * 0.24, 0);
  x.bezierCurveTo(W * 0.27, H * 0.35, W * 0.23, H * 0.75, W * 0.26, H);
  x.stroke();
  x.beginPath();
  x.moveTo(W * 0.72, 0);
  x.bezierCurveTo(W * 0.70, H * 0.32, W * 0.75, H * 0.68, W * 0.73, H);
  x.stroke();

  // Solid white outer boundary lines (retroreflective thermoplastic with aggregate micro-bleed)
  x.fillStyle = 'rgba(242,244,248,0.92)';
  x.fillRect(22, 0, 18, H);
  x.fillRect(W - 40, 0, 18, H);
  noise(x, 48, H, 1200, 0.22);

  // Dashed center lane divider with clean thermoplastic relief
  x.fillStyle = 'rgba(246,248,252,0.90)';
  const dashLen = 140, dashGap = 160;
  for (let y = 0; y < H; y += dashLen + dashGap) {
    x.fillRect((W / 2 - 8) | 0, y, 16, dashLen);
  }

  // Bitumen crack repair seams
  x.strokeStyle = 'rgba(12,14,18,0.5)';
  x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(80, 40); x.lineTo(160, 260); x.lineTo(110, 520); x.stroke();
  x.beginPath(); x.moveTo(W - 90, 480); x.lineTo(W - 140, 720); x.lineTo(W - 100, 960); x.stroke();

  return c;
}

/* Tangent-space Normal Map for realistic asphalt stone bumpiness & raised line markings */
function asphaltNormal() {
  const W = 512, H = 512;
  const [c, x] = canvas(W, H);
  const img = x.createImageData(W, H);
  const d = img.data;
  const h = new Float32Array(W * H);

  // Micro-stone height noise
  for (let i = 0; i < W * H; i++) {
    h[i] = Math.random() * 0.42;
  }
  // Coarse aggregate pebbles
  for (let i = 0; i < 4500; i++) {
    const px = (Math.random() * W) | 0, py = (Math.random() * H) | 0;
    const rad = 2 + (Math.random() * 3) | 0;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= rad * rad) {
          const x0 = (px + dx + W) % W, y0 = (py + dy + H) % H;
          h[y0 * W + x0] += (1 - Math.sqrt(d2) / rad) * 0.4;
        }
      }
    }
  }
  // Thermoplastic paint markings sit slightly raised (+2mm)
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x0 = 10; x0 <= 20; x0++) h[row + x0] += 0.28;
    for (let x0 = W - 20; x0 <= W - 10; x0++) h[row + x0] += 0.28;
    if (y % 150 < 70) {
      for (let x0 = (W / 2 - 4) | 0; x0 <= (W / 2 + 4) | 0; x0++) h[row + x0] += 0.28;
    }
  }

  // Sobel tangent-space normal computation
  const str = 2.4;
  for (let y = 0; y < H; y++) {
    const ym = (y - 1 + H) % H * W, y0 = y * W, yp = (y + 1) % H * W;
    for (let px = 0; px < W; px++) {
      const xm = (px - 1 + W) % W, xp = (px + 1) % W;
      const dzx = (h[y0 + xp] - h[y0 + xm]) * str;
      const dzy = (h[yp + px] - h[ym + px]) * str;
      const len = Math.sqrt(dzx * dzx + dzy * dzy + 1.0);
      const nx = -dzx / len, ny = -dzy / len, nz = 1.0 / len;
      const idx = (y0 + px) * 4;
      d[idx] = ((nx * 0.5 + 0.5) * 255) | 0;
      d[idx + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
      d[idx + 2] = ((nz * 0.5 + 0.5) * 255) | 0;
      d[idx + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/* Specular Roughness Map: rubber tracks are polished & semi-glossy, stone is rough */
function asphaltRoughness() {
  const W = 256, H = 256;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#dedede'; // base rough stone (~0.87)
  x.fillRect(0, 0, W, H);
  // Polished rubber racing line grooves (~0.52 roughness)
  x.fillStyle = 'rgba(75,75,75,0.58)';
  x.fillRect(W * 0.16, 0, W * 0.24, H);
  x.fillRect(W * 0.58, 0, W * 0.24, H);
  // Paint lines (~0.60 roughness)
  x.fillStyle = 'rgba(95,95,95,0.35)';
  x.fillRect(5, 0, 6, H);
  x.fillRect(W - 11, 0, 6, H);
  return c;
}

/* FIA Red/white curb stripes with bevel shading, dirt accumulation and tire scuffs */
function curb() {
  const [c, x] = canvas(128, 256);
  for (let y = 0; y < 256; y += 64) {
    // White curb block
    x.fillStyle = '#e8ecf2'; x.fillRect(0, y, 128, 32);
    // Red curb block
    x.fillStyle = '#c51624'; x.fillRect(0, y + 32, 128, 32);
    // Block separation joint shadow
    x.fillStyle = 'rgba(10,12,16,0.55)';
    x.fillRect(0, y, 128, 3);
    x.fillRect(0, y + 32, 128, 3);
  }
  // Black rubber tire scuffs from racing apex clips
  for (let i = 0; i < 24; i++) {
    const sy = Math.random() * 256;
    x.fillStyle = 'rgba(12,14,18,0.45)';
    x.fillRect(Math.random() * 80, sy, 20 + Math.random() * 40, 2 + Math.random() * 4);
  }
  noise(x, 128, 256, 1200, 0.14);
  return c;
}

/* Galvanized steel for Armco W-beam crash barriers with zinc crystallization & reflectors */
function galvanized() {
  const [c, x] = canvas(512, 128);
  x.fillStyle = '#949ba4';
  x.fillRect(0, 0, 512, 128);
  // Zinc spangle crystalline grain
  for (let i = 0; i < 4000; i++) {
    const v = (130 + Math.random() * 80) | 0;
    x.fillStyle = `rgba(${v},${v + 2},${v + 4},0.24)`;
    x.fillRect(Math.random() * 512, Math.random() * 128, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  // Corrugated horizontal depth shading (W-beam waves)
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(40,45,50,0.4)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.35, 'rgba(25,30,35,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.65, 'rgba(25,30,35,0.55)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(40,45,50,0.4)');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 128);

  // Amber retroreflective safety markers spaced along the rail
  for (let px = 64; px < 512; px += 128) {
    x.fillStyle = '#ff7b00';
    x.fillRect(px - 5, 56, 10, 16);
    x.fillStyle = 'rgba(255,255,255,0.65)';
    x.fillRect(px - 3, 58, 6, 3);
  }
  return c;
}

/* FIA Motorsport Diamond Chainlink Catch Fence with galvanized steel wire & tension cables */
function chainlink() {
  const [c, x] = canvas(128, 128);
  x.clearRect(0, 0, 128, 128);
  // Steel horizontal tension cables
  x.strokeStyle = '#606772';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(0, 6); x.lineTo(128, 6);
  x.moveTo(0, 64); x.lineTo(128, 64);
  x.moveTo(0, 122); x.lineTo(128, 122);
  x.stroke();
  // Diamond wire mesh
  x.strokeStyle = '#b0b7c2';
  x.lineWidth = 1.6;
  const step = 16;
  for (let i = -128; i < 256; i += step) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke();
    x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke();
  }
  return c;
}

/* Soft feathered radial glow for car underglow and lights (zero box borders) */
function softGlow() {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
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

/* Lush green grass meadow with blade noise, organic clumping, and wildflower flecks */
function grass() {
  const [c, x] = canvas(512, 512);
  // Rich natural meadow green base
  x.fillStyle = '#21421c';
  x.fillRect(0, 0, 512, 512);

  // Organic clumping in lighter and deeper forest tones
  for (let i = 0; i < 450; i++) {
    const rx = Math.random() * 512, ry = Math.random() * 512;
    const rad = 8 + Math.random() * 34;
    const g = x.createRadialGradient(rx, ry, 0, rx, ry, rad);
    const col = Math.random() < 0.55 ? 'rgba(44, 92, 38, 0.5)' : (Math.random() < 0.5 ? 'rgba(56, 115, 48, 0.4)' : 'rgba(24, 46, 20, 0.55)');
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(rx, ry, rad, 0, Math.PI * 2); x.fill();
  }

  // Fine grass blade noise
  for (let i = 0; i < 28000; i++) {
    const bx = Math.random() * 512, by = Math.random() * 512;
    const len = 3 + Math.random() * 6;
    const angle = (Math.random() - 0.5) * 0.8 - Math.PI / 2;
    const green = 65 + ((Math.random() * 70) | 0);
    const red = 28 + ((Math.random() * 32) | 0);
    const blue = 20 + ((Math.random() * 25) | 0);
    x.strokeStyle = `rgba(${red},${green},${blue},0.55)`;
    x.lineWidth = 1 + Math.random();
    x.beginPath();
    x.moveTo(bx, by);
    x.lineTo(bx + Math.cos(angle) * len, by + Math.sin(angle) * len);
    x.stroke();
  }

  // Soft clover / wildflower accents
  for (let i = 0; i < 80; i++) {
    x.fillStyle = Math.random() < 0.7 ? 'rgba(235, 215, 75, 0.75)' : 'rgba(245, 245, 245, 0.65)';
    x.beginPath();
    x.arc(Math.random() * 512, Math.random() * 512, 1.5, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

/* 3D Grass tuft sprite with realistic alpha-blended grass blade clusters */
function grassTuft() {
  const [c, x] = canvas(128, 128);
  x.clearRect(0, 0, 128, 128);

  for (let i = 0; i < 24; i++) {
    const spread = (i / 23 - 0.5) * 1.6;
    const h = 76 + Math.random() * 46;
    const bend = spread * (20 + Math.random() * 25);
    const tipX = 64 + spread * 55 + bend;
    const tipY = 126 - h;
    const ctrlX = 64 + spread * 28;
    const ctrlY = 126 - h * 0.55;

    const g = x.createLinearGradient(64, 126, tipX, tipY);
    g.addColorStop(0, 'rgba(20, 48, 18, 0.95)');
    g.addColorStop(0.4, 'rgba(48, 105, 42, 0.9)');
    g.addColorStop(0.85, 'rgba(78, 155, 62, 0.85)');
    g.addColorStop(1, 'rgba(115, 195, 88, 0.8)');

    x.strokeStyle = g;
    x.lineWidth = 3.6 - Math.abs(spread) * 1.5;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(64 + (i - 12) * 1.5, 126);
    x.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
    x.stroke();
  }
  return c;
}

/* Concrete pedestrian pavement / sidewalk */
function pavement() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#5c636f';
  x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 8000, 0.15);
  x.strokeStyle = 'rgba(24, 28, 36, 0.55)';
  x.lineWidth = 3;
  x.strokeRect(1, 1, 254, 254);
  x.beginPath(); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.stroke();
  return c;
}

/* City cross street / side road asphalt */
function sideRoad() {
  const [c, x] = canvas(256, 512);
  x.fillStyle = '#22252a';
  x.fillRect(0, 0, 256, 512);
  noise(x, 256, 512, 6000, 0.15);
  // Edge white lines
  x.fillStyle = 'rgba(230,230,230,0.85)';
  x.fillRect(8, 0, 6, 512);
  x.fillRect(242, 0, 6, 512);
  // Yellow center double line
  x.fillStyle = 'rgba(235,185,40,0.85)';
  x.fillRect(124, 0, 3, 512);
  x.fillRect(129, 0, 3, 512);
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

/* High-tech Neon Booster / Speed Pad Texture (512x512) */
function boosterPad() {
  const [c, x] = canvas(512, 512);
  // Dark carbon-fiber base with glowing cyan borders
  x.fillStyle = '#060a12';
  x.fillRect(0, 0, 512, 512);

  // Carbon grid weave
  x.strokeStyle = 'rgba(0, 229, 255, 0.12)';
  x.lineWidth = 2;
  for (let i = 0; i < 512; i += 32) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
  }

  // Neon speed rails on lateral edges
  const railG = x.createLinearGradient(0, 0, 48, 0);
  railG.addColorStop(0, '#00e5ff'); railG.addColorStop(1, 'rgba(0,229,255,0)');
  x.fillStyle = railG; x.fillRect(0, 0, 48, 512);
  const railR = x.createLinearGradient(512, 0, 464, 0);
  railR.addColorStop(0, '#00e5ff'); railR.addColorStop(1, 'rgba(0,229,255,0)');
  x.fillStyle = railR; x.fillRect(464, 0, 48, 512);

  // 3 forward glowing neon chevron arrows (Asphalt/F-Zero style)
  const drawChevron = (cy, color, glow) => {
    x.shadowColor = glow;
    x.shadowBlur = 24;
    x.fillStyle = color;
    x.beginPath();
    // Arrow pointing up (+V direction = forward along track)
    x.moveTo(256, cy - 65);
    x.lineTo(440, cy + 30);
    x.lineTo(395, cy + 55);
    x.lineTo(256, cy - 15);
    x.lineTo(117, cy + 55);
    x.lineTo(72, cy + 30);
    x.closePath();
    x.fill();
    x.shadowBlur = 0;
  };

  drawChevron(120, '#00e5ff', '#00f7ff');
  drawChevron(260, '#ffaa00', '#ffd000');
  drawChevron(400, '#00e5ff', '#00f7ff');

  // Side warning hazard diagonal stripes
  x.fillStyle = 'rgba(255, 214, 0, 0.85)';
  for (let y = 0; y < 512; y += 64) {
    x.fillRect(8, y, 16, 28);
    x.fillRect(488, y, 16, 28);
  }

  return c;
}

export function makeTextures() {
  return {
    asphalt: toTex(asphalt(), { repeat: [1, 1], aniso: 16 }),
    asphaltNormal: toTex(asphaltNormal(), { srgb: false, repeat: [1, 1], aniso: 16 }),
    asphaltRoughness: toTex(asphaltRoughness(), { srgb: false, repeat: [1, 1], aniso: 16 }),
    curb: toTex(curb(), { repeat: [1, 1], aniso: 8 }),
    galvanized: toTex(galvanized(), { repeat: [1, 1], aniso: 8 }),
    chainlink: toTex(chainlink(), { repeat: [4, 16], aniso: 8 }),
    softGlow: toTex(softGlow(), { srgb: false }),
    checker: toTex(checker()),
    puff: toTex(puff()),
    streak: toTex(streak()),
    shadow: toTex(blob(), { srgb: false }),
    kidney: toTex(mesh(), { repeat: [2, 3] }),
    ground: toTex(grass(), { repeat: [160, 160] }),
    grassTuft: toTex(grassTuft()),
    pavement: toTex(pavement(), { repeat: [3, 3] }),
    sideRoad: toTex(sideRoad(), { repeat: [1, 6] }),
    startPanel: toTex(panel('NITRO APEX', '#0a0e18', '#00e5ff')),
    booster: toTex(boosterPad(), { repeat: [1, 1], wrap: true }),
    nameTag: nameTag,
  };
}
