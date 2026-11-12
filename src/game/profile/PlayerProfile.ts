import type { MapId } from '../maps/MapBuilder';

export interface MatchRecord {
  id: string;
  timestamp: number;
  map: MapId | 'dust' | 'factory';
  team: 'gang' | 'swat';
  result: 'win' | 'loss';
  gangScore: number;
  policeScore: number;
  kills: number;
  deaths: number;
  headshots: number;
  xpEarned: number;
}

export interface LocalPlayerProfile {
  callsign: string;
  xp: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  roundsPlayed: number;
  roundsWon: number;
  kills: number;
  deaths: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  totalDamageDealt: number;
  plantsCompleted: number;
  defusesCompleted: number;
  bestKillStreak: number;
  weaponKills: Record<string, number>;
  recentMatches: MatchRecord[];
}

export interface LevelProgressInfo {
  level: number;
  rankTitleAr: string;
  rankTitleEn: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  totalXp: number;
}

const STORAGE_KEY = 'shooteral_local_profile_v1';

const RANKS: { minLevel: number; ar: string; en: string }[] = [
  { minLevel: 1, ar: 'مجند جديد', en: 'RECRUIT' },
  { minLevel: 3, ar: 'جندي أول', en: 'PRIVATE FIRST CLASS' },
  { minLevel: 6, ar: 'عريف تكتيكي', en: 'CORPORAL' },
  { minLevel: 10, ar: 'رقيب ميداني', en: 'SERGEANT' },
  { minLevel: 15, ar: 'رقيب أول', en: 'MASTER SERGEANT' },
  { minLevel: 20, ar: 'ملازم عمليات', en: 'LIEUTENANT' },
  { minLevel: 26, ar: 'نقيب نخبة', en: 'CAPTAIN' },
  { minLevel: 33, ar: 'رائد تكتيكي', en: 'MAJOR' },
  { minLevel: 40, ar: 'عقيد حرب', en: 'COLONEL' },
  { minLevel: 50, ar: 'قائد أسطوري', en: 'SUPREME COMMANDER' }
];

export function createDefaultProfile(): LocalPlayerProfile {
  return {
    callsign: 'STRIKER-01',
    xp: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    kills: 0,
    deaths: 0,
    headshots: 0,
    shotsFired: 0,
    shotsHit: 0,
    totalDamageDealt: 0,
    plantsCompleted: 0,
    defusesCompleted: 0,
    bestKillStreak: 0,
    weaponKills: {},
    recentMatches: []
  };
}

export function loadLocalProfile(): LocalPlayerProfile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProfile();
    const parsed = JSON.parse(raw) as Partial<LocalPlayerProfile>;
    return {
      ...createDefaultProfile(),
      ...parsed,
      weaponKills: parsed.weaponKills || {},
      recentMatches: Array.isArray(parsed.recentMatches) ? parsed.recentMatches : []
    };
  } catch {
    return createDefaultProfile();
  }
}

export function saveLocalProfile(profile: LocalPlayerProfile): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore quota/storage availability issues cleanly
  }
}

/**
 * Computes player level and XP progress within the current level.
 * Each level requires 500 + (level - 1) * 250 XP.
 */
export function getLevelProgress(totalXp: number): LevelProgressInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  let needed = 500;

  while (remaining >= needed && level < 100) {
    remaining -= needed;
    level++;
    needed = 500 + (level - 1) * 250;
  }

  let rank = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.minLevel) rank = r;
  }

  return {
    level,
    rankTitleAr: rank.ar,
    rankTitleEn: rank.en,
    currentLevelXp: remaining,
    nextLevelXp: needed,
    progressPercent: Math.min(100, Math.round((remaining / Math.max(1, needed)) * 100)),
    totalXp: Math.max(0, Math.floor(totalXp))
  };
}

export function updateLocalProfile(mutator: (p: LocalPlayerProfile) => void): LocalPlayerProfile {
  const profile = loadLocalProfile();
  mutator(profile);
  saveLocalProfile(profile);
  return profile;
}

export function resetLocalProfile(): LocalPlayerProfile {
  const fresh = createDefaultProfile();
  saveLocalProfile(fresh);
  return fresh;
}
