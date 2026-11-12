import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Edit3, RotateCcw, Award, Crosshair, Target, Shield } from 'lucide-react';
import {
  getLevelProgress,
  loadLocalProfile,
  LocalPlayerProfile,
  resetLocalProfile,
  updateLocalProfile
} from '../game/profile/PlayerProfile';
import { WEAPONS } from '../game/weapons/WeaponData';

interface PlayerProfileViewProps {
  language: 'ar' | 'en';
  onBack: () => void;
  onProfileChanged?: (p: LocalPlayerProfile) => void;
}

export const PlayerProfileView: React.FC<PlayerProfileViewProps> = ({
  language,
  onBack,
  onProfileChanged
}) => {
  const isAr = language === 'ar';
  const [profile, setProfile] = useState<LocalPlayerProfile>(() => loadLocalProfile());
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(profile.callsign);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const fresh = loadLocalProfile();
    setProfile(fresh);
    setDraftName(fresh.callsign);
  }, []);

  const lvl = getLevelProgress(profile.xp);
  const kdRatio = profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills.toFixed(2);
  const hsRate = profile.kills > 0 ? Math.round((profile.headshots / profile.kills) * 100) : 0;
  const accuracy = profile.shotsFired > 0 ? Math.round((profile.shotsHit / profile.shotsFired) * 100) : 0;
  const winRate = profile.matchesPlayed > 0 ? Math.round((profile.matchesWon / profile.matchesPlayed) * 100) : 0;
  const roundWinRate = profile.roundsPlayed > 0 ? Math.round((profile.roundsWon / profile.roundsPlayed) * 100) : 0;

  const sortedWeaponKills = Object.entries(profile.weaponKills)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0);
  const favoriteWeaponId = sortedWeaponKills[0]?.[0];
  const favoriteWeapon = favoriteWeaponId ? WEAPONS[favoriteWeaponId] : null;

  const handleSaveName = () => {
    const cleaned = draftName.trim().slice(0, 18) || 'STRIKER-01';
    const updated = updateLocalProfile((p) => {
      p.callsign = cleaned;
    });
    setProfile(updated);
    setDraftName(cleaned);
    setIsEditingName(false);
    onProfileChanged?.(updated);
  };

  const handleResetStats = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const fresh = resetLocalProfile();
    setProfile(fresh);
    setDraftName(fresh.callsign);
    setConfirmReset(false);
    onProfileChanged?.(fresh);
  };

  return (
    <div
      className="relative w-full h-screen bg-[#0b0d11] text-white flex flex-col overflow-hidden select-none"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Top Bar */}
      <header className="h-16 bg-[#101318] border-b border-white/20 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="h-10 px-4 bg-[#1a1f28] hover:bg-[#252c38] border border-white/25 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer"
          >
            {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span>{isAr ? 'العودة للردهة' : 'BACK TO LOBBY'}</span>
          </button>

          <div>
            <div className="text-[10px] font-mono tracking-[0.22em] text-[#e03c1f] uppercase">
              LOCAL COMBAT RECORD
            </div>
            <h1
              className="text-lg sm:text-xl font-bold tracking-wider uppercase leading-none"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {isAr ? 'الحساب المحلي والإحصائيات' : 'LOCAL ACCOUNT & STATS'}
            </h1>
          </div>
        </div>

        <button
          onClick={handleResetStats}
          onBlur={() => setConfirmReset(false)}
          className={`h-9 px-3.5 border text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer ${
            confirmReset
              ? 'bg-[#e03c1f] text-white border-white'
              : 'bg-[#171b22] text-neutral-300 border-white/20 hover:text-white'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>
            {confirmReset
              ? isAr
                ? 'اضغط للتأكيد'
                : 'CONFIRM RESET'
              : isAr
                ? 'تصفير السجل'
                : 'RESET STATS'}
          </span>
        </button>
      </header>

      {/* Scrollable Body */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* 1. Operator Rank & XP Banner */}
          <section className="bg-[#101318] border border-white/25 p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 flex items-center gap-4">
              {/* Geometric Rank Insignia */}
              <div className="w-20 h-20 bg-[#171b22] border border-white/25 flex flex-col items-center justify-center shrink-0">
                <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                  <polygon points="18,3 32,11 32,25 18,33 4,25 4,11" stroke="#ffffff" strokeWidth="1.6" />
                  <polygon points="18,9 26,18 18,27 10,18" fill="#e03c1f" />
                </svg>
                <span className="text-[11px] font-mono font-bold text-white tabular-nums mt-0.5">
                  LVL {lvl.level}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-mono text-[#e03c1f] font-bold uppercase tracking-widest">
                  {isAr ? lvl.rankTitleAr : lvl.rankTitleEn}
                </div>

                {isEditingName ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={18}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                      className="bg-[#1a1f28] border border-white/40 px-2.5 py-1 text-base font-bold text-white w-44 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      className="p-1.5 bg-[#e03c1f] text-white border border-white/25 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-0.5">
                    <h2
                      className="text-2xl sm:text-3xl font-bold text-white uppercase truncate"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {profile.callsign}
                    </h2>
                    <button
                      onClick={() => {
                        setDraftName(profile.callsign);
                        setIsEditingName(true);
                      }}
                      className="p-1.5 text-neutral-400 hover:text-white border border-white/15 bg-[#161a22] cursor-pointer"
                      title={isAr ? 'تعديل الاسم' : 'Edit Callsign'}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="text-xs font-mono text-neutral-400 mt-1 tabular-nums">
                  {isAr
                    ? `إجمالي الخبرة: ${lvl.totalXp.toLocaleString()} XP`
                    : `TOTAL XP: ${lvl.totalXp.toLocaleString()} XP`}
                </div>
              </div>
            </div>

            {/* XP Progress Bar */}
            <div className="lg:col-span-7 bg-[#151922] border border-white/15 p-4">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-neutral-300 font-bold uppercase">
                  {isAr ? `التقدم للمستوى ${lvl.level + 1}` : `PROGRESS TO LEVEL ${lvl.level + 1}`}
                </span>
                <span className="text-white font-bold tabular-nums">
                  {lvl.currentLevelXp} / {lvl.nextLevelXp} XP ({lvl.progressPercent}%)
                </span>
              </div>
              <div className="w-full h-3.5 bg-[#0e1116] border border-white/25 overflow-hidden">
                <div
                  className="h-full bg-[#e03c1f]"
                  style={{ width: `${lvl.progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] font-mono text-neutral-400">
                <span>
                  {isAr
                    ? `متبقي ${Math.max(0, lvl.nextLevelXp - lvl.currentLevelXp)} XP للترقية`
                    : `${Math.max(0, lvl.nextLevelXp - lvl.currentLevelXp)} XP REMAINING`}
                </span>
                <span>
                  {isAr ? 'قتل +100 · رأس +40 · زرع/إبطال +150 · فوز +300' : 'KILL +100 · HS +40 · OBJECTIVE +150 · WIN +300'}
                </span>
              </div>
            </div>
          </section>

          {/* 2. Core Combat Metrics Grid */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: isAr ? 'القتلى / الوفيات (K/D)' : 'K/D RATIO',
                value: kdRatio,
                sub: `${profile.kills} K · ${profile.deaths} D`
              },
              {
                label: isAr ? 'نسبة إصابات الرأس' : 'HEADSHOT RATE',
                value: `${hsRate}%`,
                sub: `${profile.headshots} ${isAr ? 'إصابة رأس' : 'HEADSHOTS'}`
              },
              {
                label: isAr ? 'دقة التصويب' : 'ACCURACY',
                value: `${accuracy}%`,
                sub: `${profile.shotsHit} / ${profile.shotsFired} ${isAr ? 'طلقة' : 'SHOTS'}`
              },
              {
                label: isAr ? 'نسبة الفوز بالمباريات' : 'MATCH WIN RATE',
                value: `${winRate}%`,
                sub: `${profile.matchesWon}W - ${profile.matchesLost}L (${profile.matchesPlayed})`
              },
              {
                label: isAr ? 'فوز الجولات' : 'ROUND WIN RATE',
                value: `${roundWinRate}%`,
                sub: `${profile.roundsWon} / ${profile.roundsPlayed} ${isAr ? 'جولة' : 'ROUNDS'}`
              },
              {
                label: isAr ? 'إجمالي الضرر' : 'DAMAGE DEALT',
                value: profile.totalDamageDealt.toLocaleString(),
                sub: isAr ? 'ضرر متراكم' : 'LIFETIME DMG'
              },
              {
                label: isAr ? 'مهام C4 المكتملة' : 'C4 OBJECTIVES',
                value: `${profile.plantsCompleted + profile.defusesCompleted}`,
                sub: `${profile.plantsCompleted} ${isAr ? 'زرع' : 'PLANTS'} · ${profile.defusesCompleted} ${isAr ? 'إبطال' : 'DEFUSES'}`
              },
              {
                label: isAr ? 'أفضل سلسلة قتل' : 'BEST KILL STREAK',
                value: `${profile.bestKillStreak}`,
                sub: favoriteWeapon
                  ? `${isAr ? 'المفضل:' : 'TOP:'} ${favoriteWeapon.name}`
                  : isAr
                    ? 'لم تُسجّل قتلى بعد'
                    : 'NO KILLS LOGGED'
              }
            ].map((stat) => (
              <div key={stat.label} className="bg-[#101318] border border-white/20 p-4">
                <div className="text-[11px] font-mono text-neutral-400 uppercase">{stat.label}</div>
                <div className="text-2xl sm:text-3xl font-mono font-bold text-white tabular-nums mt-1">
                  {stat.value}
                </div>
                <div className="text-[11px] font-mono text-neutral-400 mt-1 tabular-nums">{stat.sub}</div>
              </div>
            ))}
          </section>

          {/* 3. Weapon Mastery + Recent Matches Split */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Weapon Mastery */}
            <div className="lg:col-span-5 bg-[#101318] border border-white/20 p-5">
              <div className="flex items-center justify-between border-b border-white/15 pb-3 mb-4">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                  <Crosshair className="w-4 h-4 text-[#e03c1f]" />
                  <span>{isAr ? 'إحصائيات الأسلحة' : 'WEAPON MASTERY'}</span>
                </div>
                <Target className="w-4 h-4 text-neutral-500" />
              </div>

              {sortedWeaponKills.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-neutral-500">
                  {isAr
                    ? 'العب مباراة لتسجيل عدد القتلى بكل سلاح.'
                    : 'Play a match to log weapon eliminations.'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sortedWeaponKills.map(([wId, count]) => {
                    const wp = WEAPONS[wId];
                    const maxKills = sortedWeaponKills[0][1] || 1;
                    const pct = Math.round((count / maxKills) * 100);
                    return (
                      <div key={wId}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-bold text-neutral-200">
                            {wp ? (isAr ? wp.nameAr : wp.name) : wId}
                          </span>
                          <span className="font-mono font-bold text-white tabular-nums">
                            {count} {isAr ? 'قتل' : 'KILLS'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-[#1a1f28] border border-white/10">
                          <div className="h-full bg-[#e03c1f]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Match History */}
            <div className="lg:col-span-7 bg-[#101318] border border-white/20 p-5">
              <div className="flex items-center justify-between border-b border-white/15 pb-3 mb-4">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                  <Award className="w-4 h-4 text-[#e03c1f]" />
                  <span>{isAr ? 'سجل المباريات الأخيرة' : 'RECENT MATCHES'}</span>
                </div>
                <Shield className="w-4 h-4 text-neutral-500" />
              </div>

              {profile.recentMatches.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-neutral-500">
                  {isAr
                    ? 'لا توجد مباريات مكتملة مسجلة محلياً حتى الآن.'
                    : 'No completed matches recorded locally yet.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {profile.recentMatches.map((m) => (
                    <div
                      key={m.id}
                      className="bg-[#151922] border border-white/15 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-0.5 font-bold uppercase ${
                            m.result === 'win' ? 'bg-white text-black' : 'bg-[#2a1515] text-[#e03c1f]'
                          }`}
                        >
                          {m.result === 'win' ? (isAr ? 'فوز' : 'WIN') : isAr ? 'خسارة' : 'LOSS'}
                        </span>
                        <span className="font-bold text-white uppercase">
                          {m.map === 'foundry' || m.map === 'factory'
                            ? isAr
                              ? 'المسبك الصناعي'
                              : 'APEX FOUNDRY'
                            : m.map === 'harbor'
                              ? isAr
                                ? 'ميناء الأوبسيديان'
                                : 'OBSIDIAN PORT'
                              : isAr
                                ? 'حصن الرمال'
                                : 'SAND BASTION'}
                        </span>
                        <span className="text-neutral-400">
                          {m.team === 'gang' ? (isAr ? 'العصابة' : 'GANG') : isAr ? 'الشرطة' : 'SWAT'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 tabular-nums">
                        <span className="text-neutral-200 font-bold">
                          {m.gangScore} - {m.policeScore}
                        </span>
                        <span className="text-neutral-400">
                          {m.kills}K/{m.deaths}D ({m.headshots} HS)
                        </span>
                        <span className="text-[#e03c1f] font-bold">+{m.xpEarned} XP</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
