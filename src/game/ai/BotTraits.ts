export type BotArchetype = 'rusher' | 'sharpshooter' | 'tactician' | 'anchor' | 'lurker';

export interface BotTraitProfile {
  archetype: BotArchetype;
  labelAr: string;
  labelEn: string;
  speedMult: number;        // Movement agility multiplier (0.86 .. 1.16)
  rifleSkill: number;       // Aim & recoil control with rifles/SMGs/pistols (0.42 .. 0.94)
  sniperSkill: number;      // Long-range precision & AWP handling (0.40 .. 0.96)
  reactionBonus: number;    // Reaction threshold offset in seconds (-0.07 .. +0.10)
  utilityIQ: number;        // Grenade timing, cover usage, grenade dodging (0.45 .. 0.95)
  aggression: number;       // Eagerness to push/flank vs hold angles (0.25 .. 0.92)
  headshotTendency: number; // Base headshot intent probability (0.06 .. 0.24)
}

interface ArchetypePreset {
  archetype: BotArchetype;
  labelAr: string;
  labelEn: string;
  speedRange: [number, number];
  rifleRange: [number, number];
  sniperRange: [number, number];
  reactionRange: [number, number];
  utilityRange: [number, number];
  aggressionRange: [number, number];
  headshotRange: [number, number];
}

const ARCHETYPE_PRESETS: Record<BotArchetype, ArchetypePreset> = {
  // Fast entry/flanker: high speed & aggression, solid rifle/SMG, weaker with sniper
  rusher: {
    archetype: 'rusher',
    labelAr: 'مقتحم سريع',
    labelEn: 'RUSHER',
    speedRange: [1.09, 1.16],
    rifleRange: [0.70, 0.84],
    sniperRange: [0.40, 0.54],
    reactionRange: [-0.05, 0.01],
    utilityRange: [0.55, 0.74],
    aggressionRange: [0.78, 0.92],
    headshotRange: [0.11, 0.19]
  },
  // Dedicated sniper: slower movement, weaker rifle spray, lethal long-range AWP precision
  sharpshooter: {
    archetype: 'sharpshooter',
    labelAr: 'قناص محترف',
    labelEn: 'SNIPER',
    speedRange: [0.87, 0.94],
    rifleRange: [0.44, 0.58],
    sniperRange: [0.84, 0.96],
    reactionRange: [-0.06, 0.02],
    utilityRange: [0.62, 0.82],
    aggressionRange: [0.26, 0.44],
    headshotRange: [0.14, 0.24]
  },
  // Smart coordinator / carrier / utility specialist
  tactician: {
    archetype: 'tactician',
    labelAr: 'قائد تكتيكي',
    labelEn: 'TACTICIAN',
    speedRange: [0.98, 1.04],
    rifleRange: [0.74, 0.86],
    sniperRange: [0.64, 0.78],
    reactionRange: [-0.04, 0.02],
    utilityRange: [0.84, 0.95],
    aggressionRange: [0.52, 0.68],
    headshotRange: [0.12, 0.20]
  },
  // Patient site defender / post-plant anchor
  anchor: {
    archetype: 'anchor',
    labelAr: 'مدافع صلب',
    labelEn: 'ANCHOR',
    speedRange: [0.92, 0.99],
    rifleRange: [0.72, 0.85],
    sniperRange: [0.58, 0.74],
    reactionRange: [-0.02, 0.05],
    utilityRange: [0.74, 0.90],
    aggressionRange: [0.32, 0.50],
    headshotRange: [0.10, 0.18]
  },
  // Agile flanker / distractor: fast, unpredictable, good Deagle/SMG
  lurker: {
    archetype: 'lurker',
    labelAr: 'مناور سريع',
    labelEn: 'LURKER',
    speedRange: [1.05, 1.13],
    rifleRange: [0.66, 0.80],
    sniperRange: [0.55, 0.72],
    reactionRange: [-0.06, 0.01],
    utilityRange: [0.66, 0.84],
    aggressionRange: [0.66, 0.82],
    headshotRange: [0.12, 0.21]
  }
};

function randInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function createTraitProfile(archetype: BotArchetype): BotTraitProfile {
  const p = ARCHETYPE_PRESETS[archetype];
  return {
    archetype: p.archetype,
    labelAr: p.labelAr,
    labelEn: p.labelEn,
    speedMult: Number(randInRange(p.speedRange[0], p.speedRange[1]).toFixed(3)),
    rifleSkill: Number(randInRange(p.rifleRange[0], p.rifleRange[1]).toFixed(3)),
    sniperSkill: Number(randInRange(p.sniperRange[0], p.sniperRange[1]).toFixed(3)),
    reactionBonus: Number(randInRange(p.reactionRange[0], p.reactionRange[1]).toFixed(3)),
    utilityIQ: Number(randInRange(p.utilityRange[0], p.utilityRange[1]).toFixed(3)),
    aggression: Number(randInRange(p.aggressionRange[0], p.aggressionRange[1]).toFixed(3)),
    headshotTendency: Number(randInRange(p.headshotRange[0], p.headshotRange[1]).toFixed(3))
  };
}

/**
 * Generates a diverse, realistic roster of trait profiles for a team so bots vary
 * naturally (fast rushers, slow deadly snipers with weaker rifle aim, tacticians, etc.)
 * and role assignment by the Team Commander is meaningfully grounded in bot strengths.
 */
export function generateTeamTraitRoster(team: 'gang' | 'swat', botCount: number): BotTraitProfile[] {
  const swatOrder: BotArchetype[] = [
    'sharpshooter',
    'rusher',
    'sharpshooter',
    'tactician',
    'lurker',
    'anchor',
    'rusher',
    'sharpshooter'
  ];
  const gangOrder: BotArchetype[] = [
    'tactician',
    'anchor',
    'rusher',
    'lurker',
    'anchor',
    'sharpshooter',
    'rusher',
    'tactician'
  ];

  const baseOrder = team === 'swat' ? swatOrder : gangOrder;
  const profiles: BotTraitProfile[] = [];
  for (let i = 0; i < botCount; i++) {
    profiles.push(createTraitProfile(baseOrder[i % baseOrder.length]));
  }
  return profiles;
}
