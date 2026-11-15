import * as THREE from 'three';
import { GunshotSoundId, sound } from '../audio/SoundEffects';
import { buildCharacter, CharacterInstance } from '../character/CharacterBuilder';
import { BoxCollider, getSurfaceHeightAt, NavNode, RampZone } from '../maps/MapBuilder';
import { WEAPONS, WeaponStats } from '../weapons/WeaponData';
import { BotTraitProfile, createTraitProfile } from './BotTraits';
import { SniperPerch, TacticalMapProfile, TacticalZone } from './MapTacticalAnalyzer';
import { isCapsulePositionWalkable, isWalkSegmentClear } from './NavGrid';
import { NemesisCounterAdvice } from './PersistentNemesisAI';

export type BotRole = 'carrier' | 'defender' | 'attacker' | 'sniper';

export interface BotState {
  id: string;
  name: string;
  team: 'gang' | 'swat';
  health: number;
  armor: number;
  hasHelmet: boolean;
  hasC4: boolean;
  hasDefuser: boolean;
  isAlive: boolean;
  isPlanting: boolean;
  plantProgress: number;
  isDefusing: boolean;
  defuseProgress: number;
  isReloading: boolean;
  kills: number;
  deaths: number;
  score: number;
  weapon: WeaponStats;
  currentAmmo: number;
  role: BotRole;
}

export interface PlayerVisionInfo {
  pos: THREE.Vector3;
  yaw?: number;
  team: 'gang' | 'swat';
  isAlive: boolean;
  isRunning?: boolean;
  isCrouching?: boolean;
  health?: number;
  hasC4?: boolean;
  isPlanting?: boolean;
  isDefusing?: boolean;
}

export interface SmokeVolume {
  center: THREE.Vector3;
  radius: number;
}

export interface IncomingGrenadeThreat {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  type: 'hegrenade' | 'smokegrenade';
  ownerTeam: 'gang' | 'swat';
}

export interface BotSelfLearning {
  earlyDeaths: number;
  openReloadDeaths: number;
  grenadeDeaths: number;
  sniperLaneDeaths: number;
  lateRotations: number;
  zoneDeaths: Record<TacticalZone, number>;
  avoidZone: TacticalZone | null;
  cautionBias: number;          // 0..0.4
  coverReloadUrgency: number;   // 0..1
  grenadeDodgeUrgency: number;  // 0..1
  rotationUrgency: number;      // 0..0.35
}

export interface TeamOrdersContext {
  targetObjective: 'site_a' | 'site_b';
  escortTargetId: string | null;       // 'player' or bot.id of C4 carrier
  assignedPatrolNodeId: string | null; // distraction / flank / gather node
  assignedSniperPerch: SniperPerch | null;
  priorityTargetPos: THREE.Vector3 | null; // spotted C4 carrier / enemy cluster / ally needing backup
  priorityTargetReason: 'carrier' | 'cluster' | 'backup' | null;
  nemesisAdvice: NemesisCounterAdvice | null;
}

export type RadioOrderType =
  | 'fall_back'
  | 'defend_me'
  | 'follow_me'
  | 'hold_here'
  | 'enemy_spotted'
  | 'need_backup'
  | 'sector_clear'
  | 'go_a'
  | 'go_b';

export function createInitialSelfLearning(): BotSelfLearning {
  return {
    earlyDeaths: 0,
    openReloadDeaths: 0,
    grenadeDeaths: 0,
    sniperLaneDeaths: 0,
    lateRotations: 0,
    zoneDeaths: { site_a: 0, mid: 0, site_b: 0 },
    avoidZone: null,
    cautionBias: 0,
    coverReloadUrgency: 0.35,
    grenadeDodgeUrgency: 0.5,
    rotationUrgency: 0
  };
}

export class BotController {
  public id: string;
  public name: string;
  public team: 'gang' | 'swat';
  public char: CharacterInstance;
  public state: BotState;
  public traits: BotTraitProfile;
  public selfLearning: BotSelfLearning = createInitialSelfLearning();

  public position: THREE.Vector3 = new THREE.Vector3();
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public currentWaypointIndex: number = 0;
  public currentPath: THREE.Vector3[] = [];
  public currentPathNodeIds: string[] = [];

  // Vertical Weapon Aim Pitch (for multi-level elevation fights)
  public pitch: number = 0;

  // Weapons (Primary + Secondary sidearm fallback)
  private primaryWeapon: WeaponStats;
  private primaryAmmo: number = 0;
  private secondaryWeapon: WeaponStats;
  private secondaryAmmo: number = 0;
  private usingSecondary: boolean = false;

  // Tactical CS State & Commander Directives
  public targetObjective: 'site_a' | 'site_b' = 'site_a';
  public assignedPatrolNodeId: string | null = null;
  public assignedSniperPerch: SniperPerch | null = null;
  public escortTargetId: string | null = null;
  public priorityTargetPos: THREE.Vector3 | null = null;
  public priorityTargetReason: 'carrier' | 'cluster' | 'backup' | null = null;
  public nemesisAdvice: NemesisCounterAdvice | null = null;

  public lastSpottedTime: number = 0;
  public targetEnemy: {
    pos: THREE.Vector3;
    isPlayer: boolean;
    id: string;
    dist: number;
    isCrouching?: boolean;
    hasC4?: boolean;
  } | null = null;
  public lastKnownEnemyPos: THREE.Vector3 | null = null;
  public isUnderFire: boolean = false;
  private underFireTimer: number = 0;

  // Round telemetry for individual self-learning
  public roundAliveSeconds: number = 0;
  public roundKills: number = 0;
  public diedWhileReloading: boolean = false;
  public lastDamageWasHE: boolean = false;
  public lastDamageDist: number = 0;

  // Environmental & Ally Awareness
  public visibleAlliesCount: number = 0;
  public nearbyAllyNeedsHelpPos: THREE.Vector3 | null = null;
  private lookScanPhase: number = Math.random() * Math.PI * 2;

  private thinkTimer: number = 0;
  private shootTimer: number = 0;
  private burstCount: number = 0;
  private maxBurst: number = 3;
  private burstPauseTimer: number = 0;
  private postPlantTargetNodeId: string | null = null;

  // Human Skill, Aim Error & Ballistic Spread Profile
  public difficultyLevel: number = 1;
  private aimTalentOffset: number = (Math.random() - 0.5) * 0.08;
  private aimSkill: number = 0.62;
  private aimSwayPhase: number = Math.random() * Math.PI * 2;
  private reactionDelayTimer: number = 0;
  private reactionTimeThreshold: number = 0.34;
  private aimTrackingError: THREE.Vector2 = new THREE.Vector2();

  // Squad Teamwork & Coordination
  private squadLaneOffset: number = 0;
  private tacticalHoldTimer: number = 0;
  private guardFacingAngle: number | null = null;
  private activeCoverPos: THREE.Vector3 | null = null;
  private coverSearchCooldown: number = 0;
  private grenadeDodgeDir: THREE.Vector3 = new THREE.Vector3();
  private grenadeDodgeTimer: number = 0;

  // Sound & Radio Callout Awareness
  public suspiciousPos: THREE.Vector3 | null = null;
  public suspicionTimer: number = 0;

  // Stuck Detection & Obstacle Avoidance
  private activeMapProfile?: TacticalMapProfile;
  private lastStuckCheckPos: THREE.Vector3 = new THREE.Vector3();
  private stuckTimer: number = 0;
  private wallBlockedTimer: number = 0;
  private replanCooldown: number = 0;
  private preferredAvoidSide: number = Math.random() < 0.5 ? 1 : -1;
  private avoidanceSteer: THREE.Vector3 = new THREE.Vector3();
  private avoidanceTimer: number = 0;
  private currentPathTargetPos: THREE.Vector3 = new THREE.Vector3();
  private coverMoveTimer: number = 0;

  // Counter-strafing, procedural hit-flinch, combat lean & tactical crouch
  private strafeTimer: number = 0;
  private strafeDir: number = 1;
  private isCrouchingCombat: boolean = false;
  private reloadTimer: number = 0;
  private radioCooldown: number = 0;
  private backupCallCooldown: number = 0;
  private flinchPitch: number = 0;
  private flinchRoll: number = 0;
  private combatLeanRoll: number = 0;
  private recoilKickPitch: number = 0;
  private deathAnimTimer: number = 0;
  private lastPlantSoundStep: number = -1;
  private lastDefuseSoundStep: number = -1;

  // Reusable scratch math objects (zero per-frame GC allocations)
  private readonly _upAxis = new THREE.Vector3(0, 1, 0);
  private readonly _tmpVec1 = new THREE.Vector3();
  private readonly _tmpVec2 = new THREE.Vector3();
  private readonly _tmpVec3 = new THREE.Vector3();
  private readonly _tmpVec4 = new THREE.Vector3();
  private readonly _tmpVec5 = new THREE.Vector3();
  private readonly _tmpSep = new THREE.Vector3();
  private readonly _tmpStrafeDir = new THREE.Vector3();
  private readonly _avoidZoneVec = new THREE.Vector3();
  private readonly _probeSteer = new THREE.Vector3();
  private readonly _losFrom = new THREE.Vector3();
  private readonly _losTo = new THREE.Vector3();
  private readonly _losDiff = new THREE.Vector3();
  private readonly _losDir = new THREE.Vector3();
  private readonly _losRay = new THREE.Ray();
  private readonly _losBox = new THREE.Box3();
  private readonly _losHit = new THREE.Vector3();
  private readonly _losToSmoke = new THREE.Vector3();
  private readonly _losClosest = new THREE.Vector3();
  private readonly _zeroVec = new THREE.Vector3();

  // Tactical Utility (HE & Smoke Grenades) & Player Squad Radio Orders
  public hasHEGrenade: boolean = false;
  public hasSmokeGrenade: boolean = false;
  private grenadeCooldown: number = 4.0;
  private followPlayerTimer: number = 0;
  private manualHoldTimer: number = 0;
  private manualHoldAngle: number | null = null;
  private retreatTimer: number = 0;

  // Callbacks
  public onShoot?: (aimPoint: THREE.Vector3, isHeadshotIntent: boolean, targetId?: string) => void;
  public onThrowGrenade?: (
    bot: BotController,
    type: 'hegrenade' | 'smokegrenade',
    origin: THREE.Vector3,
    velocity: THREE.Vector3
  ) => void;
  public onPlantCompleted?: (site: 'A' | 'B', pos: THREE.Vector3) => void;
  public onDefuseCompleted?: () => void;
  public onDeath?: (bot: BotController, attackerPos?: THREE.Vector3) => void;
  public onEnemySpotted?: (bot: BotController, enemyPos: THREE.Vector3, hasC4: boolean) => void;
  public onNeedBackup?: (bot: BotController, pos: THREE.Vector3) => void;

  constructor(
    id: string,
    name: string,
    team: 'gang' | 'swat',
    scene: THREE.Scene,
    role: BotRole = 'attacker',
    traits?: BotTraitProfile
  ) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.traits = traits ?? createTraitProfile(role === 'sniper' ? 'sharpshooter' : 'rusher');
    this.aimSkill = THREE.MathUtils.clamp(this.traits.rifleSkill + this.aimTalentOffset, 0.42, 0.95);
    this.squadLaneOffset = (Math.random() - 0.5) * 1.4;

    this.char = buildCharacter(team, name);
    scene.add(this.char.group);

    const defaultWp = team === 'gang' ? WEAPONS.glock : WEAPONS.usp;
    this.primaryWeapon = { ...defaultWp };
    this.secondaryWeapon = { ...defaultWp };
    this.primaryAmmo = defaultWp.magazineSize;
    this.secondaryAmmo = defaultWp.magazineSize;

    this.state = {
      id,
      name,
      team,
      health: 100,
      armor: 50,
      hasHelmet: false,
      hasC4: false,
      hasDefuser: team === 'swat',
      isAlive: true,
      isPlanting: false,
      plantProgress: 0,
      isDefusing: false,
      defuseProgress: 0,
      isReloading: false,
      kills: 0,
      deaths: 0,
      score: 0,
      weapon: { ...defaultWp },
      currentAmmo: defaultWp.magazineSize,
      role
    };
    this.char.setEquippedWeapon(defaultWp.id, team);
  }

  public equipRoundWeapon(roundNum: number, role: BotRole, difficultyLevel: number = 1) {
    const factionPistol = this.team === 'gang' ? WEAPONS.glock : WEAPONS.usp;
    const factionRifle = this.team === 'gang' ? WEAPONS.ak47 : WEAPONS.m4a1;
    const roll = Math.random();

    // Always equip a reliable sidearm backup
    const useDeagleBackup =
      (roundNum >= 2 && (role === 'sniper' || this.traits.archetype === 'lurker') && roll < 0.48) ||
      (roundNum === 1 && (role === 'sniper' || this.traits.sniperSkill > 0.78) && roll < 0.55);
    this.secondaryWeapon = { ...(useDeagleBackup ? WEAPONS.deagle : factionPistol) };
    this.secondaryAmmo = this.secondaryWeapon.magazineSize;

    let wp: WeaponStats;
    if (roundNum === 1) {
      // Pistol round: snipers/lurkers favor Deagle for crisp precision
      wp = { ...this.secondaryWeapon };
      this.state.armor = difficultyLevel >= 4 ? 70 : 50;
      this.state.hasHelmet = false;
    } else if (roundNum === 2) {
      if (role === 'sniper' && difficultyLevel >= 3 && roll < 0.42) {
        wp = WEAPONS.awp;
      } else if (difficultyLevel >= 4 && role !== 'sniper' && roll < 0.4) {
        wp = factionRifle;
      } else if (role === 'sniper') {
        wp = WEAPONS.deagle;
      } else if (roll < 0.72) {
        wp = WEAPONS.mp5;
      } else {
        wp = WEAPONS.deagle;
      }
      this.state.armor = difficultyLevel >= 3 ? 100 : 80;
      this.state.hasHelmet = difficultyLevel >= 4;
    } else {
      if (role === 'sniper') {
        wp = WEAPONS.awp;
      } else if (role === 'attacker') {
        if (this.traits.archetype === 'rusher' && roll < 0.25) wp = WEAPONS.mp5;
        else wp = factionRifle;
      } else {
        // Carrier / Defender prefer reliable rifles
        wp = roll < 0.14 ? WEAPONS.mp5 : factionRifle;
      }
      this.state.armor = 100;
      this.state.hasHelmet = true;
    }

    this.primaryWeapon = { ...wp };
    this.primaryAmmo = wp.magazineSize;
    this.usingSecondary = wp.id === this.secondaryWeapon.id;

    this.state.weapon = { ...wp };
    this.state.currentAmmo = wp.magazineSize;
    this.char.setEquippedWeapon(wp.id, this.team);

    // Tactical grenade allocation grounded in role & utilityIQ
    if (roundNum === 1) {
      this.hasHEGrenade = false;
      this.hasSmokeGrenade = (role === 'defender' || role === 'carrier') && Math.random() < 0.45;
    } else {
      const iqBonus = this.traits.utilityIQ > 0.75 ? 0.18 : 0;
      this.hasHEGrenade = Math.random() < (difficultyLevel >= 3 ? 0.74 : 0.56) + iqBonus;
      this.hasSmokeGrenade = Math.random() < (difficultyLevel >= 2 ? 0.76 : 0.54) + iqBonus;
    }
  }

  private switchWeapon(toSecondary: boolean) {
    if (this.usingSecondary === toSecondary) return;
    if (this.usingSecondary) {
      this.secondaryAmmo = this.state.currentAmmo;
    } else {
      this.primaryAmmo = this.state.currentAmmo;
    }
    this.usingSecondary = toSecondary;
    const targetWp = toSecondary ? this.secondaryWeapon : this.primaryWeapon;
    this.state.weapon = { ...targetWp };
    this.state.currentAmmo = toSecondary ? this.secondaryAmmo : this.primaryAmmo;
    this.state.isReloading = false;
    this.reloadTimer = 0;
    this.burstCount = 0;
    this.burstPauseTimer = 0;
    this.char.setEquippedWeapon(targetWp.id, this.team);
  }

  private computeEffectiveAimSkill(): number {
    const weaponSkill =
      this.state.weapon.id === 'awp' || this.state.weapon.id === 'deagle'
        ? this.traits.sniperSkill
        : this.traits.rifleSkill;
    const diffBoost = (this.difficultyLevel - 1) * 0.028;
    return THREE.MathUtils.clamp(weaponSkill + diffBoost + this.aimTalentOffset * 0.5, 0.42, 0.96);
  }

  public resetRound(
    spawnPos: THREE.Vector3,
    hasC4 = false,
    objective: 'site_a' | 'site_b' = 'site_a',
    role: BotRole = 'attacker',
    roundNum = 1,
    difficultyLevel = 1,
    orders?: Partial<TeamOrdersContext>
  ) {
    this.difficultyLevel = Math.max(1, difficultyLevel);
    const diffStep = this.difficultyLevel - 1;

    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.pitch = 0;
    this.char.group.position.copy(this.position);
    this.char.group.visible = true;
    this.char.group.rotation.y = this.team === 'gang' ? Math.PI : 0;
    this.resetBonesPitch();

    this.state.health = 100;
    this.state.isAlive = true;
    this.state.hasC4 = hasC4;
    this.state.isPlanting = false;
    this.state.plantProgress = 0;
    this.state.isDefusing = false;
    this.state.defuseProgress = 0;
    this.state.isReloading = false;
    this.state.role = role;
    this.equipRoundWeapon(roundNum, role, this.difficultyLevel);
    this.aimSkill = this.computeEffectiveAimSkill();

    this.targetObjective = orders?.targetObjective ?? objective;
    this.escortTargetId = orders?.escortTargetId ?? null;
    this.assignedPatrolNodeId = orders?.assignedPatrolNodeId ?? null;
    this.assignedSniperPerch = orders?.assignedSniperPerch ?? null;
    this.priorityTargetPos = orders?.priorityTargetPos ? orders.priorityTargetPos.clone() : null;
    this.priorityTargetReason = orders?.priorityTargetReason ?? null;
    this.nemesisAdvice = orders?.nemesisAdvice ?? null;

    this.currentPath = [];
    this.currentPathNodeIds = [];
    this.currentWaypointIndex = 0;
    this.targetEnemy = null;
    this.lastKnownEnemyPos = null;
    this.suspiciousPos = null;
    this.suspicionTimer = 0;
    this.postPlantTargetNodeId = null;
    this.tacticalHoldTimer = 0;
    this.guardFacingAngle = null;
    this.activeCoverPos = null;
    this.coverSearchCooldown = 0;
    this.grenadeDodgeTimer = 0;
    this.grenadeCooldown = 2.8 + Math.random() * 3.8;
    this.followPlayerTimer = 0;
    this.manualHoldTimer = 0;
    this.manualHoldAngle = null;
    this.retreatTimer = 0;
    this.isUnderFire = false;
    this.underFireTimer = 0;
    this.visibleAlliesCount = 0;
    this.nearbyAllyNeedsHelpPos = null;

    this.roundAliveSeconds = 0;
    this.roundKills = 0;
    this.diedWhileReloading = false;
    this.lastDamageWasHE = false;
    this.lastDamageDist = 0;

    this.reactionDelayTimer = 0;
    this.reactionTimeThreshold =
      Math.max(
        0.13,
        0.39 - diffStep * 0.024 + this.traits.reactionBonus - this.selfLearning.cautionBias * 0.12
      ) +
      Math.random() * 0.07;

    this.burstCount = 0;
    this.burstPauseTimer = 0;
    this.strafeTimer = 0;
    this.isCrouchingCombat = false;
    this.stuckTimer = 0;
    this.wallBlockedTimer = 0;
    this.replanCooldown = 0;
    this.avoidanceTimer = 0;
    this.coverMoveTimer = 0;
    this.currentPathTargetPos.set(0, 0, 0);
    this.radioCooldown = 0;
    this.backupCallCooldown = 0;
    this.lastSpottedTime = 0;
    this.flinchPitch = 0;
    this.flinchRoll = 0;
    this.combatLeanRoll = 0;
    this.recoilKickPitch = 0;
    this.lastStuckCheckPos.copy(this.position);
    this.deathAnimTimer = 0;
    this.lastPlantSoundStep = -1;
    this.lastDefuseSoundStep = -1;

    this.char.playAnimation('idle');
  }

  public applyTeamOrders(orders: Partial<TeamOrdersContext>) {
    if (!this.state.isAlive) return;
    if (orders.targetObjective && orders.targetObjective !== this.targetObjective) {
      this.targetObjective = orders.targetObjective;
      if (this.state.role === 'carrier' || this.state.role === 'defender') {
        this.currentPath = [];
      }
    }
    if (orders.escortTargetId !== undefined) this.escortTargetId = orders.escortTargetId;
    if (orders.assignedPatrolNodeId !== undefined) this.assignedPatrolNodeId = orders.assignedPatrolNodeId;
    if (orders.assignedSniperPerch !== undefined) this.assignedSniperPerch = orders.assignedSniperPerch;
    if (orders.priorityTargetPos !== undefined) {
      this.priorityTargetPos = orders.priorityTargetPos ? orders.priorityTargetPos.clone() : null;
      this.priorityTargetReason = orders.priorityTargetReason ?? null;
    }
    if (orders.nemesisAdvice !== undefined) this.nemesisAdvice = orders.nemesisAdvice;
  }

  private resetBonesPitch() {
    if (this.char.by['chest']) {
      this.char.by['chest'].rotation.x = this.flinchPitch * 0.55;
      this.char.by['chest'].rotation.z = this.flinchRoll * 0.55 + this.combatLeanRoll;
    }
    if (this.char.by['weapon']) this.char.by['weapon'].rotation.x = this.recoilKickPitch;
    if (this.char.by['head']) {
      this.char.by['head'].rotation.x = this.flinchPitch * 0.85;
      this.char.by['head'].rotation.z = this.flinchRoll * 0.75;
    }
  }

  public takeDamage(
    amount: number,
    isHeadshot = false,
    attackerPos?: THREE.Vector3,
    isFromGrenade = false
  ): boolean {
    if (!this.state.isAlive) return false;

    let finalDamage = amount;
    if (isHeadshot) {
      if (this.state.hasHelmet) {
        finalDamage = amount * 0.65;
        this.state.armor = Math.max(0, this.state.armor - 25);
      }
    } else {
      if (this.state.armor > 0) {
        finalDamage = amount * 0.55;
        this.state.armor = Math.max(0, this.state.armor - Math.round(amount * 0.4));
      }
    }

    this.state.health = Math.max(0, Math.round(this.state.health - finalDamage));
    this.thinkTimer = 0.5;
    this.isUnderFire = true;
    this.underFireTimer = 3.2;
    this.lastDamageWasHE = isFromGrenade;
    if (attackerPos) {
      this.lastDamageDist = this.position.distanceTo(attackerPos);
      this.suspiciousPos = attackerPos.clone();
      this.suspicionTimer = 5.5;
      this.reactionDelayTimer = Math.max(this.reactionDelayTimer, 0.14);
      this.aimTrackingError.set((Math.random() - 0.5) * 0.24, (Math.random() - 0.5) * 0.12);
      this.state.isPlanting = false;
      this.state.isDefusing = false;
    }

    if (this.state.health < 45) {
      this.isCrouchingCombat = true;
      if (this.backupCallCooldown <= 0 && attackerPos) {
        this.backupCallCooldown = 7.0;
        this.onNeedBackup?.(this, attackerPos.clone());
      }
    }

    this.flinchPitch = Math.max(-0.48, this.flinchPitch - (isHeadshot ? 0.34 : 0.18));
    this.flinchRoll = THREE.MathUtils.clamp(
      this.flinchRoll + (Math.random() < 0.5 ? -1 : 1) * (isHeadshot ? 0.28 : 0.15),
      -0.36,
      0.36
    );

    if (this.state.health <= 0) {
      this.diedWhileReloading = this.state.isReloading;
      this.state.isAlive = false;
      this.state.deaths++;
      this.state.isPlanting = false;
      this.state.isDefusing = false;
      this.flinchPitch = 0;
      this.flinchRoll = 0;
      this.combatLeanRoll = 0;
      this.recoilKickPitch = 0;
      this.resetBonesPitch();
      this.char.playAnimation('death', 0.1);
      this.onDeath?.(this, attackerPos);
    }
    return !this.state.isAlive;
  }

  public alertToGunfire(pos: THREE.Vector3) {
    if (!this.state.isAlive) return;
    const dist = this.position.distanceTo(pos);
    if (dist < 38) {
      this.suspiciousPos = pos.clone();
      this.suspicionTimer = 4.5;
    }
  }

  public receiveRadioCallout(enemyPos: THREE.Vector3, siteHint?: 'site_a' | 'site_b', isUrgentTrade = false) {
    if (!this.state.isAlive) return;
    this.suspiciousPos = enemyPos.clone();
    this.suspicionTimer = isUrgentTrade ? 6.2 : 4.8;
    this.lastKnownEnemyPos = enemyPos.clone();
    if (siteHint && this.team === 'swat' && this.state.role === 'attacker' && !this.targetEnemy) {
      this.targetObjective = siteHint;
      this.currentPath = [];
    }
  }

  public notifyAllyDown(deadAllyPos: THREE.Vector3) {
    if (!this.state.isAlive) return;
    if (this.position.distanceTo(deadAllyPos) < 34) {
      this.suspiciousPos = deadAllyPos.clone();
      this.suspicionTimer = 5.8;
      this.tacticalHoldTimer = 0;
      if (!this.targetEnemy && this.state.role === 'attacker') {
        this.priorityTargetPos = deadAllyPos.clone();
        this.priorityTargetReason = 'backup';
      }
    }
  }

  public alertDefuseInProgress(bombPos: THREE.Vector3) {
    if (!this.state.isAlive || this.team !== 'gang') return;
    this.suspiciousPos = bombPos.clone();
    this.suspicionTimer = 6.5;
    this.postPlantTargetNodeId = null;
    this.manualHoldTimer = 0;
    this.priorityTargetPos = bombPos.clone();
    this.priorityTargetReason = 'backup';
    // Force immediate A* replan around walls instead of blind straight-line sprint
    this.currentPath = [];
    this.currentPathNodeIds = [];
    this.currentWaypointIndex = 0;
    this.thinkTimer = 1.0;
  }

  public applyPlayerOrder(
    order: RadioOrderType,
    playerPos: THREE.Vector3,
    playerLookDir: THREE.Vector3,
    aimPos: THREE.Vector3,
    navNodes: Record<string, NavNode>,
    colliders: BoxCollider[],
    assignFollowSlot: boolean = true,
    mapProfile?: TacticalMapProfile
  ) {
    if (!this.state.isAlive) return;
    if (mapProfile) this.activeMapProfile = mapProfile;
    const profile = mapProfile ?? this.activeMapProfile;
    const distToPlayer = this.position.distanceTo(playerPos);

    switch (order) {
      case 'fall_back': {
        this.manualHoldTimer = 0;
        this.followPlayerTimer = 0;
        this.retreatTimer = 7.5;
        this.suspicionTimer = 0;
        this.lastKnownEnemyPos = null;
        this.postPlantTargetNodeId = null;
        const spawnNode = Object.values(navNodes).find((n) =>
          this.team === 'gang' ? n.isTSpawn : n.isCTSpawn
        );
        if (spawnNode) {
          this.planPath(navNodes, spawnNode.id, colliders, profile);
        }
        break;
      }
      case 'defend_me': {
        this.manualHoldTimer = 0;
        this.retreatTimer = 0;
        this.suspiciousPos = playerPos.clone();
        this.suspicionTimer = 8.0;
        if (distToPlayer < 45) {
          this.followPlayerTimer = 11.0;
          this.planPathToWorldPos(playerPos, navNodes, colliders, profile);
        }
        break;
      }
      case 'follow_me': {
        if (!assignFollowSlot) break;
        this.manualHoldTimer = 0;
        this.retreatTimer = 0;
        this.followPlayerTimer = 16.0;
        this.planPathToWorldPos(playerPos, navNodes, colliders, profile);
        break;
      }
      case 'hold_here': {
        if (distToPlayer < 36) {
          this.followPlayerTimer = 0;
          this.retreatTimer = 0;
          this.manualHoldTimer = 12.0;
          this.manualHoldAngle = Math.atan2(playerLookDir.x, playerLookDir.z);
          this.currentPath = [];
          this.currentPathNodeIds = [];
        }
        break;
      }
      case 'enemy_spotted': {
        this.manualHoldTimer = 0;
        this.retreatTimer = 0;
        this.suspiciousPos = aimPos.clone();
        this.lastKnownEnemyPos = aimPos.clone();
        this.suspicionTimer = 9.0;
        if (this.position.distanceTo(aimPos) < 40) {
          this.planPathToWorldPos(aimPos, navNodes, colliders, profile);
        }
        break;
      }
      case 'need_backup': {
        this.manualHoldTimer = 0;
        this.retreatTimer = 0;
        this.suspiciousPos = playerPos.clone();
        this.suspicionTimer = 8.5;
        this.followPlayerTimer = 9.0;
        this.planPathToWorldPos(playerPos, navNodes, colliders, profile);
        break;
      }
      case 'sector_clear': {
        this.suspicionTimer = 0;
        this.suspiciousPos = null;
        this.lastKnownEnemyPos = null;
        this.manualHoldTimer = 0;
        this.followPlayerTimer = 0;
        this.retreatTimer = 0;
        this.currentPath = [];
        break;
      }
      case 'go_a': {
        this.targetObjective = 'site_a';
        this.manualHoldTimer = 0;
        this.followPlayerTimer = 0;
        this.retreatTimer = 0;
        this.postPlantTargetNodeId = null;
        const nodeA = Object.values(navNodes).find((n) => n.isSiteA);
        if (nodeA) this.planPath(navNodes, nodeA.id, colliders, profile);
        break;
      }
      case 'go_b': {
        this.targetObjective = 'site_b';
        this.manualHoldTimer = 0;
        this.followPlayerTimer = 0;
        this.retreatTimer = 0;
        this.postPlantTargetNodeId = null;
        const nodeB = Object.values(navNodes).find((n) => n.isSiteB);
        if (nodeB) this.planPath(navNodes, nodeB.id, colliders, profile);
        break;
      }
    }
  }

  private buildAvoidZoneChecker(profile?: TacticalMapProfile) {
    if (!profile || !this.selfLearning.avoidZone) return undefined;
    const avoidZone = this.selfLearning.avoidZone;
    const scratch = this._avoidZoneVec;
    return (x: number, y: number, z: number) => {
      scratch.set(x, y, z);
      return profile.classifyPositionZone(scratch) === avoidZone;
    };
  }

  public planPathToWorldPos(
    targetPos: THREE.Vector3,
    navNodes: Record<string, NavNode>,
    colliders: BoxCollider[],
    mapProfile?: TacticalMapProfile
  ) {
    const profile = mapProfile ?? this.activeMapProfile;
    if (profile?.navGrid) {
      const aStarPath = profile.navGrid.findPath(this.position, targetPos, {
        avoidZoneChecker: this.buildAvoidZoneChecker(profile),
        avoidZonePenalty: 0.9
      });
      if (aStarPath.length > 0) {
        this.currentPath = aStarPath;
        this.currentPathNodeIds = [];
        this.currentWaypointIndex = 0;
        this.currentPathTargetPos.copy(targetPos);
        return;
      }
    }

    let nearestNode: NavNode | null = null;
    let bestDist = Infinity;
    for (const n of Object.values(navNodes)) {
      const d = n.pos.distanceTo(targetPos);
      if (d < bestDist) {
        bestDist = d;
        nearestNode = n;
      }
    }

    if (nearestNode) {
      this.planPath(navNodes, nearestNode.id, colliders, profile);
      this.currentPath.push(targetPos.clone());
      this.currentPathTargetPos.copy(targetPos);
    }
  }

  /**
   * Primary 2.5D Obstacle-Aware A* Pathfinding (with Legacy Node Dijkstra Fallback).
   */
  public planPath(
    navNodes: Record<string, NavNode>,
    targetNodeId: string,
    colliders?: BoxCollider[],
    mapProfile?: TacticalMapProfile
  ) {
    const targetNode = navNodes[targetNodeId];
    if (!targetNode) return;

    const profile = mapProfile ?? this.activeMapProfile;
    if (profile?.navGrid) {
      const aStarPath = profile.navGrid.findPath(this.position, targetNode.pos, {
        avoidZoneChecker: this.buildAvoidZoneChecker(profile),
        avoidZonePenalty: 0.9
      });
      if (aStarPath.length > 0) {
        this.currentPath = aStarPath;
        this.currentPathNodeIds = new Array(aStarPath.length).fill('');
        this.currentPathNodeIds[aStarPath.length - 1] = targetNodeId;
        this.currentWaypointIndex = 0;
        this.currentPathTargetPos.copy(targetNode.pos);
        return;
      }
    }

    let nearestStart: NavNode | null = null;
    let bestStartScore = Infinity;
    for (const node of Object.values(navNodes)) {
      const d = this.position.distanceTo(node.pos);
      const wallPenalty = colliders && d < 28 && !this.hasLineOfSight(this.position, node.pos, colliders) ? 18 : 0;
      const score = d + wallPenalty;
      if (score < bestStartScore) {
        bestStartScore = score;
        nearestStart = node;
      }
    }

    if (!nearestStart) return;
    const startId = nearestStart.id;

    const distances: Record<string, number> = {};
    const prev: Record<string, string | null> = {};
    const unvisited = new Set<string>(Object.keys(navNodes));

    for (const id of Object.keys(navNodes)) {
      distances[id] = Infinity;
      prev[id] = null;
    }
    distances[startId] = 0;

    while (unvisited.size > 0) {
      let currentId: string | null = null;
      let bestDist = Infinity;
      for (const id of unvisited) {
        if (distances[id] < bestDist) {
          bestDist = distances[id];
          currentId = id;
        }
      }

      if (!currentId || bestDist === Infinity) break;
      unvisited.delete(currentId);
      if (currentId === targetNodeId) break;

      const curNode = navNodes[currentId];
      for (const nextId of curNode.connections) {
        if (!unvisited.has(nextId) || !navNodes[nextId]) continue;
        let edgeWeight = curNode.pos.distanceTo(navNodes[nextId].pos);
        if (
          profile &&
          this.selfLearning.avoidZone &&
          nextId !== targetNodeId &&
          profile.nodeZones[nextId] === this.selfLearning.avoidZone
        ) {
          edgeWeight += 9.5;
        }
        const alt = distances[currentId] + edgeWeight;
        if (alt < distances[nextId]) {
          distances[nextId] = alt;
          prev[nextId] = currentId;
        }
      }
    }

    const pathIds: string[] = [];
    let crawl: string | null = targetNodeId;
    while (crawl) {
      pathIds.unshift(crawl);
      crawl = prev[crawl];
    }

    if (pathIds.length > 0 && pathIds[0] === startId) {
      this.currentPathNodeIds = pathIds;
      this.currentPath = pathIds.map((id) => navNodes[id].pos.clone());
      this.currentWaypointIndex = 0;
      this.currentPathTargetPos.copy(targetNode.pos);
    }
  }

  public update(
    dt: number,
    navNodes: Record<string, NavNode>,
    colliders: BoxCollider[],
    ramps: RampZone[],
    isBombPlanted: boolean,
    bombPos?: THREE.Vector3,
    siteA?: { center: THREE.Vector3; radius: number },
    siteB?: { center: THREE.Vector3; radius: number },
    playerInfo?: PlayerVisionInfo,
    otherBots?: BotController[],
    droppedBombPos?: THREE.Vector3 | null,
    isSeekingDroppedBomb = false,
    bombTimeLeft = 40,
    activeSmokes?: SmokeVolume[],
    incomingGrenades?: IncomingGrenadeThreat[],
    mapProfile?: TacticalMapProfile
  ) {
    if (!this.state.isAlive) {
      if (this.deathAnimTimer < 1.75) {
        this.deathAnimTimer += dt;
        this.char.mixer.update(dt);
      }
      return;
    }
    this.char.mixer.update(dt);
    this.roundAliveSeconds += dt;

    if (mapProfile) this.activeMapProfile = mapProfile;

    this.flinchPitch = THREE.MathUtils.damp(this.flinchPitch, 0, 12, dt);
    this.flinchRoll = THREE.MathUtils.damp(this.flinchRoll, 0, 12, dt);
    this.recoilKickPitch = THREE.MathUtils.damp(this.recoilKickPitch, 0, 18, dt);

    this.thinkTimer += dt;
    this.shootTimer += dt;
    this.aimSwayPhase += dt * 3.1;
    this.lookScanPhase += dt * 1.45;
    if (this.suspicionTimer > 0) this.suspicionTimer -= dt;
    if (this.avoidanceTimer > 0) this.avoidanceTimer -= dt;
    if (this.replanCooldown > 0) this.replanCooldown -= dt;
    if (this.burstPauseTimer > 0) this.burstPauseTimer -= dt;
    if (this.radioCooldown > 0) this.radioCooldown -= dt;
    if (this.backupCallCooldown > 0) this.backupCallCooldown -= dt;
    if (this.tacticalHoldTimer > 0) this.tacticalHoldTimer -= dt;
    if (this.grenadeCooldown > 0) this.grenadeCooldown -= dt;
    if (this.followPlayerTimer > 0) this.followPlayerTimer -= dt;
    if (this.manualHoldTimer > 0) this.manualHoldTimer -= dt;
    if (this.retreatTimer > 0) this.retreatTimer -= dt;
    if (this.coverSearchCooldown > 0) this.coverSearchCooldown -= dt;
    if (this.grenadeDodgeTimer > 0) this.grenadeDodgeTimer -= dt;
    if (this.underFireTimer > 0) {
      this.underFireTimer -= dt;
      if (this.underFireTimer <= 0) this.isUnderFire = false;
    }

    // Reloading
    if (this.state.isReloading) {
      this.reloadTimer += dt;
      if (this.reloadTimer >= this.state.weapon.reloadTime) {
        this.state.isReloading = false;
        this.state.currentAmmo = this.state.weapon.magazineSize;
        this.reloadTimer = 0;
        this.activeCoverPos = null;
        this.coverMoveTimer = 0;
      }
    }

    // 1. AUDIO PERIMETER AWARENESS
    const hearRadius = Math.min(22.0, 13.5 + (this.difficultyLevel - 1) * 0.65);
    if (playerInfo && playerInfo.isAlive && playerInfo.team !== this.team) {
      const distToPlayer = this.position.distanceTo(playerInfo.pos);
      if (playerInfo.isRunning && distToPlayer < hearRadius) {
        this.suspiciousPos = playerInfo.pos.clone();
        this.suspicionTimer = 2.8;
      }
    }

    // 2. FULL ENVIRONMENTAL VISION: ENEMIES, TEAMMATES, INCOMING GRENADES & SQUAD ROUTING
    const thinkInterval = Math.max(0.085, 0.16 - (this.difficultyLevel - 1) * 0.007);
    if (this.thinkTimer > thinkInterval) {
      this.thinkTimer = 0;

      const forward = this._tmpVec1.set(0, 0, 1).applyAxisAngle(this._upAxis, this.char.group.rotation.y);
      const toTarget = this._tmpVec2;

      // 2A. Incoming HE Grenade Detection -> Obstacle-Aware Active Evasion
      if (incomingGrenades && incomingGrenades.length > 0 && this.grenadeDodgeTimer <= 0) {
        const dodgeSens = 7.4 + this.traits.utilityIQ * 1.6 + this.selfLearning.grenadeDodgeUrgency * 1.2;
        for (const gr of incomingGrenades) {
          if (gr.type !== 'hegrenade') continue;
          const distToNade = this.position.distanceTo(gr.pos);
          if (distToNade < dodgeSens && this.hasLineOfSight(this.position, gr.pos, colliders)) {
            const away = this._tmpVec3.copy(this.position).sub(gr.pos);
            away.y = 0;
            if (away.lengthSq() < 0.05) {
              away.set(-gr.vel.z, 0, gr.vel.x);
            }
            if (away.lengthSq() > 0.001) {
              away.normalize();
              const baseAng = Math.atan2(away.x, away.z);
              let bestAng = baseAng;
              let bestScore = -Infinity;
              for (let k = 0; k < 8; k++) {
                const ang = baseAng + (k * Math.PI) / 4;
                const dx = Math.sin(ang);
                const dz = Math.cos(ang);
                const alignAway = Math.cos(ang - baseAng);
                const clear2m = this.isProbeClear(this.position, dx, dz, 2.1, colliders, ramps);
                const clear1m = clear2m || this.isProbeClear(this.position, dx, dz, 1.0, colliders, ramps);
                const score = alignAway * 2.0 + (clear2m ? 3.5 : clear1m ? 1.0 : -6.0);
                if (score > bestScore) {
                  bestScore = score;
                  bestAng = ang;
                }
              }
              this.grenadeDodgeDir.set(Math.sin(bestAng), 0, Math.cos(bestAng)).normalize();
              this.grenadeDodgeTimer = 1.15;
              this.state.isPlanting = false;
              this.state.isDefusing = false;
              break;
            }
          }
        }
      }

      // 2B. Teammate Visual Awareness (see friends, their HP, combat & help needs)
      let alliesSeen = 0;
      let helpPos: THREE.Vector3 | null = null;
      if (playerInfo && playerInfo.isAlive && playerInfo.team === this.team) {
        const dp = this.position.distanceTo(playerInfo.pos);
        if (dp < 36 && this.hasLineOfSight(this.position, playerInfo.pos, colliders, activeSmokes)) {
          alliesSeen++;
          if ((playerInfo.health ?? 100) < 42 && dp < 24) {
            helpPos = playerInfo.pos.clone();
          }
        }
      }
      if (otherBots) {
        for (const ally of otherBots) {
          if (ally.id === this.id || !ally.state.isAlive || ally.team !== this.team) continue;
          const da = this.position.distanceTo(ally.position);
          if (da < 36 && this.hasLineOfSight(this.position, ally.position, colliders, activeSmokes)) {
            alliesSeen++;
            if (!helpPos && (ally.state.health < 45 || ally.isUnderFire) && ally.targetEnemy && da < 26) {
              helpPos = ally.targetEnemy.pos.clone();
            }
          }
        }
      }
      this.visibleAlliesCount = alliesSeen;
      this.nearbyAllyNeedsHelpPos = helpPos;

      // 2C. Enemy Detection (Prioritizes C4 carrier on SWAT, or closest lethal threat)
      let detectedEnemy: BotController['targetEnemy'] = null;
      let bestTargetScore = -Infinity;

      const evalCandidate = (
        pos: THREE.Vector3,
        id: string,
        isPlayer: boolean,
        isCrouching: boolean | undefined,
        hasC4: boolean | undefined
      ) => {
        const d = this.position.distanceTo(pos);
        if (d >= 62) return;
        toTarget.copy(pos).sub(this.position).normalize();
        const dot = forward.dot(toTarget);

        const canSee =
          dot > 0.48 ||
          (dot > 0.14 && d < 9.5) ||
          d < 3.4 ||
          (this.suspicionTimer > 0 && dot > 0.04 && d < 28);

        if (canSee && this.hasLineOfSight(this.position, pos, colliders, activeSmokes)) {
          // SWAT prioritizes C4 carrier if visible!
          const carrierBonus = this.team === 'swat' && hasC4 ? 18 : 0;
          const score = 70 - d + carrierBonus;
          if (score > bestTargetScore) {
            bestTargetScore = score;
            detectedEnemy = {
              pos: pos.clone(),
              isPlayer,
              id,
              dist: d,
              isCrouching,
              hasC4
            };
          }
        }
      };

      if (playerInfo && playerInfo.isAlive && playerInfo.team !== this.team) {
        evalCandidate(playerInfo.pos, 'player', true, playerInfo.isCrouching, playerInfo.hasC4);
      }
      if (otherBots) {
        for (const b of otherBots) {
          if (b.state.isAlive && b.team !== this.team) {
            evalCandidate(b.position, b.id, false, b.isCrouchingCombat, b.state.hasC4);
          }
        }
      }

      const resolvedEnemy = detectedEnemy as BotController['targetEnemy'];
      if (resolvedEnemy && !this.targetEnemy) {
        this.aimSkill = this.computeEffectiveAimSkill();
        const errMag = 0.12 + (1 - this.aimSkill) * 0.25;
        this.aimTrackingError.set(
          (Math.random() - 0.5) * errMag * 2,
          (Math.random() - 0.5) * errMag * 1.1
        );
      }
      this.targetEnemy = resolvedEnemy;

      if (resolvedEnemy) {
        if (this.lastKnownEnemyPos) this.lastKnownEnemyPos.copy(resolvedEnemy.pos);
        else this.lastKnownEnemyPos = resolvedEnemy.pos.clone();
        if (this.radioCooldown <= 0) {
          this.radioCooldown = 2.4;
          this.onEnemySpotted?.(this, resolvedEnemy.pos.clone(), Boolean(resolvedEnemy.hasC4));
        }
      } else {
        this.reactionDelayTimer = 0;
      }

      // 2D. Squad Guarding (Cover planting C4 carrier OR defusing SWAT ally)
      this.guardFacingAngle = null;
      const outDir = this._tmpVec3;

      if (otherBots) {
        if (this.team === 'gang') {
          let plantingAllyPos: THREE.Vector3 | null = null;
          if (playerInfo?.isAlive && playerInfo.team === 'gang' && playerInfo.isPlanting) {
            plantingAllyPos = playerInfo.pos;
          } else {
            const pBot = otherBots.find(
              (b) => b.id !== this.id && b.state.isAlive && b.team === 'gang' && b.state.isPlanting
            );
            if (pBot) plantingAllyPos = pBot.position;
          }

          if (plantingAllyPos && this.position.distanceTo(plantingAllyPos) < 18) {
            this.tacticalHoldTimer = 0.55;
            if (this.suspiciousPos) outDir.copy(this.suspiciousPos).sub(this.position);
            else outDir.copy(this.position).sub(plantingAllyPos);
            if (outDir.lengthSq() > 0.1) {
              this.guardFacingAngle = Math.atan2(outDir.x, outDir.z);
            }
          }
        } else if (this.team === 'swat' && isBombPlanted && bombPos) {
          const someoneDefusing =
            (playerInfo?.isAlive && playerInfo.team === 'swat' && playerInfo.isDefusing) ||
            otherBots.some((b) => b.id !== this.id && b.state.isAlive && b.team === 'swat' && b.state.isDefusing);

          if (someoneDefusing && this.position.distanceTo(bombPos) < 18) {
            this.tacticalHoldTimer = 0.55;
            if (this.suspiciousPos) outDir.copy(this.suspiciousPos).sub(this.position);
            else outDir.copy(this.position).sub(bombPos);
            if (outDir.lengthSq() > 0.1) {
              this.guardFacingAngle = Math.atan2(outDir.x, outDir.z);
            }
          }
        }
      }

      // 2E. Tactical Grenades (Smoke cover & HE cover-flush)
      this.evaluateTacticalGrenade(
        colliders,
        isBombPlanted,
        bombPos,
        siteA,
        siteB,
        playerInfo,
        otherBots,
        activeSmokes
      );

      // 2F. Seek Cover When Reloading or Low HP Under Threat ("الاحتماء أثناء القتال")
      const threatPos = this.targetEnemy?.pos || (this.isUnderFire ? this.lastKnownEnemyPos || this.suspiciousPos : null);
      const wantsCover =
        threatPos &&
        (this.state.isReloading ||
          (this.state.health < 42 && this.position.distanceTo(threatPos) > 6.5) ||
          (this.isUnderFire && !this.targetEnemy && this.traits.utilityIQ > 0.58));

      if (wantsCover && mapProfile && this.coverSearchCooldown <= 0 && !this.activeCoverPos) {
        this.coverSearchCooldown = 1.4;
        const foundCover = mapProfile.findNearestCoverPos(this.position, threatPos, colliders, ramps, 10);
        if (foundCover) {
          this.activeCoverPos = foundCover;
        }
      } else if (!wantsCover && !this.state.isReloading) {
        this.activeCoverPos = null;
      }

      // 2G. Strategic Role-Based Routing (Obstacle-Aware 2.5D A* via NavGrid)
      const pathExhausted =
        this.currentPath.length === 0 || this.currentWaypointIndex >= this.currentPath.length;

      if (isSeekingDroppedBomb && droppedBombPos) {
        if (
          pathExhausted ||
          (this.replanCooldown <= 0 && this.currentPathTargetPos.distanceTo(droppedBombPos) > 2.2)
        ) {
          this.planPathToWorldPos(droppedBombPos, navNodes, colliders, mapProfile);
        }
      } else if (this.followPlayerTimer > 0 && playerInfo && playerInfo.isAlive && playerInfo.team === this.team) {
        const distP = this.position.distanceTo(playerInfo.pos);
        if (
          distP > 4.6 &&
          (pathExhausted || (this.replanCooldown <= 0 && this.currentPathTargetPos.distanceTo(playerInfo.pos) > 3.5))
        ) {
          this.planPathToWorldPos(playerInfo.pos, navNodes, colliders, mapProfile);
        }
      } else if (this.manualHoldTimer > 0 || this.retreatTimer > 0) {
        // Maintain hold or fallback path
      } else if (
        this.priorityTargetPos &&
        this.priorityTargetReason &&
        !this.state.hasC4 &&
        !this.state.isPlanting &&
        !this.state.isDefusing &&
        (this.state.role === 'attacker' ||
          (this.state.role === 'defender' && this.position.distanceTo(this.priorityTargetPos) < 26)) &&
        this.position.distanceTo(this.priorityTargetPos) > 4.5 &&
        (pathExhausted ||
          (this.replanCooldown <= 0 && this.currentPathTargetPos.distanceTo(this.priorityTargetPos) > 3.5))
      ) {
        this.planPathToWorldPos(this.priorityTargetPos, navNodes, colliders, mapProfile);
      } else if (pathExhausted) {
        const targetNodeId = this.selectStrategicTargetNodeId(
          navNodes,
          isBombPlanted,
          bombPos,
          siteA,
          siteB,
          playerInfo,
          otherBots,
          mapProfile
        );
        if (targetNodeId && navNodes[targetNodeId]) {
          this.planPath(navNodes, targetNodeId, colliders, mapProfile);
        }
      }
    }

    // 3. GRENADE AVOIDANCE OVERRIDE ("الابتعاد عن رمي القنابل")
    if (this.grenadeDodgeTimer > 0 && !this.state.isPlanting && !this.state.isDefusing) {
      const dodgeSpeed = 5.45 * this.traits.speedMult;
      const moveDir = this._tmpVec3.copy(this.grenadeDodgeDir);
      const proposedPos = this._tmpVec5.copy(this.position).addScaledVector(moveDir, dodgeSpeed * dt);
      this.resolveWallCollision(proposedPos, colliders);
      proposedPos.y = getSurfaceHeightAt(proposedPos.x, proposedPos.z, this.position.y, colliders, ramps, 0.4);
      this.position.copy(proposedPos);
      this.char.group.position.copy(this.position);
      this.char.group.rotation.y = THREE.MathUtils.damp(
        this.char.group.rotation.y,
        Math.atan2(moveDir.x, moveDir.z),
        14,
        dt
      );
      this.char.playAnimation('run', 0.12);
      return;
    }

    // 4. GUNFIGHT WITH TRAIT SKILL, SECONDARY FALLBACK, COVER & NEMESIS ADAPTATION
    if (this.targetEnemy) {
      const urgentDefuseWindow = this.state.hasDefuser ? 6.2 : 9.0;
      if (
        this.team === 'swat' &&
        isBombPlanted &&
        bombPos &&
        bombTimeLeft < urgentDefuseWindow &&
        this.position.distanceTo(bombPos) < 3.2
      ) {
        // Urgent time-critical defuse!
      } else {
        // Sniper close-range adaptation: pull out sidearm if rushed < 9.5m!
        if (
          this.state.role === 'sniper' &&
          this.primaryWeapon.id === 'awp' &&
          !this.usingSecondary &&
          this.targetEnemy.dist < 9.5 &&
          this.secondaryAmmo > 0
        ) {
          this.switchWeapon(true);
        } else if (
          this.usingSecondary &&
          this.state.role === 'sniper' &&
          this.primaryWeapon.id === 'awp' &&
          this.targetEnemy.dist > 15 &&
          this.primaryAmmo > 0
        ) {
          this.switchWeapon(false);
        }

        // Emergency sidearm switch if primary runs dry in close combat (<13m)
        if (!this.usingSecondary && this.state.currentAmmo <= 0 && !this.state.isReloading && this.targetEnemy.dist < 13 && this.secondaryAmmo > 0) {
          this.switchWeapon(true);
        }

        this.aimSkill = this.computeEffectiveAimSkill();
        const swayYaw = Math.sin(this.aimSwayPhase) * (0.042 * (1.2 - this.aimSkill));
        const swayPitch = Math.cos(this.aimSwayPhase * 0.77) * (0.024 * (1.2 - this.aimSkill));

        const lookDir = this._tmpVec1.copy(this.targetEnemy.pos).sub(this.position);
        lookDir.y = 0;
        if (lookDir.lengthSq() > 0.01) {
          const targetRotY = Math.atan2(lookDir.x, lookDir.z) + this.aimTrackingError.x + swayYaw;
          this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, targetRotY, 13, dt);
        }

        const aimSettleRate = 3.6 + (this.difficultyLevel - 1) * 0.45 + (this.state.weapon.id === 'awp' ? 1.1 : 0);
        this.aimTrackingError.x = THREE.MathUtils.damp(this.aimTrackingError.x, swayYaw * 0.5, aimSettleRate, dt);
        this.aimTrackingError.y = THREE.MathUtils.damp(this.aimTrackingError.y, swayPitch * 0.5, aimSettleRate, dt);

        const targetAimY = this.targetEnemy.pos.y + (this.targetEnemy.isCrouching ? 0.88 : 1.38);
        const diffY = targetAimY - (this.position.y + 1.38);
        const horizDist = Math.max(
          0.1,
          Math.hypot(this.targetEnemy.pos.x - this.position.x, this.targetEnemy.pos.z - this.position.z)
        );
        const targetPitch = Math.atan2(diffY, horizDist) + this.aimTrackingError.y + swayPitch;
        this.pitch = THREE.MathUtils.damp(this.pitch, THREE.MathUtils.clamp(targetPitch, -0.55, 0.55), 12, dt);

        this.reactionDelayTimer += dt;

        // Reload check
        if (this.state.currentAmmo <= 0 && !this.state.isReloading) {
          this.state.isReloading = true;
          this.reloadTimer = 0;
          if (playerInfo) {
            const dx = this.position.x - playerInfo.pos.x;
            const dz = this.position.z - playerInfo.pos.z;
            const dist = Math.hypot(dx, dz);
            const atten = Math.max(0, 1 - dist / 26);
            const yaw = playerInfo.yaw ?? 0;
            const pan = dist > 0.2 ? THREE.MathUtils.clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist, -1, 1) : 0;
            sound.playReload(this.state.weapon.id, atten, pan);
          }
        }

        const isFiringBurst =
          this.burstPauseTimer <= 0 &&
          !this.state.isReloading &&
          this.reactionDelayTimer >= this.reactionTimeThreshold;

        const antiHs = this.targetEnemy.isPlayer ? this.nemesisAdvice?.antiHeadshotMove ?? 0 : 0;
        const strafeBoost = this.targetEnemy.isPlayer ? this.nemesisAdvice?.strafeBoost ?? 0 : 0;

        this.strafeTimer += dt;
        const strafeSwitchInterval = Math.max(0.36, 0.62 - strafeBoost * 0.2);
        if (this.strafeTimer > strafeSwitchInterval) {
          this.strafeTimer = 0;
          this.strafeDir *= -1;
          const crouchProb = 0.28 + antiHs * 0.35;
          this.isCrouchingCombat = this.state.health < 45 || Math.random() < crouchProb;
        }

        // Move toward physical cover if reloading/low HP, otherwise counter-strafe!
        let isActivelyStrafing = false;
        let activeStrafeSpeed = 0;

        if (this.activeCoverPos && (this.state.isReloading || this.state.health < 42)) {
          const toCov = this._tmpVec2.copy(this.activeCoverPos).sub(this.position);
          toCov.y = 0;
          const distCov = toCov.length();
          if (distCov > 0.7) {
            toCov.divideScalar(distCov);
            this.computeClearMoveDirection(toCov, colliders, ramps, this._probeSteer);
            const covSpeed = 4.5 * this.traits.speedMult;
            const prevX = this.position.x;
            const prevZ = this.position.z;
            const proposed = this._tmpVec3.copy(this.position).addScaledVector(this._probeSteer, covSpeed * dt);
            this.resolveWallCollision(proposed, colliders);
            proposed.y = getSurfaceHeightAt(proposed.x, proposed.z, this.position.y, colliders, ramps, 0.4);
            this.position.copy(proposed);
            this.char.group.position.copy(this.position);
            const movedCov = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
            activeStrafeSpeed = dt > 0.001 ? movedCov / dt : 0;
            isActivelyStrafing = activeStrafeSpeed > 0.45;
            this.coverMoveTimer += dt;
            if ((movedCov < covSpeed * dt * 0.2 && this.coverMoveTimer > 0.45) || this.coverMoveTimer > 2.8) {
              this.activeCoverPos = null;
              this.coverMoveTimer = 0;
              this.coverSearchCooldown = 1.4;
            }
          } else {
            this.isCrouchingCombat = true;
            this.coverMoveTimer = 0;
          }
        } else {
          const shouldMoveInCombat =
            (!isFiringBurst && this.state.weapon.id !== 'awp') ||
            this.state.isReloading ||
            this.state.health < 38 ||
            strafeBoost > 0.45;

          if (shouldMoveInCombat && !this.isCrouchingCombat) {
            const perp = this._tmpStrafeDir.set(-lookDir.z, 0, lookDir.x).normalize();
            // Flip strafe direction before hitting a wall or cliff drop
            if (
              !this.isProbeClear(
                this.position,
                perp.x * this.strafeDir,
                perp.z * this.strafeDir,
                0.85,
                colliders,
                ramps
              )
            ) {
              this.strafeDir *= -1;
            }
            const strafeSpeed = (this.state.health < 38 ? 3.2 : 2.35 + strafeBoost * 0.95) * this.traits.speedMult;
            const prevX = this.position.x;
            const prevZ = this.position.z;
            const proposedPos = this._tmpVec2
              .copy(this.position)
              .addScaledVector(perp, this.strafeDir * strafeSpeed * dt);

            this.resolveWallCollision(proposedPos, colliders);
            proposedPos.y = getSurfaceHeightAt(proposedPos.x, proposedPos.z, this.position.y, colliders, ramps, 0.4);
            this.position.copy(proposedPos);
            this.char.group.position.copy(this.position);

            const moved = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
            activeStrafeSpeed = dt > 0.001 ? moved / dt : 0;
            isActivelyStrafing = activeStrafeSpeed > 0.45;
            if (moved < strafeSpeed * dt * 0.25) {
              this.strafeDir *= -1;
            }
          }
        }

        const targetLean = isActivelyStrafing ? -this.strafeDir * 0.085 : 0;
        this.combatLeanRoll = THREE.MathUtils.damp(this.combatLeanRoll, targetLean, 10, dt);

        if (this.char.by['chest']) {
          this.char.by['chest'].rotation.x = this.pitch * 0.6 + this.flinchPitch * 0.55;
          this.char.by['chest'].rotation.z = this.flinchRoll * 0.55 + this.combatLeanRoll;
        }
        if (this.char.by['weapon']) {
          this.char.by['weapon'].rotation.x = this.pitch + this.recoilKickPitch;
        }
        if (this.char.by['head']) {
          this.char.by['head'].rotation.x = this.pitch * 0.4 + this.flinchPitch * 0.85;
          this.char.by['head'].rotation.z = this.flinchRoll * 0.75;
        }

        // Ballistic Shooting
        const fireCooldown = this.state.weapon.id === 'awp' ? 1.35 : (1 / this.state.weapon.fireRate) * 1.15;
        if (isFiringBurst && this.shootTimer > fireCooldown) {
          this.shootTimer = 0;
          this.burstCount++;

          if (this.burstCount <= this.maxBurst) {
            this.state.currentAmmo--;
            this.recoilKickPitch = Math.min(0.16, this.recoilKickPitch + 0.075);

            const dx = playerInfo ? this.position.x - playerInfo.pos.x : 0;
            const dz = playerInfo ? this.position.z - playerInfo.pos.z : 0;
            const playerDist = playerInfo ? Math.hypot(dx, dz) : 15;
            const volAtten = Math.max(0.06, 1 - playerDist / 72);
            const yaw = playerInfo?.yaw ?? 0;
            const pan =
              playerInfo && playerDist > 0.2
                ? THREE.MathUtils.clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / playerDist, -1, 1)
                : 0;
            sound.playGunshot(this.state.weapon.id as GunshotSoundId, volAtten, pan);

            const dist = Math.max(1.5, this.targetEnemy.dist);
            const movePenalty = isActivelyStrafing && !this.isCrouchingCombat ? 1.55 : this.isCrouchingCombat ? 0.66 : 1.0;
            const burstRecoilPenalty = 1.0 + Math.max(0, this.burstCount - 1) * 0.44;
            const trackingMag = Math.abs(this.aimTrackingError.x) + Math.abs(this.aimTrackingError.y);

            const baseConeRad =
              (0.017 + this.state.weapon.spread * 0.92 + (1 - this.aimSkill) * 0.034) *
              movePenalty *
              burstRecoilPenalty +
              trackingMag * 0.42;

            const scatterRadius = dist * baseConeRad;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.sqrt(Math.random()) * scatterRadius;
            const recoilClimb = Math.max(0, this.burstCount - 1) * dist * this.state.weapon.recoil * 0.85;

            const shotForward = this._tmpVec3.copy(this.targetEnemy.pos).sub(this.position).normalize();
            const shotRight = this._tmpVec4.set(-shotForward.z, 0, shotForward.x).normalize();

            const centerChestY = this.targetEnemy.isCrouching ? 0.78 : 1.24;
            const aimPoint = this.targetEnemy.pos.clone();
            aimPoint.y += centerChestY + Math.sin(angle) * radius * 0.78 + recoilClimb;
            aimPoint.addScaledVector(shotRight, Math.cos(angle) * radius);

            const baseHeadshotChance =
              Math.min(0.28, this.traits.headshotTendency + (this.difficultyLevel - 1) * 0.014) +
              (this.isCrouchingCombat ? 0.05 : 0);
            const isHeadshotIntent = Math.random() < baseHeadshotChance;
            if (isHeadshotIntent && radius < scatterRadius * 0.45) {
              aimPoint.y = this.targetEnemy.pos.y + (this.targetEnemy.isCrouching ? 1.0 : 1.54);
            }

            this.onShoot?.(aimPoint, isHeadshotIntent, this.targetEnemy.id);
          } else {
            this.burstCount = 0;
            this.maxBurst = this.state.weapon.id === 'awp' ? 1 : 2 + Math.floor(Math.random() * 3);
            this.burstPauseTimer = Math.max(0.14, 0.36 - (this.difficultyLevel - 1) * 0.02) + Math.random() * 0.16;
          }
        }

        if (this.isCrouchingCombat) {
          this.char.playAnimation('crouch', 0.16);
        } else if (isActivelyStrafing) {
          this.char.playAnimation('walk', 0.14);
          if (this.char.act['walk']) {
            this.char.act['walk'].timeScale = THREE.MathUtils.clamp(activeStrafeSpeed / 3.6, 0.55, 1.2);
          }
        } else {
          this.char.playAnimation('idle', 0.14);
        }
        return;
      }
    }

    // Outside active combat: switch back to primary if it has ammo and wasn't mid-duel
    if (this.usingSecondary && this.primaryAmmo > 0 && !this.isUnderFire) {
      this.switchWeapon(false);
    }

    // Outside combat: if hurt/empty and near cover, duck behind cover to reload safely!
    if (this.state.isReloading && this.activeCoverPos) {
      const toCov = this._tmpVec2.copy(this.activeCoverPos).sub(this.position);
      toCov.y = 0;
      if (toCov.length() > 0.75) {
        toCov.normalize();
        this.computeClearMoveDirection(toCov, colliders, ramps, this._probeSteer);
        const covSpeed = 4.6 * this.traits.speedMult;
        const prevX = this.position.x;
        const prevZ = this.position.z;
        const proposed = this._tmpVec3.copy(this.position).addScaledVector(this._probeSteer, covSpeed * dt);
        this.resolveWallCollision(proposed, colliders);
        proposed.y = getSurfaceHeightAt(proposed.x, proposed.z, this.position.y, colliders, ramps, 0.4);
        this.position.copy(proposed);
        this.char.group.position.copy(this.position);
        this.coverMoveTimer += dt;
        const movedCov = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
        if ((movedCov < covSpeed * dt * 0.2 && this.coverMoveTimer > 0.45) || this.coverMoveTimer > 2.8) {
          this.activeCoverPos = null;
          this.coverMoveTimer = 0;
          this.coverSearchCooldown = 1.4;
        } else {
          this.char.playAnimation('walk', 0.14);
          return;
        }
      } else {
        this.coverMoveTimer = 0;
        this.char.playAnimation('crouch', 0.16);
        return;
      }
    }

    // Reset vertical weapon pitch outside combat
    this.pitch = THREE.MathUtils.damp(this.pitch, 0, 10, dt);
    this.combatLeanRoll = THREE.MathUtils.damp(this.combatLeanRoll, 0, 10, dt);
    this.resetBonesPitch();

    // 5. ORIENTATION (Guard angle, Manual Hold, Suspicion/Sound, or Natural Look-Around Scan)
    if (this.guardFacingAngle !== null) {
      this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, this.guardFacingAngle, 10, dt);
    } else if (this.manualHoldTimer > 0 && this.manualHoldAngle !== null) {
      this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, this.manualHoldAngle, 10, dt);
    } else if (this.suspicionTimer > 0 && this.suspiciousPos) {
      const soundDir = this._tmpVec1.copy(this.suspiciousPos).sub(this.position);
      soundDir.y = 0;
      if (soundDir.lengthSq() > 1.0) {
        const targetRotY = Math.atan2(soundDir.x, soundDir.z);
        this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, targetRotY, 8, dt);
      }
    }

    if (this.tacticalHoldTimer > 0 || this.manualHoldTimer > 0) {
      this.char.playAnimation('crouch', 0.18);
      return;
    }

    if (this.followPlayerTimer > 0 && playerInfo && playerInfo.isAlive && playerInfo.team === this.team) {
      if (this.position.distanceTo(playerInfo.pos) < 4.2) {
        this.char.playAnimation('idle', 0.2);
        return;
      }
    }

    // 6. BOMB PLANTING (Gang C4 Carrier)
    if (this.team === 'gang' && this.state.hasC4 && !isBombPlanted) {
      const site = this.targetObjective === 'site_b' ? siteB : siteA;
      if (site && this.position.distanceTo(site.center) < site.radius - 1.2) {
        let atten = 0.7;
        let pan = 0;
        if (playerInfo) {
          const dx = this.position.x - playerInfo.pos.x;
          const dz = this.position.z - playerInfo.pos.z;
          const dist = Math.hypot(dx, dz);
          atten = Math.max(0, 1 - dist / 28);
          const yaw = playerInfo.yaw ?? 0;
          pan = dist > 0.2 ? THREE.MathUtils.clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist, -1, 1) : 0;
        }
        if (!this.state.isPlanting) {
          this.state.isPlanting = true;
          this.state.plantProgress = 0;
          this.lastPlantSoundStep = -1;
          this.char.playAnimation('crouch', 0.2);
        }
        this.state.plantProgress += dt / 3.0;
        const plantStep = Math.floor(this.state.plantProgress * 9);
        if (plantStep > this.lastPlantSoundStep) {
          this.lastPlantSoundStep = plantStep;
          if (atten > 0.04) sound.playPlantingKey(plantStep, atten, pan);
        }

        if (this.state.plantProgress >= 1.0) {
          this.state.isPlanting = false;
          this.state.hasC4 = false;
          this.lastPlantSoundStep = -1;
          this.currentPath = [];
          this.onPlantCompleted?.(this.targetObjective === 'site_b' ? 'B' : 'A', this.position.clone());
        }
        return;
      }
    }
    this.lastPlantSoundStep = -1;

    // 7. BOMB DEFUSING (Any SWAT Member Upon Reaching Planted C4)
    if (this.team === 'swat' && isBombPlanted && bombPos) {
      const distToBomb = this.position.distanceTo(bombPos);
      const someoneElseDefusing =
        (playerInfo?.isAlive && playerInfo.team === 'swat' && playerInfo.isDefusing) ||
        otherBots?.some((b) => b.id !== this.id && b.team === 'swat' && b.state.isAlive && b.state.isDefusing);

      if (distToBomb < 2.8 && !someoneElseDefusing) {
        let atten = 0.7;
        let pan = 0;
        if (playerInfo) {
          const dx = this.position.x - playerInfo.pos.x;
          const dz = this.position.z - playerInfo.pos.z;
          const dist = Math.hypot(dx, dz);
          atten = Math.max(0, 1 - dist / 28);
          const yaw = playerInfo.yaw ?? 0;
          pan = dist > 0.2 ? THREE.MathUtils.clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist, -1, 1) : 0;
        }
        if (!this.state.isDefusing) {
          this.state.isDefusing = true;
          this.state.defuseProgress = 0;
          this.lastDefuseSoundStep = 0;
          if (atten > 0.04) sound.playDefuseKey(true, atten, pan);
          this.char.playAnimation('crouch', 0.2);
        }
        const defuseDuration = this.state.hasDefuser ? 2.5 : 5.0;
        this.state.defuseProgress += dt / defuseDuration;
        const defuseStep = Math.floor(this.state.defuseProgress * (this.state.hasDefuser ? 6 : 11));
        if (defuseStep > this.lastDefuseSoundStep) {
          this.lastDefuseSoundStep = defuseStep;
          if (atten > 0.04) sound.playDefuseKey(false, atten, pan);
        }

        if (this.state.defuseProgress >= 1.0) {
          this.state.isDefusing = false;
          this.lastDefuseSoundStep = -1;
          this.onDefuseCompleted?.();
        }
        return;
      }
    }
    this.lastDefuseSoundStep = -1;

    // 8. WAYPOINT NAVIGATION WITH MULTI-HEIGHT CAPSULE FEELERS, WALL AVOIDANCE & AUTO-REPLAN
    if (this.currentPath.length > 0 && this.currentWaypointIndex < this.currentPath.length) {
      let nextWaypoint = this.currentPath[this.currentWaypointIndex];
      const wpNodeId = this.currentPathNodeIds[this.currentWaypointIndex];
      const currentNode = wpNodeId ? navNodes[wpNodeId] : undefined;

      // Smoothly skip ahead to next waypoint only if next waypoint is cleanly walkable
      if (this.currentWaypointIndex + 1 < this.currentPath.length) {
        const nextNext = this.currentPath[this.currentWaypointIndex + 1];
        if (
          this.position.distanceTo(nextWaypoint) < 2.1 &&
          Math.abs(nextWaypoint.y - this.position.y) < 0.9 &&
          isWalkSegmentClear(this.position, nextNext, colliders, ramps, 0.46)
        ) {
          this.currentWaypointIndex++;
          nextWaypoint = this.currentPath[this.currentWaypointIndex];
        }
      }

      const toWp = this._tmpVec1.copy(nextWaypoint).sub(this.position);
      toWp.y = 0;
      const dist = toWp.length();

      if (dist < 1.15 && Math.abs(nextWaypoint.y - this.position.y) < 1.2) {
        this.currentWaypointIndex++;
      } else {
        if (dist > 0.001) toWp.divideScalar(dist);
        else toWp.set(0, 0, 1);

        // Apply squad lateral lane offset ONLY if that side is clear of walls/ledges
        if (!currentNode?.isChokepoint && dist > 3.5 && Math.abs(this.squadLaneOffset) > 0.05) {
          const lanePerp = this._tmpVec2.set(-toWp.z, 0, toWp.x);
          const laneSign = Math.sign(this.squadLaneOffset);
          if (this.isProbeClear(this.position, lanePerp.x * laneSign, lanePerp.z * laneSign, 1.0, colliders, ramps)) {
            toWp.addScaledVector(lanePerp, this.squadLaneOffset * 0.11).normalize();
          }
        }

        // Squad spacing separation (avoid clumping without pushing allies into walls)
        const moveDir = this._tmpVec3.copy(toWp);
        if (otherBots) {
          const sep = this._tmpSep.set(0, 0, 0);
          const delta = this._tmpVec5;
          for (const ally of otherBots) {
            if (ally.id !== this.id && ally.state.isAlive && ally.team === this.team) {
              delta.copy(this.position).sub(ally.position);
              delta.y = 0;
              const d = delta.length();
              if (d > 0.01 && d < 2.0) {
                sep.addScaledVector(delta.divideScalar(d), (2.0 - d) * 0.55);
              }
            }
          }
          if (sep.lengthSq() > 0.001) {
            moveDir.add(sep).normalize();
          }
        }

        if (this.avoidanceTimer > 0) {
          moveDir.addScaledVector(this.avoidanceSteer, 0.85).normalize();
        }

        // Active wall-slide & multi-height obstacle fan avoidance
        const preAvoidX = moveDir.x;
        const preAvoidZ = moveDir.z;
        this.computeClearMoveDirection(moveDir, colliders, ramps, this._probeSteer);
        moveDir.copy(this._probeSteer);
        const steeredDeflection = preAvoidX * moveDir.x + preAvoidZ * moveDir.z;

        const baseSpeed = currentNode?.isChokepoint
          ? 3.9
          : 5.05 + this.selfLearning.rotationUrgency * 1.1;
        const speed = baseSpeed * this.traits.speedMult;

        const prevX = this.position.x;
        const prevZ = this.position.z;
        const intendedDist = speed * dt;
        const proposedPos = this._tmpVec5.copy(this.position).addScaledVector(moveDir, intendedDist);
        this.resolveWallCollision(proposedPos, colliders);
        proposedPos.y = getSurfaceHeightAt(proposedPos.x, proposedPos.z, this.position.y, colliders, ramps, 0.4);
        this.position.copy(proposedPos);

        const movedXZ = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
        const actualSpeed = dt > 0.001 ? movedXZ / dt : speed;

        // Detect pressing or deflecting along a wall/corner -> trigger wall-slide + A* replan
        if (intendedDist > 0.01 && (movedXZ < intendedDist * 0.35 || steeredDeflection < 0.72)) {
          this.wallBlockedTimer += dt;
        } else {
          this.wallBlockedTimer = Math.max(0, this.wallBlockedTimer - dt * 2.0);
        }

        this.stuckTimer += dt;
        if (this.stuckTimer > 0.3) {
          this.stuckTimer = 0;
          const movedDist = this.position.distanceTo(this.lastStuckCheckPos);
          this.lastStuckCheckPos.copy(this.position);
          if (movedDist < 0.16) {
            this.wallBlockedTimer = Math.max(this.wallBlockedTimer, 0.3);
          }
        }

        if (this.wallBlockedTimer > 0.22) {
          this.wallBlockedTimer = 0;
          // Pick open perpendicular side instead of blind random flip
          const leftDirX = -toWp.z;
          const leftDirZ = toWp.x;
          const leftClear = this.isProbeClear(this.position, leftDirX, leftDirZ, 1.35, colliders, ramps);
          const rightClear = this.isProbeClear(this.position, -leftDirX, -leftDirZ, 1.35, colliders, ramps);
          const side = leftClear && !rightClear ? 1 : rightClear && !leftClear ? -1 : this.preferredAvoidSide;
          this.preferredAvoidSide = side;
          this.avoidanceSteer.set(leftDirX * side, 0, leftDirZ * side).normalize();
          this.avoidanceTimer = 0.28;

          if (this.replanCooldown <= 0) {
            this.replanCooldown = 0.45;
            this.currentPath = [];
            this.currentPathNodeIds = [];
            this.thinkTimer = 1.0;
          }
        }

        // Natural look-around scanning while advancing
        let targetAngle = Math.atan2(moveDir.x, moveDir.z) + Math.sin(this.lookScanPhase) * 0.24;
        if (this.suspicionTimer > 0 && this.suspiciousPos) {
          const sd = this._tmpVec2.copy(this.suspiciousPos).sub(this.position);
          targetAngle = Math.atan2(sd.x, sd.z);
        } else if (currentNode?.coverAngle !== undefined) {
          targetAngle = currentNode.coverAngle;
        }

        this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, targetAngle, 11, dt);
        this.char.group.position.copy(this.position);

        if (actualSpeed < 0.35) {
          this.char.playAnimation('idle', 0.15);
        } else if (actualSpeed < 4.1) {
          this.char.playAnimation('walk', 0.15);
          if (this.char.act['walk']) {
            this.char.act['walk'].timeScale = THREE.MathUtils.clamp(actualSpeed / 3.8, 0.5, 1.3);
          }
        } else {
          this.char.playAnimation('run', 0.15);
          if (this.char.act['run']) {
            this.char.act['run'].timeScale = THREE.MathUtils.clamp(actualSpeed / 5.1, 0.6, 1.25);
          }
        }
        return;
      }
    }

    // Holding sniper perch / post-plant / anchor angle at destination (scanning corners naturally!)
    if (this.lastKnownEnemyPos) {
      const d = this._tmpVec1.copy(this.lastKnownEnemyPos).sub(this.position);
      if (d.lengthSq() > 0.2) {
        const scan = Math.sin(this.lookScanPhase * 0.8) * 0.16;
        this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, Math.atan2(d.x, d.z) + scan, 8, dt);
      }
    } else if (this.state.role === 'sniper' && this.assignedSniperPerch) {
      const scan = Math.sin(this.lookScanPhase * 0.55) * 0.14;
      this.char.group.rotation.y = THREE.MathUtils.damp(
        this.char.group.rotation.y,
        this.assignedSniperPerch.coverAngle + scan,
        7,
        dt
      );
      this.char.playAnimation('crouch', 0.2);
      return;
    } else {
      const scan = Math.sin(this.lookScanPhase * 0.7) * 0.35;
      this.char.group.rotation.y = THREE.MathUtils.damp(
        this.char.group.rotation.y,
        this.char.group.rotation.y + scan * 0.15,
        4,
        dt
      );
    }
    this.char.playAnimation('idle', 0.2);
  }

  private selectStrategicTargetNodeId(
    navNodes: Record<string, NavNode>,
    isBombPlanted: boolean,
    bombPos: THREE.Vector3 | undefined,
    siteA: { center: THREE.Vector3; radius: number } | undefined,
    siteB: { center: THREE.Vector3; radius: number } | undefined,
    playerInfo: PlayerVisionInfo | undefined,
    otherBots: BotController[] | undefined,
    mapProfile?: TacticalMapProfile
  ): string {
    const fallbackA = mapProfile?.siteANodeId || 'site_a';
    const fallbackB = mapProfile?.siteBNodeId || 'site_b';

    if (this.team === 'gang') {
      if (isBombPlanted && bombPos) {
        const isSiteB = siteB ? bombPos.distanceTo(siteB.center) < 18 : false;
        const pool = isSiteB
          ? mapProfile?.postPlantNodesB ?? [fallbackB]
          : mapProfile?.postPlantNodesA ?? [fallbackA];

        if (!this.postPlantTargetNodeId) {
          const takenIds = new Set(
            (otherBots || [])
              .filter((a) => a.id !== this.id && a.state.isAlive && a.team === 'gang')
              .map((a) => a.postPlantTargetNodeId)
              .filter(Boolean)
          );
          const unused = pool.filter((id) => !takenIds.has(id) && navNodes[id]);
          const pickPool = unused.length > 0 ? unused : pool.filter((id) => navNodes[id]);
          if (pickPool.length > 0) {
            this.postPlantTargetNodeId = pickPool[Math.floor(Math.random() * pickPool.length)];
          }
        }
        return this.postPlantTargetNodeId || (isSiteB ? fallbackB : fallbackA);
      }

      // Pre-plant Gang roles: Carrier, Defenders, Attackers
      if (this.state.hasC4 || this.state.role === 'carrier') {
        return this.targetObjective === 'site_b' ? fallbackB : fallbackA;
      }

      if (this.state.role === 'defender') {
        // Escort & protect the C4 carrier!
        if (this.escortTargetId === 'player' && playerInfo?.isAlive && playerInfo.team === 'gang') {
          if (this.position.distanceTo(playerInfo.pos) > 7.5 && mapProfile) {
            return mapProfile.findNearestNodeId(playerInfo.pos);
          }
        } else if (this.escortTargetId && otherBots) {
          const carrier = otherBots.find(
            (b) => b.id === this.escortTargetId && b.state.isAlive && b.team === 'gang'
          );
          if (carrier && this.position.distanceTo(carrier.position) > 8.5 && mapProfile) {
            return mapProfile.findNearestNodeId(carrier.position);
          }
        }
        return this.targetObjective === 'site_b' ? fallbackB : fallbackA;
      }

      // Gang Attacker / Distractor: push assigned distraction/flank node or pinch site
      if (this.assignedPatrolNodeId && navNodes[this.assignedPatrolNodeId]) {
        const patrolNode = navNodes[this.assignedPatrolNodeId];
        if (this.position.distanceTo(patrolNode.pos) > 4.5) {
          return this.assignedPatrolNodeId;
        }
      }
      return this.targetObjective === 'site_b' ? fallbackB : fallbackA;
    }

    // SWAT (Police) Roles: Attackers & Snipers
    if (isBombPlanted && bombPos) {
      const isSiteB = siteB ? bombPos.distanceTo(siteB.center) < 18 : false;
      const siteNode = isSiteB ? fallbackB : fallbackA;

      // Snipers hold retake overwatch unless needed closely to defuse!
      if (this.state.role === 'sniper' && this.assignedSniperPerch && navNodes[this.assignedSniperPerch.nodeId]) {
        const aliveAttackers = (otherBots || []).filter(
          (b) => b.id !== this.id && b.state.isAlive && b.team === 'swat' && b.state.role === 'attacker'
        ).length;
        const playerSwatAlive = playerInfo?.isAlive && playerInfo.team === 'swat' ? 1 : 0;
        const needSniperToDefuse = aliveAttackers + playerSwatAlive === 0 || this.position.distanceTo(bombPos) < 16;
        if (!needSniperToDefuse) {
          return this.assignedSniperPerch.nodeId;
        }
      }
      return siteNode;
    }

    if (this.state.role === 'sniper') {
      if (this.assignedSniperPerch && navNodes[this.assignedSniperPerch.nodeId]) {
        return this.assignedSniperPerch.nodeId;
      }
      if (mapProfile && mapProfile.sniperPerches.length > 0) {
        return mapProfile.sniperPerches[0].nodeId;
      }
    }

    // SWAT Attacker: push enemy gathering lane / assigned patrol node / threatened site
    if (this.assignedPatrolNodeId && navNodes[this.assignedPatrolNodeId]) {
      const patrolPos = navNodes[this.assignedPatrolNodeId].pos;
      if (this.position.distanceTo(patrolPos) > 4.2) {
        return this.assignedPatrolNodeId;
      }
    }
    return this.targetObjective === 'site_b' ? fallbackB : fallbackA;
  }

  /**
   * Multi-height capsule + surface-step probe: detects walls, low crates, door wings, and sheer cliff ledges ahead.
   */
  private isProbeClear(
    origin: THREE.Vector3,
    dirX: number,
    dirZ: number,
    checkDist: number,
    colliders: BoxCollider[],
    ramps: RampZone[]
  ): boolean {
    const steps = checkDist > 1.0 ? 3 : 2;
    let curY = origin.y;
    for (let s = 1; s <= steps; s++) {
      const dist = (checkDist * s) / steps;
      const px = origin.x + dirX * dist;
      const pz = origin.z + dirZ * dist;
      const nextY = getSurfaceHeightAt(px, pz, curY + 0.45, colliders, ramps, 0.36);
      const dy = nextY - curY;
      if (dy > 0.56 || dy < -1.25) {
        return false;
      }
      if (!isCapsulePositionWalkable(px, nextY, pz, colliders, 0.44)) {
        return false;
      }
      curY = nextY;
    }
    return true;
  }

  /**
   * Scans a fan of angles around `desiredDir` at full body height and picks the cleanest obstacle-free steering vector.
   */
  private computeClearMoveDirection(
    desiredDir: THREE.Vector3,
    colliders: BoxCollider[],
    ramps: RampZone[],
    out: THREE.Vector3
  ) {
    out.copy(desiredDir);
    out.y = 0;
    const lenSq = out.lengthSq();
    if (lenSq < 0.0001) {
      out.set(0, 0, 1);
      return;
    }
    if (Math.abs(lenSq - 1) > 0.001) out.divideScalar(Math.sqrt(lenSq));

    // Fast path: straight ahead is completely clear up to 1.35m
    if (this.isProbeClear(this.position, out.x, out.z, 1.35, colliders, ramps)) {
      return;
    }

    const baseAng = Math.atan2(out.x, out.z);
    const s = this.preferredAvoidSide;
    const candidateOffsets = [
      s * 0.42,
      -s * 0.42,
      s * 0.82,
      -s * 0.82,
      s * 1.22,
      -s * 1.22,
      s * 1.57,
      -s * 1.57
    ];

    for (let i = 0; i < candidateOffsets.length; i++) {
      const ang = baseAng + candidateOffsets[i];
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      if (this.isProbeClear(this.position, dx, dz, 1.3, colliders, ramps)) {
        this.preferredAvoidSide = candidateOffsets[i] >= 0 ? 1 : -1;
        out.set(dx, 0, dz);
        return;
      }
    }

    // Fallback shorter probe (0.75m) in case bot is tight in a doorway or corner
    for (let i = 0; i < candidateOffsets.length; i++) {
      const ang = baseAng + candidateOffsets[i];
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      if (this.isProbeClear(this.position, dx, dz, 0.72, colliders, ramps)) {
        this.preferredAvoidSide = candidateOffsets[i] >= 0 ? 1 : -1;
        out.set(dx, 0, dz);
        return;
      }
    }
  }

  public resolveWallCollision(pos: THREE.Vector3, colliders: BoxCollider[]) {
    const botRadius = 0.44;
    const botHeight = 1.8;
    const stepUpLimit = 0.55;

    for (let pass = 0; pass < 2; pass++) {
      let pushed = false;
      for (const c of colliders) {
        if (
          pos.x + botRadius > c.min.x &&
          pos.x - botRadius < c.max.x &&
          pos.z + botRadius > c.min.z &&
          pos.z - botRadius < c.max.z &&
          pos.y + stepUpLimit < c.max.y &&
          pos.y + botHeight > c.min.y
        ) {
          const overlapX1 = pos.x + botRadius - c.min.x;
          const overlapX2 = c.max.x - (pos.x - botRadius);
          const overlapZ1 = pos.z + botRadius - c.min.z;
          const overlapZ2 = c.max.z - (pos.z - botRadius);

          const minOverlapX = Math.min(overlapX1, overlapX2);
          const minOverlapZ = Math.min(overlapZ1, overlapZ2);

          if (minOverlapX < minOverlapZ) {
            if (overlapX1 < overlapX2) pos.x = c.min.x - botRadius;
            else pos.x = c.max.x + botRadius;
          } else {
            if (overlapZ1 < overlapZ2) pos.z = c.min.z - botRadius;
            else pos.z = c.max.z + botRadius;
          }
          pushed = true;
        }
      }
      if (!pushed) break;
    }
  }

  private evaluateTacticalGrenade(
    colliders: BoxCollider[],
    isBombPlanted: boolean,
    bombPos?: THREE.Vector3,
    siteA?: { center: THREE.Vector3; radius: number },
    siteB?: { center: THREE.Vector3; radius: number },
    playerInfo?: PlayerVisionInfo,
    otherBots?: BotController[],
    activeSmokes?: SmokeVolume[]
  ) {
    if (this.grenadeCooldown > 0 || this.state.isPlanting || this.state.isDefusing) return;
    if (!this.hasHEGrenade && !this.hasSmokeGrenade) return;

    const alreadySmokedNear = (pt: THREE.Vector3) =>
      Boolean(activeSmokes?.some((s) => s.center.distanceTo(pt) < 5.0));

    // 1. TACTICAL SMOKE GRENADE (Cover defuse, cover plant/site entry, help hurt ally, disengage sniper)
    if (this.hasSmokeGrenade) {
      let smokeTarget: THREE.Vector3 | null = null;

      if (this.team === 'swat' && isBombPlanted && bombPos) {
        const dBomb = this.position.distanceTo(bombPos);
        if (dBomb > 6 && dBomb < 20 && !alreadySmokedNear(bombPos)) {
          smokeTarget = bombPos.clone();
        }
      } else if (this.team === 'gang' && !isBombPlanted) {
        const site = this.targetObjective === 'site_b' ? siteB : siteA;
        if (site) {
          const dSite = this.position.distanceTo(site.center);
          if (dSite > 9 && dSite < 23 && !alreadySmokedNear(site.center) && (this.suspicionTimer > 0 || this.state.role === 'defender')) {
            smokeTarget = site.center.clone();
          }
        }
      }

      // Cover a teammate who needs help or cover self when low HP against ranged threat
      if (!smokeTarget && this.nearbyAllyNeedsHelpPos && !alreadySmokedNear(this.nearbyAllyNeedsHelpPos)) {
        const midHelp = this.position.clone().lerp(this.nearbyAllyNeedsHelpPos, 0.55);
        if (this.position.distanceTo(midHelp) > 7 && !alreadySmokedNear(midHelp)) {
          smokeTarget = midHelp;
        }
      }

      if (!smokeTarget && this.targetEnemy && this.targetEnemy.dist > 13 && this.targetEnemy.dist < 28 && this.state.health < 76) {
        const midPt = this.position.clone().lerp(this.targetEnemy.pos, 0.58);
        if (!alreadySmokedNear(midPt)) {
          smokeTarget = midPt;
        }
      }

      if (smokeTarget && this.tryThrowBallisticGrenade('smokegrenade', smokeTarget, colliders)) {
        this.hasSmokeGrenade = false;
        this.grenadeCooldown = 6.5;
        return;
      }
    }

    // 2. TACTICAL HE GRENADE (Flush enemy cover, counter enemy clusters, exploit Nemesis HE vulnerability)
    const heEager = (this.nemesisAdvice?.hePriority ?? 0) > 0.35;
    if (this.hasHEGrenade && (!this.targetEnemy || heEager)) {
      const candidatePos =
        this.lastKnownEnemyPos ||
        (this.priorityTargetReason === 'cluster' ? this.priorityTargetPos : null) ||
        (this.suspicionTimer > 1.8 ? this.suspiciousPos : null);

      if (candidatePos) {
        const dist = this.position.distanceTo(candidatePos);
        if (dist >= 8.5 && dist <= 26) {
          let allyTooClose = false;
          if (playerInfo && playerInfo.isAlive && playerInfo.team === this.team && playerInfo.pos.distanceTo(candidatePos) < 5.8) {
            allyTooClose = true;
          }
          if (!allyTooClose && otherBots) {
            allyTooClose = otherBots.some(
              (b) => b.id !== this.id && b.state.isAlive && b.team === this.team && b.position.distanceTo(candidatePos) < 5.8
            );
          }

          if (!allyTooClose && this.tryThrowBallisticGrenade('hegrenade', candidatePos, colliders)) {
            this.hasHEGrenade = false;
            this.grenadeCooldown = 7.5;
          }
        }
      }
    }
  }

  private tryThrowBallisticGrenade(
    type: 'hegrenade' | 'smokegrenade',
    targetPos: THREE.Vector3,
    colliders: BoxCollider[]
  ): boolean {
    const origin = new THREE.Vector3(this.position.x, this.position.y + 1.58, this.position.z);
    const dx = targetPos.x - origin.x;
    const dy = targetPos.y + 0.35 - origin.y;
    const dz = targetPos.z - origin.z;
    const horizDist = Math.hypot(dx, dz);
    if (horizDist < 5 || horizDist > 29) return false;

    const midArcPoint = origin.clone().lerp(targetPos, 0.35);
    midArcPoint.y = Math.max(origin.y, targetPos.y) + 2.1;
    if (!this.hasLineOfSight(this.position, midArcPoint, colliders)) {
      return false;
    }

    const gravity = 18.0;
    const flightTime = THREE.MathUtils.clamp(horizDist / 15.0, 0.55, 1.45);
    const velocity = new THREE.Vector3(
      dx / flightTime,
      (dy + 0.5 * gravity * flightTime * flightTime) / flightTime,
      dz / flightTime
    );

    const throwDir = new THREE.Vector3(dx, 0, dz).normalize();
    origin.addScaledVector(throwDir, 0.55);

    this.onThrowGrenade?.(this, type, origin, velocity);
    return true;
  }

  public hasLineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    colliders: BoxCollider[],
    smokes?: SmokeVolume[]
  ): boolean {
    const fromHead = this._losFrom.set(from.x, from.y + 1.48, from.z);
    const toHead = this._losTo.set(to.x, to.y + 1.48, to.z);
    const diff = this._losDiff.copy(toHead).sub(fromHead);
    const targetDist = diff.length();
    if (targetDist < 0.001) return true;
    const dir = this._losDir.copy(diff).divideScalar(targetDist);

    const minX = Math.min(fromHead.x, toHead.x);
    const maxX = Math.max(fromHead.x, toHead.x);
    const minY = Math.min(fromHead.y, toHead.y);
    const maxY = Math.max(fromHead.y, toHead.y);
    const minZ = Math.min(fromHead.z, toHead.z);
    const maxZ = Math.max(fromHead.z, toHead.z);

    this._losRay.set(fromHead, dir);
    const box = this._losBox;
    const hitPoint = this._losHit;

    for (const c of colliders) {
      if (
        c.max.x < minX ||
        c.min.x > maxX ||
        c.max.z < minZ ||
        c.min.z > maxZ ||
        c.max.y < minY ||
        c.min.y > maxY
      ) {
        continue;
      }
      box.set(c.min, c.max);
      const hit = this._losRay.intersectBox(box, hitPoint);
      if (hit && hit.distanceTo(fromHead) < targetDist - 0.4) {
        return false;
      }
    }

    if (smokes && smokes.length > 0) {
      const segSq = targetDist * targetDist;
      const toSmoke = this._losToSmoke;
      const closest = this._losClosest;
      for (const s of smokes) {
        toSmoke.copy(s.center).sub(fromHead);
        const t = THREE.MathUtils.clamp(toSmoke.dot(diff) / segSq, 0, 1);
        closest.copy(fromHead).addScaledVector(diff, t);
        const rx = closest.x - s.center.x;
        const ry = (closest.y - (s.center.y + 1.15)) * 0.65;
        const rz = closest.z - s.center.z;
        const rad = s.radius * 0.92;
        if (rx * rx + ry * ry + rz * rz < rad * rad) {
          return false;
        }
      }
    }

    return true;
  }
}
