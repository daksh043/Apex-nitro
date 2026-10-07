/* Nitro Apex — multiplayer client: WebSocket + remote car interpolation */
import * as THREE from 'three';
import { CARS, CarController } from './car.js';
import { shortAngle } from './track.js';

const INTERP_DELAY = 120; // ms behind latest snapshot

export class Net {
  constructor(handlers) {
    this.ws = null;
    this.h = handlers;
    this.id = null;
    this.code = null;
    this.host = false;
    this.players = [];
    this.closed = false;
  }

  connect(name, color, room, car) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = room ? `?room=${encodeURIComponent(room)}` : '?room=LOBBY';
    this.ws = new WebSocket(`${proto}//${location.host}/ws${qs}`);
    this.closed = false;
    this.ws.onopen = () => this.ws.send(JSON.stringify({ t: 'join', name, color, room, car: car | 0 }));
    this.ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      switch (m.t) {
        case 'welcome':
          this.id = m.id; this.code = m.code; this.host = m.host;
          this.clockOffset = m.now - Date.now();
          this.players = m.players;
          this.h.onWelcome && this.h.onWelcome(m);
          break;
        case 'join':
          this.players = m.players;
          this.h.onJoin && this.h.onJoin(m);
          break;
        case 'leave':
          this.players = m.players;
          this.h.onLeave && this.h.onLeave(m);
          break;
        case 'start':
          this.clockOffset = m.now - Date.now();
          this.players = m.players || this.players;
          this.h.onStart && this.h.onStart(m);
          break;
        case 's': this.h.onStates && this.h.onStates(m.d); break;
        case 'finished': this.h.onFinished && this.h.onFinished(m); break;
        case 'raceOver': this.h.onRaceOver && this.h.onRaceOver(m); break;
        case 'lobby': this.h.onLobby && this.h.onLobby(m); break;
        case 'error': this.h.onError && this.h.onError(m); break;
      }
    };
    this.ws.onclose = () => { if (!this.closed && this.h.onClose) this.h.onClose(); };
    this.ws.onerror = () => { if (!this.closed && this.h.onError) this.h.onError({ msg: 'Connection failed' }); };
  }

  get connected() { return this.ws && this.ws.readyState === 1; }

  sendState(d) { if (this.connected) this.ws.send(JSON.stringify({ t: 'state', d })); }
  sendStart() { if (this.connected) this.ws.send(JSON.stringify({ t: 'start' })); }
  sendFinish(time) { if (this.connected) this.ws.send(JSON.stringify({ t: 'finish', time })); }
  sendBackToLobby() { if (this.connected) this.ws.send(JSON.stringify({ t: 'backToLobby' })); }
  close() { this.closed = true; if (this.ws) this.ws.close(); this.ws = null; this.id = null; }
}

const cssColor = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export class RemoteCar {
  constructor(id, name, color, scene, tex, carType = 0) {
    this.id = id;
    this.name = name;
    this.color = color;
    const spec = CARS[carType] || CARS[0];
    this.car = new CarController(false, name, color, spec);
    this.rig = spec.build(color, { shadowTex: tex.shadow, kidneyTex: tex.kidney });
    scene.add(this.rig.group);
    // name tag
    const cv = tex.nameTag(name, cssColor(color));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    this.tag.scale.set(4.2, 1.05, 1);
    this.tag.position.y = 2.15;
    this.tag.renderOrder = 10;
    this.rig.group.add(this.tag);
    this.buf = []; // {t, d}
    this.vF = 0; this.nitroOn = false;
    this.driftAcc = 0;
  }

  push(d) {
    this.buf.push({ t: performance.now(), d });
    if (this.buf.length > 30) this.buf.shift();
  }

  update(dt, fx, audioless) {
    const now = performance.now() - INTERP_DELAY;
    const b = this.buf;
    if (!b.length) return;
    let a = b[0], c = b[b.length - 1];
    if (now <= b[0].t) c = b[0];
    else if (now >= b[b.length - 1].t) { a = c = b[b.length - 1]; }
    else {
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i].t <= now && b[i + 1].t >= now) { a = b[i]; c = b[i + 1]; break; }
      }
    }
    const span = Math.max(1, c.t - a.t);
    const u = a === c ? 1 : Math.min(1, Math.max(0, (now - a.t) / span));
    const d0 = a.d, d1 = c.d;
    const car = this.car;
    car.pos.set(d0.p[0] + (d1.p[0] - d0.p[0]) * u, d0.p[1] + (d1.p[1] - d0.p[1]) * u, d0.p[2] + (d1.p[2] - d0.p[2]) * u);
    car.yaw = d0.ry + shortAngle(d1.ry - d0.ry) * u;
    car.vF = d0.s + (d1.s - d0.s) * u;
    car.vL = 0;
    car.lap = d1.lap; car.prog = d1.prog; car.finished = !!d1.fin;
    const nitro = !!(u < 1 ? d0.n && d1.n : d1.n);
    const drift = !!(u < 1 ? d0.dr && d1.dr : d1.dr);
    car.nitroOn = nitro;
    car.drifting = drift;
    car.wheelSpin += (car.vF / 0.36) * dt;
    // drift smoke + skids
    if (drift && Math.abs(car.vF) > 8) {
      this.driftAcc += dt;
      if (this.driftAcc > 0.04) {
        this.driftAcc = 0;
        const back = new THREE.Vector3(-Math.sin(car.yaw), 0, -Math.cos(car.yaw)).multiplyScalar(1.4);
        fx.smoke(new THREE.Vector3(car.pos.x - Math.sin(car.yaw) * 1.4, car.pos.y + 0.25, car.pos.z - Math.cos(car.yaw) * 1.4),
          new THREE.Vector3(back.x * 0.4, 0.8, back.z * 0.4), 0.2);
      }
    }
    fx.setFlame(this.rig, nitro);
    car.applyVisual(this.rig, dt);
  }

  dispose(scene) {
    scene.remove(this.rig.group);
  }
}
