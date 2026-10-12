/* Nitro Apex — game server: static hosting + WebSocket multiplayer rooms */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

function serveFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const isStatic = ['.glb', '.gltf', '.obj', '.mtl', '.png', '.jpg', '.mp3', '.woff2'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isStatic ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // Map /vendor/three/* to node_modules/three/*
  if (urlPath.startsWith('/vendor/three/')) {
    const rel = urlPath.replace('/vendor/three/', '');
    const safe = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
    return serveFile(req, res, path.join(ROOT, 'node_modules', 'three', safe));
  }
  if (urlPath === '/') urlPath = '/index.html';
  const safe = path.normalize(urlPath).replace(/^([\/\\]|\.\.)+/, '');
  serveFile(req, res, path.join(PUBLIC, safe));
});

/* ---------------- Multiplayer rooms ---------------- */
const rooms = new Map(); // code -> {players: Map<id, player>, hostId, racing, startAt, results}
let nextId = 1;

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => chars[(Math.random() * chars.length) | 0]).join(''); }
  while (rooms.has(c));
  return c;
}

function playerList(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, color: p.color, car: p.car, host: p.id === room.hostId,
    lap: p.lap, prog: p.prog, finished: p.finished, time: p.time,
  }));
}

function broadcast(room, msg, exceptId = null) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
  }
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = ws.player;
    if (!p) {
      if (msg.t !== 'join' || ws.joined) return;
      ws.joined = true;
      // Join or create a room
      let room = null;
      if (msg.room) {
        room = rooms.get(String(msg.room).toUpperCase());
        if (!room) return send(ws, { t: 'error', msg: 'Room not found' });
      } else {
        room = { code: genCode(), players: new Map(), hostId: null, racing: false, startAt: 0, results: [] };
        rooms.set(room.code, room);
      }
      const id = 'p' + (nextId++);
      ws.player = {
        id, ws, name: String(msg.name || 'Racer').slice(0, 14), color: msg.color | 0,
        car: msg.car | 0,
        room, lap: -1, prog: 0, finished: false, time: 0, lastState: null,
      };
      const first = room.players.size === 0;
      room.players.set(id, ws.player);
      if (first) room.hostId = id;
      send(ws, {
        t: 'welcome', id, code: room.code, now: Date.now(),
        host: room.hostId === id, racing: room.racing,
        players: playerList(room),
      });
      console.log(`[room ${room.code}] ${ws.player.name} joined (${room.players.size} in room)`);
      broadcast(room, { t: 'join', player: { id, name: ws.player.name, color: ws.player.color, car: ws.player.car, host: room.hostId === id }, players: playerList(room) }, id);
      return;
    }

    switch (msg.t) {
      case 'state': // latest state per player, relayed on server tick
        p.lastState = msg.d;
        p.lap = msg.d.lap | 0; p.prog = +msg.d.prog || 0;
        break;
      case 'start': {
        if (p.room.hostId !== p.id || p.room.racing) return;
        p.room.racing = true;
        p.room.startAt = Date.now() + 3800; // client shows 3-2-1-GO
        p.room.results = [];
        for (const pl of p.room.players.values()) { pl.lap = -1; pl.prog = 0; pl.finished = false; pl.time = 0; }
        broadcast(p.room, { t: 'start', startAt: p.room.startAt, now: Date.now(), players: playerList(p.room) });
        console.log(`[room ${p.room.code}] race started (${p.room.players.size} players)`);
        break;
      }
      case 'finish': {
        p.finished = true; p.time = +msg.time || 0;
        p.room.results.push({ id: p.id, name: p.name, color: p.color, time: p.time });
        broadcast(p.room, { t: 'finished', id: p.id, name: p.name, color: p.color, time: p.time });
        const all = [...p.room.players.values()];
        if (all.every(pl => pl.finished)) broadcast(p.room, { t: 'raceOver', results: p.room.results });
        break;
      }
      case 'backToLobby': {
        if (p.room.hostId !== p.id) return;
        p.room.racing = false;
        for (const pl of p.room.players.values()) { pl.lap = -1; pl.prog = 0; pl.finished = false; pl.time = 0; }
        broadcast(p.room, { t: 'lobby' });
        break;
      }
      case 'leaveRoom': {
        leaveRoom(ws);
        break;
      }
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

function leaveRoom(ws) {
  const p = ws.player;
  if (!p) return;
  ws.player = null;
  const room = p.room;
  room.players.delete(p.id);
  console.log(`[room ${room.code}] ${p.name} left (${room.players.size} in room)`);
  broadcast(room, { t: 'leave', id: p.id, players: playerList(room) });
  if (room.players.size === 0) rooms.delete(room.code);
}

// keepalive: drop dead sockets after 2 missed pings
setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) { client.terminate(); continue; }
    client.isAlive = false;
    client.ping();
  }
}, 25000);
wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });

// Relay player states at a fixed 20 Hz
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.racing) continue;
    const d = {};
    for (const p of room.players.values()) {
      if (p.lastState && p.ws.readyState === 1) d[p.id] = p.lastState;
    }
    if (Object.keys(d).length) broadcast(room, { t: 's', d });
  }
}, 50);

/* ---------------- Boot ---------------- */
function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < PORT + 10) {
      console.log(`Port ${port} busy, trying ${port + 1}...`);
      listen(port + 1);
    } else { console.error(err); process.exit(1); }
  });
  server.listen(port, '0.0.0.0', () => {
    const nets = require('os').networkInterfaces();
    const lan = Object.values(nets).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║   NITRO APEX — server running                ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log(`   Local:   http://localhost:${port}`);
    if (lan.length) console.log(`   Network: http://${lan[0]}:${port}  (share for multiplayer)`);
    console.log('');
  });
}
listen(+PORT);
