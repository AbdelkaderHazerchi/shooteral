import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sound } from './audio/SoundEffects';
import { BotController, BotRole } from './ai/BotController';
import { PlayerController, PlayerState } from './fps/PlayerController';
import {
  applyTextureAnisotropy,
  getMapById,
  MapData,
  MapId
} from './maps/MapBuilder';
import { WEAPONS } from './weapons/WeaponData';
import { updateLocalProfile } from './profile/PlayerProfile';

export interface KillFeedItem {
  id: string;
  killerName: string;
  killerTeam: 'gang' | 'swat';
  victimName: string;
  victimTeam: 'gang' | 'swat';
  weaponName: string;
  isHeadshot: boolean;
  time: number;
}

export interface MatchScore {
  gang: number;
  police: number;
  currentRound: number;
  roundTimeLeft: number;
  buyTimeLeft: number;
  isBuyPhase: boolean;
  isBombPlanted: boolean;
  bombTimeLeft: number;
  bombSite: 'A' | 'B' | null;
  roundWinner: 'gang' | 'swat' | null;
  roundEndReason: string;
  matchWinner: 'gang' | 'swat' | null;
  isMatchOver: boolean;
  difficultyLevel: number;
  lastRoundDifficultyIncreased: boolean;
}

export interface GameSettings {
  mouseSensitivity: number;
  volume: number;
  crosshairColor: string;
  crosshairSize: number;
  fov: number;
  language: 'ar' | 'en';
}

export interface HitFeedbackEvent {
  id: number;
  isHeadshot: boolean;
  isKill: boolean;
}

export interface DamageIndicatorEvent {
  id: number;
  relativeAngle: number; // radians relative to player look direction (0 = front, PI = behind)
  damageAmount: number;
}

export interface RadarActor {
  x: number;
  z: number;
  team: 'gang' | 'swat';
  isEnemySpotted: boolean;
  hasC4?: boolean;
}

export interface RadarSnapshot {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  playerTeam: 'gang' | 'swat';
  actors: RadarActor[];
  bombPos: { x: number; z: number } | null;
  isBombPlanted: boolean;
  siteA: { x: number; z: number };
  siteB: { x: number; z: number };
  colliders: { minX: number; maxX: number; minZ: number; maxZ: number }[];
}

export class GameEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public isSoftwareGl: boolean;

  public currentMap: MapData;
  public mapGroup: THREE.Group | null = null;

  public player: PlayerController;
  public bots: BotController[] = [];
  public teamSize: number = 5;
  public playerTeam: 'gang' | 'swat';

  // Bomb in world
  public plantedBombMesh: THREE.Group | null = null;
  public droppedBombMesh: THREE.Group | null = null;
  public bombWorldPos: THREE.Vector3 | null = null;
  private bombBeepTimer: number = 0;

  // Match State
  public matchScore: MatchScore;
  public difficultyLevel: number = 1;
  public killFeed: KillFeedItem[] = [];

  // Call of Duty Shooting & Blood VFX pools
  private tracers: { mesh: THREE.Mesh; age: number }[] = [];
  private sparks: { mesh: THREE.Mesh; vel: THREE.Vector3; age: number }[] = [];
  private bloodDrops: { mesh: THREE.Mesh; vel: THREE.Vector3; age: number }[] = [];
  private shells: { mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3; age: number }[] = [];
  private dustPuffs: { mesh: THREE.Mesh; age: number }[] = [];
  private worldFlashes: { mesh: THREE.Mesh; age: number }[] = [];
  private bulletDecals: THREE.Mesh[] = [];
  private bloodDecals: THREE.Mesh[] = [];

  // Shared FX Geometries
  private sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
  private bloodDropGeo = new THREE.SphereGeometry(0.032, 5, 5);
  private shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.032, 6);
  private dustGeo = new THREE.SphereGeometry(0.14, 6, 6);
  private worldFlashGeo = new THREE.SphereGeometry(0.16, 6, 6);
  private decalGeo = new THREE.CircleGeometry(0.055, 8);
  private bloodDecalGeo = new THREE.CircleGeometry(0.32, 10);
  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x18181b,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  private bloodDecalMat = new THREE.MeshBasicMaterial({
    color: 0x5c0909,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  // Round transition & HUD sync timers
  private roundEndDelayTimer: number = 0;
  private isRoundOverWaiting: boolean = false;
  private scoreNotifyTimer: number = 0;
  private radarNotifyTimer: number = 0;
  private fxSeq = 0;
  private matchXpEarned: number = 0;
  private matchHeadshots: number = 0;
  private currentKillStreak: number = 0;
  private defuseAlertCooldown: number = 0;

  // Callbacks for UI updates
  public onScoreUpdate?: (score: MatchScore) => void;
  public onKillFeedUpdate?: (feed: KillFeedItem[]) => void;
  public onPlayerStateUpdate?: (state: PlayerState) => void;
  public onMatchEnd?: (winner: 'gang' | 'swat') => void;
  public onHitFeedback?: (ev: HitFeedbackEvent) => void;
  public onDamageTaken?: (ev: DamageIndicatorEvent) => void;
  public onRadarUpdate?: (radar: RadarSnapshot) => void;

  constructor(
    canvasContainer: HTMLElement,
    mapId: MapId,
    playerTeam: 'gang' | 'swat',
    teamSize: number = 5
  ) {
    this.playerTeam = playerTeam;
    this.teamSize = Math.max(5, Math.min(8, teamSize));

    // GPU vs Software-WebGL probe (per Three.js skill directive)
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 240);
    this.scene.add(this.camera);

    // Renderer with ACESFilmic Tone Mapping & SRGB
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(this.renderer.domElement);

    // PBR Environment Reflection Map (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    applyTextureAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    // Load Map
    this.currentMap = getMapById(mapId);
    this.setupEnvironment();

    // Player Controller
    this.player = new PlayerController(this.camera, playerTeam, this.scene);
    this.player.onStateChange = (st) => this.onPlayerStateUpdate?.(st);
    this.player.onShoot = (hitPoint, isHeadshot, muzzleWorld) =>
      this.handlePlayerShoot(hitPoint, isHeadshot, muzzleWorld);
    this.player.onPlantCompleted = (site, pos) => {
      this.plantBomb(site, pos);
      const plantXp = 120;
      this.matchXpEarned += plantXp;
      updateLocalProfile((p) => {
        p.plantsCompleted++;
        p.xp += plantXp;
      });
    };
    this.player.onDefuseCompleted = () => {
      this.defuseBomb();
      const defuseXp = 150;
      this.matchXpEarned += defuseXp;
      updateLocalProfile((p) => {
        p.defusesCompleted++;
        p.xp += defuseXp;
      });
    };

    // Match Score Init
    this.matchScore = {
      gang: 0,
      police: 0,
      currentRound: 1,
      roundTimeLeft: 120,
      buyTimeLeft: 15,
      isBuyPhase: true,
      isBombPlanted: false,
      bombTimeLeft: 40,
      bombSite: null,
      roundWinner: null,
      roundEndReason: '',
      matchWinner: null,
      isMatchOver: false,
      difficultyLevel: 1,
      lastRoundDifficultyIncreased: false
    };

    // Create Bots
    this.createBots();

    // Start Round 1
    this.startNewRound();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.onResize);
  }

  private setupEnvironment() {
    this.scene.background = new THREE.Color(this.currentMap.skyColor);
    this.scene.fog = new THREE.Fog(this.currentMap.fogColor, 55, 190);

    // Warm/cool sky/ground hemisphere fill + crisp sunlight
    const hemiLight = new THREE.HemisphereLight(this.currentMap.skyColor, this.currentMap.groundColor, 1.05);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(this.currentMap.lightColor, 1.5);
    dirLight.position.set(28, 52, 22);
    dirLight.castShadow = !this.isSoftwareGl;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 165;
    dirLight.shadow.camera.left = -65;
    dirLight.shadow.camera.right = 65;
    dirLight.shadow.camera.top = 65;
    dirLight.shadow.camera.bottom = -65;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    this.scene.add(dirLight);

    this.mapGroup = this.currentMap.buildScene(this.scene);
  }

  private createBots() {
    const gangNames = ['Falcon', 'Shadow', 'Ghost', 'Viper', 'Razor', 'Wolf', 'Rex', 'Titan'];
    const swatNames = ['Bravo-1', 'Eagle', 'Delta-4', 'Hunter', 'Striker', 'Sentry', 'Shield', 'Vanguard'];

    this.bots = [];
    const playerIsGang = this.playerTeam === 'gang';

    const gangBotsCount = playerIsGang ? this.teamSize - 1 : this.teamSize;
    for (let i = 0; i < gangBotsCount; i++) {
      const name = gangNames[i % gangNames.length] + (i >= gangNames.length ? ' II' : '');
      const bot = new BotController('gang_bot_' + i, name, 'gang', this.scene);
      this.setupBotCallbacks(bot);
      this.bots.push(bot);
    }

    const swatBotsCount = playerIsGang ? this.teamSize : this.teamSize - 1;
    for (let i = 0; i < swatBotsCount; i++) {
      const name = swatNames[i % swatNames.length] + (i >= swatNames.length ? ' II' : '');
      const bot = new BotController('swat_bot_' + i, name, 'swat', this.scene);
      this.setupBotCallbacks(bot);
      this.bots.push(bot);
    }
  }

  private setupBotCallbacks(bot: BotController) {
    bot.onEnemySpotted = (spotter, enemyPos) => {
      // Broadcast CS squad radio callout to nearby teammates
      const siteHint: 'site_a' | 'site_b' | undefined =
        enemyPos.distanceTo(this.currentMap.siteA.center) < 18
          ? 'site_a'
          : enemyPos.distanceTo(this.currentMap.siteB.center) < 18
            ? 'site_b'
            : undefined;

      this.bots.forEach((ally) => {
        if (ally.team === spotter.team && ally.id !== spotter.id && ally.state.isAlive) {
          if (ally.position.distanceTo(spotter.position) < 48) {
            ally.receiveRadioCallout(enemyPos, siteHint);
          }
        }
      });

      // Mark enemy on radar if spotted by a teammate of player
      if (spotter.team === this.playerTeam) {
        this.bots.forEach((enemy) => {
          if (enemy.team !== this.playerTeam && enemy.state.isAlive && enemy.position.distanceTo(enemyPos) < 3.0) {
            enemy.lastSpottedTime = Date.now();
          }
        });
      }
    };

    bot.onShoot = (aimPoint, isHeadshotIntent, targetId) => {
      const shooterMuzzle = bot.position.clone().add(new THREE.Vector3(0, 1.42, 0));
      this.spawnWorldMuzzleFlash(shooterMuzzle);

      // Alert nearby bots of gunfire
      this.bots.forEach((b) => {
        if (b.id !== bot.id) b.alertToGunfire(shooterMuzzle);
      });

      // Mark firing enemy briefly on player's tactical radar
      if (bot.team !== this.playerTeam) {
        bot.lastSpottedTime = Date.now();
      }

      // Physical raycast along bot's dispersed aim line (supports genuine misses!)
      const bulletDir = aimPoint.clone().sub(shooterMuzzle);
      if (bulletDir.lengthSq() < 0.0001) return;
      bulletDir.normalize();

      const ray = new THREE.Ray(shooterMuzzle, bulletDir);
      const box = new THREE.Box3();
      let wallHitDist = Infinity;
      let wallHitPoint: THREE.Vector3 | null = null;
      let wallNormal = new THREE.Vector3(0, 1, 0);

      for (const c of this.currentMap.colliders) {
        box.set(c.min, c.max);
        const hit = ray.intersectBox(box, new THREE.Vector3());
        if (hit) {
          const d = shooterMuzzle.distanceTo(hit);
          if (d < wallHitDist) {
            wallHitDist = d;
            wallHitPoint = hit;
            wallNormal = this.computeBoxNormal(hit, box);
          }
        }
      }

      if (targetId === 'player' && this.player.state.isAlive) {
        const py = this.player.position.y;
        const crouching = this.player.state.isCrouching;
        const pHead = new THREE.Vector3(this.player.position.x, py + (crouching ? 1.02 : 1.54), this.player.position.z);
        const pChest = new THREE.Vector3(this.player.position.x, py + (crouching ? 0.65 : 1.04), this.player.position.z);
        const targetDist = shooterMuzzle.distanceTo(pChest);

        const headHit = ray.distanceToPoint(pHead) < 0.25 && isHeadshotIntent;
        const bodyHit = headHit || ray.distanceToPoint(pChest) < 0.44;

        if (!bodyHit || wallHitDist < targetDist - 0.25) {
          const missEnd = wallHitPoint || shooterMuzzle.clone().addScaledVector(bulletDir, Math.min(55, targetDist + 10));
          this.createBulletTracer(shooterMuzzle, missEnd);
          if (wallHitPoint) this.spawnImpactEffects(wallHitPoint, wallNormal, false);
          return;
        }

        const hitSpot = headHit ? pHead : pChest;
        this.createBulletTracer(shooterMuzzle, hitSpot);

        const botDamageFactor = Math.min(0.84, 0.50 + (bot.difficultyLevel - 1) * 0.032);
        const damage = bot.state.weapon.damage * (headHit ? 1.4 : 1.0) * botDamageFactor;
        const died = this.player.takeDamage(damage, headHit);
        sound.playHitmarker(headHit, false);

        const toShooter = shooterMuzzle.clone().sub(this.player.position);
        const worldAngle = Math.atan2(toShooter.x, -toShooter.z);
        const playerLookAngle = -this.player.yaw;
        const relAngle = worldAngle - playerLookAngle;
        this.onDamageTaken?.({ id: ++this.fxSeq, relativeAngle: relAngle, damageAmount: damage });

        if (died) {
          this.currentKillStreak = 0;
          updateLocalProfile((p) => {
            p.deaths++;
          });
          this.addFeedItem(bot.name, bot.team, 'أنت (You)', this.playerTeam, bot.state.weapon.name, headHit);
          bot.state.kills++;
          bot.state.score += 2;
          // Alert nearby allied bots to trade the player's death
          this.bots.forEach((ally) => {
            if (ally.team === this.playerTeam) ally.notifyAllyDown(this.player.position);
          });
          this.checkRoundEndConditions();
        }
      } else if (targetId) {
        const targetBot = this.bots.find((b) => b.id === targetId);
        if (targetBot && targetBot.state.isAlive) {
          const bHead = new THREE.Vector3();
          targetBot.char.headBone.getWorldPosition(bHead);
          const bChest = new THREE.Vector3();
          targetBot.char.chestBone.getWorldPosition(bChest);
          const targetDist = shooterMuzzle.distanceTo(bChest);

          const headHit = ray.distanceToPoint(bHead) < 0.25 && isHeadshotIntent;
          const bodyHit = headHit || ray.distanceToPoint(bChest) < 0.44;

          if (!bodyHit || wallHitDist < targetDist - 0.25) {
            const missEnd = wallHitPoint || shooterMuzzle.clone().addScaledVector(bulletDir, Math.min(55, targetDist + 10));
            this.createBulletTracer(shooterMuzzle, missEnd);
            if (wallHitPoint) this.spawnImpactEffects(wallHitPoint, wallNormal, false);
            return;
          }

          const bloodPos = headHit ? bHead : bChest;
          this.createBulletTracer(shooterMuzzle, bloodPos);
          this.spawnBloodSparks(bloodPos, headHit, bulletDir, targetBot.position.y);

          const damage = bot.state.weapon.damage * (headHit ? 2.1 : 1.0);
          const died = targetBot.takeDamage(damage, headHit, bot.position);
          if (died) {
            this.addFeedItem(bot.name, bot.team, targetBot.name, targetBot.team, bot.state.weapon.name, headHit);
            bot.state.kills++;
            bot.state.score += 2;
            this.checkRoundEndConditions();
          }
        }
      }
    };

    bot.onPlantCompleted = (site, pos) => {
      this.plantBomb(site, pos);
    };

    bot.onDefuseCompleted = () => {
      this.defuseBomb();
    };

    bot.onDeath = (deadBot) => {
      if (deadBot.state.hasC4) {
        this.dropC4(deadBot.position.clone());
        deadBot.state.hasC4 = false;
      }
      // Squad trade-kill callout to nearby teammates
      this.bots.forEach((ally) => {
        if (ally.id !== deadBot.id && ally.team === deadBot.team) {
          ally.notifyAllyDown(deadBot.position);
        }
      });
      this.checkRoundEndConditions();
    };
  }

  private computeBoxNormal(point: THREE.Vector3, box: THREE.Box3): THREE.Vector3 {
    const eps = 0.02;
    if (Math.abs(point.x - box.min.x) < eps) return new THREE.Vector3(-1, 0, 0);
    if (Math.abs(point.x - box.max.x) < eps) return new THREE.Vector3(1, 0, 0);
    if (Math.abs(point.z - box.min.z) < eps) return new THREE.Vector3(0, 0, -1);
    if (Math.abs(point.z - box.max.z) < eps) return new THREE.Vector3(0, 0, 1);
    if (Math.abs(point.y - box.max.y) < eps) return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(0, -1, 0);
  }

  public restartMatch() {
    this.difficultyLevel = 1;
    this.matchScore = {
      gang: 0,
      police: 0,
      currentRound: 1,
      roundTimeLeft: 120,
      buyTimeLeft: 15,
      isBuyPhase: true,
      isBombPlanted: false,
      bombTimeLeft: 40,
      bombSite: null,
      roundWinner: null,
      roundEndReason: '',
      matchWinner: null,
      isMatchOver: false,
      difficultyLevel: 1,
      lastRoundDifficultyIncreased: false
    };
    this.killFeed = [];
    this.matchXpEarned = 0;
    this.matchHeadshots = 0;
    this.currentKillStreak = 0;

    // Clean up transient in-flight FX pools
    for (const tr of this.tracers) {
      this.scene.remove(tr.mesh);
      tr.mesh.geometry.dispose();
      (tr.mesh.material as THREE.Material).dispose();
    }
    this.tracers = [];
    for (const sh of this.shells) {
      this.scene.remove(sh.mesh);
      (sh.mesh.material as THREE.Material).dispose();
    }
    this.shells = [];
    for (const dp of this.dustPuffs) {
      this.scene.remove(dp.mesh);
      (dp.mesh.material as THREE.Material).dispose();
    }
    this.dustPuffs = [];
    for (const sp of this.sparks) {
      this.scene.remove(sp.mesh);
      (sp.mesh.material as THREE.Material).dispose();
    }
    this.sparks = [];
    for (const bd of this.bloodDrops) {
      this.scene.remove(bd.mesh);
      (bd.mesh.material as THREE.Material).dispose();
    }
    this.bloodDrops = [];
    for (const wf of this.worldFlashes) {
      this.scene.remove(wf.mesh);
      (wf.mesh.material as THREE.Material).dispose();
    }
    this.worldFlashes = [];

    this.player.resetMatch();
    this.bots.forEach((b) => {
      b.state.kills = 0;
      b.state.deaths = 0;
      b.state.score = 0;
    });

    this.startNewRound();
    this.onKillFeedUpdate?.([]);
    this.onScoreUpdate?.({ ...this.matchScore });
    this.onPlayerStateUpdate?.({ ...this.player.state });
  }

  public startNewRound() {
    this.matchScore.roundTimeLeft = 120;
    this.matchScore.buyTimeLeft = 15;
    this.matchScore.isBuyPhase = true;
    this.matchScore.isBombPlanted = false;
    this.matchScore.bombTimeLeft = 40;
    this.matchScore.bombSite = null;
    this.matchScore.roundWinner = null;
    this.matchScore.roundEndReason = '';
    this.matchScore.difficultyLevel = this.difficultyLevel;
    this.matchScore.lastRoundDifficultyIncreased = false;
    this.isRoundOverWaiting = false;
    this.roundEndDelayTimer = 0;

    // Clean up round decals & world bomb meshes
    this.bulletDecals.forEach((d) => this.scene.remove(d));
    this.bulletDecals = [];
    this.bloodDecals.forEach((d) => this.scene.remove(d));
    this.bloodDecals = [];

    if (this.plantedBombMesh) {
      this.scene.remove(this.plantedBombMesh);
      this.plantedBombMesh = null;
    }
    if (this.droppedBombMesh) {
      this.scene.remove(this.droppedBombMesh);
      this.droppedBombMesh = null;
    }
    this.bombWorldPos = null;

    // Pick C4 Carrier among Gang members
    const gangMembers: ('player' | BotController)[] = [];
    if (this.playerTeam === 'gang') gangMembers.push('player');
    this.bots.filter((b) => b.team === 'gang').forEach((b) => gangMembers.push(b));

    const carrierIndex = Math.floor(Math.random() * gangMembers.length);
    const chosenCarrier = gangMembers[carrierIndex];

    // Spawn Player
    const playerSpawns = this.playerTeam === 'gang' ? this.currentMap.tSpawns : this.currentMap.ctSpawns;
    const playerSpawn = playerSpawns[0];
    const playerHasC4 = chosenCarrier === 'player';
    this.player.resetRound(playerSpawn, playerHasC4);

    // Spawn Bots with strategic CS roles
    let tIdx = this.playerTeam === 'gang' ? 1 : 0;
    let ctIdx = this.playerTeam === 'swat' ? 1 : 0;
    const roundAttackSite: 'site_a' | 'site_b' = Math.random() < 0.5 ? 'site_a' : 'site_b';

    let swatToggle = false;
    this.bots.forEach((bot, idx) => {
      const isGang = bot.team === 'gang';
      const spawn = isGang ? this.currentMap.tSpawns[tIdx++] : this.currentMap.ctSpawns[ctIdx++];
      const hasC4 = chosenCarrier === bot;

      let objective: 'site_a' | 'site_b' = roundAttackSite;
      let role: BotRole = 'rusher';

      if (isGang) {
        if (hasC4) {
          objective = roundAttackSite;
          role = 'anchor';
        } else {
          const mod = idx % 4;
          if (mod === 0) {
            role = 'escort';
            objective = roundAttackSite;
          } else if (mod === 1) {
            role = 'rusher';
            objective = roundAttackSite;
          } else if (mod === 2) {
            role = 'flanker';
            objective = roundAttackSite === 'site_a' ? 'site_b' : 'site_a';
          } else {
            role = 'awper';
            objective = roundAttackSite;
          }
        }
      } else {
        swatToggle = !swatToggle;
        objective = swatToggle ? 'site_a' : 'site_b';
        role = idx % 4 === 0 ? 'awper' : idx % 3 === 0 ? 'flanker' : 'anchor';
      }

      const botDifficulty = bot.team !== this.playerTeam ? this.difficultyLevel : 1;
      bot.resetRound(spawn, hasC4, objective, role, this.matchScore.currentRound, botDifficulty);
    });

    sound.playRadio('start');
    this.onScoreUpdate?.({ ...this.matchScore });
  }

  public handlePlayerShoot(_targetPoint: THREE.Vector3, _isHeadshot: boolean, muzzleWorldPos?: THREE.Vector3) {
    const weapon = this.player.getActiveWeapon();
    if (!weapon || weapon.id === 'c4') return;

    this.bots.forEach((b) => b.alertToGunfire(this.player.position));
    if (weapon.category !== 'melee') {
      updateLocalProfile((p) => {
        p.shotsFired++;
      });
    }

    const muzzleOrigin = muzzleWorldPos || this.player.getMuzzleWorldPos();

    // Eject physical 3D brass shell casing + faint barrel smoke wisp
    if (weapon.category !== 'melee') {
      this.spawnShellCasing(muzzleOrigin);
      this.spawnMuzzleSmoke(muzzleOrigin);
    }

    const raycaster = new THREE.Raycaster();
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);
    raycaster.set(this.camera.position, cameraDir);

    // 1. Check wall/crate colliders
    let wallHitDist = Infinity;
    let wallHitPoint: THREE.Vector3 | null = null;
    let wallNormal = new THREE.Vector3(0, 1, 0);
    const box = new THREE.Box3();

    for (const c of this.currentMap.colliders) {
      box.set(c.min, c.max);
      const hit = raycaster.ray.intersectBox(box, new THREE.Vector3());
      if (hit) {
        const d = this.camera.position.distanceTo(hit);
        if (d < wallHitDist) {
          wallHitDist = d;
          wallHitPoint = hit;
          wallNormal = this.computeBoxNormal(hit, box);
        }
      }
    }

    // 2. Raycast against enemy bots
    const enemies = this.bots.filter((b) => b.team !== this.playerTeam && b.state.isAlive);
    let closestHitBot: BotController | null = null;
    let minDistance = Infinity;
    let hitIsHeadshot = false;

    for (const b of enemies) {
      const headPos = new THREE.Vector3();
      b.char.headBone.getWorldPosition(headPos);
      const distToHead = raycaster.ray.distanceToPoint(headPos);

      const chestPos = new THREE.Vector3();
      b.char.chestBone.getWorldPosition(chestPos);
      const distToChest = raycaster.ray.distanceToPoint(chestPos);

      const maxMeleeRange = weapon.category === 'melee' ? 2.6 : 160;

      if (distToHead < 0.3) {
        const d = this.camera.position.distanceTo(headPos);
        if (d < minDistance && d <= maxMeleeRange) {
          minDistance = d;
          closestHitBot = b;
          hitIsHeadshot = true;
        }
      } else if (distToChest < 0.58) {
        const d = this.camera.position.distanceTo(chestPos);
        if (d < minDistance && d <= maxMeleeRange) {
          minDistance = d;
          closestHitBot = b;
          hitIsHeadshot = false;
        }
      }
    }

    if (wallHitDist < minDistance) {
      const tracerEnd = wallHitPoint || this.camera.position.clone().addScaledVector(cameraDir, wallHitDist);
      if (weapon.category !== 'melee') this.createBulletTracer(muzzleOrigin, tracerEnd);
      if (wallHitPoint) this.spawnImpactEffects(wallHitPoint, wallNormal, true);
      return;
    }

    const tracerEnd = closestHitBot
      ? raycaster.ray.origin.clone().addScaledVector(cameraDir, minDistance)
      : wallHitPoint || _targetPoint;

    if (weapon.category !== 'melee') {
      this.createBulletTracer(muzzleOrigin, tracerEnd);
    }

    if (closestHitBot) {
      closestHitBot.lastSpottedTime = Date.now();
      this.spawnBloodSparks(tracerEnd, hitIsHeadshot, cameraDir, closestHitBot.position.y);

      const baseDamage = weapon.damage;
      const damage = hitIsHeadshot ? baseDamage * weapon.headshotMultiplier : baseDamage;
      const died = closestHitBot.takeDamage(damage, hitIsHeadshot, this.player.position);

      sound.playHitmarker(hitIsHeadshot, died);
      this.onHitFeedback?.({ id: ++this.fxSeq, isHeadshot: hitIsHeadshot, isKill: died });

      const killXp = died ? 100 + (hitIsHeadshot ? 40 : 0) : 0;
      if (died) {
        this.matchXpEarned += killXp;
        if (hitIsHeadshot) this.matchHeadshots++;
        this.currentKillStreak++;
        this.player.state.kills++;
        this.player.state.score += 2;
        this.player.state.money = Math.min(16000, this.player.state.money + (weapon.id === 'awp' ? 100 : 300));
        this.addFeedItem('أنت (You)', this.playerTeam, closestHitBot.name, closestHitBot.team, weapon.name, hitIsHeadshot);
        this.checkRoundEndConditions();
      }
      updateLocalProfile((p) => {
        if (weapon.category !== 'melee') p.shotsHit++;
        p.totalDamageDealt += Math.round(damage);
        if (died) {
          p.kills++;
          if (hitIsHeadshot) p.headshots++;
          p.xp += killXp;
          p.weaponKills[weapon.id] = (p.weaponKills[weapon.id] || 0) + 1;
          if (this.currentKillStreak > p.bestKillStreak) {
            p.bestKillStreak = this.currentKillStreak;
          }
        }
      });
      this.onPlayerStateUpdate?.({ ...this.player.state });
    } else if (wallHitPoint) {
      this.spawnImpactEffects(wallHitPoint, wallNormal, true);
    }
  }

  private createBulletTracer(start: THREE.Vector3, end: THREE.Vector3) {
    const dir = end.clone().sub(start);
    const len = Math.min(dir.length(), 90);
    if (len < 0.2) return;

    const geo = new THREE.CylinderGeometry(0.012, 0.006, len, 5);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffea8a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start);
    mesh.lookAt(end);
    this.scene.add(mesh);
    this.tracers.push({ mesh, age: 0 });
  }

  private spawnShellCasing(muzzlePos: THREE.Vector3) {
    const right = new THREE.Vector3(1, 0.35, 0).applyEuler(this.camera.rotation).normalize();
    const spawnPos = muzzlePos.clone().lerp(this.camera.position, 0.45).addScaledVector(right, 0.08);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe6b84c, metalness: 0.9, roughness: 0.25 });
    const mesh = new THREE.Mesh(this.shellGeo, mat);
    mesh.position.copy(spawnPos);
    this.scene.add(mesh);

    const vel = right.multiplyScalar(2.4 + Math.random() * 1.2);
    vel.y += 1.6 + Math.random() * 0.8;
    const rotVel = new THREE.Vector3(Math.random() * 18, Math.random() * 18, Math.random() * 18);
    this.shells.push({ mesh, vel, rotVel, age: 0 });
  }

  private spawnImpactEffects(pos: THREE.Vector3, normal: THREE.Vector3, addDecal: boolean) {
    // 1. Concrete/Metallic Sparks
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffcc44 : 0xff7700 });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const vel = normal
        .clone()
        .multiplyScalar(2.5 + Math.random() * 2.5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3.5, Math.random() * 2.5, (Math.random() - 0.5) * 3.5));
      this.sparks.push({ mesh, vel, age: 0 });
    }

    // 2. CoD Concrete Dust Plume
    const dustMat = new THREE.MeshBasicMaterial({
      color: 0xd6d3d1,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    const dustMesh = new THREE.Mesh(this.dustGeo, dustMat);
    dustMesh.position.copy(pos).addScaledVector(normal, 0.08);
    this.scene.add(dustMesh);
    this.dustPuffs.push({ mesh: dustMesh, age: 0 });

    // 3. Bullet Hole Decal on wall
    if (addDecal && this.bulletDecals.length < 60) {
      const decal = new THREE.Mesh(this.decalGeo, this.decalMat);
      decal.position.copy(pos).addScaledVector(normal, 0.015);
      decal.lookAt(pos.clone().add(normal));
      this.scene.add(decal);
      this.bulletDecals.push(decal);
    }
  }

  private spawnWorldMuzzleFlash(pos: THREE.Vector3) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd266,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.worldFlashGeo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.worldFlashes.push({ mesh, age: 0 });
  }

  private spawnMuzzleSmoke(pos: THREE.Vector3) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd4d4d8,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.dustGeo, mat);
    mesh.scale.setScalar(0.45);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.dustPuffs.push({ mesh, age: 0.1 });
  }

  private spawnBloodSparks(pos: THREE.Vector3, isHeadshot: boolean, shotDir?: THREE.Vector3, groundY = 0) {
    const count = isHeadshot ? 16 : 10;
    const exitDir = shotDir ? shotDir.clone().normalize() : new THREE.Vector3(0, 0.2, 0);

    for (let i = 0; i < count; i++) {
      const isCritGold = isHeadshot && i < 2;
      const color = isCritGold ? 0xfbbf24 : i % 2 === 0 ? 0xb91c1c : 0x7f1d1d;
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(this.bloodDropGeo, mat);
      mesh.scale.setScalar(0.75 + Math.random() * 0.85);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      const vel = exitDir
        .clone()
        .multiplyScalar(2.4 + Math.random() * 2.5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3.4, Math.random() * 2.4 + 0.4, (Math.random() - 0.5) * 3.4));
      this.bloodDrops.push({ mesh, vel, age: 0 });
    }

    // Persistent floor crimson blood splatter decal beneath target
    if (this.bloodDecals.length < 45) {
      const pool = new THREE.Mesh(this.bloodDecalGeo, this.bloodDecalMat);
      pool.position.set(
        pos.x + (Math.random() - 0.5) * 0.45,
        groundY + 0.025,
        pos.z + (Math.random() - 0.5) * 0.45
      );
      pool.rotation.x = -Math.PI / 2;
      const sc = (isHeadshot ? 1.35 : 0.85) + Math.random() * 0.45;
      pool.scale.set(sc, sc * (0.8 + Math.random() * 0.4), 1);
      this.scene.add(pool);
      this.bloodDecals.push(pool);
    }
  }

  public plantBomb(site: 'A' | 'B', pos: THREE.Vector3) {
    if (this.matchScore.isBombPlanted) return;

    this.matchScore.isBombPlanted = true;
    this.matchScore.bombSite = site;
    this.matchScore.bombTimeLeft = 40;
    this.bombWorldPos = pos.clone();
    this.bombWorldPos.y += 0.05;

    const g = new THREE.Group();
    const brick = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xbfa882, roughness: 0.9 })
    );
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    led.position.set(0, 0.1, 0.1);
    g.add(brick, led);
    g.position.copy(this.bombWorldPos);
    this.scene.add(g);
    this.plantedBombMesh = g;

    // Alert all SWAT bots to rotate immediately to planted site!
    const targetSiteId: 'site_a' | 'site_b' = site === 'B' ? 'site_b' : 'site_a';
    this.bots.forEach((b) => {
      if (b.state.isAlive) {
        b.targetObjective = targetSiteId;
        b.currentPath = [];
      }
    });

    sound.playRadio('planted');
    this.onScoreUpdate?.({ ...this.matchScore });
  }

  public dropC4(pos: THREE.Vector3) {
    if (this.plantedBombMesh || this.droppedBombMesh) return;
    const g = new THREE.Group();
    const brick = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xbfa882, roughness: 0.9 })
    );
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    beacon.position.y = 0.25;
    g.add(brick, beacon);
    g.position.copy(pos);
    g.position.y += 0.08;
    this.scene.add(g);
    this.droppedBombMesh = g;
  }

  public defuseBomb() {
    if (!this.matchScore.isBombPlanted || this.isRoundOverWaiting) return;
    sound.playRadio('defused');
    this.endRound('swat', 'تم إبطال مفعول القنبلة بنجاح بواسطة الشرطة!');
  }

  public addFeedItem(
    killerName: string,
    killerTeam: 'gang' | 'swat',
    victimName: string,
    victimTeam: 'gang' | 'swat',
    weaponName: string,
    isHeadshot: boolean
  ) {
    const item: KillFeedItem = {
      id: Math.random().toString(),
      killerName,
      killerTeam,
      victimName,
      victimTeam,
      weaponName,
      isHeadshot,
      time: Date.now()
    };
    this.killFeed.unshift(item);
    if (this.killFeed.length > 6) this.killFeed.pop();
    this.onKillFeedUpdate?.([...this.killFeed]);
  }

  public checkRoundEndConditions() {
    if (this.isRoundOverWaiting || this.matchScore.isMatchOver) return;

    const playerAlive = this.player.state.isAlive;
    const aliveGangBots = this.bots.filter((b) => b.team === 'gang' && b.state.isAlive).length;
    const aliveSwatBots = this.bots.filter((b) => b.team === 'swat' && b.state.isAlive).length;

    const totalAliveGang = (this.playerTeam === 'gang' && playerAlive ? 1 : 0) + aliveGangBots;
    const totalAliveSwat = (this.playerTeam === 'swat' && playerAlive ? 1 : 0) + aliveSwatBots;

    if (totalAliveGang === 0) {
      if (!this.matchScore.isBombPlanted) {
        this.endRound('swat', 'تم القضاء على جميع أفراد العصابة!');
      }
    } else if (totalAliveSwat === 0) {
      this.endRound('gang', 'تم القضاء على جميع أفراد الشرطة!');
    }
  }

  public endRound(winner: 'gang' | 'swat', reason: string) {
    if (this.isRoundOverWaiting) return;
    this.isRoundOverWaiting = true;
    this.roundEndDelayTimer = 4.5;

    this.matchScore.roundWinner = winner;
    this.matchScore.roundEndReason = reason;

    if (winner === 'gang') {
      this.matchScore.gang++;
      sound.playRadio('gang_win');
      sound.playRoundStinger(this.playerTeam === 'gang');
    } else {
      this.matchScore.police++;
      sound.playRadio('police_win');
      sound.playRoundStinger(this.playerTeam === 'swat');
    }

    const winReward = 3250;
    const lossReward = 1900;
    const playerWon = this.playerTeam === winner;
    this.player.state.money = Math.min(16000, this.player.state.money + (playerWon ? winReward : lossReward));
    this.onPlayerStateUpdate?.({ ...this.player.state });

    // Progressive round difficulty: increase if player won, keep unchanged if player lost
    if (playerWon) {
      const prevDiff = this.difficultyLevel;
      this.difficultyLevel = Math.min(12, this.difficultyLevel + 1);
      this.matchScore.lastRoundDifficultyIncreased = this.difficultyLevel > prevDiff;
    } else {
      this.matchScore.lastRoundDifficultyIncreased = false;
    }
    this.matchScore.difficultyLevel = this.difficultyLevel;

    const roundXp = playerWon ? 80 : 30;
    this.matchXpEarned += roundXp;

    const scoreDiff = Math.abs(this.matchScore.gang - this.matchScore.police);
    const isOver = this.matchScore.gang >= 20 || this.matchScore.police >= 20 || scoreDiff > 12;
    let matchBonusXp = 0;

    if (isOver) {
      const matchWinner = this.matchScore.gang > this.matchScore.police ? 'gang' : 'swat';
      this.matchScore.isMatchOver = true;
      this.matchScore.matchWinner = matchWinner;
      matchBonusXp = matchWinner === this.playerTeam ? 300 : 120;
      this.matchXpEarned += matchBonusXp;
      this.onMatchEnd?.(matchWinner);
    }

    updateLocalProfile((p) => {
      p.roundsPlayed++;
      if (playerWon) p.roundsWon++;
      p.xp += roundXp + matchBonusXp;
      if (isOver) {
        p.matchesPlayed++;
        if (this.matchScore.matchWinner === this.playerTeam) p.matchesWon++;
        else p.matchesLost++;
        p.recentMatches.unshift({
          id: `${Date.now()}`,
          timestamp: Date.now(),
          map: this.currentMap.id,
          team: this.playerTeam,
          result: this.matchScore.matchWinner === this.playerTeam ? 'win' : 'loss',
          gangScore: this.matchScore.gang,
          policeScore: this.matchScore.police,
          kills: this.player.state.kills,
          deaths: this.player.state.deaths,
          headshots: this.matchHeadshots,
          xpEarned: this.matchXpEarned
        });
        if (p.recentMatches.length > 8) p.recentMatches.pop();
      }
    });

    this.onScoreUpdate?.({ ...this.matchScore });
  }

  public buyItem(itemId: string): boolean {
    if (!this.matchScore.isBuyPhase) return false;

    if (WEAPONS[itemId]) {
      const wp = WEAPONS[itemId];
      if (this.player.state.money < wp.price) return false;
      this.player.state.money -= wp.price;
      this.player.giveWeapon(wp);
      sound.playBuy();
      this.onPlayerStateUpdate?.({ ...this.player.state });
      return true;
    }

    if (itemId === 'kevlar') {
      if (this.player.state.money < 650) return false;
      this.player.state.money -= 650;
      this.player.state.armor = 100;
      sound.playBuy();
      this.onPlayerStateUpdate?.({ ...this.player.state });
      return true;
    }
    if (itemId === 'helmet') {
      if (this.player.state.money < 1000) return false;
      this.player.state.money -= 1000;
      this.player.state.armor = 100;
      this.player.state.hasHelmet = true;
      sound.playBuy();
      this.onPlayerStateUpdate?.({ ...this.player.state });
      return true;
    }
    if (itemId === 'defuser') {
      if (this.playerTeam !== 'swat' || this.player.state.money < 400) return false;
      this.player.state.money -= 400;
      this.player.state.hasDefuser = true;
      sound.playBuy();
      this.onPlayerStateUpdate?.({ ...this.player.state });
      return true;
    }

    return false;
  }

  public update(dt: number) {
    const colliders = this.currentMap.colliders;
    const ramps = this.currentMap.ramps;

    // Update Round Time / Buy Time
    if (!this.isRoundOverWaiting && !this.matchScore.isMatchOver) {
      if (this.matchScore.buyTimeLeft > 0) {
        this.matchScore.buyTimeLeft -= dt;
        if (this.matchScore.buyTimeLeft <= 0) {
          this.matchScore.isBuyPhase = false;
        }
      }

      if (!this.matchScore.isBombPlanted) {
        this.matchScore.roundTimeLeft -= dt;
        if (this.matchScore.roundTimeLeft <= 0) {
          this.matchScore.roundTimeLeft = 0;
          this.endRound('swat', 'انتهى وقت الجولة! فشلت العصابة في زرع القنبلة');
        }
      } else {
        this.matchScore.bombTimeLeft -= dt;
        this.bombBeepTimer += dt;

        const beepInterval = this.matchScore.bombTimeLeft > 20 ? 1.0 : this.matchScore.bombTimeLeft > 10 ? 0.5 : 0.2;
        if (this.bombBeepTimer >= beepInterval) {
          this.bombBeepTimer = 0;
          const pitch = 1000 + (40 - this.matchScore.bombTimeLeft) * 20;
          sound.playC4Beep(pitch);
        }

        if (this.matchScore.bombTimeLeft <= 0) {
          this.matchScore.bombTimeLeft = 0;
          sound.playExplosion();
          this.endRound('gang', 'انفجرت القنبلة ودُمر الموقع بالكامل!');
        }
      }
    }

    this.scoreNotifyTimer += dt;
    if (this.scoreNotifyTimer >= 0.1) {
      this.scoreNotifyTimer = 0;
      this.onScoreUpdate?.({ ...this.matchScore });
    }

    if (this.isRoundOverWaiting && !this.matchScore.isMatchOver) {
      this.roundEndDelayTimer -= dt;
      if (this.roundEndDelayTimer <= 0) {
        this.matchScore.currentRound++;
        this.startNewRound();
      }
    }

    // Dropped C4 Pickup (Player OR Nearest Alive Gang Bot)
    let retrieverBotId: string | null = null;
    if (this.droppedBombMesh && !this.matchScore.isBombPlanted) {
      const bombDropPos = this.droppedBombMesh.position;

      if (this.playerTeam === 'gang' && this.player.state.isAlive && !this.player.state.hasC4) {
        if (this.player.position.distanceTo(bombDropPos) < 2.2) {
          this.scene.remove(this.droppedBombMesh);
          this.droppedBombMesh = null;
          this.player.state.hasC4 = true;
          this.player.state.weapons[5] = { ...WEAPONS.c4 };
          this.onPlayerStateUpdate?.({ ...this.player.state });
        }
      }

      if (this.droppedBombMesh) {
        // Assign nearest alive Gang bot to pick up dropped bomb
        let bestDist = Infinity;
        for (const b of this.bots) {
          if (b.team === 'gang' && b.state.isAlive) {
            const d = b.position.distanceTo(bombDropPos);
            if (d < 2.0) {
              this.scene.remove(this.droppedBombMesh);
              this.droppedBombMesh = null;
              b.state.hasC4 = true;
              b.currentPath = [];
              break;
            }
            if (d < bestDist) {
              bestDist = d;
              retrieverBotId = b.id;
            }
          }
        }
      }
    }

    // Update Player Controller
    this.player.update(
      dt,
      colliders,
      ramps,
      this.matchScore.isBombPlanted,
      this.bombWorldPos || undefined,
      this.currentMap.siteA,
      this.currentMap.siteB
    );

    // Alert Gang bots when a CT (player or bot) begins defusing planted C4
    if (this.defuseAlertCooldown > 0) this.defuseAlertCooldown -= dt;
    if (this.matchScore.isBombPlanted && this.bombWorldPos && this.defuseAlertCooldown <= 0) {
      const anyoneDefusing =
        this.player.state.isDefusing || this.bots.some((b) => b.state.isAlive && b.state.isDefusing);
      if (anyoneDefusing) {
        this.defuseAlertCooldown = 1.6;
        this.bots.forEach((b) => {
          if (b.team === 'gang' && b.state.isAlive) {
            b.alertDefuseInProgress(this.bombWorldPos!);
          }
        });
      }
    }

    // Update Bots + Check Player Line-of-Sight for CS2 Radar Spotting
    const playerInfo = {
      pos: this.player.position,
      team: this.playerTeam,
      isAlive: this.player.state.isAlive,
      isRunning: this.player.isRunning(),
      isCrouching: this.player.state.isCrouching
    };

    const nowMs = Date.now();
    this.bots.forEach((bot) => {
      bot.update(
        dt,
        this.currentMap.navNodes,
        colliders,
        ramps,
        this.matchScore.isBombPlanted,
        this.bombWorldPos || undefined,
        this.currentMap.siteA,
        this.currentMap.siteB,
        playerInfo,
        this.bots,
        this.droppedBombMesh ? this.droppedBombMesh.position : null,
        bot.id === retrieverBotId,
        this.matchScore.bombTimeLeft
      );

      // Update radar spotting if player directly sees an enemy bot
      if (bot.state.isAlive && bot.team !== this.playerTeam && this.player.state.isAlive) {
        const dist = bot.position.distanceTo(this.player.position);
        if (dist < 45 && bot.hasLineOfSight(this.player.position, bot.position, colliders)) {
          bot.lastSpottedTime = nowMs;
        }
      }
    });

    // Update CS2 Radar Snapshot (15Hz)
    this.radarNotifyTimer += dt;
    if (this.radarNotifyTimer >= 0.065) {
      this.radarNotifyTimer = 0;
      const actors: RadarActor[] = [];
      for (const b of this.bots) {
        if (!b.state.isAlive) continue;
        const isAlly = b.team === this.playerTeam;
        const isSpotted = isAlly || nowMs - b.lastSpottedTime < 2200;
        if (isAlly || isSpotted) {
          actors.push({
            x: b.position.x,
            z: b.position.z,
            team: b.team,
            isEnemySpotted: !isAlly,
            hasC4: b.state.hasC4 && isAlly
          });
        }
      }
      const bombPos = this.plantedBombMesh
        ? { x: this.plantedBombMesh.position.x, z: this.plantedBombMesh.position.z }
        : this.droppedBombMesh && this.playerTeam === 'gang'
          ? { x: this.droppedBombMesh.position.x, z: this.droppedBombMesh.position.z }
          : null;

      this.onRadarUpdate?.({
        playerX: this.player.position.x,
        playerZ: this.player.position.z,
        playerYaw: this.player.yaw,
        playerTeam: this.playerTeam,
        actors,
        bombPos,
        isBombPlanted: this.matchScore.isBombPlanted,
        siteA: { x: this.currentMap.siteA.center.x, z: this.currentMap.siteA.center.z },
        siteB: { x: this.currentMap.siteB.center.x, z: this.currentMap.siteB.center.z },
        colliders: colliders
          .filter((c) => c.max.y > 2.2)
          .map((c) => ({ minX: c.min.x, maxX: c.max.x, minZ: c.min.z, maxZ: c.max.z }))
      });
    }

    // Update Glowing Bullet Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].age += dt;
      const mat = this.tracers[i].mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(0.9, 0, this.tracers[i].age / 0.11);
      if (this.tracers[i].age > 0.11) {
        this.scene.remove(this.tracers[i].mesh);
        this.tracers[i].mesh.geometry.dispose();
        mat.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Update Spinning Shell Casings
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.age += dt;
      sh.vel.y -= 14.0 * dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      sh.mesh.rotation.x += sh.rotVel.x * dt;
      sh.mesh.rotation.y += sh.rotVel.y * dt;
      sh.mesh.rotation.z += sh.rotVel.z * dt;
      if (sh.mesh.position.y < 0.02) {
        sh.mesh.position.y = 0.02;
        sh.vel.y *= -0.45;
        sh.vel.x *= 0.6;
        sh.vel.z *= 0.6;
      }
      if (sh.age > 0.9) {
        this.scene.remove(sh.mesh);
        (sh.mesh.material as THREE.Material).dispose();
        this.shells.splice(i, 1);
      }
    }

    // Update Impact Dust Puffs
    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const dp = this.dustPuffs[i];
      dp.age += dt;
      const scale = 1 + dp.age * 4.5;
      dp.mesh.scale.setScalar(scale);
      const mat = dp.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(0.55, 0, dp.age / 0.45);
      if (dp.age > 0.45) {
        this.scene.remove(dp.mesh);
        mat.dispose();
        this.dustPuffs.splice(i, 1);
      }
    }

    // Update Sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.age += dt;
      sp.vel.y -= 9.8 * dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      if (sp.age > 0.35) {
        this.scene.remove(sp.mesh);
        (sp.mesh.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
      }
    }

    // Update Volumetric 3D Blood Drops
    for (let i = this.bloodDrops.length - 1; i >= 0; i--) {
      const bd = this.bloodDrops[i];
      bd.age += dt;
      bd.vel.y -= 12.5 * dt;
      bd.mesh.position.addScaledVector(bd.vel, dt);
      if (bd.mesh.position.y < 0.03) {
        bd.mesh.position.y = 0.03;
        bd.vel.set(0, 0, 0);
      }
      if (bd.age > 0.48) {
        this.scene.remove(bd.mesh);
        (bd.mesh.material as THREE.Material).dispose();
        this.bloodDrops.splice(i, 1);
      }
    }

    // Update Bot World Muzzle Flashes
    for (let i = this.worldFlashes.length - 1; i >= 0; i--) {
      const wf = this.worldFlashes[i];
      wf.age += dt;
      const m = wf.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = THREE.MathUtils.lerp(0.92, 0, wf.age / 0.06);
      if (wf.age > 0.06) {
        this.scene.remove(wf.mesh);
        m.dispose();
        this.worldFlashes.splice(i, 1);
      }
    }

    // Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  }

  public renderOnly() {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public dispose() {
    window.removeEventListener('resize', this.onResize);
    this.player.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
