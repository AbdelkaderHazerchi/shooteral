import React from 'react';
import { BotController } from '../game/ai/BotController';
import { GAME_MODES } from '../game/config/GameModes';
import { PlayerController } from '../game/fps/PlayerController';
import { MatchScore } from '../game/GameEngine';

interface ScoreboardProps {
  isOpen: boolean;
  score: MatchScore;
  player: PlayerController;
  bots: BotController[];
  mapName: string;
  language: 'ar' | 'en';
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  isOpen,
  score,
  player,
  bots,
  mapName,
  language
}) => {
  if (!isOpen) return null;
  const isAr = language === 'ar';

  const gangBots = bots.filter((b) => b.team === 'gang');
  const swatBots = bots.filter((b) => b.team === 'swat');

  const getRoleBadge = (role: BotController['state']['role'], hasC4: boolean) => {
    if (hasC4 || role === 'carrier') {
      return isAr ? 'حامل' : 'CAR';
    }
    if (role === 'sniper') return isAr ? 'قناص' : 'SNP';
    if (role === 'defender') return isAr ? 'مدافع' : 'DEF';
    return isAr ? 'مهاجم' : 'ATK';
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 select-none pointer-events-none" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-[#101318]/96 border border-white/25 max-w-4xl w-full p-6 shadow-2xl text-white">
        {/* Match Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-4 mb-4">
          <div>
            <h2
              className="text-2xl font-bold tracking-wider text-white uppercase"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              SHOOTERAL: <span className="text-[#e03c1f]">Flame of Battel</span>
            </h2>
            <p className="text-xs font-mono text-neutral-400 mt-0.5">
              {mapName} ·{' '}
              {isAr ? GAME_MODES[score.gameMode].nameAr : GAME_MODES[score.gameMode].nameEn} ·{' '}
              {isAr
                ? `الجولة ${score.currentRound}/${score.maxRounds}`
                : `ROUND ${score.currentRound}/${score.maxRounds}`}{' '}
              ·{' '}
              {isAr
                ? GAME_MODES[score.gameMode].targetLabelAr
                : GAME_MODES[score.gameMode].targetLabelEn}
            </p>
          </div>

          <div className="flex items-center gap-6" dir="ltr">
            <div className="text-center">
              <span className="text-[11px] font-mono uppercase font-bold text-amber-400 tracking-wider">
                {isAr ? 'العصابة' : 'GANG'}
              </span>
              <div className="text-3xl font-mono font-bold text-amber-400 tabular-nums">{score.gang}</div>
            </div>

            <div className="text-2xl font-mono font-bold text-neutral-600">:</div>

            <div className="text-center">
              <span className="text-[11px] font-mono uppercase font-bold text-sky-400 tracking-wider">
                {isAr ? 'الشرطة' : 'SWAT'}
              </span>
              <div className="text-3xl font-mono font-bold text-sky-400 tabular-nums">{score.police}</div>
            </div>
          </div>
        </div>

        {/* Teams Grids */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Gang Table */}
          <div className="bg-[#151820] border border-white/15 p-4">
            <div className="flex justify-between items-center mb-3 text-amber-400 font-bold border-b border-white/15 pb-2">
              <span>{isAr ? 'العصابة (Terrorists)' : 'GANG (TERRORISTS)'}</span>
              <span className="text-[11px] font-mono text-neutral-300 tabular-nums">{score.gang} {isAr ? 'فوز' : 'W'}</span>
            </div>

            <div className="space-y-1">
              <div className="grid grid-cols-12 text-neutral-400 font-mono text-[11px] px-2 pb-1">
                <span className="col-span-6">{isAr ? 'اللاعب' : 'PLAYER'}</span>
                <span className="col-span-2 text-center">{isAr ? 'قتل' : 'K'}</span>
                <span className="col-span-2 text-center">{isAr ? 'موت' : 'D'}</span>
                <span className="col-span-2 text-center">{isAr ? 'نقاط' : 'PTS'}</span>
              </div>

              {player.team === 'gang' && (
                <div className={`grid grid-cols-12 px-2 py-1.5 items-center font-mono tabular-nums ${player.state.isAlive ? 'bg-[#222733] text-white font-bold border border-white/20' : 'bg-[#12151b] text-neutral-500'}`}>
                  <div className="col-span-6 flex items-center gap-2 font-sans">
                    <span className="w-2 h-2 bg-emerald-400" />
                    <span>{isAr ? 'أنت (You)' : 'You'}</span>
                    {player.state.hasC4 && <span className="text-[10px] font-mono bg-[#e03c1f] text-white px-1">C4</span>}
                  </div>
                  <span className="col-span-2 text-center">{player.state.kills}</span>
                  <span className="col-span-2 text-center">{player.state.deaths}</span>
                  <span className="col-span-2 text-center">{player.state.score}</span>
                </div>
              )}

              {gangBots.map((bot) => (
                <div
                  key={bot.id}
                  className={`grid grid-cols-12 px-2 py-1.5 items-center font-mono tabular-nums ${
                    bot.state.isAlive ? 'bg-[#1b2029] text-neutral-200' : 'bg-[#12151b] text-neutral-600 line-through'
                  }`}
                >
                  <div className="col-span-6 flex items-center gap-2 font-sans">
                    <span className={`w-2 h-2 ${bot.state.isAlive ? 'bg-amber-400' : 'bg-neutral-700'}`} />
                    <span>{bot.name}</span>
                    {player.team === 'gang' && (
                      <span className="text-[10px] font-mono bg-white/10 text-amber-300 px-1">
                        {getRoleBadge(bot.state.role, bot.state.hasC4)}
                      </span>
                    )}
                    {player.team === 'gang' && bot.state.hasC4 && (
                      <span className="text-[10px] font-mono bg-[#e03c1f] text-white px-1">C4</span>
                    )}
                  </div>
                  <span className="col-span-2 text-center">{bot.state.kills}</span>
                  <span className="col-span-2 text-center">{bot.state.deaths}</span>
                  <span className="col-span-2 text-center">{bot.state.score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SWAT Table */}
          <div className="bg-[#151820] border border-white/15 p-4">
            <div className="flex justify-between items-center mb-3 text-sky-400 font-bold border-b border-white/15 pb-2">
              <span>{isAr ? 'الشرطة (Special Forces)' : 'POLICE (SWAT)'}</span>
              <span className="text-[11px] font-mono text-neutral-300 tabular-nums">{score.police} {isAr ? 'فوز' : 'W'}</span>
            </div>

            <div className="space-y-1">
              <div className="grid grid-cols-12 text-neutral-400 font-mono text-[11px] px-2 pb-1">
                <span className="col-span-6">{isAr ? 'اللاعب' : 'PLAYER'}</span>
                <span className="col-span-2 text-center">{isAr ? 'قتل' : 'K'}</span>
                <span className="col-span-2 text-center">{isAr ? 'موت' : 'D'}</span>
                <span className="col-span-2 text-center">{isAr ? 'نقاط' : 'PTS'}</span>
              </div>

              {player.team === 'swat' && (
                <div className={`grid grid-cols-12 px-2 py-1.5 items-center font-mono tabular-nums ${player.state.isAlive ? 'bg-[#222733] text-white font-bold border border-white/20' : 'bg-[#12151b] text-neutral-500'}`}>
                  <div className="col-span-6 flex items-center gap-2 font-sans">
                    <span className="w-2 h-2 bg-emerald-400" />
                    <span>{isAr ? 'أنت (You)' : 'You'}</span>
                    {player.state.hasDefuser && <span className="text-[10px] font-mono bg-sky-500 text-black px-1">KIT</span>}
                  </div>
                  <span className="col-span-2 text-center">{player.state.kills}</span>
                  <span className="col-span-2 text-center">{player.state.deaths}</span>
                  <span className="col-span-2 text-center">{player.state.score}</span>
                </div>
              )}

              {swatBots.map((bot) => (
                <div
                  key={bot.id}
                  className={`grid grid-cols-12 px-2 py-1.5 items-center font-mono tabular-nums ${
                    bot.state.isAlive ? 'bg-[#1b2029] text-neutral-200' : 'bg-[#12151b] text-neutral-600 line-through'
                  }`}
                >
                  <div className="col-span-6 flex items-center gap-2 font-sans">
                    <span className={`w-2 h-2 ${bot.state.isAlive ? 'bg-sky-400' : 'bg-neutral-700'}`} />
                    <span>{bot.name}</span>
                    {player.team === 'swat' && (
                      <span className="text-[10px] font-mono bg-white/10 text-sky-300 px-1">
                        {getRoleBadge(bot.state.role, false)}
                      </span>
                    )}
                    {player.team === 'swat' && bot.state.hasDefuser && (
                      <span className="text-[10px] font-mono bg-sky-500 text-black px-1">KIT</span>
                    )}
                  </div>
                  <span className="col-span-2 text-center">{bot.state.kills}</span>
                  <span className="col-span-2 text-center">{bot.state.deaths}</span>
                  <span className="col-span-2 text-center">{bot.state.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-white/15 flex justify-between text-[11px] font-mono text-neutral-400">
          <span>{isAr ? 'حرر مفتاح Tab لإغلاق لوحة النتائج' : 'RELEASE TAB TO CLOSE SCOREBOARD'}</span>
          <span>SHOOTERAL: FLAME OF BATTEL</span>
        </div>
      </div>
    </div>
  );
};
