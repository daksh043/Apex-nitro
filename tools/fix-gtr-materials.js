const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dir = path.join(__dirname, '..', 'public', 'models', 'nissan_gtr');
const gltfPath = path.join(dir, 'scene.gltf');
const fixedGltfPath = path.join(dir, 'scene_fixed.gltf');
const glbPath = path.join(dir, 'gtr.glb');

const json = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));

// Remove specular-glossiness extension requirements
json.extensionsUsed = (json.extensionsUsed || []).filter(e => e !== 'KHR_materials_pbrSpecularGlossiness');
json.extensionsRequired = (json.extensionsRequired || []).filter(e => e !== 'KHR_materials_pbrSpecularGlossiness');

json.materials.forEach((m, idx) => {
  const sg = m.extensions?.KHR_materials_pbrSpecularGlossiness;
  const name = m.name || '';
  
  const pbr = {};
  
  if (sg?.diffuseTexture) {
    pbr.baseColorTexture = { ...sg.diffuseTexture };
  }
  
  // Specific tuning by material name
  if (/paint$/i.test(name)) {
    // Main Nismo body paint
    pbr.baseColorFactor = [0.95, 0.95, 0.96, 1.0];
    pbr.roughnessFactor = 0.18;
    pbr.metallicFactor = 0.35;
  } else if (/paint_red/i.test(name)) {
    // Iconic Nismo red aero accents (splitters, sills, diffuser strip)
    pbr.baseColorFactor = [0.88, 0.04, 0.04, 1.0];
    pbr.roughnessFactor = 0.25;
    pbr.metallicFactor = 0.2;
  } else if (/paint_chrome/i.test(name)) {
    pbr.baseColorFactor = [0.92, 0.92, 0.92, 1.0];
    pbr.roughnessFactor = 0.1;
    pbr.metallicFactor = 0.95;
  } else if (/paint_aluminum/i.test(name)) {
    pbr.baseColorFactor = [0.8, 0.8, 0.82, 1.0];
    pbr.roughnessFactor = 0.25;
    pbr.metallicFactor = 0.85;
  } else if (/paint_plastic/i.test(name)) {
    pbr.baseColorFactor = [0.1, 0.1, 0.1, 1.0];
    pbr.roughnessFactor = 0.6;
    pbr.metallicFactor = 0.05;
  } else if (/windows/i.test(name)) {
    pbr.baseColorFactor = [0.08, 0.08, 0.10, 0.65];
    pbr.roughnessFactor = 0.05;
    pbr.metallicFactor = 0.1;
    m.alphaMode = 'BLEND';
    m.doubleSided = true;
  } else if (/gauge_glass/i.test(name)) {
    pbr.baseColorFactor = [0.2, 0.2, 0.25, 0.4];
    pbr.roughnessFactor = 0.05;
    pbr.metallicFactor = 0.1;
    m.alphaMode = 'BLEND';
  } else if (/rim/i.test(name)) {
    // Nismo alloy rims
    pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
    pbr.roughnessFactor = 0.25;
    pbr.metallicFactor = 0.75;
  } else if (/carbon/i.test(name)) {
    pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
    pbr.roughnessFactor = 0.35;
    pbr.metallicFactor = 0.1;
  } else if (/lights/i.test(name)) {
    pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
    pbr.roughnessFactor = 0.15;
    pbr.metallicFactor = 0.1;
  } else if (/disc/i.test(name)) {
    pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
    pbr.roughnessFactor = 0.3;
    pbr.metallicFactor = 0.8;
  } else if (/badges|licplate|tread|tire|cockpit|misc/i.test(name)) {
    pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
    pbr.roughnessFactor = /tire|tread/i.test(name) ? 0.85 : 0.5;
    pbr.metallicFactor = 0.05;
  } else {
    // Default interior / alcantara
    pbr.baseColorFactor = pbr.baseColorTexture ? [1.0, 1.0, 1.0, 1.0] : [0.12, 0.12, 0.12, 1.0];
    pbr.roughnessFactor = 0.75;
    pbr.metallicFactor = 0.05;
  }
  
  delete m.extensions?.KHR_materials_pbrSpecularGlossiness;
  if (m.extensions && Object.keys(m.extensions).length === 0) delete m.extensions;
  
  m.pbrMetallicRoughness = pbr;
});

fs.writeFileSync(fixedGltfPath, JSON.stringify(json, null, 2));
console.log('Wrote', fixedGltfPath);

// Now compile with gltfpack preserving materials and nodes, with floating-point UVs (-vtf)
execSync(`npx --yes gltfpack -vtf -kn -km -i "${fixedGltfPath}" -o "${glbPath}"`, { stdio: 'inherit' });
console.log('Successfully created', glbPath);
