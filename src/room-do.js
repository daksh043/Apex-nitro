/* Nitro Apex — multiplayer room Durable Object.
   Port of the Node WebSocket server: rooms, state relay, race sync.
   One DO instance per room code; players relay at 20 Hz client-side. */

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.players = new Map();   // ws -> player record
    this.nextId = 1;
    this.hostId = null;
    this.racing = false;
    this.startAt = 0;
    this.results = [];
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleUpgrade(request);
    }
    return new Response('Nitro Apex room', { status: 200 });
  }

  handleUpgrade(request) {
    const pair = new WebSocketPair();
    const server = pair[1];
    server.accept();
    server.addEventListener('message', (ev) => this.onMessage(server, ev.data));
    server.addEventListener('close', () => this.onClose(server));
    server.addEventListener('error', () => this.onClose(server));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* dropped */ }
  }

  broadcast(msg, exceptWs = null) {
    for (const [ws] of this.players) {
      if (ws !== exceptWs) this.send(ws, msg);
    }
  }

  playerList() {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, host: p.id === this.hostId,
      lap: p.lap, prog: p.prog, finished: p.finished, time: p.time,
    }));
  }

  onMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    let p = this.players.get(ws);

    if (!p) {
      if (msg.t !== 'join') return;
      p = {
        id: 'p' + (this.nextId++),
        ws,
        name: String(msg.name || 'Racer').slice(0, 14),
        color: msg.color | 0,
        lap: -1, prog: 0, finished: false, time: 0, lastState: null,
      };
      this.players.set(ws, p);
      const first = this.players.size === 1;
      if (first) this.hostId = p.id;
      this.send(ws, {
        t: 'welcome', id: p.id, code: 'CLOUD', now: Date.now(),
        host: this.hostId === p.id, racing: this.racing,
        players: this.playerList(),
      });
      this.broadcast({ t: 'join', player: { id: p.id, name: p.name, color: p.color, host: p.id === this.hostId }, players: this.playerList() }, ws);
      return;
    }

    switch (msg.t) {
      case 'state': {
        p.lastState = msg.d;
        p.lap = msg.d.lap | 0;
        p.prog = +msg.d.prog || 0;
        // relay to the others immediately (clients send at 20 Hz)
        const d = { [p.id]: p.lastState };
        this.broadcast({ t: 's', d }, ws);
        break;
      }
      case 'start': {
        if (this.hostId !== p.id || this.racing) return;
        this.racing = true;
        this.startAt = Date.now() + 3800;
        this.results = [];
        for (const pl of this.players.values()) { pl.lap = -1; pl.prog = 0; pl.finished = false; pl.time = 0; }
        this.broadcast({ t: 'start', startAt: this.startAt, now: Date.now(), players: this.playerList() });
        break;
      }
      case 'finish': {
        p.finished = true;
        p.time = +msg.time || 0;
        this.results.push({ id: p.id, name: p.name, color: p.color, time: p.time });
        this.broadcast({ t: 'finished', id: p.id, name: p.name, time: p.time });
        const all = [...this.players.values()];
        if (all.every((pl) => pl.finished)) {
          this.broadcast({ t: 'raceOver', results: this.results });
        }
        break;
      }
      case 'backToLobby': {
        if (this.hostId !== p.id) return;
        this.racing = false;
        for (const pl of this.players.values()) { pl.lap = -1; pl.prog = 0; pl.finished = false; pl.time = 0; }
        this.broadcast({ t: 'lobby' });
        break;
      }
    }
  }

  onClose(ws) {
    const p = this.players.get(ws);
    if (!p) return;
    this.players.delete(ws);
    this.broadcast({ t: 'leave', id: p.id, players: this.playerList() });
  }
}
