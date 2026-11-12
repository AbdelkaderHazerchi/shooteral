import * as THREE from 'three';
import { sound } from '../audio/SoundEffects';
import { buildCharacter, CharacterInstance } from '../character/CharacterBuilder';
import { BoxCollider, getSurfaceHeightAt, RampZone } from '../maps/MapBuilder';
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

  // Mouse aim & Camera
  public pitch: number = 0;
  public yaw: number = 0;
  public mouseSensitivity: number = 0.0022;
  public baseFov: number = 75;

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
  private currentEyeHeight: number = 1.7;
  private landingDip: number = 0;
  private strafeRoll: number = 0;
  private sprintBlend: number = 0;
  private sprintSuppressTimer: number = 0;

  // Dual-Layer Gunplay Dynamics: Climb + Spring Recoil, Sway, Screen Shake & Bloom
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
  private adsBlend: number = 0;
  private sprayBloom: number = 0;

  // Fire timing
  private lastShootTime: number = 0;
  private footstepTimer: number = 0;

  // Suppress 1-5 weapon slot hotkeys when tactical radio menu is open
  public suppressSlotHotkeys: boolean = false;

  // Callbacks
  public onShoot?: (targetPoint: THREE.Vector3, isHeadshot: boolean, muzzleWorldPos?: THREE.Vector3) => void;
  public onThrowGrenade?: (type: 'hegrenade' | 'smokegrenade', origin: THREE.Vector3, velocity: THREE.Vector3) => void;
  public onPlantCompleted?: (site: 'A' | 'B', pos: THREE.Vector3) => void;
  public onDefuseCompleted?: () => void;
  public onStateChange?: (state: PlayerState) => void;

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
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.062), flashMat);
      fin.rotation.z = (i * Math.PI) / 4;
      this.muzzleFlashGroup.add(fin);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), coreMat);
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
      this.shotPatternStep = 0;
      this.updateActiveWeaponModel();
      this.onStateChange?.({ ...this.state });
      return;
    }

    if (!this.state.weapons[slot]) return;
    if (this.state.isPlanting || this.state.isDefusing) return;
    this.state.activeSlot = slot;
    this.state.isScoped = false;
    this.state.isADS = false;
    this.state.isReloading = false;
    this.shotPatternStep = 0;
    this.updateActiveWeaponModel();
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
    this.currentEyeHeight = 1.7;
    this.isMouseDown = false;

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

    this.yaw -= dx;
    this.pitch -= dy;
    this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch));

    // Weapon inertia mouse sway
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.48, -0.03, 0.03);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.48, -0.028, 0.028);
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.isLocked || !this.state.isAlive) return;
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
      return;
    }
    const active = this.getActiveWeapon();
    if (active?.category === 'grenade') {
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

    this.lastShootTime = now;
    this.sprintSuppressTimer = 0.28; // Briefly interrupt sprint for sprint-to-fire transition
    this.shotPatternStep++;

    if (weapon.category !== 'melee' && ammo) {
      ammo.clip--;
    }

    // Play layered gunfire + shell casing clink
    sound.playGunshot(weapon.sound);
    if (weapon.category !== 'melee') {
      sound.playShellClink();
    }

    // Dual-layer Realistic Recoil: Progressive climb + snappy spring punch + rotational roll
    const adsFactor = this.state.isADS ? 0.58 : 1.0;
    const crouchFactor = this.state.isCrouching ? 0.65 : 1.0;
    const moveClimbMult = this.velocity.lengthSq() > 14 ? 1.25 : 1.0;
    const recoilAmount = weapon.recoil * adsFactor * crouchFactor * moveClimbMult;

    // Characteristic spray pattern drift (pulls up, then weaves subtly left/right)
    const patternDir = this.shotPatternStep < 5 ? 0.2 : Math.sin(this.shotPatternStep * 0.72);
    const yawKick = patternDir * recoilAmount * 0.48 + (Math.random() - 0.5) * recoilAmount * 0.28;

    // Subtle real muzzle climb on player aim pitch
    this.pitch = Math.min(Math.PI / 2.1, this.pitch + recoilAmount * 0.34);
    this.yaw -= yawKick * 0.2;

    // Fast spring kick for visceral CoD punch
    this.recoilPitch += recoilAmount * 0.75;
    this.recoilYaw += yawKick;
    this.recoilRoll = (Math.random() - 0.5) * recoilAmount * 1.15;
    this.cameraShake = Math.min(0.038, this.cameraShake + recoilAmount * 0.55);
    this.sprayBloom = Math.min(30, this.sprayBloom + (weapon.category === 'pistol' ? 6.5 : 4.6));

    // Snappy Viewmodel Kickback + Slide/Bolt Blowback
    this.weaponKickZ = weapon.id === 'awp' ? 0.16 : weapon.category === 'melee' ? -0.14 : 0.072;
    this.weaponKickRotX = weapon.id === 'awp' ? 0.19 : weapon.category === 'melee' ? -0.25 : 0.095;
    this.weaponKickRotY = (Math.random() - 0.5) * 0.035;
    this.slideKick = weapon.id === 'awp' ? 0.05 : 0.042;

    // 3D Additive Starburst Muzzle Flash
    if (weapon.category !== 'melee') {
      this.flashTimer = 0.055;
      this.muzzleFlashLight.intensity = weapon.id === 'usp' || weapon.id === 'm4a1' || weapon.id === 'mp5' ? 2.2 : 5.0;
      this.muzzleFlashGroup.visible = true;
      this.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
      const suppressedScale = weapon.id === 'usp' || weapon.id === 'm4a1' || weapon.id === 'mp5' ? 0.45 : 1.0;
      const sc = suppressedScale * (this.state.isADS ? 0.68 : 0.95 + Math.random() * 0.45);
      this.muzzleFlashGroup.scale.setScalar(sc);
    }

    // Raycast bullet with movement & ADS accuracy curve
    const moveFactor = this.velocity.lengthSq() > 14 ? 2.1 : this.velocity.lengthSq() > 3 ? 1.35 : 1.0;
    const spreadMag = weapon.spread * (this.state.isADS ? 0.28 : 1.0) * moveFactor;
    const spreadX = (Math.random() - 0.5) * spreadMag;
    const spreadY = (Math.random() - 0.5) * spreadMag;

    const rayDir = new THREE.Vector3(spreadX, spreadY, -1)
      .applyEuler(new THREE.Euler(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ'))
      .normalize();

    const targetPoint = this.camera.position.clone().addScaledVector(rayDir, 120);
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

    const forward = new THREE.Vector3(0, 0, -1)
      .applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
      .normalize();

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
    this.explosionShake = Math.min(0.45, Math.max(this.explosionShake, amount));
    if (rollKick > 0) {
      this.recoilRoll += (Math.random() < 0.5 ? -1 : 1) * rollKick;
    }
    this.recoilPitch += amount * 0.14;
  }

  public startReload() {
    const weapon = this.getActiveWeapon();
    if (!weapon || weapon.category === 'melee' || weapon.category === 'explosive' || weapon.category === 'grenade') return;
    const ammo = this.state.ammo[weapon.id];
    if (!ammo || ammo.clip >= weapon.magazineSize || ammo.reserve <= 0) return;
    if (this.state.isReloading) return;

    this.state.isReloading = true;
    this.state.reloadProgress = 0;
    this.state.isScoped = false;
    this.state.isADS = false;
    this.shotPatternStep = 0;
    this.updateActiveWeaponModel();
    sound.playReload();
    this.onStateChange?.({ ...this.state });
  }

  public takeDamage(amount: number, isHeadshot = false): boolean {
    if (!this.state.isAlive) return false;

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

    // Physical bullet impact flinch on camera
    this.cameraShake = Math.min(0.055, this.cameraShake + 0.022);
    this.recoilRoll = (Math.random() < 0.5 ? -1 : 1) * 0.045;
    this.recoilPitch += 0.018;

    this.state.health = Math.max(0, Math.round(this.state.health - finalDamage));
    if (this.state.health <= 0) {
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
        const backDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        const targetCamPos = this.position.clone().addScaledVector(backDir, 3.8);
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
      } else {
        this.onStateChange?.({ ...this.state });
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
      } else {
        this.onStateChange?.({ ...this.state });
      }
    } else if (this.state.isDefusing) {
      this.state.isDefusing = false;
      this.state.defuseProgress = 0;
      this.updateActiveWeaponModel();
      this.onStateChange?.({ ...this.state });
    }

    // Handle Reloading
    if (this.state.isReloading && activeWep) {
      this.state.reloadProgress += dt / activeWep.reloadTime;
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
      }
      this.onStateChange?.({ ...this.state });
    }

    // Crouch handling & smooth eye height transition
    this.state.isCrouching = !!(this.keys['KeyC'] || this.keys['ControlLeft']);
    const targetEyeY = this.state.isCrouching ? 1.06 : 1.7;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEyeY, 14, dt);

    // Directional Input
    const moveDir = new THREE.Vector3();
    let strafeInput = 0;
    if (this.keys['KeyW']) moveDir.z -= 1;
    if (this.keys['KeyS']) moveDir.z += 1;
    if (this.keys['KeyA']) {
      moveDir.x -= 1;
      strafeInput -= 1;
    }
    if (this.keys['KeyD']) {
      moveDir.x += 1;
      strafeInput += 1;
    }

    // Hold Shift to Sprint (cancelled if crouching, ADS/scoped, reloading, planting/defusing, or actively shooting)
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

    // Smooth Speed Selection: Tactical Walk (4.8) vs Hold-Shift Sprint (7.8) vs Crouch (3.1)
    let baseSpeed = 4.8;
    if (canSprint) baseSpeed = 7.8;
    if (this.state.isCrouching) baseSpeed = 3.1;
    if (this.state.isADS) baseSpeed = Math.min(baseSpeed, 3.6);
    if (this.state.isScoped) baseSpeed = 2.6;
    if (this.state.isPlanting || this.state.isDefusing) baseSpeed = 0.5;

    const isMoving = moveDir.lengthSq() > 0;
    if (isMoving) {
      moveDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, moveDir.x * baseSpeed, 14, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, moveDir.z * baseSpeed, 14, dt);
    } else {
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, 16, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, 16, dt);
    }

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizSpeed > 0.6 && this.isGrounded) {
      // Footstep cadence: crisp brisk steps when sprinting, quieter slower steps when walking/crouching
      const stepInterval = this.state.isSprinting ? 0.27 : this.state.isCrouching ? 0.58 : 0.43;
      this.footstepTimer += dt;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer = 0;
        if (this.state.isSprinting || !this.state.isCrouching) {
          sound.playFootstep();
        }
      }
      // Stride camera head-bob clock synced to speed
      this.bobTimer += dt * (this.state.isSprinting ? 14.5 : this.state.isCrouching ? 6.2 : 9.4);
    } else {
      // Subtle idle breathing phase
      this.bobTimer += dt * 1.8;
    }

    // Jump & Gravity
    if (this.keys['Space'] && this.isGrounded && !this.state.isCrouching) {
      this.velocity.y = 5.4;
      this.isGrounded = false;
    }
    this.velocity.y -= 16.5 * dt;

    // Proposed horizontal + vertical move
    const nextPos = this.position.clone().addScaledVector(this.velocity, dt);
    const playerRadius = 0.44;
    const stepUpLimit = 0.55;

    // Resolve wall / crate collisions
    for (const c of colliders) {
      if (
        nextPos.x + playerRadius > c.min.x &&
        nextPos.x - playerRadius < c.max.x &&
        nextPos.z + playerRadius > c.min.z &&
        nextPos.z - playerRadius < c.max.z &&
        nextPos.y + stepUpLimit < c.max.y &&
        nextPos.y + this.currentEyeHeight > c.min.y
      ) {
        const overlapX1 = nextPos.x + playerRadius - c.min.x;
        const overlapX2 = c.max.x - (nextPos.x - playerRadius);
        const overlapZ1 = nextPos.z + playerRadius - c.min.z;
        const overlapZ2 = c.max.z - (nextPos.z - playerRadius);

        const minOverlapX = Math.min(overlapX1, overlapX2);
        const minOverlapZ = Math.min(overlapZ1, overlapZ2);

        if (minOverlapX < minOverlapZ) {
          if (overlapX1 < overlapX2) nextPos.x = c.min.x - playerRadius;
          else nextPos.x = c.max.x + playerRadius;
          this.velocity.x = 0;
        } else {
          if (overlapZ1 < overlapZ2) nextPos.z = c.min.z - playerRadius;
          else nextPos.z = c.max.z + playerRadius;
          this.velocity.z = 0;
        }
      }
    }

    // Ramps & Elevated CS2 Platforms
    this.wasGrounded = this.isGrounded;
    const floorHeight = getSurfaceHeightAt(nextPos.x, nextPos.z, this.position.y, colliders, ramps, playerRadius);
    if (nextPos.y <= floorHeight) {
      if (!this.wasGrounded && this.velocity.y < -3.0) {
        this.landingDip = Math.min(0.14, Math.abs(this.velocity.y) * 0.015);
      }
      nextPos.y = floorHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (nextPos.y > floorHeight + 0.15) {
      this.isGrounded = false;
    }

    this.position.copy(nextPos);

    // ==============================================
    // REALISTIC WALK / SPRINT CAMERA HEAD-BOB & TILT
    // ==============================================
    const moveRatio = Math.min(1, horizSpeed / 4.8);
    const sprintFactor = this.state.isSprinting ? 1.0 : 0.0;
    const adsDamp = 1 - this.adsBlend * 0.78;
    const bobIntensity = this.isGrounded ? moveRatio * (this.state.isSprinting ? 1.0 : 0.48) * adsDamp : 0.0;

    // Realistic figure-8 stride wave: vertical step bounce (2x frequency) + gentle horizontal shoulder sway + roll tilt
    const camBobY = Math.sin(this.bobTimer * 2) * 0.055 * bobIntensity;
    const camBobX = Math.cos(this.bobTimer) * 0.032 * bobIntensity;
    const camBobRoll = Math.sin(this.bobTimer) * (this.state.isSprinting ? 0.018 : 0.007) * bobIntensity;

    // Subtle lateral strafe camera roll + landing shock dip
    this.strafeRoll = THREE.MathUtils.damp(this.strafeRoll, -strafeInput * 0.022, 10, dt);
    this.landingDip = THREE.MathUtils.damp(this.landingDip, 0, 14, dt);

    // Subtle directional forward/side offset for realistic head position
    const rightVec = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
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
      this.pitch + this.recoilPitch - this.landingDip * 0.28,
      this.yaw + this.recoilYaw,
      this.strafeRoll + camBobRoll + this.recoilRoll
    );

    // Dynamic FOV: Sprinting widens (84°), ADS zooms (56°), AWP Scope zooms (20°)
    const targetFov = this.state.isScoped
      ? 20
      : this.state.isADS
        ? 56
        : this.state.isSprinting && horizSpeed > 5.0
          ? 84
          : this.baseFov;

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    // Recover spring recoil, bloom & sway smoothly
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 12, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 12, dt);
    this.recoilRoll = THREE.MathUtils.damp(this.recoilRoll, 0, 14, dt);
    this.sprayBloom = THREE.MathUtils.damp(this.sprayBloom, 0, 9, dt);
    this.swayX = THREE.MathUtils.damp(this.swayX, 0, 12, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, 0, 12, dt);

    // Update dynamic crosshair spread for HUD
    const speedBloom = Math.min(22, horizSpeed * 2.1);
    const crouchTight = this.state.isCrouching ? 0.6 : 1.0;
    this.state.crosshairSpread = Math.round((4 + speedBloom + this.sprayBloom) * crouchTight);

    // Weapon Viewmodel Kinematics: Hip vs ADS vs Tactical Sprint vs Reload vs Plant/Defuse
    this.adsBlend = THREE.MathUtils.damp(this.adsBlend, this.state.isADS ? 1 : 0, 18, dt);
    this.sprintBlend = THREE.MathUtils.damp(
      this.sprintBlend,
      this.state.isSprinting && horizSpeed > 4.5 ? sprintFactor : 0,
      11,
      dt
    );
    this.weaponKickZ = THREE.MathUtils.damp(this.weaponKickZ, 0, 18, dt);
    this.weaponKickRotX = THREE.MathUtils.damp(this.weaponKickRotX, 0, 16, dt);
    this.weaponKickRotY = THREE.MathUtils.damp(this.weaponKickRotY, 0, 16, dt);
    this.slideKick = THREE.MathUtils.damp(this.slideKick, 0, 26, dt);

    const activeVM = activeWep ? this.viewmodels.get(activeWep.id) : undefined;
    if (activeVM) {
      this.resetViewmodelSubParts(activeVM);
      if (activeVM.slideMesh) {
        activeVM.slideMesh.position.z = (activeVM.slideRestZ ?? 0) + this.slideKick;
      }
    }

    const vmBobAmp = (1 - this.adsBlend * 0.85) * (horizSpeed > 0.6 ? 0.4 + this.sprintBlend * 0.85 : 0.12);
    const vmBobX = Math.sin(this.bobTimer) * 0.015 * vmBobAmp;
    const vmBobY = Math.abs(Math.cos(this.bobTimer)) * 0.018 * vmBobAmp;

    // Improved natural ergonomic hip stance (subtle inward cant for clear silhouette & grip)
    const hipX = 0.195;
    const hipY = -0.185;
    const hipZ = -0.375;
    const hipRotY = 0.045;
    const hipRotZ = -0.025;

    const isPistol = activeWep?.category === 'pistol';
    const adsX = 0.0;
    const adsY = isPistol ? -0.152 : -0.194;
    const adsZ = isPistol ? -0.33 : -0.295;

    // Diagonal tactical sprint carry
    const sprintOffsetX = -0.065 * this.sprintBlend;
    const sprintOffsetY = -0.04 * this.sprintBlend;
    const sprintOffsetZ = 0.025 * this.sprintBlend;
    const sprintRotX = -0.18 * this.sprintBlend;
    const sprintRotY = 0.52 * this.sprintBlend;
    const sprintRotZ = 0.22 * this.sprintBlend;

    let targetVmX =
      THREE.MathUtils.lerp(hipX, adsX, this.adsBlend) +
      sprintOffsetX +
      vmBobX +
      this.swayX * (1 - this.adsBlend * 0.6);
    let targetVmY =
      THREE.MathUtils.lerp(hipY, adsY, this.adsBlend) +
      sprintOffsetY -
      vmBobY -
      this.landingDip * 0.35 +
      this.swayY * (1 - this.adsBlend * 0.6);
    let targetVmZ = THREE.MathUtils.lerp(hipZ, adsZ, this.adsBlend) + sprintOffsetZ + this.weaponKickZ;

    let targetRotX = this.weaponKickRotX + sprintRotX;
    let targetRotY = THREE.MathUtils.lerp(hipRotY, 0, this.adsBlend) + this.weaponKickRotY + sprintRotY;
    let targetRotZ = THREE.MathUtils.lerp(hipRotZ, 0, this.adsBlend) + sprintRotZ;

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
