export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type ReflectionsQuality = 'off' | 'low' | 'high';
export type TextureQuality = 'low' | 'medium' | 'high';

export interface GameSettings {
  mouseSensitivity: number;
  volume: number;
  crosshairColor: string;
  crosshairSize: number;
  fov: number;
  language: 'ar' | 'en';
  reducedMotion?: boolean;
  graphicsPreset: GraphicsPreset;
  pixelRatioScale: number;
  shadows: ShadowQuality;
  reflections: ReflectionsQuality;
  textureQuality: TextureQuality;
  antialias: boolean;
}

export const GRAPHICS_PRESETS: Record<
  Exclude<GraphicsPreset, 'custom'>,
  Pick<GameSettings, 'pixelRatioScale' | 'shadows' | 'reflections' | 'textureQuality' | 'antialias'>
> = {
  low: {
    pixelRatioScale: 0.75,
    shadows: 'off',
    reflections: 'off',
    textureQuality: 'low',
    antialias: false
  },
  medium: {
    pixelRatioScale: 1.0,
    shadows: 'low',
    reflections: 'low',
    textureQuality: 'medium',
    antialias: true
  },
  high: {
    pixelRatioScale: 1.0,
    shadows: 'medium',
    reflections: 'high',
    textureQuality: 'high',
    antialias: true
  },
  ultra: {
    pixelRatioScale: 1.5,
    shadows: 'high',
    reflections: 'high',
    textureQuality: 'high',
    antialias: true
  }
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  mouseSensitivity: 0.0022,
  volume: 0.75,
  crosshairColor: '#00ff00',
  crosshairSize: 4,
  fov: 75,
  language: 'ar',
  reducedMotion: false,
  graphicsPreset: 'high',
  ...GRAPHICS_PRESETS.high
};

export function applyGraphicsPreset(
  settings: GameSettings,
  preset: Exclude<GraphicsPreset, 'custom'>
): GameSettings {
  return {
    ...settings,
    graphicsPreset: preset,
    ...GRAPHICS_PRESETS[preset]
  };
}

export function detectGraphicsPreset(settings: GameSettings): GraphicsPreset {
  const keys: Exclude<GraphicsPreset, 'custom'>[] = ['low', 'medium', 'high', 'ultra'];
  for (const key of keys) {
    const p = GRAPHICS_PRESETS[key];
    if (
      Math.abs(settings.pixelRatioScale - p.pixelRatioScale) < 0.01 &&
      settings.shadows === p.shadows &&
      settings.reflections === p.reflections &&
      settings.textureQuality === p.textureQuality &&
      settings.antialias === p.antialias
    ) {
      return key;
    }
  }
  return 'custom';
}

const SETTINGS_STORAGE_KEY = 'shooteral_settings_v1';

export function loadSavedSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const merged: GameSettings = {
      ...DEFAULT_GAME_SETTINGS,
      ...parsed
    };
    merged.pixelRatioScale = Math.max(0.5, Math.min(2.0, Number(merged.pixelRatioScale) || 1.25));
    merged.fov = Math.max(60, Math.min(100, Number(merged.fov) || 75));
    merged.graphicsPreset = detectGraphicsPreset(merged);
    return merged;
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}
