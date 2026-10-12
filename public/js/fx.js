/* Nitro Apex — particles, skid marks, nitro flames, post FX */
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------- generic particle pool (THREE.Points) ---------- */
class Pool {
  constructor(scene, max, tex, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.fadeExp = new Float32Array(max);
    this.head = 0; this.alive = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
        void main(){
          vC = color; vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vC, vA) * t;
        }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.geometry = g;
    scene.add(this.points);
  }

  spawn(p, v, o) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    const c = o.color;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = o.size; this.alpha[i] = o.alpha ?? 1;
    this.life[i] = this.life0[i] = o.life;
    this.grow[i] = o.grow ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.fadeExp[i] = o.fadeExp ?? 1.4;
  }

  update(dt) {
    const { pos, vel, life, life0, alpha, size, grow, grav, fadeExp, max } = this;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      vel[i * 3 + 1] += grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const lr = Math.max(0, life[i] / life0[i]);
      alpha[i] = Math.pow(lr, fadeExp[i]);
      if (grow[i]) size[i] += grow[i] * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}

/* ---------- skid marks ---------- */
class SkidMarks {
  constructor(scene, max = 500) {
    this.max = max;
    this.head = 0;
    this.last = new Map(); // carKey -> {l:Vector3, r:Vector3} previous edge
    this.birth = new Float32Array(max).fill(-99);
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(max * 4 * 3);
    this.colA = new Float32Array(max * 4 * 4);
    const idx = [];
    for (let i = 0; i < max; i++) {
      const b = i * 4;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colA, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.geometry = g;
    this.time = 0;
  }

  /* two wheel contact points this frame */
  add(key, l, r) {
    const prev = this.last.get(key);
    if (!prev) { this.last.set(key, { l: l.clone(), r: r.clone() }); return; }
    const d = prev.l.distanceTo(l) + prev.r.distanceTo(r);
    if (d < 0.35) return;
    if (d > 4) { this.last.set(key, { l: l.clone(), r: r.clone() }); return; } // teleport
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const P = this.posA, b = i * 12;
    P[b] = prev.l.x; P[b + 1] = prev.l.y; P[b + 2] = prev.l.z;
    P[b + 3] = prev.r.x; P[b + 4] = prev.r.y; P[b + 5] = prev.r.z;
    P[b + 6] = l.x; P[b + 7] = l.y; P[b + 8] = l.z;
    P[b + 9] = r.x; P[b + 10] = r.y; P[b + 11] = r.z;
    for (let k = 0; k < 4; k++) {
      const c = i * 16 + k * 4;
      this.colA[c] = 1; this.colA[c + 1] = 1; this.colA[c + 2] = 1; this.colA[c + 3] = 0.55;
    }
    this.birth[i] = this.time;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.last.set(key, { l: l.clone(), r: r.clone() });
  }

  clear(key) { this.last.delete(key); }

  update(dt) {
    this.time += dt;
    const fadeStart = 5, fadeEnd = 8;
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      const age = this.time - this.birth[i];
      if (age < fadeStart) continue;
      const a = Math.max(0, 1 - (age - fadeStart) / (fadeEnd - fadeStart)) * 0.55;
      for (let k = 0; k < 4; k++) {
        this.colA[i * 16 + k * 4 + 3] = a;
      }
      dirty = true;
    }
    if (dirty) this.geometry.attributes.color.needsUpdate = true;
  }
}

/* ---------- post-processing (bloom + speed warp + vignette) ---------- */
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },     // 0..1
    uNitro: { value: 0 },     // 0..1
    uShake: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSpeed; uniform float uNitro; uniform float uShake; uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // camera shake
      uv += (vec2(hash(vec2(uTime*13.0, 1.0)), hash(vec2(uTime*17.0, 7.0))) - 0.5) * uShake * 0.02;
      vec2 dir = uv - 0.5;
      float d = length(dir);
      // radial smear at speed (stronger with nitro)
      float amt = (uSpeed * 0.018 + uNitro * uSpeed * 0.026) * smoothstep(0.15, 0.75, d);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * amt).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * amt).b;
      // speed streaks
      float ang = atan(dir.y, dir.x);
      float streak = pow(abs(sin(ang * 40.0 + uTime * 2.0)), 8.0) * smoothstep(0.3, 0.85, d);
      col += vec3(0.5, 0.7, 1.0) * streak * uNitro * uSpeed * 0.3;
      // nitro color push
      col += vec3(0.0, 0.07, 0.14) * uNitro * uSpeed * smoothstep(0.2, 1.0, d);
      // vignette
      col *= 1.0 - smoothstep(0.55, 1.0, d) * 0.55;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class FX {
  constructor(scene, camera, renderer, tex) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.enabled = true;
    this.tex = tex;
    this.add = new Pool(scene, 500, tex.puff, true);
    this.smokeP = new Pool(scene, 300, tex.puff, false);
    this.skid = new SkidMarks(scene);
    this._tmpC = new THREE.Color();
    this.flames = new Map(); // rig -> {sprites: [], on}
    this.speedLevel = 0; this.nitroLevel = 0; this.shake = 0;
    this._time = 0;

    // post chain
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.85);
    this.composer.addPass(this.bloom);
    this.speedPass = new ShaderPass(SpeedShader);
    this.speedPass.renderToScreen = false;
    this.composer.addPass(this.speedPass);
    this.out = new OutputPass();
    this.composer.addPass(this.out);
  }

  resize(w, h) { this.composer.setSize(w, h); }

  smoke(pos, vel, dark = 0) {
    const c = this._tmpC.setRGB(0.75 - dark * 0.3, 0.75 - dark * 0.3, 0.78 - dark * 0.3);
    this.smokeP.spawn(pos, vel, { color: c, size: 0.7 + Math.random() * 0.4, alpha: 0.42, life: 0.8 + Math.random() * 0.5, grow: 2.2, gravity: 0.7, fadeExp: 1.2 });
  }

  sparks(pos, n, nx, nz) {
    for (let i = 0; i < n; i++) {
      const c = this._tmpC.setRGB(1, 0.55 + Math.random() * 0.35, 0.15);
      this.add.spawn(pos,
        new THREE.Vector3(nx * (2 + Math.random() * 7) + (Math.random() - 0.5) * 6,
          1 + Math.random() * 5, nz * (2 + Math.random() * 7) + (Math.random() - 0.5) * 6),
        { color: c, size: 0.28 + Math.random() * 0.2, life: 0.3 + Math.random() * 0.4, gravity: -14, fadeExp: 1.0 });
    }
  }

  nitroJet(pos, vel) {
    const c = this._tmpC.setRGB(0.35 + Math.random() * 0.3, 0.75, 1.0);
    this.add.spawn(pos, vel, { color: c, size: 0.55 + Math.random() * 0.4, alpha: 0.9, life: 0.16 + Math.random() * 0.12, grow: 1.5, fadeExp: 1.2 });
  }

  dust(pos) {
    const c = this._tmpC.setRGB(0.45, 0.42, 0.4);
    this.smokeP.spawn(pos, new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5),
      { color: c, size: 0.5, alpha: 0.3, life: 0.5, grow: 1.5, gravity: 0.3 });
  }

  setFlame(rig, on) {
    let f = this.flames.get(rig);
    if (!f) {
      f = { sprites: [], on: false };
      for (const ex of rig.exhausts) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.tex.streak,
          color: 0x66ccff, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        s.position.copy(ex);
        s.scale.set(0.7, 0.7, 1);
        s.visible = false;
        rig.group.add(s);
        f.sprites.push(s);
      }
      this.flames.set(rig, f);
    }
    f.on = on;
    if (!on) for (const s of f.sprites) s.visible = false;
    return f;
  }

  update(dt, playerCar) {
    this._time += dt;
    this.add.update(dt);
    this.smokeP.update(dt);
    this.skid.update(dt);
    // flame flicker
    for (const [rig, f] of this.flames) {
      if (!f.on) continue;
      for (const s of f.sprites) {
        s.visible = true;
        const k = 0.7 + Math.random() * 0.9;
        s.scale.set(0.55 * k, 0.55 * k, 1);
        s.material.rotation = Math.random() * 6.28;
        s.material.opacity = 0.6 + Math.random() * 0.4;
      }
      // jet particles from exhaust tips (world space)
      if (Math.random() < 0.85) {
        for (const ex of rig.exhausts) {
          const wp = ex.clone().applyMatrix4(rig.group.matrixWorld);
          const back = new THREE.Vector3(-Math.sin(rig.group.rotation.y), -0.1, -Math.cos(rig.group.rotation.y))
            .multiplyScalar(9 + Math.random() * 6);
          this.nitroJet(wp, back);
        }
      }
    }
    // post uniforms follow player
    const sp = playerCar ? Math.min(1, Math.max(0, (Math.abs(playerCar.vF) - 25) / 60)) : 0;
    this.speedLevel += (sp - this.speedLevel) * Math.min(1, dt * 4);
    const nt = playerCar && playerCar.nitroOn ? 1 : 0;
    this.nitroLevel += (nt - this.nitroLevel) * Math.min(1, dt * 7);
    this.shake = Math.max(0, this.shake - dt * 2.5) + (playerCar ? playerCar.wallHit * 0.02 : 0);
    const u = this.speedPass.uniforms;
    u.uSpeed.value = this.speedLevel;
    u.uNitro.value = this.nitroLevel;
    u.uShake.value = this.shake;
    u.uTime.value = this._time;
    this.bloom.strength = 0.45 + this.nitroLevel * 0.3;
  }

  render() {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render();
  }
}
