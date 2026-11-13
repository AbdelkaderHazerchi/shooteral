import React, { useEffect, useState } from 'react';
import { Shield, Heart, DollarSign, ShoppingCart, Radio } from 'lucide-react';
import { BotController } from '../game/ai/BotController';
import {
  DamageIndicatorEvent,
  HitFeedbackEvent,
  KillFeedItem,
  MatchScore,
  RadarSnapshot,
  TACTICAL_RADIO_COMMANDS,
  TeamChatMessage
} from '../game/GameEngine';
import { GAME_FEEL_CONFIG } from '../game/config/GameFeelConfig';
import { PlayerState } from '../game/fps/PlayerController';
import { resolveWeaponIdByName, WeaponIcon } from './WeaponIcon';

const GLITCH_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/%[]_$@';

const GlitchRevealText: React.FC<{ text: string; delayMs?: number; durationMs?: number }> = ({
  text,
  delayMs = 340,
  durationMs = 520
}) => {
  const [display, setDisplay] = useState<string>(text);

  useEffect(() => {
    let rafId = 0;
    let startTime = 0;
    const timeoutId = window.setTimeout(() => {
      startTime = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / durationMs);
        if (progress >= 1) {
          setDisplay(text);
          return;
        }
        const lockedCount = Math.floor(progress * text.length);
        let out = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === ' ' || ch === '·' || i < lockedCount) {
            out += ch;
          } else {
            out += GLITCH_GLYPHS[Math.floor(Math.random() * GLITCH_GLYPHS.length)];
          }
        }
        setDisplay(out);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [text, delayMs, durationMs]);

  return <>{display}</>;
};

const RadarWallsLayer = React.memo(
  ({ colliders }: { colliders: { minX: number; maxX: number; minZ: number; maxZ: number }[] }) => (
    <>
      {colliders.map((c, idx) => (
        <rect
          key={idx}
          x={c.minX}
          y={c.minZ}
          width={c.maxX - c.minX}
          height={c.maxZ - c.minZ}
          fill="rgba(148, 163, 184, 0.34)"
          stroke="rgba(226, 232, 240, 0.5)"
          strokeWidth="0.6"
        />
      ))}
    </>
  )
);

interface GameHUDProps {
  score: MatchScore;
  playerState: PlayerState;
  playerTeam: 'gang' | 'swat';
  killFeed: KillFeedItem[];
  teamChat: TeamChatMessage[];
  isRadioMenuOpen: boolean;
  bots: BotController[];
  crosshairColor: string;
  language: 'ar' | 'en';
  hitFeedback: HitFeedbackEvent | null;
  damageIndicator: DamageIndicatorEvent | null;
  radar: RadarSnapshot | null;
  onOpenBuyMenu: () => void;
  onExitToMenu: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  score,
  playerState,
  playerTeam,
  killFeed,
  teamChat,
  isRadioMenuOpen,
  bots,
  crosshairColor,
  language,
  hitFeedback,
  damageIndicator,
  radar,
  onOpenBuyMenu,
  onExitToMenu
}) => {
  const isAr = language === 'ar';

  const [activeHit, setActiveHit] = useState<HitFeedbackEvent | null>(null);
  const [activeDmg, setActiveDmg] = useState<DamageIndicatorEvent | null>(null);

  useEffect(() => {
    if (!hitFeedback) return;
    setActiveHit(hitFeedback);
    const t = window.setTimeout(() => setActiveHit(null), hitFeedback.isKill ? 280 : 160);
    return () => window.clearTimeout(t);
  }, [hitFeedback]);

  useEffect(() => {
    if (!damageIndicator) return;
    setActiveDmg(damageIndicator);
    const t = window.setTimeout(() => setActiveDmg(null), GAME_FEEL_CONFIG.vfx.damageScreenFlashMs);
    return () => window.clearTimeout(t);
  }, [damageIndicator]);

  const gangBots = bots.filter((b) => b.team === 'gang');
  const swatBots = bots.filter((b) => b.team === 'swat');
  const gangAlive = (playerTeam === 'gang' && playerState.isAlive ? 1 : 0) + gangBots.filter((b) => b.state.isAlive).length;
  const swatAlive = (playerTeam === 'swat' && playerState.isAlive ? 1 : 0) + swatBots.filter((b) => b.state.isAlive).length;

  const activeWeapon = playerState.weapons[playerState.activeSlot];
  const ammo = activeWeapon ? playerState.ammo[activeWeapon.id] : null;

  const minutes = Math.floor(score.roundTimeLeft / 60);
  const seconds = Math.floor(score.roundTimeLeft % 60);
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const gap = playerState.crosshairSpread;

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden font-sans z-30" dir={isAr ? 'rtl' : 'ltr'}>
      {/* 0. TACTICAL SQUARE RADAR MINIMAP (Top-Left, Sharp 90deg Frame) */}
      {radar && (
        <div
          className="absolute top-3 left-3 w-40 h-40 bg-[#0b0d11]/95 border border-white/25 overflow-hidden"
          dir="ltr"
        >
          <svg viewBox="-56 -56 112 112" className="w-full h-full">
            <g transform={`rotate(${(radar.playerYaw * 180) / Math.PI}) translate(${-radar.playerX}, ${-radar.playerZ})`}>
              <line x1={radar.playerX - 50} y1={radar.playerZ} x2={radar.playerX + 50} y2={radar.playerZ} stroke="rgba(255,255,255,0.06)" strokeWidth="0.7" />
              <line x1={radar.playerX} y1={radar.playerZ - 50} x2={radar.playerX} y2={radar.playerZ + 50} stroke="rgba(255,255,255,0.06)" strokeWidth="0.7" />

              <RadarWallsLayer colliders={radar.colliders} />

              <rect x={radar.siteA.x - 6} y={radar.siteA.z - 6} width="12" height="12" fill="rgba(224, 60, 31, 0.2)" stroke="#e03c1f" strokeWidth="1" />
              <text x={radar.siteA.x} y={radar.siteA.z + 2} textAnchor="middle" fill="#fca5a5" fontSize="6" fontWeight="bold">
                A
              </text>

              <rect x={radar.siteB.x - 6} y={radar.siteB.z - 6} width="12" height="12" fill="rgba(224, 60, 31, 0.2)" stroke="#e03c1f" strokeWidth="1" />
              <text x={radar.siteB.x} y={radar.siteB.z + 2} textAnchor="middle" fill="#fca5a5" fontSize="6" fontWeight="bold">
                B
              </text>

              {radar.bombPos && (
                <rect
                  x={radar.bombPos.x - 2.4}
                  y={radar.bombPos.z - 2.4}
                  width="4.8"
                  height="4.8"
                  fill={radar.isBombPlanted ? '#ef4444' : '#facc15'}
                  stroke="#ffffff"
                  strokeWidth="0.8"
                />
              )}

              {radar.smokes?.map((s, idx) => (
                <circle
                  key={`sm_${idx}`}
                  cx={s.x}
                  cy={s.z}
                  r={s.radius}
                  fill="rgba(203, 213, 225, 0.52)"
                  stroke="rgba(248, 250, 252, 0.5)"
                  strokeWidth="0.6"
                />
              ))}

              {radar.actors.map((a, i) => (
                <g key={i}>
                  <rect
                    x={a.x - 2}
                    y={a.z - 2}
                    width="4"
                    height="4"
                    fill={a.isEnemySpotted ? '#ef4444' : a.team === 'gang' ? '#f59e0b' : '#38bdf8'}
                    stroke="#09090b"
                    strokeWidth="0.7"
                  />
                  {a.hasC4 && <rect x={a.x - 3.3} y={a.z - 3.3} width="6.6" height="6.6" fill="none" stroke="#facc15" strokeWidth="0.7" />}
                </g>
              ))}
            </g>

            <path d="M 0,0 L -22,-38 L 22,-38 Z" fill="rgba(255,255,255,0.1)" />
            <polygon points="0,-4 3.2,3 0,1.2 -3.2,3" fill="#22c55e" stroke="#052e16" strokeWidth="0.7" />
          </svg>
        </div>
      )}

      {/* 1. TOP HEADER SCORE & TIMER (Flat Sharp Tactical Modules) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-stretch gap-1" dir="ltr">
        {/* Gang Team Score */}
        <div className="flex items-center gap-3 bg-[#101318]/95 border border-white/20 px-3.5 py-2">
          <div className="flex gap-1">
            {Array.from({ length: gangBots.length + (playerTeam === 'gang' ? 1 : 0) }).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-3.5 ${
                  i < gangAlive ? 'bg-amber-400' : 'bg-neutral-800'
                }`}
              />
            ))}
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400 tabular-nums">{score.gang}</div>
        </div>

        {/* Center Round Clock / C4 Countdown */}
        <div
          className={`px-5 py-1.5 border flex items-center justify-center min-w-[132px] ${
            score.isBombPlanted
              ? 'bg-[#8a1c1c] border-white/40 text-white'
              : 'bg-[#171b22]/95 border-white/25 text-white'
          }`}
        >
          {score.isBombPlanted ? (
            <div className="flex items-center gap-2 font-mono font-bold text-lg">
              <span className="text-xs bg-white text-black px-1.5 py-0.5 font-bold">C4-{score.bombSite}</span>
              <span className="tabular-nums">{Math.ceil(score.bombTimeLeft)}s</span>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-lg font-mono font-bold tracking-wider tabular-nums leading-none">{formattedTime}</div>
              <div className="text-[10px] font-mono text-neutral-400 uppercase mt-1 leading-none">
                {isAr
                  ? `R${score.currentRound} · DIFF ${score.difficultyLevel}`
                  : `RND ${score.currentRound} · DIFF ${score.difficultyLevel}`}
              </div>
            </div>
          )}
        </div>

        {/* SWAT Team Score */}
        <div className="flex items-center gap-3 bg-[#101318]/95 border border-white/20 px-3.5 py-2">
          <div className="text-2xl font-mono font-bold text-sky-400 tabular-nums">{score.police}</div>
          <div className="flex gap-1">
            {Array.from({ length: swatBots.length + (playerTeam === 'swat' ? 1 : 0) }).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-3.5 ${
                  i < swatAlive ? 'bg-sky-400' : 'bg-neutral-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Buy Phase Bar */}
      {score.isBuyPhase && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-3 bg-[#101318]/95 border border-white/25 px-4 py-2">
          <ShoppingCart className="w-4 h-4 text-neutral-300" />
          <span className="text-xs font-mono font-bold text-neutral-200 tabular-nums">
            {isAr ? `فترة الشراء ${Math.ceil(score.buyTimeLeft)}ث [B]` : `BUY PHASE ${Math.ceil(score.buyTimeLeft)}S [B]`}
          </span>
          <button
            onClick={onOpenBuyMenu}
            className="px-3 py-1 bg-[#e03c1f] hover:bg-[#f2492a] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            {isAr ? 'المتجر' : 'ARMORY'}
          </button>
        </div>
      )}

      {/* 2. TOP RIGHT KILL FEED */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 max-w-sm pointer-events-none">
        {killFeed.map((item) => {
          const weaponId = resolveWeaponIdByName(item.weaponName);
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 bg-[#0d1015]/92 border border-white/15 px-3 py-1.5 text-xs font-bold"
            >
              <span className={item.killerTeam === 'gang' ? 'text-amber-400' : 'text-sky-400'}>{item.killerName}</span>
              {weaponId ? (
                <WeaponIcon id={weaponId} className="h-4 w-11 shrink-0 opacity-95" />
              ) : (
                <span className="text-neutral-300 font-mono text-[10px] px-1.5 py-0.5 bg-[#1b2029]">
                  {item.weaponName}
                </span>
              )}
              {item.isHeadshot && <span className="text-[#e03c1f] font-mono text-[10px] font-bold">HS</span>}
              <span className="text-neutral-500">→</span>
              <span className={item.victimTeam === 'gang' ? 'text-amber-400' : 'text-sky-400'}>{item.victimName}</span>
            </div>
          );
        })}
      </div>

      {/* 3. SCREEN BLOOD SPLATTER & DIRECTIONAL DAMAGE SLASH */}
      {(activeDmg || (playerState.isAlive && playerState.health <= 35)) && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-200"
          viewBox="0 0 1920 1080"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Low HP & Hit Edge Frame Scrim (kept peripheral so silhouettes stay readable) */}
          <rect
            x="0"
            y="0"
            width="1920"
            height="1080"
            fill="none"
            stroke="#991b1b"
            strokeWidth={activeDmg ? 36 : 24}
            strokeOpacity={activeDmg ? 0.44 : 0.3}
          />
          {/* Sharp Tactical Screen-Edge Blood Splatters */}
          <g fill="#b91c1c" fillOpacity={activeDmg ? 0.52 : 0.36}>
            <polygon points="0,0 175,0 85,78 28,132 0,178" />
            <polygon points="1920,0 1755,0 1845,86 1920,162" />
            <polygon points="0,1080 0,895 78,998 165,1080" />
            <polygon points="1920,1080 1745,1080 1835,982 1920,875" />
          </g>
        </svg>
      )}

      {activeDmg && (
        <div
          className="absolute top-1/2 left-1/2 w-60 h-60 pointer-events-none"
          style={{ transform: `translate(-50%, -50%) rotate(${(activeDmg.relativeAngle * 180) / Math.PI}deg)` }}
        >
          <svg viewBox="0 0 100 100" className="w-24 h-8 mx-auto">
            <polygon points="10,25 50,4 90,25 75,32 50,15 25,32" fill="#ef4444" fillOpacity="0.92" />
          </svg>
        </div>
      )}

      {/* 4. CENTER CROSSHAIR / AWP SCOPE / HITMARKER */}
      {playerState.isAlive && (
        <>
          {playerState.isScoped ? (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
              <defs>
                <mask id="sniperScopeMask">
                  <rect width="1920" height="1080" fill="white" />
                  <circle cx="960" cy="540" r="340" fill="black" />
                </mask>
              </defs>
              <rect width="1920" height="1080" fill="rgba(0,0,0,0.93)" mask="url(#sniperScopeMask)" />
              <circle cx="960" cy="540" r="340" fill="none" stroke="#111" strokeWidth="8" />
              <line x1="620" y1="540" x2="1300" y2="540" stroke="rgba(220,38,38,0.85)" strokeWidth="2" />
              <line x1="960" y1="200" x2="960" y2="880" stroke="rgba(220,38,38,0.85)" strokeWidth="2" />
              <circle cx="960" cy="540" r="3" fill="#ef4444" />
            </svg>
          ) : !playerState.isADS ? (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div
                style={{ backgroundColor: crosshairColor, transform: `translate(-50%, calc(-100% - ${gap}px))` }}
                className="absolute top-1/2 left-1/2 w-[2px] h-2.5"
              />
              <div
                style={{ backgroundColor: crosshairColor, transform: `translate(-50%, ${gap}px)` }}
                className="absolute top-1/2 left-1/2 w-[2px] h-2.5"
              />
              <div
                style={{ backgroundColor: crosshairColor, transform: `translate(calc(-100% - ${gap}px), -50%)` }}
                className="absolute top-1/2 left-1/2 h-[2px] w-2.5"
              />
              <div
                style={{ backgroundColor: crosshairColor, transform: `translate(${gap}px, -50%)` }}
                className="absolute top-1/2 left-1/2 h-[2px] w-2.5"
              />
              <div
                style={{ backgroundColor: crosshairColor }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-[2px]"
              />
            </div>
          ) : null}

          {activeHit && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="38" height="38" viewBox="0 0 38 38">
                <g
                  stroke={activeHit.isKill ? '#ef4444' : activeHit.isHeadshot ? '#facc15' : '#ffffff'}
                  strokeWidth={activeHit.isKill ? '3.2' : '2.4'}
                >
                  <line x1="6" y1="6" x2="14" y2="14" />
                  <line x1="32" y1="6" x2="24" y2="14" />
                  <line x1="6" y1="32" x2="14" y2="24" />
                  <line x1="32" y1="32" x2="24" y2="24" />
                </g>
              </svg>
              {activeHit.isKill && (
                <div className="text-center font-mono text-[11px] font-bold text-red-500 tracking-widest -mt-1">
                  KILL
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 3rd Person Death Cam Banner */}
      {!playerState.isAlive && !score.roundWinner && !score.isMatchOver && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 bg-[#101318]/95 border border-white/25 px-6 py-3">
          <div className="text-[#e03c1f] font-bold text-sm tracking-widest uppercase">
            {isAr ? 'سقطت في المعركة · كاميرا الموت' : 'KIA · DEATH CAM'}
          </div>
          <span className="text-[11px] text-neutral-400">
            {isAr ? 'مراقبة المنظور الثالث حتى نهاية الجولة' : 'Third-person observation until round end'}
          </span>
        </div>
      )}

      {/* Plant C4 Prompt & Progress Bar */}
      {(playerState.canPlantHere || playerState.isPlanting) && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 bg-[#101318]/95 border border-white/25 px-5 py-3 min-w-[280px]">
          <div className="w-full flex items-center justify-between gap-4">
            <span className="text-amber-400 font-bold text-xs sm:text-sm uppercase tracking-wider">
              {playerState.isPlanting
                ? isAr
                  ? `جارِ زرع القنبلة · موقع ${playerState.currentSite ?? ''}`
                  : `PLANTING C4 · SITE ${playerState.currentSite ?? ''}`
                : isAr
                  ? `اضغط مطولاً [E] لزرع القنبلة · موقع ${playerState.currentSite ?? ''}`
                  : `HOLD [E] TO PLANT C4 · SITE ${playerState.currentSite ?? ''}`}
            </span>
            {playerState.isPlanting && (
              <span className="text-xs font-mono font-bold text-white tabular-nums">
                {Math.max(0, 3.0 * (1 - playerState.plantProgress)).toFixed(1)}s · {Math.round(playerState.plantProgress * 100)}%
              </span>
            )}
          </div>
          {playerState.isPlanting && (
            <div className="relative w-full h-3 bg-[#1a1f28] border border-white/25 overflow-hidden">
              <div
                className="h-full bg-[#e03c1f]"
                style={{ width: `${Math.min(100, Math.round(playerState.plantProgress * 100))}%` }}
              />
              <div className="absolute inset-0 flex justify-evenly pointer-events-none">
                <span className="w-px h-full bg-black/40" />
                <span className="w-px h-full bg-black/40" />
                <span className="w-px h-full bg-black/40" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Defuse C4 Prompt & Progress Bar */}
      {(playerState.canDefuseHere || playerState.isDefusing) && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 bg-[#101318]/95 border border-white/25 px-5 py-3 min-w-[280px]">
          <div className="w-full flex items-center justify-between gap-4">
            <span className="text-sky-400 font-bold text-xs sm:text-sm uppercase tracking-wider">
              {playerState.isDefusing
                ? isAr
                  ? 'جارِ إبطال مفعول القنبلة...'
                  : 'DEFUSING C4...'
                : isAr
                  ? 'اضغط مطولاً [E] لإبطال مفعول القنبلة'
                  : 'HOLD [E] TO DEFUSE C4'}
            </span>
            {playerState.isDefusing && (
              <span className="text-xs font-mono font-bold text-white tabular-nums">
                {Math.max(0, (playerState.hasDefuser ? 2.5 : 5.0) * (1 - playerState.defuseProgress)).toFixed(1)}s ·{' '}
                {Math.round(playerState.defuseProgress * 100)}%
              </span>
            )}
          </div>
          {playerState.isDefusing && (
            <div className="relative w-full h-3 bg-[#1a1f28] border border-white/25 overflow-hidden">
              <div
                className="h-full bg-sky-400"
                style={{ width: `${Math.min(100, Math.round(playerState.defuseProgress * 100))}%` }}
              />
              <div className="absolute inset-0 flex justify-evenly pointer-events-none">
                <span className="w-px h-full bg-black/40" />
                <span className="w-px h-full bg-black/40" />
                <span className="w-px h-full bg-black/40" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reloading Bar */}
      {playerState.isReloading && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
          <span className="text-[11px] font-mono font-bold tracking-widest text-neutral-200 uppercase">
            {isAr ? 'إعادة التلقيم' : 'RELOADING'}
          </span>
          <div className="w-36 h-1.5 bg-[#1a1e26] border border-white/20 overflow-hidden">
            <div className="h-full bg-white" style={{ width: `${Math.round(playerState.reloadProgress * 100)}%` }} />
          </div>
        </div>
      )}

      {/* 4.5 TEAM RADIO COMMAND MENU (Bottom-Left above HP/AP) & TEAM CHAT LOG */}
      <div className="absolute bottom-28 left-5 flex flex-col items-start gap-2 max-w-[300px] pointer-events-none">
        {isRadioMenuOpen ? (
          <div className="bg-[#0d1015]/95 border border-white/30 px-3.5 py-2.5 shadow-2xl w-[265px]">
            <div className="flex items-center justify-between border-b border-white/15 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
                <Radio className="w-3.5 h-3.5 text-[#e03c1f]" />
                <span>{isAr ? 'راديو الفريق التكتيكي' : 'TEAM TACTICAL RADIO'}</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400">[P]</span>
            </div>

            <div className="flex flex-col gap-1">
              {TACTICAL_RADIO_COMMANDS.map((cmd) => (
                <div
                  key={cmd.key}
                  className="flex items-center gap-2 text-xs font-medium text-neutral-100 py-0.5"
                >
                  <span className="w-4 h-4 bg-[#1d222c] border border-white/20 text-[10px] font-mono font-bold text-amber-400 flex items-center justify-center shrink-0">
                    {cmd.key}
                  </span>
                  <span className="truncate">{isAr ? cmd.textAr : cmd.textEn}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 border-t border-white/15 pt-1.5 mt-1">
                <span className="w-4 h-4 bg-[#171b22] border border-white/15 text-[10px] font-mono font-bold text-neutral-400 flex items-center justify-center shrink-0">
                  0
                </span>
                <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {teamChat.length > 0 && (
              <div className="flex flex-col gap-1 w-full">
                {teamChat.slice(-4).map((msg) => (
                  <div
                    key={msg.id}
                    className="bg-[#0d1015]/88 border-l-2 border-white/30 px-2.5 py-1 text-[11px] leading-snug"
                    style={{ borderLeftColor: msg.senderTeam === 'gang' ? '#f59e0b' : '#38bdf8' }}
                  >
                    <span
                      className={`font-bold ${msg.senderTeam === 'gang' ? 'text-amber-400' : 'text-sky-400'}`}
                    >
                      {msg.senderName}:{' '}
                    </span>
                    <span className={msg.isOrder ? 'text-white font-semibold' : 'text-neutral-200'}>
                      {isAr ? msg.textAr : msg.textEn}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {playerState.isAlive && (
              <div className="bg-[#101318]/85 border border-white/15 px-2.5 py-1 text-[10px] font-mono text-neutral-300 flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-neutral-400" />
                <span>{isAr ? '[P] أوامر الفريق' : '[P] TEAM RADIO'}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 5. BOTTOM LEFT STATUS (HP, ARMOR & SPRINT STATE) */}
      <div className="absolute bottom-5 left-5 flex flex-col gap-1.5">
        {playerState.isSprinting && (
          <div className="self-start bg-[#101318]/90 border border-white/25 px-2.5 py-0.5 text-[10px] font-mono font-bold tracking-widest text-white uppercase">
            {isAr ? 'ركض سريع' : 'SPRINTING'}
          </div>
        )}
        <div className="flex items-stretch gap-2">
        <div className="bg-[#101318]/95 border border-white/20 px-4 py-2.5 min-w-[115px] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Heart className={`w-4 h-4 ${playerState.health > 25 ? 'text-white' : 'text-[#e03c1f]'}`} />
              <span className="text-[10px] font-mono text-neutral-400 font-bold uppercase">{isAr ? 'الصحة' : 'HP'}</span>
            </div>
            <div className="text-2xl font-mono font-bold text-white tabular-nums leading-none">{playerState.health}</div>
          </div>
          <div className="w-full h-1 bg-white/15 mt-2">
            <div
              className={`h-full ${playerState.health > 25 ? 'bg-white' : 'bg-[#e03c1f]'}`}
              style={{ width: `${Math.max(0, Math.min(100, playerState.health))}%` }}
            />
          </div>
        </div>

        <div className="bg-[#101318]/95 border border-white/20 px-4 py-2.5 min-w-[110px] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-neutral-300" />
              <span className="text-[10px] font-mono text-neutral-400 font-bold uppercase">
                {isAr ? 'الدرع' : 'AP'}{playerState.hasHelmet ? ' +H' : ''}
              </span>
            </div>
            <div className="text-2xl font-mono font-bold text-white tabular-nums leading-none">{playerState.armor}</div>
          </div>
          <div className="w-full h-1 bg-white/15 mt-2">
            <div className="h-full bg-sky-400" style={{ width: `${Math.max(0, Math.min(100, playerState.armor))}%` }} />
          </div>
        </div>
        </div>
      </div>

      {/* 6. BOTTOM RIGHT STATUS (SLOTS, CASH & AMMO) */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
        <div className="flex gap-1" dir="ltr">
          {[1, 2, 3, 4, 5].map((slot) => {
            if (slot === 4) {
              const hasHe = (playerState.grenades?.he ?? 0) > 0;
              const hasSmoke = (playerState.grenades?.smoke ?? 0) > 0;
              if (!hasHe && !hasSmoke) return null;
              const isActive = playerState.activeSlot === 4;
              return (
                <div
                  key={4}
                  className={`px-2.5 py-1 border text-[11px] font-mono font-bold flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white text-black border-white'
                      : 'bg-[#101318]/90 border-white/15 text-neutral-300'
                  }`}
                >
                  <span className="text-[10px] opacity-75">[4]</span>
                  {hasHe && <WeaponIcon id="hegrenade" className="h-4 w-4 shrink-0" inverted={isActive} />}
                  {hasSmoke && <WeaponIcon id="smokegrenade" className="h-4 w-4 shrink-0" inverted={isActive} />}
                </div>
              );
            }

            const w = playerState.weapons[slot];
            if (!w) return null;
            const isActive = playerState.activeSlot === slot;
            return (
              <div
                key={slot}
                className={`px-2.5 py-1 border text-[11px] font-mono font-bold flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-white text-black border-white'
                    : 'bg-[#101318]/90 border-white/15 text-neutral-400'
                }`}
              >
                <span className="text-[10px] opacity-75">[{slot}]</span>
                <WeaponIcon id={w.id} className="h-4 w-9 shrink-0" inverted={isActive} />
                <span className="hidden sm:inline">{w.name}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-stretch gap-2">
          <div className="bg-[#101318]/95 border border-white/20 px-4 py-2.5 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] font-mono text-neutral-400 font-bold uppercase">{isAr ? 'الرصيد' : 'CASH'}</div>
              <div className="text-xl font-mono font-bold text-emerald-400 tabular-nums leading-none">${playerState.money}</div>
            </div>
          </div>

          {activeWeapon && (
            <div className="bg-[#101318]/95 border border-white/25 px-4 py-2.5 flex items-center gap-3.5 min-w-[215px]">
              <WeaponIcon id={activeWeapon.id} className="h-9 w-20 shrink-0 opacity-95" />
              <div className="w-full">
                <div className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
                  {isAr ? activeWeapon.nameAr : activeWeapon.name}
                </div>
                {activeWeapon.category === 'grenade' ? (
                  <div className="text-[11px] font-mono text-amber-300 mt-1 uppercase">
                    {isAr ? 'يسار رمي · يمين قريب' : 'LMB THROW · RMB LOB'}
                  </div>
                ) : ammo ? (
                  <div className="flex items-baseline gap-1.5 mt-0.5 font-mono">
                    <span className="text-2xl font-bold text-white tabular-nums leading-none">{ammo.clip}</span>
                    <span className="text-neutral-500 font-bold text-sm tabular-nums">/ {ammo.reserve}</span>
                  </div>
                ) : (
                  <div className="text-xs font-mono text-neutral-400 mt-1 uppercase">{isAr ? 'مشاجرة' : 'MELEE'}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Round End Announcement Banner */}
      {score.roundWinner && (
        <div
          key={`round-win-${score.currentRound}-${score.roundWinner}`}
          className={`round-banner-shell absolute top-1/3 left-1/2 bg-[#0f1217]/95 border px-8 py-5 shadow-2xl flex flex-col items-center gap-2 overflow-hidden ${
            score.roundWinner === 'gang' ? 'border-amber-400/60' : 'border-sky-400/60'
          }`}
        >
          {/* Corner tactical accent ticks */}
          <span
            className={`absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 ${
              score.roundWinner === 'gang' ? 'border-amber-400' : 'border-sky-400'
            }`}
          />
          <span
            className={`absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 ${
              score.roundWinner === 'gang' ? 'border-amber-400' : 'border-sky-400'
            }`}
          />
          <span
            className={`absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 ${
              score.roundWinner === 'gang' ? 'border-amber-400' : 'border-sky-400'
            }`}
          />
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 ${
              score.roundWinner === 'gang' ? 'border-amber-400' : 'border-sky-400'
            }`}
          />

          <h3
            className={`round-banner-glitch text-2xl sm:text-3xl font-bold tracking-wider uppercase whitespace-nowrap ${
              score.roundWinner === 'gang' ? 'text-amber-400' : 'text-sky-400'
            }`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <GlitchRevealText
              text={
                score.roundWinner === 'gang'
                  ? isAr
                    ? 'فوز العصابة · TERRORISTS WIN'
                    : 'TERRORISTS WIN'
                  : isAr
                    ? 'فوز الشرطة · COUNTER-TERRORISTS WIN'
                    : 'COUNTER-TERRORISTS WIN'
              }
            />
          </h3>
          <p className="round-banner-sub text-sm text-neutral-300 font-medium text-center">{score.roundEndReason}</p>
          {!score.isMatchOver && (
            <div className="round-banner-sub mt-1 px-3 py-1 bg-[#171b22] border border-white/15 text-xs font-mono uppercase tracking-wider text-neutral-200">
              {score.roundWinner === playerTeam
                ? score.lastRoundDifficultyIncreased
                  ? isAr
                    ? `الجولة القادمة: ارتفعت صعوبة الأعداء إلى المستوى ${score.difficultyLevel}`
                    : `NEXT ROUND: ENEMY DIFFICULTY INCREASED TO LVL ${score.difficultyLevel}`
                  : isAr
                    ? `أقصى مستوى صعوبة (${score.difficultyLevel})`
                    : `MAX DIFFICULTY REACHED (LVL ${score.difficultyLevel})`
                : isAr
                  ? `الجولة القادمة: بقيت الصعوبة ثابتة عند المستوى ${score.difficultyLevel}`
                  : `NEXT ROUND: DIFFICULTY UNCHANGED AT LVL ${score.difficultyLevel}`}
            </div>
          )}
        </div>
      )}

      {/* MATCH OVER MODAL */}
      {score.isMatchOver && (
        <div className="fixed inset-0 z-50 bg-black/85 pointer-events-auto flex items-center justify-center p-4">
          <div className="bg-[#11141a] border border-white/30 max-w-lg w-full p-8 shadow-2xl text-center flex flex-col items-center">
            <div className="text-xs font-mono tracking-[0.25em] text-[#e03c1f] uppercase mb-2">
              SHOOTERAL: FLAME OF BATTEL
            </div>
            <h2
              className="text-3xl font-bold text-white mb-2 uppercase"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {score.matchWinner === 'gang'
                ? isAr
                  ? 'انتصار العصابة'
                  : 'GANG VICTORY'
                : isAr
                  ? 'انتصار الشرطة'
                  : 'POLICE VICTORY'}
            </h2>
            <p className="text-sm font-mono text-neutral-300 mb-6 tabular-nums">
              {isAr
                ? `النتيجة النهائية: العصابة ${score.gang} - ${score.police} الشرطة`
                : `FINAL SCORE: GANG ${score.gang} - ${score.police} POLICE`}
            </p>

            <button
              onClick={onExitToMenu}
              className="w-full py-3.5 bg-[#e03c1f] hover:bg-[#f2492a] text-white font-bold text-base uppercase tracking-wider transition-colors cursor-pointer"
            >
              {isAr ? 'العودة إلى القائمة الرئيسية' : 'RETURN TO MAIN MENU'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
