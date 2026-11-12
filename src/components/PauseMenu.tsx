import React, { useEffect, useState } from 'react';
import { Play, RotateCcw, Settings as SettingsIcon, Home, ArrowLeft, ArrowRight } from 'lucide-react';
import { GameSettings } from '../game/GameEngine';

interface PauseMenuProps {
  isOpen: boolean;
  settings: GameSettings;
  onUpdateSettings: (s: GameSettings) => void;
  onResume: () => void;
  onRestartMatch: () => void;
  onExitToMenu: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  isOpen,
  settings,
  onUpdateSettings,
  onResume,
  onRestartMatch,
  onExitToMenu
}) => {
  const [view, setView] = useState<'main' | 'settings'>('main');
  const isAr = settings.language === 'ar';

  useEffect(() => {
    if (!isOpen) {
      setView('main');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0d1015]/85 flex items-center justify-center p-4 select-none"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="bg-[#101318] border border-white/25 max-w-md w-full p-6 shadow-2xl text-white">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3 mb-5">
          <div>
            <div className="text-[10px] font-mono tracking-[0.24em] text-[#e03c1f] uppercase">
              SHOOTERAL: FLAME OF BATTEL
            </div>
            <h2
              className="text-xl font-bold tracking-wider uppercase mt-0.5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {view === 'settings'
                ? isAr
                  ? 'الإعدادات'
                  : 'SETTINGS'
                : isAr
                  ? 'إيقاف مؤقت'
                  : 'MATCH PAUSED'}
            </h2>
          </div>

          <button
            onClick={view === 'settings' ? () => setView('main') : onResume}
            className="text-xs font-mono text-neutral-400 hover:text-white px-2.5 py-1 border border-white/20 cursor-pointer"
          >
            ESC
          </button>
        </div>

        {view === 'main' ? (
          <div className="flex flex-col gap-2.5">
            {/* Resume */}
            <button
              onClick={onResume}
              className="w-full h-12 bg-[#e03c1f] hover:bg-[#f2492a] text-white font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-between border border-white/20 transition-colors cursor-pointer"
            >
              <span>{isAr ? 'العودة للعب' : 'RESUME MATCH'}</span>
              <Play className="w-4 h-4 fill-current" />
            </button>

            {/* Restart Match */}
            <button
              onClick={onRestartMatch}
              className="w-full h-11 bg-[#171b22] hover:bg-[#232934] text-neutral-100 font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-between border border-white/20 transition-colors cursor-pointer"
            >
              <span>{isAr ? 'إعادة المباراة' : 'RESTART MATCH'}</span>
              <RotateCcw className="w-4 h-4 text-neutral-300" />
            </button>

            {/* Settings */}
            <button
              onClick={() => setView('settings')}
              className="w-full h-11 bg-[#171b22] hover:bg-[#232934] text-neutral-100 font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-between border border-white/20 transition-colors cursor-pointer"
            >
              <span>{isAr ? 'الإعدادات' : 'SETTINGS'}</span>
              <SettingsIcon className="w-4 h-4 text-neutral-300" />
            </button>

            {/* Main Menu */}
            <button
              onClick={onExitToMenu}
              className="w-full h-11 bg-[#13171d] hover:bg-[#1e242e] text-neutral-300 hover:text-white font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-between border border-white/15 transition-colors cursor-pointer mt-1"
            >
              <span>{isAr ? 'القائمة الرئيسية' : 'MAIN MENU'}</span>
              <Home className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
        ) : (
          <div className="space-y-5 text-sm">
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

            {/* Crosshair Color */}
            <div>
              <label className="block mb-2 font-medium">
                {isAr ? 'لون علامة التصويب' : 'Crosshair Color'}
              </label>
              <div className="flex gap-2">
                {['#00ff00', '#00ffff', '#ff0055', '#ffff00', '#ffffff'].map((color) => (
                  <button
                    key={color}
                    onClick={() => onUpdateSettings({ ...settings, crosshairColor: color })}
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
                  onClick={() => onUpdateSettings({ ...settings, language: 'ar' })}
                  className={`py-2.5 text-xs font-bold border transition-colors cursor-pointer ${
                    settings.language === 'ar'
                      ? 'bg-white text-black border-white'
                      : 'bg-[#1a1e26] text-neutral-300 border-white/15 hover:text-white'
                  }`}
                >
                  العربية
                </button>
                <button
                  onClick={() => onUpdateSettings({ ...settings, language: 'en' })}
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

            <button
              onClick={() => setView('main')}
              className="w-full h-11 bg-[#e03c1f] hover:bg-[#f2492a] text-white font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-center gap-2 transition-colors cursor-pointer mt-2"
            >
              {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{isAr ? 'عودة للقائمة' : 'BACK'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
