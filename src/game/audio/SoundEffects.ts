/**
 * Hybrid Web Audio Engine for SHOOTERAL
 * Plays the uploaded .mp3 assets from src/assets/sounds/ for combat/movement SFX
 * and uses crisp procedural Web Audio synthesis for digital menu UI clicks.
 */

import type { SurfaceMaterial } from '../maps/MapBuilder';
import bombExplosionUrl from '../../assets/sounds/bomb_explotion.mp3';
import handBombExplosionUrl from '../../assets/sounds/hand_bomb_explotion.mp3';
import headShootSfxUrl from '../../assets/sounds/head_shoot_sfx.mp3';
import jumpUrl from '../../assets/sounds/jump.mp3';
import longGunShotUrl from '../../assets/sounds/long_gun_shot.mp3';
import miniGunShotUrl from '../../assets/sounds/mini_gun_shot.mp3';
import smokeBombUrl from '../../assets/sounds/smoke-bomb.mp3';
import sniperShotUrl from '../../assets/sounds/sniper_shot.mp3';
import walkingUrl from '../../assets/sounds/walking.mp3';

import deathSoundUrl from '../../assets/sounds/death_sound.mp3';
import loseSoundUrl from '../../assets/sounds/lose_sound.mp3';
import winSoundUrl from '../../assets/sounds/win_sound.mp3';

type SampleKey =
  | 'bombExplosion'
  | 'death'
  | 'handBombExplosion'
  | 'headShoot'
  | 'jump'
  | 'longGunShot'
  | 'lose'
  | 'miniGunShot'
  | 'smokeBomb'
  | 'sniperShot'
  | 'walking'
  | 'win';

const SAMPLE_URLS: Record<SampleKey, string> = {
  bombExplosion: bombExplosionUrl,
  death: deathSoundUrl,
  handBombExplosion: handBombExplosionUrl,
  headShoot: headShootSfxUrl,
  jump: jumpUrl,
  longGunShot: longGunShotUrl,
  lose: loseSoundUrl,
  miniGunShot: miniGunShotUrl,
  smokeBomb: smokeBombUrl,
  sniperShot: sniperShotUrl,
  walking: walkingUrl,
  win: winSoundUrl
};

// Clean shot slice start offsets inside long_gun_shot.mp3 burst (seconds)
const LONG_GUN_SHOT_SLICES = [0.015, 0.115, 0.215, 0.315, 0.415, 0.515];

export type GunshotSoundId =
  | 'glock'
  | 'usp'
  | 'mp5'
  | 'pistol'
  | 'deagle'
  | 'smg'
  | 'ak47'
  | 'm4a1'
  | 'awp'
  | 'knife'
  | 'grenade';

const clamp = (v: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

class SoundSystem {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;
  public masterVolume: number = 0.75;

  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private rawSampleBytes: Partial<Record<SampleKey, ArrayBuffer>> = {};
  private sampleBuffers: Partial<Record<SampleKey, AudioBuffer>> = {};
  private sampleLoadStarted: boolean = false;
  private sampleDecodeStarted: Set<SampleKey> = new Set();

  private walkingStepOffsets: number[] = [0];
  private leadingOffsets: Partial<Record<SampleKey, number>> = {};
  private walkSliceCursor: number = 0;
  private longShotSliceCursor: number = 0;

  private activeVoices: number = 0;
  private readonly maxVoices: number = 48;
  private outcomeVoices: Set<{ src: AudioBufferSourceNode; gainNode: GainNode }> = new Set();
  private unlockBound: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.prefetchSampleBytes();
    }
  }

  private prefetchSampleBytes() {
    if (this.sampleLoadStarted || typeof fetch === 'undefined') return;
    this.sampleLoadStarted = true;
    (Object.keys(SAMPLE_URLS) as SampleKey[]).forEach((key) => {
      fetch(SAMPLE_URLS[key])
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((buf) => {
          if (!buf) return;
          this.rawSampleBytes[key] = buf;
          if (this.ctx) {
            this.decodeSampleKey(key);
          }
        })
        .catch(() => {});
    });
  }

  private extractStepOffsets(buf: AudioBuffer): number[] {
    const ch = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const minGapSamples = Math.floor(sr * 0.3);
    const prePadSamples = Math.floor(sr * 0.008);
    const stepSamples = Math.max(1, Math.floor(sr * 0.005));
    const maxIndex = ch.length - Math.floor(sr * 0.25);
    const offsets: number[] = [];

    let i = 0;
    while (i < maxIndex) {
      if (Math.abs(ch[i]) > 0.16) {
        offsets.push(Math.max(0, (i - prePadSamples) / sr));
        i += minGapSamples;
      } else {
        i += stepSamples;
      }
    }
    return offsets.length > 0 ? offsets : [0];
  }

  private findLeadingAudioOffset(buf: AudioBuffer): number {
    const sr = buf.sampleRate;
    const stepSamples = Math.max(1, Math.floor(sr * 0.002));
    const maxScan = Math.min(buf.length, Math.floor(sr * 0.35));
    const prePadSamples = Math.floor(sr * 0.005);
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;

    for (let i = 0; i < maxScan; i += stepSamples) {
      const peak = Math.max(Math.abs(ch0[i]), ch1 ? Math.abs(ch1[i]) : 0);
      if (peak > 0.012) {
        return Math.max(0, (i - prePadSamples) / sr);
      }
    }
    return 0;
  }

  private decodeSampleKey(key: SampleKey) {
    if (!this.ctx || this.sampleBuffers[key] || this.sampleDecodeStarted.has(key)) return;
    const raw = this.rawSampleBytes[key];
    if (!raw) return;
    this.sampleDecodeStarted.add(key);
    this.ctx
      .decodeAudioData(raw.slice(0))
      .then((decoded) => {
        this.sampleBuffers[key] = decoded;
        if (key === 'walking') {
          this.walkingStepOffsets = this.extractStepOffsets(decoded);
        } else if (key === 'death' || key === 'win' || key === 'lose') {
          this.leadingOffsets[key] = this.findLeadingAudioOffset(decoded);
        }
      })
      .catch(() => {
        this.sampleDecodeStarted.delete(key);
      });
  }

  private decodeAvailableSamples() {
    this.prefetchSampleBytes();
    (Object.keys(SAMPLE_URLS) as SampleKey[]).forEach((key) => {
      this.decodeSampleKey(key);
    });
  }

  private bindAutoResume() {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    const resumeHandler = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', resumeHandler, { passive: true });
    window.addEventListener('keydown', resumeHandler, { passive: true });
  }

  private initCtx() {
    this.bindAutoResume();

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.masterGain && this.ctx) {
      const ctx = this.ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 14;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.002;
      comp.release.value = 0.16;

      const safeVol = clamp(this.masterVolume, 0, 1.5, 0.75);
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : safeVol;

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 1.0;

      this.sfxBus.connect(comp);
      comp.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
    }

    if (this.masterGain && this.ctx) {
      const safeVol = clamp(this.masterVolume, 0, 1.5, 0.75);
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : safeVol, this.ctx.currentTime, 0.02);
    }

    this.decodeAvailableSamples();
  }

  public enable() {
    this.initCtx();
  }

  public syncMasterVolume() {
    if (this.masterGain && this.ctx) {
      const safeVol = clamp(this.masterVolume, 0, 1.5, 0.75);
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : safeVol, this.ctx.currentTime, 0.02);
    }
  }

  private canSpawnVoice(priority: 'high' | 'normal' | 'low' = 'normal'): boolean {
    if (priority === 'high') return this.activeVoices < this.maxVoices + 16;
    if (priority === 'low') return this.activeVoices < this.maxVoices - 8;
    return this.activeVoices < this.maxVoices;
  }

  private trackSource(src: AudioScheduledSourceNode, cleanupNodes?: AudioNode[], onCleanup?: () => void) {
    this.activeVoices++;
    let cleaned = false;
    src.onended = () => {
      if (cleaned) return;
      cleaned = true;
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      onCleanup?.();
      try {
        src.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      if (cleanupNodes) {
        for (const n of cleanupNodes) {
          try {
            n.disconnect();
          } catch {
            // Ignore disconnect errors
          }
        }
      }
    };
  }

  private playBufferSlice(
    key: SampleKey,
    options: {
      gain?: number;
      pan?: number;
      attenuation?: number;
      playbackRate?: number;
      offset?: number;
      duration?: number;
      fadeIn?: number;
      fadeOut?: number;
      lowpassHz?: number;
      priority?: 'high' | 'normal' | 'low';
    } = {}
  ) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx || !this.sfxBus) return;
    const buf = this.sampleBuffers[key];
    if (!buf) return;
    if (!this.canSpawnVoice(options.priority ?? 'normal')) return;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const atten = clamp(options.attenuation ?? 1, 0.02, 1, 1);
    const gainVal = clamp(options.gain ?? 1, 0.01, 2.0, 1) * atten;
    const rate = clamp(options.playbackRate ?? 1, 0.65, 1.5, 1);
    const offset = clamp(options.offset ?? 0, 0, Math.max(0, buf.duration - 0.02), 0);
    const maxPlayable = Math.max(0.02, buf.duration - offset);
    const dur = options.duration !== undefined ? Math.min(options.duration, maxPlayable) : maxPlayable;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const nodes: AudioNode[] = [];
    let chainHead: AudioNode = src;

    const cutoff = options.lowpassHz ?? (atten < 0.9 ? 2000 + 16000 * atten : undefined);
    if (cutoff !== undefined && cutoff < 19500) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = clamp(cutoff, 500, 20000, 18000);
      chainHead.connect(lp);
      chainHead = lp;
      nodes.push(lp);
    }

    const pan = clamp(options.pan ?? 0, -1, 1, 0);
    if (Math.abs(pan) > 0.01) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      chainHead.connect(panner);
      chainHead = panner;
      nodes.push(panner);
    }

    const gainNode = ctx.createGain();
    const fadeIn = Math.min(options.fadeIn ?? 0.004, dur * 0.25);
    const fadeOut = Math.min(options.fadeOut ?? 0, dur * 0.45);
    const realDur = dur / rate;

    if (fadeIn > 0.001) {
      gainNode.gain.setValueAtTime(0.001, t);
      gainNode.gain.linearRampToValueAtTime(gainVal, t + fadeIn);
    } else {
      gainNode.gain.setValueAtTime(gainVal, t);
    }

    if (fadeOut > 0.002) {
      const fadeStart = Math.max(t + fadeIn, t + realDur - fadeOut);
      gainNode.gain.setValueAtTime(gainVal, fadeStart);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + realDur);
    }

    chainHead.connect(gainNode);
    gainNode.connect(this.sfxBus);
    nodes.push(gainNode);

    const isOutcomeVoice = key === 'win' || key === 'lose' || key === 'death';
    const outcomeEntry = isOutcomeVoice ? { src, gainNode } : null;
    if (outcomeEntry) {
      this.outcomeVoices.add(outcomeEntry);
    }

    this.trackSource(src, nodes, () => {
      if (outcomeEntry) {
        this.outcomeVoices.delete(outcomeEntry);
      }
    });
    src.start(t, offset, dur);
  }

  public stopOutcomeSounds() {
    if (this.outcomeVoices.size === 0) return;
    const voices = Array.from(this.outcomeVoices);
    this.outcomeVoices.clear();
    for (const entry of voices) {
      try {
        if (this.ctx) {
          const now = this.ctx.currentTime;
          entry.gainNode.gain.cancelScheduledValues(now);
          entry.gainNode.gain.setValueAtTime(0, now);
        }
        entry.src.stop(0);
      } catch {
        // Ignore already stopped source
      }
      try {
        entry.src.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      try {
        entry.gainNode.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
  }

  // =========================================================================
  // REAL SAMPLE PLAYBACK METHODS
  // =========================================================================
  public playGunshot(type: GunshotSoundId, distanceAttenuation = 1.0, pan = 0) {
    const safeAtten = clamp(distanceAttenuation, 0, 1, 1);
    if (type === 'knife' || type === 'grenade' || this.muted || safeAtten <= 0.05) return;

    const priority = safeAtten >= 0.95 ? 'high' : safeAtten > 0.4 ? 'normal' : 'low';

    // 1. Sniper Rifle -> sniper_shot.mp3
    if (type === 'awp') {
      this.playBufferSlice('sniperShot', {
        gain: 1.08,
        attenuation: safeAtten,
        pan,
        playbackRate: 0.99 + (Math.random() - 0.5) * 0.04,
        offset: 0.13,
        priority
      });
      return;
    }

    // 2. Automatic Rifles & SMGs (الرشاشات: AK-47, M4A1-S, MP5-SD) -> long_gun_shot.mp3
    if (type === 'ak47' || type === 'm4a1' || type === 'mp5' || type === 'smg') {
      const sliceOffset = LONG_GUN_SHOT_SLICES[this.longShotSliceCursor % LONG_GUN_SHOT_SLICES.length];
      this.longShotSliceCursor = (this.longShotSliceCursor + 1) % LONG_GUN_SHOT_SLICES.length;
      const isSuppressed = type === 'm4a1' || type === 'mp5';
      const rateBase = type === 'mp5' || type === 'smg' ? 1.12 : type === 'm4a1' ? 1.06 : 0.99;

      this.playBufferSlice('longGunShot', {
        gain: isSuppressed ? 0.78 : 0.98,
        attenuation: safeAtten,
        pan,
        playbackRate: rateBase + (Math.random() - 0.5) * 0.05,
        offset: sliceOffset,
        duration: 0.1,
        fadeIn: 0.002,
        fadeOut: 0.024,
        lowpassHz: isSuppressed ? 5200 : undefined,
        priority
      });
      return;
    }

    // 3. Handguns / Pistols (Glock-18, USP-S, Desert Eagle) -> mini_gun_shot.mp3
    const isUsp = type === 'usp';
    const isDeagle = type === 'deagle';
    this.playBufferSlice('miniGunShot', {
      gain: isUsp ? 0.72 : isDeagle ? 1.08 : 0.92,
      attenuation: safeAtten,
      pan,
      playbackRate: (isDeagle ? 0.82 : isUsp ? 1.08 : 1.0) + (Math.random() - 0.5) * 0.05,
      offset: 0.02,
      lowpassHz: isUsp ? 4800 : undefined,
      priority
    });
  }

  public playExplosion(attenuation: number = 1, isC4: boolean = false, pan: number = 0) {
    if (this.muted) return;
    const atten = clamp(attenuation, 0.08, 1, 0.8);
    this.playBufferSlice(isC4 ? 'bombExplosion' : 'handBombExplosion', {
      gain: isC4 ? 1.15 : 1.0,
      attenuation: atten,
      pan,
      playbackRate: 1.0 + (Math.random() - 0.5) * 0.04,
      offset: isC4 ? 0.135 : 0.095,
      priority: 'high'
    });
  }

  public playSmokeHiss(attenuation: number = 1, pan: number = 0) {
    const safeAtten = clamp(attenuation, 0, 1, 1);
    if (this.muted || safeAtten <= 0.04) return;
    this.playBufferSlice('smokeBomb', {
      gain: 0.95,
      attenuation: safeAtten,
      pan,
      offset: 0.07,
      priority: 'normal'
    });
  }

  public playFootstep(isSprinting = false, _surface: SurfaceMaterial = 'concrete', isCrouching = false) {
    if (this.muted) return;
    this.initCtx();
    const offsets = this.walkingStepOffsets;
    const idx = this.walkSliceCursor % offsets.length;
    this.walkSliceCursor = (this.walkSliceCursor + 1 + Math.floor(Math.random() * 3)) % offsets.length;
    const volScale = isSprinting ? 0.95 : isCrouching ? 0.34 : 0.68;

    this.playBufferSlice('walking', {
      gain: volScale,
      playbackRate: (isSprinting ? 1.08 : isCrouching ? 0.9 : 1.0) + (Math.random() - 0.5) * 0.06,
      offset: offsets[idx] ?? 0,
      duration: 0.24,
      fadeIn: 0.008,
      fadeOut: 0.055,
      priority: 'normal'
    });
  }

  public playJump() {
    if (this.muted) return;
    this.playBufferSlice('jump', {
      gain: 0.85,
      playbackRate: 0.98 + Math.random() * 0.06,
      offset: 0.845,
      duration: 0.38,
      fadeIn: 0.004,
      fadeOut: 0.05,
      priority: 'high'
    });
  }

  public playLanding(impactSpeed: number = 5, _surface: SurfaceMaterial = 'concrete') {
    if (this.muted) return;
    this.initCtx();
    const offsets = this.walkingStepOffsets;
    const idx = Math.floor(Math.random() * offsets.length);
    const power = clamp(impactSpeed / 7.5, 0.35, 1.0, 0.65);

    this.playBufferSlice('walking', {
      gain: 0.62 * power,
      playbackRate: 0.86,
      offset: offsets[idx] ?? 0,
      duration: 0.24,
      fadeIn: 0.005,
      fadeOut: 0.06,
      priority: 'normal'
    });
  }

  public playHeadshotKill() {
    if (this.muted) return;
    this.playBufferSlice('headShoot', {
      gain: 1.05,
      offset: 0.015,
      priority: 'high'
    });
  }

  public playPlayerDeath() {
    if (this.muted) return;
    this.playBufferSlice('death', {
      gain: 1.05,
      offset: this.leadingOffsets.death ?? 0,
      fadeIn: 0.005,
      priority: 'high'
    });
  }

  public playRoundStinger(won: boolean) {
    if (this.muted) return;
    const key: SampleKey = won ? 'win' : 'lose';
    this.playBufferSlice(key, {
      gain: 0.95,
      offset: this.leadingOffsets[key] ?? 0,
      fadeIn: 0.005,
      priority: 'high'
    });
  }

  // =========================================================================
  // DIGITAL MENU UI CLICK SYNTHESIS
  // =========================================================================
  public playUiClick(variant: 'default' | 'primary' | 'back' | 'toggle' = 'default') {
    if (this.muted) return;
    this.initCtx();
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;

    const trigger = () => {
      if (this.muted || !this.ctx || !this.sfxBus) return;
      const t = this.ctx.currentTime;

      // Primary crisp digital micro-switch tone
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(320, t);

      let fStart = 1480;
      let fEnd = 640;
      let dur = 0.026;
      let peak = 0.16;

      if (variant === 'primary') {
        fStart = 1120;
        fEnd = 1780;
        dur = 0.036;
        peak = 0.19;
      } else if (variant === 'back') {
        fStart = 960;
        fEnd = 480;
        dur = 0.028;
        peak = 0.15;
      } else if (variant === 'toggle') {
        fStart = 1760;
        fEnd = 920;
        dur = 0.02;
        peak = 0.14;
      }

      osc.type = variant === 'primary' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(fStart, t);
      osc.frequency.exponentialRampToValueAtTime(fEnd, t + dur);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(hp);
      hp.connect(gain);
      gain.connect(this.sfxBus);

      const nodes: AudioNode[] = [hp, gain];
      this.trackSource(osc, nodes);
      osc.start(t);
      osc.stop(t + dur + 0.005);

      // Subtle high-frequency digital transient tick
      const tickOsc = this.ctx.createOscillator();
      const tickGain = this.ctx.createGain();
      tickOsc.type = 'square';
      tickOsc.frequency.setValueAtTime(variant === 'back' ? 2100 : 2950, t);
      tickGain.gain.setValueAtTime(0.0001, t);
      tickGain.gain.linearRampToValueAtTime(variant === 'primary' ? 0.055 : 0.04, t + 0.001);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);

      tickOsc.connect(tickGain);
      tickGain.connect(this.sfxBus);
      this.trackSource(tickOsc, [tickGain]);
      tickOsc.start(t);
      tickOsc.stop(t + 0.014);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(trigger).catch(() => {});
    } else {
      trigger();
    }
  }

  // =========================================================================
  // C4 BOMB COUNTDOWN, PLANTING KEYPAD & DEFUSAL SOUNDS (CS2-STYLE)
  // =========================================================================
  public playC4Beep(pitch = 1000, attenuation = 1.0, pan = 0) {
    if (this.muted) return;
    this.initCtx();
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;

    const trigger = () => {
      if (this.muted || !this.ctx || !this.sfxBus) return;
      const c = this.ctx;
      const t = c.currentTime;
      const atten = clamp(attenuation, 0.08, 1.0, 0.5);
      // Map GameEngine pitch (1000..1800) into crisp CS2 piezo buzzer range (~2450..3250 Hz)
      const baseFreq = clamp(2450 + (pitch - 1000) * 0.95, 2200, 3600, 2600);

      const panner = c.createStereoPanner();
      panner.pan.setValueAtTime(clamp(pan, -1, 1, 0), t);

      // Distance lowpass filter so distant C4 beeps sound naturally muffled across the map
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400 + atten * 8600, t);

      const masterGain = c.createGain();
      const peak = 0.24 * atten;
      masterGain.gain.setValueAtTime(0.0001, t);
      masterGain.gain.linearRampToValueAtTime(peak, t + 0.003);
      masterGain.gain.setValueAtTime(peak * 0.92, t + 0.042);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.082);

      // Primary sharp electronic piezo tone
      const oscMain = c.createOscillator();
      oscMain.type = 'square';
      oscMain.frequency.setValueAtTime(baseFreq, t);
      const gMain = c.createGain();
      gMain.gain.setValueAtTime(0.45, t);

      // Crisp sub-harmonic presence for clarity on laptop speakers
      const oscSub = c.createOscillator();
      oscSub.type = 'triangle';
      oscSub.frequency.setValueAtTime(baseFreq * 0.5, t);
      const gSub = c.createGain();
      gSub.gain.setValueAtTime(0.55, t);

      oscMain.connect(gMain);
      oscSub.connect(gSub);
      gMain.connect(masterGain);
      gSub.connect(masterGain);
      masterGain.connect(lp);
      lp.connect(panner);
      panner.connect(this.sfxBus);

      this.trackSource(oscMain, [gMain, masterGain, lp, panner]);
      this.trackSource(oscSub, [gSub]);

      oscMain.start(t);
      oscSub.start(t);
      oscMain.stop(t + 0.088);
      oscSub.stop(t + 0.088);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(trigger).catch(() => {});
    } else {
      trigger();
    }
  }

  public playC4ArmedBeep(attenuation = 1.0, pan = 0) {
    if (this.muted) return;
    this.initCtx();
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;

    const trigger = () => {
      if (this.muted || !this.ctx || !this.sfxBus) return;
      const c = this.ctx;
      const now = c.currentTime;
      const atten = clamp(attenuation, 0.12, 1.0, 0.8);
      const panner = c.createStereoPanner();
      panner.pan.setValueAtTime(clamp(pan, -1, 1, 0), now);
      panner.connect(this.sfxBus);

      // Quick 2-tone arm confirmation chime
      const freqs = [1880, 2520];
      freqs.forEach((f, idx) => {
        const st = now + idx * 0.07;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, st);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.linearRampToValueAtTime(0.22 * atten, st + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.058);
        osc.connect(g);
        g.connect(panner);
        this.trackSource(osc, idx === 0 ? [g, panner] : [g]);
        osc.start(st);
        osc.stop(st + 0.065);
      });
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(trigger).catch(() => {});
    } else {
      trigger();
    }
  }

  public playPlantingKey(step = 0, attenuation = 1.0, pan = 0) {
    if (this.muted) return;
    this.initCtx();
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;

    const trigger = () => {
      if (this.muted || !this.ctx || !this.sfxBus) return;
      const c = this.ctx;
      const t = c.currentTime;
      const atten = clamp(attenuation, 0.05, 1.0, 1.0);

      // Authentic CS2 7355608 DTMF keypad frequency pairs
      const dtmfCode: [number, number][] = [
        [852, 1209], // 7
        [697, 1477], // 3
        [770, 1336], // 5
        [770, 1336], // 5
        [770, 1477], // 6
        [941, 1336], // 0
        [852, 1336], // 8
        [941, 1477]  // # confirm
      ];
      const [lowF, highF] = dtmfCode[Math.abs(step) % dtmfCode.length];

      const panner = c.createStereoPanner();
      panner.pan.setValueAtTime(clamp(pan, -1, 1, 0), t);
      const gain = c.createGain();
      const peak = 0.16 * atten;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.003);
      gain.gain.setValueAtTime(peak * 0.85, t + 0.032);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.058);

      const osc1 = c.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(lowF, t);

      const osc2 = c.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(highF, t);

      // Subtle tactile keypad button click
      const clickOsc = c.createOscillator();
      const clickGain = c.createGain();
      clickOsc.type = 'square';
      clickOsc.frequency.setValueAtTime(2400, t);
      clickGain.gain.setValueAtTime(0.0001, t);
      clickGain.gain.linearRampToValueAtTime(0.055 * atten, t + 0.001);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(panner);
      clickOsc.connect(clickGain);
      clickGain.connect(panner);
      panner.connect(this.sfxBus);

      this.trackSource(osc1, [gain, panner]);
      this.trackSource(osc2, []);
      this.trackSource(clickOsc, [clickGain]);

      osc1.start(t);
      osc2.start(t);
      clickOsc.start(t);
      osc1.stop(t + 0.062);
      osc2.stop(t + 0.062);
      clickOsc.stop(t + 0.015);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(trigger).catch(() => {});
    } else {
      trigger();
    }
  }

  public playDefuseKey(isStart = false, attenuation = 1.0, pan = 0) {
    if (this.muted) return;
    this.initCtx();
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;

    const trigger = () => {
      if (this.muted || !this.ctx || !this.sfxBus) return;
      const c = this.ctx;
      const t = c.currentTime;
      const atten = clamp(attenuation, 0.05, 1.0, 1.0);

      const panner = c.createStereoPanner();
      panner.pan.setValueAtTime(clamp(pan, -1, 1, 0), t);
      panner.connect(this.sfxBus);

      if (isStart) {
        // CS2 defuse start signature: crisp latch + rising 2-tone diagnostic chirp
        const notes = [1040, 1580];
        notes.forEach((freq, i) => {
          const st = t + i * 0.055;
          const osc = c.createOscillator();
          const g = c.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, st);
          g.gain.setValueAtTime(0.0001, st);
          g.gain.linearRampToValueAtTime(0.2 * atten, st + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.055);
          osc.connect(g);
          g.connect(panner);
          this.trackSource(osc, i === 0 ? [g, panner] : [g]);
          osc.start(st);
          osc.stop(st + 0.06);
        });
      } else {
        // Wire-snipper metallic click + short multimeter pulse
        const snipOsc = c.createOscillator();
        const snipGain = c.createGain();
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2800, t);
        bp.Q.setValueAtTime(2.5, t);

        snipOsc.type = 'sawtooth';
        snipOsc.frequency.setValueAtTime(1650 + (Math.random() - 0.5) * 180, t);
        snipOsc.frequency.exponentialRampToValueAtTime(520, t + 0.025);

        snipGain.gain.setValueAtTime(0.0001, t);
        snipGain.gain.linearRampToValueAtTime(0.14 * atten, t + 0.002);
        snipGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);

        snipOsc.connect(bp);
        bp.connect(snipGain);
        snipGain.connect(panner);
        this.trackSource(snipOsc, [bp, snipGain, panner]);
        snipOsc.start(t);
        snipOsc.stop(t + 0.036);
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(trigger).catch(() => {});
    } else {
      trigger();
    }
  }

  // =========================================================================
  // NO-OP INTERFACE METHODS
  // =========================================================================
  public startAmbience() {}
  public setAmbiencePaused(_paused: boolean) {}
  public stopAmbience() {}
  public playBulletWhiz(_pan: number = 0) {}
  public playImpact(_attenuation: number = 0.6, _pan: number = 0, _ricochet: boolean = false, _surface: SurfaceMaterial = 'concrete') {}
  public playShellClink() {}
  public playADS(_entering: boolean) {}
  public playWeaponEquip() {}
  public playWeaponInspect() {}
  public playReloadStage(_stage: 'mag_out' | 'mag_in' | 'bolt', _weaponId: string = 'rifle') {}
  public playReload(_weaponId: string = 'rifle', _distanceAttenuation = 1.0, _pan = 0) {}
  public playHitmarker(_isHeadshot = false, _isKill = false) {}
  public playPlayerHit(_isHeadshot = false) {}
  public updateHeartbeat(_dt: number, _health: number, _isAlive: boolean) {}
  public playGrenadePin() {}
  public playGrenadeThrow(_attenuation = 1.0, _pan = 0) {}
  public playGrenadeBounce(_attenuation: number = 1, _pan: number = 0) {}
  public playRadioChatter(_isCommand: boolean = true) {}
  public playBuy() {
    this.playUiClick('primary');
  }
  public playRadio(_message: 'planted' | 'defused' | 'gang_win' | 'police_win' | 'start') {}
}

export const sound = new SoundSystem();
