/* Nitro Apex — HUD: speedometer, nitro, minimap, race info */
export class HUD {
  constructor() {
    this.speedo = document.getElementById('speedo');
    this.sctx = this.speedo.getContext('2d');
    this.map = document.getElementById('minimap');
    this.mctx = this.map.getContext('2d');
    this.mapBase = null;
    this.el = {};
    for (const id of ['posBig', 'posSuf', 'posTotal', 'lapNum', 'raceTime', 'lastLap', 'bestLap',
      'countdown', 'centerMsg', 'wrongWay', 'nitroFill', 'nitroWrap',
      'results', 'resultsBody', 'resultsTitle', 'resultsBtns', 'hudRoot',
      'toast', 'mpPanel', 'mpCode', 'mpPlayers', 'lbList', 'lbPanel']) {
      this.el[id] = document.getElementById(id);
    }
    this._lastCount = null;
    this._msgTimer = null;
    this.preRendered = false;
  }

  show(v) { this.el.hudRoot.style.display = v ? 'block' : 'none'; }

  setRaceInfo(rank, total, lap, totalLaps, time, lastLap, bestLap) {
    const suf = ['st', 'nd', 'rd'][((rank + 90) % 100 - 10) % 10 - 1] || 'th';
    this.el.posBig.textContent = rank;
    this.el.posSuf.textContent = suf;
    this.el.posTotal.textContent = `/ ${total}`;
    this.el.lapNum.textContent = lap >= 3 ? `FINISH` : `LAP ${Math.max(1, lap + 1)}/${totalLaps}`;
    this.el.raceTime.textContent = fmtTime(time);
    this.el.lastLap.textContent = lastLap ? fmtTime(lastLap) : '--:--';
    this.el.bestLap.textContent = bestLap !== Infinity ? fmtTime(bestLap) : '--:--';
  }

  drawSpeedo(kmh, gear, nitro, nitroOn) {
    const c = this.sctx, W = 240, H = 240;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = 100;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25; // 270° sweep
    // dial
    c.beginPath(); c.arc(cx, cy, R + 12, 0, Math.PI * 2);
    c.fillStyle = 'rgba(6,9,16,0.62)'; c.fill();
    // speed arc
    const frac = Math.min(1, kmh / 360);
    c.lineWidth = 9; c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.beginPath(); c.arc(cx, cy, R - 4, a0, a1); c.stroke();
    const grad = c.createLinearGradient(0, H, W, 0);
    grad.addColorStop(0, '#00e5ff'); grad.addColorStop(0.6, '#ffd400'); grad.addColorStop(1, '#ff3b30');
    c.strokeStyle = grad;
    c.beginPath(); c.arc(cx, cy, R - 4, a0, a0 + (a1 - a0) * frac); c.stroke();
    // ticks
    c.lineWidth = 2;
    for (let s = 0; s <= 360; s += 30) {
      const a = a0 + (a1 - a0) * (s / 360);
      const c1 = Math.cos(a), s1 = Math.sin(a);
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.moveTo(cx + c1 * (R - 14), cy + s1 * (R - 14));
      c.lineTo(cx + c1 * (R - 22), cy + s1 * (R - 22));
      c.stroke();
      if (s % 60 === 0) {
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.font = '11px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(s, cx + c1 * (R - 34), cy + s1 * (R - 34));
      }
    }
    // digital speed
    c.fillStyle = '#fff';
    c.font = 'italic 900 44px Arial'; c.textAlign = 'center';
    c.fillText(Math.round(kmh), cx, cy + 4);
    c.font = '600 11px Arial'; c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText('KM/H', cx, cy + 28);
    // gear
    c.fillStyle = '#00e5ff';
    c.font = 'italic 900 20px Arial';
    c.fillText(kmh < 2 ? 'N' : gear, cx, cy - 32);
    // nitro ring
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.arc(cx, cy, R + 4, a0, a1); c.stroke();
    c.strokeStyle = nitroOn ? '#7df9ff' : '#00b8d4';
    if (nitroOn) { c.shadowColor = '#00e5ff'; c.shadowBlur = 14; }
    c.beginPath(); c.arc(cx, cy, R + 4, a0, a0 + (a1 - a0) * (nitro / 100)); c.stroke();
    c.shadowBlur = 0;
  }

  setNitro(n, on) {
    this.el.nitroFill.style.height = n + '%';
    this.el.nitroWrap.classList.toggle('nitro-on', on);
  }

  buildMinimap(track) {
    const S = 190;
    this.map.width = this.map.height = S;
    const off = document.createElement('canvas');
    off.width = off.height = S;
    const c = off.getContext('2d');
    c.fillStyle = 'rgba(6,9,16,0.55)';
    c.beginPath(); c.roundRect(0, 0, S, S, 14); c.fill();
    const sc = S - 28;
    c.beginPath();
    track.mapPath.forEach(([x, y], i) => {
      const px = 14 + x * sc, py = 14 + y * sc;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    });
    c.closePath();
    c.lineWidth = 7; c.strokeStyle = 'rgba(255,255,255,0.16)'; c.stroke();
    c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,229,255,0.9)';
    c.shadowColor = 'rgba(0,229,255,0.7)'; c.shadowBlur = 6;
    c.stroke();
    // start line dot
    const [sx, sy] = track.mapPath[0];
    c.shadowBlur = 0;
    c.fillStyle = '#fff';
    c.fillRect(14 + sx * sc - 3, 14 + sy * sc - 3, 6, 6);
    this.mapBase = off;
    this.preRendered = true;
  }

  drawMinimap(cars) {
    if (!this.preRendered) return;
    const S = 190, sc = S - 28;
    const c = this.mctx;
    c.clearRect(0, 0, S, S);
    c.drawImage(this.mapBase, 0, 0);
    for (const car of cars) {
      const [x, y] = car.mapXY;
      c.beginPath();
      c.arc(14 + x * sc, 14 + y * sc, car.isPlayer ? 5 : 3.5, 0, Math.PI * 2);
      c.fillStyle = car.isPlayer ? '#ffffff' : cssHex(car.paint);
      c.shadowColor = c.fillStyle; c.shadowBlur = car.isPlayer ? 8 : 3;
      c.fill();
      c.shadowBlur = 0;
    }
  }

  countdown(text) {
    const el = this.el.countdown;
    if (!text) { el.className = 'countdown hidden'; el.textContent = ''; this._lastCount = null; return; }
    if (text === this._lastCount) return;
    this._lastCount = text;
    el.textContent = text;
    el.className = 'countdown';
    void el.offsetWidth; // restart animation
    el.classList.add('pop');
  }

  centerMsg(text, ms = 1800) {
    const el = this.el.centerMsg;
    el.textContent = text;
    el.className = 'center-msg pop';
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => { el.className = 'center-msg hidden'; }, ms);
  }

  wrongWay(on) {
    this.el.wrongWay.style.display = on ? 'block' : 'none';
  }

  results(title, rows, buttons) {
    this.el.resultsTitle.textContent = title;
    this.el.resultsBody.innerHTML = rows.map((r, i) =>
      `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${cssHex(r.color)}"></span>${esc(r.name)}</td>` +
      `<td>${r.time != null ? fmtTime(r.time) : '<span class="dnf">DNF</span>'}</td><td>${r.best != null && r.best !== Infinity ? fmtTime(r.best) : '—'}</td></tr>`
    ).join('');
    this.el.resultsBtns.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.className = 'btn ' + (b.primary ? 'primary' : '');
      btn.onclick = b.fn;
      this.el.resultsBtns.appendChild(btn);
    }
    this.el.results.style.display = 'flex';
  }

  hideResults() { this.el.results.style.display = 'none'; }

  toast(text, ms = 2600) {
    const el = this.el.toast;
    const d = document.createElement('div');
    d.textContent = text;
    el.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  lobby(players, isHost, code, racing) {
    this.el.lbPanel.style.display = 'flex';
    this.el.mpCode.textContent = code;
    this.el.mpPlayers.innerHTML = players.map(p =>
      `<div class="lobby-row"><span class="dot" style="background:${cssHex(p.color)}"></span>` +
      `<span class="lobby-name">${esc(p.name)}</span>${p.host ? '<span class="host-tag">HOST</span>' : ''}</div>`
    ).join('');
    const btn = document.getElementById('btnStartRace');
    btn.disabled = isHost && players.length >= 1 && !racing ? false : true;
    btn.textContent = racing ? 'RACE IN PROGRESS' : (isHost ? 'START RACE' : 'WAITING FOR HOST…');
    document.getElementById('btnLobbyLeave').style.display = 'inline-block';
  }

  hideLobby() {
    this.el.lbPanel.style.display = 'none';
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
function cssHex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
