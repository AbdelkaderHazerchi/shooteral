import * as THREE from 'three';
import { sound } from '../audio/SoundEffects';
import { buildCharacter, CharacterInstance } from '../character/CharacterBuilder';
import { BoxCollider, getSurfaceHeightAt, NavNode, RampZone } from '../maps/MapBuilder';
import { WEAPONS, WeaponStats } from '../weapons/WeaponData';

export type BotRole = 'rusher' | 'flanker' | 'anchor' | 'escort' | 'awper';

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
  team: 'gang' | 'swat';
  isAlive: boolean;
  isRunning?: boolean;
  isCrouching?: boolean;
}

export interface SmokeVolume {
  center: THREE.Vector3;
  radius: number;
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

export class BotController {
  public id: string;
  public name: string;
  public team: 'gang' | 'swat';
  public char: CharacterInstance;
  public state: BotState;

  public position: THREE.Vector3 = new THREE.Vector3();
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public currentWaypointIndex: number = 0;
  public currentPath: THREE.Vector3[] = [];
  public currentPathNodeIds: string[] = [];

  // Vertical Weapon Aim Pitch (for multi-level elevation fights)
  public pitch: number = 0;

  // Tactical CS State
  public targetObjective: 'site_a' | 'site_b' = 'site_a';
  public lastSpottedTime: number = 0;
  private targetEnemy: { pos: THREE.Vector3; isPlayer: boolean; id: string; dist: number; isCrouching?: boolean } | null = null;
  private lastKnownEnemyPos: THREE.Vector3 | null = null;
  private thinkTimer: number = 0;
  private shootTimer: number = 0;
  private burstCount: number = 0;
  private maxBurst: number = 3;
  private burstPauseTimer: number = 0;
  private postPlantTargetNodeId: string | null = null;

  // Human Skill, Aim Error & Ballistic Spread Profile
  public difficultyLevel: number = 1;
  private aimTalentOffset: number = (Math.random() - 0.5) * 0.12;
  private aimSkill: number = 0.62; // Scales dynamically with progressive round difficulty
  private aimSwayPhase: number = Math.random() * Math.PI * 2;
  private reactionDelayTimer: number = 0;
  private reactionTimeThreshold: number = 0.36;
  private aimTrackingError: THREE.Vector2 = new THREE.Vector2();

  // Squad Teamwork & Coordination
  private squadLaneOffset: number = 0; // Prevents 5 bots walking single-file on identical paths
  private tacticalHoldTimer: number = 0; // Regroup / guard-planter / cover-defuser hold timer
  private guardFacingAngle: number | null = null;

  // Sound & Radio Callout Awareness
  private suspiciousPos: THREE.Vector3 | null = null;
  private suspicionTimer: number = 0;

  // Stuck Detection & Obstacle Avoidance
  private lastStuckCheckPos: THREE.Vector3 = new THREE.Vector3();
  private stuckTimer: number = 0;
  private avoidanceSteer: THREE.Vector3 = new THREE.Vector3();
  private avoidanceTimer: number = 0;

  // Counter-strafing & tactical crouch
  private strafeTimer: number = 0;
  private strafeDir: number = 1;
  private isCrouchingCombat: boolean = false;
  private reloadTimer: number = 0;
  private radioCooldown: number = 0;

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
  public onDeath?: (bot: BotController) => void;
  public onEnemySpotted?: (bot: BotController, enemyPos: THREE.Vector3) => void;

  constructor(id: string, name: string, team: 'gang' | 'swat', scene: THREE.Scene, role: BotRole = 'rusher') {
    this.id = id;
    this.name = name;
    this.team = team;
    this.aimSkill = THREE.MathUtils.clamp(0.58 + this.aimTalentOffset, 0.54, 0.95);
    this.squadLaneOffset = (Math.random() - 0.5) * 1.4;

    this.char = buildCharacter(team, name);
    scene.add(this.char.group);

    const defaultWp = team === 'gang' ? WEAPONS.glock : WEAPONS.usp;
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
  }

  public equipRoundWeapon(roundNum: number, role: BotRole, difficultyLevel: number = 1) {
    let wp: WeaponStats;
    if (roundNum === 1) {
      wp = this.team === 'gang' ? WEAPONS.glock : WEAPONS.usp;
      this.state.armor = difficultyLevel >= 4 ? 70 : 50;
      this.state.hasHelmet = false;
    } else if (roundNum === 2) {
      if (difficultyLevel >= 5 && role !== 'awper' && Math.random() < 0.45) {
        wp = this.team === 'gang' ? WEAPONS.ak47 : WEAPONS.m4a1;
      } else {
        wp = Math.random() < (difficultyLevel >= 3 ? 0.78 : 0.65) ? WEAPONS.mp5 : WEAPONS.deagle;
      }
      this.state.armor = difficultyLevel >= 3 ? 100 : 80;
      this.state.hasHelmet = difficultyLevel >= 4;
    } else {
      if (role === 'awper') {
        wp = WEAPONS.awp;
      } else {
        wp = this.team === 'gang' ? WEAPONS.ak47 : WEAPONS.m4a1;
      }
      this.state.armor = 100;
      this.state.hasHelmet = true;
    }
    this.state.weapon = { ...wp };
    this.state.currentAmmo = wp.magazineSize;

    // Tactical grenade allocation (eco-aware, never random spam)
    if (roundNum === 1) {
      this.hasHEGrenade = false;
      this.hasSmokeGrenade = (role === 'escort' || role === 'flanker') && Math.random() < 0.4;
    } else {
      this.hasHEGrenade = Math.random() < (difficultyLevel >= 3 ? 0.78 : 0.58);
      this.hasSmokeGrenade = Math.random() < (difficultyLevel >= 2 ? 0.78 : 0.55);
    }
  }

  public resetRound(
    spawnPos: THREE.Vector3,
    hasC4 = false,
    objective: 'site_a' | 'site_b' = 'site_a',
    role: BotRole = 'rusher',
    roundNum = 1,
    difficultyLevel = 1
  ) {
    this.difficultyLevel = Math.max(1, difficultyLevel);
    const diffStep = this.difficultyLevel - 1;
    this.aimSkill = THREE.MathUtils.clamp(0.58 + diffStep * 0.034 + this.aimTalentOffset, 0.54, 0.95);

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

    this.targetObjective = objective;
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
    this.grenadeCooldown = 3.5 + Math.random() * 4.5;
    this.followPlayerTimer = 0;
    this.manualHoldTimer = 0;
    this.manualHoldAngle = null;
    this.retreatTimer = 0;
    this.reactionDelayTimer = 0;
    this.reactionTimeThreshold = Math.max(0.14, 0.42 - diffStep * 0.025) + Math.random() * 0.08;
    this.burstCount = 0;
    this.burstPauseTimer = 0;
    this.strafeTimer = 0;
    this.stuckTimer = 0;
    this.avoidanceTimer = 0;
    this.radioCooldown = 0;
    this.lastSpottedTime = 0;
    this.lastStuckCheckPos.copy(this.position);

    this.char.playAnimation('idle');
  }

  private resetBonesPitch() {
    if (this.char.by['chest']) this.char.by['chest'].rotation.x = 0;
    if (this.char.by['weapon']) this.char.by['weapon'].rotation.x = 0;
    if (this.char.by['head']) this.char.by['head'].rotation.x = 0;
  }

  public takeDamage(amount: number, isHeadshot = false, attackerPos?: THREE.Vector3): boolean {
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

    // Immediately alert & orient toward flank/rear attacker with realistic turn error
    if (attackerPos) {
      this.suspiciousPos = attackerPos.clone();
      this.suspicionTimer = 5.0;
      this.reactionDelayTimer = Math.max(this.reactionDelayTimer, 0.12);
      this.aimTrackingError.set((Math.random() - 0.5) * 0.28, (Math.random() - 0.5) * 0.14);
      this.state.isPlanting = false;
      this.state.isDefusing = false;
    }

    if (this.state.health < 45) {
      this.isCrouchingCombat = true;
    }

    if (this.state.health <= 0) {
      this.state.isAlive = false;
      this.state.deaths++;
      this.state.isPlanting = false;
      this.state.isDefusing = false;
      this.resetBonesPitch();
      this.char.playAnimation('death', 0.1);
      this.onDeath?.(this);
    }
    return !this.state.isAlive;
  }

  public alertToGunfire(pos: THREE.Vector3) {
    if (!this.state.isAlive) return;
    const dist = this.position.distanceTo(pos);
    if (dist < 36) {
      this.suspiciousPos = pos.clone();
      this.suspicionTimer = 4.2;
    }
  }

  /**
   * Squad Radio Callout when a teammate spots enemies or bomb!
   */
  public receiveRadioCallout(enemyPos: THREE.Vector3, siteHint?: 'site_a' | 'site_b', isUrgentTrade = false) {
    if (!this.state.isAlive) return;
    this.suspiciousPos = enemyPos.clone();
    this.suspicionTimer = isUrgentTrade ? 6.0 : 4.8;
    this.lastKnownEnemyPos = enemyPos.clone();
    if (siteHint && this.team === 'swat' && !this.targetEnemy) {
      this.targetObjective = siteHint;
      this.currentPath = []; // Rotate cleanly to reinforced site
    }
  }

  /**
   * Trade-kill instinct when a nearby squadmate is eliminated.
   */
  public notifyAllyDown(deadAllyPos: THREE.Vector3) {
    if (!this.state.isAlive) return;
    if (this.position.distanceTo(deadAllyPos) < 30) {
      this.suspiciousPos = deadAllyPos.clone();
      this.suspicionTimer = 5.5;
      this.tacticalHoldTimer = 0;
    }
  }

  /**
   * Gang squad alert when CT begins defusing planted C4.
   */
  public alertDefuseInProgress(bombPos: THREE.Vector3) {
    if (!this.state.isAlive || this.team !== 'gang') return;
    this.suspiciousPos = bombPos.clone();
    this.suspicionTimer = 6.0;
    this.postPlantTargetNodeId = null;
    this.manualHoldTimer = 0;
    this.currentPath = [bombPos.clone()];
    this.currentPathNodeIds = [];
    this.currentWaypointIndex = 0;
  }

  /**
   * Executes a tactical radio command issued by the human teammate.
   */
  public applyPlayerOrder(
    order: RadioOrderType,
    playerPos: THREE.Vector3,
    playerLookDir: THREE.Vector3,
    aimPos: THREE.Vector3,
    navNodes: Record<string, NavNode>,
    colliders: BoxCollider[],
    assignFollowSlot: boolean = true
  ) {
    if (!this.state.isAlive) return;
    const distToPlayer = this.position.distanceTo(playerPos);

    switch (order) {
      case 'fall_back': {
        this.manualHoldTimer = 0;
        this.followPlayerTimer = 0;
        this.retreatTimer = 7.5;
        this.suspicionTimer = 0;
        this.lastKnownEnemyPos = null;
        this.postPlantTargetNodeId = null;
        const fallbackNodeId = this.team === 'gang' ? 't_spawn' : 'ct_spawn';
        if (navNodes[fallbackNodeId]) {
          this.planPath(navNodes, fallbackNodeId, colliders);
        }
        break;
      }
      case 'defend_me': {
        this.manualHoldTimer = 0;
        this.retreatTimer = 0;
        this.suspiciousPos = playerPos.clone();
        this.suspicionTimer = 8.0;
        if (distToPlayer < 42) {
          this.followPlayerTimer = 11.0;
          this.planPathToWorldPos(playerPos, navNodes, colliders);
        }
        break;
      }
      case 'follow_me': {
        if (!assignFollowSlot) break;
        this.manualHoldTimer = 0;
        this.retreatTimer = 0;
        this.followPlayerTimer = 16.0;
        this.planPathToWorldPos(playerPos, navNodes, colliders);
        break;
      }
      case 'hold_here': {
        if (distToPlayer < 34) {
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
        if (this.position.distanceTo(aimPos) < 38) {
          this.planPathToWorldPos(aimPos, navNodes, colliders);
        }
        break;
      }
      case 'need_backup': {
        this.manualHoldTimer = 0;
        this.retreatTimer = 0;
        this.suspiciousPos = playerPos.clone();
        this.suspicionTimer = 8.5;
        this.followPlayerTimer = 9.0;
        this.planPathToWorldPos(playerPos, navNodes, colliders);
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
        this.planPath(navNodes, 'site_a', colliders);
        break;
      }
      case 'go_b': {
        this.targetObjective = 'site_b';
        this.manualHoldTimer = 0;
        this.followPlayerTimer = 0;
        this.retreatTimer = 0;
        this.postPlantTargetNodeId = null;
        this.planPath(navNodes, 'site_b', colliders);
        break;
      }
    }
  }

  private planPathToWorldPos(targetPos: THREE.Vector3, navNodes: Record<string, NavNode>, colliders: BoxCollider[]) {
    if (this.position.distanceTo(targetPos) < 16 && this.hasLineOfSight(this.position, targetPos, colliders)) {
      this.currentPath = [targetPos.clone()];
      this.currentPathNodeIds = [];
      this.currentWaypointIndex = 0;
      return;
    }

    let nearestNode: NavNode | null = null;
    let bestDist = Infinity;
    Object.values(navNodes).forEach((n) => {
      const d = n.pos.distanceTo(targetPos);
      if (d < bestDist) {
        bestDist = d;
        nearestNode = n;
      }
    });

    if (nearestNode) {
      this.planPath(navNodes, (nearestNode as NavNode).id, colliders);
      this.currentPath.push(targetPos.clone());
    }
  }

  /**
   * Weighted Dijkstra Shortest Pathfinding using 3D distances + Line-of-Sight start penalty.
   */
  public planPath(navNodes: Record<string, NavNode>, targetNodeId: string, colliders?: BoxCollider[]) {
    let nearestStart: NavNode | null = null;
    let bestStartScore = Infinity;
    Object.values(navNodes).forEach((node) => {
      const d = this.position.distanceTo(node.pos);
      const wallPenalty = colliders && d < 28 && !this.hasLineOfSight(this.position, node.pos, colliders) ? 18 : 0;
      const score = d + wallPenalty;
      if (score < bestStartScore) {
        bestStartScore = score;
        nearestStart = node;
      }
    });

    if (!nearestStart || !navNodes[targetNodeId]) return;
    const startId = (nearestStart as NavNode).id;

    const distances: Record<string, number> = {};
    const prev: Record<string, string | null> = {};
    const unvisited = new Set<string>(Object.keys(navNodes));

    Object.keys(navNodes).forEach((id) => {
      distances[id] = Infinity;
      prev[id] = null;
    });
    distances[startId] = 0;

    while (unvisited.size > 0) {
      let currentId: string | null = null;
      let bestDist = Infinity;
      unvisited.forEach((id) => {
        if (distances[id] < bestDist) {
          bestDist = distances[id];
          currentId = id;
        }
      });

      if (!currentId || bestDist === Infinity) break;
      unvisited.delete(currentId);
      if (currentId === targetNodeId) break;

      const curNode = navNodes[currentId];
      for (const nextId of curNode.connections) {
        if (!unvisited.has(nextId) || !navNodes[nextId]) continue;
        const edgeWeight = curNode.pos.distanceTo(navNodes[nextId].pos);
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
    activeSmokes?: SmokeVolume[]
  ) {
    this.char.mixer.update(dt);
    if (!this.state.isAlive) return;

    this.thinkTimer += dt;
    this.shootTimer += dt;
    this.aimSwayPhase += dt * 3.1;
    if (this.suspicionTimer > 0) this.suspicionTimer -= dt;
    if (this.avoidanceTimer > 0) this.avoidanceTimer -= dt;
    if (this.burstPauseTimer > 0) this.burstPauseTimer -= dt;
    if (this.radioCooldown > 0) this.radioCooldown -= dt;
    if (this.tacticalHoldTimer > 0) this.tacticalHoldTimer -= dt;
    if (this.grenadeCooldown > 0) this.grenadeCooldown -= dt;
    if (this.followPlayerTimer > 0) this.followPlayerTimer -= dt;
    if (this.manualHoldTimer > 0) this.manualHoldTimer -= dt;
    if (this.retreatTimer > 0) this.retreatTimer -= dt;

    // Reloading
    if (this.state.isReloading) {
      this.reloadTimer += dt;
      if (this.reloadTimer >= this.state.weapon.reloadTime) {
        this.state.isReloading = false;
        this.state.currentAmmo = this.state.weapon.magazineSize;
        this.reloadTimer = 0;
      }
    }

    // 1. AUDIO PERIMETER AWARENESS (Scales with difficulty; silent walk/crouch undetectable!)
    const hearRadius = Math.min(21.0, 13.5 + (this.difficultyLevel - 1) * 0.65);
    if (playerInfo && playerInfo.isAlive && playerInfo.team !== this.team) {
      const distToPlayer = this.position.distanceTo(playerInfo.pos);
      if (playerInfo.isRunning && distToPlayer < hearRadius) {
        this.suspiciousPos = playerInfo.pos.clone();
        this.suspicionTimer = 2.8;
      }
    }

    // 2. REALISTIC FOV SIGHT CHECK (Respects active smoke volumes!) & SQUAD TACTICAL ROUTING
    const thinkInterval = Math.max(0.09, 0.17 - (this.difficultyLevel - 1) * 0.008);
    if (this.thinkTimer > thinkInterval) {
      this.thinkTimer = 0;
      let detectedEnemy: { pos: THREE.Vector3; isPlayer: boolean; id: string; dist: number; isCrouching?: boolean } | null = null;
      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.char.group.rotation.y);

      if (playerInfo && playerInfo.isAlive && playerInfo.team !== this.team) {
        const d = this.position.distanceTo(playerInfo.pos);
        if (d < 58) {
          const toTarget = playerInfo.pos.clone().sub(this.position).normalize();
          const dot = forward.dot(toTarget);

          const canSee =
            dot > 0.54 ||
            (dot > 0.18 && d < 8) ||
            (this.suspicionTimer > 0 && dot > 0.08 && d < 26);

          if (canSee && this.hasLineOfSight(this.position, playerInfo.pos, colliders, activeSmokes)) {
            detectedEnemy = {
              pos: playerInfo.pos.clone(),
              isPlayer: true,
              id: 'player',
              dist: d,
              isCrouching: playerInfo.isCrouching
            };
          }
        }
      }

      if (!detectedEnemy && otherBots) {
        let closestDist = Infinity;
        for (const b of otherBots) {
          if (b.state.isAlive && b.team !== this.team) {
            const d = this.position.distanceTo(b.position);
            if (d < 58 && d < closestDist) {
              const toTarget = b.position.clone().sub(this.position).normalize();
              const dot = forward.dot(toTarget);
              const canSee =
                dot > 0.54 ||
                (dot > 0.18 && d < 8) ||
                (this.suspicionTimer > 0 && dot > 0.08 && d < 26);

              if (canSee && this.hasLineOfSight(this.position, b.position, colliders, activeSmokes)) {
                closestDist = d;
                detectedEnemy = {
                  pos: b.position.clone(),
                  isPlayer: false,
                  id: b.id,
                  dist: d,
                  isCrouching: b.isCrouchingCombat
                };
              }
            }
          }
        }
      }

      if (detectedEnemy && !this.targetEnemy) {
        // Fresh contact: realistic human initial aim acquisition error
        const errMag = 0.14 + (1 - this.aimSkill) * 0.26;
        this.aimTrackingError.set(
          (Math.random() - 0.5) * errMag * 2,
          (Math.random() - 0.5) * errMag * 1.1
        );
      }
      this.targetEnemy = detectedEnemy;

      if (detectedEnemy) {
        this.lastKnownEnemyPos = detectedEnemy.pos.clone();
        if (this.radioCooldown <= 0) {
          this.radioCooldown = 2.6;
          this.onEnemySpotted?.(this, detectedEnemy.pos.clone());
        }
      } else {
        this.reactionDelayTimer = 0;
      }

      // ============================================================
      // SQUAD OBJECTIVE COORDINATION (Gang Escort/Guard vs SWAT Retake)
      // ============================================================
      this.guardFacingAngle = null;
      const allies = otherBots?.filter((b) => b.id !== this.id && b.state.isAlive && b.team === this.team) || [];

      if (this.team === 'gang') {
        const plantingAlly = allies.find((b) => b.state.isPlanting);
        if (plantingAlly && this.position.distanceTo(plantingAlly.position) < 20) {
          // TEAMWORK: Cover the C4 planter! Hold outer angle facing away from planter toward threats
          this.tacticalHoldTimer = 0.5;
          const outDir = this.suspiciousPos
            ? this.suspiciousPos.clone().sub(this.position)
            : this.position.clone().sub(plantingAlly.position);
          if (outDir.lengthSq() > 0.1) {
            this.guardFacingAngle = Math.atan2(outDir.x, outDir.z);
          }
        }
      } else if (this.team === 'swat' && isBombPlanted && bombPos) {
        const defusingAlly = allies.find((b) => b.state.isDefusing);
        if (defusingAlly && this.position.distanceTo(bombPos) < 16) {
          // TEAMWORK: Cover the defusing teammate! Hold defensive angle facing entrances/last-known threats
          this.tacticalHoldTimer = 0.5;
          const outDir = this.suspiciousPos
            ? this.suspiciousPos.clone().sub(this.position)
            : this.position.clone().sub(defusingAlly.position);
          if (outDir.lengthSq() > 0.1) {
            this.guardFacingAngle = Math.atan2(outDir.x, outDir.z);
          }
        }
      }

      // TACTICAL GRENADE DECISION (Smoke choke/defuse cover & HE flushed cover)
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

      // STRATEGIC OBJECTIVE ROUTING
      if (isSeekingDroppedBomb && droppedBombPos) {
        // Nearest Gang bot drops path to retrieve dropped C4
        this.currentPath = [droppedBombPos.clone()];
        this.currentPathNodeIds = [];
        this.currentWaypointIndex = 0;
      } else if (this.followPlayerTimer > 0 && playerInfo && playerInfo.isAlive && playerInfo.team === this.team) {
        const distP = this.position.distanceTo(playerInfo.pos);
        if (distP > 4.6 && (this.currentPath.length === 0 || this.currentWaypointIndex >= this.currentPath.length)) {
          this.planPathToWorldPos(playerInfo.pos, navNodes, colliders);
        }
      } else if (this.manualHoldTimer > 0 || this.retreatTimer > 0) {
        // Keep current retreat path or hold position without resetting to main site
      } else if (this.currentPath.length === 0 || this.currentWaypointIndex >= this.currentPath.length) {
        let targetNode = this.targetObjective === 'site_b' ? 'site_b' : 'site_a';

        if (this.team === 'gang') {
          if (isBombPlanted && bombPos) {
            // Post-plant! Spread across DIFFERENT cover nodes near the planted bomb site
            const siteId = bombPos.distanceTo(siteB?.center || new THREE.Vector3()) < 16 ? 'site_b' : 'site_a';
            const postPlantCandidates = Object.values(navNodes).filter(
              (n) => n.isPostPlant && n.pos.distanceTo(bombPos) < 24
            );
            if (postPlantCandidates.length > 0) {
              if (!this.postPlantTargetNodeId) {
                const takenIds = new Set(allies.map((a) => a.postPlantTargetNodeId).filter(Boolean));
                const unused = postPlantCandidates.filter((c) => !takenIds.has(c.id));
                const pool = unused.length > 0 ? unused : postPlantCandidates;
                const pick = pool[Math.floor(Math.random() * pool.length)];
                this.postPlantTargetNodeId = pick.id;
              }
              targetNode = this.postPlantTargetNodeId;
            } else {
              targetNode = siteId;
            }
          } else {
            // Escorts stay coordinated with C4 carrier's execute site!
            const c4Ally = allies.find((a) => a.state.hasC4);
            if (c4Ally && this.state.role === 'escort') {
              this.targetObjective = c4Ally.targetObjective;
            }
            if (this.state.hasC4 || this.state.role === 'escort' || this.state.role === 'rusher') {
              targetNode = this.targetObjective === 'site_b' ? 'site_b' : 'site_a';
            } else if (this.state.role === 'awper') {
              targetNode = navNodes['t_mid_entry'] ? 't_mid_entry' : 'mid_courtyard';
            } else {
              targetNode = navNodes['mid_xbox'] ? 'mid_xbox' : 'conveyor_hall';
            }
          }
        } else {
          // Police CT tactical defense & retake
          if (isBombPlanted && bombPos) {
            targetNode = bombPos.distanceTo(siteB?.center || new THREE.Vector3()) < 16 ? 'site_b' : 'site_a';
          } else if (this.state.role === 'awper') {
            targetNode = navNodes['ct_mid'] ? 'ct_mid' : navNodes['a_heaven'] ? 'a_heaven' : 'ct_mid_security';
          } else if (this.state.role === 'flanker') {
            targetNode = navNodes['mid_double_doors'] ? 'mid_double_doors' : 'mid_gate_north';
          } else {
            targetNode = this.targetObjective === 'site_b' ? 'site_b' : 'site_a';
          }
        }

        this.planPath(navNodes, targetNode, colliders);
      }
    }

    // ==========================================
    // 3. CS-LEVEL GUNFIGHT WITH HUMAN AIM ERROR & MISSES
    // ==========================================
    if (this.targetEnemy) {
      const urgentDefuseWindow = this.state.hasDefuser ? 6.2 : 9.0;
      if (
        this.team === 'swat' &&
        isBombPlanted &&
        bombPos &&
        bombTimeLeft < urgentDefuseWindow &&
        this.position.distanceTo(bombPos) < 3.0
      ) {
        // Urgent Ninja/Time-critical defuse!
      } else {
        // Human micro-sway baseline that never reaches robotic 0.00 precision
        const swayYaw = Math.sin(this.aimSwayPhase) * (0.045 * (1.2 - this.aimSkill));
        const swayPitch = Math.cos(this.aimSwayPhase * 0.77) * (0.025 * (1.2 - this.aimSkill));

        const lookDir = this.targetEnemy.pos.clone().sub(this.position);
        lookDir.y = 0;
        if (lookDir.lengthSq() > 0.01) {
          const targetRotY = Math.atan2(lookDir.x, lookDir.z) + this.aimTrackingError.x + swayYaw;
          this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, targetRotY, 13, dt);
        }

        // Aim acquisition settles toward sway baseline (scales with difficulty)
        const aimSettleRate = 3.6 + (this.difficultyLevel - 1) * 0.45;
        this.aimTrackingError.x = THREE.MathUtils.damp(this.aimTrackingError.x, swayYaw * 0.5, aimSettleRate, dt);
        this.aimTrackingError.y = THREE.MathUtils.damp(this.aimTrackingError.y, swayPitch * 0.5, aimSettleRate, dt);

        // Vertical Pitch for elevation fights
        const targetAimY =
          this.targetEnemy.pos.y + (this.targetEnemy.isCrouching ? 0.88 : 1.38);
        const diffY = targetAimY - (this.position.y + 1.38);
        const horizDist = Math.max(
          0.1,
          Math.hypot(this.targetEnemy.pos.x - this.position.x, this.targetEnemy.pos.z - this.position.z)
        );
        const targetPitch = Math.atan2(diffY, horizDist) + this.aimTrackingError.y + swayPitch;
        const clampedPitch = Math.max(-0.55, Math.min(0.55, targetPitch));
        this.pitch = THREE.MathUtils.damp(this.pitch, clampedPitch, 12, dt);

        if (this.char.by['chest']) this.char.by['chest'].rotation.x = this.pitch * 0.6;
        if (this.char.by['weapon']) this.char.by['weapon'].rotation.x = this.pitch;
        if (this.char.by['head']) this.char.by['head'].rotation.x = this.pitch * 0.4;

        this.reactionDelayTimer += dt;

        // Reload check
        if (this.state.currentAmmo <= 0 && !this.state.isReloading) {
          this.state.isReloading = true;
          this.reloadTimer = 0;
          sound.playReload();
        }

        // Counter-strafe movement between bursts, or evade while reloading / low HP
        const isFiringBurst =
          this.burstPauseTimer <= 0 &&
          !this.state.isReloading &&
          this.reactionDelayTimer >= this.reactionTimeThreshold;
        this.strafeTimer += dt;
        if (this.strafeTimer > 0.62) {
          this.strafeTimer = 0;
          this.strafeDir *= -1;
          this.isCrouchingCombat = this.state.health < 45 || Math.random() < 0.32;
        }

        const shouldMoveInCombat = !isFiringBurst || this.state.isReloading || this.state.health < 38;
        if (shouldMoveInCombat && !this.isCrouchingCombat) {
          const perp = new THREE.Vector3(-lookDir.z, 0, lookDir.x).normalize();
          const strafeSpeed = this.state.health < 38 ? 3.2 : 2.35;
          const strafeStep = perp.multiplyScalar(this.strafeDir * strafeSpeed * dt);
          const proposedPos = this.position.clone().add(strafeStep);

          this.resolveWallCollision(proposedPos, colliders);
          proposedPos.y = getSurfaceHeightAt(proposedPos.x, proposedPos.z, this.position.y, colliders, ramps, 0.4);
          this.position.copy(proposedPos);
          this.char.group.position.copy(this.position);
        }

        // Ballistic Aim Error Calculation (causes realistic misses & near-miss tracers!)
        const fireCooldown = this.state.weapon.id === 'awp' ? 1.35 : (1 / this.state.weapon.fireRate) * 1.15;
        if (isFiringBurst && this.shootTimer > fireCooldown) {
          this.shootTimer = 0;
          this.burstCount++;

          if (this.burstCount <= this.maxBurst) {
            this.state.currentAmmo--;
            const playerDist = playerInfo ? this.position.distanceTo(playerInfo.pos) : 15;
            const volAtten = Math.max(0.08, 1 - playerDist / 60);
            sound.playGunshot(this.state.weapon.sound, volAtten);

            // Calculate authentic ballistic spread cone in meters at target distance
            const dist = Math.max(1.5, this.targetEnemy.dist);
            const movePenalty = shouldMoveInCombat && !this.isCrouchingCombat ? 1.6 : this.isCrouchingCombat ? 0.68 : 1.0;
            const burstRecoilPenalty = 1.0 + Math.max(0, this.burstCount - 1) * 0.45;
            const trackingMag = Math.abs(this.aimTrackingError.x) + Math.abs(this.aimTrackingError.y);

            // Angular dispersion (radians) -> genuine miss cone!
            const baseConeRad =
              (0.018 + this.state.weapon.spread * 0.95 + (1 - this.aimSkill) * 0.032) *
              movePenalty *
              burstRecoilPenalty +
              trackingMag * 0.45;

            const scatterRadius = dist * baseConeRad;
            // Random polar offset around chest/neck + upward recoil climb on consecutive shots
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.sqrt(Math.random()) * scatterRadius;
            const recoilClimb = Math.max(0, this.burstCount - 1) * dist * this.state.weapon.recoil * 0.85;

            // Tangent right/up basis perpendicular to shot vector
            const shotForward = this.targetEnemy.pos.clone().sub(this.position).normalize();
            const shotRight = new THREE.Vector3(-shotForward.z, 0, shotForward.x).normalize();

            const centerChestY = this.targetEnemy.isCrouching ? 0.78 : 1.24;
            const aimPoint = this.targetEnemy.pos.clone();
            aimPoint.y += centerChestY + Math.sin(angle) * radius * 0.78 + recoilClimb;
            aimPoint.addScaledVector(shotRight, Math.cos(angle) * radius);

            const baseHeadshotChance =
              Math.min(0.24, 0.08 + (this.difficultyLevel - 1) * 0.015) + (this.isCrouchingCombat ? 0.06 : 0);
            const isHeadshotIntent = Math.random() < baseHeadshotChance;
            if (isHeadshotIntent && radius < scatterRadius * 0.45) {
              aimPoint.y = this.targetEnemy.pos.y + (this.targetEnemy.isCrouching ? 1.0 : 1.54);
            }

            this.onShoot?.(aimPoint, isHeadshotIntent, this.targetEnemy.id);
          } else {
            this.burstCount = 0;
            this.maxBurst = this.state.weapon.id === 'awp' ? 1 : 2 + Math.floor(Math.random() * 3);
            this.burstPauseTimer = Math.max(0.15, 0.36 - (this.difficultyLevel - 1) * 0.02) + Math.random() * 0.18;
          }
        }

        this.char.playAnimation(this.isCrouchingCombat ? 'crouch' : 'idle', 0.18);
        return;
      }
    }

    // Reset vertical weapon pitch outside combat
    this.pitch = THREE.MathUtils.damp(this.pitch, 0, 10, dt);
    this.resetBonesPitch();

    // 4. ORIENT TOWARD SOUND / CALLOUT POSITION OR GUARD ANGLE
    if (this.guardFacingAngle !== null) {
      this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, this.guardFacingAngle, 10, dt);
    } else if (this.manualHoldTimer > 0 && this.manualHoldAngle !== null) {
      this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, this.manualHoldAngle, 10, dt);
    } else if (this.suspicionTimer > 0 && this.suspiciousPos) {
      const soundDir = this.suspiciousPos.clone().sub(this.position);
      soundDir.y = 0;
      if (soundDir.lengthSq() > 1.0) {
        const targetRotY = Math.atan2(soundDir.x, soundDir.z);
        this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, targetRotY, 8, dt);
      }
    }

    // Hold position briefly to guard a planting/defusing ally or obey player's "Hold Here" order
    if (this.tacticalHoldTimer > 0 || this.manualHoldTimer > 0) {
      this.char.playAnimation('crouch', 0.18);
      return;
    }

    // Stop moving when closely escorting player without crowding them
    if (this.followPlayerTimer > 0 && playerInfo && playerInfo.isAlive && playerInfo.team === this.team) {
      if (this.position.distanceTo(playerInfo.pos) < 4.2) {
        this.char.playAnimation('idle', 0.2);
        return;
      }
    }

    // 5. BOMB PLANTING (Gang C4 Carrier)
    if (this.team === 'gang' && this.state.hasC4 && !isBombPlanted) {
      const site = this.targetObjective === 'site_b' ? siteB : siteA;
      if (site && this.position.distanceTo(site.center) < site.radius - 1.2) {
        if (!this.state.isPlanting) {
          this.state.isPlanting = true;
          this.state.plantProgress = 0;
          this.char.playAnimation('crouch', 0.2);
        }
        this.state.plantProgress += dt / 3.0;
        if (Math.random() < 0.25) sound.playPlantingKey();

        if (this.state.plantProgress >= 1.0) {
          this.state.isPlanting = false;
          this.state.hasC4 = false;
          this.currentPath = [];
          this.onPlantCompleted?.(this.targetObjective === 'site_b' ? 'B' : 'A', this.position.clone());
        }
        return;
      }
    }

    // 6. BOMB DEFUSING (Police Retake)
    if (this.team === 'swat' && isBombPlanted && bombPos) {
      const distToBomb = this.position.distanceTo(bombPos);
      const someoneElseDefusing = otherBots?.some(
        (b) => b.id !== this.id && b.team === 'swat' && b.state.isAlive && b.state.isDefusing
      );

      if (distToBomb < 2.8 && !someoneElseDefusing) {
        if (!this.state.isDefusing) {
          this.state.isDefusing = true;
          this.state.defuseProgress = 0;
          this.char.playAnimation('crouch', 0.2);
        }
        const defuseDuration = this.state.hasDefuser ? 2.5 : 5.0;
        this.state.defuseProgress += dt / defuseDuration;
        if (Math.random() < 0.25) sound.playDefuseKey();

        if (this.state.defuseProgress >= 1.0) {
          this.state.isDefusing = false;
          this.onDefuseCompleted?.();
        }
        return;
      }
    }

    // 7. WAYPOINT NAVIGATION WITH SQUAD SPREAD, WHISKERS & CORNER PRE-AIM
    if (this.currentPath.length > 0 && this.currentWaypointIndex < this.currentPath.length) {
      const nextWaypoint = this.currentPath[this.currentWaypointIndex];
      const wpNodeId = this.currentPathNodeIds[this.currentWaypointIndex];
      const currentNode = wpNodeId ? navNodes[wpNodeId] : undefined;

      const toWp = nextWaypoint.clone().sub(this.position);
      toWp.y = 0;
      const dist = toWp.length();

      if (dist < 1.85) {
        this.currentWaypointIndex++;
      } else {
        toWp.normalize();

        // Subtle lateral lane dispersion on open paths so teammates don't stack single-file
        if (!currentNode?.isChokepoint && dist > 3.5) {
          const lanePerp = new THREE.Vector3(-toWp.z, 0, toWp.x);
          toWp.addScaledVector(lanePerp, this.squadLaneOffset * 0.12).normalize();
        }

        // Antistuck detection & steering
        this.stuckTimer += dt;
        if (this.stuckTimer > 0.35) {
          this.stuckTimer = 0;
          const movedDist = this.position.distanceTo(this.lastStuckCheckPos);
          this.lastStuckCheckPos.copy(this.position);

          if (movedDist < 0.15) {
            const normal = new THREE.Vector3(-toWp.z, 0, toWp.x);
            this.avoidanceSteer = normal.multiplyScalar(Math.random() < 0.5 ? 1 : -1);
            this.avoidanceTimer = 0.55;
          }
        }

        const moveDir = toWp.clone();
        if (this.avoidanceTimer > 0) {
          moveDir.addScaledVector(this.avoidanceSteer, 1.35).normalize();
        }

        // Whisker obstacle feeler steering
        const forwardFeel = this.position.clone().addScaledVector(moveDir, 1.15);
        forwardFeel.y += 0.9;
        const leftDir = new THREE.Vector3(-moveDir.z, 0, moveDir.x);
        const feelBox = new THREE.Box3();
        let steerSide = 0;
        for (const c of colliders) {
          if (c.max.y < this.position.y + 0.6 || c.min.y > this.position.y + 1.8) continue;
          feelBox.set(c.min, c.max);
          if (feelBox.distanceToPoint(forwardFeel) < 0.62) {
            const pLeft = this.position.clone().addScaledVector(leftDir, 0.9);
            pLeft.y += 0.9;
            const pRight = this.position.clone().addScaledVector(leftDir, -0.9);
            pRight.y += 0.9;
            steerSide += feelBox.distanceToPoint(pLeft) > feelBox.distanceToPoint(pRight) ? 1 : -1;
          }
        }
        if (steerSide !== 0) {
          moveDir.addScaledVector(leftDir, Math.sign(steerSide) * 0.68).normalize();
        }

        // Squad spacing separation
        if (otherBots) {
          const sep = new THREE.Vector3();
          for (const ally of otherBots) {
            if (ally.id !== this.id && ally.state.isAlive && ally.team === this.team) {
              const delta = this.position.clone().sub(ally.position);
              delta.y = 0;
              const d = delta.length();
              if (d > 0.01 && d < 2.1) {
                sep.addScaledVector(delta.normalize(), (2.1 - d) * 0.72);
              }
            }
          }
          if (sep.lengthSq() > 0.001) {
            moveDir.add(sep).normalize();
          }
        }

        const speed = currentNode?.isChokepoint ? 3.9 : 5.1;

        const proposedPos = this.position.clone().addScaledVector(moveDir, speed * dt);
        this.resolveWallCollision(proposedPos, colliders);
        proposedPos.y = getSurfaceHeightAt(proposedPos.x, proposedPos.z, this.position.y, colliders, ramps, 0.4);
        this.position.copy(proposedPos);

        let targetAngle = Math.atan2(moveDir.x, moveDir.z);
        if (this.suspicionTimer > 0 && this.suspiciousPos) {
          const sd = this.suspiciousPos.clone().sub(this.position);
          targetAngle = Math.atan2(sd.x, sd.z);
        } else if (currentNode?.coverAngle !== undefined) {
          targetAngle = currentNode.coverAngle;
        }

        this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, targetAngle, 12, dt);
        this.char.group.position.copy(this.position);

        this.char.playAnimation(speed < 4.1 ? 'walk' : 'run', 0.15);
        return;
      }
    }

    // Holding post-plant / sniper anchor angle when arrived at destination
    if (this.lastKnownEnemyPos) {
      const d = this.lastKnownEnemyPos.clone().sub(this.position);
      if (d.lengthSq() > 0.2) {
        this.char.group.rotation.y = THREE.MathUtils.damp(this.char.group.rotation.y, Math.atan2(d.x, d.z), 8, dt);
      }
    }
    this.char.playAnimation('idle', 0.2);
  }

  public resolveWallCollision(pos: THREE.Vector3, colliders: BoxCollider[]) {
    const botRadius = 0.44;
    const botHeight = 1.8;
    const stepUpLimit = 0.55;

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
      }
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

    // 1. TACTICAL SMOKE GRENADE (Cover defuse, execute choke, or disengage sniper)
    if (this.hasSmokeGrenade) {
      let smokeTarget: THREE.Vector3 | null = null;

      if (this.team === 'swat' && isBombPlanted && bombPos) {
        const dBomb = this.position.distanceTo(bombPos);
        if (dBomb > 6 && dBomb < 19 && !alreadySmokedNear(bombPos)) {
          smokeTarget = bombPos.clone();
        }
      } else if (this.team === 'gang' && !isBombPlanted) {
        const site = this.targetObjective === 'site_b' ? siteB : siteA;
        if (site) {
          const dSite = this.position.distanceTo(site.center);
          if (dSite > 10 && dSite < 23 && !alreadySmokedNear(site.center) && (this.suspicionTimer > 0 || Math.random() < 0.35)) {
            smokeTarget = site.center.clone();
          }
        }
      }

      if (!smokeTarget && this.targetEnemy && this.targetEnemy.dist > 13 && this.targetEnemy.dist < 28 && this.state.health < 78) {
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

    // 2. TACTICAL HE GRENADE (Flush enemy behind cover or suspected angle, avoiding friendly fire)
    if (this.hasHEGrenade && !this.targetEnemy) {
      const candidatePos = this.lastKnownEnemyPos || (this.suspicionTimer > 1.8 ? this.suspiciousPos : null);
      if (candidatePos) {
        const dist = this.position.distanceTo(candidatePos);
        if (dist >= 8.5 && dist <= 25) {
          // Verify no living teammate is right on top of the blast zone
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
            this.grenadeCooldown = 8.0;
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

    // Check high-arc clearance so bot does not bounce grenade off an immediate wall
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
    const fromHead = new THREE.Vector3(from.x, from.y + 1.48, from.z);
    const toHead = new THREE.Vector3(to.x, to.y + 1.48, to.z);
    const diff = toHead.clone().sub(fromHead);
    const targetDist = diff.length();
    if (targetDist < 0.001) return true;
    const dir = diff.clone().divideScalar(targetDist);

    const ray = new THREE.Ray(fromHead, dir);
    const box = new THREE.Box3();
    const hitPoint = new THREE.Vector3();

    for (const c of colliders) {
      box.set(c.min, c.max);
      const hit = ray.intersectBox(box, hitPoint);
      if (hit && hit.distanceTo(fromHead) < targetDist - 0.4) {
        return false;
      }
    }

    if (smokes && smokes.length > 0) {
      const segSq = targetDist * targetDist;
      const toSmoke = new THREE.Vector3();
      const closest = new THREE.Vector3();
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
