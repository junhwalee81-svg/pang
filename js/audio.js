/* WebAudio 효과음(외부 파일 없음). */

var SFX = {
  ctx: null,
  muted: false,
  master: null,
  unlock() {
    if (this.muted) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.6;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
  },
  tone(freq, dur, type, gain, when) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  play(name) {
    if (this.muted || !this.ctx) return;
    if (name === 'ui') this.tone(740, 0.06, 'triangle', 0.14);
    else if (name === 'gauge') this.tone(520, 0.07, 'square', 0.08);
    else if (name === 'lock') this.tone(880, 0.09, 'square', 0.1);
    else if (name === 'hit' || name === 'hitPerfect') this.tone(name === 'hit' ? 180 : 260, 0.12, 'triangle', 0.4);
    else if (name === 'bounce') this.tone(240, 0.05, 'sine', 0.14);
    else if (name === 'splash') this.tone(160, 0.3, 'sawtooth', 0.12);
    else if (name === 'cup') this.tone(660, 0.2, 'sine', 0.3);
    else if (name === 'coin') [988, 1319].forEach((f, i) => this.tone(f, 0.1, 'square', 0.08, i * 0.07));
    else if (name === 'fanfare') [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.2, i * 0.11));
  },
};
