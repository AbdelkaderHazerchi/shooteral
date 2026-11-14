import React, { useEffect, useState } from 'react';
import { Play, RotateCcw, Settings as SettingsIcon, Home, ArrowLeft, ArrowRight } from 'lucide-react';
import { GameSettings } from '../game/GameEngine';
import { sound } from '../game/audio/SoundEffects';
import { GameSettingsPanel } from './GameSettingsPanel';

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
      <div className="bg-[#101318] border border-white/25 max-w-lg w-full p-6 shadow-2xl text-white max-h-[90vh] overflow-y-auto">
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
            onClick={() => {
              sound.playUiClick('back');
              if (view === 'settings') setView('main');
              else onResume();
            }}
            className="text-xs font-mono text-neutral-400 hover:text-white px-2.5 py-1 border border-white/20 cursor-pointer"
          >
            ESC
          </button>
        </div>

        {view === 'main' ? (
          <div className="flex flex-col gap-2.5">
            {/* Resume */}
            <button
              onClick={() => {
                sound.playUiClick('primary');
                onResume();
              }}
              className="w-full h-12 bg-[#e03c1f] hover:bg-[#f2492a] text-white font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-between border border-white/20 transition-colors cursor-pointer"
            >
              <span>{isAr ? 'العودة للعب' : 'RESUME MATCH'}</span>
              <Play className="w-4 h-4 fill-current" />
            </button>

            {/* Restart Match */}
            <button
              onClick={() => {
                sound.playUiClick('primary');
                onRestartMatch();
              }}
              className="w-full h-11 bg-[#171b22] hover:bg-[#232934] text-neutral-100 font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-between border border-white/20 transition-colors cursor-pointer"
            >
              <span>{isAr ? 'إعادة المباراة' : 'RESTART MATCH'}</span>
              <RotateCcw className="w-4 h-4 text-neutral-300" />
            </button>

            {/* Settings */}
            <button
              onClick={() => {
                sound.playUiClick('default');
                setView('settings');
              }}
              className="w-full h-11 bg-[#171b22] hover:bg-[#232934] text-neutral-100 font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-between border border-white/20 transition-colors cursor-pointer"
            >
              <span>{isAr ? 'الإعدادات' : 'SETTINGS'}</span>
              <SettingsIcon className="w-4 h-4 text-neutral-300" />
            </button>

            {/* Main Menu */}
            <button
              onClick={() => {
                sound.playUiClick('back');
                onExitToMenu();
              }}
              className="w-full h-11 bg-[#13171d] hover:bg-[#1e242e] text-neutral-300 hover:text-white font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-between border border-white/15 transition-colors cursor-pointer mt-1"
            >
              <span>{isAr ? 'القائمة الرئيسية' : 'MAIN MENU'}</span>
              <Home className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
        ) : (
          <div>
            <GameSettingsPanel settings={settings} onUpdateSettings={onUpdateSettings} inMatch />

            <button
              onClick={() => {
                sound.playUiClick('back');
                setView('main');
              }}
              className="w-full h-11 bg-[#e03c1f] hover:bg-[#f2492a] text-white font-bold text-sm uppercase tracking-wider px-4 flex items-center justify-center gap-2 transition-colors cursor-pointer mt-5"
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
