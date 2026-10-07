/* Inspect a .glb: dump JSON chunk info (nodes, meshes, materials, animations, bounds) */
const fs = require('fs');
const file = process.argv[2];
const buf = fs.readFileSync(file);
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
if (magic !== 0x46546c67) { console.log('Not a GLB (magic ' + magic.toString(16) + ')'); process.exit(1); }
let off = 12;
let json = null, binLen = 0;
while (off < length) {
  const chunkLen = buf.readUInt32LE(off);
  const chunkType = buf.readUInt32LE(off + 4);
  if (chunkType === 0x4e4f534a) json = JSON.parse(buf.slice(off + 8, off + 8 + chunkLen).toString('utf8'));
  else if (chunkType === 0x004e4942) binLen = chunkLen;
  off += 8 + chunkLen;
}
console.log('GLB version', version, 'total', length, 'bin bytes', binLen);
console.log('--- nodes (', (json.nodes || []).length, ') ---');
(json.nodes || []).forEach((n, i) => {
  const t = n.translation ? n.translation.map(v => +v.toFixed(2)).join(',') : '';
  const s = n.scale ? n.scale.map(v => +v.toFixed(2)).join(',') : '';
  console.log(i, JSON.stringify(n.name || '(unnamed)'), 'mesh:' + (n.mesh ?? '-'), 'T[' + t + ']', 'S[' + s + ']', n.rotation ? 'ROT' : '');
});
console.log('--- meshes (', (json.meshes || []).length, ') ---');
(json.meshes || []).forEach((m, i) => console.log(i, JSON.stringify(m.name || '(unnamed)'), 'prims:' + m.primitives.length));
console.log('--- materials (', (json.materials || []).length, ') ---');
(json.materials || []).forEach((m, i) => console.log(i, JSON.stringify(m.name || '(unnamed)')));
console.log('--- animations (', (json.animations || []).length, ') ---');
(json.animations || []).forEach((a, i) => console.log(i, JSON.stringify(a.name || '(unnamed)'), 'channels:' + a.channels.length));
console.log('--- textures/images (', (json.images || []).length, ') ---');
(json.images || []).forEach((im, i) => console.log(i, JSON.stringify(im.name || im.uri || '(embedded)'), im.mimeType || ''));
console.log('--- scene graph (roots) ---');
(json.scenes || []).forEach(s => console.log('scene', JSON.stringify(s.name || ''), 'roots:', JSON.stringify(s.nodes)));
// accessor bounds for position data to estimate model size
const acc = json.accessors || [];
let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
const meshes = json.meshes || [];
for (const m of meshes) for (const p of m.primitives) {
  const a = acc[p.attributes.POSITION];
  if (a && a.min && a.max) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], a.min[k]); max[k] = Math.max(max[k], a.max[k]); }
  }
}
console.log('--- raw position bounds (pre-node-transform, min) ---');
console.log(min.map(v => v.toFixed(2)).join(', '), '  max:', max.map(v => v.toFixed(2)).join(', '));
console.log('    size:', max.map((v, k) => (v - min[k]).toFixed(2)).join(' x '));
