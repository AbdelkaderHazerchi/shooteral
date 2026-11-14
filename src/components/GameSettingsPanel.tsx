import React, { useState } from 'react';
import { Sliders, Monitor } from 'lucide-react';
import {
  applyGraphicsPreset,
  detectGraphicsPreset,
  GameSettings,
  GraphicsPreset,
  ReflectionsQuality,
  ShadowQuality,
  TextureQuality
} from '../game/config/GraphicsConfig';
import { sound } from '../game/audio/SoundEffects';

interface GameSettingsPanelProps {
  settings: GameSettings;
  onUpdateSettings: (s: GameSettings) => void;
  inMatch?: boolean;
}

const PIXEL_SCALES: { value: number; labelAr: string; labelEn: string }[] = [
  { value: 0.5, labelAr: '50%', labelEn: '50%' },
  { value: 0.75, labelAr: '75%', labelEn: '75%' },
  { value: 1.0, labelAr: '100%', labelEn: '100%' },
  { value: 1.5, labelAr: '150%', labelEn: '150%' },
  { value: 2.0, labelAr: '200%', labelEn: '200%' }
];

export const GameSettingsPanel: React.FC<GameSettingsPanelProps> = ({
  settings,
  onUpdateSettings,
  inMatch = false
}) => {
  const [tab, setTab] = useState<'gameplay' | 'graphics'>('graphics');
  const isAr = settings.language === 'ar';
  const activePreset = detectGraphicsPreset(settings);

  const updateGraphicsField = <K extends keyof GameSettings>(key: K, val: GameSettings[K]) => {
    const updated: GameSettings = { ...settings, [key]: val };
    updated.graphicsPreset = detectGraphicsPreset(updated);
    onUpdateSettings(updated);
  };

  const handlePreset = (preset: Exclude<GraphicsPreset, 'custom'>) => {
    sound.playUiClick('toggle');
    onUpdateSettings(applyGraphicsPreset(settings, preset));
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Sub-navigation Tabs */}
      <div className="grid grid-cols-2 gap-2 border-b border-white/15 pb-3">
        <button
          onClick={() => {
            sound.playUiClick('default');
            setTab('graphics');
          }}
          className={`py-2 px-3 text-xs font-bold uppercase tracking-wider border flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            tab === 'graphics'
              ? 'bg-[#e03c1f] text-white border-[#ff6b4e]'
              : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>{isAr ? 'الجودة والرسوميات' : 'GRAPHICS'}</span>
        </button>
        <button
          onClick={() => {
            sound.playUiClick('default');
            setTab('gameplay');
          }}
          className={`py-2 px-3 text-xs font-bold uppercase tracking-wider border flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            tab === 'gameplay'
              ? 'bg-[#e03c1f] text-white border-[#ff6b4e]'
              : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{isAr ? 'التحكم والصوت' : 'GAMEPLAY'}</span>
        </button>
      </div>

      {tab === 'graphics' ? (
        <div className="space-y-4">
          {/* Overall Quality Preset */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-neutral-100">
                {isAr ? 'مستوى الجودة العام' : 'Quality Preset'}
              </span>
              {activePreset === 'custom' && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-400/40 uppercase">
                  {isAr ? 'مخصّص' : 'CUSTOM'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'low', ar: 'منخفض', en: 'LOW' },
                  { id: 'medium', ar: 'متوسط', en: 'MED' },
                  { id: 'high', ar: 'عالي', en: 'HIGH' },
                  { id: 'ultra', ar: 'فائق', en: 'ULTRA' }
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePreset(p.id)}
                  className={`py-2 text-xs font-bold border transition-colors cursor-pointer ${
                    activePreset === p.id
                      ? 'bg-white text-black border-white'
                      : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white hover:border-white/35'
                  }`}
                >
                  {isAr ? p.ar : p.en}
                </button>
              ))}
            </div>
          </div>

          {/* Pixel Resolution Scale (جودة البكسلات) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <div className="font-medium text-neutral-100">
                  {isAr ? 'جودة البكسلات (الدقة)' : 'Pixel Resolution Scale'}
                </div>
                <div className="text-[11px] text-neutral-400">
                  {isAr ? '50% لأعلى أداء · 100% أصلية · 150%+ فائقة الحدة' : '50% max FPS · 100% native · 150%+ supersampled'}
                </div>
              </div>
              <span className="font-mono text-xs font-bold text-white tabular-nums">
                {Math.round(settings.pixelRatioScale * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5" dir="ltr">
              {PIXEL_SCALES.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    sound.playUiClick('toggle');
                    updateGraphicsField('pixelRatioScale', opt.value);
                  }}
                  className={`py-2 text-xs font-mono font-bold border transition-colors cursor-pointer ${
                    Math.abs(settings.pixelRatioScale - opt.value) < 0.01
                      ? 'bg-white text-black border-white'
                      : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                  }`}
                >
                  {isAr ? opt.labelAr : opt.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Shadow Quality */}
          <div>
            <label className="block mb-1.5 font-medium text-neutral-100">
              {isAr ? 'جودة الظلال' : 'Shadow Quality'}
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'off', ar: 'معطلة', en: 'OFF' },
                  { id: 'low', ar: 'منخفض', en: 'LOW' },
                  { id: 'medium', ar: 'متوسط', en: 'MED' },
                  { id: 'high', ar: 'عالي', en: 'HIGH' }
                ] as { id: ShadowQuality; ar: string; en: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    sound.playUiClick('toggle');
                    updateGraphicsField('shadows', opt.id);
                  }}
                  className={`py-2 text-xs font-bold border transition-colors cursor-pointer ${
                    settings.shadows === opt.id
                      ? 'bg-white text-black border-white'
                      : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                  }`}
                >
                  {isAr ? opt.ar : opt.en}
                </button>
              ))}
            </div>
          </div>

          {/* Reflections & PBR Lighting */}
          <div>
            <label className="block mb-1.5 font-medium text-neutral-100">
              {isAr ? 'الانعكاسات والإضاءة المحيطية' : 'Reflections & IBL Lighting'}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'off', ar: 'معطل (أداء)', en: 'OFF' },
                  { id: 'low', ar: 'متوازن', en: 'BALANCED' },
                  { id: 'high', ar: 'واقعي', en: 'REALISTIC' }
                ] as { id: ReflectionsQuality; ar: string; en: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    sound.playUiClick('toggle');
                    updateGraphicsField('reflections', opt.id);
                  }}
                  className={`py-2 text-xs font-bold border transition-colors cursor-pointer ${
                    settings.reflections === opt.id
                      ? 'bg-white text-black border-white'
                      : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                  }`}
                >
                  {isAr ? opt.ar : opt.en}
                </button>
              ))}
            </div>
          </div>

          {/* Texture Filtering (Anisotropy) */}
          <div>
            <label className="block mb-1.5 font-medium text-neutral-100">
              {isAr ? 'جودة وتفاصيل الخامات' : 'Texture Detail Filtering'}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'low', ar: 'عادي (1x)', en: '1X' },
                  { id: 'medium', ar: 'متوسط (4x)', en: '4X' },
                  { id: 'high', ar: 'فائق (Max)', en: 'MAX' }
                ] as { id: TextureQuality; ar: string; en: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    sound.playUiClick('toggle');
                    updateGraphicsField('textureQuality', opt.id);
                  }}
                  className={`py-2 text-xs font-bold border transition-colors cursor-pointer ${
                    settings.textureQuality === opt.id
                      ? 'bg-white text-black border-white'
                      : 'bg-[#171b22] text-neutral-300 border-white/15 hover:text-white'
                  }`}
                >
                  {isAr ? opt.ar : opt.en}
                </button>
              ))}
            </div>
          </div>

          {/* Antialiasing MSAA */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div>
              <div className="font-medium text-neutral-100">
                {isAr ? 'تنعيم الحواف (MSAA)' : 'Antialiasing (MSAA)'}
              </div>
              <div className="text-[11px] text-neutral-400">
                {inMatch
                  ? isAr
                    ? 'يطبق عند بدء المباراة القادمة · باقي الإعدادات فورية'
                    : 'Applies on next match start · other settings apply live'
                  : isAr
                    ? 'ينعّم حواف الأجسام والأسلاك الدقيقة'
                    : 'Smooths jagged geometry edges'}
              </div>
            </div>
            <button
              onClick={() => {
                sound.playUiClick('toggle');
                updateGraphicsField('antialias', !settings.antialias);
              }}
              className={`px-3.5 py-2 text-xs font-mono font-bold border transition-colors cursor-pointer shrink-0 ${
                settings.antialias
                  ? 'bg-white text-black border-white'
                  : 'bg-[#1a1e26] text-neutral-300 border-white/15 hover:text-white'
              }`}
            >
              {settings.antialias ? (isAr ? 'مُفعّل' : 'ON') : (isAr ? 'متوقف' : 'OFF')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mouse Sensitivity */}
          <div>
            <label className="flex justify-between mb-1.5 font-medium">
              <span>{isAr ? 'حساسية الفأرة' : 'Mouse Sensitivity'}</span>
              <span className="font-mono font-bold tabular-nums text-white">
                {Math.round(settings.mouseSensitivity * 10000)}
              </span>
            </label>
            <input
              type="range"
              min="0.001"
              max="0.005"
              step="0.0002"
              value={settings.mouseSensitivity}
              onChange={(e) => onUpdateSettings({ ...settings, mouseSensitivity: parseFloat(e.target.value) })}
              className="w-full accent-[#e03c1f] cursor-pointer"
            />
          </div>

          {/* Master Volume */}
          <div>
            <label className="flex justify-between mb-1.5 font-medium">
              <span>{isAr ? 'مستوى الصوت' : 'Master Volume'}</span>
              <span className="font-mono font-bold tabular-nums text-white">
                {Math.round(settings.volume * 100)}%
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(e) => onUpdateSettings({ ...settings, volume: parseFloat(e.target.value) })}
              className="w-full accent-[#e03c1f] cursor-pointer"
            />
          </div>

          {/* Field of View (FOV) */}
          <div>
            <label className="flex justify-between mb-1.5 font-medium">
              <span>{isAr ? 'مجال الرؤية (FOV)' : 'Field of View (FOV)'}</span>
              <span className="font-mono font-bold tabular-nums text-white">{settings.fov}°</span>
            </label>
            <input
              type="range"
              min="65"
              max="95"
              step="1"
              value={settings.fov}
              onChange={(e) => onUpdateSettings({ ...settings, fov: parseInt(e.target.value, 10) })}
              className="w-full accent-[#e03c1f] cursor-pointer"
            />
          </div>

          {/* Crosshair Color */}
          <div>
            <label className="block mb-2 font-medium">
              {isAr ? 'لون علامة التصويب' : 'Crosshair Color'}
            </label>
            <div className="flex gap-2">
              {['#00ff00', '#00ffff', '#ff0055', '#ffff00', '#ffffff'].map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    sound.playUiClick('toggle');
                    onUpdateSettings({ ...settings, crosshairColor: color });
                  }}
                  style={{ backgroundColor: color }}
                  className={`w-9 h-9 border-2 transition-transform cursor-pointer ${
                    settings.crosshairColor === color ? 'border-white scale-105' : 'border-transparent opacity-65'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="block mb-2 font-medium">{isAr ? 'اللغة / Language' : 'Language'}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  sound.playUiClick('toggle');
                  onUpdateSettings({ ...settings, language: 'ar' });
                }}
                className={`py-2.5 text-xs font-bold border transition-colors cursor-pointer ${
                  settings.language === 'ar'
                    ? 'bg-white text-black border-white'
                    : 'bg-[#1a1e26] text-neutral-300 border-white/15 hover:text-white'
                }`}
              >
                العربية
              </button>
              <button
                onClick={() => {
                  sound.playUiClick('toggle');
                  onUpdateSettings({ ...settings, language: 'en' });
                }}
                className={`py-2.5 text-xs font-bold border transition-colors cursor-pointer ${
                  settings.language === 'en'
                    ? 'bg-white text-black border-white'
                    : 'bg-[#1a1e26] text-neutral-300 border-white/15 hover:text-white'
                }`}
              >
                ENGLISH
              </button>
            </div>
          </div>

          {/* Reduced Motion */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/10">
            <div>
              <div className="font-medium text-neutral-100">
                {isAr ? 'تقليل اهتزاز الحركة' : 'Reduced Motion'}
              </div>
              <div className="text-[11px] text-neutral-400">
                {isAr ? 'يخفف تمايل الكاميرا والميلان والاهتزاز' : 'Minimizes head-bob, strafe tilt & blast shake'}
              </div>
            </div>
            <button
              onClick={() => {
                sound.playUiClick('toggle');
                onUpdateSettings({ ...settings, reducedMotion: !settings.reducedMotion });
              }}
              className={`px-3.5 py-2 text-xs font-mono font-bold border transition-colors cursor-pointer shrink-0 ${
                settings.reducedMotion
                  ? 'bg-white text-black border-white'
                  : 'bg-[#1a1e26] text-neutral-300 border-white/15 hover:text-white'
              }`}
            >
              {settings.reducedMotion ? (isAr ? 'مُفعّل' : 'ON') : (isAr ? 'متوقف' : 'OFF')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
