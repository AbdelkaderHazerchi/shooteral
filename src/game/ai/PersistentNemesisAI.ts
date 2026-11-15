import { TacticalZone } from './MapTacticalAnalyzer';

const NEMESIS_STORAGE_KEY = 'shooteral_nemesis_ai_v1';
const MAX_MAPS_STORED = 6;
const MAX_NODES_PER_MAP = 5;

export interface CompactMapMemory {
  // [site_a, mid, site_b] exponentially decayed weights
  atk: [number, number, number];
  def: [number, number, number];
  // Top favored navNodeIds visited by player: [nodeId, weight]
  topNodes: [string, number][];
}

export interface PersistentNemesisState {
  v: 1;
  rounds: number;
  hsRate: number;      // 0..1 EMA of player's headshot rate
  moveMiss: number;    // 0..1 EMA of player missing moving bots
  nadeVuln: number;    // 0..1 EMA of player vulnerability to HE grenades
  sniperVuln: number;  // 0..1 EMA of player dying to long-range / AWP
  rushVuln: number;    // 0..1 EMA of player dying to close rushes / flanks
  avgDist: number;     // EMA engagement distance (meters)
  maps: Record<string, CompactMapMemory>;
}

export interface NemesisCounterAdvice {
  roundsObserved: number;
  predictedPlayerZone: TacticalZone | null;
  avoidPlayerZone: 'site_a' | 'site_b' | null;
  hotPlayerNodes: string[];
  antiHeadshotMove: number; // 0..1 -> enemy crouch-mix & strafe unpredictability vs HS player
  strafeBoost: number;      // 0..1 -> enemy strafe speed/evasion if player misses moving targets
  hePriority: number;       // 0..1 -> enemy HE grenade aggression against player cover
  sniperPressure: number;   // 0..1 -> enemy sniper emphasis if player struggles vs long range
  rushPressure: number;     // 0..1 -> enemy flank/rush emphasis if player struggles vs rushes
}

export interface RoundPlayerTelemetry {
  mapId: string;
  playerTeam: 'gang' | 'swat';
  zoneTicks: Record<TacticalZone, number>;
  nodeTicks: Record<string, number>;
  shotsFiredAtBots: number;
  shotsHitOnBots: number;
  shotsMissedVsMoving: number;
  shotsAtMoving: number;
  playerHitsLanded: number;
  playerHeadshotsLanded: number;
  heDamageTaken: number;
  diedToHE: boolean;
  diedToLongRange: boolean;
  diedToCloseRush: boolean;
  avgCombatDist: number;
  combatSamples: number;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function defaultState(): PersistentNemesisState {
  return {
    v: 1,
    rounds: 0,
    hsRate: 0.18,
    moveMiss: 0.35,
    nadeVuln: 0.2,
    sniperVuln: 0.25,
    rushVuln: 0.25,
    avgDist: 18,
    maps: {}
  };
}

export function loadNemesisState(): PersistentNemesisState {
  try {
    const raw = window.localStorage.getItem(NEMESIS_STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PersistentNemesisState>;
    if (!parsed || parsed.v !== 1) return defaultState();
    return {
      v: 1,
      rounds: Math.max(0, Number(parsed.rounds) || 0),
      hsRate: clamp01(Number(parsed.hsRate) || 0.18),
      moveMiss: clamp01(Number(parsed.moveMiss) || 0.35),
      nadeVuln: clamp01(Number(parsed.nadeVuln) || 0.2),
      sniperVuln: clamp01(Number(parsed.sniperVuln) || 0.25),
      rushVuln: clamp01(Number(parsed.rushVuln) || 0.25),
      avgDist: Math.max(4, Math.min(50, Number(parsed.avgDist) || 18)),
      maps: parsed.maps && typeof parsed.maps === 'object' ? parsed.maps : {}
    };
  } catch {
    return defaultState();
  }
}

export function saveNemesisState(state: PersistentNemesisState): void {
  try {
    // Enforce strict compact cap on maps and nodes to keep localStorage footprint tiny (< ~2KB)
    const entries = Object.entries(state.maps);
    if (entries.length > MAX_MAPS_STORED) {
      entries.sort((a, b) => {
        const sumA = a[1].atk[0] + a[1].atk[1] + a[1].atk[2] + a[1].def[0] + a[1].def[1] + a[1].def[2];
        const sumB = b[1].atk[0] + b[1].atk[1] + b[1].atk[2] + b[1].def[0] + b[1].def[1] + b[1].def[2];
        return sumB - sumA;
      });
      state.maps = Object.fromEntries(entries.slice(0, MAX_MAPS_STORED));
    }
    window.localStorage.setItem(NEMESIS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

/**
 * Updates the persistent, team-agnostic Nemesis AI profile at the end of a round
 * using lightweight exponential moving averages and capped per-map route weights.
 */
export function recordRoundIntoNemesis(
  state: PersistentNemesisState,
  tel: RoundPlayerTelemetry
): PersistentNemesisState {
  state.rounds += 1;

  // 1. Update global player combat fingerprint & weaknesses
  if (tel.playerHitsLanded >= 2) {
    const roundHsRate = clamp01(tel.playerHeadshotsLanded / tel.playerHitsLanded);
    state.hsRate = r2(state.hsRate * 0.78 + roundHsRate * 0.22);
  }

  if (tel.shotsAtMoving >= 4) {
    const roundMoveMiss = clamp01(tel.shotsMissedVsMoving / tel.shotsAtMoving);
    state.moveMiss = r2(state.moveMiss * 0.78 + roundMoveMiss * 0.22);
  }

  const roundNadeVuln = tel.diedToHE ? 1.0 : clamp01(tel.heDamageTaken / 65);
  state.nadeVuln = r2(state.nadeVuln * 0.84 + roundNadeVuln * 0.16);

  if (tel.diedToLongRange) {
    state.sniperVuln = r2(clamp01(state.sniperVuln * 0.8 + 0.2));
  } else {
    state.sniperVuln = r2(clamp01(state.sniperVuln * 0.94));
  }

  if (tel.diedToCloseRush) {
    state.rushVuln = r2(clamp01(state.rushVuln * 0.8 + 0.2));
  } else {
    state.rushVuln = r2(clamp01(state.rushVuln * 0.94));
  }

  if (tel.combatSamples > 0) {
    state.avgDist = r2(state.avgDist * 0.82 + tel.avgCombatDist * 0.18);
  }

  // 2. Update compact per-map route & zone preferences
  const totalTicks = tel.zoneTicks.site_a + tel.zoneTicks.mid + tel.zoneTicks.site_b;
  if (totalTicks > 0) {
    const mapMem: CompactMapMemory = state.maps[tel.mapId] || {
      atk: [0, 0, 0],
      def: [0, 0, 0],
      topNodes: []
    };

    const decay = 0.86;
    const wA = tel.zoneTicks.site_a / totalTicks;
    const wM = tel.zoneTicks.mid / totalTicks;
    const wB = tel.zoneTicks.site_b / totalTicks;

    const arr = tel.playerTeam === 'gang' ? mapMem.atk : mapMem.def;
    arr[0] = r2(arr[0] * decay + wA);
    arr[1] = r2(arr[1] * decay + wM);
    arr[2] = r2(arr[2] * decay + wB);

    // Merge & prune top-5 favorite nodes
    const nodeMap = new Map<string, number>();
    for (const [nid, w] of mapMem.topNodes) {
      nodeMap.set(nid, w * decay);
    }
    for (const [nid, count] of Object.entries(tel.nodeTicks)) {
      nodeMap.set(nid, (nodeMap.get(nid) || 0) + count / Math.max(1, totalTicks));
    }
    mapMem.topNodes = Array.from(nodeMap.entries())
      .map(([nid, w]) => [nid, r2(w)] as [string, number])
      .filter(([, w]) => w >= 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_NODES_PER_MAP);

    state.maps[tel.mapId] = mapMem;
  }

  saveNemesisState(state);
  return state;
}

/**
 * Generates concise counter-tactics for the AI team currently opposing the human player.
 * Completely team-agnostic: adapts seamlessly whether the player plays Gang or SWAT.
 */
export function getNemesisCounterAdvice(
  state: PersistentNemesisState,
  mapId: string,
  enemyTeamIsGang: boolean
): NemesisCounterAdvice {
  const mapMem = state.maps[mapId];
  let predictedPlayerZone: TacticalZone | null = null;
  let avoidPlayerZone: 'site_a' | 'site_b' | null = null;
  const hotPlayerNodes = mapMem ? mapMem.topNodes.map(([id]) => id) : [];

  if (mapMem && state.rounds >= 1) {
    // If enemy is SWAT, predict where Gang player likes to attack (atk);
    // if enemy is Gang, predict where SWAT player likes to defend (def)!
    const weights = enemyTeamIsGang ? mapMem.def : mapMem.atk;
    const [wA, wM, wB] = weights;
    const sum = wA + wM + wB;
    if (sum > 0.25) {
      if (wA >= wM && wA >= wB) predictedPlayerZone = 'site_a';
      else if (wB >= wM && wB >= wA) predictedPlayerZone = 'site_b';
      else predictedPlayerZone = 'mid';

      if (enemyTeamIsGang) {
        if (wA > wB + 0.25) avoidPlayerZone = 'site_a';
        else if (wB > wA + 0.25) avoidPlayerZone = 'site_b';
      }
    }
  }

  const readiness = Math.min(1, state.rounds / 4);
  const antiHeadshotMove = clamp01(((state.hsRate - 0.16) / 0.35) * readiness);
  const strafeBoost = clamp01(((state.moveMiss - 0.28) / 0.45) * readiness);
  const hePriority = clamp01(((state.nadeVuln - 0.14) / 0.5) * readiness);
  const sniperPressure = clamp01(((state.sniperVuln - 0.16) / 0.45) * readiness);
  const rushPressure = clamp01(((state.rushVuln - 0.16) / 0.45) * readiness);

  return {
    roundsObserved: state.rounds,
    predictedPlayerZone,
    avoidPlayerZone,
    hotPlayerNodes,
    antiHeadshotMove,
    strafeBoost,
    hePriority,
    sniperPressure,
    rushPressure
  };
}
