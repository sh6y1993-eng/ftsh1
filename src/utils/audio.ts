// Procedural sound synthesizer using Web Audio API
class SoundEffects {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Lazy audio context init on user gesture
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Quick UI click / tile tap
  public playTap() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(720, this.ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Audio fallback silent
    }
  }

  // TV / Remote focus tick
  public playTick() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {
      // Ignore
    }
  }

  // Found correct word fanfare
  public playWordFound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);

        gain.gain.setValueAtTime(0.15, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.22);
      });
    } catch {
      // Ignore
    }
  }

  // Opponent claimed word (multiplayer rival snatch alert + point chime)
  public playOpponentFound(streak: number = 1) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Urgent rival alert swoosh (dramatic descending + rising synth)
      const swoop = this.ctx.createOscillator();
      const swoopGain = this.ctx.createGain();
      swoop.type = 'sawtooth';
      swoop.frequency.setValueAtTime(520, now);
      swoop.frequency.exponentialRampToValueAtTime(240, now + 0.11);
      swoop.frequency.exponentialRampToValueAtTime(380, now + 0.22);

      swoopGain.gain.setValueAtTime(0.11, now);
      swoopGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      swoop.connect(swoopGain);
      swoopGain.connect(this.ctx.destination);
      swoop.start(now);
      swoop.stop(now + 0.24);

      // 2. Rival point counter double-ping so you hear they scored a point
      const rivalNotes = streak >= 2 ? [440, 554.37, 659.25] : [440, 523.25];
      rivalNotes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        const startAt = now + 0.08 + idx * 0.065;
        osc.frequency.setValueAtTime(freq, startAt);
        gain.gain.setValueAtTime(0.13, startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.16);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(startAt);
        osc.stop(startAt + 0.16);
      });
    } catch {
      // Ignore
    }
  }

  // Enthusiastic Multiplayer Word Discovery & Point Scored Fanfare
  public playMultiplayerWordScore(streak: number = 1, playerIndex: number = 0) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Pitch multiplier scales up with streak for extra excitement
      const clampedStreak = Math.min(Math.max(1, streak), 6);
      const streakSemiShift = Math.pow(2, (clampedStreak - 1) * 1.5 / 12);
      // Slight player signature offset in local party mode
      const playerShift = Math.pow(2, (playerIndex % 4) * 0.5 / 12);
      const pitchFactor = streakSemiShift * playerShift;

      // 1. Sub-bass impact punch (gives physical excitement on word catch)
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(135, now);
      bassOsc.frequency.exponentialRampToValueAtTime(48, now + 0.18);
      bassGain.gain.setValueAtTime(0.28, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      bassOsc.connect(bassGain);
      bassGain.connect(this.ctx.destination);
      bassOsc.start(now);
      bassOsc.stop(now + 0.2);

      // 2. Enthusiastic ascending brass/synth fanfare chord arpeggio
      const baseChord = [523.25, 659.25, 783.99, 1046.5, 1318.51]; // C5, E5, G5, C6, E6
      baseChord.forEach((baseFreq, i) => {
        const freq = baseFreq * pitchFactor;
        const start = now + i * 0.055;
        const duration = i === baseChord.length - 1 ? 0.38 : 0.22;

        // Warm triangle lead
        const osc1 = this.ctx!.createOscillator();
        const gain1 = this.ctx!.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, start);
        gain1.gain.setValueAtTime(0.18, start);
        gain1.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc1.connect(gain1);
        gain1.connect(this.ctx!.destination);
        osc1.start(start);
        osc1.stop(start + duration);

        // Bright harmonic overtone for arcade excitement
        const osc2 = this.ctx!.createOscillator();
        const gain2 = this.ctx!.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 1.5, start);
        gain2.gain.setValueAtTime(0.07, start);
        gain2.gain.exponentialRampToValueAtTime(0.001, start + duration * 0.85);
        osc2.connect(gain2);
        gain2.connect(this.ctx!.destination);
        osc2.start(start);
        osc2.stop(start + duration * 0.85);
      });

      // 3. Crisp "Point Awarded" Golden Coin Double-Bell Chime
      const coinTimes = [now + 0.18, now + 0.26];
      const coinFreqs = [1567.98 * streakSemiShift, 2093.0 * streakSemiShift]; // G6 -> C7
      coinTimes.forEach((t, idx) => {
        const bell = this.ctx!.createOscillator();
        const bellGain = this.ctx!.createGain();
        bell.type = 'sine';
        bell.frequency.setValueAtTime(coinFreqs[idx], t);
        bellGain.gain.setValueAtTime(0.16, t);
        bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        bell.connect(bellGain);
        bellGain.connect(this.ctx!.destination);
        bell.start(t);
        bell.stop(t + 0.32);
      });

      // 4. Extra Combo Streak Sparkle Run when streak >= 2
      if (clampedStreak >= 2) {
        const sparkleNotes = [1046.5, 1318.5, 1567.98, 2093.0, 2637.02];
        sparkleNotes.forEach((sf, sIdx) => {
          const spOsc = this.ctx!.createOscillator();
          const spGain = this.ctx!.createGain();
          const st = now + 0.25 + sIdx * 0.04;
          spOsc.type = 'sine';
          spOsc.frequency.setValueAtTime(sf * streakSemiShift, st);
          spGain.gain.setValueAtTime(0.11, st);
          spGain.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
          spOsc.connect(spGain);
          spGain.connect(this.ctx!.destination);
          spOsc.start(st);
          spOsc.stop(st + 0.18);
        });
      }
    } catch {
      // Ignore
    }
  }

  // Special Stadium Horn / Crown Fanfare when a player takes the lead in Multiplayer
  public playLeadChangeFanfare() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Triumphant brass-like motif: G5 -> G5 -> G5 -> Eb5 -> Bb5 -> G5 -> Eb5 -> Bb5 -> G6
      const notes = [
        { f: 783.99, t: 0.0, d: 0.1 },
        { f: 783.99, t: 0.11, d: 0.1 },
        { f: 783.99, t: 0.22, d: 0.14 },
        { f: 1046.5, t: 0.38, d: 0.42 }
      ];

      notes.forEach(n => {
        const osc = this.ctx!.createOscillator();
        const sub = this.ctx!.createOscillator();
        const filter = this.ctx!.createBiquadFilter();
        const gain = this.ctx!.createGain();

        osc.type = 'sawtooth';
        sub.type = 'triangle';
        osc.frequency.setValueAtTime(n.f, now + n.t);
        sub.frequency.setValueAtTime(n.f * 0.5, now + n.t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2400, now + n.t);

        gain.gain.setValueAtTime(0.13, now + n.t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + n.t);
        sub.start(now + n.t);
        osc.stop(now + n.t + n.d);
        sub.stop(now + n.t + n.d);
      });
    } catch {
      // Ignore
    }
  }

  // Error / Invalid word buzzer
  public playError() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(130, now + 0.08);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // Ignore
    }
  }

  // Level Complete / Victory Celebration
  public playVictory() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Arabesque victory chime progression + harmonic bass
      const melody = [
        { f: 440, t: 0.0, d: 0.15 },
        { f: 554.37, t: 0.15, d: 0.15 },
        { f: 659.25, t: 0.3, d: 0.15 },
        { f: 880, t: 0.45, d: 0.4 },
        { f: 783.99, t: 0.9, d: 0.15 },
        { f: 880, t: 1.1, d: 0.65 },
      ];

      melody.forEach(n => {
        const osc = this.ctx!.createOscillator();
        const overtone = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        overtone.type = 'sine';
        osc.frequency.setValueAtTime(n.f, now + n.t);
        overtone.frequency.setValueAtTime(n.f * 2, now + n.t);

        gain.gain.setValueAtTime(0.18, now + n.t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + n.t);
        overtone.start(now + n.t);
        osc.stop(now + n.t + n.d);
        overtone.stop(now + n.t + n.d);
      });
    } catch {
      // Ignore
    }
  }

  // Hint activated
  public playHint() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.25);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }
}

export const sounds = new SoundEffects();

