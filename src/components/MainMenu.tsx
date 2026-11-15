import React, { useEffect, useState } from 'react';
import { Crosshair, HelpCircle, Play, Settings as SettingsIcon, Shield, Flame, Users, Box, User } from 'lucide-react';
import { GameSettings } from '../game/GameEngine';
import { DEFAULT_GAME_MODE, GAME_MODE_LIST, GAME_MODES, GameModeId } from '../game/config/GameModes';
import type { MapId } from '../game/maps/MapBuilder';
import { getLevelProgress, loadLocalProfile, LocalPlayerProfile } from '../game/profile/PlayerProfile';
import { MenuShowcase3D } from './MenuShowcase3D';
import { WeaponArmory3D } from './WeaponArmory3D';
import { PlayerProfileView } from './PlayerProfileView';
import { GameSettingsPanel } from './GameSettingsPanel';
import { sound } from '../game/audio/SoundEffects';
import sgStudioIconUrl from '../assets/images/sg_studio_icon.png';

interface MainMenuProps {
  onStartGame: (team: 'gang' | 'swat', mapId: MapId, teamSize: number, gameMode: GameModeId) => void;
  settings: GameSettings;
  onUpdateSettings: (settings: GameSettings) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onStartGame,
  settings,
  onUpdateSettings
}) => {
  const [selectedTeam, setSelectedTeam] = useState<'gang' | 'swat'>('gang');
  const [selectedMap, setSelectedMap] = useState<MapId>('citadel');
  const [teamSize, setTeamSize] = useState<number>(5);
  const [selectedMode, setSelectedMode] = useState<GameModeId>(DEFAULT_GAME_MODE);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'lobby' | 'armory' | 'profile'>('lobby');
  const [profile, setProfile] = useState<LocalPlayerProfile>(() => loadLocalProfile());

  useEffect(() => {
    if (activeTab === 'lobby') {
      setProfile(loadLocalProfile());
    }
  }, [activeTab]);

  const isAr = settings.language === 'ar';
  const lvl = getLevelProgress(profile.xp);
  const activeModeCfg = GAME_MODES[selectedMode];

  if (activeTab === 'armory') {
    return <WeaponArmory3D language={settings.language} onBack={() => setActiveTab('lobby')} />;
  }

  if (activeTab === 'profile') {
    return (
      <PlayerProfileView
        language={settings.language}
        onBack={() => setActiveTab('lobby')}
        onProfileChanged={setProfile}
      />
    );
  }

  return (
    <div
      className="relative w-full h-screen bg-[#0b0d11] text-white overflow-hidden select-none font-sans"
      dir="ltr"
    >
      {/* 1. RIGHT / FULL VIEWPORT BACKGROUND: Live 3D Tactical Operator Hangar */}
      <MenuShowcase3D selectedTeam={selectedTeam} selectedMap={selectedMap} />

      {/* Subtle Diagonal Structural Lines Matching Wireframe Composition */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-[2]"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Crisp diagonal seam along the slanted left rail */}
        <line x1="490" y1="0" x2="235" y2="900" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
        {/* Tactical diagonal slashes in the background stage */}
        <line x1="890" y1="55" x2="620" y2="385" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <line x1="1215" y1="135" x2="700" y2="565" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
        <line x1="1410" y1="260" x2="1125" y2="620" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <line x1="525" y1="670" x2="390" y2="805" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
        <line x1="560" y1="790" x2="500" y2="885" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
      </svg>

      {/* 2. TOP-RIGHT MATCH INFO, LOCAL ACCOUNT BADGE & LANGUAGE TOGGLE */}
      <header className="absolute top-6 right-8 z-20 flex items-center gap-3">
        <div className="hidden xl:flex items-center gap-3 text-xs font-mono tracking-wider text-neutral-300 bg-[#0d1015]/85 border border-white/15 px-3.5 py-2">
          <span>{selectedTeam === 'gang' ? (isAr ? 'العصابة' : 'GANG') : (isAr ? 'الشرطة' : 'SWAT')}</span>
          <span aria-hidden="true" className="text-neutral-600">/</span>
          <span className="tabular-nums">{teamSize}v{teamSize}</span>
          <span aria-hidden="true" className="text-neutral-600">/</span>
          <span>{isAr ? activeModeCfg.nameAr : activeModeCfg.nameEn}</span>
          <span aria-hidden="true" className="text-neutral-600">/</span>
          <span>{isAr ? activeModeCfg.targetLabelAr : activeModeCfg.targetLabelEn}</span>
        </div>

        {/* Local Account Quick Chip */}
        <button
          onClick={() => {
            sound.playUiClick('default');
            setActiveTab('profile');
          }}
          className="hidden sm:flex items-center gap-3 bg-[#101318]/90 hover:bg-[#191f28] border border-white/25 px-3.5 py-1.5 transition-colors cursor-pointer"
        >
          <div className="text-left">
            <div className="flex items-center gap-2 text-xs font-bold text-white leading-none">
              <span className="text-[#e03c1f] font-mono tabular-nums">LVL {lvl.level}</span>
              <span>{profile.callsign}</span>
            </div>
            <div className="w-28 h-1 bg-[#1e242e] mt-1.5">
              <div className="h-full bg-[#e03c1f]" style={{ width: `${lvl.progressPercent}%` }} />
            </div>
          </div>
          <User className="w-4 h-4 text-neutral-300" />
        </button>

        <div className="flex border border-white/25 bg-[#101318]">
          <button
            onClick={() => {
              sound.playUiClick('toggle');
              onUpdateSettings({ ...settings, language: 'ar' });
            }}
            className={`px-3 py-1.5 text-xs font-bold tracking-wider transition-colors cursor-pointer ${
              isAr ? 'bg-white text-black' : 'bg-[#101318] text-neutral-400 hover:text-white'
            }`}
          >
            AR
          </button>
          <button
            onClick={() => {
              sound.playUiClick('toggle');
              onUpdateSettings({ ...settings, language: 'en' });
            }}
            className={`px-3 py-1.5 text-xs font-bold tracking-wider transition-colors cursor-pointer ${
              !isAr ? 'bg-white text-black' : 'bg-[#101318] text-neutral-400 hover:text-white'
            }`}
          >
            EN
          </button>
        </div>
      </header>

      {/* 3. LEFT DIAGONAL SLANTED RAIL (Banner, Play, Settings, Studio Icon) */}
      <aside className="relative z-10 w-full md:w-[490px] h-full pointer-events-none flex flex-col justify-between">
        {/* Diagonal Speckled Matte Backdrop */}
        <div className="hidden md:block absolute inset-0 tactical-speckle-bg diagonal-rail-clip border-r border-white/20" />
        <div className="md:hidden absolute inset-0 bg-[#14171d]/90" />

        <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-8 pointer-events-auto">
          {/* TOP BLOCK: Game Banner + Play Button + Settings Button */}
          <div className="flex flex-col items-start gap-6">
            {/* GAME BANNER */}
            <div className="w-full max-w-[330px] bg-[#101318] border border-white/25 p-5 shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 bg-[#e03c1f] inline-block" />
                <span className="text-[11px] font-mono tracking-[0.2em] text-neutral-300 uppercase">
                  {isAr ? 'إصدار القتال التكتيكي' : 'TACTICAL COMBAT EDITION'}
                </span>
              </div>
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-wider text-white leading-none uppercase"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                SHOOTERAL
              </h1>
              <div className="mt-2 pt-2 border-t border-white/15 flex items-center justify-between">
                <span
                  className="text-sm sm:text-base font-bold tracking-[0.16em] text-[#e03c1f] uppercase"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Flame of Battel
                </span>
                <Crosshair className="w-4 h-4 text-neutral-400" />
              </div>
            </div>

            {/* PLAY BUTTON (Primary Focal Anchor) */}
            <button
              onClick={() => {
                sound.playUiClick('primary');
                onStartGame(selectedTeam, selectedMap, teamSize, selectedMode);
              }}
              className="w-full max-w-[290px] h-16 bg-[#e03c1f] hover:bg-[#f2492a] active:bg-[#c53016] text-white border border-white/30 px-6 flex items-center justify-between transition-colors cursor-pointer shadow-xl"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <span
                className="text-xl sm:text-2xl font-bold tracking-wider uppercase"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {isAr ? 'بدء اللعب' : 'PLAY MATCH'}
              </span>
              <Play className="w-6 h-6 fill-current" />
            </button>

            {/* ARMORY 3D & LOCAL ACCOUNT & SETTINGS BUTTONS */}
            <div className="flex flex-col gap-2 w-full max-w-[265px]">
              <button
                onClick={() => {
                  sound.playUiClick('default');
                  setActiveTab('armory');
                }}
                className="w-full h-11 bg-[#1c2028] hover:bg-[#272d38] text-white border border-white/25 px-4 flex items-center justify-between transition-colors cursor-pointer"
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <span className="text-xs sm:text-sm font-bold tracking-wider uppercase">
                  {isAr ? 'معرض الأسلحة 3D' : '3D WEAPON ARMORY'}
                </span>
                <Box className="w-4 h-4 text-[#e03c1f]" />
              </button>

              <button
                onClick={() => {
                  sound.playUiClick('default');
                  setActiveTab('profile');
                }}
                className="w-full max-w-[245px] h-11 bg-[#161a22] hover:bg-[#212732] text-white border border-white/20 px-4 flex items-center justify-between transition-colors cursor-pointer"
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <span className="text-xs sm:text-sm font-bold tracking-wider uppercase">
                  {isAr ? 'الحساب المحلي' : 'LOCAL ACCOUNT'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-neutral-300 tabular-nums">LVL {lvl.level}</span>
                  <User className="w-4 h-4 text-neutral-300" />
                </div>
              </button>

              <div className="grid grid-cols-2 gap-2 max-w-[230px]">
                <button
                  onClick={() => {
                    sound.playUiClick('default');
                    setShowSettings(true);
                  }}
                  className="h-10 bg-[#11141a] hover:bg-[#1c2028] text-white border border-white/20 px-3 flex items-center justify-between transition-colors cursor-pointer"
                  dir={isAr ? 'rtl' : 'ltr'}
                >
                  <span className="text-[11px] font-bold tracking-wider uppercase truncate">
                    {isAr ? 'الإعدادات' : 'SETTINGS'}
                  </span>
                  <SettingsIcon className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    sound.playUiClick('default');
                    setShowGuide(true);
                  }}
                  className="h-10 bg-[#11141a] hover:bg-[#1c2028] text-neutral-300 hover:text-white border border-white/15 px-3 flex items-center justify-between transition-colors cursor-pointer"
                  dir={isAr ? 'rtl' : 'ltr'}
                >
                  <span className="text-[11px] font-bold tracking-wider uppercase truncate">
                    {isAr ? 'الدليل' : 'GUIDE'}
                  </span>
                  <HelpCircle className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* BOTTOM-LEFT: SG STUDIO BADGE */}
          <div className="mt-4">
            <div className="inline-flex items-center gap-3 bg-[#0e1116]/95 border border-white/25 px-3 py-2 shadow-lg">
              <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 bg-black border border-white/20 flex items-center justify-center p-1 overflow-hidden">
                <img
                  src={sgStudioIconUrl}
                  alt="SG STUDIO"
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                />
              </div>
              <div className="leading-tight pr-1">
                <div className="text-[9px] font-mono tracking-[0.2em] text-neutral-400 uppercase">
                  {isAr ? 'إنتاج' : 'PRODUCED BY'}
                </div>
                <div
                  className="text-xs sm:text-sm font-bold tracking-[0.18em] text-white uppercase mt-0.5"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  SG STUDIO
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 4. BOTTOM-RIGHT GAME MODE, 3-MAP & SQUAD DEPLOYMENT DOCK */}
      <section className="absolute bottom-5 right-5 left-5 md:left-auto z-20 flex flex-col items-start md:items-end">
        <div className="w-full md:w-auto max-w-full">
          {/* GAME MODES SELECTOR (Placed directly above the maps list) */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5 px-0.5 gap-4" dir={isAr ? 'rtl' : 'ltr'}>
              <span
                className="text-xs font-bold tracking-[0.22em] text-neutral-200 uppercase"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {isAr ? 'أوضاع اللعب' : 'GAME MODES'}
              </span>
              <span className="text-[11px] font-mono text-neutral-400">
                {isAr ? activeModeCfg.targetLabelAr : activeModeCfg.targetLabelEn}
              </span>
            </div>

            <div className="bg-[#0e1116]/95 border border-white/25 p-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full" dir={isAr ? 'rtl' : 'ltr'}>
              {GAME_MODE_LIST.map((mode) => {
                const isActive = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => {
                      sound.playUiClick('toggle');
                      setSelectedMode(mode.id);
                    }}
                    className={`relative px-2.5 py-2 flex flex-col justify-between text-start transition-colors cursor-pointer min-w-0 ${
                      isActive
                        ? 'border-2 border-white bg-[#1e232d]'
                        : 'bg-[#161a22] border border-white/15 hover:border-white/40 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-bold text-white leading-tight truncate">
                        {isAr ? mode.nameAr : mode.nameEn}
                      </span>
                      <span
                        className={`text-[9px] font-mono font-bold px-1 py-0.5 shrink-0 ${
                          isActive ? 'bg-[#e03c1f] text-white' : 'bg-white/10 text-neutral-300'
                        }`}
                      >
                        {isAr ? mode.badgeAr : mode.badgeEn}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-neutral-400 mt-1 truncate">
                      {isAr ? mode.summaryAr : mode.summaryEn}
                    </div>
                    {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#e03c1f]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between mb-1.5 px-0.5 gap-4">
            <span
              className="text-xs font-bold tracking-[0.22em] text-neutral-200 uppercase"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {isAr ? 'الخرائط وتشكيل الفريق' : 'MAPS & SQUAD DEPLOYMENT'}
            </span>
            <span className="hidden xl:inline text-[11px] font-mono text-neutral-400">
              {isAr ? 'WASD · Shift ركض سريع · كلك يمين ADS · E القنبلة' : 'WASD · HOLD SHIFT SPRINT · RMB ADS · E C4'}
            </span>
          </div>

          <div className="bg-[#0e1116]/95 border border-white/25 p-2 flex flex-col gap-2">
            {/* 3 TACTICAL MAP CARDS (No Copyrighted Real-Game Names) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* MAP 1: SAND BASTION */}
              <button
                onClick={() => {
                  sound.playUiClick('toggle');
                  setSelectedMap('citadel');
                }}
                className={`group relative w-full sm:w-44 h-28 bg-[#161a22] text-left flex flex-col justify-between p-2.5 transition-colors cursor-pointer ${
                  selectedMap === 'citadel'
                    ? 'border-2 border-white bg-[#1e232d]'
                    : 'border border-white/15 hover:border-white/40 opacity-80 hover:opacity-100'
                }`}
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <div className="w-full h-12 bg-[#11141a] border border-white/10 relative overflow-hidden flex items-center justify-center">
                  <svg viewBox="0 0 180 64" className="w-full h-full" aria-hidden="true">
                    <rect x="8" y="8" width="42" height="18" fill="#2a241d" stroke="#78716c" strokeWidth="1" />
                    <rect x="66" y="14" width="38" height="36" fill="#24201a" stroke="#78716c" strokeWidth="1" />
                    <rect x="122" y="8" width="48" height="22" fill="#2a241d" stroke="#78716c" strokeWidth="1" />
                    <rect x="18" y="38" width="34" height="18" fill="#2a241d" stroke="#78716c" strokeWidth="1" />
                    <rect x="122" y="38" width="46" height="18" fill="#2a241d" stroke="#78716c" strokeWidth="1" />
                    <text x="29" y="20" fill="#f59e0b" fontSize="9" fontWeight="bold" textAnchor="middle">B</text>
                    <text x="146" y="23" fill="#f59e0b" fontSize="9" fontWeight="bold" textAnchor="middle">A</text>
                    <text x="85" y="35" fill="#a8a29e" fontSize="7" textAnchor="middle">MID</text>
                  </svg>
                  {selectedMap === 'citadel' && (
                    <span className="absolute top-1 right-1 bg-[#e03c1f] text-white text-[9px] font-mono font-bold px-1.5 py-0.5 uppercase">
                      {isAr ? 'نشط' : 'ACTIVE'}
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                    {isAr ? 'حصن الرمال' : 'Sand Bastion'}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-400 mt-0.5 truncate">
                    {isAr ? 'صحراوية · 3 ممرات' : 'DESERT · 3-LANE'}
                  </div>
                </div>

                {selectedMap === 'citadel' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#e03c1f]" />}
              </button>

              {/* MAP 2: APEX FOUNDRY */}
              <button
                onClick={() => {
                  sound.playUiClick('toggle');
                  setSelectedMap('foundry');
                }}
                className={`group relative w-full sm:w-44 h-28 bg-[#161a22] text-left flex flex-col justify-between p-2.5 transition-colors cursor-pointer ${
                  selectedMap === 'foundry'
                    ? 'border-2 border-white bg-[#1e232d]'
                    : 'border border-white/15 hover:border-white/40 opacity-80 hover:opacity-100'
                }`}
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <div className="w-full h-12 bg-[#11141a] border border-white/10 relative overflow-hidden flex items-center justify-center">
                  <svg viewBox="0 0 180 64" className="w-full h-full" aria-hidden="true">
                    <rect x="12" y="10" width="46" height="44" fill="#18222e" stroke="#64748b" strokeWidth="1" />
                    <circle cx="90" cy="28" r="14" fill="#1b2938" stroke="#38bdf8" strokeWidth="1" />
                    <rect x="122" y="10" width="46" height="44" fill="#18222e" stroke="#64748b" strokeWidth="1" />
                    <line x1="58" y1="32" x2="76" y2="32" stroke="#94a3b8" strokeWidth="1.2" />
                    <line x1="104" y1="32" x2="122" y2="32" stroke="#94a3b8" strokeWidth="1.2" />
                    <text x="90" y="31" fill="#38bdf8" fontSize="9" fontWeight="bold" textAnchor="middle">A</text>
                    <text x="145" y="35" fill="#38bdf8" fontSize="9" fontWeight="bold" textAnchor="middle">B</text>
                  </svg>
                  {selectedMap === 'foundry' && (
                    <span className="absolute top-1 right-1 bg-[#e03c1f] text-white text-[9px] font-mono font-bold px-1.5 py-0.5 uppercase">
                      {isAr ? 'نشط' : 'ACTIVE'}
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                    {isAr ? 'المسبك الصناعي' : 'Apex Foundry'}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-400 mt-0.5 truncate">
                    {isAr ? 'صناعية · جسر علوي' : 'INDUSTRIAL · CATWALK'}
                  </div>
                </div>

                {selectedMap === 'foundry' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#e03c1f]" />}
              </button>

              {/* MAP 3: OBSIDIAN PORT (NEW) */}
              <button
                onClick={() => {
                  sound.playUiClick('toggle');
                  setSelectedMap('harbor');
                }}
                className={`group relative w-full sm:w-44 h-28 bg-[#161a22] text-left flex flex-col justify-between p-2.5 transition-colors cursor-pointer ${
                  selectedMap === 'harbor'
                    ? 'border-2 border-white bg-[#1e232d]'
                    : 'border border-white/15 hover:border-white/40 opacity-80 hover:opacity-100'
                }`}
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <div className="w-full h-12 bg-[#0d1824] border border-white/10 relative overflow-hidden flex items-center justify-center">
                  <svg viewBox="0 0 180 64" className="w-full h-full" aria-hidden="true">
                    <rect x="10" y="10" width="44" height="44" fill="#132234" stroke="#38bdf8" strokeWidth="1" />
                    <rect x="64" y="12" width="48" height="14" fill="#1f2937" stroke="#94a3b8" strokeWidth="1" />
                    <rect x="68" y="36" width="44" height="14" fill="#1f2937" stroke="#f59e0b" strokeWidth="1" />
                    <rect x="122" y="10" width="48" height="44" fill="#172433" stroke="#f59e0b" strokeWidth="1" />
                    <text x="32" y="35" fill="#38bdf8" fontSize="9" fontWeight="bold" textAnchor="middle">B</text>
                    <text x="146" y="35" fill="#f59e0b" fontSize="9" fontWeight="bold" textAnchor="middle">A</text>
                    <text x="90" y="29" fill="#94a3b8" fontSize="6.5" textAnchor="middle">PIER</text>
                  </svg>
                  {selectedMap === 'harbor' && (
                    <span className="absolute top-1 right-1 bg-[#e03c1f] text-white text-[9px] font-mono font-bold px-1.5 py-0.5 uppercase">
                      {isAr ? 'نشط' : 'ACTIVE'}
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                    {isAr ? 'ميناء الأوبسيديان' : 'Obsidian Port'}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-400 mt-0.5 truncate">
                    {isAr ? 'ميناء ليلي · رافعات' : 'HARBOR · DOCKS · CRANE'}
                  </div>
                </div>

                {selectedMap === 'harbor' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#e03c1f]" />}
              </button>
            </div>

            {/* FACTION & SQUAD SIZE BAR */}
            <div
              className="bg-[#13171e] border border-white/20 px-3 py-2 flex flex-wrap items-center justify-between gap-3"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                  {isAr ? 'الفريق:' : 'FACTION:'}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      sound.playUiClick('toggle');
                      setSelectedTeam('gang');
                    }}
                    className={`py-1 px-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      selectedTeam === 'gang'
                        ? 'bg-[#e03c1f] text-white border border-white/30'
                        : 'bg-[#1a1f28] text-neutral-400 border border-white/10 hover:text-white'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>{isAr ? 'العصابة' : 'GANG'}</span>
                  </button>
                  <button
                    onClick={() => {
                      sound.playUiClick('toggle');
                      setSelectedTeam('swat');
                    }}
                    className={`py-1 px-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      selectedTeam === 'swat'
                        ? 'bg-[#0ea5e9] text-white border border-white/40'
                        : 'bg-[#1a1f28] text-neutral-400 border border-white/10 hover:text-white'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>{isAr ? 'الشرطة' : 'SWAT'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                  <Users className="w-3.5 h-3.5 text-neutral-400" />
                  <span>{isAr ? 'العدد:' : 'SQUAD:'}</span>
                </div>
                <div className="flex gap-1" dir="ltr">
                  {[5, 6, 7, 8].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => {
                        sound.playUiClick('toggle');
                        setTeamSize(sz);
                      }}
                      className={`py-1 px-2 text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                        teamSize === sz
                          ? 'bg-white text-black'
                          : 'bg-[#1a1f28] text-neutral-400 border border-white/10 hover:text-white'
                      }`}
                    >
                      {sz}v{sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SETTINGS MODAL (Sharp 90-degree flat tactical styling) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
          <div className="bg-[#11141a] border border-white/30 max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/15 pb-3 mb-4">
              <h3 className="text-lg font-bold tracking-wider uppercase flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-neutral-300" />
                <span>{isAr ? 'إعدادات اللعب والجودة' : 'GAME & GRAPHICS SETTINGS'}</span>
              </h3>
              <button
                onClick={() => {
                  sound.playUiClick('back');
                  setShowSettings(false);
                }}
                className="text-xs font-mono text-neutral-400 hover:text-white px-2 py-1 border border-white/15 cursor-pointer"
              >
                ESC
              </button>
            </div>

            <GameSettingsPanel settings={settings} onUpdateSettings={onUpdateSettings} />

            <button
              onClick={() => {
                sound.playUiClick('primary');
                setShowSettings(false);
              }}
              className="mt-5 w-full py-3 bg-[#e03c1f] hover:bg-[#f2492a] text-white font-bold tracking-wider uppercase transition-colors cursor-pointer"
            >
              {isAr ? 'حفظ وإغلاق' : 'SAVE & CLOSE'}
            </button>
          </div>
        </div>
      )}

      {/* TACTICAL GUIDE MODAL (Sharp 90-degree flat styling) */}
      {showGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
          <div className="bg-[#11141a] border border-white/30 max-w-lg w-full p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/15 pb-3 mb-4">
              <h3 className="text-lg font-bold tracking-wider uppercase flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-neutral-300" />
                <span>{isAr ? 'دليل القتال والمهام' : 'COMBAT BRIEFING'}</span>
              </h3>
              <button
                onClick={() => {
                  sound.playUiClick('back');
                  setShowGuide(false);
                }}
                className="text-xs font-mono text-neutral-400 hover:text-white px-2 py-1 border border-white/15 cursor-pointer"
              >
                ESC
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <div className="p-3.5 bg-[#171b22] border border-white/15">
                <h4 className="font-bold text-white text-sm mb-1">{isAr ? 'فريق العصابة (T)' : 'Gang Faction (T)'}</h4>
                <p>
                  {isAr
                    ? 'يحمل أحد أفراد العصابة قنبلة C4. ادخلوا الموقع A أو B واضغط مطولاً على E لمدة 3 ثوان لزرعها وحمايتها لمدة 40 ثانية حتى الانفجار.'
                    : 'One member carries C4. Infiltrate Site A or B, hold E for 3s to plant, and defend for 40s until detonation.'}
                </p>
              </div>

              <div className="p-3.5 bg-[#171b22] border border-white/15">
                <h4 className="font-bold text-white text-sm mb-1">{isAr ? 'فريق الشرطة (CT)' : 'Police Faction (CT)'}</h4>
                <p>
                  {isAr
                    ? 'احمِ المواقع وامنع زرع القنبلة. إذا زُرعت القنبلة، اقترب واضغط مطولاً على E لإبطال مفعولها (5 ثوان، أو 2.5 ثانية مع عدة التفكيك).'
                    : 'Defend sites against attackers. If C4 is planted, hold E near the bomb to defuse (5s, or 2.5s with Defuse Kit).'}
                </p>
              </div>

              <div className="p-3.5 bg-[#171b22] border border-white/15">
                <h4 className="font-bold text-white text-sm mb-1">{isAr ? 'التحكم والمتجر' : 'Controls & Armory'}</h4>
                <p>
                  {isAr
                    ? 'الزر الأيسر للإطلاق (أو رمي القنبلة) • الأيمن للتصويب أو الرمي القريب • F لفحص السلاح • 4 لاختيار القنابل (HE / دخان) • P لراديو الفريق والأوامر التكتيكية (1-9) • Shift للركض • C/Ctrl للانحناء • B للمتجر • R للتلقيم • Tab للنتائج.'
                    : 'LMB Fire / Throw Grenade • RMB ADS / Short Lob • F Inspect Weapon • 4 Cycle Grenades (HE / Smoke) • P Team Radio Orders (1-9) • Hold Shift Sprint • C/Ctrl Crouch • B Armory • R Reload • Tab Scoreboard.'}
                </p>
              </div>

              <div className="p-3.5 bg-[#171b22] border border-white/15">
                <h4 className="font-bold text-white text-sm mb-1">{isAr ? 'أوضاع اللعب وشروط الفوز' : 'Game Modes & Victory'}</h4>
                <p>
                  {isAr
                    ? 'مداهمة واحدة (جولة واحدة) • مباراة سريعة (الأغلبية من 3 جولات) • معركة دامية (الأغلبية من 5 جولات) • مباراة الأساطير (إجمالي 20 جولة، يفوز من يحصد الأغلبية أو يتقدم بفارق 10 جولات).'
                    : 'Single Raid (1 round) • Quick Match (Best of 3) • Bloody Battle (Best of 5) • Legends Match (20 rounds total, majority wins or +10 round lead).'}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playUiClick('back');
                setShowGuide(false);
              }}
              className="mt-5 w-full py-3 bg-[#e03c1f] hover:bg-[#f2492a] text-white font-bold tracking-wider uppercase transition-colors cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'CLOSE'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
