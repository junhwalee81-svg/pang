/* WebAudio 합성 효과음. 외부 파일을 쓰지 않는다. */

var SFX = {
  ctx: null,
  muted: false,
  bus: null,
  noiseCache: new WeakMap(),

  unlock() {
    if (this.muted) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.bus = this.makeBus(this.ctx);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
  },

  /** 음량 + 압축기: 소리가 겹쳐도 찢어지지 않게 한다 */
  makeBus(ctx) {
    const gain = ctx.createGain();
    gain.gain.value = 0.72;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    gain.connect(comp);
    comp.connect(ctx.destination);
    return gain;
  },

  noise(ctx) {
    let buf = this.noiseCache.get(ctx);
    if (!buf) {
      buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseCache.set(ctx, buf);
    }
    return buf;
  },

  env(ctx, out, t, peak, dur, attack) {
    const g = ctx.createGain();
    const a = attack || 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0002, t + a + dur);
    g.connect(out);
    return g;
  },

  /** 음정 스윕 톤 */
  sweep(ctx, out, t, type, f0, f1, dur, peak) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(this.env(ctx, out, t, peak, dur));
    o.start(t);
    o.stop(t + dur + 0.03);
  },

  /** 필터를 거친 잡음 */
  burst(ctx, out, t, filterType, f0, f1, q, dur, peak, attack) {
    const s = ctx.createBufferSource();
    s.buffer = this.noise(ctx);
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    s.connect(f);
    f.connect(this.env(ctx, out, t, peak, dur, attack));
    s.start(t, Math.random() * 0.8);
    s.stop(t + dur + (attack || 0.002) + 0.04);
  },

  /** 클럽별 타격음: 접촉 잡음 + 몸통 울림 + 금속 울림 */
  strike(ctx, out, t, club) {
    if (club === 'PT') {
      this.sweep(ctx, out, t, 'sine', 1250, 620, 0.035, 0.5);
      this.sweep(ctx, out, t, 'triangle', 420, 240, 0.07, 0.34);
      this.burst(ctx, out, t, 'highpass', 3000, 3000, 0.7, 0.012, 0.3);
      return;
    }
    const wood = club === '1W';
    this.burst(ctx, out, t, 'highpass', wood ? 2600 : 3800, 2000, 0.8, 0.022, 0.75);
    this.sweep(ctx, out, t, 'sine', wood ? 480 : 620, wood ? 95 : 150, wood ? 0.13 : 0.09, 1.0);
    this.sweep(ctx, out, t, 'triangle', wood ? 1020 : 1560, wood ? 860 : 1380, wood ? 0.09 : 0.06, wood ? 0.26 : 0.36);
    this.sweep(ctx, out, t + 0.002, 'sine', wood ? 2500 : 3650, wood ? 2300 : 3400, wood ? 0.07 : 0.1, 0.16);
    if (club === 'SW') this.burst(ctx, out, t + 0.005, 'bandpass', 700, 300, 0.8, 0.09, 0.36);
  },

  /** 이름을 받아 소리를 구성한다. 오프라인 렌더링으로도 검사할 수 있다 */
  compose(ctx, out, name, t0, arg) {
    const t = t0;
    switch (name) {
      case 'ui':
        this.sweep(ctx, out, t, 'triangle', 820, 980, 0.05, 0.2);
        break;
      case 'gauge':
        this.sweep(ctx, out, t, 'square', 330, 660, 0.09, 0.09);
        break;
      case 'lock':
        this.sweep(ctx, out, t, 'triangle', 880, 880, 0.06, 0.24);
        this.sweep(ctx, out, t + 0.05, 'triangle', 1320, 1320, 0.08, 0.2);
        break;
      case 'whoosh':
        this.burst(ctx, out, t, 'bandpass', 420, 2800, 1.5, 0.17, 0.5, 0.11);
        break;
      case 'hit':
        this.strike(ctx, out, t, arg || '1W');
        break;
      case 'hitPerfect':
        this.strike(ctx, out, t, arg || '1W');
        this.sweep(ctx, out, t, 'sine', 118, 42, 0.36, 0.9);
        this.burst(ctx, out, t + 0.01, 'lowpass', 1800, 180, 0.7, 0.26, 0.42);
        [1568, 2093, 2637, 3136].forEach((f, i) => {
          this.sweep(ctx, out, t + 0.05 + i * 0.05, 'sine', f, f, 0.22, 0.19);
          this.sweep(ctx, out, t + 0.05 + i * 0.05, 'triangle', f * 2, f * 2, 0.1, 0.05);
        });
        this.burst(ctx, out, t + 0.05, 'highpass', 6000, 9000, 0.6, 0.36, 0.1, 0.03);
        break;
      case 'bounce':
        if (arg === 'bunker') this.burst(ctx, out, t, 'lowpass', 1300, 260, 0.6, 0.12, 1.2, 0.006);
        else if (arg === 'green') {
          this.sweep(ctx, out, t, 'sine', 520, 260, 0.05, 0.2);
          this.burst(ctx, out, t, 'bandpass', 1200, 900, 1, 0.025, 0.12);
        } else {
          this.sweep(ctx, out, t, 'sine', 240, 110, 0.07, 0.3);
          this.burst(ctx, out, t, 'lowpass', 1400, 400, 0.7, 0.05, 0.2);
        }
        break;
      case 'splash':
        this.burst(ctx, out, t, 'lowpass', 3800, 480, 0.7, 0.55, 0.62, 0.012);
        this.burst(ctx, out, t + 0.05, 'highpass', 2600, 4200, 0.7, 0.28, 0.18, 0.02);
        for (let i = 0; i < 5; i++) {
          const f = 340 + i * 150;
          this.sweep(ctx, out, t + 0.16 + i * 0.06, 'sine', f, f * 1.85, 0.07, 0.15);
        }
        break;
      case 'cup': {
        // 컵 벽에 부딪히는 달그락 → 바닥에 툭 → 맑은 알림
        [[0, 0.5], [0.09, 0.42], [0.16, 0.32], [0.215, 0.22], [0.255, 0.14]].forEach(([d, peak]) => {
          this.burst(ctx, out, t + d, 'bandpass', 2100, 1500, 3, 0.022, peak);
          this.sweep(ctx, out, t + d, 'triangle', 1350, 860, 0.03, peak * 0.55);
        });
        this.sweep(ctx, out, t + 0.31, 'sine', 330, 92, 0.15, 0.85);
        this.burst(ctx, out, t + 0.31, 'lowpass', 700, 180, 0.7, 0.09, 0.4);
        [1047, 1319, 1760].forEach((f, i) => {
          this.sweep(ctx, out, t + 0.44 + i * 0.09, 'sine', f, f, 0.42, 0.27);
          this.sweep(ctx, out, t + 0.44 + i * 0.09, 'triangle', f * 2, f * 2, 0.16, 0.06);
        });
        break;
      }
      case 'rock':
        this.burst(ctx, out, t, 'highpass', 2400, 1600, 0.8, 0.018, 0.9);
        this.sweep(ctx, out, t, 'triangle', 1900, 1180, 0.05, 0.42);
        this.sweep(ctx, out, t, 'sine', 3600, 3100, 0.035, 0.18);
        break;
      case 'lip':
        this.burst(ctx, out, t, 'bandpass', 2000, 1400, 3, 0.025, 0.5);
        this.sweep(ctx, out, t, 'triangle', 1200, 700, 0.05, 0.3);
        break;
      case 'coin':
        [988, 1319].forEach((f, i) => {
          this.sweep(ctx, out, t + i * 0.075, 'square', f, f, 0.11, 0.1);
          this.sweep(ctx, out, t + i * 0.075, 'sine', f * 2, f * 2, 0.16, 0.08);
        });
        break;
      case 'fanfare':
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          this.sweep(ctx, out, t + i * 0.1, 'triangle', f, f, 0.34, 0.24);
          this.sweep(ctx, out, t + i * 0.1, 'sine', f / 2, f / 2, 0.3, 0.14);
        });
        break;
      default:
        break;
    }
  },

  play(name, arg) {
    if (this.muted || !this.ctx) return;
    this.compose(this.ctx, this.bus, name, this.ctx.currentTime + 0.001, arg);
  },
};
