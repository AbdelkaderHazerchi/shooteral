/**
 * Procedural Web Audio API Sound System for BOOT SHOOT
 * Call of Duty-inspired punchy layered weapon transients, crack, bolt mechanics & hitmarkers.
 * Zero external audio files, completely reliable and responsive.
 */

class SoundSystem {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;
  public masterVolume: number = 0.7;
  private noiseBuffer: AudioBuffer | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.noiseBuffer && this.ctx) {
      const length = this.ctx.sampleRate * 2.5;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
  }

  public enable() {
    this.initCtx();
  }

  // --- Layered CoD-Style Gunshots ---
  public playGunshot(
    type: 'pistol' | 'deagle' | 'smg' | 'ak47' | 'm4a1' | 'awp' | 'knife',
    distanceAttenuation = 1.0
  ) {
    if (this.muted || distanceAttenuation <= 0.04) return;
    this.initCtx();
    if (!this.ctx || !this.noiseBuffer) return;

    const t = this.ctx.currentTime;
    const vol = this.masterVolume * Math.min(1, distanceAttenuation);
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(vol, t);
    master.connect(this.ctx.destination);

    if (type === 'knife') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.13);
      gain.gain.setValueAtTime(0.45 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.13);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.14);
      return;
    }

    // 1) Supersonic Crack / Transient Snap (CoD crisp high-freq snap)
    const crackDuration = type === 'awp' ? 0.55 : type === 'deagle' || type === 'ak47' ? 0.28 : 0.18;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.value = type === 'm4a1' ? 1.2 : 0.8;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';

    const noiseGain = this.ctx.createGain();

    // 2) Sub-bass Chest Punch Oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    // 3) Metallic Mechanical Bolt Click
    const boltOsc = this.ctx.createOscillator();
    const boltGain = this.ctx.createGain();

    if (type === 'awp') {
      bandpass.frequency.setValueAtTime(1800, t);
      lowpass.frequency.setValueAtTime(3400, t);
      lowpass.frequency.exponentialRampToValueAtTime(90, t + 0.55);
      noiseGain.gain.setValueAtTime(1.15, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.62);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.35);
      oscGain.gain.setValueAtTime(1.0, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      // Bolt action ring
      boltOsc.type = 'square';
      boltOsc.frequency.setValueAtTime(2200, t + 0.32);
      boltOsc.frequency.setValueAtTime(1600, t + 0.42);
      boltGain.gain.setValueAtTime(0.001, t);
      boltGain.gain.setValueAtTime(0.14, t + 0.32);
      boltGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    } else if (type === 'ak47') {
      bandpass.frequency.setValueAtTime(2100, t);
      lowpass.frequency.setValueAtTime(3600, t);
      lowpass.frequency.exponentialRampToValueAtTime(180, t + 0.25);
      noiseGain.gain.setValueAtTime(0.95, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(195, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      oscGain.gain.setValueAtTime(0.65, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      boltOsc.type = 'triangle';
      boltOsc.frequency.setValueAtTime(3100, t);
      boltGain.gain.setValueAtTime(0.22, t);
      boltGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    } else if (type === 'm4a1') {
      bandpass.frequency.setValueAtTime(1500, t);
      lowpass.frequency.setValueAtTime(2200, t);
      lowpass.frequency.exponentialRampToValueAtTime(130, t + 0.2);
      noiseGain.gain.setValueAtTime(0.75, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(155, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.15);
      oscGain.gain.setValueAtTime(0.55, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      boltOsc.type = 'sine';
      boltOsc.frequency.setValueAtTime(2600, t);
      boltGain.gain.setValueAtTime(0.18, t);
      boltGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    } else if (type === 'deagle') {
      bandpass.frequency.setValueAtTime(2400, t);
      lowpass.frequency.setValueAtTime(4000, t);
      lowpass.frequency.exponentialRampToValueAtTime(150, t + 0.3);
      noiseGain.gain.setValueAtTime(1.0, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(36, t + 0.22);
      oscGain.gain.setValueAtTime(0.85, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      boltOsc.type = 'square';
      boltOsc.frequency.setValueAtTime(3500, t);
      boltGain.gain.setValueAtTime(0.24, t);
      boltGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    } else {
      // Pistol / SMG
      bandpass.frequency.setValueAtTime(1900, t);
      lowpass.frequency.setValueAtTime(2800, t);
      lowpass.frequency.exponentialRampToValueAtTime(190, t + 0.15);
      noiseGain.gain.setValueAtTime(0.65, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(165, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      oscGain.gain.setValueAtTime(0.45, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      boltOsc.type = 'triangle';
      boltOsc.frequency.setValueAtTime(2800, t);
      boltGain.gain.setValueAtTime(0.15, t);
      boltGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    }

    noise.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(master);

    osc.connect(oscGain);
    oscGain.connect(master);

    boltOsc.connect(boltGain);
    boltGain.connect(master);

    noise.start(t);
    noise.stop(t + crackDuration + 0.08);
    osc.start(t);
    osc.stop(t + crackDuration + 0.08);
    boltOsc.start(t);
    boltOsc.stop(t + crackDuration + 0.25);

    // Distant room tail / echo for player shots
    if (distanceAttenuation > 0.7 && type !== 'm4a1') {
      const tail = this.ctx.createBufferSource();
      tail.buffer = this.noiseBuffer;
      const tailFilter = this.ctx.createBiquadFilter();
      tailFilter.type = 'lowpass';
      tailFilter.frequency.setValueAtTime(520, t + 0.05);
      const tailGain = this.ctx.createGain();
      tailGain.gain.setValueAtTime(0.001, t);
      tailGain.gain.linearRampToValueAtTime(0.18, t + 0.06);
      tailGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      tail.connect(tailFilter);
      tailFilter.connect(tailGain);
      tailGain.connect(master);
      tail.start(t);
      tail.stop(t + 0.6);
    }
  }

  // --- Shell Casing Brass Clink ---
  public playShellClink() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime + 0.18;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4200 + Math.random() * 900, t);
    gain.gain.setValueAtTime(0.06 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.045);
  }

  // --- CoD ADS Aim Sound ---
  public playADS(entering: boolean) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(entering ? 320 : 240, t);
    osc.frequency.exponentialRampToValueAtTime(entering ? 520 : 160, t + 0.05);
    gain.gain.setValueAtTime(0.12 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // --- Reload sound ---
  public playReload() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const playClick = (time: number, freq: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.24 * this.masterVolume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.09);
    };

    playClick(t + 0.1, 480);
    playClick(t + 0.7, 720);
    playClick(t + 1.25, 960);
  }

  // --- CoD Punchy Hitmarker & Headshot Dink ---
  public playHitmarker(isHeadshot = false, isKill = false) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // Signature CoD tick sound (short crisp pop)
    const tickOsc = this.ctx.createOscillator();
    const tickGain = this.ctx.createGain();
    tickOsc.type = 'triangle';
    tickOsc.frequency.setValueAtTime(1600, t);
    tickOsc.frequency.exponentialRampToValueAtTime(420, t + 0.045);
    tickGain.gain.setValueAtTime(0.45 * this.masterVolume, t);
    tickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    tickOsc.connect(tickGain);
    tickGain.connect(this.ctx.destination);
    tickOsc.start(t);
    tickOsc.stop(t + 0.055);

    if (isHeadshot) {
      // Metallic CS2 / CoD helmet crunch dink!
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2600, t);
      osc1.frequency.exponentialRampToValueAtTime(1700, t + 0.16);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(3500, t);
      osc2.frequency.exponentialRampToValueAtTime(2400, t + 0.16);

      gain.gain.setValueAtTime(0.6 * this.masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.2);
      osc2.stop(t + 0.2);
    }

    if (isKill) {
      // CoD Kill Confirmation low bass thump + chime
      const kOsc = this.ctx.createOscillator();
      const kGain = this.ctx.createGain();
      kOsc.type = 'sine';
      kOsc.frequency.setValueAtTime(220, t + 0.03);
      kOsc.frequency.exponentialRampToValueAtTime(75, t + 0.18);
      kGain.gain.setValueAtTime(0.55 * this.masterVolume, t + 0.03);
      kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      kOsc.connect(kGain);
      kGain.connect(this.ctx.destination);
      kOsc.start(t + 0.03);
      kOsc.stop(t + 0.21);
    }
  }

  // --- C4 Bomb sounds ---
  public playC4Beep(pitch = 1000) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, t);
    gain.gain.setValueAtTime(0.45 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playPlantingKey() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400 + Math.random() * 400, t);
    gain.gain.setValueAtTime(0.2 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  public playDefuseKey() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800 + Math.random() * 200, t);
    gain.gain.setValueAtTime(0.18 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  public playExplosion() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx || !this.noiseBuffer) return;

    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(35, t + 2.1);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.0 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(22, t + 1.3);
    oscGain.gain.setValueAtTime(1.0 * this.masterVolume, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + 2.25);
    osc.start(t);
    osc.stop(t + 1.45);
  }

  // --- Footsteps ---
  public playFootstep() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(105 + Math.random() * 25, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.075);

    gain.gain.setValueAtTime(0.16 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  // --- UI sounds ---
  public playBuy() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.frequency.setValueAtTime(880, t);
    osc1.frequency.setValueAtTime(1320, t + 0.06);
    osc2.frequency.setValueAtTime(1760, t + 0.12);

    gain.gain.setValueAtTime(0.25 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.25);
    osc2.stop(t + 0.25);
  }

  public playRoundStinger(won: boolean) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = won ? [440, 554, 659, 880] : [440, 392, 349, 293];
    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.15;
      osc.type = won ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.3 * this.masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public playRadio(message: 'planted' | 'defused' | 'gang_win' | 'police_win' | 'start') {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    if (message === 'planted') {
      osc.frequency.setValueAtTime(450, t);
      osc.frequency.setValueAtTime(600, t + 0.1);
    } else if (message === 'defused') {
      osc.frequency.setValueAtTime(700, t);
      osc.frequency.setValueAtTime(900, t + 0.1);
    } else if (message === 'gang_win' || message === 'police_win') {
      osc.frequency.setValueAtTime(500, t);
      osc.frequency.setValueAtTime(750, t + 0.15);
      osc.frequency.setValueAtTime(1000, t + 0.3);
    } else {
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.setValueAtTime(600, t + 0.1);
    }

    gain.gain.setValueAtTime(0.25 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.42);
  }
}

export const sound = new SoundSystem();
