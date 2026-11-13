import React from 'react';
import { WEAPONS } from '../game/weapons/WeaponData';
import ak47Img from '../assets/images/weapon_ak47_icon_1794568909048.jpg';
import m4a1Img from '../assets/images/weapon_m4a1_icon_1794568909443.jpg';
import awpImg from '../assets/images/weapon_awp_icon_1794568909936.jpg';
import mp5Img from '../assets/images/weapon_mp5_icon_1794568909927.jpg';
import deagleImg from '../assets/images/weapon_deagle_icon_1794568909312.jpg';
import uspImg from '../assets/images/weapon_usp_icon_1794568910888.jpg';
import glockImg from '../assets/images/weapon_glock_icon_1794568911507.jpg';
import knifeImg from '../assets/images/weapon_knife_icon_1794568912320.jpg';
import heImg from '../assets/images/weapon_he_icon_1794568911812.jpg';
import smokeImg from '../assets/images/weapon_smoke_icon_1794568913558.jpg';
import c4Img from '../assets/images/weapon_c4_icon_1794568913621.jpg';

interface WeaponImageConfig {
  src: string;
  flipX?: boolean;
  alt: string;
}

const WEAPON_IMAGE_MAP: Record<string, WeaponImageConfig> = {
  ak47: { src: ak47Img, alt: 'AK-47' },
  m4a1: { src: m4a1Img, alt: 'M4A1-S' },
  awp: { src: awpImg, alt: 'AWP Magnum' },
  mp5: { src: mp5Img, flipX: true, alt: 'MP5-SD' },
  deagle: { src: deagleImg, flipX: true, alt: 'Desert Eagle' },
  usp: { src: uspImg, alt: 'USP-S' },
  glock: { src: glockImg, alt: 'Glock-18' },
  knife: { src: knifeImg, alt: 'Tactical Knife' },
  hegrenade: { src: heImg, alt: 'HE Grenade' },
  smokegrenade: { src: smokeImg, alt: 'Smoke Grenade' },
  c4: { src: c4Img, alt: 'C4 Explosive' }
};

export function resolveWeaponIdByName(name: string): string | null {
  const lower = name.trim().toLowerCase();
  for (const w of Object.values(WEAPONS)) {
    if (w.name.toLowerCase() === lower || w.id.toLowerCase() === lower) {
      return w.id;
    }
  }
  if (lower.includes('c4')) return 'c4';
  if (lower.includes('he')) return 'hegrenade';
  if (lower.includes('smoke')) return 'smokegrenade';
  return null;
}

interface WeaponIconProps {
  id: string;
  className?: string;
  imgClassName?: string;
  inverted?: boolean;
}

export const WeaponIcon: React.FC<WeaponIconProps> = ({
  id,
  className = 'h-8 w-16',
  imgClassName = '',
  inverted = false
}) => {
  const entry = WEAPON_IMAGE_MAP[id];

  if (entry) {
    return (
      <img
        src={entry.src}
        alt={entry.alt}
        referrerPolicy="no-referrer"
        draggable={false}
        className={`object-contain select-none pointer-events-none ${
          inverted ? 'invert mix-blend-multiply' : 'mix-blend-screen'
        } ${entry.flipX ? '-scale-x-100' : ''} ${className} ${imgClassName}`}
      />
    );
  }

  // Flat tactical SVG silhouettes for non-weapon armor & defuse kit gear
  if (id === 'kevlar') {
    return (
      <svg viewBox="0 0 64 48" className={`fill-current text-white ${className}`} aria-hidden="true">
        <path d="M20 6h6l2 5h8l2-5h6l5 9-4 5v20H19V20l-4-5 5-9zm5 12v14h14V18H25z" />
      </svg>
    );
  }

  if (id === 'helmet') {
    return (
      <svg viewBox="0 0 64 48" className={`fill-current text-white ${className}`} aria-hidden="true">
        <path d="M14 27c0-11 8-19 19-19s18 7 19 18l3 4-4 3H35l-4-5H16l-2-1zm19 4h11v9H21v-8h12z" />
      </svg>
    );
  }

  if (id === 'defuser') {
    return (
      <svg viewBox="0 0 64 48" className={`fill-current text-white ${className}`} aria-hidden="true">
        <path d="M18 10l12 13-6 5-12-13 6-5zm28 0l-12 13 6 5 12-13-6-5zM26 26h12v14H26V26zm3 4v6h6v-6h-6z" />
      </svg>
    );
  }

  return null;
};
