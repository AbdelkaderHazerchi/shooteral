import React, { useState } from 'react';
import { ShoppingBag, X, Shield, Crosshair, Zap, DollarSign } from 'lucide-react';
import { WEAPONS, WeaponStats, EQUIPMENT, EquipmentItem } from '../game/weapons/WeaponData';

interface BuyMenuProps {
  isOpen: boolean;
  onClose: () => void;
  playerMoney: number;
  playerTeam: 'gang' | 'swat';
  ownedGrenades?: { he: number; smoke: number };
  onBuyItem: (itemId: string) => boolean;
  buyTimeLeft: number;
  language: 'ar' | 'en';
}

export const BuyMenu: React.FC<BuyMenuProps> = ({
  isOpen,
  onClose,
  playerMoney,
  playerTeam,
  ownedGrenades,
  onBuyItem,
  buyTimeLeft,
  language
}) => {
  const [activeCategory, setActiveCategory] = useState<'pistols' | 'smgs' | 'rifles' | 'equipment'>('rifles');
  const isAr = language === 'ar';

  if (!isOpen) return null;

  const weaponsList = Object.values(WEAPONS).filter((w) => {
    if (w.id === 'knife' || w.id === 'c4' || w.category === 'grenade') return false;
    if (w.team && w.team !== 'both' && w.team !== playerTeam) return false;
    return true;
  });

  const pistols = weaponsList.filter((w) => w.category === 'pistol');
  const smgs = weaponsList.filter((w) => w.category === 'smg');
  const rifles = weaponsList.filter((w) => w.category === 'rifle' || w.category === 'sniper');
  const equipment = Object.values(EQUIPMENT).filter((eq) => eq.team === 'both' || eq.team === playerTeam);

  const handleBuy = (id: string) => {
    onBuyItem(id);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4 select-none" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-[#101318] border border-white/25 max-w-3xl w-full p-6 shadow-2xl flex flex-col text-white">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#1b2029] text-white border border-white/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2
                className="text-xl font-bold tracking-wider uppercase"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {isAr ? 'متجر الأسلحة والمعدات' : 'ARMORY & EQUIPMENT'}
              </h2>
              <p className="text-xs font-mono text-neutral-400 tabular-nums">
                {isAr ? `الوقت المتبقي للشراء: ${Math.ceil(buyTimeLeft)}ث` : `BUY WINDOW: ${Math.ceil(buyTimeLeft)}S`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-[#161a22] border border-white/20 text-emerald-400 font-mono font-bold text-lg flex items-center gap-1.5 tabular-nums">
              <DollarSign className="w-4 h-4" />
              <span>{playerMoney}</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-[#1b2029] hover:bg-[#28303d] border border-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Categories Navigation */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <button
            onClick={() => setActiveCategory('rifles')}
            className={`py-2.5 px-3 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 border ${
              activeCategory === 'rifles'
                ? 'bg-white text-black border-white'
                : 'bg-[#171b22] text-neutral-400 border-white/15 hover:text-white'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span>{isAr ? 'البنادق والقناصات' : 'RIFLES'}</span>
          </button>

          <button
            onClick={() => setActiveCategory('smgs')}
            className={`py-2.5 px-3 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 border ${
              activeCategory === 'smgs'
                ? 'bg-white text-black border-white'
                : 'bg-[#171b22] text-neutral-400 border-white/15 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>{isAr ? 'الرشاشات' : 'SMGS'}</span>
          </button>

          <button
            onClick={() => setActiveCategory('pistols')}
            className={`py-2.5 px-3 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 border ${
              activeCategory === 'pistols'
                ? 'bg-white text-black border-white'
                : 'bg-[#171b22] text-neutral-400 border-white/15 hover:text-white'
            }`}
          >
            <span>{isAr ? 'المسدسات' : 'PISTOLS'}</span>
          </button>

          <button
            onClick={() => setActiveCategory('equipment')}
            className={`py-2.5 px-3 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 border ${
              activeCategory === 'equipment'
                ? 'bg-white text-black border-white'
                : 'bg-[#171b22] text-neutral-400 border-white/15 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>{isAr ? 'الدروع والقنابل' : 'GEAR & NADES'}</span>
          </button>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
          {activeCategory === 'rifles' &&
            rifles.map((w) => (
              <WeaponCard key={w.id} weapon={w} playerMoney={playerMoney} onBuy={handleBuy} isAr={isAr} />
            ))}

          {activeCategory === 'smgs' &&
            smgs.map((w) => (
              <WeaponCard key={w.id} weapon={w} playerMoney={playerMoney} onBuy={handleBuy} isAr={isAr} />
            ))}

          {activeCategory === 'pistols' &&
            pistols.map((w) => (
              <WeaponCard key={w.id} weapon={w} playerMoney={playerMoney} onBuy={handleBuy} isAr={isAr} />
            ))}

          {activeCategory === 'equipment' &&
            equipment.map((eq) => {
              const isOwned =
                (eq.id === 'hegrenade' && (ownedGrenades?.he ?? 0) >= 1) ||
                (eq.id === 'smokegrenade' && (ownedGrenades?.smoke ?? 0) >= 1);
              return (
                <EquipmentCard
                  key={eq.id}
                  item={eq}
                  playerMoney={playerMoney}
                  isOwned={isOwned}
                  onBuy={handleBuy}
                  isAr={isAr}
                />
              );
            })}
        </div>

        {/* Footer Hint */}
        <div className="mt-5 pt-3 border-t border-white/15 flex justify-between items-center text-xs text-neutral-400">
          <span>{isAr ? 'اضغط B أو Esc لإغلاق المتجر' : 'Press B or Esc to close armory'}</span>
          <span className="font-mono uppercase tracking-wider text-neutral-300">SHOOTERAL: Flame of Battel</span>
        </div>
      </div>
    </div>
  );
};

const WeaponCard: React.FC<{
  weapon: WeaponStats;
  playerMoney: number;
  onBuy: (id: string) => void;
  isAr: boolean;
}> = ({ weapon, playerMoney, onBuy, isAr }) => {
  const canAfford = playerMoney >= weapon.price;

  return (
    <div
      onClick={() => canAfford && onBuy(weapon.id)}
      className={`p-3.5 border flex flex-col justify-between transition-colors ${
        canAfford
          ? 'bg-[#171b22] hover:bg-[#1e242e] border-white/20 hover:border-white cursor-pointer'
          : 'bg-[#11141a] border-white/10 opacity-45 cursor-not-allowed'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-bold text-sm text-white">{isAr ? weapon.nameAr : weapon.name}</h4>
          <span className="text-[11px] font-mono text-neutral-400 uppercase">{weapon.name}</span>
        </div>
        <span className={`font-mono font-bold text-sm tabular-nums ${canAfford ? 'text-emerald-400' : 'text-red-400'}`}>
          ${weapon.price}
        </span>
      </div>

      <p className="text-[11px] text-neutral-300 mb-3">{weapon.descriptionAr}</p>

      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-neutral-400 border-t border-white/10 pt-2 tabular-nums">
        <div>
          <span>{isAr ? 'الضرر: ' : 'DMG '}</span>
          <strong className="text-white">{weapon.damage}</strong>
        </div>
        <div>
          <span>{isAr ? 'المخزن: ' : 'MAG '}</span>
          <strong className="text-white">{weapon.magazineSize}</strong>
        </div>
        <div>
          <span>{isAr ? 'السرعة: ' : 'RPS '}</span>
          <strong className="text-white">{weapon.fireRate}/s</strong>
        </div>
      </div>
    </div>
  );
};

const EquipmentCard: React.FC<{
  item: EquipmentItem;
  playerMoney: number;
  isOwned?: boolean;
  onBuy: (id: string) => void;
  isAr: boolean;
}> = ({ item, playerMoney, isOwned, onBuy, isAr }) => {
  const canBuy = !isOwned && playerMoney >= item.price;

  return (
    <div
      onClick={() => canBuy && onBuy(item.id)}
      className={`p-3.5 border flex flex-col justify-between transition-colors ${
        canBuy
          ? 'bg-[#171b22] hover:bg-[#1e242e] border-white/20 hover:border-white cursor-pointer'
          : 'bg-[#11141a] border-white/10 opacity-50 cursor-not-allowed'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-bold text-sm text-white">{isAr ? item.nameAr : item.name}</h4>
          <span className="text-[11px] font-mono text-neutral-400 uppercase">{item.name}</span>
        </div>
        {isOwned ? (
          <span className="font-mono font-bold text-xs px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
            {isAr ? 'مملوكة 1/1' : 'OWNED 1/1'}
          </span>
        ) : (
          <span className={`font-mono font-bold text-sm tabular-nums ${playerMoney >= item.price ? 'text-emerald-400' : 'text-red-400'}`}>
            ${item.price}
          </span>
        )}
      </div>

      <p className="text-[11px] text-neutral-300">{item.descriptionAr}</p>
    </div>
  );
};
