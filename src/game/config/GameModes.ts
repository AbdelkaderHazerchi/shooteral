export type GameModeId = 'single_raid' | 'quick_match' | 'bloody_battle' | 'legends_match';

export interface GameModeConfig {
  id: GameModeId;
  nameAr: string;
  nameEn: string;
  totalRounds: number;
  winsNeeded: number;
  leadThreshold: number | null;
  badgeAr: string;
  badgeEn: string;
  summaryAr: string;
  summaryEn: string;
  targetLabelAr: string;
  targetLabelEn: string;
  matchWinXp: number;
  matchLossXp: number;
}

export const GAME_MODES: Record<GameModeId, GameModeConfig> = {
  single_raid: {
    id: 'single_raid',
    nameAr: 'مداهمة واحدة',
    nameEn: 'Single Raid',
    totalRounds: 1,
    winsNeeded: 1,
    leadThreshold: null,
    badgeAr: 'جولة 1',
    badgeEn: '1 RND',
    summaryAr: 'الفائز بالجولة ينتصر',
    summaryEn: '1 Round · Winner Takes All',
    targetLabelAr: 'جولة واحدة حاسمة',
    targetLabelEn: '1 ROUND DECIDER',
    matchWinXp: 110,
    matchLossXp: 45
  },
  quick_match: {
    id: 'quick_match',
    nameAr: 'مباراة سريعة',
    nameEn: 'Quick Match',
    totalRounds: 3,
    winsNeeded: 2,
    leadThreshold: null,
    badgeAr: '3 جولات',
    badgeEn: '3 RNDS',
    summaryAr: 'الأغلبية من 3 جولات',
    summaryEn: 'Best of 3 · First to 2W',
    targetLabelAr: '3 جولات · فوزان للحسم',
    targetLabelEn: 'BO3 · FIRST TO 2W',
    matchWinXp: 170,
    matchLossXp: 70
  },
  bloody_battle: {
    id: 'bloody_battle',
    nameAr: 'معركة دامية',
    nameEn: 'Bloody Battle',
    totalRounds: 5,
    winsNeeded: 3,
    leadThreshold: null,
    badgeAr: '5 جولات',
    badgeEn: '5 RNDS',
    summaryAr: 'الأغلبية من 5 جولات',
    summaryEn: 'Best of 5 · First to 3W',
    targetLabelAr: '5 جولات · 3 انتصارات',
    targetLabelEn: 'BO5 · FIRST TO 3W',
    matchWinXp: 230,
    matchLossXp: 95
  },
  legends_match: {
    id: 'legends_match',
    nameAr: 'مباراة الأساطير',
    nameEn: 'Legends Match',
    totalRounds: 20,
    winsNeeded: 11,
    leadThreshold: 10,
    badgeAr: '20 جولة',
    badgeEn: '20 RNDS',
    summaryAr: 'الأغلبية أو فارق 10',
    summaryEn: '11 Wins or +10 Lead',
    targetLabelAr: '20 جولة · 11 فوزاً أو فارق 10',
    targetLabelEn: '20R · 11W OR +10 LEAD',
    matchWinXp: 360,
    matchLossXp: 140
  }
};

export const GAME_MODE_LIST: GameModeConfig[] = [
  GAME_MODES.single_raid,
  GAME_MODES.quick_match,
  GAME_MODES.bloody_battle,
  GAME_MODES.legends_match
];

export const DEFAULT_GAME_MODE: GameModeId = 'quick_match';
