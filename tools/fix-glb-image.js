/* Repair a GLB whose material references a texture image that was never
   embedded (no uri, no bufferView, no image data in the binary):
   strip the broken texture refs and apply brand colors instead.
   Usage: node fix-glb-image.js <file.glb> */
const fs = require('fs');
const file = process.argv[2];
const buf = fs.readFileSync(file);

// --- parse GLB structure ---
if (buf.readUInt32LE(0) !== 0x46546c67) { console.log('NOT_GLB'); process.exit(1); }
const total = buf.readUInt32LE(8);
let off = 12, json = null, binData = null, binLen = 0;
while (off < total) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  if (type === 0x4e4f534a) json = JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8'));
  else if (type === 0x004e4942) { binData = buf.slice(off + 8, off + 8 + len); binLen = len; }
  off += 8 + len;
}
if (!json) { console.log('MISSING_JSON'); process.exit(1); }

// --- which images are broken (no uri, no bufferView)? ---
const brokenImages = new Set();
(json.images || []).forEach((im, i) => {
  if (im.uri === undefined && im.bufferView === undefined) brokenImages.add(i);
});
console.log('broken images:', [...brokenImages].join(', ') || 'none');
if (!brokenImages.size) { console.log('NOTHING_TO_FIX'); process.exit(0); }

// double-check: no PNG/WebP/JPEG signature anywhere in the binary chunk
const SIGS = [
  ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['webp', null], // RIFF....WEBP checked below
  ['jpeg', [0xff, 0xd8, 0xff]],
];
let found = null;
if (binData) {
  outer:
  for (let i = 0; i + 12 < binData.length; i++) {
    if (binData[i] === 0x89 && binData[i + 1] === 0x50 && binData[i + 2] === 0x4e && binData[i + 3] === 0x47) { found = ['png', i]; break; }
    if (binData[i] === 0x52 && binData[i + 1] === 0x49 && binData[i + 2] === 0x46 && binData[i + 3] === 0x46 &&
        binData[i + 8] === 0x57 && binData[i + 9] === 0x45 && binData[i + 10] === 0x42 && binData[i + 11] === 0x50) { found = ['webp', i]; break; }
    if (binData[i] === 0xff && binData[i + 1] === 0xd8 && binData[i + 2] === 0xff) { found = ['jpeg', i]; break; }
  }
}
if (found) {
  console.log('image data FOUND in binary (' + found[0] + ' at ' + found[1] + ') — wiring it instead');
  json.bufferViews = json.bufferViews || [];
  let at = found[1];
  // find the containing bufferView offset semantics: bufferViews are relative to the bin chunk start
  const bvIndex = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: binData.length - at });
  (json.images || []).forEach((im, i) => {
    if (brokenImages.has(i)) { im.bufferView = bvIndex; delete im.uri; }
  });
} else {
  console.log('no embedded image data — stripping texture refs, applying brand colors');
  // brand colors by material name (KFC pack: red sign, beige building)
  const BRAND = {
    kfc: [
      { match: /sign/i, color: [0.894, 0.0, 0.169, 1] },   // KFC red
      { match: /main/i, color: [0.93, 0.89, 0.82, 1] },    // warm beige
    ],
  };
  const isKfc = /kfc/i.test(file);
  const brand = isKfc ? BRAND.kfc : [];
  (json.materials || []).forEach((mat) => {
    const hit = brand.find(b => b.match.test(mat.name || ''));
    const pbr = mat.pbrMetallicRoughness;
    if (!pbr) return;
    if (pbr.baseColorTexture) {
      const tex = (json.textures || [])[pbr.baseColorTexture.index];
      const img = tex && (json.images || [])[tex.source];
      if (img && brokenImages.has(tex.source)) {
        delete pbr.baseColorTexture;
        if (hit) pbr.baseColorFactor = hit.color;
        else if (!pbr.baseColorFactor) pbr.baseColorFactor = [0.8, 0.8, 0.8, 1];
      }
    }
  });
}

// --- rebuild the GLB ---
const jsonStr = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = (4 - (jsonStr.length % 4)) % 4;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonStr.length + jsonPad + 8 + binLen, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(jsonStr.length + jsonPad, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(binLen, 0);
bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(file, Buffer.concat([header, jh, jsonStr, Buffer.alloc(jsonPad, 0x20), bh, binData]));
console.log('FIXED', file);
