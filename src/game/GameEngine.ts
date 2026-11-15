import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sound } from './audio/SoundEffects';
import {
  BotController,
  IncomingGrenadeThreat,
  PlayerVisionInfo,
  RadioOrderType,
  SmokeVolume
} from './ai/BotController';
import { generateTeamTraitRoster } from './ai/BotTraits';
import { analyzeMapTactics, TacticalMapProfile } from './ai/MapTacticalAnalyzer';
import {
  getNemesisCounterAdvice,
  loadNemesisState,
  PersistentNemesisState,
  recordRoundIntoNemesis,
  RoundPlayerTelemetry
} from './ai/PersistentNemesisAI';
import { TeamCommander } from './ai/TeamCommander';
import { PlayerController, PlayerState } from './fps/PlayerController';
import {
  applyTextureAnisotropy,
  getMapById,
  getSurfaceHeightAt,
  MapData,
  MapId,
  SurfaceMaterial
} from './maps/MapBuilder';
import { GAME_FEEL_CONFIG } from './config/GameFeelConfig';
import { DEFAULT_GAME_MODE, GAME_MODES, GameModeId } from './config/GameModes';
import { DEFAULT_GAME_SETTINGS, GameSettings } from './config/GraphicsConfig';
import { WEAPONS, WeaponStats } from './weapons/WeaponData';
import { buildDroppedWeaponModel } from './weapons/WeaponViewmodelBuilder';
import { updateLocalProfile } from './profile/PlayerProfile';
import { BloodVfxSystem } from './vfx/BloodVfxSystem';

export type { GameSettings } from './config/GraphicsConfig';
export type { GameModeId } from './config/GameModes';

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

export interface TeamChatMessage {
  id: string;
  senderName: string;
  senderTeam: 'gang' | 'swat';
  textAr: string;
  textEn: string;
  isOrder?: boolean;
  timestamp: number;
}

export interface TacticalRadioOption {
  key: number;
  order: RadioOrderType;
  textAr: string;
  textEn: string;
}

export const TACTICAL_RADIO_COMMANDS: TacticalRadioOption[] = [
  { key: 1, order: 'fall_back', textAr: 'تراجعوا', textEn: 'Fall Back' },
  { key: 2, order: 'defend_me', textAr: 'دافعوا عني', textEn: 'Defend Me' },
  { key: 3, order: 'follow_me', textAr: 'اتبعوني', textEn: 'Follow Me' },
  { key: 4, order: 'hold_here', textAr: 'استقروا هنا', textEn: 'Hold This Position' },
  { key: 5, order: 'enemy_spotted', textAr: 'رأيت عدواً', textEn: 'Enemy Spotted' },
  { key: 6, order: 'need_backup', textAr: 'أحتاج الدعم', textEn: 'Need Backup' },
  { key: 7, order: 'sector_clear', textAr: 'المنطقة خالية', textEn: 'Sector Clear' },
  { key: 8, order: 'go_a', textAr: 'اتجهوا إلى A', textEn: 'Go to Site A' },
  { key: 9, order: 'go_b', textAr: 'اتجهوا إلى B', textEn: 'Go to Site B' }
];

export interface MatchScore {
  gang: number;
  police: number;
  currentRound: number;
  maxRounds: number;
  gameMode: GameModeId;
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
  smokes: { x: number; z: number; radius: number }[];
  colliders: { minX: number; maxX: number; minZ: number; maxZ: number }[];
}

interface ThrownGrenade {
  type: 'hegrenade' | 'smokegrenade';
  ownerName: string;
  ownerTeam: 'gang' | 'swat';
  isPlayerOwner: boolean;
  mesh: THREE.Group;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  age: number;
  fuseTime: number;
  bounceCount: number;
}

interface ActiveSmokeCloud {
  center: THREE.Vector3;
  radius: number;
  targetRadius: number;
  age: number;
  duration: number;
  puffs: {
    mesh: THREE.Mesh;
    offset: THREE.Vector3;
    baseScale: number;
    maxScale: number;
    phase: number;
    rotSpeed: number;
  }[];
}

interface ActiveExplosion {
  coreMesh: THREE.Mesh;
  fireballMesh: THREE.Mesh;
  shockRingMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  fireballMat: THREE.MeshBasicMaterial;
  ringMat: THREE.MeshBasicMaterial;
  flashLight: THREE.PointLight | null;
  lightSlotIndex: number;
  active: boolean;
  age: number;
  duration: number;
  maxScale: number;
  isC4: boolean;
}

interface DroppedWeaponItem {
  id: string;
  weapon: WeaponStats;
  clip: number;
  reserve: number;
  mesh: THREE.Group;
  ringMesh: THREE.Mesh;
  baseY: number;
  phase: number;
}

export class GameEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public isSoftwareGl: boolean;
  private hemiLight!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;
  private currentSettings: GameSettings;

  public currentMap: MapData;
  public mapGroup: THREE.Group | null = null;

  public player: PlayerController;
  public bots: BotController[] = [];
  public teamSize: number = 5;
  public playerTeam: 'gang' | 'swat';

  // Tactical AI Architecture (Map-agnostic analyzer, Dual Commanders, Persistent Nemesis)
  private tacticalProfile!: TacticalMapProfile;
  private gangCommander!: TeamCommander;
  private swatCommander!: TeamCommander;
  private nemesisState: PersistentNemesisState = loadNemesisState();
  private roundPlayerTelemetry!: RoundPlayerTelemetry;
  private telemetrySampleTimer: number = 0;

  // Bomb in world
  public plantedBombMesh: THREE.Group | null = null;
  public droppedBombMesh: THREE.Group | null = null;
  public bombWorldPos: THREE.Vector3 | null = null;
  private bombBeepTimer: number = 0;

  // Match State
  public matchScore: MatchScore;
  public difficultyLevel: number = 1;
  public killFeed: KillFeedItem[] = [];
  public teamChat: TeamChatMessage[] = [];
  private pendingBotReplies: {
    delay: number;
    senderName: string;
    senderTeam: 'gang' | 'swat';
    textAr: string;
    textEn: string;
  }[] = [];

  // Call of Duty Shooting & Blood VFX pools
  private tracerPool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; active: boolean; age: number }[] = [];
  private worldFlashPool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; active: boolean; age: number }[] = [];
  private sparks: { mesh: THREE.Mesh; vel: THREE.Vector3; age: number; maxAge: number }[] = [];
  private headshotTorches: {
    group: THREE.Group;
    haloMesh: THREE.Mesh;
    flameSprite: THREE.Mesh;
    outerCone: THREE.Mesh;
    innerCone: THREE.Mesh;
    haloMat: THREE.MeshBasicMaterial;
    spriteMat: THREE.MeshBasicMaterial;
    outerMat: THREE.MeshBasicMaterial;
    innerMat: THREE.MeshBasicMaterial;
    headBone?: THREE.Bone;
    anchorPos: THREE.Vector3;
    groundY: number;
    age: number;
    maxAge: number;
    seed: number;
  }[] = [];
  private bloodVfx!: BloodVfxSystem;
  private shells: { mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3; age: number }[] = [];
  private dustPuffs: { mesh: THREE.Mesh; age: number; hasMap: boolean }[] = [];
  private bulletDecals: THREE.Mesh[] = [];
  private scorchDecals: THREE.Mesh[] = [];

  // Grenades, Volumetric Smokes, Dropped Weapons & Explosions
  private thrownGrenades: ThrownGrenade[] = [];
  private activeSmokes: ActiveSmokeCloud[] = [];
  private droppedWeapons: DroppedWeaponItem[] = [];
  private explosionPool: ActiveExplosion[] = [];
  private explosionLightPool: { light: THREE.PointLight; inUse: boolean }[] = [];
  private freeSmokeMats: THREE.MeshBasicMaterial[] = [];
  private smokeSoftTexture: THREE.CanvasTexture;
  private staticRadarColliders: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];

  // Shared FX Geometries
  private tracerGeo: THREE.CylinderGeometry;
  private sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
  private headshotSparkGeo = new THREE.BoxGeometry(0.022, 0.022, 0.14);
  private torchOuterGeo: THREE.ConeGeometry;
  private torchInnerGeo: THREE.ConeGeometry;
  private shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.032, 6);
  private dustGeo = new THREE.SphereGeometry(0.14, 6, 6);
  private worldFlashGeo = new THREE.SphereGeometry(0.16, 6, 6);
  private decalGeo = new THREE.CircleGeometry(0.055, 8);
  private smokePlaneGeo = new THREE.PlaneGeometry(1, 1);
  private blastSphereGeo = new THREE.SphereGeometry(1, 18, 14);
  private shockRingGeo = new THREE.RingGeometry(0.68, 1.0, 28);
  private scorchGeo = new THREE.CircleGeometry(1, 18);
  private heBodyGeo = new THREE.SphereGeometry(0.085, 10, 8);
  private heBandGeo = new THREE.TorusGeometry(0.078, 0.012, 6, 12);
  private smokeBodyGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.22, 12);
  private smokeStripeGeo = new THREE.CylinderGeometry(0.072, 0.072, 0.045, 12);
  private dropRingGeo = new THREE.RingGeometry(0.28, 0.35, 24);

  // Shared Materials (eliminates per-particle material compilation & GC pressure)
  private sharedBasicMats = new Map<number, THREE.MeshBasicMaterial>();
  private shellMat = new THREE.MeshStandardMaterial({ color: 0xe6b84c, metalness: 0.9, roughness: 0.25 });
  private heBodyMat = new THREE.MeshStandardMaterial({ color: 0x3b4d2b, roughness: 0.6, metalness: 0.3 });
  private heBandMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  private smokeBodyMat = new THREE.MeshStandardMaterial({ color: 0x525b66, roughness: 0.5, metalness: 0.45 });
  private smokeStripeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  private dropRingMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x18181b,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  private scorchDecalMat = new THREE.MeshBasicMaterial({
    color: 0x101012,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });

  // Pre-allocated scratch math objects
  private readonly _tmpVecA = new THREE.Vector3();
  private readonly _tmpVecB = new THREE.Vector3();
  private readonly _tmpVecC = new THREE.Vector3();
  private readonly _tmpVecD = new THREE.Vector3();
  private readonly _tmpNormal = new THREE.Vector3();
  private readonly _tmpBox = new THREE.Box3();
  private readonly _tmpRay = new THREE.Ray();
  private readonly _tmpRaycaster = new THREE.Raycaster();
  private readonly _tmpBlastHit = new THREE.Vector3();

  // Round transition & HUD sync timers
  private roundEndDelayTimer: number = 0;
  private isRoundOverWaiting: boolean = false;
  private scoreNotifyTimer: number = 0;
  private radarNotifyTimer: number = 0;
  private fxSeq = 0;
  private droppedSeq = 0;
  private elapsedTime = 0;
  private matchXpEarned: number = 0;
  private matchHeadshots: number = 0;
  private currentKillStreak: number = 0;
  private defuseAlertCooldown: number = 0;
  private smoothedDt: number = 1 / 60;
  private vfxQualityScale: number = 1.0;

  // Callbacks for UI updates
  public onScoreUpdate?: (score: MatchScore) => void;
  public onKillFeedUpdate?: (feed: KillFeedItem[]) => void;
  public onTeamChatUpdate?: (chat: TeamChatMessage[]) => void;
  public onPlayerStateUpdate?: (state: PlayerState) => void;
  public onMatchEnd?: (winner: 'gang' | 'swat') => void;
  public onHitFeedback?: (ev: HitFeedbackEvent) => void;
  public onDamageTaken?: (ev: DamageIndicatorEvent) => void;
  public onRadarUpdate?: (radar: RadarSnapshot) => void;

  private gameMode: GameModeId;

  constructor(
    canvasContainer: HTMLElement,
    mapId: MapId,
    playerTeam: 'gang' | 'swat',
    teamSize: number = 5,
    settings?: Partial<GameSettings>,
    gameMode: GameModeId = DEFAULT_GAME_MODE
  ) {
    this.playerTeam = playerTeam;
    this.teamSize = Math.max(5, Math.min(8, teamSize));
    this.gameMode = GAME_MODES[gameMode] ? gameMode : DEFAULT_GAME_MODE;
    this.currentSettings = { ...DEFAULT_GAME_SETTINGS, ...settings };

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
    const initFov = THREE.MathUtils.clamp(Number(this.currentSettings.fov) || 75, 60, 100);
    this.camera = new THREE.PerspectiveCamera(initFov, window.innerWidth / window.innerHeight, 0.1, 240);
    this.scene.add(this.camera);

    // Renderer with ACESFilmic Tone Mapping & SRGB
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && this.currentSettings.antialias !== false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && this.currentSettings.shadows !== 'off';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(this.renderer.domElement);

    // Pre-build unit-length shared FX geometries
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.006, 1, 5);
    this.tracerGeo.translate(0, 0.5, 0);
    this.tracerGeo.rotateX(Math.PI / 2);

    this.torchOuterGeo = new THREE.ConeGeometry(0.17, 0.78, 10, 1, true);
    this.torchOuterGeo.translate(0, 0.39, 0);
    this.torchInnerGeo = new THREE.ConeGeometry(0.085, 0.46, 8, 1, true);
    this.torchInnerGeo.translate(0, 0.23, 0);

    // PBR Environment Reflection Map (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.smokeSoftTexture = this.createSoftSmokeTexture();

    // Load Map, analyze geometry/sightlines for AI & precompute radar colliders
    this.currentMap = getMapById(mapId);
    this.tacticalProfile = analyzeMapTactics(this.currentMap);
    this.gangCommander = new TeamCommander('gang', this.tacticalProfile);
    this.swatCommander = new TeamCommander('swat', this.tacticalProfile);
    this.roundPlayerTelemetry = this.createFreshTelemetry();
    this.staticRadarColliders = this.currentMap.colliders
      .filter((c) => c.max.y > 2.2)
      .map((c) => ({ minX: c.min.x, maxX: c.max.x, minZ: c.min.z, maxZ: c.max.z }));
    this.bloodVfx = new BloodVfxSystem(this.scene, this.renderer.capabilities.getMaxAnisotropy());
    this.setupEnvironment();

    // Player Controller
    this.player = new PlayerController(this.camera, playerTeam, this.scene);
    this.player.defaultGroundSurface = this.currentMap.defaultGroundSurface ?? 'concrete';
    this.applyGraphicsSettings(this.currentSettings);
    this.player.onStateChange = (st) => this.onPlayerStateUpdate?.(st);
    this.player.onShoot = (hitPoint, isHeadshot, muzzleWorld) =>
      this.handlePlayerShoot(hitPoint, isHeadshot, muzzleWorld);
    this.player.onThrowGrenade = (type, origin, velocity) => {
      this.spawnThrownGrenade(type, origin, velocity, 'أنت (You)', this.playerTeam, true);
    };
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
    this.player.onTryPickupWeapon = () => this.tryPlayerPickupWeapon();

    // Match Score Init
    const modeCfg = GAME_MODES[this.gameMode];
    this.matchScore = {
      gang: 0,
      police: 0,
      currentRound: 1,
      maxRounds: modeCfg.totalRounds,
      gameMode: this.gameMode,
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

    // Pre-allocate Explosion Lights, Visual Rigs & Smoke Material Pool before shader compile
    const warmupCleanup = this.initExplosionAndFxPools();

    // Start Round 1
    this.startNewRound();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Hide pooled explosion rigs & remove temporary warmup objects after compile
    this.finishFxWarmup(warmupCleanup);

    window.addEventListener('resize', this.onResize);
    sound.startAmbience();
  }

  private computeSpatialAudio(pos: THREE.Vector3, maxDist: number): { atten: number; pan: number } {
    const dx = pos.x - this.player.position.x;
    const dz = pos.z - this.player.position.z;
    const dist = Math.hypot(dx, dz);
    const atten = Math.max(0, 1 - dist / maxDist);
    const yaw = this.player.yaw;
    const pan = dist > 0.2 ? THREE.MathUtils.clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist, -1, 1) : 0;
    return { atten, pan };
  }

  private setupEnvironment() {
    const lp = this.currentMap.lightingProfile;
    this.scene.background = new THREE.Color(this.currentMap.skyColor);
    this.scene.fog = new THREE.Fog(this.currentMap.fogColor, lp.fogNear, lp.fogFar);
    this.renderer.toneMappingExposure = lp.exposure;
    this.scene.environmentIntensity = lp.envIntensity;

    // Warm/cool sky/ground hemisphere fill + crisp directional sun/moon key light
    this.hemiLight = new THREE.HemisphereLight(
      this.currentMap.skyColor,
      this.currentMap.groundColor,
      lp.hemiIntensity
    );
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(this.currentMap.lightColor, lp.sunIntensity);
    this.dirLight.position.set(lp.sunPosition[0], lp.sunPosition[1], lp.sunPosition[2]);
    this.dirLight.target.position.set(0, 0, 0);
    this.scene.add(this.dirLight.target);
    this.dirLight.castShadow = !this.isSoftwareGl;
    this.dirLight.shadow.mapSize.set(1536, 1536);
    this.dirLight.shadow.camera.near = 4;
    this.dirLight.shadow.camera.far = 155;
    this.dirLight.shadow.camera.left = -56;
    this.dirLight.shadow.camera.right = 56;
    this.dirLight.shadow.camera.top = 56;
    this.dirLight.shadow.camera.bottom = -56;
    this.dirLight.shadow.bias = -0.00035;
    this.dirLight.shadow.normalBias = 0.035;
    this.scene.add(this.dirLight);

    this.mapGroup = this.currentMap.buildScene(this.scene);
    // Freeze static map matrices so Three.js doesn't recompute hundreds of static transforms every frame
    if (this.mapGroup) {
      this.mapGroup.updateMatrixWorld(true);
      this.bloodVfx.registerMapGroup(this.mapGroup);
      this.mapGroup.traverse((obj) => {
        obj.matrixAutoUpdate = false;
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.castShadow) {
          if (mesh.geometry instanceof THREE.PlaneGeometry || mesh.geometry instanceof THREE.CircleGeometry) {
            mesh.castShadow = false;
          }
        }
      });
    }
  }

  public applyGraphicsSettings(nextSettings: Partial<GameSettings>) {
    this.currentSettings = { ...this.currentSettings, ...nextSettings };
    const s = this.currentSettings;

    // 1. Pixel Resolution Scale (جودة البكسلات)
    const rawScale = THREE.MathUtils.clamp(Number(s.pixelRatioScale) || 1.0, 0.5, 2.0);
    const effectiveRatio = this.isSoftwareGl ? Math.min(1.0, rawScale) : rawScale;
    if (Math.abs(this.renderer.getPixelRatio() - effectiveRatio) > 0.01) {
      this.renderer.setPixelRatio(effectiveRatio);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // 2. Shadow Quality (جودة الظلال)
    const shadowQual = this.isSoftwareGl ? 'off' : s.shadows;
    if (shadowQual === 'off') {
      this.renderer.shadowMap.enabled = false;
      this.dirLight.castShadow = false;
    } else {
      const mapSize = shadowQual === 'high' ? 2048 : shadowQual === 'medium' ? 1536 : 1024;
      const targetType = shadowQual === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      const radius = shadowQual === 'high' ? 2.5 : shadowQual === 'medium' ? 2.0 : 1.0;

      this.renderer.shadowMap.enabled = true;
      this.dirLight.castShadow = true;
      this.dirLight.shadow.radius = radius;

      let needsShadowReset = false;
      if (this.renderer.shadowMap.type !== targetType) {
        this.renderer.shadowMap.type = targetType;
        needsShadowReset = true;
      }
      if (this.dirLight.shadow.mapSize.width !== mapSize) {
        this.dirLight.shadow.mapSize.set(mapSize, mapSize);
        if (this.dirLight.shadow.map) {
          this.dirLight.shadow.map.dispose();
          this.dirLight.shadow.map = null;
        }
        needsShadowReset = true;
      }
      if (needsShadowReset) {
        this.renderer.shadowMap.needsUpdate = true;
      }
    }

    // 3. Reflections & Environment Lighting Balance (الانعكاسات والإضاءة)
    const lp = this.currentMap.lightingProfile;
    if (s.reflections === 'off') {
      this.scene.environmentIntensity = 0;
      this.hemiLight.intensity = lp.hemiIntensity * 1.18;
    } else if (s.reflections === 'low') {
      this.scene.environmentIntensity = lp.envIntensity * 0.45;
      this.hemiLight.intensity = lp.hemiIntensity * 1.06;
    } else {
      this.scene.environmentIntensity = lp.envIntensity;
      this.hemiLight.intensity = lp.hemiIntensity;
    }

    // 4. Texture Anisotropic Filtering (حِدّة الخامات)
    const maxCapAniso = this.renderer.capabilities.getMaxAnisotropy();
    const targetAniso =
      s.textureQuality === 'low'
        ? 1
        : s.textureQuality === 'medium'
          ? Math.min(4, maxCapAniso)
          : Math.min(16, maxCapAniso);
    applyTextureAnisotropy(targetAniso);

    // 5. Player Camera FOV, Sensitivity & Comfort
    if (this.player) {
      this.player.mouseSensitivity = s.mouseSensitivity;
      this.player.reducedMotion = Boolean(s.reducedMotion);
      this.player.baseFov = THREE.MathUtils.clamp(Number(s.fov) || 75, 60, 100);
      if (!this.player.state.isADS && !this.player.state.isScoped) {
        this.camera.fov = this.player.baseFov;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  private createFreshTelemetry(): RoundPlayerTelemetry {
    return {
      mapId: this.currentMap.id,
      playerTeam: this.playerTeam,
      zoneTicks: { site_a: 0, mid: 0, site_b: 0 },
      nodeTicks: {},
      shotsFiredAtBots: 0,
      shotsHitOnBots: 0,
      shotsMissedVsMoving: 0,
      shotsAtMoving: 0,
      playerHitsLanded: 0,
      playerHeadshotsLanded: 0,
      heDamageTaken: 0,
      diedToHE: false,
      diedToLongRange: false,
      diedToCloseRush: false,
      avgCombatDist: 18,
      combatSamples: 0
    };
  }

  private createBots() {
    const gangNames = ['Falcon', 'Shadow', 'Ghost', 'Viper', 'Razor', 'Wolf', 'Rex', 'Titan'];
    const swatNames = ['Bravo-1', 'Eagle', 'Delta-4', 'Hunter', 'Striker', 'Sentry', 'Shield', 'Vanguard'];

    this.bots = [];
    const playerIsGang = this.playerTeam === 'gang';

    const gangBotsCount = playerIsGang ? this.teamSize - 1 : this.teamSize;
    const gangRoster = generateTeamTraitRoster('gang', gangBotsCount);
    for (let i = 0; i < gangBotsCount; i++) {
      const name = gangNames[i % gangNames.length] + (i >= gangNames.length ? ' II' : '');
      const bot = new BotController('gang_bot_' + i, name, 'gang', this.scene, 'attacker', gangRoster[i]);
      this.setupBotCallbacks(bot);
      this.bots.push(bot);
    }

    const swatBotsCount = playerIsGang ? this.teamSize : this.teamSize - 1;
    const swatRoster = generateTeamTraitRoster('swat', swatBotsCount);
    for (let i = 0; i < swatBotsCount; i++) {
      const name = swatNames[i % swatNames.length] + (i >= swatNames.length ? ' II' : '');
      const bot = new BotController('swat_bot_' + i, name, 'swat', this.scene, 'attacker', swatRoster[i]);
      this.setupBotCallbacks(bot);
      this.bots.push(bot);
    }
  }

  private setupBotCallbacks(bot: BotController) {
    bot.onEnemySpotted = (spotter, enemyPos, hasC4) => {
      const cmd = spotter.team === 'gang' ? this.gangCommander : this.swatCommander;
      cmd.recordEnemySighting(enemyPos);

      const zone = this.tacticalProfile.classifyPositionZone(enemyPos);
      const siteHint: 'site_a' | 'site_b' | undefined =
        zone === 'site_a' ? 'site_a' : zone === 'site_b' ? 'site_b' : undefined;

      this.bots.forEach((ally) => {
        if (ally.team === spotter.team && ally.id !== spotter.id && ally.state.isAlive) {
          if (ally.position.distanceTo(spotter.position) < 52) {
            ally.receiveRadioCallout(enemyPos, siteHint, hasC4);
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

    bot.onNeedBackup = (caller, threatPos) => {
      this.bots.forEach((ally) => {
        if (
          ally.team === caller.team &&
          ally.id !== caller.id &&
          ally.state.isAlive &&
          ally.position.distanceTo(caller.position) < 42
        ) {
          ally.receiveRadioCallout(threatPos, undefined, true);
        }
      });
    };

    bot.onShoot = (aimPoint, isHeadshotIntent, targetId) => {
      const shooterMuzzle = this._tmpVecA.copy(bot.position);
      shooterMuzzle.y += 1.42;
      this.spawnWorldMuzzleFlash(shooterMuzzle);

      // Alert nearby bots of gunfire
      for (const b of this.bots) {
        if (b.id !== bot.id) b.alertToGunfire(shooterMuzzle);
      }

      // Mark firing enemy briefly on player's tactical radar
      if (bot.team !== this.playerTeam) {
        bot.lastSpottedTime = Date.now();
      }

      // Physical raycast along bot's dispersed aim line (supports genuine misses!)
      const bulletDir = this._tmpVecB.copy(aimPoint).sub(shooterMuzzle);
      if (bulletDir.lengthSq() < 0.0001) return;
      bulletDir.normalize();

      const ray = this._tmpRay.set(shooterMuzzle, bulletDir);
      const box = this._tmpBox;
      const hitTmp = this._tmpVecC;
      const wallHitPoint = this._tmpVecD;
      let hasWallHit = false;
      let wallHitDist = Infinity;
      const wallNormal = this._tmpNormal.set(0, 1, 0);
      let wallSurface: SurfaceMaterial = 'concrete';

      for (const c of this.currentMap.colliders) {
        box.set(c.min, c.max);
        const hit = ray.intersectBox(box, hitTmp);
        if (hit) {
          const d = shooterMuzzle.distanceTo(hit);
          if (d < wallHitDist) {
            wallHitDist = d;
            wallHitPoint.copy(hit);
            hasWallHit = true;
            this.computeBoxNormalOut(hit, box, wallNormal);
            wallSurface = c.surface ?? 'concrete';
          }
        }
      }

      if (targetId === 'player' && this.player.state.isAlive) {
        const py = this.player.position.y;
        const crouching = this.player.state.isCrouching;
        const pHead = this._tmpVecC.set(this.player.position.x, py + (crouching ? 1.02 : 1.54), this.player.position.z);
        const pChest = new THREE.Vector3(this.player.position.x, py + (crouching ? 0.65 : 1.04), this.player.position.z);
        const targetDist = shooterMuzzle.distanceTo(pChest);

        const headHit = ray.distanceToPoint(pHead) < 0.25 && isHeadshotIntent;
        const bodyHit = headHit || ray.distanceToPoint(pChest) < 0.44;

        if (!bodyHit || wallHitDist < targetDist - 0.25) {
          const missEnd = hasWallHit
            ? wallHitPoint
            : pChest.copy(shooterMuzzle).addScaledVector(bulletDir, Math.min(55, targetDist + 10));
          this.createBulletTracer(shooterMuzzle, missEnd);
          if (hasWallHit) this.spawnImpactEffects(wallHitPoint, wallNormal, false, wallSurface);
          // Battlefield-style supersonic bullet whiz when enemy shot barely misses player
          if (bot.team !== this.playerTeam && wallHitDist > targetDist - 1.2) {
            ray.closestPointToPoint(this.camera.position, pChest);
            if (pChest.distanceTo(this.camera.position) < 3.6) {
              const { pan } = this.computeSpatialAudio(pChest, 20);
              sound.playBulletWhiz(pan);
            }
          }
          return;
        }

        const hitSpot = headHit ? pHead : pChest;
        this.createBulletTracer(shooterMuzzle, hitSpot);

        const botDamageFactor = Math.min(0.84, 0.50 + (bot.difficultyLevel - 1) * 0.032);
        const damage = bot.state.weapon.damage * (headHit ? 1.4 : 1.0) * botDamageFactor;
        const died = this.player.takeDamage(damage, headHit);
        if (died) {
          this.bloodVfx.spawnDeathBloodBurst(
            this.player.position,
            hitSpot,
            bulletDir,
            headHit,
            this.vfxQualityScale
          );
        } else {
          this.spawnBloodSparks(hitSpot, headHit, bulletDir, this.player.position.y);
        }
        sound.playHitmarker(headHit, false);

        const dx = shooterMuzzle.x - this.player.position.x;
        const dz = shooterMuzzle.z - this.player.position.z;
        const worldAngle = Math.atan2(dx, -dz);
        const playerLookAngle = -this.player.yaw;
        const relAngle = worldAngle - playerLookAngle;
        this.onDamageTaken?.({ id: ++this.fxSeq, relativeAngle: relAngle, damageAmount: damage });

        if (died) {
          this.currentKillStreak = 0;
          const killerDist = bot.position.distanceTo(this.player.position);
          if (killerDist > 21 || bot.state.weapon.id === 'awp') {
            this.roundPlayerTelemetry.diedToLongRange = true;
          } else if (killerDist < 11) {
            this.roundPlayerTelemetry.diedToCloseRush = true;
          }
          updateLocalProfile((p) => {
            p.deaths++;
          });
          this.addFeedItem(bot.name, bot.team, 'أنت (You)', this.playerTeam, bot.state.weapon.name, headHit);
          bot.state.kills++;
          bot.roundKills++;
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
          const bHead = this._tmpVecC;
          targetBot.char.headBone.getWorldPosition(bHead);
          const bChest = new THREE.Vector3();
          targetBot.char.chestBone.getWorldPosition(bChest);
          const targetDist = shooterMuzzle.distanceTo(bChest);

          const headHit = ray.distanceToPoint(bHead) < 0.25 && isHeadshotIntent;
          const bodyHit = headHit || ray.distanceToPoint(bChest) < 0.44;

          if (!bodyHit || wallHitDist < targetDist - 0.25) {
            const missEnd = hasWallHit
              ? wallHitPoint
              : bChest.copy(shooterMuzzle).addScaledVector(bulletDir, Math.min(55, targetDist + 10));
            this.createBulletTracer(shooterMuzzle, missEnd);
            if (hasWallHit) this.spawnImpactEffects(wallHitPoint, wallNormal, false, wallSurface);
            return;
          }

          const bloodPos = headHit ? bHead : bChest;
          this.createBulletTracer(shooterMuzzle, bloodPos);

          const damage = bot.state.weapon.damage * (headHit ? 2.1 : 1.0);
          const died = targetBot.takeDamage(damage, headHit, bot.position);
          if (died) {
            this.bloodVfx.spawnDeathBloodBurst(
              targetBot.position,
              bloodPos,
              bulletDir,
              headHit,
              this.vfxQualityScale
            );
            if (headHit) {
              this.spawnHeadshotKillTorch(bHead, bulletDir, targetBot.char.headBone, targetBot.position.y);
            }
            this.addFeedItem(bot.name, bot.team, targetBot.name, targetBot.team, bot.state.weapon.name, headHit);
            bot.state.kills++;
            bot.roundKills++;
            bot.state.score += 2;
            this.checkRoundEndConditions();
          } else {
            this.spawnBloodSparks(bloodPos, headHit, bulletDir, targetBot.position.y);
          }
        }
      }
    };

    bot.onPlantCompleted = (site, pos) => {
      this.plantBomb(site, pos);
      if (bot.team === this.playerTeam) {
        this.addTeamChat(bot.name, bot.team, `زرعت القنبلة في الموقع ${site}!`, `Bomb planted at Site ${site}!`);
      }
    };

    bot.onThrowGrenade = (thrower, type, origin, velocity) => {
      this.spawnThrownGrenade(type, origin, velocity, thrower.name, thrower.team, false);
      const { atten, pan } = this.computeSpatialAudio(thrower.position, 44);
      if (atten > 0.05) sound.playGrenadeThrow(atten, pan);
      if (thrower.team === this.playerTeam && atten > 0 && Math.random() < 0.75) {
        if (type === 'smokegrenade') {
          this.addTeamChat(thrower.name, thrower.team, 'أطلقت قنبلة دخانية!', 'Smoke out!');
        } else {
          this.addTeamChat(thrower.name, thrower.team, 'ألقيت قنبلة يدوية!', 'Frag out!');
        }
      }
    };

    bot.onDefuseCompleted = () => {
      this.defuseBomb();
    };

    bot.onDeath = (deadBot) => {
      if (deadBot.state.hasC4) {
        this.dropC4(deadBot.position.clone());
        deadBot.state.hasC4 = false;
      }
      const dropClip =
        deadBot.state.currentAmmo > 0
          ? deadBot.state.currentAmmo
          : Math.max(1, Math.ceil(deadBot.state.weapon.magazineSize * 0.65));
      const dropReserve = Math.max(
        deadBot.state.weapon.magazineSize,
        Math.round(deadBot.state.weapon.maxReserve * 0.7)
      );
      this.spawnDroppedWeapon(deadBot.position, deadBot.state.weapon, dropClip, dropReserve);

      // Squad trade-kill callout to nearby teammates
      this.bots.forEach((ally) => {
        if (ally.id !== deadBot.id && ally.team === deadBot.team) {
          ally.notifyAllyDown(deadBot.position);
        }
      });
      this.checkRoundEndConditions();
    };
  }

  private createSoftSmokeTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    // Multi-lobe radial cloud puff for authentic organic CS2 smoke volume
    const lobes = [
      { x: 64, y: 64, r: 58, a: 0.72 },
      { x: 46, y: 54, r: 36, a: 0.45 },
      { x: 82, y: 58, r: 34, a: 0.45 },
      { x: 62, y: 80, r: 38, a: 0.4 }
    ];
    for (const l of lobes) {
      const grad = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, l.r);
      grad.addColorStop(0, `rgba(240, 244, 248, ${l.a})`);
      grad.addColorStop(0.45, `rgba(200, 210, 220, ${l.a * 0.65})`);
      grad.addColorStop(1, 'rgba(160, 172, 185, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  private getSharedBasicMat(hex: number): THREE.MeshBasicMaterial {
    let mat = this.sharedBasicMats.get(hex);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: hex });
      this.sharedBasicMats.set(hex, mat);
    }
    return mat;
  }

  private computeBoxNormalOut(point: THREE.Vector3, box: THREE.Box3, out: THREE.Vector3): THREE.Vector3 {
    const eps = 0.02;
    if (Math.abs(point.x - box.min.x) < eps) return out.set(-1, 0, 0);
    if (Math.abs(point.x - box.max.x) < eps) return out.set(1, 0, 0);
    if (Math.abs(point.z - box.min.z) < eps) return out.set(0, 0, -1);
    if (Math.abs(point.z - box.max.z) < eps) return out.set(0, 0, 1);
    if (Math.abs(point.y - box.max.y) < eps) return out.set(0, 1, 0);
    return out.set(0, -1, 0);
  }

  public restartMatch() {
    sound.stopOutcomeSounds();
    this.difficultyLevel = 1;
    const modeCfg = GAME_MODES[this.gameMode];
    this.matchScore = {
      gang: 0,
      police: 0,
      currentRound: 1,
      maxRounds: modeCfg.totalRounds,
      gameMode: this.gameMode,
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
    this.teamChat = [];
    this.pendingBotReplies = [];
    this.matchXpEarned = 0;
    this.matchHeadshots = 0;
    this.currentKillStreak = 0;

    this.clearRoundTransientFX();
    this.gangCommander.resetMatch();
    this.swatCommander.resetMatch();
    this.roundPlayerTelemetry = this.createFreshTelemetry();

    this.player.resetMatch();
    this.bots.forEach((b) => {
      b.state.kills = 0;
      b.state.deaths = 0;
      b.state.score = 0;
    });

    this.startNewRound();
    this.onKillFeedUpdate?.([]);
    this.onTeamChatUpdate?.([]);
    this.onScoreUpdate?.({ ...this.matchScore });
    this.onPlayerStateUpdate?.({ ...this.player.state });
  }

  private clearRoundTransientFX() {
    for (const tr of this.tracerPool) {
      tr.active = false;
      tr.mesh.visible = false;
    }
    for (const wf of this.worldFlashPool) {
      wf.active = false;
      wf.mesh.visible = false;
    }
    for (const sh of this.shells) {
      this.scene.remove(sh.mesh);
    }
    this.shells = [];
    for (const dp of this.dustPuffs) {
      this.scene.remove(dp.mesh);
      const mat = dp.mesh.material as THREE.MeshBasicMaterial;
      if (dp.hasMap) {
        this.releaseSmokeMat(mat);
      } else {
        mat.dispose();
      }
    }
    this.dustPuffs = [];
    for (const sp of this.sparks) {
      this.scene.remove(sp.mesh);
    }
    this.sparks = [];
    for (const ht of this.headshotTorches) {
      this.scene.remove(ht.group);
      ht.haloMat.dispose();
      ht.spriteMat.dispose();
      ht.outerMat.dispose();
      ht.innerMat.dispose();
    }
    this.headshotTorches = [];
    this.bloodVfx.clearRound();

    for (const g of this.thrownGrenades) {
      this.scene.remove(g.mesh);
    }
    this.thrownGrenades = [];

    for (const sm of this.activeSmokes) {
      for (const p of sm.puffs) {
        this.scene.remove(p.mesh);
        this.releaseSmokeMat(p.mesh.material as THREE.MeshBasicMaterial);
      }
    }
    this.activeSmokes = [];

    for (const dw of this.droppedWeapons) {
      this.scene.remove(dw.mesh, dw.ringMesh);
      this.disposeObjectTree(dw.mesh);
    }
    this.droppedWeapons = [];
    this.player.state.nearbyDroppedWeapon = null;

    for (const ex of this.explosionPool) {
      ex.active = false;
      ex.coreMesh.visible = false;
      ex.fireballMesh.visible = false;
      ex.shockRingMesh.visible = false;
      if (ex.flashLight && ex.lightSlotIndex >= 0) {
        ex.flashLight.intensity = 0;
        this.explosionLightPool[ex.lightSlotIndex].inUse = false;
        ex.flashLight = null;
        ex.lightSlotIndex = -1;
      }
    }
  }

  private disposeObjectTree(root: THREE.Object3D) {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
          mesh.geometry.dispose();
          disposedGeos.add(mesh.geometry);
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m && !disposedMats.has(m)) {
            m.dispose();
            disposedMats.add(m);
          }
        }
      }
    });
  }

  private spawnDroppedWeapon(pos: THREE.Vector3, weapon: WeaponStats, clip: number, reserve: number) {
    if (weapon.slot !== 1 && weapon.slot !== 2) return;

    if (this.droppedWeapons.length >= 16) {
      const oldest = this.droppedWeapons.shift()!;
      this.scene.remove(oldest.mesh, oldest.ringMesh);
      this.disposeObjectTree(oldest.mesh);
    }

    const groundY = getSurfaceHeightAt(
      pos.x,
      pos.z,
      pos.y + 0.5,
      this.currentMap.colliders,
      this.currentMap.ramps,
      0.25
    );
    const modelTeam: 'gang' | 'swat' = weapon.team === 'swat' ? 'swat' : 'gang';
    const mesh = buildDroppedWeaponModel(weapon, modelTeam);
    mesh.scale.setScalar(1.2);
    const baseY = groundY + 0.72;
    mesh.position.set(pos.x, baseY, pos.z);
    mesh.rotation.set(0.12, Math.random() * Math.PI * 2, 0.08);

    const ringMesh = new THREE.Mesh(this.dropRingGeo, this.dropRingMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(pos.x, groundY + 0.03, pos.z);

    this.scene.add(mesh, ringMesh);
    this.droppedWeapons.push({
      id: `drop_${++this.droppedSeq}`,
      weapon: { ...weapon },
      clip,
      reserve,
      mesh,
      ringMesh,
      baseY,
      phase: Math.random() * Math.PI * 2
    });
  }

  private findNearestDroppedWeaponIndex(): number {
    if (!this.player.state.isAlive || this.player.state.isPlanting || this.player.state.isDefusing) {
      return -1;
    }
    let bestIdx = -1;
    let bestDistSq = 2.6 * 2.6;
    const px = this.player.position.x;
    const py = this.player.position.y + 0.9;
    const pz = this.player.position.z;

    for (let i = 0; i < this.droppedWeapons.length; i++) {
      const dw = this.droppedWeapons[i];
      const dx = dw.mesh.position.x - px;
      const dy = dw.mesh.position.y - py;
      const dz = dw.mesh.position.z - pz;
      if (Math.abs(dy) > 2.2) continue;
      const distSq = dx * dx + dz * dz;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private updateNearbyDroppedWeaponHint() {
    const idx = this.findNearestDroppedWeaponIndex();
    const closest = idx >= 0 ? this.droppedWeapons[idx] : null;
    const replaced = closest ? this.player.state.weapons[closest.weapon.slot] : null;
    const nextNearby = closest
      ? {
          id: closest.id,
          weaponId: closest.weapon.id,
          weaponName: closest.weapon.name,
          weaponNameAr: closest.weapon.nameAr,
          willSwap: Boolean(replaced),
          replacedWeaponName: replaced ? replaced.name : undefined
        }
      : null;

    const prev = this.player.state.nearbyDroppedWeapon;
    const changed =
      prev?.id !== nextNearby?.id ||
      prev?.willSwap !== nextNearby?.willSwap ||
      prev?.replacedWeaponName !== nextNearby?.replacedWeaponName;

    if (changed) {
      this.player.state.nearbyDroppedWeapon = nextNearby;
      this.onPlayerStateUpdate?.({ ...this.player.state });
    }
  }

  private tryPlayerPickupWeapon(): boolean {
    const idx = this.findNearestDroppedWeaponIndex();
    if (idx < 0) return false;

    const item = this.droppedWeapons[idx];
    this.droppedWeapons.splice(idx, 1);
    this.scene.remove(item.mesh, item.ringMesh);
    this.disposeObjectTree(item.mesh);

    const prevWeapon = this.player.state.weapons[item.weapon.slot];
    if (prevWeapon) {
      const dropPos = this._tmpVecA.copy(this.player.position);
      const fwdX = -Math.sin(this.player.yaw);
      const fwdZ = -Math.cos(this.player.yaw);
      const candX = dropPos.x + fwdX * 0.65;
      const candZ = dropPos.z + fwdZ * 0.65;
      const blocked = this.currentMap.colliders.some(
        (c) =>
          candX + 0.25 > c.min.x &&
          candX - 0.25 < c.max.x &&
          candZ + 0.25 > c.min.z &&
          candZ - 0.25 < c.max.z &&
          dropPos.y + 0.4 < c.max.y &&
          dropPos.y + 1.5 > c.min.y
      );
      if (!blocked) {
        dropPos.x = candX;
        dropPos.z = candZ;
      }
      const prevAmmo = this.player.state.ammo[prevWeapon.id];
      this.spawnDroppedWeapon(
        dropPos,
        prevWeapon,
        prevAmmo?.clip ?? prevWeapon.magazineSize,
        prevAmmo?.reserve ?? prevWeapon.maxReserve
      );
    }

    this.player.equipWorldWeapon(item.weapon, item.clip, item.reserve);
    this.updateNearbyDroppedWeaponHint();
    return true;
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

    // Clean up round decals, projectiles, smokes & world bomb meshes
    this.clearRoundTransientFX();
    this.bulletDecals.forEach((d) => this.scene.remove(d));
    this.bulletDecals = [];
    this.scorchDecals.forEach((d) => this.scene.remove(d));
    this.scorchDecals = [];

    if (this.plantedBombMesh) {
      this.scene.remove(this.plantedBombMesh);
      this.plantedBombMesh = null;
    }
    if (this.droppedBombMesh) {
      this.scene.remove(this.droppedBombMesh);
      this.droppedBombMesh = null;
    }
    this.bombWorldPos = null;

    this.roundPlayerTelemetry = this.createFreshTelemetry();
    this.telemetrySampleTimer = 0;

    // Pick C4 Carrier among Gang members
    const gangBots = this.bots.filter((b) => b.team === 'gang');
    const swatBots = this.bots.filter((b) => b.team === 'swat');
    const gangMembers: ('player' | BotController)[] = [];
    if (this.playerTeam === 'gang') gangMembers.push('player');
    gangBots.forEach((b) => gangMembers.push(b));

    const carrierIndex = Math.floor(Math.random() * gangMembers.length);
    const chosenCarrier = gangMembers[carrierIndex];

    // Spawn Player
    const playerSpawns = this.playerTeam === 'gang' ? this.currentMap.tSpawns : this.currentMap.ctSpawns;
    const playerSpawn = playerSpawns[0];
    const playerHasC4 = chosenCarrier === 'player';
    this.player.resetRound(playerSpawn, playerHasC4);

    // Persistent team-agnostic Nemesis advice only feeds the team opposing the human player
    const nemesisAdvice = getNemesisCounterAdvice(
      this.nemesisState,
      this.currentMap.id,
      this.playerTeam === 'swat'
    );

    // Dual Team Commanders plan roles, target zones & orders non-randomly
    const gangPlan = this.gangCommander.planRound(
      gangBots,
      this.matchScore.currentRound,
      playerHasC4,
      this.playerTeam === 'gang',
      this.playerTeam === 'swat' ? nemesisAdvice : null
    );
    const swatPlan = this.swatCommander.planRound(
      swatBots,
      this.matchScore.currentRound,
      false,
      this.playerTeam === 'swat',
      this.playerTeam === 'gang' ? nemesisAdvice : null
    );

    // Spawn Bots with Commander-assigned roles & trait-grounded gear
    let tIdx = this.playerTeam === 'gang' ? 1 : 0;
    let ctIdx = this.playerTeam === 'swat' ? 1 : 0;

    this.bots.forEach((bot) => {
      const isGang = bot.team === 'gang';
      const spawnList = isGang ? this.currentMap.tSpawns : this.currentMap.ctSpawns;
      const spawn = spawnList[(isGang ? tIdx++ : ctIdx++) % spawnList.length];
      const hasC4 = chosenCarrier === bot;
      const plan = isGang ? gangPlan : swatPlan;
      const role = plan.roles.get(bot.id) ?? 'attacker';
      const orders = plan.orders.get(bot.id);
      const objective = orders?.targetObjective ?? plan.targetSite;
      const botDifficulty = bot.team !== this.playerTeam ? this.difficultyLevel : 1;

      bot.resetRound(spawn, hasC4, objective, role, this.matchScore.currentRound, botDifficulty, orders);
    });

    // Broadcast player's Commander strategic order into Team Chat UI
    const playerPlan = this.playerTeam === 'gang' ? gangPlan : swatPlan;
    if (playerPlan.chatMessage) {
      this.addTeamChat(
        playerPlan.chatMessage.senderName,
        playerPlan.chatMessage.senderTeam,
        playerPlan.chatMessage.textAr,
        playerPlan.chatMessage.textEn,
        playerPlan.chatMessage.isOrder
      );
    }

    sound.playRadio('start');
    this.onScoreUpdate?.({ ...this.matchScore });
  }

  public handlePlayerShoot(targetPoint: THREE.Vector3, _isHeadshot: boolean, muzzleWorldPos?: THREE.Vector3) {
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

    const raycaster = this._tmpRaycaster;
    const cameraDir = this._tmpVecA.copy(targetPoint).sub(this.camera.position);
    if (cameraDir.lengthSq() < 1e-6) {
      this.camera.getWorldDirection(cameraDir);
    } else {
      cameraDir.normalize();
    }
    raycaster.set(this.camera.position, cameraDir);

    // 1. Check wall/crate colliders
    let wallHitDist = Infinity;
    let hasWallHit = false;
    const wallHitPoint = this._tmpVecD;
    const wallNormal = this._tmpNormal.set(0, 1, 0);
    let wallSurface: SurfaceMaterial = 'concrete';
    const box = this._tmpBox;
    const hitTmp = this._tmpVecB;

    for (const c of this.currentMap.colliders) {
      box.set(c.min, c.max);
      const hit = raycaster.ray.intersectBox(box, hitTmp);
      if (hit) {
        const d = this.camera.position.distanceTo(hit);
        if (d < wallHitDist) {
          wallHitDist = d;
          wallHitPoint.copy(hit);
          hasWallHit = true;
          this.computeBoxNormalOut(hit, box, wallNormal);
          wallSurface = c.surface ?? 'concrete';
        }
      }
    }

    // 2. Raycast against enemy bots
    let closestHitBot: BotController | null = null;
    let minDistance = Infinity;
    let hitIsHeadshot = false;
    const headPos = this._tmpVecB;
    const chestPos = this._tmpVecC;

    for (const b of this.bots) {
      if (b.team === this.playerTeam || !b.state.isAlive) continue;
      // headBone sits at neck/chin base (y=1.58); true face/helmet center is +0.14m up along headBone
      headPos.set(0, 0.14, 0);
      b.char.headBone.localToWorld(headPos);
      const distToHead = raycaster.ray.distanceToPoint(headPos);

      chestPos.set(0, 0.05, 0);
      b.char.chestBone.localToWorld(chestPos);
      const distToChest = raycaster.ray.distanceToPoint(chestPos);

      const maxMeleeRange = weapon.category === 'melee' ? 2.6 : 160;

      if (distToHead < 0.25) {
        const d = this.camera.position.distanceTo(headPos);
        if (d < minDistance && d <= maxMeleeRange) {
          minDistance = d;
          closestHitBot = b;
          hitIsHeadshot = true;
        }
      } else if (distToChest < 0.56) {
        const d = this.camera.position.distanceTo(chestPos);
        if (d < minDistance && d <= maxMeleeRange) {
          minDistance = d;
          closestHitBot = b;
          hitIsHeadshot = false;
        }
      }
    }

    if (wallHitDist < minDistance) {
      if (weapon.category !== 'melee') {
        for (const b of this.bots) {
          if (b.team === this.playerTeam || !b.state.isAlive) continue;
          chestPos.set(0, 0.05, 0);
          b.char.chestBone.localToWorld(chestPos);
          const dBot = this.camera.position.distanceTo(chestPos);
          if (dBot <= wallHitDist + 0.5 && raycaster.ray.distanceToPoint(chestPos) < 2.2) {
            this.roundPlayerTelemetry.shotsFiredAtBots++;
            if (Math.hypot(b.velocity.x, b.velocity.z) > 1.3) {
              this.roundPlayerTelemetry.shotsAtMoving++;
              this.roundPlayerTelemetry.shotsMissedVsMoving++;
            }
            break;
          }
        }
      }
      const tracerEnd = hasWallHit
        ? wallHitPoint
        : chestPos.copy(this.camera.position).addScaledVector(cameraDir, wallHitDist);
      if (weapon.category !== 'melee') this.createBulletTracer(muzzleOrigin, tracerEnd);
      if (hasWallHit) this.spawnImpactEffects(wallHitPoint, wallNormal, true, wallSurface);
      return;
    }

    const tracerEnd = closestHitBot
      ? chestPos.copy(raycaster.ray.origin).addScaledVector(cameraDir, minDistance)
      : hasWallHit
        ? wallHitPoint
        : targetPoint;

    if (weapon.category !== 'melee') {
      this.createBulletTracer(muzzleOrigin, tracerEnd);
    }

    if (closestHitBot) {
      if (weapon.category !== 'melee') {
        this.roundPlayerTelemetry.shotsFiredAtBots++;
        this.roundPlayerTelemetry.shotsHitOnBots++;
        this.roundPlayerTelemetry.playerHitsLanded++;
        if (hitIsHeadshot) this.roundPlayerTelemetry.playerHeadshotsLanded++;
        if (Math.hypot(closestHitBot.velocity.x, closestHitBot.velocity.z) > 1.3) {
          this.roundPlayerTelemetry.shotsAtMoving++;
        }
        const prevDistSum = this.roundPlayerTelemetry.avgCombatDist * this.roundPlayerTelemetry.combatSamples;
        this.roundPlayerTelemetry.combatSamples++;
        this.roundPlayerTelemetry.avgCombatDist =
          (prevDistSum + minDistance) / this.roundPlayerTelemetry.combatSamples;
      }

      closestHitBot.lastSpottedTime = Date.now();

      const baseDamage = weapon.damage;
      const damage = hitIsHeadshot ? baseDamage * weapon.headshotMultiplier : baseDamage;
      const died = closestHitBot.takeDamage(damage, hitIsHeadshot, this.player.position);
      if (died) {
        this.bloodVfx.spawnDeathBloodBurst(
          closestHitBot.position,
          tracerEnd,
          cameraDir,
          hitIsHeadshot,
          this.vfxQualityScale
        );
      } else {
        this.spawnBloodSparks(tracerEnd, hitIsHeadshot, cameraDir, closestHitBot.position.y);
      }

      sound.playHitmarker(hitIsHeadshot, died);
      this.onHitFeedback?.({ id: ++this.fxSeq, isHeadshot: hitIsHeadshot, isKill: died });

      const killXp = died ? 100 + (hitIsHeadshot ? 40 : 0) : 0;
      if (died) {
        if (hitIsHeadshot) {
          closestHitBot.char.headBone.getWorldPosition(headPos);
          this.spawnHeadshotKillTorch(headPos, cameraDir, closestHitBot.char.headBone, closestHitBot.position.y);
          sound.playHeadshotKill();
        }
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
    } else {
      if (weapon.category !== 'melee') {
        for (const b of this.bots) {
          if (b.team === this.playerTeam || !b.state.isAlive) continue;
          chestPos.set(0, 0.05, 0);
          b.char.chestBone.localToWorld(chestPos);
          if (raycaster.ray.distanceToPoint(chestPos) < 2.2) {
            this.roundPlayerTelemetry.shotsFiredAtBots++;
            if (Math.hypot(b.velocity.x, b.velocity.z) > 1.3) {
              this.roundPlayerTelemetry.shotsAtMoving++;
              this.roundPlayerTelemetry.shotsMissedVsMoving++;
            }
            break;
          }
        }
      }
      if (hasWallHit) {
        this.spawnImpactEffects(wallHitPoint, wallNormal, true, wallSurface);
      }
    }
  }

  private createBulletTracer(start: THREE.Vector3, end: THREE.Vector3) {
    const dir = this._tmpVecB.copy(end).sub(start);
    const len = Math.min(dir.length(), 90);
    if (len < 0.2) return;

    let slot = this.tracerPool.find((t) => !t.active);
    if (!slot) {
      if (this.tracerPool.length < 28) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffea8a,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(this.tracerGeo, mat);
        this.scene.add(mesh);
        slot = { mesh, mat, active: false, age: 0 };
        this.tracerPool.push(slot);
      } else {
        // Recycle oldest tracer
        slot = this.tracerPool.reduce((oldest, cur) => (cur.age > oldest.age ? cur : oldest), this.tracerPool[0]);
      }
    }

    slot.active = true;
    slot.age = 0;
    slot.mat.opacity = 0.9;
    slot.mesh.position.copy(start);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.lookAt(end);
    slot.mesh.visible = true;
  }

  private spawnShellCasing(muzzlePos: THREE.Vector3) {
    const right = this._tmpVecB.set(1, 0.35, 0).applyEuler(this.camera.rotation).normalize();
    const spawnPos = this._tmpVecC.copy(muzzlePos).lerp(this.camera.position, 0.45).addScaledVector(right, 0.08);
    if (this.shells.length >= 22) {
      const oldest = this.shells.shift()!;
      this.scene.remove(oldest.mesh);
    }
    const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
    mesh.position.copy(spawnPos);
    this.scene.add(mesh);

    const vel = right.clone().multiplyScalar(2.4 + Math.random() * 1.2);
    vel.y += 1.6 + Math.random() * 0.8;
    const rotVel = new THREE.Vector3(Math.random() * 18, Math.random() * 18, Math.random() * 18);
    this.shells.push({ mesh, vel, rotVel, age: 0 });
  }

  private spawnImpactEffects(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    addDecal: boolean,
    surface: SurfaceMaterial = 'concrete'
  ) {
    const { atten, pan } = this.computeSpatialAudio(pos, 36);
    if (atten > 0.08) {
      sound.playImpact(atten, pan, surface === 'metal' || Math.random() < 0.24, surface);
    }

    const q = this.vfxQualityScale;
    const baseCount = surface === 'metal' ? 7 : surface === 'wood' ? 5 : 4;
    const chipCount = Math.max(2, Math.round(baseCount * q));

    // 1. Surface-specific sparks / wood splinters / grit chips
    for (let i = 0; i < chipCount; i++) {
      let color = 0xffbb44;
      let speedScale = 1.0;
      if (surface === 'metal') {
        color = i % 2 === 0 ? 0xfef08a : 0xff8800;
        speedScale = 1.35;
      } else if (surface === 'wood') {
        color = i % 2 === 0 ? 0xc28a52 : 0x8c5b2f;
        speedScale = 0.85;
      } else if (surface === 'dirt') {
        color = i % 2 === 0 ? 0xb89b6a : 0x8c7248;
        speedScale = 0.78;
      } else {
        color = i === 0 ? 0xffcc55 : 0xd4d4d8;
        speedScale = 0.92;
      }

      const mat = this.getSharedBasicMat(color);
      if (this.sparks.length >= 64) {
        const oldest = this.sparks.shift()!;
        this.scene.remove(oldest.mesh);
      }
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const vel = normal
        .clone()
        .multiplyScalar((2.4 + Math.random() * 2.4) * speedScale)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3.2 * speedScale,
            (Math.random() * 2.3 + 0.3) * speedScale,
            (Math.random() - 0.5) * 3.2 * speedScale
          )
        );
      this.sparks.push({ mesh, vel, age: 0, maxAge: 0.35 });
    }

    // 2. Surface-colored Dust / Sawdust Plume
    const dustColor =
      surface === 'wood' ? 0xd6b892 : surface === 'dirt' ? 0xc2a87e : surface === 'metal' ? 0xe5e7eb : 0xd6d3d1;
    const dustMat = new THREE.MeshBasicMaterial({
      color: dustColor,
      transparent: true,
      opacity: surface === 'metal' ? 0.35 : 0.52,
      depthWrite: false
    });
    if (this.dustPuffs.length >= 36) {
      const oldest = this.dustPuffs.shift()!;
      this.scene.remove(oldest.mesh);
      (oldest.mesh.material as THREE.Material).dispose();
    }
    const dustMesh = new THREE.Mesh(this.dustGeo, dustMat);
    dustMesh.position.copy(pos).addScaledVector(normal, 0.08);
    this.scene.add(dustMesh);
    this.dustPuffs.push({ mesh: dustMesh, age: 0, hasMap: false });

    // 3. Bullet Hole Decal on wall (budget scales with FPS quality)
    const maxDecals = Math.max(15, Math.round(50 * q));
    if (addDecal && this.bulletDecals.length < maxDecals) {
      const decal = new THREE.Mesh(this.decalGeo, this.decalMat);
      decal.position.copy(pos).addScaledVector(normal, 0.015);
      decal.lookAt(pos.x + normal.x, pos.y + normal.y, pos.z + normal.z);
      this.scene.add(decal);
      this.bulletDecals.push(decal);
    }
  }

  private spawnWorldMuzzleFlash(pos: THREE.Vector3) {
    let slot = this.worldFlashPool.find((f) => !f.active);
    if (!slot) {
      if (this.worldFlashPool.length < 14) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffd266,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(this.worldFlashGeo, mat);
        this.scene.add(mesh);
        slot = { mesh, mat, active: false, age: 0 };
        this.worldFlashPool.push(slot);
      } else {
        slot = this.worldFlashPool.reduce((oldest, cur) => (cur.age > oldest.age ? cur : oldest), this.worldFlashPool[0]);
      }
    }
    slot.active = true;
    slot.age = 0;
    slot.mat.opacity = 0.92;
    slot.mesh.position.copy(pos);
    slot.mesh.visible = true;
  }

  private spawnMuzzleSmoke(pos: THREE.Vector3) {
    if (this.dustPuffs.length >= 36) {
      const oldest = this.dustPuffs.shift()!;
      this.scene.remove(oldest.mesh);
      (oldest.mesh.material as THREE.Material).dispose();
    }
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
    this.dustPuffs.push({ mesh, age: 0.1, hasMap: false });
  }

  /**
   * 0.7s Golden Flame Torch VFX on killed victim's head for lethal headshots.
   */
  private spawnHeadshotKillTorch(
    headPos: THREE.Vector3,
    shotDir?: THREE.Vector3,
    victimHeadBone?: THREE.Bone,
    groundY: number = 0
  ) {
    const q = this.vfxQualityScale;
    const exitDir = shotDir ? shotDir.clone().normalize() : new THREE.Vector3(0, 0.35, 0);

    const group = new THREE.Group();
    group.position.set(headPos.x, Math.max(groundY + 0.14, headPos.y + 0.04), headPos.z);

    // 1. Warm radial golden halo glow (always faces camera, clear at close & long range)
    const haloMat = new THREE.MeshBasicMaterial({
      map: this.smokeSoftTexture,
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const haloMesh = new THREE.Mesh(this.smokePlaneGeo, haloMat);
    haloMesh.position.y = 0.22;
    haloMesh.scale.set(1.05, 1.15, 1);

    // 2. Tall flickering golden flame billboard tongue
    const spriteMat = new THREE.MeshBasicMaterial({
      map: this.smokeSoftTexture,
      color: 0xfde047,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const flameSprite = new THREE.Mesh(this.smokePlaneGeo, spriteMat);
    flameSprite.position.y = 0.38;
    flameSprite.scale.set(0.56, 1.18, 1);

    // 3. 3D Tapered Golden Torch Cone + White-Gold Intense Inner Core
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const outerCone = new THREE.Mesh(this.torchOuterGeo, outerMat);

    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const innerCone = new THREE.Mesh(this.torchInnerGeo, innerMat);

    group.add(haloMesh, flameSprite, outerCone, innerCone);
    this.scene.add(group);

    this.headshotTorches.push({
      group,
      haloMesh,
      flameSprite,
      outerCone,
      innerCone,
      haloMat,
      spriteMat,
      outerMat,
      innerMat,
      headBone: victimHeadBone,
      anchorPos: group.position.clone(),
      groundY,
      age: 0,
      maxAge: 0.7,
      seed: Math.random() * 10
    });

    // 4. Rising Golden Ember Sparks erupting from the torch across the 0.7s burn
    const sparkCount = Math.max(12, Math.round(20 * q));
    const palette = [0xfde047, 0xfbbf24, 0xf59e0b, 0xfff3b0];
    for (let i = 0; i < sparkCount; i++) {
      const color = palette[i % palette.length];
      if (this.sparks.length >= 64) {
        const oldest = this.sparks.shift()!;
        this.scene.remove(oldest.mesh);
      }
      const mat = this.getSharedBasicMat(color);
      const mesh = new THREE.Mesh(this.headshotSparkGeo, mat);
      mesh.position.copy(group.position);

      const theta = Math.random() * Math.PI * 2;
      const spread = 0.5 + Math.random() * 2.1;
      const vel = new THREE.Vector3(
        Math.cos(theta) * spread,
        3.2 + Math.random() * 3.8,
        Math.sin(theta) * spread
      ).addScaledVector(exitDir, 0.9 + Math.random() * 0.8);

      mesh.lookAt(group.position.x + vel.x, group.position.y + vel.y, group.position.z + vel.z);
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        vel,
        age: 0,
        maxAge: 0.42 + Math.random() * 0.28
      });
    }
  }

  private spawnBloodSparks(pos: THREE.Vector3, isHeadshot: boolean, shotDir?: THREE.Vector3, _groundY = 0) {
    this.bloodVfx.spawnHitBlood(pos, isHeadshot, shotDir, this.vfxQualityScale);
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

    const { atten, pan } = this.computeSpatialAudio(pos, 65);
    sound.playC4ArmedBeep(Math.max(0.25, atten), pan);
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

    // Cross-round Dual Commander evolution, Bot Self-Learning & Persistent Nemesis AI
    const gangBots = this.bots.filter((b) => b.team === 'gang');
    const swatBots = this.bots.filter((b) => b.team === 'swat');
    this.gangCommander.onRoundEnd(gangBots, winner, reason, this.matchScore.bombSite);
    this.swatCommander.onRoundEnd(swatBots, winner, reason, this.matchScore.bombSite);
    recordRoundIntoNemesis(this.nemesisState, this.roundPlayerTelemetry);

    const roundXp = playerWon ? 80 : 30;
    this.matchXpEarned += roundXp;

    const modeCfg = GAME_MODES[this.gameMode];
    const scoreDiff = Math.abs(this.matchScore.gang - this.matchScore.police);
    const isOver =
      this.matchScore.gang >= modeCfg.winsNeeded ||
      this.matchScore.police >= modeCfg.winsNeeded ||
      (modeCfg.leadThreshold !== null && scoreDiff >= modeCfg.leadThreshold);
    let matchBonusXp = 0;

    if (isOver) {
      const matchWinner = this.matchScore.gang > this.matchScore.police ? 'gang' : 'swat';
      this.matchScore.isMatchOver = true;
      this.matchScore.matchWinner = matchWinner;
      matchBonusXp = matchWinner === this.playerTeam ? modeCfg.matchWinXp : modeCfg.matchLossXp;
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

    if (itemId === 'hegrenade' || itemId === 'smokegrenade') {
      const price = 300;
      if (this.player.state.money < price) return false;
      const added = this.player.giveGrenade(itemId);
      if (!added) return false;
      this.player.state.money -= price;
      sound.playBuy();
      this.onPlayerStateUpdate?.({ ...this.player.state });
      return true;
    }

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

  public addTeamChat(
    senderName: string,
    senderTeam: 'gang' | 'swat',
    textAr: string,
    textEn: string,
    isOrder = false
  ) {
    const msg: TeamChatMessage = {
      id: `${Date.now()}_${Math.random()}`,
      senderName,
      senderTeam,
      textAr,
      textEn,
      isOrder,
      timestamp: Date.now()
    };
    this.teamChat = [...this.teamChat.slice(-5), msg];
    this.onTeamChatUpdate?.([...this.teamChat]);
  }

  public issuePlayerTacticalCommand(cmdNumber: number): boolean {
    const cmd = TACTICAL_RADIO_COMMANDS.find((c) => c.key === cmdNumber);
    if (!cmd || !this.player.state.isAlive) return false;

    const lookDir = new THREE.Vector3();
    this.camera.getWorldDirection(lookDir);

    // Raycast forward to pinpoint spotted location / enemy for "Enemy Spotted" or directional orders
    let aimDist = 28;
    const ray = new THREE.Ray(this.camera.position, lookDir);
    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (const c of this.currentMap.colliders) {
      box.set(c.min, c.max);
      const hit = ray.intersectBox(box, tmp);
      if (hit) {
        const d = this.camera.position.distanceTo(hit);
        if (d < aimDist) aimDist = d;
      }
    }

    const aimPos = this.camera.position.clone().addScaledVector(lookDir, aimDist);
    aimPos.y = Math.max(0, aimPos.y - 1.2);

    // Mark enemy bots near crosshair ray when shouting "Enemy Spotted"
    if (cmd.order === 'enemy_spotted') {
      const now = Date.now();
      for (const enemy of this.bots) {
        if (enemy.state.isAlive && enemy.team !== this.playerTeam) {
          const chest = enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          if (ray.distanceToPoint(chest) < 3.6 && enemy.hasLineOfSight(this.player.position, enemy.position, this.currentMap.colliders)) {
            enemy.lastSpottedTime = now;
            aimPos.copy(enemy.position);
          }
        }
      }
    }

    this.addTeamChat('أنت (You)', this.playerTeam, cmd.textAr, cmd.textEn, true);
    sound.playRadioChatter(true);

    const livingAllies = this.bots
      .filter((b) => b.state.isAlive && b.team === this.playerTeam)
      .sort((a, b) => a.position.distanceTo(this.player.position) - b.position.distanceTo(this.player.position));

    livingAllies.forEach((ally, idx) => {
      const allowFollowSlot = cmd.order !== 'follow_me' || idx < 3;
      ally.applyPlayerOrder(
        cmd.order,
        this.player.position,
        lookDir,
        aimPos,
        this.currentMap.navNodes,
        this.currentMap.colliders,
        allowFollowSlot
      );
    });

    if (livingAllies.length > 0) {
      const responder = livingAllies[0];
      const ackMap: Record<RadioOrderType, { ar: string; en: string }> = {
        fall_back: { ar: 'حاضر، نتراجع للخلف!', en: 'Roger, falling back!' },
        defend_me: { ar: 'نحن في طريقنا لتغطيتك!', en: 'Moving to cover you!' },
        follow_me: { ar: 'أنا خلفك، لننطلق!', en: 'Right behind you, lead the way!' },
        hold_here: { ar: 'مفهوم، نثبت في مواقعنا!', en: 'Copy, holding this position!' },
        enemy_spotted: { ar: 'تلقينا الموقع، سنتعامل معهم!', en: 'Target marked, engaging!' },
        need_backup: { ar: 'الدعم قادم إليك فوراً!', en: 'Backup inbound!' },
        sector_clear: { ar: 'علم، نستأنف التقدم!', en: 'Copy, resuming push!' },
        go_a: { ar: 'مفهوم، الجميع إلى الموقع A!', en: 'Affirmative, moving to Site A!' },
        go_b: { ar: 'مفهوم، الجميع إلى الموقع B!', en: 'Affirmative, moving to Site B!' }
      };
      const reply = ackMap[cmd.order];
      this.pendingBotReplies.push({
        delay: 0.45,
        senderName: responder.name,
        senderTeam: responder.team,
        textAr: reply.ar,
        textEn: reply.en
      });
    }

    return true;
  }

  private spawnThrownGrenade(
    type: 'hegrenade' | 'smokegrenade',
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    ownerName: string,
    ownerTeam: 'gang' | 'swat',
    isPlayerOwner: boolean
  ) {
    const g = new THREE.Group();
    if (type === 'hegrenade') {
      const body = new THREE.Mesh(this.heBodyGeo, this.heBodyMat);
      body.scale.set(0.92, 1.2, 0.92);
      const band = new THREE.Mesh(this.heBandGeo, this.heBandMat);
      band.rotation.x = Math.PI / 2;
      g.add(body, band);
    } else {
      const body = new THREE.Mesh(this.smokeBodyGeo, this.smokeBodyMat);
      const stripe = new THREE.Mesh(this.smokeStripeGeo, this.smokeStripeMat);
      stripe.position.y = 0.03;
      g.add(body, stripe);
    }

    g.position.copy(origin);
    this.scene.add(g);

    this.thrownGrenades.push({
      type,
      ownerName,
      ownerTeam,
      isPlayerOwner,
      mesh: g,
      vel: velocity.clone(),
      rotVel: new THREE.Vector3(6 + Math.random() * 6, 8 + Math.random() * 6, 5 + Math.random() * 6),
      age: 0,
      fuseTime: type === 'hegrenade' ? 1.55 : 1.45,
      bounceCount: 0
    });
  }

  private initExplosionAndFxPools(): THREE.Object3D[] {
    // 1. Pre-allocate permanent PointLights so NUM_POINT_LIGHTS never changes at runtime (prevents full-scene shader recompile stall)
    if (!this.isSoftwareGl) {
      for (let i = 0; i < 2; i++) {
        const light = new THREE.PointLight(0xff7722, 0, 45);
        light.position.set(0, -100, 0);
        light.visible = true;
        this.scene.add(light);
        this.explosionLightPool.push({ light, inUse: false });
      }
    }

    // 2. Pre-allocate reusable explosion visual rigs (visible during renderer.compile, hidden right after)
    for (let i = 0; i < 4; i++) {
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfff3b0,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const fireballMat = new THREE.MeshBasicMaterial({
        color: 0xff6b1a,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff9a44,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const coreMesh = new THREE.Mesh(this.blastSphereGeo, coreMat);
      const fireballMesh = new THREE.Mesh(this.blastSphereGeo, fireballMat);
      const shockRingMesh = new THREE.Mesh(this.shockRingGeo, ringMat);
      coreMesh.position.set(0, -200, 0);
      fireballMesh.position.set(0, -200, 0);
      shockRingMesh.position.set(0, -200, 0);
      shockRingMesh.rotation.x = -Math.PI / 2;
      // Keep visible = true for initial renderer.compile() warmup
      coreMesh.visible = true;
      fireballMesh.visible = true;
      shockRingMesh.visible = true;
      this.scene.add(coreMesh, fireballMesh, shockRingMesh);

      this.explosionPool.push({
        coreMesh,
        fireballMesh,
        shockRingMesh,
        coreMat,
        fireballMat,
        ringMat,
        flashLight: null,
        lightSlotIndex: -1,
        active: false,
        age: 0,
        duration: 0.85,
        maxScale: 3.9,
        isC4: false
      });
    }

    // 3. Pre-allocate reusable smoke/plume MeshBasicMaterials
    for (let i = 0; i < 28; i++) {
      this.freeSmokeMats.push(
        new THREE.MeshBasicMaterial({
          map: this.smokeSoftTexture,
          color: 0x8e98a4,
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
    }

    // 4. Temporary warmup meshes for smoke puff, scorch crater, and spark shader compilation
    const warmupObjects: THREE.Object3D[] = [];
    const warmSmoke = new THREE.Mesh(this.smokePlaneGeo, this.freeSmokeMats[0]);
    warmSmoke.position.set(0, -200, 0);
    const warmScorch = new THREE.Mesh(this.scorchGeo, this.scorchDecalMat);
    warmScorch.position.set(0, -200, 0);
    const warmSpark = new THREE.Mesh(this.sparkGeo, this.getSharedBasicMat(0xfef08a));
    warmSpark.position.set(0, -200, 0);
    const warmSpark2 = new THREE.Mesh(this.sparkGeo, this.getSharedBasicMat(0xff6600));
    warmSpark2.position.set(0, -200, 0);
    this.scene.add(warmSmoke, warmScorch, warmSpark, warmSpark2);
    warmupObjects.push(warmSmoke, warmScorch, warmSpark, warmSpark2);

    return warmupObjects;
  }

  private finishFxWarmup(warmupObjects: THREE.Object3D[]) {
    for (const obj of warmupObjects) {
      this.scene.remove(obj);
    }
    for (const ex of this.explosionPool) {
      ex.coreMesh.visible = false;
      ex.fireballMesh.visible = false;
      ex.shockRingMesh.visible = false;
    }
  }

  private acquireSmokeMat(colorHex: number, opacity: number): THREE.MeshBasicMaterial {
    const mat = this.freeSmokeMats.pop() ?? new THREE.MeshBasicMaterial({
      map: this.smokeSoftTexture,
      color: colorHex,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    mat.color.setHex(colorHex);
    mat.opacity = opacity;
    return mat;
  }

  private releaseSmokeMat(mat: THREE.MeshBasicMaterial) {
    if (this.freeSmokeMats.length < 48) {
      mat.opacity = 0;
      this.freeSmokeMats.push(mat);
    } else {
      mat.dispose();
    }
  }

  private acquireExplosionSlot(): ActiveExplosion {
    let slot = this.explosionPool.find((e) => !e.active);
    if (!slot) {
      // Recycle oldest active explosion
      slot = this.explosionPool.reduce((oldest, cur) => (cur.age > oldest.age ? cur : oldest), this.explosionPool[0]);
      if (slot.flashLight && slot.lightSlotIndex >= 0) {
        slot.flashLight.intensity = 0;
        this.explosionLightPool[slot.lightSlotIndex].inUse = false;
        slot.flashLight = null;
        slot.lightSlotIndex = -1;
      }
    }
    return slot;
  }

  private detonateSmokeGrenade(pos: THREE.Vector3) {
    const { atten, pan } = this.computeSpatialAudio(pos, 55);
    sound.playSmokeHiss(Math.max(0.08, atten), pan);

    const targetRadius = 4.5;
    const duration = 14.5;
    const puffs: ActiveSmokeCloud['puffs'] = [];
    const puffCount = this.isSoftwareGl ? 12 : 20;

    for (let i = 0; i < puffCount; i++) {
      const angle = (i / puffCount) * Math.PI * 2 + Math.random() * 0.5;
      const radial = i < 4 ? Math.random() * 0.8 : 1.1 + Math.random() * 2.1;
      const height = 0.85 + (i % 4) * 0.65 + Math.random() * 0.45;
      const tone = 0x8e98a4 + Math.floor(Math.random() * 3) * 0x101010;

      const mat = this.acquireSmokeMat(tone, 0.0);
      const mesh = new THREE.Mesh(this.smokePlaneGeo, mat);
      const offset = new THREE.Vector3(Math.cos(angle) * radial, height, Math.sin(angle) * radial);
      mesh.position.copy(pos).add(this._tmpVecA.set(offset.x * 0.2, 0.4, offset.z * 0.2));
      this.scene.add(mesh);

      puffs.push({
        mesh,
        offset,
        baseScale: 1.2,
        maxScale: 3.6 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.45
      });
    }

    this.activeSmokes.push({
      center: pos.clone(),
      radius: 0.8,
      targetRadius,
      age: 0,
      duration,
      puffs
    });
  }

  private hasBlastLineOfSight(origin: THREE.Vector3, target: THREE.Vector3): boolean {
    const start = this._tmpVecA.set(origin.x, origin.y + 0.35, origin.z);
    const end = this._tmpVecB.set(target.x, target.y + 1.0, target.z);
    const diff = this._tmpVecC.copy(end).sub(start);
    const dist = diff.length();
    if (dist < 0.2) return true;
    const ray = this._tmpRay.set(start, diff.divideScalar(dist));
    const box = this._tmpBox;
    const hit = this._tmpBlastHit;

    for (const c of this.currentMap.colliders) {
      box.set(c.min, c.max);
      if (ray.intersectBox(box, hit) && hit.distanceTo(start) < dist - 0.25) {
        return false;
      }
    }
    return true;
  }

  private triggerExplosion(
    pos: THREE.Vector3,
    isC4: boolean,
    owner?: { name: string; team: 'gang' | 'swat'; isPlayer: boolean }
  ) {
    const distToPlayer = pos.distanceTo(this.player.position);
    const maxHearDist = isC4 ? 115 : 55;
    const { atten, pan } = this.computeSpatialAudio(pos, maxHearDist);
    sound.playExplosion(Math.max(0.1, atten), isC4, pan);

    // Distance-based Camera Shake
    const maxShakeDist = isC4 ? 46 : 22;
    if (this.player.state.isAlive && distToPlayer < maxShakeDist) {
      const proximity = 1 - distToPlayer / maxShakeDist;
      const shakePower = (isC4 ? 0.38 : 0.23) * Math.pow(proximity, 0.75);
      this.player.addExplosionShake(shakePower, shakePower * 0.55);
    }

    // Reuse Pre-Pooled 3D Fireball Core + Outer Blast Sphere + Shockwave + PointLight
    const ex = this.acquireExplosionSlot();
    ex.active = true;
    ex.age = 0;
    ex.duration = isC4 ? 1.85 : 0.85;
    ex.maxScale = isC4 ? 11.5 : 3.9;
    ex.isC4 = isC4;

    ex.coreMat.opacity = 0.98;
    ex.fireballMat.color.setHex(isC4 ? 0xff4500 : 0xff6b1a);
    ex.fireballMat.opacity = 0.88;
    ex.ringMat.color.setHex(isC4 ? 0xffbb55 : 0xff9a44);
    ex.ringMat.opacity = 0.85;

    ex.coreMesh.position.set(pos.x, pos.y + 0.35, pos.z);
    ex.coreMesh.scale.setScalar(0.5);
    ex.coreMesh.visible = true;

    ex.fireballMesh.position.set(pos.x, pos.y + 0.35, pos.z);
    ex.fireballMesh.scale.setScalar(0.8);
    ex.fireballMesh.visible = true;

    ex.shockRingMesh.position.set(pos.x, pos.y + 0.08, pos.z);
    ex.shockRingMesh.scale.setScalar(1.0);
    ex.shockRingMesh.visible = true;

    // Borrow pooled PointLight without adding/removing from scene (zero shader recompilation)
    if (this.explosionLightPool.length > 0) {
      let lightSlotIndex = this.explosionLightPool.findIndex((l) => !l.inUse);
      if (lightSlotIndex === -1) {
        lightSlotIndex = 0;
        for (const other of this.explosionPool) {
          if (other !== ex && other.lightSlotIndex === lightSlotIndex) {
            other.flashLight = null;
            other.lightSlotIndex = -1;
          }
        }
      }
      const lightSlot = this.explosionLightPool[lightSlotIndex];
      lightSlot.inUse = true;
      lightSlot.light.position.set(pos.x, pos.y + 1.4, pos.z);
      lightSlot.light.distance = isC4 ? 45 : 22;
      lightSlot.light.intensity = isC4 ? 28 : 14;
      ex.flashLight = lightSlot.light;
      ex.lightSlotIndex = lightSlotIndex;
    }

    // Flying glowing shrapnel & ember sparks
    const sparkCount = Math.max(6, Math.round((isC4 ? 32 : 16) * this.vfxQualityScale));
    for (let i = 0; i < sparkCount; i++) {
      if (this.sparks.length >= 64) {
        const oldest = this.sparks.shift()!;
        this.scene.remove(oldest.mesh);
      }
      const sMat = this.getSharedBasicMat(i % 3 === 0 ? 0xfef08a : 0xff6600);
      const sMesh = new THREE.Mesh(this.sparkGeo, sMat);
      sMesh.scale.setScalar(isC4 ? 2.4 : 1.3);
      sMesh.position.set(pos.x, pos.y + 0.3, pos.z);
      this.scene.add(sMesh);
      const speed = isC4 ? 14 + Math.random() * 14 : 6 + Math.random() * 8;
      const angle = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        4 + Math.random() * (isC4 ? 14 : 7),
        Math.sin(angle) * speed
      );
      this.sparks.push({ mesh: sMesh, vel, age: isC4 ? -0.35 : -0.1, maxAge: 0.35 });
    }

    // Thick dark explosion smoke plume (reuses pooled smoke materials)
    const plumeCount = Math.max(3, Math.round((isC4 ? 10 : 5) * this.vfxQualityScale));
    for (let i = 0; i < plumeCount; i++) {
      if (this.dustPuffs.length >= 36) {
        const oldest = this.dustPuffs.shift()!;
        this.scene.remove(oldest.mesh);
        const oldMat = oldest.mesh.material as THREE.MeshBasicMaterial;
        if (oldest.hasMap) {
          this.releaseSmokeMat(oldMat);
        } else {
          oldMat.dispose();
        }
      }
      const pMat = this.acquireSmokeMat(i % 2 === 0 ? 0x262626 : 0x4b4b4f, 0.78);
      const pMesh = new THREE.Mesh(this.smokePlaneGeo, pMat);
      pMesh.position.set(
        pos.x + (Math.random() - 0.5) * (isC4 ? 3.5 : 1.2),
        pos.y + 0.6 + i * (isC4 ? 0.8 : 0.3),
        pos.z + (Math.random() - 0.5) * (isC4 ? 3.5 : 1.2)
      );
      pMesh.scale.setScalar(isC4 ? 2.8 : 1.1);
      this.scene.add(pMesh);
      this.dustPuffs.push({ mesh: pMesh, age: isC4 ? -0.9 : -0.35, hasMap: true });
    }

    // Ground scorch crater decal
    if (this.scorchDecals.length < 30) {
      const scorch = new THREE.Mesh(this.scorchGeo, this.scorchDecalMat);
      scorch.position.set(pos.x, pos.y + 0.03, pos.z);
      scorch.rotation.x = -Math.PI / 2;
      scorch.scale.setScalar(isC4 ? 5.6 : 2.1);
      this.scene.add(scorch);
      this.scorchDecals.push(scorch);
    }

    // Apply Radial Blast Damage
    const blastRadius = isC4 ? 24.0 : 8.2;
    const maxDmg = isC4 ? 260 : 92;
    const weaponLabel = isC4 ? 'C4 Explosive' : 'HE Grenade';
    const killerName = owner?.name || 'C4 Bomb';
    const killerTeam = owner?.team || 'gang';

    // 1. Damage Bots (batch profile & feedback updates to avoid multiple synchronous localStorage writes)
    let playerHitEnemy = false;
    let playerKilledEnemyCount = 0;
    let totalPlayerBlastDamage = 0;

    for (const bot of this.bots) {
      if (!bot.state.isAlive) continue;
      const d = bot.position.distanceTo(pos);
      if (d <= blastRadius && (isC4 || this.hasBlastLineOfSight(pos, bot.position))) {
        const falloff = Math.max(0.12, 1 - d / blastRadius);
        const dmg = maxDmg * falloff;
        const died = bot.takeDamage(dmg, false, pos, !isC4);
        if (owner?.isPlayer && bot.team !== this.playerTeam) {
          playerHitEnemy = true;
          totalPlayerBlastDamage += Math.round(dmg);
        }
        if (died) {
          this._tmpBlastHit.copy(bot.position).sub(pos);
          this._tmpBlastHit.y = 0.25;
          if (this._tmpBlastHit.lengthSq() < 0.001) this._tmpBlastHit.set(1, 0.25, 0);
          else this._tmpBlastHit.normalize();
          this.bloodVfx.spawnDeathBloodBurst(
            bot.position,
            undefined,
            this._tmpBlastHit,
            false,
            this.vfxQualityScale
          );
          this.addFeedItem(killerName, killerTeam, bot.name, bot.team, weaponLabel, false);
          if (owner?.isPlayer && bot.team !== this.playerTeam) {
            playerKilledEnemyCount++;
            this.currentKillStreak++;
            this.player.state.kills++;
            this.player.state.score += 2;
            this.player.state.money = Math.min(16000, this.player.state.money + 300);
            this.matchXpEarned += 100;
          }
        }
      }
    }

    if (playerHitEnemy) {
      const anyKill = playerKilledEnemyCount > 0;
      sound.playHitmarker(false, anyKill);
      this.onHitFeedback?.({ id: ++this.fxSeq, isHeadshot: false, isKill: anyKill });
      updateLocalProfile((p) => {
        p.totalDamageDealt += totalPlayerBlastDamage;
        if (playerKilledEnemyCount > 0) {
          p.kills += playerKilledEnemyCount;
          p.xp += playerKilledEnemyCount * 100;
          p.weaponKills['hegrenade'] = (p.weaponKills['hegrenade'] || 0) + playerKilledEnemyCount;
        }
      });
    }
    if (playerKilledEnemyCount > 0) {
      this.onPlayerStateUpdate?.({ ...this.player.state });
    }

    // 2. Damage Player
    if (this.player.state.isAlive) {
      const dp = this.player.position.distanceTo(pos);
      if (dp <= blastRadius && (isC4 || this.hasBlastLineOfSight(pos, this.player.position))) {
        const falloff = Math.max(0.1, 1 - dp / blastRadius);
        const dmg = maxDmg * falloff;
        const died = this.player.takeDamage(dmg, false);
        if (!isC4) {
          this.roundPlayerTelemetry.heDamageTaken += dmg;
          if (died) this.roundPlayerTelemetry.diedToHE = true;
        }

        const toBlast = this._tmpVecA.copy(pos).sub(this.player.position);
        const worldAngle = Math.atan2(toBlast.x, -toBlast.z);
        const relAngle = worldAngle - (-this.player.yaw);
        this.onDamageTaken?.({ id: ++this.fxSeq, relativeAngle: relAngle, damageAmount: dmg });

        if (died) {
          this._tmpBlastHit.copy(this.player.position).sub(pos);
          this._tmpBlastHit.y = 0.25;
          if (this._tmpBlastHit.lengthSq() < 0.001) this._tmpBlastHit.set(1, 0.25, 0);
          else this._tmpBlastHit.normalize();
          this.bloodVfx.spawnDeathBloodBurst(
            this.player.position,
            undefined,
            this._tmpBlastHit,
            false,
            this.vfxQualityScale
          );
          this.currentKillStreak = 0;
          updateLocalProfile((p) => {
            p.deaths++;
          });
          this.addFeedItem(killerName, killerTeam, 'أنت (You)', this.playerTeam, weaponLabel, false);
        }
      }
    }

    if (!isC4) {
      this.checkRoundEndConditions();
    }
  }

  public update(dt: number) {
    this.elapsedTime += dt;
    const colliders = this.currentMap.colliders;
    const ramps = this.currentMap.ramps;

    // Auto-scale non-essential transient VFX density if FPS drops below threshold
    this.smoothedDt = THREE.MathUtils.lerp(this.smoothedDt, Math.max(0.005, dt), 0.08);
    const avgFps = 1 / this.smoothedDt;
    this.vfxQualityScale = this.isSoftwareGl
      ? Math.max(GAME_FEEL_CONFIG.vfx.minQualityScale, 0.5)
      : avgFps < GAME_FEEL_CONFIG.vfx.perfTargetFps
        ? THREE.MathUtils.clamp(avgFps / 60, GAME_FEEL_CONFIG.vfx.minQualityScale, 1.0)
        : 1.0;

    sound.updateHeartbeat(dt, this.player.state.health, this.player.state.isAlive);

    // Deliver delayed allied bot radio replies cleanly
    for (let i = this.pendingBotReplies.length - 1; i >= 0; i--) {
      this.pendingBotReplies[i].delay -= dt;
      if (this.pendingBotReplies[i].delay <= 0) {
        const rep = this.pendingBotReplies[i];
        this.addTeamChat(rep.senderName, rep.senderTeam, rep.textAr, rep.textEn, false);
        sound.playRadioChatter(false);
        this.pendingBotReplies.splice(i, 1);
      }
    }

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
          if (this.bombWorldPos) {
            const { atten, pan } = this.computeSpatialAudio(this.bombWorldPos, 65);
            sound.playC4Beep(pitch, Math.max(0.12, atten), pan);
          } else {
            sound.playC4Beep(pitch);
          }
        }

        if (this.matchScore.bombTimeLeft <= 0) {
          this.matchScore.bombTimeLeft = 0;
          const blastPos = this.bombWorldPos ? this.bombWorldPos.clone() : new THREE.Vector3();
          if (this.plantedBombMesh) {
            this.scene.remove(this.plantedBombMesh);
            this.plantedBombMesh = null;
          }
          this.triggerExplosion(blastPos, true);
          this.endRound('gang', 'انفجرت القنبلة ودُمر الموقع بالكامل!');
          this.roundEndDelayTimer = 5.2;
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

    // Animate Dropped Floating Weapons & Update [F] Pickup Hint
    for (let i = 0; i < this.droppedWeapons.length; i++) {
      const dw = this.droppedWeapons[i];
      dw.mesh.rotation.y += dt * 1.55;
      dw.mesh.position.y = dw.baseY + Math.sin(this.elapsedTime * 3.0 + dw.phase) * 0.085;
    }
    this.updateNearbyDroppedWeaponHint();

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

    // Update Active Smokes & Smoke LoS Volumes
    const smokeVolumes: SmokeVolume[] = [];
    for (let i = this.activeSmokes.length - 1; i >= 0; i--) {
      const sm = this.activeSmokes[i];
      sm.age += dt;
      const bloomT = Math.min(1, sm.age / 0.95);
      const fadeOutT = sm.age > sm.duration - 1.8 ? Math.max(0, (sm.duration - sm.age) / 1.8) : 1.0;
      sm.radius = THREE.MathUtils.lerp(0.8, sm.targetRadius, bloomT) * (0.4 + 0.6 * fadeOutT);

      if (sm.age >= 0.35 && sm.age < sm.duration - 1.2) {
        smokeVolumes.push({ center: sm.center, radius: sm.radius });
      }

      for (const p of sm.puffs) {
        const targetPos = this._tmpVecD.copy(sm.center).addScaledVector(p.offset, bloomT);
        targetPos.y += Math.sin(sm.age * 0.9 + p.phase) * 0.14;
        p.mesh.position.lerp(targetPos, Math.min(1, dt * 6));
        const sc = THREE.MathUtils.lerp(p.baseScale, p.maxScale, bloomT);
        p.mesh.scale.set(sc, sc, 1);
        p.mesh.quaternion.copy(this.camera.quaternion);
        p.mesh.rotateZ(p.phase + sm.age * p.rotSpeed);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(0.84, bloomT * 0.84) * fadeOutT;
      }

      if (sm.age >= sm.duration) {
        for (const p of sm.puffs) {
          this.scene.remove(p.mesh);
          this.releaseSmokeMat(p.mesh.material as THREE.MeshBasicMaterial);
        }
        this.activeSmokes.splice(i, 1);
      }
    }

    // Update Thrown Grenade Projectiles
    for (let i = this.thrownGrenades.length - 1; i >= 0; i--) {
      const g = this.thrownGrenades[i];
      g.age += dt;
      g.vel.y -= 18.0 * dt;

      const prevPos = this._tmpVecA.copy(g.mesh.position);
      const nextPos = this._tmpVecB.copy(prevPos).addScaledVector(g.vel, dt);
      const rad = 0.14;

      // Wall bounce
      for (const c of colliders) {
        if (
          nextPos.x + rad > c.min.x &&
          nextPos.x - rad < c.max.x &&
          nextPos.z + rad > c.min.z &&
          nextPos.z - rad < c.max.z &&
          nextPos.y + rad > c.min.y &&
          nextPos.y - rad < c.max.y
        ) {
          const hitX = prevPos.x + rad <= c.min.x || prevPos.x - rad >= c.max.x;
          const hitZ = prevPos.z + rad <= c.min.z || prevPos.z - rad >= c.max.z;
          if (hitX) {
            nextPos.x = prevPos.x;
            g.vel.x *= -0.45;
          }
          if (hitZ) {
            nextPos.z = prevPos.z;
            g.vel.z *= -0.45;
          }
          if (!hitX && !hitZ) {
            nextPos.y = prevPos.y;
            g.vel.y *= -0.4;
          }
          if (g.vel.length() > 1.8) {
            const { atten, pan } = this.computeSpatialAudio(nextPos, 36);
            sound.playGrenadeBounce(Math.max(0.05, atten), pan);
          }
          g.bounceCount++;
        }
      }

      // Ground / Ramp bounce
      const floorY = getSurfaceHeightAt(nextPos.x, nextPos.z, prevPos.y, colliders, ramps, rad);
      if (nextPos.y - rad <= floorY) {
        nextPos.y = floorY + rad;
        if (Math.abs(g.vel.y) > 1.4) {
          g.vel.y = Math.abs(g.vel.y) * 0.38;
          g.vel.x *= 0.72;
          g.vel.z *= 0.72;
          g.bounceCount++;
          const { atten, pan } = this.computeSpatialAudio(nextPos, 36);
          sound.playGrenadeBounce(Math.max(0.05, atten), pan);
        } else {
          g.vel.y = 0;
          g.vel.x *= Math.max(0, 1 - 6.5 * dt);
          g.vel.z *= Math.max(0, 1 - 6.5 * dt);
        }
      }

      g.mesh.position.copy(nextPos);
      if (g.vel.lengthSq() > 0.25) {
        g.mesh.rotation.x += g.rotVel.x * dt;
        g.mesh.rotation.y += g.rotVel.y * dt;
        g.mesh.rotation.z += g.rotVel.z * dt;
      }

      const shouldDetonate =
        g.type === 'hegrenade'
          ? g.age >= g.fuseTime
          : (g.age >= g.fuseTime && (g.bounceCount >= 1 || g.vel.lengthSq() < 2.5)) || g.age >= 2.2;

      if (shouldDetonate) {
        const detPos = g.mesh.position.clone();
        detPos.y = Math.max(detPos.y, getSurfaceHeightAt(detPos.x, detPos.z, detPos.y, colliders, ramps, 0.1));
        this.scene.remove(g.mesh);
        this.thrownGrenades.splice(i, 1);

        if (g.type === 'smokegrenade') {
          this.detonateSmokeGrenade(detPos);
        } else {
          this.triggerExplosion(detPos, false, {
            name: g.ownerName,
            team: g.ownerTeam,
            isPlayer: g.isPlayerOwner
          });
        }
      }
    }

    // Update Pooled Active Explosions
    for (let i = 0; i < this.explosionPool.length; i++) {
      const ex = this.explosionPool[i];
      if (!ex.active) continue;
      ex.age += dt;
      const p = Math.min(1, ex.age / ex.duration);
      const grow = Math.sin(Math.min(1, p * 2.2) * (Math.PI / 2));

      ex.coreMesh.scale.setScalar(0.5 + grow * ex.maxScale * 0.55);
      ex.fireballMesh.scale.setScalar(0.8 + grow * ex.maxScale);
      ex.shockRingMesh.scale.setScalar(1.0 + p * ex.maxScale * (ex.isC4 ? 2.4 : 1.9));

      ex.coreMat.opacity = Math.max(0, 1 - p * 1.45);
      ex.fireballMat.opacity = Math.max(0, 0.88 * (1 - p));
      ex.ringMat.opacity = Math.max(0, 0.85 * (1 - p * 1.3));
      if (ex.flashLight) {
        ex.flashLight.intensity = (ex.isC4 ? 28 : 14) * Math.max(0, 1 - p * 2.1);
      }

      if (ex.age >= ex.duration) {
        ex.active = false;
        ex.coreMesh.visible = false;
        ex.fireballMesh.visible = false;
        ex.shockRingMesh.visible = false;
        if (ex.flashLight && ex.lightSlotIndex >= 0) {
          ex.flashLight.intensity = 0;
          this.explosionLightPool[ex.lightSlotIndex].inUse = false;
          ex.flashLight = null;
          ex.lightSlotIndex = -1;
        }
      }
    }

    // Sample player route/zone telemetry for Persistent Nemesis AI
    if (this.player.state.isAlive && !this.matchScore.isBuyPhase && !this.isRoundOverWaiting) {
      this.telemetrySampleTimer += dt;
      if (this.telemetrySampleTimer >= 1.5) {
        this.telemetrySampleTimer = 0;
        const z = this.tacticalProfile.classifyPositionZone(this.player.position);
        this.roundPlayerTelemetry.zoneTicks[z] = (this.roundPlayerTelemetry.zoneTicks[z] || 0) + 1;
        const nid = this.tacticalProfile.findNearestNodeId(this.player.position);
        this.roundPlayerTelemetry.nodeTicks[nid] = (this.roundPlayerTelemetry.nodeTicks[nid] || 0) + 1;
      }
    }

    // Collect active HE grenade threats so bots can detect & dodge incoming explosives
    const incomingGrenades: IncomingGrenadeThreat[] = [];
    for (let i = 0; i < this.thrownGrenades.length; i++) {
      const tg = this.thrownGrenades[i];
      if (tg.type === 'hegrenade') {
        incomingGrenades.push({
          pos: tg.mesh.position,
          vel: tg.vel,
          type: tg.type,
          ownerTeam: tg.ownerTeam
        });
      }
    }

    // Update Bots + Check Player Line-of-Sight for CS2 Radar Spotting
    const playerInfo: PlayerVisionInfo = {
      pos: this.player.position,
      yaw: this.player.yaw,
      team: this.playerTeam,
      isAlive: this.player.state.isAlive,
      isRunning: this.player.isRunning(),
      isCrouching: this.player.state.isCrouching,
      health: this.player.state.health,
      hasC4: this.player.state.hasC4,
      isPlanting: this.player.state.isPlanting,
      isDefusing: this.player.state.isDefusing
    };

    const nowMs = Date.now();
    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
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
        this.matchScore.bombTimeLeft,
        smokeVolumes,
        incomingGrenades,
        this.tacticalProfile
      );
    }

    // Mid-Round Dynamic Team Commander Evaluation (clusters, spotted C4 carrier, smart pivots, backup)
    if (!this.isRoundOverWaiting && !this.matchScore.isMatchOver && !this.matchScore.isBuyPhase) {
      const gangBots = this.bots.filter((b) => b.team === 'gang');
      const swatBots = this.bots.filter((b) => b.team === 'swat');
      const emitChat = (msg: {
        senderName: string;
        senderTeam: 'gang' | 'swat';
        textAr: string;
        textEn: string;
        isOrder: boolean;
      }) => {
        this.addTeamChat(msg.senderName, msg.senderTeam, msg.textAr, msg.textEn, msg.isOrder);
      };

      this.gangCommander.updateMidRound(
        dt,
        gangBots,
        swatBots,
        playerInfo,
        this.matchScore.isBombPlanted,
        this.bombWorldPos || undefined,
        this.droppedBombMesh ? this.droppedBombMesh.position : null,
        this.playerTeam === 'gang',
        emitChat
      );
      this.swatCommander.updateMidRound(
        dt,
        swatBots,
        gangBots,
        playerInfo,
        this.matchScore.isBombPlanted,
        this.bombWorldPos || undefined,
        this.droppedBombMesh ? this.droppedBombMesh.position : null,
        this.playerTeam === 'swat',
        emitChat
      );
    }

    // Update CS2 Radar Snapshot & Player LoS Spotting (15Hz instead of 60Hz)
    this.radarNotifyTimer += dt;
    if (this.radarNotifyTimer >= 0.065) {
      this.radarNotifyTimer = 0;
      const actors: RadarActor[] = [];
      for (const b of this.bots) {
        if (!b.state.isAlive) continue;
        const isAlly = b.team === this.playerTeam;
        if (!isAlly && this.player.state.isAlive) {
          const dist = b.position.distanceTo(this.player.position);
          if (dist < 45 && b.hasLineOfSight(this.player.position, b.position, colliders, smokeVolumes)) {
            b.lastSpottedTime = nowMs;
          }
        }
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
        smokes: smokeVolumes.map((s) => ({ x: s.center.x, z: s.center.z, radius: s.radius })),
        colliders: this.staticRadarColliders
      });
    }

    // Update Pooled Glowing Bullet Tracers
    for (let i = 0; i < this.tracerPool.length; i++) {
      const tr = this.tracerPool[i];
      if (!tr.active) continue;
      tr.age += dt;
      if (tr.age > 0.11) {
        tr.active = false;
        tr.mesh.visible = false;
      } else {
        tr.mat.opacity = 0.9 * (1 - tr.age / 0.11);
      }
    }

    // Update Spinning Shell Casings
    const shellLifetime = GAME_FEEL_CONFIG.vfx.shellLifetime;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.age += dt;
      sh.vel.y -= 15.0 * dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      sh.mesh.rotation.x += sh.rotVel.x * dt;
      sh.mesh.rotation.y += sh.rotVel.y * dt;
      sh.mesh.rotation.z += sh.rotVel.z * dt;
      const floorY = getSurfaceHeightAt(sh.mesh.position.x, sh.mesh.position.z, sh.mesh.position.y + 0.15, colliders, ramps, 0.02) + 0.02;
      if (sh.mesh.position.y < floorY) {
        sh.mesh.position.y = floorY;
        sh.vel.y = Math.abs(sh.vel.y) < 0.8 ? 0 : sh.vel.y * -0.35;
        sh.vel.x *= 0.52;
        sh.vel.z *= 0.52;
        sh.rotVel.multiplyScalar(0.5);
      }
      if (sh.age > shellLifetime) {
        this.scene.remove(sh.mesh);
        this.shells.splice(i, 1);
      }
    }

    // Update Impact Dust & Explosion Plume Puffs
    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const dp = this.dustPuffs[i];
      dp.age += dt;
      const mat = dp.mesh.material as THREE.MeshBasicMaterial;
      if (dp.hasMap) {
        dp.mesh.position.y += 1.25 * dt;
        dp.mesh.quaternion.copy(this.camera.quaternion);
        dp.mesh.scale.addScalar(dt * 1.4);
        mat.opacity = THREE.MathUtils.clamp(0.78 * (1 - (dp.age + 0.9) / 1.4), 0, 0.78);
      } else {
        const scale = 1 + dp.age * 4.5;
        dp.mesh.scale.setScalar(scale);
        mat.opacity = THREE.MathUtils.lerp(0.55, 0, dp.age / 0.45);
      }
      if (dp.age > 0.45) {
        this.scene.remove(dp.mesh);
        if (dp.hasMap) {
          this.releaseSmokeMat(mat);
        } else {
          mat.dispose();
        }
        this.dustPuffs.splice(i, 1);
      }
    }

    // Update Sparks (Shared Materials — zero per-particle disposal)
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.age += dt;
      sp.vel.y -= 9.8 * dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      if (sp.age > sp.maxAge) {
        this.scene.remove(sp.mesh);
        this.sparks.splice(i, 1);
      }
    }

    // Update 0.7s Golden Headshot Torch Flames on Killed Victims' Heads
    for (let i = this.headshotTorches.length - 1; i >= 0; i--) {
      const ht = this.headshotTorches[i];
      ht.age += dt;
      const p = Math.min(1, ht.age / ht.maxAge);

      if (ht.headBone) {
        ht.headBone.getWorldPosition(this._tmpVecA);
        ht.anchorPos.set(
          this._tmpVecA.x,
          Math.max(ht.groundY + 0.14, this._tmpVecA.y + 0.04),
          this._tmpVecA.z
        );
      }
      ht.group.position.copy(ht.anchorPos);

      // Fast ignite pop-in (0..0.07s), vivid flickering torch burn, smooth taper to 0 at 0.70s
      const ignite = Math.min(1, ht.age / 0.07);
      const fadeOut = p < 0.65 ? 1 : Math.max(0, 1 - (p - 0.65) / 0.35);
      const env = ignite * fadeOut;

      const t = ht.age + ht.seed;
      const flickerA = 0.86 + 0.22 * Math.sin(t * 46) + 0.1 * Math.cos(t * 71);
      const flickerB = 0.88 + 0.18 * Math.cos(t * 53);

      ht.haloMesh.quaternion.copy(this.camera.quaternion);
      ht.flameSprite.quaternion.copy(this.camera.quaternion);

      const widthScale = (0.88 + 0.16 * flickerB) * (0.45 + 0.55 * env);
      const heightScale = flickerA * (0.35 + 0.85 * ignite) * (0.3 + 0.7 * fadeOut);

      ht.outerCone.scale.set(widthScale, heightScale, widthScale);
      ht.outerCone.rotation.z = Math.sin(t * 28) * 0.08;
      ht.outerCone.rotation.x = Math.cos(t * 24) * 0.07;
      ht.innerCone.scale.set(widthScale * 0.95, heightScale * 1.05, widthScale * 0.95);

      ht.flameSprite.scale.set(0.62 * widthScale, 1.24 * heightScale, 1);
      ht.haloMesh.scale.setScalar((1.05 + 0.25 * flickerB) * (0.5 + 0.5 * env));

      ht.haloMat.opacity = 0.85 * env;
      ht.spriteMat.opacity = 0.96 * env;
      ht.outerMat.opacity = 0.88 * env;
      ht.innerMat.opacity = 0.98 * env;

      if (ht.age >= ht.maxAge) {
        this.scene.remove(ht.group);
        ht.haloMat.dispose();
        ht.spriteMat.dispose();
        ht.outerMat.dispose();
        ht.innerMat.dispose();
        this.headshotTorches.splice(i, 1);
      }
    }

    // Update Volumetric 3D Blood Droplets
    this.bloodVfx.update(dt, colliders, ramps);

    // Update Pooled Bot World Muzzle Flashes
    for (let i = 0; i < this.worldFlashPool.length; i++) {
      const wf = this.worldFlashPool[i];
      if (!wf.active) continue;
      wf.age += dt;
      if (wf.age > 0.06) {
        wf.active = false;
        wf.mesh.visible = false;
      } else {
        wf.mat.opacity = 0.92 * (1 - wf.age / 0.06);
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
    sound.stopOutcomeSounds();
    sound.stopAmbience();
    this.clearRoundTransientFX();
    for (const tr of this.tracerPool) {
      this.scene.remove(tr.mesh);
      tr.mat.dispose();
    }
    this.tracerPool = [];
    for (const wf of this.worldFlashPool) {
      this.scene.remove(wf.mesh);
      wf.mat.dispose();
    }
    this.worldFlashPool = [];
    for (const ex of this.explosionPool) {
      this.scene.remove(ex.coreMesh);
      this.scene.remove(ex.fireballMesh);
      this.scene.remove(ex.shockRingMesh);
      ex.coreMat.dispose();
      ex.fireballMat.dispose();
      ex.ringMat.dispose();
    }
    this.explosionPool = [];
    for (const l of this.explosionLightPool) {
      this.scene.remove(l.light);
    }
    this.explosionLightPool = [];
    for (const m of this.freeSmokeMats) {
      m.dispose();
    }
    this.freeSmokeMats = [];
    this.sharedBasicMats.forEach((m) => m.dispose());
    this.sharedBasicMats.clear();
    this.shellMat.dispose();
    this.heBodyMat.dispose();
    this.heBandMat.dispose();
    this.smokeBodyMat.dispose();
    this.smokeStripeMat.dispose();
    this.dropRingMat.dispose();
    this.decalMat.dispose();
    this.scorchDecalMat.dispose();
    this.bloodVfx.dispose();

    this.smokeSoftTexture.dispose();
    this.tracerGeo.dispose();
    this.sparkGeo.dispose();
    this.headshotSparkGeo.dispose();
    this.torchOuterGeo.dispose();
    this.torchInnerGeo.dispose();
    this.shellGeo.dispose();
    this.dustGeo.dispose();
    this.worldFlashGeo.dispose();
    this.decalGeo.dispose();
    this.smokePlaneGeo.dispose();
    this.blastSphereGeo.dispose();
    this.shockRingGeo.dispose();
    this.scorchGeo.dispose();
    this.heBodyGeo.dispose();
    this.heBandGeo.dispose();
    this.smokeBodyGeo.dispose();
    this.smokeStripeGeo.dispose();
    this.dropRingGeo.dispose();

    for (const bot of this.bots) {
      bot.char.mixer.stopAllAction();
      bot.char.mesh.geometry.dispose();
      const mats = Array.isArray(bot.char.mesh.material) ? bot.char.mesh.material : [bot.char.mesh.material];
      mats.forEach((m) => m.dispose());
      this.disposeObjectTree(bot.char.weaponAnchor);
    }
    this.player.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
