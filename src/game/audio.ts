/**
 * Warm, tactile procedural Web Audio engine for Courier Field:
 * - Master DynamicsCompressor + gentle warm tone bus
 * - Speed-reactive purring twin-oscillator courier van engine + turbo whine (silenced on pause/menu/mute)
 * - Cozy sunlit marimba/kalimba background groove + upbeat Fever Shift overdrive
 * - Layered foley + harmonic chimes for cardboard tosses, bullseye bells, musical horns,
 *   near-miss slipstreams, canal jump launches, wrench repairs, duck quacks, hydrant splashes,
 *   scooter/drawbridge telegraphs, tickets, and Lucky Spin rewards.
 */
class PokoAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean = false;

  // Continuous speed-reactive van engine nodes
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Cozy marimba background loop timer
  private musicActive: boolean = false;
  private feverActive: boolean = false;
  private musicTimerId: number | null = null;
  private musicStep: number = 0;
  private lastAiCrashAtMs: number = 0;
  private lastPlayerCrashAtMs: number = 0;
  private lastAmbientHornAtMs: number = 0;
  private lastBirdChirpAtMs: number = 0;
  private lastRevAtMs: number = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        mute ? 0.0001 : 0.85,
        this.ctx.currentTime,
        0.03,
      );
    }
    if (mute) {
      this.silenceEngineImmediate();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playUiClick();
    }
    return this.muted;
  }

  public setFeverMode(fever: boolean): void {
    if (this.feverActive === fever) return;
    this.feverActive = fever;
    if (this.musicActive) {
      this.restartMusicInterval();
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 18;
      comp.ratio.value = 4;
      comp.attack.value = 0.006;
      comp.release.value = 0.16;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);

      // Pre-build 0.5s soft white/pink noise buffer for cardboard & air foley
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, length, sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      }
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private ensureEngineNodes(ctx: AudioContext): void {
    if (this.engineGain || !this.masterGain) return;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 180;
    this.engineFilter.Q.value = 1.6;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0001;

    this.engineOscA = ctx.createOscillator();
    this.engineOscA.type = 'triangle';
    this.engineOscA.frequency.value = 58;

    this.engineOscB = ctx.createOscillator();
    this.engineOscB.type = 'sawtooth';
    this.engineOscB.frequency.value = 116.5;

    const subMixB = ctx.createGain();
    subMixB.gain.value = 0.28;

    this.engineOscA.connect(this.engineFilter);
    this.engineOscB.connect(subMixB);
    subMixB.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOscA.start();
    this.engineOscB.start();
  }

  private silenceEngineImmediate(): void {
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.04);
    }
  }

  public updateEngine(speed: number, isBoosting: boolean, isPlaying: boolean): void {
    if (this.muted || !isPlaying) {
      this.silenceEngineImmediate();
      return;
    }
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.ensureEngineNodes(this.ctx);
    if (!this.engineOscA || !this.engineOscB || !this.engineFilter || !this.engineGain) {
      return;
    }

    const now = this.ctx.currentTime;
    const norm = Math.min(1.4, Math.max(0, speed / 8.6));
    const baseFreq = 54 + norm * 56 + (isBoosting ? 28 : 0);
    const cutoff = 165 + norm * 340 + (isBoosting ? 280 : 0);
    const targetVol = 0.016 + norm * 0.032 + (isBoosting ? 0.018 : 0);

    this.engineOscA.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.engineOscB.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.07);
    this.engineGain.gain.setTargetAtTime(targetVol, now, 0.06);
  }

  private restartMusicInterval(): void {
    if (typeof window === 'undefined') return;
    if (this.musicTimerId !== null) {
      window.clearInterval(this.musicTimerId);
      this.musicTimerId = null;
    }
    if (!this.musicActive) return;

    const progression = [
      [523.25, 659.25, 783.99, 987.77, 1174.66, 783.99, 659.25, 783.99],
      [349.23, 440.0, 523.25, 659.25, 783.99, 659.25, 523.25, 440.0],
      [293.66, 440.0, 523.25, 659.25, 880.0, 659.25, 523.25, 440.0],
      [392.0, 493.88, 587.33, 659.25, 783.99, 659.25, 587.33, 493.88],
    ];

    const stepMs = this.feverActive ? 168 : 220;
    this.musicTimerId = window.setInterval(() => {
      if (!this.musicActive || this.muted || !this.ctx || this.ctx.state !== 'running') {
        return;
      }
      const bar = Math.floor(this.musicStep / 8) % progression.length;
      const beat = this.musicStep % 8;
      this.musicStep++;

      if (!this.feverActive && beat === 5) return;
      const noteFreq = progression[bar][beat];
      const accent = beat === 0 || beat === 3 ? 0.036 : 0.022;
      this.playMarimbaPluck(noteFreq, accent);
      if (this.feverActive && beat % 2 === 0) {
        this.playMarimbaPluck(noteFreq * 2, 0.015);
      }
      if (beat === 0) {
        this.playTone(noteFreq * 0.5, 0.26, 'sine', 0.034, 0);
      }
    }, stepMs);
  }

  public setMusicPlaying(active: boolean): void {
    if (this.musicActive === active) return;
    this.musicActive = active;

    if (!active) {
      if (this.musicTimerId !== null && typeof window !== 'undefined') {
        window.clearInterval(this.musicTimerId);
        this.musicTimerId = null;
      }
      this.feverActive = false;
      this.silenceEngineImmediate();
      return;
    }

    this.restartMusicInterval();
  }

  private playMarimbaPluck(freq: number, gainPeak: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const overtone = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const otGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 4, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

    otGain.gain.setValueAtTime(0.0001, now);
    otGain.gain.linearRampToValueAtTime(gainPeak * 0.25, now + 0.004);
    otGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(gain);
    overtone.connect(otGain);
    otGain.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 0.21);
    overtone.stop(now + 0.06);
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak: number = 0.13,
    delay: number = 0,
    slideToFreq?: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(24, slideToFreq),
        now + duration,
      );
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(
      type === 'sawtooth' || type === 'square' ? 1900 : 4200,
      now,
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.025);
  }

  private playFilteredNoise(
    duration: number,
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    q: number,
    gainPeak: number,
    delay: number = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(now);
    src.stop(now + duration + 0.02);
  }

  public playUiClick(): void {
    const jitter = 0.96 + Math.random() * 0.08;
    this.playTone(680 * jitter, 0.055, 'triangle', 0.075, 0, 920 * jitter);
  }

  public playStartChime(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.playTone(f, 0.18, 'triangle', 0.12, i * 0.055);
      this.playTone(f * 2, 0.11, 'sine', 0.045, i * 0.055);
    });
  }

  public playTossWhoosh(): void {
    const jitter = 0.93 + Math.random() * 0.14;
    this.playFilteredNoise(0.16, 'bandpass', 420 * jitter, 1650 * jitter, 2.2, 0.15, 0);
    this.playTone(280 * jitter, 0.13, 'sine', 0.09, 0, 640 * jitter);
  }

  public playDeliverySuccess(combo: number, expressToss: boolean, bullseye: boolean = false): void {
    const semitoneBoost = Math.min(8, combo - 1);
    const mult = Math.pow(2, semitoneBoost / 12);

    this.playTone(135, 0.08, 'sine', 0.11, 0.02, 72);
    this.playFilteredNoise(0.06, 'lowpass', 600, 180, 1.0, 0.09, 0.02);

    this.playTone(587.33 * mult, 0.16, 'triangle', 0.14, 0.03);
    this.playTone(739.99 * mult, 0.17, 'triangle', 0.13, 0.085);
    this.playTone(880.0 * mult, 0.21, 'triangle', 0.14, 0.14);
    if (expressToss) {
      this.playTone(1174.66 * mult, 0.26, 'sine', 0.14, 0.19);
      this.playTone(1760.0 * mult, 0.2, 'sine', 0.075, 0.23);
    }
    if (bullseye) {
      // Golden Bullseye Bell Flourish!
      this.playTone(1567.98 * mult, 0.28, 'sine', 0.15, 0.24);
      this.playTone(2093.0 * mult, 0.25, 'triangle', 0.09, 0.29);
    }
  }

  public playMusicalHorn(): void {
    // Cheerful Italian-courier 3-note brass melody ("la-cu-ca" triad!)
    const melody = [
      { f: 523.25, d: 0.085, t: 0 },
      { f: 659.25, d: 0.085, t: 0.09 },
      { f: 783.99, d: 0.16, t: 0.18 },
    ];
    for (const m of melody) {
      this.playTone(m.f, m.d, 'sawtooth', 0.07, m.t);
      this.playTone(m.f * 2, m.d, 'triangle', 0.045, m.t);
    }
  }

  public playNearMissWhoosh(): void {
    const jitter = 0.94 + Math.random() * 0.12;
    this.playFilteredNoise(0.18, 'bandpass', 1400 * jitter, 420 * jitter, 2.0, 0.12, 0);
    this.playTone(880 * jitter, 0.11, 'sine', 0.065, 0.02, 1320 * jitter);
  }

  public playJumpLaunch(): void {
    this.playTone(210, 0.24, 'triangle', 0.14, 0, 620);
    this.playTone(420, 0.22, 'sine', 0.08, 0.04, 980);
  }

  public playMechanicWrench(): void {
    // Ratchet metallic clink + warm shield power-up chord
    this.playTone(1240, 0.06, 'square', 0.06, 0, 1560);
    this.playTone(1480, 0.06, 'square', 0.06, 0.065, 1820);
    this.playTone(523.25, 0.2, 'triangle', 0.11, 0.12);
    this.playTone(783.99, 0.24, 'triangle', 0.12, 0.17);
  }

  public playDuckQuack(): void {
    // Cute friendly cartoon duck "quack-quack!"
    for (const d of [0, 0.13]) {
      this.playTone(440, 0.09, 'sawtooth', 0.06, d, 310);
      this.playFilteredNoise(0.08, 'bandpass', 950, 620, 3.2, 0.08, d);
    }
  }

  public playHydrantSplash(): void {
    this.playFilteredNoise(0.28, 'bandpass', 900, 2400, 1.4, 0.14, 0);
    this.playTone(740, 0.14, 'sine', 0.07, 0.03, 1280);
  }

  public playSpinReward(): void {
    const notes = [587.33, 783.99, 987.77, 1174.66, 1567.98];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.22, 'triangle', 0.12, idx * 0.055);
    });
  }

  public playBoost(): void {
    const jitter = 0.95 + Math.random() * 0.1;
    this.playFilteredNoise(0.24, 'bandpass', 350, 2100, 1.8, 0.14, 0);
    this.playTone(240 * jitter, 0.24, 'triangle', 0.13, 0, 580 * jitter);
    this.playTone(480 * jitter, 0.2, 'sine', 0.09, 0.04, 920 * jitter);
  }

  public playWindupTelegraph(isGate: boolean): void {
    if (isGate) {
      this.playTone(880, 0.14, 'triangle', 0.085, 0);
      this.playTone(1760, 0.08, 'sine', 0.04, 0);
      this.playTone(698.46, 0.16, 'triangle', 0.085, 0.13);
    } else {
      for (const d of [0, 0.085]) {
        this.playTone(1396.9, 0.09, 'sine', 0.08, d);
        this.playTone(2093.0, 0.065, 'triangle', 0.045, d + 0.01);
      }
    }
  }

  public playTrafficHorn(): void {
    const jitter = 0.96 + Math.random() * 0.08;
    for (const d of [0, 0.12]) {
      this.playTone(440 * jitter, 0.09, 'sawtooth', 0.055, d);
      this.playTone(554.37 * jitter, 0.09, 'triangle', 0.065, d);
    }
  }

  public playCurbBump(): void {
    const jitter = 0.92 + Math.random() * 0.16;
    this.playTone(130 * jitter, 0.095, 'sine', 0.11, 0, 62);
    this.playFilteredNoise(0.065, 'lowpass', 380, 120, 1.2, 0.08, 0);
  }

  public playDamageHit(): void {
    this.playCrashImpact('crash', 'vehicle');
  }

  /**
   * Playful cartoon arcade crash + musical sting effect:
   * - Crunchy fender-bender metallic/cardboard percussion burst
   * - Punchy bass thump + boingy spring/hubcap wobble
   * - Upbeat comedic brass/marimba "bonk/oops!" musical chord sting
   * - Startled dual-tone car horn on vehicle/rival impacts
   */
  public playCrashImpact(
    severity: 'bump' | 'crash',
    kind: 'vehicle' | 'building' | 'prop' | 'gate' | 'rival' | 'ai_vehicle',
  ): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastPlayerCrashAtMs < 140) return;
    this.lastPlayerCrashAtMs = nowMs;

    const jitter = 0.94 + Math.random() * 0.12;
    const isHeavy = severity === 'crash';

    // 1. Crunchy cartoon crash percussion + low-end bumper thud
    this.playFilteredNoise(
      isHeavy ? 0.24 : 0.14,
      'bandpass',
      (isHeavy ? 920 : 640) * jitter,
      155,
      1.5,
      isHeavy ? 0.19 : 0.12,
      0,
    );
    this.playTone(
      (isHeavy ? 195 : 155) * jitter,
      isHeavy ? 0.22 : 0.13,
      'sawtooth',
      isHeavy ? 0.13 : 0.085,
      0,
      isHeavy ? 52 : 68,
    );

    // 2. Boingy cartoon spring / hubcap wobble
    this.playTone(
      (kind === 'gate' || kind === 'prop' ? 320 : 250) * jitter,
      isHeavy ? 0.22 : 0.16,
      'triangle',
      isHeavy ? 0.12 : 0.085,
      0.035,
      (kind === 'gate' || kind === 'prop' ? 540 : 415) * jitter,
    );

    // 3. Playful musical "Oops / Bonk!" marimba-brass chord sting matching the game's upbeat groove!
    if (isHeavy) {
      // Quirky descending 3-note comic brass-marimba sting (G5 -> Eb5 -> C5)
      const sting = [783.99, 622.25, 523.25];
      sting.forEach((f, idx) => {
        this.playTone(f * jitter, 0.12, 'triangle', 0.095, 0.05 + idx * 0.055);
        this.playTone(f * 0.5 * jitter, 0.11, 'sawtooth', 0.045, 0.05 + idx * 0.055);
      });
    } else {
      // Light bouncy 2-note marimba bonk (E5 -> C5) for wall/prop/gate bumps!
      this.playTone(659.25 * jitter, 0.09, 'triangle', 0.085, 0.03);
      this.playTone(523.25 * jitter, 0.12, 'triangle', 0.085, 0.085);
    }

    // 4. Startled car horn on vehicle or rival courier fender-benders
    if (kind === 'vehicle' || kind === 'rival') {
      this.playTrafficHorn();
    } else if (kind === 'gate') {
      // Metallic crossing-bell clank on drawbridge gate hit
      this.playTone(1318.5 * jitter, 0.14, 'sine', 0.075, 0.02);
    }
  }

  /**
   * Subtle, throttled nearby AI-to-AI fender-bender pop + tiny honk so street traffic feels physically alive
   * without overwhelming the player's audio mix!
   */
  public playAiFenderBender(): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastAiCrashAtMs < 750) return;
    this.lastAiCrashAtMs = nowMs;

    const jitter = 0.94 + Math.random() * 0.12;
    this.playFilteredNoise(0.11, 'bandpass', 580 * jitter, 180, 1.4, 0.07, 0);
    this.playTone(175 * jitter, 0.11, 'triangle', 0.065, 0, 78);
    this.playTone(523.25 * jitter, 0.08, 'sawtooth', 0.038, 0.04);
    this.playTone(659.25 * jitter, 0.08, 'triangle', 0.042, 0.04);
  }


  public playTimerTick(urgent: boolean): void {
    this.playTone(urgent ? 987.77 : 783.99, 0.055, 'sine', urgent ? 0.075 : 0.045, 0);
  }

  public playStageClear(): void {
    this.silenceEngineImmediate();
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    chord.forEach((f, idx) => {
      this.playTone(f, 0.32, 'triangle', 0.13, idx * 0.07);
      this.playTone(f * 2, 0.2, 'sine', 0.045, idx * 0.07 + 0.015);
    });
  }

  public playTicketCitation(): void {
    this.playFilteredNoise(0.045, 'highpass', 1800, 3200, 1.8, 0.12, 0);
    for (const d of [0.02, 0.14]) {
      this.playTone(2480, 0.095, 'sine', 0.1, d, 2720);
      this.playTone(2590, 0.085, 'triangle', 0.055, d + 0.015, 2320);
    }
  }

  public playCoffeePickup(): void {
    this.playFilteredNoise(0.14, 'bandpass', 1200, 2600, 2.0, 0.09, 0);
    const notes = [659.25, 880.0, 1318.51];
    notes.forEach((f, i) => {
      this.playTone(f, 0.16, 'triangle', 0.11, 0.03 + i * 0.055);
    });
  }

  public playGameOver(): void {
    this.silenceEngineImmediate();
    const notes = [440, 392, 349.23, 293.66];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.26, 'triangle', 0.12, idx * 0.115);
    });
  }

  /**
   * 3 - 2 - 1 - GO! Storybook Arcade Countdown Chimes:
   * Crisp ascending marimba + warm brass fifths on 3, 2, 1, and a jubilant full-chord fanfare on GO!
   */
  public playCountdownBeep(stage: 3 | 2 | 1 | 0): void {
    if (stage === 0) {
      const goChord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      goChord.forEach((f, idx) => {
        this.playTone(f, 0.28, 'triangle', 0.125, idx * 0.022);
        this.playTone(f * 0.5, 0.22, 'sawtooth', 0.045, idx * 0.022);
      });
      this.playTone(1046.5, 0.22, 'sine', 0.095, 0.04, 1567.98);
      return;
    }

    const rootFreq = stage === 3 ? 523.25 : stage === 2 ? 587.33 : 659.25;
    this.playTone(rootFreq, 0.16, 'triangle', 0.13, 0);
    this.playTone(rootFreq * 1.5, 0.13, 'sine', 0.075, 0.012);
    this.playTone(rootFreq * 0.5, 0.14, 'sawtooth', 0.045, 0);
    this.playFilteredNoise(0.035, 'bandpass', 1400, 900, 2.5, 0.06, 0);
  }

  /**
   * Playful courier van throttle blip during the 2 -> 1 countdown rev-up!
   */
  public playCountdownRev(intensity: number = 1): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastRevAtMs < 190) return;
    this.lastRevAtMs = nowMs;

    const clamped = Math.max(0.5, Math.min(1.5, intensity));
    const base = 78 * clamped;
    this.playTone(base, 0.16, 'sawtooth', 0.058, 0, base * 1.55);
    this.playTone(base * 2, 0.14, 'triangle', 0.045, 0.01, base * 2.9);
    this.playFilteredNoise(0.1, 'lowpass', 460, 220, 1.4, 0.045, 0);
  }

  /**
   * Harmless comedic exhaust cough when gas is mashed too early before "1"!
   */
  public playEngineSputter(): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastRevAtMs < 260) return;
    this.lastRevAtMs = nowMs;

    this.playFilteredNoise(0.11, 'bandpass', 420, 140, 2.2, 0.1, 0);
    this.playTone(115, 0.1, 'sawtooth', 0.065, 0, 62);
    this.playTone(96, 0.11, 'triangle', 0.06, 0.09, 54);
  }

  /**
   * Golden Rocket Start Turbo Ignition + Triumphant Brass Triad!
   */
  public playRocketStart(): void {
    this.playFilteredNoise(0.28, 'bandpass', 420, 2600, 1.9, 0.16, 0);
    this.playTone(220, 0.26, 'sawtooth', 0.085, 0, 660);
    const fanfare = [783.99, 987.77, 1174.66, 1567.98];
    fanfare.forEach((f, i) => {
      this.playTone(f, 0.2, 'triangle', 0.115, 0.03 + i * 0.045);
    });
  }

  /**
   * Spatialized Ambient AI Car & City Minibus Horns ("beep-beep!" / "hooonk!")
   */
  public playAmbientCarHorn(isBus: boolean = false, volumeScale: number = 1): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastAmbientHornAtMs < 920) return;
    this.lastAmbientHornAtMs = nowMs;

    const vol = Math.max(0.15, Math.min(1, volumeScale));
    const jitter = 0.95 + Math.random() * 0.1;

    if (isBus) {
      // Warm deeper twin-airhorn city shuttle honk
      for (const d of [0, 0.17]) {
        const dur = d === 0 ? 0.12 : 0.2;
        this.playTone(233.08 * jitter, dur, 'sawtooth', 0.048 * vol, d);
        this.playTone(293.66 * jitter, dur, 'triangle', 0.056 * vol, d);
      }
    } else {
      // Friendly European compact sedan double-beep!
      const pitchPick = Math.random() < 0.5 ? 1.0 : 1.12;
      const f1 = 440 * pitchPick * jitter;
      const f2 = 554.37 * pitchPick * jitter;
      for (const d of [0, 0.105]) {
        this.playTone(f1, 0.078, 'sawtooth', 0.042 * vol, d);
        this.playTone(f2, 0.078, 'triangle', 0.052 * vol, d);
      }
    }
  }

  /**
   * Sunny Harbor & Park Songbird Chirp / Trill!
   */
  public playBirdChirp(volumeScale: number = 1): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastBirdChirpAtMs < 1350) return;
    this.lastBirdChirpAtMs = nowMs;

    const vol = Math.max(0.2, Math.min(1, volumeScale));
    const base = 2150 + Math.random() * 620;
    const notes = Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < notes; i++) {
      const t = i * 0.078;
      const startF = base * (1 + i * 0.08);
      const endF = startF * (i % 2 === 0 ? 1.28 : 0.86);
      this.playTone(startF, 0.062, 'sine', 0.036 * vol, t, endF);
      this.playTone(startF * 2, 0.045, 'sine', 0.012 * vol, t + 0.006, endF * 2);
    }
  }

  /**
   * Sparkling Gold Coin Clink when a cheering customer tosses tip coins onto the van roof!
   */
  public playCoinTossClink(coinIdx: number = 0): void {
    const stepMult = Math.pow(2, (coinIdx % 4) * (2 / 12));
    this.playTone(1567.98 * stepMult, 0.09, 'sine', 0.065, 0);
    this.playTone(2349.32 * stepMult, 0.13, 'triangle', 0.05, 0.025);
  }
}

export const pokoAudio = new PokoAudioEngine();
