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

/* High-rise tower facade matching the reference modern apartment / office tower:
   Precast concrete floor spandrels + dark window ribbons + warm glowing amber interior windows */
function skyscraperFacade(litDensity, seed = 1) {
  const [c, x] = canvas(512, 512);

  // Background: architectural dark mullion & spandrel tone
  x.fillStyle = '#10131b';
  x.fillRect(0, 0, 512, 512);

  const floors = 16, cols = 16;
  const floorH = 32, colW = 32;
  const slabH = 12, winH = 18;

  // Render 16 seamless floors
  for (let f = 0; f < floors; f++) {
    const fy = f * floorH;

    // 1. Precast Concrete Floor Spandrel Slab (light grey architectural slate)
    x.fillStyle = '#565d6c';
    x.fillRect(0, fy, 512, slabH);

    // Concrete bevel top highlight
    x.fillStyle = 'rgba(255, 255, 255, 0.18)';
    x.fillRect(0, fy, 512, 1.5);

    // Concrete mid panel texture
    x.fillStyle = 'rgba(255, 255, 255, 0.06)';
    x.fillRect(0, fy + 2, 512, slabH - 4);

    // Concrete bottom shadow groove
    x.fillStyle = 'rgba(10, 14, 22, 0.55)';
    x.fillRect(0, fy + slabH - 1.5, 512, 1.5);

    // Vertical precast concrete joint seams every 64px
    x.fillStyle = 'rgba(20, 24, 34, 0.4)';
    for (let jx = 0; jx < 512; jx += 64) {
      x.fillRect(jx, fy, 1.5, slabH);
    }

    // 2. Horizontal Window Ribbon Band
    const wy = fy + slabH;

    // Window frame recess shadow
    x.fillStyle = '#0c0f16';
    x.fillRect(0, wy, 512, winH);

    // Floor occupancy distribution: top 3 floors have much fewer lights (penthouse/mechanical)
    const floorOccupancy = f < 3 ? 0.20 : (f < 6 ? 0.45 : 0.60);

    for (let col = 0; col < cols; col++) {
      const wx = col * colW;
      const paneW = colW - 3; // 29px wide, 3px vertical mullion

      // Vertical dark metal mullion divider
      x.fillStyle = '#141822';
      x.fillRect(wx + paneW, wy, 3, winH);

      const isLit = Math.random() < litDensity * floorOccupancy;
      if (isLit) {
        // Exact warm golden amber glowing interior lighting from reference
        const amberTone = Math.random() < 0.65 ? '255, 182, 85' : (Math.random() < 0.5 ? '255, 155, 55' : '255, 210, 120');
        const bright = 0.88 + Math.random() * 0.12;

        x.fillStyle = `rgba(${amberTone}, ${bright})`;
        x.fillRect(wx + 1, wy + 1, paneW - 1, winH - 2);

        // Interior horizontal blinds / window mullion line
        x.fillStyle = 'rgba(20, 26, 38, 0.35)';
        x.fillRect(wx + 1, wy + 6, paneW - 1, 1.5);
        x.fillRect(wx + 1, wy + 11, paneW - 1, 1.5);

        // Warm light spill onto the concrete ledge below
        x.fillStyle = `rgba(${amberTone}, 0.22)`;
        x.fillRect(wx, wy + winH - 1, paneW, 2);
      } else {
        // Deep dark blue-grey/slate reflective glass
        x.fillStyle = '#181e2b';
        x.fillRect(wx + 1, wy + 1, paneW - 1, winH - 2);

        // Subtle sky reflection horizontal sheen
        x.fillStyle = 'rgba(180, 205, 240, 0.08)';
        x.fillRect(wx + 1, wy + 1, paneW - 1, 2);
      }
    }
  }

  return c;
}

/* Rooftop surface: dark gravel deck with perimeter parapet trim */
function roof() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#1e2129';
  x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 1200, 0.12);
  // Parapet concrete edge border
  x.strokeStyle = '#484d59';
  x.lineWidth = 12;
  x.strokeRect(6, 6, 244, 244);
  x.strokeStyle = '#2b2e38';
  x.lineWidth = 2;
  x.strokeRect(12, 12, 232, 232);
  return c;
}

/* Skyline for far silhouettes (seamless glowing city grid matching reference) */
function farFacade() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#0a0d14';
  x.fillRect(0, 0, 256, 256);

  const cols = 16, floors = 16;
  for (let f = 0; f < floors; f++) {
    // Concrete floor spandrel stripe
    x.fillStyle = 'rgba(86, 93, 108, 0.65)';
    x.fillRect(0, f * 16, 256, 5);

    // Warm amber window lights on lower & middle floors
    const litChance = f < 3 ? 0.18 : 0.48;
    for (let col = 0; col < cols; col++) {
      if (Math.random() < litChance) {
        x.fillStyle = Math.random() < 0.7 ? 'rgba(255, 182, 85, 0.95)' : 'rgba(255, 150, 50, 0.9)';
        x.fillRect(col * 16 + 2, f * 16 + 6, 12, 8);
      } else {
        x.fillStyle = 'rgba(24, 30, 42, 0.8)';
        x.fillRect(col * 16 + 2, f * 16 + 6, 12, 8);
      }
    }
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

export function makeTextures() {
  return {
    asphalt: toTex(asphalt(), { repeat: [1, 1] }),
    curb: toTex(curb(), { repeat: [1, 1] }),
    checker: toTex(checker()),
    facadeA: toTex(skyscraperFacade(0.55, 1), { repeat: [1, 1] }),
    facadeB: toTex(skyscraperFacade(0.42, 2), { repeat: [1, 1] }),
    facadeC: toTex(skyscraperFacade(0.65, 3), { repeat: [1, 1] }),
    facadeD: toTex(skyscraperFacade(0.35, 4), { repeat: [1, 1] }),
    roof: toTex(roof(), { repeat: [1, 1] }),
    far: toTex(farFacade(), { repeat: [1, 1] }),
    puff: toTex(puff()),
    streak: toTex(streak()),
    shadow: toTex(blob(), { srgb: false }),
    kidney: toTex(mesh(), { repeat: [2, 3] }),
    ground: toTex(grass(), { repeat: [160, 160] }),
    grassTuft: toTex(grassTuft()),
    pavement: toTex(pavement(), { repeat: [3, 3] }),
    sideRoad: toTex(sideRoad(), { repeat: [1, 6] }),
    startPanel: toTex(panel('NITRO APEX', '#0a0e18', '#00e5ff')),
    nameTag: nameTag,
  };
}
