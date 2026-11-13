/**
 * Pure Sample-Based Web Audio Engine for SHOOTERAL
 * Plays exclusively the uploaded .mp3 assets from src/assets/sounds/
 * with zero procedural/oscillator-generated fallback audio.
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

  private trackSource(src: AudioScheduledSourceNode, cleanupNodes?: AudioNode[]) {
    this.activeVoices++;
    let cleaned = false;
    src.onended = () => {
      if (cleaned) return;
      cleaned = true;
      this.activeVoices = Math.max(0, this.activeVoices - 1);
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

    this.trackSource(src, nodes);
    src.start(t, offset, dur);
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
  // NO-OP INTERFACE METHODS (No code-generated / procedural audio)
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
  public playC4Beep(_pitch = 1000, _attenuation = 1.0, _pan = 0) {}
  public playPlantingKey() {}
  public playDefuseKey() {}
  public playGrenadePin() {}
  public playGrenadeThrow(_attenuation = 1.0, _pan = 0) {}
  public playGrenadeBounce(_attenuation: number = 1, _pan: number = 0) {}
  public playRadioChatter(_isCommand: boolean = true) {}
  public playBuy() {}
  public playRadio(_message: 'planted' | 'defused' | 'gang_win' | 'police_win' | 'start') {}
}

export const sound = new SoundSystem();
