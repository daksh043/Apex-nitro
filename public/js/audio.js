/* Nitro Apex — procedural audio: engine, music, sfx (Web Audio, no assets) */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.musicEnabled = true;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    this.master.connect(c.destination);
    this.engBus = c.createGain(); this.engBus.gain.value = 0.0;
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9;
    this.musBus = c.createGain(); this.musBus.gain.value = 0.42;
    this.engBus.connect(this.master); this.sfxBus.connect(this.master); this.musBus.connect(this.master);

    // noise buffer
    const len = c.sampleRate * 1.2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    /* engine: two saws + sub, lowpass */
    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500; this.engFilter.Q.value = 1.1;
    this.engFilter.connect(this.engBus);
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 60;
    this.o2 = c.createOscillator(); this.o2.type = 'square'; this.o2.frequency.value = 91;
    const g1 = c.createGain(); g1.gain.value = 0.55;
    const g2 = c.createGain(); g2.gain.value = 0.22;
    this.o1.connect(g1).connect(this.engFilter);
    this.o2.connect(g2).connect(this.engFilter);
    this.o1.start(); this.o2.start();
    // wind
    this.wind = c.createBufferSource(); this.wind.buffer = this.noiseBuf; this.wind.loop = true;
    this.windFilter = c.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 600;
    this.windGain = c.createGain(); this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.wind.start();
    // skid
    this.skidSrc = c.createBufferSource(); this.skidSrc.buffer = this.noiseBuf; this.skidSrc.loop = true;
    this.skidFilter = c.createBiquadFilter(); this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 900; this.skidFilter.Q.value = 1.6;
    this.skidGain = c.createGain(); this.skidGain.gain.value = 0;
    this.skidSrc.connect(this.skidFilter).connect(this.skidGain).connect(this.master);
    this.skidSrc.start();

    this.enabled = true;
    return true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  setMusic(on) { this.musicEnabled = on; if (this.musBus) this.musBus.gain.value = on ? 0.42 : 0; }

  setEngine(rpm01, throttle, nitroOn, speedNorm) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const f = 48 + rpm01 * 150;
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 1.5 + 2, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(320 + rpm01 * 2100 + (nitroOn ? 800 : 0), t, 0.05);
    const vol = 0.05 + throttle * 0.10 + rpm01 * 0.075 + (nitroOn ? 0.05 : 0);
    this.engBus.gain.setTargetAtTime(vol, t, 0.08);
    this.windGain.gain.setTargetAtTime(speedNorm * speedNorm * 0.14, t, 0.15);
  }

  setSkid(amount) {
    if (!this.enabled) return;
    this.skidGain.gain.setTargetAtTime(Math.min(0.5, amount * 0.4), this.ctx.currentTime, 0.05);
    this.skidFilter.frequency.setTargetAtTime(700 + amount * 500, this.ctx.currentTime, 0.05);
  }

  crash(force) {
    if (!this.enabled || force < 2) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.min(0.7, force * 0.05), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t); src.stop(t + 0.35);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    const og = c.createGain();
    og.gain.setValueAtTime(Math.min(0.6, force * 0.04), t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og).connect(this.sfxBus); o.start(t); o.stop(t + 0.32);
  }

  whoosh() {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3400, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t); src.stop(t + 0.65);
  }

  beep(final) {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.value = final ? 880 : 440;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(final ? 0.5 : 0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.7 : 0.22));
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + 0.75);
  }

  /* ---------- synthwave music loop ---------- */
  startMusic() {
    if (!this.enabled || this.musicTimer) return;
    const c = this.ctx;
    this.bpm = 118;
    this.stepDur = 60 / this.bpm / 2; // eighth notes
    this.step = 0;
    this.nextTime = c.currentTime + 0.1;
    const bassLine = [0, 0, 12, 0, 0, 0, 12, 0]; // semitone offsets pattern
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G (midi)
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

    const note = (midi, t, dur, type, vol, filterFreq) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = mtof(midi);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.015);
      g.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.06);
      o.connect(f).connect(g).connect(this.musBus);
      o.start(t); o.stop(t + dur + 0.3);
    };
    const drum = (t, kind) => {
      if (kind === 'kick') {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        const g = c.createGain();
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(this.musBus); o.start(t); o.stop(t + 0.25);
      } else {
        const s = c.createBufferSource(); s.buffer = this.noiseBuf;
        const f = c.createBiquadFilter();
        const g = c.createGain();
        if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 7500; g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); }
        else { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); }
        s.connect(f).connect(g).connect(this.musBus);
        s.start(t); s.stop(t + 0.2);
      }
    };

    const tick = () => {
      while (this.nextTime < c.currentTime + 0.15) {
        const t = this.nextTime, s = this.step % 64; // 8 bars of 8
        const bar = Math.floor(s / 8), beat8 = s % 8;
        if (beat8 % 2 === 0) drum(t, 'kick');
        if (beat8 % 2 === 1) drum(t, 'hat');
        if (beat8 === 4) drum(t, 'clap');
        const root = [45, 41, 36, 43][Math.floor(bar / 2) % 4]; // A2 F2 C2 G2
        note(root + bassLine[beat8], t, this.stepDur * 0.9, 'sawtooth', 0.16, 420);
        if (s % 16 === 0) {
          const ch = chords[Math.floor(bar / 2) % 4];
          for (const m of ch) note(m, t, this.stepDur * 14, 'sawtooth', 0.028, 900);
          note(ch[0] - 12, t, this.stepDur * 14, 'triangle', 0.05, 600);
        }
        this.step++;
        this.nextTime += this.stepDur;
      }
    };
    tick();
    this.musicTimer = setInterval(tick, 40);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
