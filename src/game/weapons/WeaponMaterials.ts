import * as THREE from 'three';

/**
 * Modular finish override interface designed to support future weapon skins/camo
 * without changing base geometry or non-painted components (grips, screws, glass).
 */
export interface WeaponFinishOverride {
  primaryColor?: number;
  secondaryColor?: number;
  accentColor?: number;
  metalnessBoost?: number;
  roughnessOffset?: number;
}

export interface WeaponMaterialSet {
  gunmetalDark: THREE.MeshStandardMaterial;
  anodizedBlack: THREE.MeshStandardMaterial;
  gunmetalBrushed: THREE.MeshStandardMaterial;
  chromeSteel: THREE.MeshStandardMaterial;
  muzzleSoot: THREE.MeshStandardMaterial;
  polymerBlack: THREE.MeshStandardMaterial;
  rubberGrip: THREE.MeshStandardMaterial;
  woodWalnut: THREE.MeshStandardMaterial;
  bakeliteOrange: THREE.MeshStandardMaterial;
  oliveChassis: THREE.MeshStandardMaterial;
  brassDetail: THREE.MeshStandardMaterial;
  hollowBore: THREE.MeshStandardMaterial;
  opticGlass: THREE.MeshStandardMaterial;
  sniperLens: THREE.MeshStandardMaterial;
  crimsonDot: THREE.MeshBasicMaterial;
  greenTritium: THREE.MeshBasicMaterial;
  sleeveMat: THREE.MeshStandardMaterial;
  gloveMat: THREE.MeshStandardMaterial;
  fingerTipMat: THREE.MeshStandardMaterial;
  knuckleArmor: THREE.MeshStandardMaterial;
  cuffMat: THREE.MeshStandardMaterial;
}

interface TextureTriple {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

let cachedTextures: {
  gunmetal: TextureTriple;
  anodized: TextureTriple;
  brushedSteel: TextureTriple;
  walnut: TextureTriple;
  bakelite: TextureTriple;
  oliveChassis: TextureTriple;
  stippleRubber: TextureTriple;
  polymer: TextureTriple;
  ripstop: TextureTriple;
  leather: TextureTriple;
  sootMetal: TextureTriple;
} | null = null;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finalizeTexture(canvas: HTMLCanvasElement, isColor: boolean, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildGunmetalTriple(seed: number, baseHex: [number, number, number], streakCount: number, wearFactor: number): TextureTriple {
  const S = 256;
  const rng = mulberry32(seed);
  const [ac, actx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);

  actx.fillStyle = `rgb(${baseHex[0]},${baseHex[1]},${baseHex[2]})`;
  actx.fillRect(0, 0, S, S);
  bctx.fillStyle = 'rgb(128,128,128)';
  bctx.fillRect(0, 0, S, S);
  rctx.fillStyle = 'rgb(140,140,140)';
  rctx.fillRect(0, 0, S, S);

  // Fine directional machining lines
  for (let i = 0; i < streakCount; i++) {
    const y = rng() * S;
    const len = 30 + rng() * 190;
    const x = rng() * S;
    const v = rng();
    const d = Math.round((v - 0.5) * 24);
    actx.fillStyle = `rgba(${Math.max(0, baseHex[0] + d)},${Math.max(0, baseHex[1] + d)},${Math.max(0, baseHex[2] + d + 2)},0.22)`;
    actx.fillRect(x, y, len, 1);

    const bv = Math.round(128 + (v - 0.5) * 42);
    bctx.fillStyle = `rgba(${bv},${bv},${bv},0.34)`;
    bctx.fillRect(x, y, len, 1);

    const rv = Math.round(125 + (0.5 - v) * 48);
    rctx.fillStyle = `rgba(${rv},${rv},${rv},0.28)`;
    rctx.fillRect(x, y, len, 1);
  }

  // Subtle metallic wear scratches + oil variation
  const scratchCount = Math.round(45 * wearFactor);
  for (let i = 0; i < scratchCount; i++) {
    const x1 = rng() * S;
    const y1 = rng() * S;
    const angle = (rng() - 0.5) * 0.6;
    const len = 8 + rng() * 34;
    const x2 = x1 + Math.cos(angle) * len;
    const y2 = y1 + Math.sin(angle) * len;

    actx.strokeStyle = 'rgba(195,205,220,0.16)';
    actx.lineWidth = 0.8 + rng() * 0.7;
    actx.beginPath();
    actx.moveTo(x1, y1);
    actx.lineTo(x2, y2);
    actx.stroke();

    bctx.strokeStyle = 'rgba(80,80,80,0.35)';
    bctx.lineWidth = 1;
    bctx.beginPath();
    bctx.moveTo(x1, y1);
    bctx.lineTo(x2, y2);
    bctx.stroke();

    rctx.strokeStyle = 'rgba(65,65,65,0.4)';
    rctx.lineWidth = 1;
    rctx.beginPath();
    rctx.moveTo(x1, y1);
    rctx.lineTo(x2, y2);
    rctx.stroke();
  }

  // Micro speckle for parkerized / anodized grain
  for (let i = 0; i < 1600; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const shade = rng() > 0.5 ? 255 : 0;
    actx.fillStyle = `rgba(${shade},${shade},${shade},0.035)`;
    actx.fillRect(x, y, 2, 2);
    const bVal = Math.round(105 + rng() * 46);
    bctx.fillStyle = `rgba(${bVal},${bVal},${bVal},0.16)`;
    bctx.fillRect(x, y, 2, 2);
  }

  return {
    map: finalizeTexture(ac, true, 2, 2),
    bumpMap: finalizeTexture(bc, false, 2, 2),
    roughnessMap: finalizeTexture(rc, false, 2, 2)
  };
}

function buildWalnutTriple(seed: number): TextureTriple {
  const S = 256;
  const rng = mulberry32(seed);
  const [ac, actx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);

  actx.fillStyle = '#6c3817';
  actx.fillRect(0, 0, S, S);
  bctx.fillStyle = 'rgb(134,134,134)';
  bctx.fillRect(0, 0, S, S);
  rctx.fillStyle = 'rgb(142,142,142)';
  rctx.fillRect(0, 0, S, S);

  // Organic wood grain waves & cathedral rings
  for (let y = 0; y < S; y += 2) {
    const wave = Math.sin(y * 0.09 + rng() * 0.35) * 0.5 + Math.cos(y * 0.035) * 0.5;
    const tone = wave > 0 ? 1 : -1;
    const alpha = 0.08 + Math.abs(wave) * 0.14;
    actx.fillStyle = tone > 0 ? `rgba(42,18,6,${alpha})` : `rgba(142,78,34,${alpha * 0.85})`;
    actx.fillRect(0, y, S, 2);

    const bVal = tone > 0 ? 112 : 148;
    bctx.fillStyle = `rgba(${bVal},${bVal},${bVal},0.28)`;
    bctx.fillRect(0, y, S, 2);

    const rVal = tone > 0 ? 158 : 124;
    rctx.fillStyle = `rgba(${rVal},${rVal},${rVal},0.25)`;
    rctx.fillRect(0, y, S, 2);
  }

  // Fine longitudinal grain pores & subtle varnish wear
  for (let i = 0; i < 620; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const len = 10 + rng() * 36;
    actx.fillStyle = rng() > 0.28 ? 'rgba(34,14,4,0.28)' : 'rgba(165,98,48,0.16)';
    actx.fillRect(x, y, len, 1.1);
    bctx.fillStyle = 'rgba(72,72,72,0.42)';
    bctx.fillRect(x, y, len, 1);
  }

  // Two subtle timber knots
  for (let k = 0; k < 2; k++) {
    const kx = 48 + rng() * 160;
    const ky = 48 + rng() * 160;
    const grad = actx.createRadialGradient(kx, ky, 2, kx, ky, 18);
    grad.addColorStop(0, 'rgba(32,12,4,0.65)');
    grad.addColorStop(1, 'rgba(32,12,4,0)');
    actx.fillStyle = grad;
    actx.beginPath();
    actx.ellipse(kx, ky, 22, 10, 0.12, 0, Math.PI * 2);
    actx.fill();
  }

  return {
    map: finalizeTexture(ac, true, 1, 1),
    bumpMap: finalizeTexture(bc, false, 1, 1),
    roughnessMap: finalizeTexture(rc, false, 1, 1)
  };
}

function buildBakeliteTriple(seed: number): TextureTriple {
  const S = 256;
  const rng = mulberry32(seed);
  const [ac, actx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);

  actx.fillStyle = '#9c451b';
  actx.fillRect(0, 0, S, S);
  bctx.fillStyle = 'rgb(130,130,130)';
  bctx.fillRect(0, 0, S, S);
  rctx.fillStyle = 'rgb(112,112,112)';
  rctx.fillRect(0, 0, S, S);

  // Phenolic fiberglass swirl marbling
  for (let i = 0; i < 240; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const rx = 14 + rng() * 44;
    const ry = 3 + rng() * 9;
    const rot = (rng() - 0.5) * 0.8;
    actx.fillStyle = rng() > 0.45 ? 'rgba(64,22,8,0.22)' : 'rgba(205,108,42,0.18)';
    actx.beginPath();
    actx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    actx.fill();

    const rVal = rng() > 0.5 ? 92 : 128;
    rctx.fillStyle = `rgba(${rVal},${rVal},${rVal},0.16)`;
    rctx.beginPath();
    rctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    rctx.fill();
  }

  for (let i = 0; i < 900; i++) {
    const x = rng() * S;
    const y = rng() * S;
    bctx.fillStyle = rng() > 0.5 ? 'rgba(155,155,155,0.2)' : 'rgba(105,105,105,0.2)';
    bctx.fillRect(x, y, 2, 1.5);
  }

  return {
    map: finalizeTexture(ac, true, 1, 1),
    bumpMap: finalizeTexture(bc, false, 1, 1),
    roughnessMap: finalizeTexture(rc, false, 1, 1)
  };
}

function buildStippledRubberTriple(seed: number): TextureTriple {
  const S = 128;
  const rng = mulberry32(seed);
  const [ac, actx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);

  actx.fillStyle = '#14161a';
  actx.fillRect(0, 0, S, S);
  bctx.fillStyle = 'rgb(96,96,96)';
  bctx.fillRect(0, 0, S, S);
  rctx.fillStyle = 'rgb(225,225,225)';
  rctx.fillRect(0, 0, S, S);

  // Tactile diamond-stipple grip checkering
  const step = 6;
  for (let y = 0; y < S; y += step) {
    for (let x = 0; x < S; x += step) {
      const jitter = (rng() - 0.5) * 18;
      const al = Math.round(28 + jitter * 0.4);
      actx.fillStyle = `rgb(${al},${al + 2},${al + 4})`;
      actx.fillRect(x + 1, y + 1, 3, 3);

      const bv = Math.round(190 + jitter);
      bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bctx.fillRect(x + 1, y + 1, 3, 3);

      const rv = Math.round(210 - jitter * 0.6);
      rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
      rctx.fillRect(x + 1, y + 1, 3, 3);
    }
  }

  return {
    map: finalizeTexture(ac, true, 3, 3),
    bumpMap: finalizeTexture(bc, false, 3, 3),
    roughnessMap: finalizeTexture(rc, false, 3, 3)
  };
}

function buildPolymerTriple(seed: number, rgb: [number, number, number]): TextureTriple {
  const S = 128;
  const rng = mulberry32(seed);
  const [ac, actx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);

  actx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  actx.fillRect(0, 0, S, S);
  bctx.fillStyle = 'rgb(128,128,128)';
  bctx.fillRect(0, 0, S, S);
  rctx.fillStyle = 'rgb(176,176,176)';
  rctx.fillRect(0, 0, S, S);

  // Bead-blasted nylon-6 micro grain + light handling scuffs
  for (let i = 0; i < 2400; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const d = Math.round((rng() - 0.5) * 14);
    actx.fillStyle = `rgb(${Math.max(0, rgb[0] + d)},${Math.max(0, rgb[1] + d)},${Math.max(0, rgb[2] + d)})`;
    actx.fillRect(x, y, 2, 2);
    const bv = Math.round(112 + rng() * 34);
    bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bctx.fillRect(x, y, 1.5, 1.5);
  }
  for (let i = 0; i < 24; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const w = 8 + rng() * 20;
    actx.fillStyle = 'rgba(220,225,215,0.05)';
    actx.fillRect(x, y, w, 1.2);
    rctx.fillStyle = 'rgba(128,128,128,0.3)';
    rctx.fillRect(x, y, w, 1.5);
  }

  return {
    map: finalizeTexture(ac, true, 2, 2),
    bumpMap: finalizeTexture(bc, false, 2, 2),
    roughnessMap: finalizeTexture(rc, false, 2, 2)
  };
}

function buildRipstopTriple(seed: number): TextureTriple {
  const S = 128;
  const rng = mulberry32(seed);
  const [ac, actx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);

  actx.fillStyle = '#c8c8c8';
  actx.fillRect(0, 0, S, S);
  bctx.fillStyle = 'rgb(122,122,122)';
  bctx.fillRect(0, 0, S, S);
  rctx.fillStyle = 'rgb(214,214,214)';
  rctx.fillRect(0, 0, S, S);

  for (let i = 0; i < S; i += 8) {
    actx.fillStyle = 'rgba(255,255,255,0.1)';
    actx.fillRect(0, i, S, 1);
    actx.fillRect(i, 0, 1, S);
    bctx.fillStyle = 'rgba(170,170,170,0.45)';
    bctx.fillRect(0, i, S, 1);
    bctx.fillRect(i, 0, 1, S);
  }
  for (let i = 0; i < 1200; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const v = 180 + Math.round((rng() - 0.5) * 40);
    actx.fillStyle = `rgba(${v},${v},${v},0.16)`;
    actx.fillRect(x, y, 2, 2);
  }

  return {
    map: finalizeTexture(ac, true, 3, 3),
    bumpMap: finalizeTexture(bc, false, 3, 3),
    roughnessMap: finalizeTexture(rc, false, 3, 3)
  };
}

function getTextureBank() {
  if (cachedTextures) return cachedTextures;
  cachedTextures = {
    gunmetal: buildGunmetalTriple(101, [42, 47, 56], 520, 1.0),
    anodized: buildGunmetalTriple(202, [34, 38, 45], 340, 0.7),
    brushedSteel: buildGunmetalTriple(303, [126, 134, 148], 760, 0.55),
    sootMetal: buildGunmetalTriple(404, [38, 35, 39], 300, 1.4),
    walnut: buildWalnutTriple(505),
    bakelite: buildBakeliteTriple(606),
    oliveChassis: buildPolymerTriple(707, [64, 83, 56]),
    stippleRubber: buildStippledRubberTriple(808),
    polymer: buildPolymerTriple(909, [29, 32, 38]),
    ripstop: buildRipstopTriple(1010),
    leather: buildPolymerTriple(1111, [42, 37, 34])
  };
  return cachedTextures;
}

export function createWeaponMaterials(team: 'gang' | 'swat', finish?: WeaponFinishOverride): WeaponMaterialSet {
  const tex = getTextureBank();
  const metalBoost = finish?.metalnessBoost ?? 0;
  const roughOff = finish?.roughnessOffset ?? 0;
  const clamp01 = (v: number) => Math.max(0.02, Math.min(1, v));

  return {
    gunmetalDark: new THREE.MeshStandardMaterial({
      color: finish?.primaryColor ?? 0xd8dee9,
      map: tex.gunmetal.map,
      bumpMap: tex.gunmetal.bumpMap,
      bumpScale: 0.0024,
      roughnessMap: tex.gunmetal.roughnessMap,
      metalness: clamp01(0.86 + metalBoost),
      roughness: clamp01(0.42 + roughOff),
      envMapIntensity: 1.25
    }),
    anodizedBlack: new THREE.MeshStandardMaterial({
      color: finish?.secondaryColor ?? 0xdde3eb,
      map: tex.anodized.map,
      bumpMap: tex.anodized.bumpMap,
      bumpScale: 0.0018,
      roughnessMap: tex.anodized.roughnessMap,
      metalness: clamp01(0.72 + metalBoost),
      roughness: clamp01(0.48 + roughOff),
      envMapIntensity: 1.15
    }),
    gunmetalBrushed: new THREE.MeshStandardMaterial({
      color: finish?.accentColor ?? 0xc8d0dc,
      map: tex.brushedSteel.map,
      bumpMap: tex.brushedSteel.bumpMap,
      bumpScale: 0.0022,
      roughnessMap: tex.brushedSteel.roughnessMap,
      metalness: clamp01(0.92 + metalBoost),
      roughness: clamp01(0.28 + roughOff),
      envMapIntensity: 1.35
    }),
    chromeSteel: new THREE.MeshStandardMaterial({
      color: 0xe6ebf2,
      map: tex.brushedSteel.map,
      bumpMap: tex.brushedSteel.bumpMap,
      bumpScale: 0.0012,
      metalness: 0.96,
      roughness: 0.17,
      envMapIntensity: 1.45
    }),
    muzzleSoot: new THREE.MeshStandardMaterial({
      color: 0xbbb4b0,
      map: tex.sootMetal.map,
      bumpMap: tex.sootMetal.bumpMap,
      bumpScale: 0.003,
      roughnessMap: tex.sootMetal.roughnessMap,
      metalness: 0.78,
      roughness: 0.62,
      envMapIntensity: 1.0
    }),
    polymerBlack: new THREE.MeshStandardMaterial({
      color: 0xd0d4dc,
      map: tex.polymer.map,
      bumpMap: tex.polymer.bumpMap,
      bumpScale: 0.0022,
      roughnessMap: tex.polymer.roughnessMap,
      metalness: 0.08,
      roughness: 0.78,
      envMapIntensity: 0.85
    }),
    rubberGrip: new THREE.MeshStandardMaterial({
      color: 0xb8bec8,
      map: tex.stippleRubber.map,
      bumpMap: tex.stippleRubber.bumpMap,
      bumpScale: 0.0045,
      roughnessMap: tex.stippleRubber.roughnessMap,
      metalness: 0.04,
      roughness: 0.92,
      envMapIntensity: 0.65
    }),
    woodWalnut: new THREE.MeshStandardMaterial({
      color: 0xf4e8dc,
      map: tex.walnut.map,
      bumpMap: tex.walnut.bumpMap,
      bumpScale: 0.0032,
      roughnessMap: tex.walnut.roughnessMap,
      metalness: 0.03,
      roughness: 0.58,
      envMapIntensity: 0.9
    }),
    bakeliteOrange: new THREE.MeshStandardMaterial({
      color: 0xf5e5d8,
      map: tex.bakelite.map,
      bumpMap: tex.bakelite.bumpMap,
      bumpScale: 0.0022,
      roughnessMap: tex.bakelite.roughnessMap,
      metalness: 0.08,
      roughness: 0.45,
      envMapIntensity: 0.95
    }),
    oliveChassis: new THREE.MeshStandardMaterial({
      color: finish?.primaryColor ?? 0xe8efe4,
      map: tex.oliveChassis.map,
      bumpMap: tex.oliveChassis.bumpMap,
      bumpScale: 0.0028,
      roughnessMap: tex.oliveChassis.roughnessMap,
      metalness: 0.1,
      roughness: 0.68,
      envMapIntensity: 0.9
    }),
    brassDetail: new THREE.MeshStandardMaterial({
      color: 0xd8a846,
      metalness: 0.92,
      roughness: 0.24,
      envMapIntensity: 1.35
    }),
    hollowBore: new THREE.MeshStandardMaterial({
      color: 0x040507,
      metalness: 0.0,
      roughness: 1.0,
      side: THREE.DoubleSide
    }),
    opticGlass: new THREE.MeshStandardMaterial({
      color: 0x26547c,
      metalness: 0.92,
      roughness: 0.04,
      transparent: true,
      opacity: 0.36,
      envMapIntensity: 1.6
    }),
    sniperLens: new THREE.MeshStandardMaterial({
      color: 0x164a42,
      emissive: 0x06201c,
      emissiveIntensity: 0.4,
      metalness: 0.94,
      roughness: 0.05,
      envMapIntensity: 1.8
    }),
    crimsonDot: new THREE.MeshBasicMaterial({ color: 0xff2838 }),
    greenTritium: new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
    sleeveMat: new THREE.MeshStandardMaterial({
      color: team === 'swat' ? 0x283548 : 0x996342,
      map: tex.ripstop.map,
      bumpMap: tex.ripstop.bumpMap,
      bumpScale: team === 'swat' ? 0.003 : 0.0014,
      roughness: team === 'swat' ? 0.86 : 0.64,
      metalness: 0.02
    }),
    gloveMat: new THREE.MeshStandardMaterial({
      color: team === 'swat' ? 0x9fa8b8 : 0xb59c8d,
      map: tex.leather.map,
      bumpMap: tex.leather.bumpMap,
      bumpScale: 0.0035,
      roughness: 0.62,
      metalness: 0.06
    }),
    fingerTipMat: new THREE.MeshStandardMaterial({
      color: team === 'swat' ? 0x9fa8b8 : 0x996342,
      map: team === 'swat' ? tex.leather.map : undefined,
      bumpMap: tex.leather.bumpMap,
      bumpScale: 0.002,
      roughness: team === 'swat' ? 0.62 : 0.65,
      metalness: 0.04
    }),
    knuckleArmor: new THREE.MeshStandardMaterial({
      color: 0x22262e,
      metalness: 0.38,
      roughness: 0.42
    }),
    cuffMat: new THREE.MeshStandardMaterial({
      color: 0x161920,
      map: tex.ripstop.map,
      roughness: 0.84
    })
  };
}
