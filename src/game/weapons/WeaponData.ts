export interface WeaponStats {
  id: string;
  name: string;
  nameAr: string;
  category: 'pistol' | 'smg' | 'rifle' | 'sniper' | 'melee' | 'grenade' | 'explosive' | 'equipment';
  slot: 1 | 2 | 3 | 4 | 5; // 1: Primary, 2: Secondary, 3: Knife, 4: Grenade, 5: C4
  price: number;
  damage: number;
  headshotMultiplier: number;
  fireRate: number; // shots per second
  reloadTime: number; // seconds
  magazineSize: number;
  maxReserve: number;
  recoil: number;
  spread: number;
  isScoped?: boolean;
  sound: 'pistol' | 'deagle' | 'smg' | 'ak47' | 'm4a1' | 'awp' | 'knife' | 'grenade';
  team?: 'gang' | 'swat' | 'both';
  icon: string;
  descriptionAr: string;
}

export const WEAPONS: Record<string, WeaponStats> = {
  // --- Melee ---
  knife: {
    id: 'knife',
    name: 'Tactical Knife',
    nameAr: 'سكين تكتيكي',
    category: 'melee',
    slot: 3,
    price: 0,
    damage: 45,
    headshotMultiplier: 1.5,
    fireRate: 1.8,
    reloadTime: 0,
    magazineSize: 1,
    maxReserve: 0,
    recoil: 0,
    spread: 0.05,
    sound: 'knife',
    team: 'both',
    icon: '🗡️',
    descriptionAr: 'سلاح المشاجرة الصامت، طعنة سريعة وقاتلة من الخلف'
  },

  // --- Pistols (Secondary) ---
  glock: {
    id: 'glock',
    name: 'Glock-18',
    nameAr: 'غلوك 18',
    category: 'pistol',
    slot: 2,
    price: 200,
    damage: 28,
    headshotMultiplier: 3.5,
    fireRate: 6.5,
    reloadTime: 2.1,
    magazineSize: 20,
    maxReserve: 120,
    recoil: 0.015,
    spread: 0.02,
    sound: 'pistol',
    team: 'gang',
    icon: '🔫',
    descriptionAr: 'مسدس العصابة القياسي، مخزن 20 طلقة وسرعة إطلاق عالية'
  },
  usp: {
    id: 'usp',
    name: 'USP-S',
    nameAr: 'يو إس بي صامت',
    category: 'pistol',
    slot: 2,
    price: 200,
    damage: 32,
    headshotMultiplier: 3.8,
    fireRate: 5.5,
    reloadTime: 2.2,
    magazineSize: 12,
    maxReserve: 36,
    recoil: 0.012,
    spread: 0.012,
    sound: 'pistol',
    team: 'swat',
    icon: '🔫',
    descriptionAr: 'مسدس الشرطة الكاتم للصوت، دقة خارقة في الضربات الرأسية'
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    nameAr: 'نسر الصحراء',
    category: 'pistol',
    slot: 2,
    price: 700,
    damage: 60,
    headshotMultiplier: 4.0,
    fireRate: 3.5,
    reloadTime: 2.3,
    magazineSize: 7,
    maxReserve: 35,
    recoil: 0.045,
    spread: 0.03,
    sound: 'deagle',
    team: 'both',
    icon: '💥',
    descriptionAr: 'مسدس ثقيل فتاك، طلقة واحدة في الرأس كافية للقضاء الفوري'
  },

  // --- SMGs (Primary) ---
  mp5: {
    id: 'mp5',
    name: 'MP5-SD',
    nameAr: 'إم بي 5 كاتم',
    category: 'smg',
    slot: 1,
    price: 1500,
    damage: 27,
    headshotMultiplier: 3.2,
    fireRate: 11.5,
    reloadTime: 2.5,
    magazineSize: 30,
    maxReserve: 120,
    recoil: 0.018,
    spread: 0.025,
    sound: 'smg',
    team: 'both',
    icon: '⚡',
    descriptionAr: 'رشاش خفيف مع كاتم صوت، حركة سريعة وتحكم مثالي'
  },

  // --- Rifles (Primary) ---
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    nameAr: 'كلاشينكوف AK-47',
    category: 'rifle',
    slot: 1,
    price: 2700,
    damage: 36,
    headshotMultiplier: 4.0,
    fireRate: 9.0,
    reloadTime: 2.4,
    magazineSize: 30,
    maxReserve: 90,
    recoil: 0.032,
    spread: 0.018,
    sound: 'ak47',
    team: 'gang',
    icon: '🔥',
    descriptionAr: 'بندقية العصابة الأسطورية، قوة تدميرية هائلة وطلقة رأس قاتلة'
  },
  m4a1: {
    id: 'm4a1',
    name: 'M4A1-S',
    nameAr: 'إم 4 أيه 1 صامت',
    category: 'rifle',
    slot: 1,
    price: 2900,
    damage: 34,
    headshotMultiplier: 3.6,
    fireRate: 9.8,
    reloadTime: 2.5,
    magazineSize: 25,
    maxReserve: 75,
    recoil: 0.022,
    spread: 0.014,
    sound: 'm4a1',
    team: 'swat',
    icon: '🛡️',
    descriptionAr: 'بندقية الشرطة الدقيقة، ثبات خيالي وسرعة تصويب عالية'
  },

  // --- Sniper ---
  awp: {
    id: 'awp',
    name: 'AWP Magnum',
    nameAr: 'قناصة الآوب AWP',
    category: 'sniper',
    slot: 1,
    price: 4750,
    damage: 115,
    headshotMultiplier: 4.0,
    fireRate: 1.1,
    reloadTime: 3.3,
    magazineSize: 5,
    maxReserve: 30,
    recoil: 0.08,
    spread: 0.005,
    isScoped: true,
    sound: 'awp',
    team: 'both',
    icon: '🎯',
    descriptionAr: 'قناصة ماغنوم الخارقة، إصابة واحدة في الجذع أو الرأس تنهي الهدف فوراً'
  },

  // --- Tactical Grenades (Slot 4) ---
  hegrenade: {
    id: 'hegrenade',
    name: 'HE Grenade',
    nameAr: 'قنبلة يدوية متفجرة',
    category: 'grenade',
    slot: 4,
    price: 300,
    damage: 88,
    headshotMultiplier: 1.0,
    fireRate: 1.2,
    reloadTime: 0,
    magazineSize: 1,
    maxReserve: 0,
    recoil: 0,
    spread: 0,
    sound: 'grenade',
    team: 'both',
    icon: '💥',
    descriptionAr: 'قنبلة شظايا شديدة الانفجار، رمي بعيد باليسار أو قريب باليمين (المفتاح 4)'
  },
  smokegrenade: {
    id: 'smokegrenade',
    name: 'Smoke Grenade',
    nameAr: 'قنبلة دخانية',
    category: 'grenade',
    slot: 4,
    price: 300,
    damage: 0,
    headshotMultiplier: 1.0,
    fireRate: 1.2,
    reloadTime: 0,
    magazineSize: 1,
    maxReserve: 0,
    recoil: 0,
    spread: 0,
    sound: 'grenade',
    team: 'both',
    icon: '💨',
    descriptionAr: 'قنبلة دخانية كثيفة تحجب الرؤية وخطوط النار لتغطية التقدم أو التفكيك (المفتاح 4)'
  },

  // --- C4 Bomb ---
  c4: {
    id: 'c4',
    name: 'C4 Explosive',
    nameAr: 'قنبلة C4',
    category: 'explosive',
    slot: 5,
    price: 0,
    damage: 500,
    headshotMultiplier: 1.0,
    fireRate: 0,
    reloadTime: 0,
    magazineSize: 1,
    maxReserve: 0,
    recoil: 0,
    spread: 0,
    sound: 'knife',
    team: 'gang',
    icon: '💣',
    descriptionAr: 'شحنة C4 موقوتة، تُزرع في الموقع A أو B وتنفجر بعد 40 ثانية'
  }
};

export interface EquipmentItem {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  team: 'gang' | 'swat' | 'both';
  icon: string;
  descriptionAr: string;
}

export const EQUIPMENT: Record<string, EquipmentItem> = {
  kevlar: {
    id: 'kevlar',
    name: 'Kevlar Vest',
    nameAr: 'درع واقي',
    price: 650,
    team: 'both',
    icon: '🦺',
    descriptionAr: 'يحمي من 50% من ضرر الرصاص في الجذع'
  },
  helmet: {
    id: 'helmet',
    name: 'Kevlar + Helmet',
    nameAr: 'درع كامل + خوذة',
    price: 1000,
    team: 'both',
    icon: '🪖',
    descriptionAr: 'حماية كاملة للجسم والرأس من الرصاص الصغير'
  },
  defuser: {
    id: 'defuser',
    name: 'Defuse Kit',
    nameAr: 'حقيبة تفكيك القنابل',
    price: 400,
    team: 'swat',
    icon: '✂️',
    descriptionAr: 'تخفض وقت إبطال مفعول القنبلة من 5 ثوان إلى 2.5 ثانية فقط'
  },
  hegrenade: {
    id: 'hegrenade',
    name: 'HE Grenade',
    nameAr: 'قنبلة يدوية متفجرة',
    price: 300,
    team: 'both',
    icon: '💥',
    descriptionAr: 'قنبلة شظايا تسبب حتى 88 ضرراً واهتزازاً للانفجار (المفتاح 4)'
  },
  smokegrenade: {
    id: 'smokegrenade',
    name: 'Smoke Grenade',
    nameAr: 'قنبلة دخانية',
    price: 300,
    team: 'both',
    icon: '💨',
    descriptionAr: 'تطلق سحابة دخانية كثيفة تحجب الرؤية لمدة 14 ثانية (المفتاح 4)'
  }
};
