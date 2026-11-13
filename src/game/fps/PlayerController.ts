import * as THREE from 'three';
import { GunshotSoundId, sound } from '../audio/SoundEffects';
import { buildCharacter, CharacterInstance } from '../character/CharacterBuilder';
import { GAME_FEEL_CONFIG } from '../config/GameFeelConfig';
import { BoxCollider, getGroundSurfaceAt, getSurfaceHeightAt, RampZone, SurfaceMaterial } from '../maps/MapBuilder';
import { WEAPONS, WeaponStats } from '../weapons/WeaponData';
import {
  buildDefuseToolViewmodel,
  buildRealisticViewmodel,
  BuiltViewmodel
} from '../weapons/WeaponViewmodelBuilder';

export interface PlayerState {
  health: number;
  maxHealth: number;
  armor: number;
  hasHelmet: boolean;
  hasDefuser: boolean;
  hasC4: boolean;
  isAlive: boolean;
  money: number;
  kills: number;
  deaths: number;
  score: number;
  weapons: Record<number, WeaponStats | null>; // slots 1 to 5
  activeSlot: number;
  ammo: Record<string, { clip: number; reserve: number }>;
  isPlanting: boolean;
  plantProgress: number; // 0 to 1
  isDefusing: boolean;
  defuseProgress: number; // 0 to 1
  isReloading: boolean;
  reloadProgress: number;
  isScoped: boolean;
  isADS: boolean;
  isCrouching: boolean;
  isSprinting: boolean;
  canPlantHere: boolean;
  currentSite: 'A' | 'B' | null;
  canDefuseHere: boolean;
  crosshairSpread: number; // Dynamic CoD crosshair expansion (px)
  grenades: { he: number; smoke: number };
  activeGrenadeType: 'hegrenade' | 'smokegrenade' | null;
}

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public state: PlayerState;
  public team: 'gang' | 'swat';
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3();

  // Mouse aim & Camera (1:1 raw input, zero smoothing or accel)
  public pitch: number = 0;
  public yaw: number = 0;
  public mouseSensitivity: number = 0.0022;
  public baseFov: number = 75;
  public reducedMotion: boolean = false;
  public defaultGroundSurface: SurfaceMaterial = 'concrete';

  // Viewmodel group attached to camera
  public viewmodelGroup: THREE.Group;
  public muzzleFlashLight: THREE.PointLight;
  public muzzleFlashGroup: THREE.Group;
  private flashTimer: number = 0;

  // Weapon viewmodels with animatable sub-parts + Defusal Tool viewmodel
  private viewmodels: Map<string, BuiltViewmodel> = new Map();
  private defuseToolVM!: BuiltViewmodel;
  private slideKick: number = 0;

  // 3D Rigged Character for 3rd-person Death Camera
  public characterRig: CharacterInstance;
  public isDeathCam: boolean = false;

  // Inputs
  private keys: Record<string, boolean> = {};
  private isMouseDown: boolean = false;
  public isLocked: boolean = false;
  private isGrounded: boolean = true;
  private wasGrounded: boolean = true;
  private bobTimer: number = 0;

  // Realistic Camera & Movement Feel (Walk / Sprint / Landing / Strafe Roll)
  private currentEyeHeight: number = GAME_FEEL_CONFIG.movement.eyeHeightStand;
  private landingDip: number = 0;
  private strafeRoll: number = 0;
  private sprintBlend: number = 0;
  private sprintSuppressTimer: number = 0;

  // Weapon Equip, Inspect (KeyF) & Synced Reload Stage Tracking
  private equipProgress: number = 1;
  private isInspecting: boolean = false;
  private inspectProgress: number = 0;
  private inspectBlend: number = 0;
  private reloadStageTriggered = { magOut: false, magIn: false, bolt: false };

  // Dual-Layer Gunplay Dynamics: Learnable Pattern + Spring Recoil, Sway, Screen Shake & Bloom
  private recoilPitch: number = 0;
  private recoilYaw: number = 0;
  private recoilRoll: number = 0;
  private shotPatternStep: number = 0;
  private cameraShake: number = 0;
  private explosionShake: number = 0;
  private weaponKickZ: number = 0;
  private weaponKickRotX: number = 0;
  private weaponKickRotY: number = 0;
  private swayX: number = 0;
  private swayY: number = 0;
  private moveSwayX: number = 0;
  private moveSwayZ: number = 0;
  private adsBlend: number = 0;
  private sprayBloom: number = 0;

  // Fire timing
  private lastShootTime: number = 0;
  private footstepTimer: number = 0;

  // Suppress 1-5 weapon slot hotkeys when tactical radio menu is open
  public suppressSlotHotkeys: boolean = false;
  private lastProgressNotifyTime: number = 0;

  // Reusable scratch math objects
  private readonly _upAxis = new THREE.Vector3(0, 1, 0);
  private readonly _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly _tmpRayDir = new THREE.Vector3();
  private readonly _tmpTargetPt = new THREE.Vector3();
  private readonly _tmpForward = new THREE.Vector3();
  private readonly _tmpMoveDir = new THREE.Vector3();
  private readonly _tmpNextPos = new THREE.Vector3();
  private readonly _tmpRightVec = new THREE.Vector3();
  private readonly _tmpBackDir = new THREE.Vector3();

  // Callbacks
  public onShoot?: (targetPoint: THREE.Vector3, isHeadshot: boolean, muzzleWorldPos?: THREE.Vector3) => void;
  public onThrowGrenade?: (type: 'hegrenade' | 'smokegrenade', origin: THREE.Vector3, velocity: THREE.Vector3) => void;
  public onPlantCompleted?: (site: 'A' | 'B', pos: THREE.Vector3) => void;
  public onDefuseCompleted?: () => void;
  public onStateChange?: (state: PlayerState) => void;

  private notifyProgressState() {
    const now = performance.now();
    if (now - this.lastProgressNotifyTime >= 55) {
      this.lastProgressNotifyTime = now;
      this.onStateChange?.({ ...this.state });
    }
  }

  constructor(camera: THREE.PerspectiveCamera, team: 'gang' | 'swat', scene: THREE.Scene) {
    this.camera = camera;
    this.team = team;
    this.camera.rotation.order = 'YXZ';

    // 3D Character model for third-person death view
    this.characterRig = buildCharacter(team, 'PlayerDeathRig');
    this.characterRig.group.visible = false;
    scene.add(this.characterRig.group);

    this.state = {
      health: 100,
      maxHealth: 100,
      armor: 0,
      hasHelmet: false,
      hasDefuser: false,
      hasC4: false,
      isAlive: true,
      money: 800,
      kills: 0,
      deaths: 0,
      score: 0,
      weapons: {
        1: null,
        2: team === 'gang' ? { ...WEAPONS.glock } : { ...WEAPONS.usp },
        3: { ...WEAPONS.knife },
        4: null,
        5: null
      },
      activeSlot: 2,
      ammo: {
        glock: { clip: 20, reserve: 120 },
        usp: { clip: 12, reserve: 36 },
        deagle: { clip: 7, reserve: 35 },
        mp5: { clip: 30, reserve: 120 },
        ak47: { clip: 30, reserve: 90 },
        m4a1: { clip: 25, reserve: 75 },
        awp: { clip: 5, reserve: 30 },
        knife: { clip: 1, reserve: 0 },
        hegrenade: { clip: 0, reserve: 0 },
        smokegrenade: { clip: 0, reserve: 0 },
        c4: { clip: 1, reserve: 0 }
      },
      isPlanting: false,
      plantProgress: 0,
      isDefusing: false,
      defuseProgress: 0,
      isReloading: false,
      reloadProgress: 0,
      isScoped: false,
      isADS: false,
      isCrouching: false,
      isSprinting: false,
      canPlantHere: false,
      currentSite: null,
      canDefuseHere: false,
      crosshairSpread: 4,
      grenades: { he: 0, smoke: 0 },
      activeGrenadeType: null
    };

    // Build Viewmodel attached to FPS camera
    this.viewmodelGroup = new THREE.Group();
    this.viewmodelGroup.position.set(0.22, -0.22, -0.42);
    this.camera.add(this.viewmodelGroup);

    // Subtle camera-local viewmodel lighting rig so metallic bevels, walnut grain & polymer stay crisp in dark tunnels without washing world geometry
    const vmKeyLight = new THREE.PointLight(0xfff5e8, 0.72, 1.35, 2);
    vmKeyLight.position.set(0.26, 0.14, -0.24);
    const vmRimLight = new THREE.PointLight(0x9ec5ff, 0.45, 1.15, 2);
    vmRimLight.position.set(-0.22, -0.05, -0.58);
    this.camera.add(vmKeyLight, vmRimLight);

    // Multi-Plane Additive Starburst Muzzle Flash
    this.muzzleFlashLight = new THREE.PointLight(0xffaa33, 0, 11);
    this.viewmodelGroup.add(this.muzzleFlashLight);

    this.muzzleFlashGroup = new THREE.Group();
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffdd66,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.044), flashMat);
      fin.rotation.z = (i * Math.PI) / 4;
      this.muzzleFlashGroup.add(fin);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), coreMat);
    this.muzzleFlashGroup.add(core);
    this.muzzleFlashGroup.visible = false;
    this.viewmodelGroup.add(this.muzzleFlashGroup);

    this.initViewmodels();
    this.updateActiveWeaponModel();
    this.setupEventListeners();
  }

  private initViewmodels() {
    Object.values(WEAPONS).forEach((w) => {
      const built = buildRealisticViewmodel(w, this.team);
      built.group.visible = false;
      this.viewmodelGroup.add(built.group);
      this.viewmodels.set(w.id, built);
    });

    this.defuseToolVM = buildDefuseToolViewmodel(this.team);
    this.defuseToolVM.group.visible = false;
    this.viewmodelGroup.add(this.defuseToolVM.group);
  }

  public updateActiveWeaponModel() {
    const activeWeapon = this.getActiveWeapon();
    const showDefuse = this.state.isDefusing;
    this.viewmodels.forEach((vm, id) => {
      vm.group.visible = !showDefuse && activeWeapon !== null && id === activeWeapon.id && !this.state.isScoped;
    });
    if (this.defuseToolVM) {
      this.defuseToolVM.group.visible = showDefuse;
    }
    if (activeWeapon) {
      const vm = this.viewmodels.get(activeWeapon.id);
      const mOff = vm?.muzzleOffset || new THREE.Vector3(0, 0.02, -0.5);
      this.muzzleFlashGroup.position.copy(mOff);
      this.muzzleFlashLight.position.copy(mOff).add(new THREE.Vector3(0, 0.05, -0.1));
    }
  }

  public getMuzzleWorldPos(): THREE.Vector3 {
    const activeWeapon = this.getActiveWeapon();
    const vm = activeWeapon ? this.viewmodels.get(activeWeapon.id) : undefined;
    const mOff = vm?.muzzleOffset || new THREE.Vector3(0, 0.02, -0.5);
    const worldPos = mOff.clone();
    this.viewmodelGroup.localToWorld(worldPos);
    return worldPos;
  }

  public getActiveWeapon(): WeaponStats | null {
    return this.state.weapons[this.state.activeSlot] || null;
  }

  public isRunning(): boolean {
    return this.state.isAlive && this.state.isSprinting && this.velocity.lengthSq() > 12;
  }

  public giveWeapon(weapon: WeaponStats) {
    this.state.weapons[weapon.slot] = { ...weapon };
    if (!this.state.ammo[weapon.id]) {
      this.state.ammo[weapon.id] = { clip: weapon.magazineSize, reserve: weapon.maxReserve };
    } else {
      this.state.ammo[weapon.id].clip = weapon.magazineSize;
      this.state.ammo[weapon.id].reserve = weapon.maxReserve;
    }
    this.selectSlot(weapon.slot);
    this.onStateChange?.({ ...this.state });
  }

  public giveGrenade(type: 'hegrenade' | 'smokegrenade'): boolean {
    if (type === 'hegrenade') {
      if (this.state.grenades.he >= 1) return false;
      this.state.grenades.he = 1;
      this.state.ammo.hegrenade = { clip: 1, reserve: 0 };
    } else {
      if (this.state.grenades.smoke >= 1) return false;
      this.state.grenades.smoke = 1;
      this.state.ammo.smokegrenade = { clip: 1, reserve: 0 };
    }

    if (!this.state.weapons[4] || this.state.activeSlot !== 4) {
      const preferred = this.state.grenades.he > 0 ? 'hegrenade' : 'smokegrenade';
      this.state.weapons[4] = { ...WEAPONS[preferred] };
      this.state.activeGrenadeType = preferred;
    } else {
      this.state.weapons[4] = { ...WEAPONS[type] };
      this.state.activeGrenadeType = type;
      this.updateActiveWeaponModel();
    }

    this.onStateChange?.({ ...this.state });
    return true;
  }

  public selectSlot(slot: number) {
    if (slot === 4) {
      const hasHE = this.state.grenades.he > 0;
      const hasSmoke = this.state.grenades.smoke > 0;
      if (!hasHE && !hasSmoke) return;
      if (this.state.isPlanting || this.state.isDefusing) return;

      let chosen: 'hegrenade' | 'smokegrenade';
      if (this.state.activeSlot === 4 && hasHE && hasSmoke) {
        chosen = this.state.activeGrenadeType === 'hegrenade' ? 'smokegrenade' : 'hegrenade';
      } else if (this.state.activeGrenadeType === 'smokegrenade' && hasSmoke && !hasHE) {
        chosen = 'smokegrenade';
      } else {
        chosen = hasHE ? 'hegrenade' : 'smokegrenade';
      }

      this.state.weapons[4] = { ...WEAPONS[chosen] };
      this.state.activeGrenadeType = chosen;
      this.state.activeSlot = 4;
      this.state.isScoped = false;
      this.state.isADS = false;
      this.state.isReloading = false;
      this.isInspecting = false;
      this.inspectProgress = 0;
      this.equipProgress = 0;
      this.shotPatternStep = 0;
      this.updateActiveWeaponModel();
      sound.playWeaponEquip();
      this.onStateChange?.({ ...this.state });
      return;
    }

    if (!this.state.weapons[slot]) return;
    if (this.state.isPlanting || this.state.isDefusing) return;
    const slotChanged = this.state.activeSlot !== slot;
    this.state.activeSlot = slot;
    this.state.isScoped = false;
    this.state.isADS = false;
    this.state.isReloading = false;
    this.isInspecting = false;
    this.inspectProgress = 0;
    this.shotPatternStep = 0;
    this.updateActiveWeaponModel();
    if (slotChanged) {
      this.equipProgress = 0;
      sound.playWeaponEquip();
    }
    this.onStateChange?.({ ...this.state });
  }

  public resetMatch() {
    this.state.money = 800;
    this.state.kills = 0;
    this.state.deaths = 0;
    this.state.score = 0;
    this.state.armor = 0;
    this.state.hasHelmet = false;
    this.state.hasDefuser = false;
    this.state.grenades = { he: 0, smoke: 0 };
    this.state.activeGrenadeType = null;
    this.state.ammo.hegrenade = { clip: 0, reserve: 0 };
    this.state.ammo.smokegrenade = { clip: 0, reserve: 0 };
    this.state.weapons = {
      1: null,
      2: this.team === 'gang' ? { ...WEAPONS.glock } : { ...WEAPONS.usp },
      3: { ...WEAPONS.knife },
      4: null,
      5: null
    };
    this.state.activeSlot = 2;
    this.explosionShake = 0;
    this.clearInputs();
    this.updateActiveWeaponModel();
    this.onStateChange?.({ ...this.state });
  }

  public clearInputs() {
    this.keys = {};
    this.isMouseDown = false;
  }

  public resetRound(spawnPos: THREE.Vector3, hasC4 = false) {
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.yaw = this.team === 'gang' ? Math.PI : 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilRoll = 0;
    this.shotPatternStep = 0;
    this.cameraShake = 0;
    this.explosionShake = 0;
    this.sprayBloom = 0;
    this.adsBlend = 0;
    this.sprintBlend = 0;
    this.slideKick = 0;
    this.landingDip = 0;
    this.strafeRoll = 0;
    this.currentEyeHeight = GAME_FEEL_CONFIG.movement.eyeHeightStand;
    this.isMouseDown = false;
    this.isInspecting = false;
    this.inspectProgress = 0;
    this.inspectBlend = 0;
    this.equipProgress = 0;

    this.state.health = 100;
    this.state.isAlive = true;
    this.state.hasC4 = hasC4;
    this.state.grenades = { he: 0, smoke: 0 };
    this.state.activeGrenadeType = null;
    this.state.weapons[4] = null;
    this.state.ammo.hegrenade = { clip: 0, reserve: 0 };
    this.state.ammo.smokegrenade = { clip: 0, reserve: 0 };
    if (hasC4) {
      this.state.weapons[5] = { ...WEAPONS.c4 };
      this.state.ammo['c4'] = { clip: 1, reserve: 0 };
    } else {
      this.state.weapons[5] = null;
    }

    Object.values(this.state.weapons).forEach((w) => {
      if (w && this.state.ammo[w.id]) {
        this.state.ammo[w.id].clip = w.magazineSize;
        this.state.ammo[w.id].reserve = w.maxReserve;
      }
    });

    if (this.state.weapons[1]) {
      this.selectSlot(1);
    } else {
      this.selectSlot(2);
    }
    this.equipProgress = 0;
    sound.playWeaponEquip();

    this.isDeathCam = false;
    if (this.characterRig) {
      this.characterRig.group.visible = false;
    }
    this.viewmodelGroup.visible = true;
    this.state.isPlanting = false;
    this.state.plantProgress = 0;
    this.state.isDefusing = false;
    this.state.defuseProgress = 0;
    this.state.isReloading = false;
    this.state.isScoped = false;
    this.state.isADS = false;
    this.state.isSprinting = false;
    this.onStateChange?.({ ...this.state });
  }

  public triggerInspect() {
    if (!this.state.isAlive || this.state.isReloading || this.state.isPlanting || this.state.isDefusing || this.state.isADS || this.state.isScoped) {
      return;
    }
    const active = this.getActiveWeapon();
    if (!active || active.id === 'c4') return;
    if (this.equipProgress < 0.85) return;
    this.isInspecting = true;
    this.inspectProgress = 0;
    sound.playWeaponInspect();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.isLocked) return;
    this.keys[e.code] = true;
    if (!this.suppressSlotHotkeys) {
      if (e.code === 'Digit1') this.selectSlot(1);
      if (e.code === 'Digit2') this.selectSlot(2);
      if (e.code === 'Digit3') this.selectSlot(3);
      if (e.code === 'Digit4') this.selectSlot(4);
      if (e.code === 'Digit5') this.selectSlot(5);
    }
    if (e.code === 'KeyR') this.startReload();
    if (e.code === 'KeyF') this.triggerInspect();
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isLocked || !this.state.isAlive) return;
    const sensMult = this.state.isScoped ? 0.35 : this.state.isADS ? 0.65 : 1.0;
    const sens = this.mouseSensitivity * sensMult;
    const dx = e.movementX * sens;
    const dy = e.movementY * sens;

    // Raw 1:1 mouse aiming: zero smoothing or acceleration
    this.yaw -= dx;
    this.pitch -= dy;
    this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch));

    // Weapon rotational/turn inertia sway
    const vmCfg = GAME_FEEL_CONFIG.viewmodel;
    const swayMult = this.reducedMotion ? GAME_FEEL_CONFIG.camera.reducedMotion.viewmodelSwayMult : 1.0;
    this.swayX = THREE.MathUtils.clamp(
      this.swayX - dx * vmCfg.swaySensitivity * swayMult,
      -vmCfg.swayMaxX,
      vmCfg.swayMaxX
    );
    this.swayY = THREE.MathUtils.clamp(
      this.swayY + dy * vmCfg.swaySensitivity * swayMult,
      -vmCfg.swayMaxY,
      vmCfg.swayMaxY
    );
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.isLocked || !this.state.isAlive) return;
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
      return;
    }
    const active = this.getActiveWeapon();
    if (active?.category === 'grenade') {
      this.isInspecting = false;
      if (e.button === 0) {
        this.throwActiveGrenade(19.5, 3.2);
      } else if (e.button === 2) {
        e.preventDefault();
        this.throwActiveGrenade(10.5, 2.4);
      }
      return;
    }

    if (e.button === 0) {
      this.isMouseDown = true;
      this.tryShoot();
    } else if (e.button === 2) {
      e.preventDefault();
      if (!active || active.category === 'melee' || active.category === 'explosive' || this.state.isReloading) return;
      this.isInspecting = false;

      if (active.isScoped) {
        this.state.isScoped = !this.state.isScoped;
        this.state.isADS = this.state.isScoped;
        sound.playADS(this.state.isScoped);
        this.updateActiveWeaponModel();
        this.onStateChange?.({ ...this.state });
      } else {
        this.state.isADS = !this.state.isADS;
        sound.playADS(this.state.isADS);
        this.onStateChange?.({ ...this.state });
      }
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isMouseDown = false;
      this.shotPatternStep = 0;
    } else if (e.button === 3 || e.button === 4) {
      e.preventDefault();
    }
  };

  private handleAuxClick = (e: MouseEvent) => {
    if (this.isLocked && (e.button === 1 || e.button === 3 || e.button === 4)) {
      e.preventDefault();
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    if (this.isLocked) e.preventDefault();
  };

  private handleWindowBlur = () => {
    this.clearInputs();
  };

  private setupEventListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('auxclick', this.handleAuxClick);
    window.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  public dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('auxclick', this.handleAuxClick);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('blur', this.handleWindowBlur);
  }

  public tryShoot() {
    if (!this.state.isAlive || this.state.isPlanting || this.state.isDefusing || this.state.isReloading) return;
    if (this.equipProgress < 0.72) return; // slight weapon draw gate
    const weapon = this.getActiveWeapon();
    if (!weapon || weapon.id === 'c4' || weapon.category === 'grenade') return;

    const now = performance.now() / 1000;
    const fireInterval = 1 / weapon.fireRate;
    if (now - this.lastShootTime < fireInterval) return;

    const ammo = this.state.ammo[weapon.id];
    if (weapon.category !== 'melee' && ammo && ammo.clip <= 0) {
      this.startReload();
      return;
    }

    this.isInspecting = false;
    this.lastShootTime = now;
    this.sprintSuppressTimer = 0.24; // Crisp sprint-to-fire cancel
    this.shotPatternStep++;

    if (weapon.category !== 'melee' && ammo) {
      ammo.clip--;
    }

    sound.playGunshot(weapon.id as GunshotSoundId);
    if (weapon.category !== 'melee') {
      sound.playShellClink();
    }

    // Learnable CS2-style deterministic recoil pattern + subtle micro-variation
    const mv = GAME_FEEL_CONFIG.movement;
    const recCfg = GAME_FEEL_CONFIG.recoil;
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const adsFactor = this.state.isADS ? 0.58 : 1.0;
    const crouchFactor = this.state.isCrouching ? 0.65 : 1.0;
    const moveClimbMult = !this.isGrounded ? 1.45 : horizSpeed > mv.stopAccuracySpeed ? 1.2 : 1.0;
    const recoilAmount = weapon.recoil * adsFactor * crouchFactor * moveClimbMult;

    const patternKey = recCfg.patterns[weapon.id] ? weapon.id : 'pistol';
    const patternArr = recCfg.patterns[patternKey] || recCfg.patterns.pistol;
    const stepIdx = Math.min(this.shotPatternStep - 1, patternArr.length - 1);
    const [patYaw, patPitch] = patternArr[Math.max(0, stepIdx)];
    const jitter = recCfg.microJitterRatio;
    const yawKick = (patYaw + (Math.random() - 0.5) * jitter) * recoilAmount;
    const pitchKick = (patPitch + (Math.random() - 0.5) * jitter * 0.6) * recoilAmount;

    // Predictable muzzle climb & snappy spring punch
    this.pitch = Math.min(Math.PI / 2.1, this.pitch + pitchKick * 0.34);
    this.yaw -= yawKick * 0.22;

    this.recoilPitch += pitchKick * 0.74;
    this.recoilYaw += yawKick;
    const shakeScale = this.reducedMotion ? GAME_FEEL_CONFIG.camera.reducedMotion.cameraShakeMult : 1.0;
    this.recoilRoll = (Math.random() - 0.5) * recoilAmount * 0.85 * shakeScale;
    this.cameraShake = Math.min(0.03, this.cameraShake + recoilAmount * 0.44 * shakeScale);
    this.sprayBloom = Math.min(28, this.sprayBloom + (weapon.category === 'pistol' ? 6.0 : 4.2));

    // Snappy short Viewmodel Kickback + Slide/Bolt Blowback
    this.weaponKickZ = weapon.id === 'awp' ? 0.14 : weapon.category === 'melee' ? -0.14 : 0.068;
    this.weaponKickRotX = weapon.id === 'awp' ? 0.16 : weapon.category === 'melee' ? -0.24 : 0.088;
    this.weaponKickRotY = -yawKick * 0.38;
    this.slideKick = weapon.id === 'awp' ? 0.05 : 0.042;

    // Ultra-brief high-contrast Muzzle Flash (never blocks target silhouette)
    if (weapon.category !== 'melee') {
      this.flashTimer = GAME_FEEL_CONFIG.vfx.muzzleFlashDuration;
      this.muzzleFlashLight.intensity = weapon.id === 'usp' || weapon.id === 'm4a1' || weapon.id === 'mp5' ? 1.9 : 4.4;
      this.muzzleFlashGroup.visible = true;
      this.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
      const suppressedScale = weapon.id === 'usp' || weapon.id === 'm4a1' || weapon.id === 'mp5' ? 0.38 : 0.82;
      const sc = suppressedScale * (this.state.isADS ? 0.58 : 0.88 + Math.random() * 0.25);
      this.muzzleFlashGroup.scale.setScalar(sc);
    }

    // Continuous CS2 Stop-to-Shoot Accuracy Curve
    let moveFactor = 1.0;
    if (!this.isGrounded) {
      moveFactor = mv.airInaccuracyMult;
    } else if (horizSpeed > mv.stopAccuracySpeed) {
      const speedNorm = Math.min(1, (horizSpeed - mv.stopAccuracySpeed) / Math.max(0.1, mv.sprintSpeed - mv.stopAccuracySpeed));
      moveFactor = 1.0 + speedNorm * speedNorm * (mv.maxMoveInaccuracyMult - 1.0);
    } else if (this.state.isCrouching) {
      moveFactor = mv.crouchInaccuracyMult;
    }

    const adsSpreadMult = this.state.isADS ? mv.adsInaccuracyMult : 1.0;
    const spreadMag = weapon.spread * adsSpreadMult * moveFactor;
    const spreadX = (Math.random() - 0.5) * spreadMag;
    const spreadY = (Math.random() - 0.5) * spreadMag;

    this._tmpEuler.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ');
    const rayDir = this._tmpRayDir.set(spreadX, spreadY, -1).applyEuler(this._tmpEuler).normalize();

    const targetPoint = this._tmpTargetPt.copy(this.camera.position).addScaledVector(rayDir, 120);
    const muzzleWorld = this.getMuzzleWorldPos();
    this.onShoot?.(targetPoint, false, muzzleWorld);
    this.onStateChange?.({ ...this.state });
  }

  private throwActiveGrenade(speed: number, upBoost: number) {
    if (!this.state.isAlive || this.state.isPlanting || this.state.isDefusing || this.state.isReloading) return;
    const weapon = this.getActiveWeapon();
    if (!weapon || weapon.category !== 'grenade') return;

    const gType = weapon.id as 'hegrenade' | 'smokegrenade';
    if (gType === 'hegrenade' && this.state.grenades.he <= 0) return;
    if (gType === 'smokegrenade' && this.state.grenades.smoke <= 0) return;

    const now = performance.now() / 1000;
    if (now - this.lastShootTime < 0.45) return;
    this.lastShootTime = now;

    if (gType === 'hegrenade') {
      this.state.grenades.he = 0;
      this.state.ammo.hegrenade.clip = 0;
    } else {
      this.state.grenades.smoke = 0;
      this.state.ammo.smokegrenade.clip = 0;
    }

    this._tmpEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    const forward = this._tmpForward.set(0, 0, -1).applyEuler(this._tmpEuler).normalize();

    const origin = this.camera.position.clone().addScaledVector(forward, 0.65);
    origin.y -= 0.06;

    const vel = forward.multiplyScalar(speed);
    vel.y += upBoost;

    sound.playGrenadePin();
    sound.playGrenadeThrow();
    this.weaponKickZ = -0.18;
    this.weaponKickRotX = -0.35;

    this.onThrowGrenade?.(gType, origin, vel);

    // Switch to remaining grenade or back to primary/secondary weapon
    if (this.state.grenades.he > 0) {
      this.state.activeGrenadeType = 'hegrenade';
      this.state.weapons[4] = { ...WEAPONS.hegrenade };
      this.updateActiveWeaponModel();
    } else if (this.state.grenades.smoke > 0) {
      this.state.activeGrenadeType = 'smokegrenade';
      this.state.weapons[4] = { ...WEAPONS.smokegrenade };
      this.updateActiveWeaponModel();
    } else {
      this.state.activeGrenadeType = null;
      this.state.weapons[4] = null;
      if (this.state.weapons[1]) this.selectSlot(1);
      else if (this.state.weapons[2]) this.selectSlot(2);
      else this.selectSlot(3);
    }
    this.onStateChange?.({ ...this.state });
  }

  public addExplosionShake(amount: number, rollKick: number = 0) {
    const mult = this.reducedMotion ? GAME_FEEL_CONFIG.camera.reducedMotion.explosionShakeMult : 1.0;
    this.explosionShake = Math.min(0.42, Math.max(this.explosionShake, amount * mult));
    if (rollKick > 0) {
      this.recoilRoll += (Math.random() < 0.5 ? -1 : 1) * rollKick * mult;
    }
    this.recoilPitch += amount * 0.14 * mult;
  }

  public startReload() {
    const weapon = this.getActiveWeapon();
    if (!weapon || weapon.category === 'melee' || weapon.category === 'explosive' || weapon.category === 'grenade') return;
    const ammo = this.state.ammo[weapon.id];
    if (!ammo || ammo.clip >= weapon.magazineSize || ammo.reserve <= 0) return;
    if (this.state.isReloading) return;

    this.isInspecting = false;
    this.state.isReloading = true;
    this.state.reloadProgress = 0;
    this.reloadStageTriggered = { magOut: false, magIn: false, bolt: false };
    this.state.isScoped = false;
    this.state.isADS = false;
    this.shotPatternStep = 0;
    this.updateActiveWeaponModel();
    this.onStateChange?.({ ...this.state });
  }

  public takeDamage(amount: number, isHeadshot = false): boolean {
    if (!this.state.isAlive) return false;
    sound.playPlayerHit(isHeadshot);

    let finalDamage = amount;
    if (isHeadshot) {
      if (this.state.hasHelmet) {
        finalDamage = amount * 0.45;
        this.state.armor = Math.max(0, this.state.armor - 15);
      } else {
        finalDamage = amount * 0.72;
      }
    } else {
      if (this.state.armor > 0) {
        finalDamage = amount * 0.42;
        this.state.armor = Math.max(0, this.state.armor - Math.round(amount * 0.25));
      }
    }

    // Physical bullet impact flinch on camera (respects Reduced Motion)
    const shakeScale = this.reducedMotion ? GAME_FEEL_CONFIG.camera.reducedMotion.cameraShakeMult : 1.0;
    this.cameraShake = Math.min(0.05, this.cameraShake + 0.02 * shakeScale);
    this.recoilRoll = (Math.random() < 0.5 ? -1 : 1) * 0.036 * shakeScale;
    this.recoilPitch += 0.015 * shakeScale;

    this.state.health = Math.max(0, Math.round(this.state.health - finalDamage));
    if (this.state.health <= 0) {
      sound.playPlayerDeath();
      this.state.isAlive = false;
      this.state.deaths++;
      this.state.isPlanting = false;
      this.state.isDefusing = false;
      this.state.isScoped = false;
      this.state.isADS = false;
      this.state.isSprinting = false;
      this.isMouseDown = false;
      this.updateActiveWeaponModel();

      this.isDeathCam = true;
      this.viewmodelGroup.visible = false;
      if (this.characterRig) {
        this.characterRig.group.position.copy(this.position);
        this.characterRig.group.rotation.y = this.yaw;
        this.characterRig.group.visible = true;
        this.characterRig.playAnimation('death', 0.1);
      }
    }
    this.onStateChange?.({ ...this.state });
    return !this.state.isAlive;
  }

  public update(
    dt: number,
    colliders: BoxCollider[],
    ramps: RampZone[],
    isBombPlanted: boolean,
    bombPos?: THREE.Vector3,
    siteA?: { center: THREE.Vector3; radius: number },
    siteB?: { center: THREE.Vector3; radius: number }
  ) {
    if (!this.state.isAlive) {
      if (this.isDeathCam && this.characterRig) {
        this.characterRig.mixer.update(dt);
        const backDir = this._tmpBackDir.set(0, 0, 1).applyAxisAngle(this._upAxis, this.yaw);
        const targetCamPos = this._tmpNextPos.copy(this.position).addScaledVector(backDir, 3.8);
        targetCamPos.y = this.position.y + 2.4;
        this.camera.position.lerp(targetCamPos, Math.min(1, 4.5 * dt));
        this.camera.lookAt(this.position.x, this.position.y + 0.65, this.position.z);
      }
      return;
    }

    if (this.sprintSuppressTimer > 0) this.sprintSuppressTimer -= dt;

    // Full-auto hold-to-fire support for SMGs and Rifles (AK-47, M4A1, MP5)
    const activeWep = this.getActiveWeapon();
    if (this.isMouseDown && this.isLocked && activeWep && (activeWep.category === 'rifle' || activeWep.category === 'smg')) {
      this.tryShoot();
    }

    // Check plantable state for Gang
    let canPlant = false;
    let currentSite: 'A' | 'B' | null = null;
    if (this.team === 'gang' && this.state.hasC4 && !isBombPlanted) {
      if (siteA && this.position.distanceTo(siteA.center) <= siteA.radius) {
        canPlant = true;
        currentSite = 'A';
      } else if (siteB && this.position.distanceTo(siteB.center) <= siteB.radius) {
        canPlant = true;
        currentSite = 'B';
      }
    }
    this.state.canPlantHere = canPlant;
    this.state.currentSite = currentSite;

    // Check defusable state for Police
    let canDefuse = false;
    if (this.team === 'swat' && isBombPlanted && bombPos) {
      if (this.position.distanceTo(bombPos) <= 3.2) {
        canDefuse = true;
      }
    }
    this.state.canDefuseHere = canDefuse;

    // Handle Holding E to Plant
    if (this.keys['KeyE'] && canPlant && currentSite) {
      if (!this.state.isPlanting) {
        this.state.isPlanting = true;
        this.state.plantProgress = 0;
        this.state.isADS = false;
        this.selectSlot(5);
        this.onStateChange?.({ ...this.state });
      }
      this.state.plantProgress += dt / 3.0;
      if (Math.random() < 0.2) sound.playPlantingKey();

      if (this.state.plantProgress >= 1.0) {
        this.state.isPlanting = false;
        this.state.plantProgress = 0;
        this.state.hasC4 = false;
        this.state.weapons[5] = null;
        this.selectSlot(this.state.weapons[1] ? 1 : 2);
        this.onPlantCompleted?.(currentSite, this.position.clone());
        this.onStateChange?.({ ...this.state });
      } else {
        this.notifyProgressState();
      }
    } else if (this.state.isPlanting) {
      this.state.isPlanting = false;
      this.state.plantProgress = 0;
      this.onStateChange?.({ ...this.state });
    }

    // Handle Holding E to Defuse
    if (this.keys['KeyE'] && canDefuse) {
      if (!this.state.isDefusing) {
        this.state.isDefusing = true;
        this.state.defuseProgress = 0;
        this.state.isADS = false;
        this.updateActiveWeaponModel();
        this.onStateChange?.({ ...this.state });
      }
      const defuseTime = this.state.hasDefuser ? 2.5 : 5.0;
      this.state.defuseProgress += dt / defuseTime;
      if (Math.random() < 0.2) sound.playDefuseKey();

      if (this.state.defuseProgress >= 1.0) {
        this.state.isDefusing = false;
        this.state.defuseProgress = 0;
        this.updateActiveWeaponModel();
        this.onDefuseCompleted?.();
        this.onStateChange?.({ ...this.state });
      } else {
        this.notifyProgressState();
      }
    } else if (this.state.isDefusing) {
      this.state.isDefusing = false;
      this.state.defuseProgress = 0;
      this.updateActiveWeaponModel();
      this.onStateChange?.({ ...this.state });
    }

    // Handle Reloading with Animation-Synced Stage Audio
    if (this.state.isReloading && activeWep) {
      this.state.reloadProgress += dt / activeWep.reloadTime;
      const rp = this.state.reloadProgress;

      if (!this.reloadStageTriggered.magOut && rp >= 0.08) {
        this.reloadStageTriggered.magOut = true;
        sound.playReloadStage('mag_out', activeWep.id);
      }
      if (!this.reloadStageTriggered.magIn && rp >= 0.54) {
        this.reloadStageTriggered.magIn = true;
        sound.playReloadStage('mag_in', activeWep.id);
      }
      if (!this.reloadStageTriggered.bolt && rp >= 0.76) {
        this.reloadStageTriggered.bolt = true;
        sound.playReloadStage('bolt', activeWep.id);
      }

      if (this.state.reloadProgress >= 1.0) {
        const ammo = this.state.ammo[activeWep.id];
        if (ammo) {
          const needed = activeWep.magazineSize - ammo.clip;
          const take = Math.min(needed, ammo.reserve);
          ammo.clip += take;
          ammo.reserve -= take;
        }
        this.state.isReloading = false;
        this.state.reloadProgress = 0;
        this.updateActiveWeaponModel();
        this.onStateChange?.({ ...this.state });
      } else {
        this.notifyProgressState();
      }
    }

    const mv = GAME_FEEL_CONFIG.movement;
    const camCfg = GAME_FEEL_CONFIG.camera;
    const vmCfg = GAME_FEEL_CONFIG.viewmodel;

    // Crouch handling & smooth eye height transition
    this.state.isCrouching = !!(this.keys['KeyC'] || this.keys['ControlLeft']);
    const targetEyeY = this.state.isCrouching ? mv.eyeHeightCrouch : mv.eyeHeightStand;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEyeY, mv.crouchTransitionDamp, dt);

    // Directional Input (normalized so diagonal speed never exceeds cardinal speed)
    const moveDir = this._tmpMoveDir.set(0, 0, 0);
    let strafeInput = 0;
    let forwardInput = 0;
    if (this.keys['KeyW']) {
      moveDir.z -= 1;
      forwardInput += 1;
    }
    if (this.keys['KeyS']) {
      moveDir.z += 1;
      forwardInput -= 1;
    }
    if (this.keys['KeyA']) {
      moveDir.x -= 1;
      strafeInput -= 1;
    }
    if (this.keys['KeyD']) {
      moveDir.x += 1;
      strafeInput += 1;
    }

    // Hold Shift to Sprint (cancelled cleanly when crouching, ADS/scoped, reloading, planting/defusing, or shooting)
    const shiftHeld = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const movingForwardish = !!this.keys['KeyW'] || moveDir.lengthSq() > 0;
    const canSprint =
      shiftHeld &&
      movingForwardish &&
      !this.state.isCrouching &&
      !this.state.isADS &&
      !this.state.isScoped &&
      !this.state.isReloading &&
      !this.state.isPlanting &&
      !this.state.isDefusing &&
      this.sprintSuppressTimer <= 0;

    this.state.isSprinting = canSprint;
    if (canSprint) this.isInspecting = false;

    // Smooth Speed Selection
    let baseSpeed = mv.walkSpeed;
    if (canSprint) baseSpeed = mv.sprintSpeed;
    if (this.state.isCrouching) baseSpeed = mv.crouchSpeed;
    if (this.state.isADS) baseSpeed = Math.min(baseSpeed, mv.adsMaxSpeed);
    if (this.state.isScoped) baseSpeed = mv.scopedSpeed;
    if (this.state.isPlanting || this.state.isDefusing) baseSpeed = mv.plantDefuseSpeed;

    const isMoving = moveDir.lengthSq() > 0;
    if (isMoving) {
      moveDir.normalize().applyAxisAngle(this._upAxis, this.yaw);
      const targetVx = moveDir.x * baseSpeed;
      const targetVz = moveDir.z * baseSpeed;

      // Crisp CS2 ground acceleration vs counter-strafe reversal vs limited air-strafe
      let rate = mv.groundAccel;
      if (!this.isGrounded) {
        rate = mv.airAccel;
      } else {
        const dot = this.velocity.x * moveDir.x + this.velocity.z * moveDir.z;
        if (dot < -0.5) rate = mv.groundDecel * 1.25; // snappy counter-strafe reversal
      }
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, targetVx, rate, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetVz, rate, dt);

      // Strict horizontal max speed clamp (guarantees diagonal movement cannot gain extra speed)
      if (this.isGrounded) {
        const speedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
        if (speedSq > baseSpeed * baseSpeed) {
          const scale = baseSpeed / Math.sqrt(speedSq);
          this.velocity.x *= scale;
          this.velocity.z *= scale;
        }
      }
    } else {
      const decelRate = this.isGrounded ? mv.groundDecel : mv.airDecel;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, decelRate, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, decelRate, dt);
      if (this.isGrounded && this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z < 0.002) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const groundSurface = getGroundSurfaceAt(
      this.position.x,
      this.position.z,
      this.position.y,
      colliders,
      this.defaultGroundSurface,
      mv.playerRadius
    );

    if (horizSpeed > 0.65 && this.isGrounded) {
      // Footstep cadence synced to movement mode & current surface material
      const stepInterval = this.state.isSprinting ? 0.275 : this.state.isCrouching ? 0.56 : 0.42;
      this.footstepTimer += dt;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer = 0;
        sound.playFootstep(this.state.isSprinting, groundSurface, this.state.isCrouching);
      }
      // Stride clock synced smoothly to actual horizontal speed
      const speedRatio = horizSpeed / mv.walkSpeed;
      this.bobTimer += dt * (this.state.isSprinting ? 13.5 : this.state.isCrouching ? 6.4 : 9.4 * Math.min(1.2, speedRatio));
    } else {
      // Subtle idle breathing phase
      this.bobTimer += dt * 1.75;
    }

    // Weighty Jump: snappy ascent + heavier descent
    if (this.keys['Space'] && this.isGrounded && !this.state.isCrouching) {
      this.velocity.y = mv.jumpVelocity;
      this.isGrounded = false;
      sound.playJump();
    }
    const grav = this.velocity.y >= 0 ? mv.gravityRise : mv.gravityFall;
    this.velocity.y -= grav * dt;

    // Axis-separated smooth wall & corner sliding (prevents abrupt snagging on edges)
    const nextPos = this._tmpNextPos.copy(this.position);
    const playerRadius = mv.playerRadius;
    const stepUpLimit = mv.stepUpLimit;

    // 1. Resolve X-axis displacement & slide along Z walls
    nextPos.x += this.velocity.x * dt;
    for (const c of colliders) {
      if (
        nextPos.x + playerRadius > c.min.x &&
        nextPos.x - playerRadius < c.max.x &&
        nextPos.z + playerRadius > c.min.z &&
        nextPos.z - playerRadius < c.max.z &&
        nextPos.y + stepUpLimit < c.max.y &&
        nextPos.y + this.currentEyeHeight > c.min.y
      ) {
        if (this.velocity.x > 0) {
          nextPos.x = c.min.x - playerRadius;
        } else if (this.velocity.x < 0) {
          nextPos.x = c.max.x + playerRadius;
        } else {
          const ox1 = nextPos.x + playerRadius - c.min.x;
          const ox2 = c.max.x - (nextPos.x - playerRadius);
          nextPos.x = ox1 < ox2 ? c.min.x - playerRadius : c.max.x + playerRadius;
        }
        this.velocity.x = 0;
      }
    }

    // 2. Resolve Z-axis displacement & slide along X walls
    nextPos.z += this.velocity.z * dt;
    for (const c of colliders) {
      if (
        nextPos.x + playerRadius > c.min.x &&
        nextPos.x - playerRadius < c.max.x &&
        nextPos.z + playerRadius > c.min.z &&
        nextPos.z - playerRadius < c.max.z &&
        nextPos.y + stepUpLimit < c.max.y &&
        nextPos.y + this.currentEyeHeight > c.min.y
      ) {
        if (this.velocity.z > 0) {
          nextPos.z = c.min.z - playerRadius;
        } else if (this.velocity.z < 0) {
          nextPos.z = c.max.z + playerRadius;
        } else {
          const oz1 = nextPos.z + playerRadius - c.min.z;
          const oz2 = c.max.z - (nextPos.z - playerRadius);
          nextPos.z = oz1 < oz2 ? c.min.z - playerRadius : c.max.z + playerRadius;
        }
        this.velocity.z = 0;
      }
    }

    // 3. Apply vertical displacement & ramps/platforms
    nextPos.y += this.velocity.y * dt;
    this.wasGrounded = this.isGrounded;
    const floorHeight = getSurfaceHeightAt(nextPos.x, nextPos.z, this.position.y, colliders, ramps, playerRadius);
    if (nextPos.y <= floorHeight) {
      if (!this.wasGrounded && this.velocity.y < -2.6) {
        const fallSpeed = Math.abs(this.velocity.y);
        const dipMult = this.reducedMotion ? camCfg.reducedMotion.landingDipMult : 1.0;
        this.landingDip = Math.min(camCfg.landingDipMax, fallSpeed * camCfg.landingDipScale * dipMult);
        sound.playLanding(fallSpeed, groundSurface);
      }
      nextPos.y = floorHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (nextPos.y > floorHeight + 0.15) {
      this.isGrounded = false;
    }

    this.position.copy(nextPos);

    // ==============================================
    // COMPETITIVE CAMERA FEEL: SUBTLE BOB (FADES IN SPRINT & ADS), TILT & LANDING DIP
    // ==============================================
    const moveRatio = Math.min(1, horizSpeed / mv.walkSpeed);
    const sprintTarget = this.state.isSprinting && horizSpeed > 4.6 ? 1.0 : 0.0;
    this.sprintBlend = THREE.MathUtils.damp(this.sprintBlend, sprintTarget, vmCfg.sprintBlendDamp, dt);
    this.adsBlend = THREE.MathUtils.damp(this.adsBlend, this.state.isADS ? 1 : 0, vmCfg.adsBlendDamp, dt);

    const bobMotionMult = this.reducedMotion ? camCfg.reducedMotion.headBobMult : 1.0;
    const sprintFade = THREE.MathUtils.lerp(camCfg.headBobWalkScale, camCfg.headBobSprintFade, this.sprintBlend);
    const adsFade = THREE.MathUtils.lerp(1.0, camCfg.headBobAdsFade, this.adsBlend);
    const crouchFade = this.state.isCrouching ? camCfg.headBobCrouchScale : 1.0;
    const bobIntensity = this.isGrounded ? moveRatio * sprintFade * adsFade * crouchFade * bobMotionMult : 0.0;

    const camBobY = Math.sin(this.bobTimer * 2) * camCfg.headBobAmpY * bobIntensity;
    const camBobX = Math.cos(this.bobTimer) * camCfg.headBobAmpX * bobIntensity;
    const camBobRoll = Math.sin(this.bobTimer) * camCfg.headBobRoll * bobIntensity;

    // Subtle smooth lateral strafe tilt + fall-height-scaled landing dip
    const rollMult = this.reducedMotion ? camCfg.reducedMotion.strafeRollMult : 1.0;
    this.strafeRoll = THREE.MathUtils.damp(
      this.strafeRoll,
      -strafeInput * camCfg.strafeRollMax * rollMult * (1 - this.adsBlend * 0.55),
      camCfg.strafeRollDamp,
      dt
    );
    this.landingDip = THREE.MathUtils.damp(this.landingDip, 0, camCfg.landingDipDamp, dt);

    const rightVec = this._tmpRightVec.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const totalShake = this.cameraShake + this.explosionShake;
    const shakeX = (Math.random() - 0.5) * totalShake;
    const shakeY = (Math.random() - 0.5) * totalShake;
    const shakeZ = (Math.random() - 0.5) * this.explosionShake * 0.55;
    this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 18, dt);
    this.explosionShake = THREE.MathUtils.damp(this.explosionShake, 0, 5.2, dt);

    this.camera.position.set(
      this.position.x + rightVec.x * camBobX + shakeX,
      this.position.y + this.currentEyeHeight + camBobY - this.landingDip + shakeY,
      this.position.z + rightVec.z * camBobX + shakeZ
    );

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      this.pitch + this.recoilPitch - this.landingDip * camCfg.landingDipPitchRatio,
      this.yaw + this.recoilYaw,
      this.strafeRoll + camBobRoll + this.recoilRoll
    );

    // Dynamic Smooth FOV (respects Reduced Motion sprint boost toggle)
    const sprintBoost = this.reducedMotion ? 0 : camCfg.sprintFovBoost * this.sprintBlend;
    const targetFov = this.state.isScoped
      ? camCfg.scopedFov
      : this.state.isADS
        ? camCfg.adsFov
        : this.baseFov + sprintBoost;

    if (Math.abs(this.camera.fov - targetFov) > 0.04) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, camCfg.fovDamp, dt);
      this.camera.updateProjectionMatrix();
    }

    // Recover spring recoil, bloom & sway smoothly
    const recCfg = GAME_FEEL_CONFIG.recoil;
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, recCfg.springReturnDamp, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, recCfg.springReturnDamp, dt);
    this.recoilRoll = THREE.MathUtils.damp(this.recoilRoll, 0, recCfg.rollReturnDamp, dt);
    this.sprayBloom = THREE.MathUtils.damp(this.sprayBloom, 0, recCfg.bloomReturnDamp, dt);
    this.swayX = THREE.MathUtils.damp(this.swayX, 0, vmCfg.swayDamp, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, 0, vmCfg.swayDamp, dt);

    // Dynamic crosshair spread mirrors real stop-to-shoot accuracy!
    const moveBloom = !this.isGrounded
      ? 18
      : horizSpeed <= mv.stopAccuracySpeed
        ? 0
        : Math.min(20, (horizSpeed - mv.stopAccuracySpeed) * 2.5);
    const crouchTight = this.state.isCrouching && this.isGrounded ? 0.65 : 1.0;
    this.state.crosshairSpread = Math.round((4 + moveBloom + this.sprayBloom) * crouchTight);

    // ==============================================
    // FIRST-PERSON WEAPON & HANDS ANIMATION (Draw / Inspect / Sway / Sprint / ADS / Kick / Reload)
    // ==============================================
    if (this.equipProgress < 1) {
      this.equipProgress = Math.min(1, this.equipProgress + dt / vmCfg.equipDuration);
    }
    const drawInv = 1 - this.equipProgress;
    const drawCurve = drawInv * drawInv * drawInv; // smooth cubic settle

    if (this.isInspecting) {
      this.inspectProgress += dt / vmCfg.inspectDuration;
      if (this.inspectProgress >= 1.0) {
        this.isInspecting = false;
        this.inspectProgress = 0;
      }
    }
    this.inspectBlend = THREE.MathUtils.damp(this.inspectBlend, this.isInspecting ? 1 : 0, vmCfg.inspectBlendDamp, dt);

    this.weaponKickZ = THREE.MathUtils.damp(this.weaponKickZ, 0, vmCfg.kickReturnDampZ, dt);
    this.weaponKickRotX = THREE.MathUtils.damp(this.weaponKickRotX, 0, vmCfg.kickReturnDampRot, dt);
    this.weaponKickRotY = THREE.MathUtils.damp(this.weaponKickRotY, 0, vmCfg.kickReturnDampRot, dt);
    this.slideKick = THREE.MathUtils.damp(this.slideKick, 0, vmCfg.slideReturnDamp, dt);

    // Movement inertia lag on viewmodel
    const moveLagMult = (1 - this.adsBlend * 0.72) * (this.reducedMotion ? camCfg.reducedMotion.viewmodelSwayMult : 1.0);
    this.moveSwayX = THREE.MathUtils.damp(this.moveSwayX, -strafeInput * 0.012 * moveLagMult, 10, dt);
    this.moveSwayZ = THREE.MathUtils.damp(this.moveSwayZ, forwardInput * 0.01 * moveLagMult, 10, dt);

    const activeVM = activeWep ? this.viewmodels.get(activeWep.id) : undefined;
    if (activeVM) {
      this.resetViewmodelSubParts(activeVM);
      if (activeVM.slideMesh) {
        activeVM.slideMesh.position.z = (activeVM.slideRestZ ?? 0) + this.slideKick;
      }
    }

    const vmBobMult = this.reducedMotion ? camCfg.reducedMotion.viewmodelBobMult : 1.0;
    const vmBobAmp = (1 - this.adsBlend * 0.88) * (horizSpeed > 0.65 ? 0.34 + this.sprintBlend * 0.55 : 0.1) * vmBobMult;
    const vmBobX = Math.sin(this.bobTimer) * 0.013 * vmBobAmp;
    const vmBobY = Math.abs(Math.cos(this.bobTimer)) * 0.015 * vmBobAmp;

    // Ergonomic Hip Stance
    const hipX = 0.195;
    const hipY = -0.185;
    const hipZ = -0.375;
    const hipRotY = 0.045;
    const hipRotZ = -0.025;

    const isPistol = activeWep?.category === 'pistol';
    const adsX = 0.0;
    const adsY = isPistol ? -0.152 : -0.194;
    const adsZ = isPistol ? -0.33 : -0.295;

    // Diagonal tactical sprint carry (lowers and cants barrel smoothly)
    const sprintOffsetX = -0.068 * this.sprintBlend;
    const sprintOffsetY = -0.048 * this.sprintBlend;
    const sprintOffsetZ = 0.025 * this.sprintBlend;
    const sprintRotX = -0.2 * this.sprintBlend;
    const sprintRotY = 0.54 * this.sprintBlend;
    const sprintRotZ = 0.24 * this.sprintBlend;

    // Smooth Inspect Pose (KeyF CS2 showcase twist)
    let inspX = 0;
    let inspY = 0;
    let inspZ = 0;
    let inspRotX = 0;
    let inspRotY = 0;
    let inspRotZ = 0;
    if (this.inspectBlend > 0.005) {
      const p = this.inspectProgress;
      const env = Math.sin(Math.min(1, p) * Math.PI);
      const flip = Math.sin(Math.min(1, Math.max(0, (p - 0.18) / 0.64)) * Math.PI);
      inspX = (-0.065 * env) * this.inspectBlend;
      inspY = (0.025 * env) * this.inspectBlend;
      inspZ = (0.04 * env) * this.inspectBlend;
      inspRotX = (0.14 * env - 0.08 * flip) * this.inspectBlend;
      inspRotY = (0.58 * env + 0.25 * flip) * this.inspectBlend;
      inspRotZ = (-0.42 * env + 0.28 * flip) * this.inspectBlend;
    }

    let targetVmX =
      THREE.MathUtils.lerp(hipX, adsX, this.adsBlend) +
      sprintOffsetX +
      vmBobX +
      this.swayX * (1 - this.adsBlend * 0.6) +
      this.moveSwayX +
      inspX;
    let targetVmY =
      THREE.MathUtils.lerp(hipY, adsY, this.adsBlend) +
      sprintOffsetY -
      vmBobY -
      this.landingDip * 0.35 +
      this.swayY * (1 - this.adsBlend * 0.6) -
      drawCurve * 0.18 +
      inspY;
    let targetVmZ =
      THREE.MathUtils.lerp(hipZ, adsZ, this.adsBlend) +
      sprintOffsetZ +
      this.weaponKickZ +
      this.moveSwayZ +
      drawCurve * 0.1 +
      inspZ;

    let targetRotX = this.weaponKickRotX + sprintRotX - drawCurve * 0.42 + inspRotX;
    let targetRotY = THREE.MathUtils.lerp(hipRotY, 0, this.adsBlend) + this.weaponKickRotY + sprintRotY + drawCurve * 0.25 + inspRotY;
    let targetRotZ = THREE.MathUtils.lerp(hipRotZ, 0, this.adsBlend) + sprintRotZ - drawCurve * 0.14 + inspRotZ;

    // 1. Distinct Procedural Reload Animations (Pistol vs Rifle/SMG/AWP)
    if (this.state.isReloading && activeWep && activeVM) {
      const r = this.applyReloadAnimation(activeVM, activeWep, this.state.reloadProgress);
      targetVmX += r.offsetX;
      targetVmY += r.offsetY;
      targetVmZ += r.offsetZ;
      targetRotX += r.rotX;
      targetRotY += r.rotY;
      targetRotZ += r.rotZ;
    }

    // 2. 3D C4 Planting Keypad Animation
    if (this.state.isPlanting && activeVM && activeWep?.id === 'c4') {
      const p = this.state.plantProgress;
      const enter = Math.min(1, p * 5);
      const placeDown = p > 0.85 ? (p - 0.85) / 0.15 : 0;
      targetVmX = THREE.MathUtils.lerp(targetVmX, 0.02, enter);
      targetVmY = THREE.MathUtils.lerp(targetVmY, -0.15 - placeDown * 0.16, enter);
      targetVmZ = THREE.MathUtils.lerp(targetVmZ, -0.3 - placeDown * 0.14, enter);
      targetRotX = 0.42 * enter - placeDown * 0.35;
      targetRotY = 0;
      targetRotZ = 0;

      if (activeVM.rightHandGroup && activeVM.rightHandRestPos) {
        const keyStep = Math.floor(p * 8);
        const pressPulse = Math.max(0, Math.sin(p * Math.PI * 16));
        const colX = ((keyStep % 3) - 1) * 0.016;
        const rowZ = (Math.floor(keyStep / 3) % 2) * 0.015;
        activeVM.rightHandGroup.position.set(
          activeVM.rightHandRestPos.x - 0.045 + colX,
          activeVM.rightHandRestPos.y + 0.04 - pressPulse * 0.018,
          activeVM.rightHandRestPos.z - 0.025 + rowZ
        );
      }
    }

    // 3. 3D C4 Defusing Wire-Cutters & Multimeter Animation
    if (this.state.isDefusing && this.defuseToolVM) {
      const d = this.state.defuseProgress;
      targetVmX = 0.01;
      targetVmY = -0.145;
      targetVmZ = -0.29;
      targetRotX = -0.28 + Math.sin(d * Math.PI * 6) * 0.04;
      targetRotY = 0;
      targetRotZ = Math.cos(d * Math.PI * 4) * 0.03;

      const snipWave = Math.abs(Math.sin(d * Math.PI * 7));
      if (this.defuseToolVM.rightHandGroup && this.defuseToolVM.rightHandRestPos) {
        this.defuseToolVM.rightHandGroup.position.set(
          this.defuseToolVM.rightHandRestPos.x - Math.sin(d * Math.PI * 3) * 0.022,
          this.defuseToolVM.rightHandRestPos.y - snipWave * 0.015,
          this.defuseToolVM.rightHandRestPos.z - Math.cos(d * Math.PI * 5) * 0.018
        );
      }
      if (this.defuseToolVM.leftHandGroup && this.defuseToolVM.leftHandRestPos) {
        this.defuseToolVM.leftHandGroup.position.set(
          this.defuseToolVM.leftHandRestPos.x + Math.sin(d * Math.PI * 4) * 0.014,
          this.defuseToolVM.leftHandRestPos.y,
          this.defuseToolVM.leftHandRestPos.z
        );
      }
      if (this.defuseToolVM.extraAnimParts?.cutterJawL && this.defuseToolVM.extraAnimParts?.cutterJawR) {
        const jawAngle = (1 - snipWave) * 0.28;
        this.defuseToolVM.extraAnimParts.cutterJawL.rotation.y = jawAngle;
        this.defuseToolVM.extraAnimParts.cutterJawR.rotation.y = -jawAngle;
      }
    }

    this.viewmodelGroup.position.set(targetVmX, targetVmY, targetVmZ);
    this.viewmodelGroup.rotation.set(targetRotX, targetRotY, targetRotZ);

    // Muzzle flash fade
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.muzzleFlashLight.intensity = 0;
        this.muzzleFlashGroup.visible = false;
      }
    }
  }

  private resetViewmodelSubParts(vm: BuiltViewmodel) {
    if (vm.magGroup && vm.magRestPos && vm.magRestRot) {
      vm.magGroup.position.copy(vm.magRestPos);
      vm.magGroup.rotation.copy(vm.magRestRot);
    }
    if (vm.leftHandGroup && vm.leftHandRestPos && vm.leftHandRestRot) {
      vm.leftHandGroup.position.copy(vm.leftHandRestPos);
      vm.leftHandGroup.rotation.copy(vm.leftHandRestRot);
    }
    if (vm.rightHandGroup && vm.rightHandRestPos && vm.rightHandRestRot) {
      vm.rightHandGroup.position.copy(vm.rightHandRestPos);
      vm.rightHandGroup.rotation.copy(vm.rightHandRestRot);
    }
  }

  private applyReloadAnimation(vm: BuiltViewmodel, weapon: WeaponStats, t: number) {
    const out = { offsetX: 0, offsetY: 0, offsetZ: 0, rotX: 0, rotY: 0, rotZ: 0 };

    if (weapon.category === 'pistol') {
      // Tactical Pistol Reload: tilt gun -> eject mag -> insert new mag + slap -> rack slide
      const tiltEnv = Math.sin(Math.min(1, t / 0.85) * Math.PI);
      out.offsetX = -0.03 * tiltEnv;
      out.offsetY = -0.035 * tiltEnv;
      out.rotX = 0.24 * tiltEnv;
      out.rotY = 0.2 * tiltEnv;
      out.rotZ = -0.58 * tiltEnv;

      if (t < 0.25) {
        const k = t / 0.25;
        if (vm.magGroup && vm.magRestPos) vm.magGroup.position.y = vm.magRestPos.y - 0.26 * k;
        if (vm.leftHandGroup && vm.leftHandRestPos) {
          vm.leftHandGroup.position.y = vm.leftHandRestPos.y - 0.18 * k;
          vm.leftHandGroup.position.x = vm.leftHandRestPos.x - 0.06 * k;
        }
      } else if (t < 0.58) {
        const k = (t - 0.25) / 0.33;
        if (vm.magGroup && vm.magRestPos) vm.magGroup.position.y = vm.magRestPos.y - 0.26 * (1 - k);
        if (vm.leftHandGroup && vm.leftHandRestPos) {
          vm.leftHandGroup.position.y = vm.leftHandRestPos.y - 0.22 * (1 - k);
          vm.leftHandGroup.position.z = vm.leftHandRestPos.z + 0.02 * (1 - k);
        }
      } else if (t < 0.72) {
        // Firm upward palm tap to seat pistol magazine
        const k = Math.sin(((t - 0.58) / 0.14) * Math.PI);
        out.offsetY += 0.026 * k;
        out.rotX += 0.08 * k;
      } else if (t < 0.92) {
        // Left hand over-hand slide rack
        const k = Math.sin(((t - 0.72) / 0.2) * Math.PI);
        if (vm.slideMesh) vm.slideMesh.position.z = (vm.slideRestZ ?? 0) + 0.048 * k;
        if (vm.leftHandGroup && vm.leftHandRestPos) {
          vm.leftHandGroup.position.y = vm.leftHandRestPos.y + 0.085 * k;
          vm.leftHandGroup.position.z = vm.leftHandRestPos.z - 0.06 + 0.048 * k;
        }
        out.offsetZ += 0.025 * k;
      }
    } else {
      // Heavy Rifle / SMG / AWP Reload: cant weapon -> rock mag out -> rock fresh mag in -> rack charging handle/bolt
      const cantEnv = Math.sin(Math.min(1, t / 0.92) * Math.PI);
      out.offsetX = -0.055 * cantEnv;
      out.offsetY = -0.045 * cantEnv;
      out.rotX = 0.34 * cantEnv;
      out.rotY = 0.42 * cantEnv;
      out.rotZ = -0.45 * cantEnv;

      if (t < 0.28) {
        // Pull empty mag down and rock forward
        const k = t / 0.28;
        if (vm.magGroup && vm.magRestPos && vm.magRestRot) {
          vm.magGroup.position.y = vm.magRestPos.y - 0.28 * k;
          vm.magGroup.position.z = vm.magRestPos.z - 0.04 * k;
          vm.magGroup.rotation.x = vm.magRestRot.x + 0.32 * k;
        }
        if (vm.leftHandGroup && vm.leftHandRestPos) {
          vm.leftHandGroup.position.set(
            vm.leftHandRestPos.x,
            vm.leftHandRestPos.y - 0.22 * k,
            vm.leftHandRestPos.z + 0.16 * k
          );
        }
      } else if (t < 0.64) {
        // Bring fresh magazine up into magwell
        const k = (t - 0.28) / 0.36;
        if (vm.magGroup && vm.magRestPos && vm.magRestRot) {
          vm.magGroup.position.y = vm.magRestPos.y - 0.28 * (1 - k);
          vm.magGroup.rotation.x = vm.magRestRot.x + 0.22 * (1 - k);
        }
        if (vm.leftHandGroup && vm.leftHandRestPos) {
          vm.leftHandGroup.position.set(
            vm.leftHandRestPos.x + 0.02 * (1 - k),
            vm.leftHandRestPos.y - 0.06 - 0.18 * (1 - k),
            vm.leftHandRestPos.z + 0.17
          );
        }
        if (k > 0.85) {
          out.offsetY += 0.018 * Math.sin(((k - 0.85) / 0.15) * Math.PI);
        }
      } else if (t < 0.90) {
        // Left hand reaches to bolt/charging handle and pulls sharply backward
        const k = Math.sin(((t - 0.64) / 0.26) * Math.PI);
        if (vm.slideMesh) vm.slideMesh.position.z = (vm.slideRestZ ?? 0) + 0.068 * k;
        if (vm.leftHandGroup && vm.leftHandRestPos) {
          vm.leftHandGroup.position.set(
            vm.leftHandRestPos.x + 0.04 * k,
            vm.leftHandRestPos.y + 0.055 * k,
            vm.leftHandRestPos.z + 0.14 + 0.068 * k
          );
        }
        out.offsetZ += 0.032 * k;
        out.rotX -= 0.08 * k;
      }
    }

    return out;
  }
}
