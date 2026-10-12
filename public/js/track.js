/* Nitro Apex — world: sky, dusk lighting, city, track, props */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROAD_HALF = 8;          // half road width (m)
const WALL_LAT = ROAD_HALF + 2.4; // barrier lateral offset
const SAMPLES = 900;

/* GLB nature/landmark assets (m4_city pack) */
const TREE_URL = '/models/bmw_m4_city/m4_city_game_build/assets/tree.glb';
const KFC_URL = '/models/bmw_m4_city/m4_city_game_build/assets/kfc.glb';
const MCD_URL = '/models/bmw_m4_city/m4_city_game_build/assets/mcd.glb';
const BUILDING_URL = '/models/building.glb';
const CANAL_HOUSE_URL = '/models/canal_house.glb';

/* Control points of the circuit (x, y elevation, z) — ~1.5 km loop */
const CONTROL = [
  [0, 0, 0], [120, 0, -8], [235, 5, -35], [320, 9, -115],
  [335, 8, -225], [255, 3, -292], [150, 0, -300], [55, 0, -258],
  [-45, 4, -292], [-145, 8, -240], [-205, 11, -140], [-190, 6, -28],
  [-90, 2, 12],
];

export class Track {
  constructor(scene, tex, renderer) {
    this.tex = tex;
    this.ROAD_HALF = ROAD_HALF;
    this.WALL_LAT = WALL_LAT;
    this.samples = [];
    this.beacons = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.curve = new THREE.CatmullRomCurve3(
      CONTROL.map(p => new THREE.Vector3(p[0], p[1], p[2])), true, 'catmullrom', 0.5
    );
    this.length = this.curve.getLength();
    this._buildSamples();
    this._buildSky(scene);
    this._buildRoad();
    this._buildRoadNetwork();
    this._buildBarriers();
    this._buildLamps();
    this._buildCity();
    this._buildGround();
    this._buildGrassTufts();
    this._buildStartGear();
    this.reservedSpots = [];
    this._buildLandmarks();
    this._buildTrees();
    this._buildBoosterPads();
    this._minimap();
    this.timeOfDay = 'dusk';
    try { const saved = localStorage.getItem('na_tod'); if (saved) this.timeOfDay = saved; } catch (_) {}
    this.setTimeOfDay(this.timeOfDay);
  }

  /* ---------- sampling helpers ---------- */
  _buildSamples() {
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / SAMPLES;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      this.samples.push({
        p, t: tan,
        a: Math.atan2(tan.x, tan.z),
        curv: 0, arc: t * this.length,
      });
    }
    // curvature (rad per meter) + smoothed
    for (let i = 0; i < SAMPLES; i++) {
      const a = this.samples[i], b = this.samples[(i + 1) % SAMPLES];
      const da = Math.abs(shortAngle(b.a - a.a));
      const seg = this.length / SAMPLES;
      a.curv = da / seg;
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < SAMPLES; i++) {
        const prev = this.samples[(i - 1 + SAMPLES) % SAMPLES].curv;
        const next = this.samples[(i + 1) % SAMPLES].curv;
        this.samples[i].curv = (this.samples[i].curv * 2 + prev + next) / 4;
      }
    }
  }

  /* Closest sample query with hint (fast window search) */
  closest(pos, hint) {
    let best = -1, bestD = Infinity;
    const N = SAMPLES;
    if (hint >= 0) {
      for (let k = -45; k <= 45; k++) {
        const i = ((hint + k) % N + N) % N;
        const d = pos.distanceToSquared(this.samples[i].p);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (bestD > 60 * 60) best = -1;
    }
    if (best < 0) { // full scan
      for (let i = 0; i < N; i += 3) {
        const d = pos.distanceToSquared(this.samples[i].p);
        if (d < bestD) { bestD = d; best = i; }
      }
      for (let k = -3; k <= 3; k++) {
        const i = ((best + k) % N + N) % N;
        const d = pos.distanceToSquared(this.samples[i].p);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    const s = this.samples[best];
    // lateral offset (left of travel direction is positive)
    const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
    const rel = new THREE.Vector3().subVectors(pos, s.p);
    const lat = rel.x * right.x + rel.z * right.z;
    return { i: best, t: best / SAMPLES, arc: s.arc, lat, height: s.p.y, tan: s.t, a: s.a, sample: s };
  }

  sampleAtArc(arc) {
    arc = ((arc % this.length) + this.length) % this.length;
    const f = (arc / this.length) * SAMPLES;
    const i = Math.floor(f) % SAMPLES;
    const j = (i + 1) % SAMPLES;
    const u = f - Math.floor(f);
    const A = this.samples[i], B = this.samples[j];
    return {
      p: new THREE.Vector3().lerpVectors(A.p, B.p, u),
      t: new THREE.Vector3().lerpVectors(A.t, B.t, u).normalize(),
      a: A.a + shortAngle(B.a - A.a) * u,
      curv: A.curv * (1 - u) + B.curv * u,
    };
  }

  spawnGrid(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2), col = i % 2;
      const arc = this.length - 10 - row * 7.5;
      const lat = col === 0 ? 2.8 : -2.8;
      const s = this.sampleAtArc(arc);
      const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
      const pos = s.p.clone().addScaledVector(right, lat);
      pos.y += 0.08;
      out.push({ pos, yaw: s.a, arc });
    }
    return out;
  }

  /* ---------- sky & lights ---------- */
  _buildSky(scene) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3(-0.62, 0.18, -0.42).normalize();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        sunDir: { value: this.sunDir },
        zenith: { value: new THREE.Vector3(0.020, 0.031, 0.090) },
        mid: { value: new THREE.Vector3(0.10, 0.11, 0.26) },
        horizon: { value: new THREE.Vector3(0.55, 0.25, 0.28) },
        sunWarm: { value: new THREE.Vector3(1.0, 0.45, 0.15) },
        sunGlow: { value: new THREE.Vector3(1.0, 0.62, 0.25) },
        sunDisc: { value: new THREE.Vector3(1.0, 0.85, 0.60) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 sunDir;
        uniform vec3 zenith; uniform vec3 mid; uniform vec3 horizon;
        uniform vec3 sunWarm; uniform vec3 sunGlow; uniform vec3 sunDisc;
        void main(){
          float h = clamp(vDir.y, -0.05, 1.0);
          vec3 col = mix(mix(horizon, mid, smoothstep(0.0,0.22,h)), zenith, smoothstep(0.18,0.65,h));
          float sd = max(dot(vDir, sunDir), 0.0);
          col += sunWarm * pow(sd, 6.0) * 0.35;
          col += sunGlow * pow(sd, 60.0) * 1.6;
          col += sunDisc * pow(sd, 400.0) * 4.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1250, 32, 16), skyMat);
    this.group.add(this.skyMesh);
    this.skyMat = skyMat;

    // stars
    const starGeo = new THREE.BufferGeometry();
    const sp = [], sc = [];
    for (let i = 0; i < 900; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (v.y < 0.12) continue;
      v.multiplyScalar(1150);
      sp.push(v.x, v.y, v.z);
      const b = 0.4 + Math.random() * 0.6;
      sc.push(b, b, b * (0.9 + Math.random() * 0.1));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, fog: false, depthWrite: false,
    }));
    this.group.add(this.stars);

    // moon
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex.puff, color: 0xbfd2ff, transparent: true, opacity: 0.95, fog: false, depthWrite: false,
    }));
    moon.position.set(420, 560, -820); moon.scale.setScalar(140);
    this.group.add(moon);
    this.moon = moon;

    // fog
    scene.fog = new THREE.Fog(0x18172c, 160, 1200);

    // lights — rich dusk ambient with natural meadow bounce
    const hemi = new THREE.HemisphereLight(0x556ea8, 0x324d26, 1.15);
    scene.add(hemi);
    this.hemi = hemi;

    const sun = new THREE.DirectionalLight(0xff7b33, 2.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 520;
    sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
    sun.shadow.bias = -0.0004;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
  }

  /* ---------- road ribbon ---------- */
  _ribbon(latFrom, latTo, yFrom, yTo, mat, vScale, yLift = 0, yToAbsolute = null) {
    const N = SAMPLES;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const s = this.samples[i % N];
      const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
      const ax = s.p.x + right.x * latFrom, az = s.p.z + right.z * latFrom;
      const bx = s.p.x + right.x * latTo, bz = s.p.z + right.z * latTo;
      const by = yToAbsolute !== null ? yToAbsolute : s.p.y + yTo + yLift;
      pos.push(ax, s.p.y + yFrom + yLift, az, bx, by, bz);
      const v = s.arc / vScale;
      uv.push(0, v, 1, v);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  _buildRoad() {
    // Ultra-realistic PBR asphalt material with normal map, roughness map, and anisotropic filtering
    const roadMat = new THREE.MeshStandardMaterial({
      map: this.tex.asphalt,
      normalMap: this.tex.asphaltNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: this.tex.asphaltRoughness,
      roughness: 0.85,
      metalness: 0.08,
    });
    // Elevated road surface (+0.08m over grade)
    const road = this._ribbon(-ROAD_HALF, ROAD_HALF, 0.08, 0.08, roadMat, 14);
    road.material.polygonOffset = true; road.material.polygonOffsetFactor = -1; road.material.polygonOffsetUnits = -1;
    this.group.add(road);

    // 3D physical asphalt edge drops / roadbed foundation
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
    this.group.add(this._ribbon(-ROAD_HALF - 0.08, -ROAD_HALF, -0.06, 0.08, bedMat, 8));
    this.group.add(this._ribbon(ROAD_HALF, ROAD_HALF + 0.08, 0.08, -0.06, bedMat, 8));

    // 3D beveled FIA curb stones (elevated +0.08m at inner edge rising to +0.18m raised profile)
    const curbMat = new THREE.MeshStandardMaterial({ map: this.tex.curb, roughness: 0.60 });
    this.group.add(this._ribbon(-ROAD_HALF - 0.75, -ROAD_HALF, 0.18, 0.08, curbMat, 3));
    this.group.add(this._ribbon(ROAD_HALF, ROAD_HALF + 0.75, 0.08, 0.18, curbMat, 3));

    // 3D paved pedestrian sidewalks flanking the asphalt curbs
    const paveMat = new THREE.MeshStandardMaterial({ map: this.tex.pavement, roughness: 0.75 });
    this.group.add(this._ribbon(-WALL_LAT, -ROAD_HALF - 0.75, 0.16, 0.18, paveMat, 5));
    this.group.add(this._ribbon(ROAD_HALF + 0.75, WALL_LAT, 0.18, 0.16, paveMat, 5));
  }

  /* ---------- 3D secondary city road network & plaza access streets ---------- */
  _buildRoadNetwork() {
    const sideRoadMat = new THREE.MeshStandardMaterial({
      map: this.tex.sideRoad, roughness: 0.82, metalness: 0.05
    });
    const paveMat = new THREE.MeshStandardMaterial({ map: this.tex.pavement, roughness: 0.78 });

    // Secondary city avenues branching outward into the urban skyline & restaurant plazas
    const avenues = [
      { arc: 90, side: -1, len: 150, w: 14 },
      { arc: 190, side: -1, len: 140, w: 14 },
      { arc: 240, side: 1, len: 170, w: 16 },  // Avenue leading into KFC plaza
      { arc: 340, side: -1, len: 150, w: 14 },
      { arc: 430, side: 1, len: 170, w: 18 },  // Avenue leading into McDonald's plaza
      { arc: 560, side: 1, len: 145, w: 14 },
      { arc: 700, side: -1, len: 170, w: 16 }, // Avenue leading into KFC 2 plaza
      { arc: 810, side: 1, len: 140, w: 14 },
      { arc: 950, side: -1, len: 170, w: 18 }, // Avenue leading into McDonald's 2 plaza
    ];

    for (const av of avenues) {
      const smp = this.sampleAtArc(av.arc);
      const right = new THREE.Vector3(Math.cos(smp.a), 0, -Math.sin(smp.a));
      const roadDir = right.clone().multiplyScalar(av.side);
      const roadWidthDir = smp.t.clone();

      const startDist = WALL_LAT - 0.5;
      const endDist = startDist + av.len;
      const halfW = av.w * 0.5;

      const p1 = smp.p.clone().addScaledVector(roadDir, startDist).addScaledVector(roadWidthDir, -halfW);
      const p2 = smp.p.clone().addScaledVector(roadDir, startDist).addScaledVector(roadWidthDir, halfW);
      const p3 = smp.p.clone().addScaledVector(roadDir, endDist).addScaledVector(roadWidthDir, halfW);
      const p4 = smp.p.clone().addScaledVector(roadDir, endDist).addScaledVector(roadWidthDir, -halfW);

      const pos = [
        p1.x, p1.y + 0.08, p1.z,
        p2.x, p2.y + 0.08, p2.z,
        p3.x, p3.y + 0.08, p3.z,
        p1.x, p1.y + 0.08, p1.z,
        p3.x, p3.y + 0.08, p3.z,
        p4.x, p4.y + 0.08, p4.z,
      ];
      const uvs = [
        0, 0,
        1, 0,
        1, av.len / 16,
        0, 0,
        1, av.len / 16,
        0, av.len / 16,
      ];

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.computeVertexNormals();

      const roadMesh = new THREE.Mesh(geom, sideRoadMat);
      roadMesh.receiveShadow = true;
      this.group.add(roadMesh);

      // Flanking 3D concrete sidewalks on both sides of each avenue
      for (const swSide of [-1, 1]) {
        const swWidth = 3.2;
        const swInner = halfW * swSide;
        const swOuter = (halfW + swWidth) * swSide;

        const s1 = smp.p.clone().addScaledVector(roadDir, startDist).addScaledVector(roadWidthDir, swInner);
        const s2 = smp.p.clone().addScaledVector(roadDir, startDist).addScaledVector(roadWidthDir, swOuter);
        const s3 = smp.p.clone().addScaledVector(roadDir, endDist).addScaledVector(roadWidthDir, swOuter);
        const s4 = smp.p.clone().addScaledVector(roadDir, endDist).addScaledVector(roadWidthDir, swInner);

        const swPos = [
          s1.x, s1.y + 0.16, s1.z,
          s2.x, s2.y + 0.16, s2.z,
          s3.x, s3.y + 0.16, s3.z,
          s1.x, s1.y + 0.16, s1.z,
          s3.x, s3.y + 0.16, s3.z,
          s4.x, s4.y + 0.16, s4.z,
        ];
        const swUvs = [
          0, 0, 1, 0, 1, av.len / 8,
          0, 0, 1, av.len / 8, 0, av.len / 8,
        ];
        const swGeom = new THREE.BufferGeometry();
        swGeom.setAttribute('position', new THREE.Float32BufferAttribute(swPos, 3));
        swGeom.setAttribute('uv', new THREE.Float32BufferAttribute(swUvs, 2));
        swGeom.computeVertexNormals();
        const swMesh = new THREE.Mesh(swGeom, paveMat);
        swMesh.receiveShadow = true;
        this.group.add(swMesh);
      }
    }
  }

  _buildBarriers() {
    // 1. Armco W-Beam Corrugated Crash Barrier (Galvanized Steel with metallic sheen)
    const railMat = new THREE.MeshStandardMaterial({
      map: this.tex.galvanized,
      color: 0xdce0e6,
      roughness: 0.28,
      metalness: 0.92,
    });
    // Corrugated 3D W-profile cross-section (upper wave and lower wave)
    // Left Barrier:
    this.group.add(this._ribbon(-WALL_LAT - 0.07, -WALL_LAT, 0.76, 0.52, railMat, 4));
    this.group.add(this._ribbon(-WALL_LAT, -WALL_LAT - 0.07, 0.52, 0.28, railMat, 4));
    // Right Barrier:
    this.group.add(this._ribbon(WALL_LAT, WALL_LAT + 0.07, 0.52, 0.76, railMat, 4));
    this.group.add(this._ribbon(WALL_LAT + 0.07, WALL_LAT, 0.28, 0.52, railMat, 4));

    // 2. Heavy-duty galvanized steel support posts every 4 meters
    const postGeo = new THREE.BoxGeometry(0.12, 0.92, 0.12);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x42474f, roughness: 0.55, metalness: 0.85 });
    const n = Math.floor(this.length / 4) * 2;
    const posts = new THREE.InstancedMesh(postGeo, postMat, n);
    posts.frustumCulled = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    let k = 0;
    for (let arc = 0; arc < this.length && k < n - 1; arc += 4) {
      const s = this.sampleAtArc(arc);
      const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
      for (const side of [-1, 1]) {
        const p = s.p.clone().addScaledVector(right, side * (WALL_LAT + 0.05));
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.a);
        m.compose(new THREE.Vector3(p.x, p.y + 0.46, p.z), q, sc);
        posts.setMatrixAt(k++, m);
      }
    }
    posts.count = k;
    posts.instanceMatrix.needsUpdate = true;
    posts.computeBoundingSphere();
    this.group.add(posts);

    // 3. FIA Motorsport Safety Catch Fence (semi-transparent diamond chainlink debris mesh)
    const fenceMat = new THREE.MeshStandardMaterial({
      map: this.tex.chainlink,
      transparent: true,
      alphaTest: 0.20,
      side: THREE.DoubleSide,
      roughness: 0.42,
      metalness: 0.82,
    });
    // Slanted debris mesh rising from top of guardrail (0.76m) to 2.15m height
    this.group.add(this._ribbon(-WALL_LAT - 0.06, -WALL_LAT + 0.16, 0.76, 2.15, fenceMat, 2));
    this.group.add(this._ribbon(WALL_LAT + 0.06, WALL_LAT - 0.16, 0.76, 2.15, fenceMat, 2));

    // 4. Tubular steel vertical catch fence poles
    const poleGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.45, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x383d44, roughness: 0.5, metalness: 0.8 });
    const fencePoles = new THREE.InstancedMesh(poleGeo, poleMat, n);
    fencePoles.frustumCulled = true;
    let kp = 0;
    for (let arc = 0; arc < this.length && kp < n - 1; arc += 4) {
      const s = this.sampleAtArc(arc);
      const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
      for (const side of [-1, 1]) {
        const p = s.p.clone().addScaledVector(right, side * (WALL_LAT + 0.02));
        q.setFromAxisAngle(new THREE.Vector3(s.t.x, 0, s.t.z).normalize(), side * 0.10);
        m.compose(new THREE.Vector3(p.x, p.y + 1.45, p.z), q, sc);
        fencePoles.setMatrixAt(kp++, m);
      }
    }
    fencePoles.count = kp;
    fencePoles.instanceMatrix.needsUpdate = true;
    fencePoles.computeBoundingSphere();
    this.group.add(fencePoles);
  }

  /* ---------- street lamps ---------- */
  _buildLamps() {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 7.4, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.7 });
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 2.4);
    const headGeo = new THREE.BoxGeometry(0.5, 0.16, 1.0);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 2.6 });
    const coneGeo = new THREE.ConeGeometry(3.4, 6.4, 12, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffc98a, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.lampHeadMat = headMat;
    this.lampConeMat = coneMat;
    const step = 42;
    const count = Math.floor(this.length / step) * 2;
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const arms = new THREE.InstancedMesh(armGeo, poleMat, count);
    const heads = new THREE.InstancedMesh(headGeo, headMat, count);
    const cones = new THREE.InstancedMesh(coneGeo, coneMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    let k = 0;
    for (let arc = 20, side = 1; arc < this.length && k < count; arc += step, side = -side) {
      const s = this.sampleAtArc(arc);
      const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
      const base = s.p.clone().addScaledVector(right, side * (WALL_LAT + 1.6));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.a);
      m.compose(new THREE.Vector3(base.x, base.y + 3.7, base.z), q, one);
      poles.setMatrixAt(k, m);
      // arm reaches toward road
      const armDir = right.clone().multiplyScalar(-side);
      const armPos = base.clone().addScaledVector(armDir, 1.1);
      m.compose(new THREE.Vector3(armPos.x, base.y + 7.3, armPos.z), q, one);
      arms.setMatrixAt(k, m);
      const headPos = base.clone().addScaledVector(armDir, 2.2);
      m.compose(new THREE.Vector3(headPos.x, base.y + 7.28, headPos.z), q, one);
      heads.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(headPos.x, base.y + 4.0, headPos.z), q, one);
      cones.setMatrixAt(k, m);
      k++;
    }
    poles.count = arms.count = heads.count = cones.count = k;
    this.group.add(poles, arms, heads, cones);
  }

  /* ---------- modern high-rise city buildings & skyline ---------- */
  _buildCity() {
    const placed = [];
    const nearTrack = (x, z, r) => {
      for (let i = 0; i < SAMPLES; i += 5) {
        const s = this.samples[i];
        const dx = s.p.x - x, dz = s.p.z - z;
        if (dx * dx + dz * dz < r * r) return true;
      }
      return false;
    };
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    const bldgPts = [];
    const canalPts = [];

    // Near trackside cityscape (mix of modern skyscrapers and historic Amsterdam canal houses)
    for (let arc = 0; arc < this.length; arc += 18) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.22) continue;
        const s = this.sampleAtArc(arc + rnd() * 10);
        const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
        // Allocate approximately 40% to canal houses, 60% to modern high-rise towers
        const isCanal = rnd() < 0.40;
        const off = isCanal ? (28 + rnd() * 40) : (42 + rnd() * 70);
        const x = s.p.x + right.x * side * off + (rnd() - 0.5) * 14;
        const z = s.p.z + right.z * side * off + (rnd() - 0.5) * 14;
        const clearance = isCanal ? 15 : 22;
        if (nearTrack(x, z, clearance)) continue;
        let clash = false;
        const minClash = isCanal ? 12 : 22;
        for (const b of placed) {
          const dx = b.x - x, dz = b.z - z;
          if (dx * dx + dz * dz < minClash * minClash) { clash = true; break; }
        }
        if (clash) continue;

        if (isCanal) {
          // Dutch canal townhouse: ~10-14m height
          const scale = 10.0 + rnd() * 4.0;
          // Front (+Z in model space) rotated to directly face towards the racetrack/road
          const rotY = Math.atan2(-side * right.x, -side * right.z) + (rnd() - 0.5) * 0.15;
          canalPts.push({ x, y: s.p.y, z, scale, rotY });
        } else {
          // Atlanta corporate office tower
          const scaleXZ = 0.22 + rnd() * 0.16;
          const scaleY = 0.22 + rnd() * 0.18;
          const rotY = (rnd() * 4 | 0) * (Math.PI / 2) + (rnd() - 0.5) * 0.25;
          bldgPts.push({ x, y: s.p.y, z, scaleXZ, scaleY, rotY });
        }
        placed.push({ x, z });
      }
    }

    // Far skyline ring (modern high-rise towers across the horizon)
    const cx = 60, cz = -150;
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2;
      const r = 680 + rnd() * 240;
      const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      if (nearTrack(x, z, 50)) continue;
      const scaleXZ = 0.35 + rnd() * 0.30;
      const scaleY = 0.35 + rnd() * 0.35;
      const rotY = (rnd() * 4 | 0) * (Math.PI / 2);
      bldgPts.push({ x, y: -0.06, z, scaleXZ, scaleY, rotY });
    }

    // 1. Instance Modern Atlanta Corporate High-Rise Buildings
    new GLTFLoader().load(BUILDING_URL, (gltf) => {
      const tpl = gltf.scene;
      const box = new THREE.Box3().setFromObject(tpl);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const tCenter = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);

      const parts = [];
      tpl.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) {
            o.material.roughness = Math.min(o.material.roughness || 0.6, 0.7);
            if (o.material.emissiveMap || (o.material.emissive && o.material.emissive.getHex() > 0)) {
              o.material.emissiveIntensity = 2.0;
            }
          }
          parts.push(o);
        }
      });

      const n = bldgPts.length;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
      const tPos = new THREE.Matrix4(), baseMat = new THREE.Matrix4();
      const instanced = parts.map((part) => {
        const im = new THREE.InstancedMesh(part.geometry, part.material, n);
        im.castShadow = true;
        im.receiveShadow = false;
        im.frustumCulled = true;
        const local = part.matrixWorld.clone().multiply(new THREE.Matrix4().copy(tpl.matrixWorld).invert());
        this.group.add(im);
        return { im, local };
      });

      bldgPts.forEach((p, i) => {
        e.set(0, p.rotY, 0);
        q.setFromEuler(e);
        sc.set(p.scaleXZ, p.scaleY, p.scaleXZ);

        // Grounding: base sits 0.5m into ground foundation
        tPos.compose(new THREE.Vector3(p.x, p.y - 0.5, p.z), q, sc);
        baseMat.multiplyMatrices(tPos, tCenter);

        for (const { im, local } of instanced) {
          m.copy(baseMat).multiply(local);
          im.setMatrixAt(i, m);
        }

        // Rooftop aviation beacon on tall skyscrapers
        const totalHeight = (box.max.y - box.min.y) * p.scaleY;
        if (totalHeight > 50 && rnd() < 0.6) {
          const bcn = new THREE.Mesh(
            new THREE.SphereGeometry(0.65, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false })
          );
          bcn.position.set(p.x, p.y + totalHeight - 0.5, p.z);
          this.group.add(bcn);
          this.beacons.push({ mesh: bcn, phase: rnd() * 6.28 });
        }
      });

      for (const { im } of instanced) {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }
    });

    // 2. Instance Historic Amsterdam Canal Townhouses
    if (canalPts.length > 0) {
      new GLTFLoader().load(CANAL_HOUSE_URL, (gltf) => {
        const tpl = gltf.scene;
        const box = new THREE.Box3().setFromObject(tpl);
        let houseMesh = null;
        tpl.traverse((o) => {
          if (o.isMesh && !houseMesh) {
            o.castShadow = true;
            o.receiveShadow = false;
            if (o.material) {
              o.material.roughness = 0.8;
            }
            houseMesh = o;
          }
        });
        if (!houseMesh) return;

        const n = canalPts.length;
        const im = new THREE.InstancedMesh(houseMesh.geometry, houseMesh.material, n);
        im.castShadow = true;
        im.receiveShadow = false;
        im.frustumCulled = true;
        this.group.add(im);

        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
        canalPts.forEach((p, i) => {
          e.set(0, p.rotY, 0);
          q.setFromEuler(e);
          sc.set(p.scale, p.scale, p.scale);

          // Grounding: base sits 0.2m below foundation level
          const posY = (p.y - 0.2) - (box.min.y * p.scale);
          m.compose(new THREE.Vector3(p.x, posY, p.z), q, sc);
          im.setMatrixAt(i, m);
        });

        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      });
    }
  }

  /* ---------- ground ---------- */
  _buildGround() {
    // Expansive lush grass meadow base situated safely under the entire road everywhere
    const g = new THREE.Mesh(
      new THREE.CircleGeometry(1600, 64),
      new THREE.MeshStandardMaterial({
        map: this.tex.ground,
        color: 0x5a9a4c,
        roughness: 0.85,
        metalness: 0.04,
      })
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(60, -0.06, -150);
    g.receiveShadow = true;
    this.group.add(g);

    // Localized trackside grass verge runoff shoulders (compact, strictly avoiding self-intersection)
    const vergeMat = new THREE.MeshStandardMaterial({
      map: this.tex.ground,
      color: 0x62a853,
      roughness: 0.82,
    });
    // Inner verge immediately flanking the sidewalk / barrier (width 4.5m)
    this.group.add(this._ribbon(-WALL_LAT - 4.5, -WALL_LAT, 0.08, 0.16, vergeMat, 8));
    this.group.add(this._ribbon(WALL_LAT, WALL_LAT + 4.5, 0.16, 0.08, vergeMat, 8));

    // Gentle embankment transition dropping cleanly from verge (+0.08m) down to flat terrain (-0.06m)
    // Width is strictly 7.5m (max distance from centerline is WALL_LAT + 12m = 22.4m)
    // Circuit interior gap is 80m - 240m, so ZERO self-intersection or road burial can occur!
    this.group.add(this._ribbon(-WALL_LAT - 12.0, -WALL_LAT - 4.5, 0, 0.08, vergeMat, 10, 0, -0.06));
    this.group.add(this._ribbon(WALL_LAT + 4.5, WALL_LAT + 12.0, 0.08, 0, vergeMat, 10, 0, -0.06));
  }

  /* ---------- 3D Physical Grass Tufts ---------- */
  _buildGrassTufts() {
    const tuftGeo = new THREE.BufferGeometry();
    const w = 1.9, h = 1.2;
    const quadVertices = [];
    const quadUVs = [];
    const quadIndices = [];

    // 2 crossed perpendicular quads (4 triangles total per tuft instead of 6)
    const angles = [0, Math.PI * 0.5];
    angles.forEach((ang, qIdx) => {
      const cos = Math.cos(ang) * (w * 0.5);
      const sin = Math.sin(ang) * (w * 0.5);
      const baseIdx = qIdx * 4;
      quadVertices.push(
        -cos, 0, -sin,
         cos, 0,  sin,
         cos, h,  sin,
        -cos, h, -sin
      );
      quadUVs.push(
        0, 0,
        1, 0,
        1, 1,
        0, 1
      );
      quadIndices.push(
        baseIdx, baseIdx + 1, baseIdx + 2,
        baseIdx, baseIdx + 2, baseIdx + 3
      );
    });

    tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(quadVertices, 3));
    tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(quadUVs, 2));
    tuftGeo.setIndex(quadIndices);
    tuftGeo.computeVertexNormals();

    // High-performance alpha-test material with early depth writes
    const tuftMat = new THREE.MeshStandardMaterial({
      map: this.tex.grassTuft,
      alphaTest: 0.35,
      transparent: false,
      side: THREE.DoubleSide,
      color: 0x82cc68,
      roughness: 0.85,
      metalness: 0.05,
    });

    // 1,800 concentrated tufts = 7,200 polygons vs previous 55,200 polygons (87% fill-rate reduction)
    const grassCount = 1800;
    const grassMesh = new THREE.InstancedMesh(tuftGeo, tuftMat, grassCount);
    grassMesh.castShadow = false;
    grassMesh.receiveShadow = false;
    grassMesh.frustumCulled = true;

    let seed = 47;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
    let idx = 0;

    // Concentrated belts along the active trackside verges
    for (let arc = 0; arc < this.length && idx < grassCount - 200; arc += 7.0) {
      const smp = this.sampleAtArc(arc);
      const right = new THREE.Vector3(Math.cos(smp.a), 0, -Math.sin(smp.a));

      for (const side of [-1, 1]) {
        const clusterSize = 1 + ((rnd() * 3) | 0);
        for (let k = 0; k < clusterSize && idx < grassCount; k++) {
          const latOffset = WALL_LAT + 1.2 + rnd() * 18;
          const px = smp.p.x + right.x * side * latOffset + (rnd() - 0.5) * 2.0;
          const pz = smp.p.z + right.z * side * latOffset + (rnd() - 0.5) * 2.0;
          const py = smp.p.y;

          const scale = 0.85 + rnd() * 0.55;
          sc.set(scale, scale * (0.9 + rnd() * 0.3), scale);
          e.set(0, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.1);
          q.setFromEuler(e);

          m.compose(new THREE.Vector3(px, py, pz), q, sc);
          grassMesh.setMatrixAt(idx++, m);
        }
      }
    }

    // Remaining tufts distributed along visible infield sweeps
    while (idx < grassCount) {
      const arc = rnd() * this.length;
      const smp = this.sampleAtArc(arc);
      const right = new THREE.Vector3(Math.cos(smp.a), 0, -Math.sin(smp.a));
      const side = rnd() < 0.5 ? -1 : 1;
      const dist = WALL_LAT + 15 + rnd() * 45;
      const px = smp.p.x + right.x * side * dist;
      const pz = smp.p.z + right.z * side * dist;
      const py = smp.p.y - 0.04;

      const scale = 0.9 + rnd() * 0.6;
      sc.set(scale, scale, scale);
      e.set(0, rnd() * Math.PI * 2, 0);
      q.setFromEuler(e);

      m.compose(new THREE.Vector3(px, py, pz), q, sc);
      grassMesh.setMatrixAt(idx++, m);
    }

    grassMesh.instanceMatrix.needsUpdate = true;
    grassMesh.computeBoundingSphere();
    this.group.add(grassMesh);
  }

  /* ---------- start line + gantry ---------- */
  _buildStartGear() {
    const s = this.sampleAtArc(0);
    const checkerMat = new THREE.MeshStandardMaterial({ map: this.tex.checker, roughness: 0.8 });
    checkerMat.map = this.tex.checker;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 1.1, 3.2), checkerMat);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -s.a;
    line.position.set(s.p.x, s.p.y + 0.025, s.p.z);
    line.receiveShadow = true;
    this.group.add(line);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.5, metalness: 0.7 });
    const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
    for (const side of [-1, 1]) {
      const p = s.p.clone().addScaledVector(right, side * (ROAD_HALF + 3.4));
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 0.8), pillarMat);
      pil.position.set(p.x, p.y + 4.25, p.z);
      pil.castShadow = true;
      this.group.add(pil);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF + 3.4) * 2 + 0.8, 2.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.4, metalness: 0.6 }));
    beam.position.set(s.p.x, s.p.y + 7.6, s.p.z);
    beam.rotation.y = s.a;
    this.group.add(beam);
    const panelMat = new THREE.MeshBasicMaterial({ map: this.tex.startPanel });
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry((ROAD_HALF + 3.4) * 2, 2.0), panelMat);
      panel.position.set(s.p.x, s.p.y + 7.6, s.p.z);
      panel.rotation.y = s.a + (side < 0 ? Math.PI : 0);
      panel.translateZ(side * 0.3);
      this.group.add(panel);
    }
  }

  /* ---------- nature + landmarks (GLB assets, cone fallback) ---------- */
  _buildTrees() {
    const pts = [];
    let seed = 31;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let arc = 0; arc < this.length; arc += 15) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.72) continue;
        const s = this.sampleAtArc(arc);
        const right = new THREE.Vector3(Math.cos(s.a), 0, -Math.sin(s.a));
        const off = WALL_LAT + 10 + rnd() * 26;
        pts.push({ x: s.p.x + right.x * side * off, y: s.p.y, z: s.p.z + right.z * side * off,
          rot: rnd() * Math.PI * 2, scale: 0.9 + rnd() * 0.5 });
      }
    }
    // keep clearances around the landmark buildings (expanded for large footprint)
    for (const r of this.reservedSpots) {
      for (let i = pts.length - 1; i >= 0; i--) {
        if (Math.hypot(pts[i].x - r.x, pts[i].z - r.z) < 55) pts.splice(i, 1);
      }
    }
    this._treePts = pts;

    new GLTFLoader().load(TREE_URL, (gltf) => {
      const tpl = gltf.scene;
      const box = new THREE.Box3().setFromObject(tpl);
      const size = box.getSize(new THREE.Vector3());
      // Giant mature tree height ≈ 40 m (scaled up for high-impact presence)
      const s = 40.0 / size.y;
      tpl.scale.setScalar(s);
      tpl.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(tpl);
      const yOff = -bb.min.y;
      const parts = [];
      tpl.traverse((o) => { if (o.isMesh) parts.push(o); });
      const n = pts.length;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const instanced = parts.map((part) => {
        const im = new THREE.InstancedMesh(part.geometry, part.material, n);
        im.castShadow = true;
        im.frustumCulled = true;
        const local = part.matrixWorld.clone().multiply(new THREE.Matrix4().copy(tpl.matrixWorld).invert());
        this.group.add(im);
        return { im, local };
      });
      pts.forEach((p, i) => {
        e.set(0, p.rot, 0); q.setFromEuler(e);
        const base = new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, p.y + yOff - 1.05, p.z), q,
          new THREE.Vector3(p.scale, p.scale, p.scale)
        );
        for (const { im, local } of instanced) {
          m.copy(base).multiply(local);
          im.setMatrixAt(i, m);
        }
      });
      for (const { im } of instanced) {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }
    }, undefined, () => this._buildConeTrees(pts));
  }

  _buildConeTrees(pts) {
    const trunkGeo = new THREE.CylinderGeometry(1.1, 1.5, 16.0, 6);
    const leafGeo = new THREE.ConeGeometry(11.0, 28.0, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x14301c, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, pts.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3();
    pts.forEach((p, i) => {
      one.set(p.scale, p.scale, p.scale);
      m.compose(new THREE.Vector3(p.x, p.y + 8.0 * p.scale, p.z), q, one); trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, p.y + 24.0 * p.scale, p.z), q, one); leaves.setMatrixAt(i, m);
    });
    leaves.castShadow = true;
    this.group.add(trunks, leaves);
  }

  /* ---------- landmark buildings (KFC / McDonald's from the city pack) ---------- */
  _buildLandmarks() {
    const spots = [
      { url: KFC_URL, arc: 240, side: 1, footprint: 60, dist: WALL_LAT + 38 },
      { url: KFC_URL, arc: 700, side: -1, footprint: 60, dist: WALL_LAT + 38 },
      { url: MCD_URL, arc: 430, side: 1, footprint: 64, dist: WALL_LAT + 24 },
      { url: MCD_URL, arc: 950, side: -1, footprint: 64, dist: WALL_LAT + 24 },
    ];
    for (const sp of spots) {
      const smp = this.sampleAtArc(sp.arc);
      const right = new THREE.Vector3(Math.cos(smp.a), 0, -Math.sin(smp.a));
      const pos = smp.p.clone().addScaledVector(right, sp.side * sp.dist);
      this.reservedSpots.push({ x: pos.x, z: pos.z });
      new GLTFLoader().load(sp.url, (gltf) => {
        const b = gltf.scene;
        const box = new THREE.Box3().setFromObject(b);
        const size = box.getSize(new THREE.Vector3());
        // Large footprint (60m - 64m) for impressive commercial roadside landmarks
        const s = sp.footprint / Math.max(size.x, size.z);
        b.scale.setScalar(s);
        b.updateMatrixWorld(true);

        const bb = new THREE.Box3().setFromObject(b);
        const c = bb.getCenter(new THREE.Vector3());
        const width = bb.max.x - bb.min.x;
        const depth = bb.max.z - bb.min.z;

        // Elevated commercial plaza foundation base platform
        const baseHeight = 0.85; // Raised base height so model rests on the platform surface
        const pivot = new THREE.Group();
        pivot.position.set(pos.x, pos.y, pos.z);
        pivot.rotation.y = smp.a - sp.side * (Math.PI / 2);

        // Position model inside pivot so its center is at (0,0) and its bottom sits exactly on top of the base height
        b.position.set(-c.x, baseHeight - bb.min.y, -c.z);
        pivot.add(b);

        // 3D Commercial Plaza Base Platform (touching the surface and providing a clean foundation)
        const padW = width * 1.08;
        const padD = depth * 1.12;
        const padGeo = new THREE.BoxGeometry(padW, baseHeight + 0.8, padD);
        padGeo.translate(0, (baseHeight - 0.8) * 0.5, 0); // top at baseHeight, bottom 0.8m below surface
        const padMat = new THREE.MeshStandardMaterial({
          map: this.tex.pavement,
          roughness: 0.78,
          metalness: 0.05,
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.receiveShadow = true;
        padMesh.castShadow = true;
        pivot.add(padMesh);

        // 3D Plaza curb perimeter trim
        const curbPadGeo = new THREE.BoxGeometry(padW + 0.6, 0.22, padD + 0.6);
        curbPadGeo.translate(0, baseHeight - 0.11, 0);
        const curbPadMat = new THREE.MeshStandardMaterial({
          map: this.tex.curb,
          roughness: 0.65,
        });
        const curbPadMesh = new THREE.Mesh(curbPadGeo, curbPadMat);
        curbPadMesh.receiveShadow = true;
        pivot.add(curbPadMesh);

        b.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) {
              o.material.roughness = Math.min(o.material.roughness || 0.6, 0.7);
            }
          }
        });
        this.group.add(pivot);

        // Warm commercial light illuminating the storefront and sign at dusk
        const lmLight = new THREE.PointLight(0xffeedd, 70, 95, 1.2);
        lmLight.position.set(pos.x, pos.y + baseHeight + 18, pos.z);
        this.group.add(lmLight);

        const signGlow = new THREE.PointLight(0xffaa33, 40, 60, 1.3);
        signGlow.position.set(pos.x - (sp.side * 12), pos.y + baseHeight + 15, pos.z);
        this.group.add(signGlow);
      }, undefined, (e) => {
        window.__errs.push('landmark ' + sp.url + ': ' + String(e && e.message || e).slice(0, 200));
      });
    }
  }

  /* ---------- minimap path ---------- */
  _minimap() {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const s of this.samples) {
      minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x);
      minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z);
    }
    const pad = 30;
    const w = maxX - minX + pad * 2, h = maxZ - minZ + pad * 2;
    this.mapBounds = { minX, minZ, w, h };
    this.mapPath = this.samples.filter((_, i) => i % 8 === 0)
      .map(s => [(s.p.x - minX + pad) / w, (s.p.z - minZ + pad) / h]);
    this.mapToXY = (x, z) => [(x - minX + pad) / w, (z - minZ + pad) / h];
  }

  /* ---------- 3D Physical Booster Pads (Speed Strips) ---------- */
  _buildBoosterPads() {
    this.boosters = [];
    const padMat = new THREE.MeshStandardMaterial({
      map: this.tex.booster,
      emissive: 0x00e5ff,
      emissiveMap: this.tex.booster,
      emissiveIntensity: 3.2,
      roughness: 0.2,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    const beaconGeo = new THREE.CylinderGeometry(0.18, 0.24, 3.2, 8);
    const beaconRingGeo = new THREE.TorusGeometry(0.85, 0.12, 8, 16);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x0d121c,
      emissive: 0x00e5ff,
      emissiveIntensity: 2.5,
      metalness: 0.8,
      roughness: 0.3,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f7ff,
    });

    // 5 strategic booster pad locations around the 1.5km track
    const padArcs = [170, 440, 780, 1080, 1360];
    this.boosterBeacons = [];

    padArcs.forEach((arc) => {
      const smp = this.sampleAtArc(arc);
      const right = new THREE.Vector3(Math.cos(smp.a), 0, -Math.sin(smp.a));

      // 1. Road overlay booster strip: 6.8m wide x 11.0m long ribbon
      const padW = 6.8, padL = 11.0;
      const g = new THREE.PlaneGeometry(padW, padL, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.rotateY(smp.a);

      const mesh = new THREE.Mesh(g, padMat);
      mesh.position.set(smp.p.x, smp.p.y + 0.095, smp.p.z);
      mesh.receiveShadow = false;
      this.group.add(mesh);

      // 2. Flanking speed pylons / neon speed beacons on left and right track shoulders
      for (const side of [-1, 1]) {
        const pylonPos = smp.p.clone().addScaledVector(right, side * (WALL_LAT - 0.6));
        const pylon = new THREE.Mesh(beaconGeo, beaconMat);
        pylon.position.set(pylonPos.x, smp.p.y + 1.6, pylonPos.z);
        this.group.add(pylon);

        const ring = new THREE.Mesh(beaconRingGeo, ringMat);
        ring.position.set(pylonPos.x, smp.p.y + 2.8, pylonPos.z);
        ring.rotation.y = smp.a;
        this.group.add(ring);
        this.boosterBeacons.push(ring);
      }

      this.boosters.push({
        arc,
        pos: smp.p.clone(),
        width: padW,
        length: padL,
        angle: smp.a,
      });
    });
  }

  /* ---------- Time of Day (Day / Night / Dusk) Controls ---------- */
  setTimeOfDay(mode) {
    this.timeOfDay = mode;
    try { localStorage.setItem('na_tod', mode); } catch (_) {}

    if (mode === 'day') {
      this.sunDir.set(-0.35, 0.75, -0.45).normalize();
      if (this.skyMat) {
        this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
        this.skyMat.uniforms.zenith.value.set(0.12, 0.38, 0.85);
        this.skyMat.uniforms.mid.value.set(0.38, 0.62, 0.92);
        this.skyMat.uniforms.horizon.value.set(0.70, 0.85, 0.98);
        this.skyMat.uniforms.sunWarm.value.set(0.95, 0.90, 0.80);
        this.skyMat.uniforms.sunGlow.value.set(1.0, 0.95, 0.85);
        this.skyMat.uniforms.sunDisc.value.set(1.0, 1.0, 0.95);
      }
      if (this.sun) {
        this.sun.color.setHex(0xfff6e6);
        this.sun.intensity = 3.2;
      }
      if (this.hemi) {
        this.hemi.color.setHex(0x90b8f0);
        this.hemi.groundColor.setHex(0x4a7834);
        this.hemi.intensity = 1.35;
      }
      if (this.scene && this.scene.fog) {
        this.scene.fog.color.setHex(0xc2daf2);
        this.scene.fog.near = 220; this.scene.fog.far = 1800;
      }
      if (this.stars) this.stars.visible = false;
      if (this.moon) this.moon.visible = false;
      if (this.lampConeMat) this.lampConeMat.opacity = 0.0;
      if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = 0.2;
    } else if (mode === 'night') {
      this.sunDir.set(-0.25, 0.85, -0.35).normalize();
      if (this.skyMat) {
        this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
        this.skyMat.uniforms.zenith.value.set(0.006, 0.008, 0.022);
        this.skyMat.uniforms.mid.value.set(0.025, 0.030, 0.085);
        this.skyMat.uniforms.horizon.value.set(0.075, 0.055, 0.160);
        this.skyMat.uniforms.sunWarm.value.set(0.3, 0.5, 0.8);
        this.skyMat.uniforms.sunGlow.value.set(0.6, 0.75, 1.0);
        this.skyMat.uniforms.sunDisc.value.set(0.85, 0.92, 1.0);
      }
      if (this.sun) {
        this.sun.color.setHex(0x7692c8);
        this.sun.intensity = 1.25;
      }
      if (this.hemi) {
        this.hemi.color.setHex(0x182440);
        this.hemi.groundColor.setHex(0x0a0c10);
        this.hemi.intensity = 0.55;
      }
      if (this.scene && this.scene.fog) {
        this.scene.fog.color.setHex(0x090b14);
        this.scene.fog.near = 120; this.scene.fog.far = 950;
      }
      if (this.stars) {
        this.stars.visible = true;
        this.stars.material.opacity = 1.0;
      }
      if (this.moon) this.moon.visible = true;
      if (this.lampConeMat) this.lampConeMat.opacity = 0.08;
      if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = 3.6;
    } else { // 'dusk'
      this.sunDir.set(-0.62, 0.18, -0.42).normalize();
      if (this.skyMat) {
        this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
        this.skyMat.uniforms.zenith.value.set(0.020, 0.031, 0.090);
        this.skyMat.uniforms.mid.value.set(0.10, 0.11, 0.26);
        this.skyMat.uniforms.horizon.value.set(0.55, 0.25, 0.28);
        this.skyMat.uniforms.sunWarm.value.set(1.0, 0.45, 0.15);
        this.skyMat.uniforms.sunGlow.value.set(1.0, 0.62, 0.25);
        this.skyMat.uniforms.sunDisc.value.set(1.0, 0.85, 0.60);
      }
      if (this.sun) {
        this.sun.color.setHex(0xff7b33);
        this.sun.intensity = 2.9;
      }
      if (this.hemi) {
        this.hemi.color.setHex(0x556ea8);
        this.hemi.groundColor.setHex(0x324d26);
        this.hemi.intensity = 1.15;
      }
      if (this.scene && this.scene.fog) {
        this.scene.fog.color.setHex(0x18172c);
        this.scene.fog.near = 160; this.scene.fog.far = 1200;
      }
      if (this.stars) this.stars.visible = true;
      if (this.moon) this.moon.visible = true;
      if (this.lampConeMat) this.lampConeMat.opacity = 0.03;
      if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = 2.6;
    }
  }

  toggleTimeOfDay() {
    const next = this.timeOfDay === 'day' ? 'night' : (this.timeOfDay === 'night' ? 'dusk' : 'day');
    this.setTimeOfDay(next);
    return next;
  }

  update(dt, time, playerPos) {
    // animated booster pad chevrons stream forward
    if (this.tex && this.tex.booster) {
      this.tex.booster.offset.y -= dt * 3.6;
    }
    // pulsating beacon rings
    if (this.boosterBeacons) {
      const k = 1 + Math.sin(time * 7) * 0.14;
      for (const ring of this.boosterBeacons) {
        ring.scale.set(k, k, k);
      }
    }
    // beacons blink
    for (const b of this.beacons) {
      const on = Math.sin(time * 2.4 + b.phase) > 0.4;
      b.mesh.visible = on;
    }
    // sun + shadow frustum follow player
    if (playerPos) {
      this.sun.position.copy(playerPos).addScaledVector(this.sunDir, 320);
      this.sun.target.position.copy(playerPos);
      this.skyMesh.position.set(playerPos.x, 0, playerPos.z);
      this.stars.position.set(playerPos.x, 0, playerPos.z);
    }
  }
}

export function shortAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* PMREM environment from a mini sky scene, for car paint reflections */
export function buildEnvironment(renderer, track) {
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(100, 16, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { sunDir: { value: track.sunDir } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 sunDir;
        void main(){
          float h = clamp(vDir.y, -0.05, 1.0);
          vec3 col = mix(vec3(0.30,0.16,0.16), vec3(0.06,0.07,0.16), smoothstep(0.0,0.4,h));
          float sd = max(dot(vDir, sunDir), 0.0);
          col += vec3(1.0,0.5,0.2) * pow(sd, 20.0) * 1.2;
          col += vec3(0.0,0.5,0.7) * pow(max(0.0,-vDir.x*vDir.z*4.0), 3.0) * 0.22; // fake city glow
          gl_FragColor = vec4(col,1.0);
        }`,
    })
  );
  envScene.add(sky);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300),
    new THREE.MeshBasicMaterial({ color: 0x0a0b10 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.08);
  pmrem.dispose();
  return rt.texture;
}
