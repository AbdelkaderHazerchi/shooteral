import * as THREE from 'three';
import type { BombSiteZone, BoxCollider, MapData, NavNode, RampZone, SurfaceMaterial } from './MapBuilder';

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Generates a tangent-space normal map from a procedural 2D heightfield array
 * so rough stucco walls and cobblestone alleys catch sunlight realistically without glossy sheen.
 */
function buildNormalMapFromHeight(height: Float32Array, size: number, strength: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const idx = (x: number, y: number) => ((y + size) % size) * size + ((x + size) % size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = height[idx(x - 1, y)];
      const hR = height[idx(x + 1, y)];
      const hU = height[idx(x, y - 1)];
      const hD = height[idx(x, y + 1)];

      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const p = (y * size + x) * 4;
      data[p] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      data[p + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

interface CasbahTextureSet {
  wallAlbedo: THREE.CanvasTexture;
  wallNormal: THREE.DataTexture;
  wallRoughness: THREE.CanvasTexture;
  cobbleAlbedo: THREE.CanvasTexture;
  cobbleNormal: THREE.DataTexture;
  cobbleRoughness: THREE.CanvasTexture;
  woodCarvedAlbedo: THREE.CanvasTexture;
  woodShutterAlbedo: THREE.CanvasTexture;
  flagMuralAlbedo: THREE.CanvasTexture;
  awnings: THREE.CanvasTexture[];
  stoneTrimAlbedo: THREE.CanvasTexture;
}

let cachedTextures: CasbahTextureSet | null = null;

function createCasbahTextures(): CasbahTextureSet {
  if (cachedTextures) return cachedTextures;

  // 1. Aged Rough Casbah Lime-Plaster Wall (Non-smooth, mottled, weathered ochre plinth)
  const wallSize = 512;
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = wallSize;
  wallCanvas.height = wallSize;
  const wCtx = wallCanvas.getContext('2d')!;
  const wRand = seededRand(19620705);

  wCtx.fillStyle = '#e7decb';
  wCtx.fillRect(0, 0, wallSize, wallSize);

  // Subtle trowel blotches and lime-wash variations
  for (let i = 0; i < 420; i++) {
    const x = wRand() * wallSize;
    const y = wRand() * wallSize;
    const r = 10 + wRand() * 34;
    const tone = wRand() < 0.55 ? 'rgba(202, 186, 158, 0.14)' : 'rgba(248, 243, 232, 0.14)';
    wCtx.fillStyle = tone;
    wCtx.beginPath();
    wCtx.arc(x, y, r, 0, Math.PI * 2);
    wCtx.fill();
  }

  // Aged damp ochre/sandstone base wash along lower portion
  const baseGrad = wCtx.createLinearGradient(0, 340, 0, 512);
  baseGrad.addColorStop(0, 'rgba(155, 126, 90, 0)');
  baseGrad.addColorStop(0.55, 'rgba(155, 126, 90, 0.28)');
  baseGrad.addColorStop(1, 'rgba(118, 92, 64, 0.55)');
  wCtx.fillStyle = baseGrad;
  wCtx.fillRect(0, 340, wallSize, 172);

  // Faint weathered masonry patches where plaster peeled slightly
  for (let p = 0; p < 7; p++) {
    const px = 40 + wRand() * 410;
    const py = 70 + wRand() * 320;
    const pw = 36 + wRand() * 54;
    const ph = 24 + wRand() * 36;
    wCtx.fillStyle = 'rgba(166, 140, 108, 0.34)';
    wCtx.fillRect(px, py, pw, ph);
    wCtx.strokeStyle = 'rgba(105, 84, 58, 0.25)';
    wCtx.lineWidth = 1.5;
    for (let row = 0; row < ph; row += 10) {
      wCtx.beginPath();
      wCtx.moveTo(px, py + row);
      wCtx.lineTo(px + pw, py + row);
      wCtx.stroke();
    }
  }

  // Fine stucco sand speckles & hairline weathering cracks
  for (let i = 0; i < 6500; i++) {
    wCtx.fillStyle = wRand() < 0.5 ? 'rgba(92, 74, 52, 0.08)' : 'rgba(255, 250, 240, 0.09)';
    wCtx.fillRect(wRand() * wallSize, wRand() * wallSize, 2 + wRand() * 2, 2);
  }
  wCtx.strokeStyle = 'rgba(95, 76, 54, 0.24)';
  wCtx.lineWidth = 1.2;
  for (let c = 0; c < 14; c++) {
    let cx = wRand() * wallSize;
    let cy = wRand() * wallSize;
    wCtx.beginPath();
    wCtx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (wRand() - 0.5) * 26;
      cy += 8 + wRand() * 18;
      wCtx.lineTo(cx, cy);
    }
    wCtx.stroke();
  }

  const wallAlbedo = new THREE.CanvasTexture(wallCanvas);
  wallAlbedo.wrapS = THREE.RepeatWrapping;
  wallAlbedo.wrapT = THREE.RepeatWrapping;
  wallAlbedo.colorSpace = THREE.SRGBColorSpace;

  // Heightfield -> Tangent Normal Map + Roughness Map (232..255 = matte non-reflective plaster)
  const nSize = 256;
  const wallHeight = new Float32Array(nSize * nSize);
  const nRand = seededRand(88317);
  for (let y = 0; y < nSize; y++) {
    for (let x = 0; x < nSize; x++) {
      const wave =
        Math.sin((x / nSize) * Math.PI * 10 + (y / nSize) * Math.PI * 4) * 0.28 +
        Math.cos((y / nSize) * Math.PI * 12 - (x / nSize) * Math.PI * 6) * 0.24;
      const grit = (nRand() - 0.5) * 0.68;
      wallHeight[y * nSize + x] = wave + grit;
    }
  }
  const wallNormal = buildNormalMapFromHeight(wallHeight, nSize, 2.2);

  const wallRoughCanvas = document.createElement('canvas');
  wallRoughCanvas.width = 256;
  wallRoughCanvas.height = 256;
  const wrCtx = wallRoughCanvas.getContext('2d')!;
  wrCtx.fillStyle = '#f2f2f2'; // 242/255 = 0.95 roughness
  wrCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const v = Math.floor(230 + nRand() * 25); // strictly matte 0.90..1.00
    wrCtx.fillStyle = `rgb(${v},${v},${v})`;
    wrCtx.fillRect(nRand() * 256, nRand() * 256, 4, 4);
  }
  const wallRoughness = new THREE.CanvasTexture(wallRoughCanvas);
  wallRoughness.wrapS = THREE.RepeatWrapping;
  wallRoughness.wrapT = THREE.RepeatWrapping;
  wallRoughness.colorSpace = THREE.NoColorSpace;

  // 2. Casbah Cobblestone Alley Ground (Rough matte stone pavers)
  const cobbleCanvas = document.createElement('canvas');
  cobbleCanvas.width = 512;
  cobbleCanvas.height = 512;
  const cCtx = cobbleCanvas.getContext('2d')!;
  const cRand = seededRand(44129);
  cCtx.fillStyle = '#8b7b65';
  cCtx.fillRect(0, 0, 512, 512);

  const cobbleHeight = new Float32Array(256 * 256);
  const rows = 8;
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 6;
    const colW = 512 / cols;
    const offset = r % 2 === 0 ? 0 : colW * 0.5;
    for (let c = -1; c <= cols; c++) {
      const px = c * colW + offset + 3;
      const py = r * rowH + 3;
      const pw = colW - 6;
      const ph = rowH - 6;
      const shade = Math.floor((cRand() - 0.5) * 28);
      const R = Math.min(230, Math.max(115, 178 + shade));
      const G = Math.min(215, Math.max(105, 162 + shade));
      const B = Math.min(195, Math.max(90, 138 + shade));
      cCtx.fillStyle = `rgb(${R},${G},${B})`;
      cCtx.fillRect(px, py, pw, ph);
      cCtx.strokeStyle = 'rgba(65, 54, 40, 0.35)';
      cCtx.lineWidth = 2;
      cCtx.strokeRect(px, py, pw, ph);
    }
  }
  for (let i = 0; i < 5500; i++) {
    cCtx.fillStyle = cRand() < 0.5 ? 'rgba(60, 48, 34, 0.1)' : 'rgba(240, 226, 200, 0.08)';
    cCtx.fillRect(cRand() * 512, cRand() * 512, 3, 3);
  }
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const inHorizJoint = y % 32 < 3;
      const row = Math.floor(y / 32);
      const xShift = row % 2 === 0 ? x : (x + 21) % 256;
      const inVertJoint = xShift % 42 < 3;
      const baseH = inHorizJoint || inVertJoint ? -0.8 : 0.35;
      cobbleHeight[y * 256 + x] = baseH + (cRand() - 0.5) * 0.45;
    }
  }
  const cobbleAlbedo = new THREE.CanvasTexture(cobbleCanvas);
  cobbleAlbedo.wrapS = THREE.RepeatWrapping;
  cobbleAlbedo.wrapT = THREE.RepeatWrapping;
  cobbleAlbedo.colorSpace = THREE.SRGBColorSpace;

  const cobbleNormal = buildNormalMapFromHeight(cobbleHeight, 256, 2.4);

  const cobbleRoughCanvas = document.createElement('canvas');
  cobbleRoughCanvas.width = 256;
  cobbleRoughCanvas.height = 256;
  const crCtx = cobbleRoughCanvas.getContext('2d')!;
  crCtx.fillStyle = '#ececec';
  crCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const v = Math.floor(220 + cRand() * 35);
    crCtx.fillStyle = `rgb(${v},${v},${v})`;
    crCtx.fillRect(cRand() * 256, cRand() * 256, 4, 4);
  }
  const cobbleRoughness = new THREE.CanvasTexture(cobbleRoughCanvas);
  cobbleRoughness.wrapS = THREE.RepeatWrapping;
  cobbleRoughness.wrapT = THREE.RepeatWrapping;
  cobbleRoughness.colorSpace = THREE.NoColorSpace;

  // 3. Carved Cedarwood Traditional Door Texture with Brass Stud Rosettes
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 512;
  woodCanvas.height = 512;
  const wdCtx = woodCanvas.getContext('2d')!;
  const wdRand = seededRand(7741);
  wdCtx.fillStyle = '#583721';
  wdCtx.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 64) {
    wdCtx.fillStyle = x % 128 === 0 ? '#4e2f1c' : '#5f3c25';
    wdCtx.fillRect(x + 2, 0, 60, 512);
    wdCtx.fillStyle = '#2d190d';
    wdCtx.fillRect(x, 0, 3, 512);
  }
  for (let i = 0; i < 900; i++) {
    wdCtx.fillStyle = wdRand() < 0.5 ? 'rgba(30,15,6,0.2)' : 'rgba(130,88,52,0.12)';
    wdCtx.fillRect(wdRand() * 512, wdRand() * 512, 2, 18 + wdRand() * 34);
  }
  // Traditional horizontal iron/wood rails & brass studs
  for (const ry of [80, 256, 430]) {
    wdCtx.fillStyle = '#382112';
    wdCtx.fillRect(0, ry - 14, 512, 28);
    for (let sx = 32; sx < 512; sx += 64) {
      wdCtx.fillStyle = '#b98d3c';
      wdCtx.beginPath();
      wdCtx.arc(sx, ry, 7, 0, Math.PI * 2);
      wdCtx.fill();
      wdCtx.strokeStyle = '#684c19';
      wdCtx.lineWidth = 1.5;
      wdCtx.stroke();
    }
  }
  const woodCarvedAlbedo = new THREE.CanvasTexture(woodCanvas);
  woodCarvedAlbedo.colorSpace = THREE.SRGBColorSpace;

  // 4. Painted Vintage Algerian Casbah Window Louver Shutters (Aged Turquoise-Teal Wood)
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 256;
  shCanvas.height = 256;
  const shCtx = shCanvas.getContext('2d')!;
  shCtx.fillStyle = '#2b615d';
  shCtx.fillRect(0, 0, 256, 256);
  shCtx.strokeStyle = '#1b3f3c';
  shCtx.lineWidth = 14;
  shCtx.strokeRect(7, 7, 242, 242);
  for (let y = 26; y < 230; y += 16) {
    shCtx.fillStyle = '#1e4744';
    shCtx.fillRect(22, y, 212, 6);
    shCtx.fillStyle = '#3b7a75';
    shCtx.fillRect(22, y + 6, 212, 4);
  }
  const woodShutterAlbedo = new THREE.CanvasTexture(shCanvas);
  woodShutterAlbedo.colorSpace = THREE.SRGBColorSpace;

  // 5. Hand-Painted Vintage Algerian Flag Mural on Aged Plaster
  const flagCanvas = document.createElement('canvas');
  flagCanvas.width = 1024;
  flagCanvas.height = 512;
  const fCtx = flagCanvas.getContext('2d')!;
  const fRand = seededRand(19541101);

  // Underlying rough plaster shows around borders & chipped spots
  fCtx.fillStyle = '#dfd4be';
  fCtx.fillRect(0, 0, 1024, 512);

  // Hand-painted green left half (slightly organic irregular border)
  const marginX = 36;
  const marginY = 30;
  const flagW = 1024 - marginX * 2;
  const flagH = 512 - marginY * 2;
  const midX = 512;

  fCtx.save();
  fCtx.beginPath();
  fCtx.moveTo(marginX, marginY);
  fCtx.lineTo(midX, marginY);
  for (let y = marginY; y <= marginY + flagH; y += 14) {
    fCtx.lineTo(midX + (fRand() - 0.5) * 9, y);
  }
  fCtx.lineTo(marginX, marginY + flagH);
  fCtx.closePath();
  fCtx.fillStyle = '#1e5b37';
  fCtx.fill();

  // Hand-painted off-white right half
  fCtx.beginPath();
  fCtx.moveTo(midX, marginY);
  fCtx.lineTo(marginX + flagW, marginY);
  fCtx.lineTo(marginX + flagW, marginY + flagH);
  for (let y = marginY + flagH; y >= marginY; y -= 14) {
    fCtx.lineTo(midX + (fRand() - 0.5) * 9, y);
  }
  fCtx.closePath();
  fCtx.fillStyle = '#e8dfd0';
  fCtx.fill();
  fCtx.restore();

  // Subtle brush stroke striations across green & white halves
  for (let i = 0; i < 240; i++) {
    const bx = marginX + fRand() * flagW;
    const by = marginY + fRand() * flagH;
    const bw = 24 + fRand() * 68;
    const bh = 3 + fRand() * 7;
    if (bx < midX) {
      fCtx.fillStyle = fRand() < 0.5 ? 'rgba(18, 65, 38, 0.22)' : 'rgba(56, 122, 82, 0.16)';
    } else {
      fCtx.fillStyle = fRand() < 0.5 ? 'rgba(205, 194, 172, 0.24)' : 'rgba(255, 252, 245, 0.18)';
    }
    fCtx.fillRect(bx, by, Math.min(bw, marginX + flagW - bx), bh);
  }

  // Centered Red Crescent & 5-Pointed Star (Hand-painted vintage crimson)
  const cx = 512;
  const cy = 256;
  const outerR = 114;
  const innerR = 90;
  const offsetInner = 28;

  // Draw crescent via offscreen mask so background shows cleanly inside
  const cresCanvas = document.createElement('canvas');
  cresCanvas.width = 320;
  cresCanvas.height = 320;
  const crM = cresCanvas.getContext('2d')!;
  crM.fillStyle = '#b42925';
  crM.beginPath();
  crM.arc(160, 160, outerR, 0, Math.PI * 2);
  crM.fill();
  crM.globalCompositeOperation = 'destination-out';
  crM.beginPath();
  crM.arc(160 + offsetInner, 160, innerR, 0, Math.PI * 2);
  crM.fill();
  crM.globalCompositeOperation = 'source-over';

  // Five-pointed star inside crescent opening
  const starCx = 160 + 38;
  const starCy = 160;
  const starOuter = 48;
  const starInner = 19;
  crM.fillStyle = '#b42925';
  crM.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? starOuter : starInner;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5 - 0.16;
    const sx = starCx + Math.cos(ang) * r;
    const sy = starCy + Math.sin(ang) * r;
    if (i === 0) crM.moveTo(sx, sy);
    else crM.lineTo(sx, sy);
  }
  crM.closePath();
  crM.fill();

  fCtx.drawImage(cresCanvas, cx - 160, cy - 160);

  // Vintage mural aging: sun-faded wash, chipped plaster flakes, vertical rain streaks & cracks
  for (let i = 0; i < 65; i++) {
    const sx = fRand() * 1024;
    const sy = fRand() * 512;
    const rw = 6 + fRand() * 22;
    const rh = 4 + fRand() * 14;
    fCtx.fillStyle = fRand() < 0.7 ? 'rgba(222, 211, 189, 0.65)' : 'rgba(148, 128, 102, 0.48)';
    fCtx.beginPath();
    fCtx.ellipse(sx, sy, rw * 0.5, rh * 0.5, fRand() * Math.PI, 0, Math.PI * 2);
    fCtx.fill();
  }
  // Vertical weathered rain streaks & grime
  for (let i = 0; i < 48; i++) {
    const rx = marginX + fRand() * flagW;
    const ry = marginY + fRand() * 180;
    const rh = 80 + fRand() * 240;
    const g = fCtx.createLinearGradient(rx, ry, rx, ry + rh);
    g.addColorStop(0, 'rgba(90, 74, 52, 0.16)');
    g.addColorStop(1, 'rgba(90, 74, 52, 0)');
    fCtx.fillStyle = g;
    fCtx.fillRect(rx, ry, 2 + fRand() * 5, rh);
  }
  // Hairline plaster cracks over the mural
  fCtx.strokeStyle = 'rgba(82, 66, 48, 0.38)';
  fCtx.lineWidth = 1.6;
  for (let c = 0; c < 18; c++) {
    let x = 60 + fRand() * 900;
    let y = 40 + fRand() * 420;
    fCtx.beginPath();
    fCtx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (fRand() - 0.5) * 34;
      y += 10 + fRand() * 22;
      fCtx.lineTo(x, y);
    }
    fCtx.stroke();
  }
  // Subtle aged painted frame border
  fCtx.strokeStyle = 'rgba(84, 65, 44, 0.45)';
  fCtx.lineWidth = 6;
  fCtx.strokeRect(marginX - 2, marginY - 2, flagW + 4, flagH + 4);

  const flagMuralAlbedo = new THREE.CanvasTexture(flagCanvas);
  flagMuralAlbedo.colorSpace = THREE.SRGBColorSpace;

  // 6. Four Striped Market Awning Fabric Textures
  const awningPalettes: [string, string][] = [
    ['#a93828', '#ebe0cb'], // Terracotta & cream
    ['#365d3b', '#e8dec9'], // Olive green & cream
    ['#b57423', '#efe5cf'], // Saffron ochre & cream
    ['#7c2934', '#e8dec8']  // Deep burgundy & cream
  ];
  const awnings = awningPalettes.map(([c1, c2], idx) => {
    const ac = document.createElement('canvas');
    ac.width = 256;
    ac.height = 256;
    const actx = ac.getContext('2d')!;
    const ar = seededRand(500 + idx * 77);
    for (let x = 0; x < 256; x += 32) {
      actx.fillStyle = (x / 32) % 2 === 0 ? c1 : c2;
      actx.fillRect(x, 0, 32, 256);
    }
    // Weathered woven canvas grain
    for (let i = 0; i < 1600; i++) {
      actx.fillStyle = ar() < 0.5 ? 'rgba(60,40,20,0.08)' : 'rgba(255,248,230,0.08)';
      actx.fillRect(ar() * 256, ar() * 256, 3, 2);
    }
    const t = new THREE.CanvasTexture(ac);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  // 7. Carved Stone Trim Albedo (warm limestone arches & pillars)
  const stCanvas = document.createElement('canvas');
  stCanvas.width = 256;
  stCanvas.height = 256;
  const stCtx = stCanvas.getContext('2d')!;
  const stRand = seededRand(9921);
  stCtx.fillStyle = '#c5b08f';
  stCtx.fillRect(0, 0, 256, 256);
  stCtx.strokeStyle = 'rgba(95, 76, 52, 0.25)';
  stCtx.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    stCtx.beginPath();
    stCtx.moveTo(0, y);
    stCtx.lineTo(256, y);
    stCtx.stroke();
  }
  for (let i = 0; i < 1800; i++) {
    stCtx.fillStyle = stRand() < 0.5 ? 'rgba(85,68,46,0.08)' : 'rgba(250,242,226,0.07)';
    stCtx.fillRect(stRand() * 256, stRand() * 256, 3, 3);
  }
  const stoneTrimAlbedo = new THREE.CanvasTexture(stCanvas);
  stoneTrimAlbedo.wrapS = THREE.RepeatWrapping;
  stoneTrimAlbedo.wrapT = THREE.RepeatWrapping;
  stoneTrimAlbedo.colorSpace = THREE.SRGBColorSpace;

  cachedTextures = {
    wallAlbedo,
    wallNormal,
    wallRoughness,
    cobbleAlbedo,
    cobbleNormal,
    cobbleRoughness,
    woodCarvedAlbedo,
    woodShutterAlbedo,
    flagMuralAlbedo,
    awnings,
    stoneTrimAlbedo
  };
  return cachedTextures;
}

export function applyCasbahTextureAnisotropy(maxAnisotropy: number) {
  if (!cachedTextures) return;
  const all: THREE.Texture[] = [
    cachedTextures.wallAlbedo,
    cachedTextures.wallNormal,
    cachedTextures.wallRoughness,
    cachedTextures.cobbleAlbedo,
    cachedTextures.cobbleNormal,
    cachedTextures.cobbleRoughness,
    cachedTextures.woodCarvedAlbedo,
    cachedTextures.woodShutterAlbedo,
    cachedTextures.flagMuralAlbedo,
    cachedTextures.stoneTrimAlbedo,
    ...cachedTextures.awnings
  ];
  for (const t of all) {
    t.anisotropy = maxAnisotropy;
    t.needsUpdate = true;
  }
}

// ==========================================================
// MAP 4: AL-CASBAH QUARTER (حي القصبة العتيقة)
// Authentic Algiers Casbah Urban Architecture:
//   - Narrow 4.0m Cobblestone Streets (comfortably fits 2 players side-by-side)
//   - Intertwined Alleys, Cross-Connectors & Covered Sabat Archways
//   - Multiple Central Combat Plazas (Main Mid Square + Upper Crossroads Square)
//   - Small Deserted Street Market (4 Vegetable Stalls, Zero People)
//   - Wide Site A & Site B Convergence Plazas
//   - Realistic House Doors, Upper-Story Shuttered Windows & Roof Beams
//   - Quadruple Traditional Doors (أبواب رباعية تقليدية)
//   - Aged Hand-Painted Algerian Flag Mural on Rough Matte Plaster
// ==========================================================
export function getCasbahQuarter(): MapData {
  const colliders: BoxCollider[] = [];
  const ramps: RampZone[] = [];

  const tex = createCasbahTextures();

  // Rough matte materials: zero glossy/plastic light reflection
  const plasterMat = new THREE.MeshStandardMaterial({
    map: tex.wallAlbedo,
    normalMap: tex.wallNormal,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: tex.wallRoughness,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.08
  });
  tex.wallAlbedo.repeat.set(3, 2);
  tex.wallNormal.repeat.set(3, 2);
  tex.wallRoughness.repeat.set(3, 2);

  const warmPlasterMat = new THREE.MeshStandardMaterial({
    color: 0xf4ead7,
    map: tex.wallAlbedo,
    normalMap: tex.wallNormal,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughnessMap: tex.wallRoughness,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.08
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    map: tex.stoneTrimAlbedo,
    normalMap: tex.wallNormal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.96,
    metalness: 0.0,
    envMapIntensity: 0.09
  });

  const cobbleMat = new THREE.MeshStandardMaterial({
    map: tex.cobbleAlbedo,
    normalMap: tex.cobbleNormal,
    normalScale: new THREE.Vector2(1.45, 1.45),
    roughnessMap: tex.cobbleRoughness,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.08
  });
  tex.cobbleAlbedo.repeat.set(34, 34);
  tex.cobbleNormal.repeat.set(34, 34);
  tex.cobbleRoughness.repeat.set(34, 34);

  const carvedWoodMat = new THREE.MeshStandardMaterial({
    map: tex.woodCarvedAlbedo,
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.12
  });

  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: 0x4b2e1b,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.1
  });

  const shutterMat = new THREE.MeshStandardMaterial({
    map: tex.woodShutterAlbedo,
    roughness: 0.86,
    metalness: 0.02,
    envMapIntensity: 0.12
  });

  const wroughtIronMat = new THREE.MeshStandardMaterial({
    color: 0x1e2226,
    roughness: 0.65,
    metalness: 0.58,
    envMapIntensity: 0.35
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc29842,
    roughness: 0.42,
    metalness: 0.78,
    envMapIntensity: 0.55
  });

  const darkRecessMat = new THREE.MeshStandardMaterial({
    color: 0x14110f,
    roughness: 0.98,
    metalness: 0.0,
    envMapIntensity: 0.02
  });

  const addBox = (
    group: THREE.Group,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    collide = true,
    castShadow = true,
    surface: SurfaceMaterial = 'concrete'
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (collide) {
      colliders.push({
        min: new THREE.Vector3(x - w / 2, y, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
        surface
      });
    }
    return mesh;
  };

  // Building block helper: adds main rough plaster structure + stone cornice + protruding cedar roof beams
  const addCasbahBuilding = (
    group: THREE.Group,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    height: number,
    useWarm = false
  ) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    addBox(group, w, height, d, cx, 0, cz, useWarm ? warmPlasterMat : plasterMat, true, true, 'concrete');

    // Top stone coping / terrace parapet (non-colliding decorative roofline)
    addBox(group, w + 0.18, 0.36, d + 0.18, cx, height - 0.18, cz, stoneMat, false, true, 'concrete');

    // Protruding cedar roof beam ends along X & Z eaves (authentic Casbah silhouette)
    const beamY = height - 0.62;
    for (let bx = minX + 1.1; bx <= maxX - 1.1; bx += 1.6) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, d + 0.56), darkTimberMat);
      beam.position.set(bx, beamY, cz);
      beam.castShadow = true;
      group.add(beam);
    }
    for (let bz = minZ + 1.1; bz <= maxZ - 1.1; bz += 1.6) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.56, 0.16, 0.16), darkTimberMat);
      beam.position.set(cx, beamY - 0.18, bz);
      beam.castShadow = true;
      group.add(beam);
    }
  };

  // Realistic Casbah House Door (flush/slightly proud of wall, zero snag collision)
  const addCasbahHouseDoor = (group: THREE.Group, x: number, z: number, rotY: number) => {
    const door = new THREE.Group();
    // Stone threshold step
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.14, 0.28), stoneMat);
    step.position.set(0, 0.07, 0.14);
    step.receiveShadow = true;

    // Outer sculpted stone door jambs & lintel
    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.55, 0.18), stoneMat);
    leftJamb.position.set(-0.76, 1.28, 0.09);
    leftJamb.castShadow = true;
    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.55, 0.18), stoneMat);
    rightJamb.position.set(0.76, 1.28, 0.09);
    rightJamb.castShadow = true;
    const header = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.42, 0.22), stoneMat);
    header.position.set(0, 2.66, 0.1);
    header.castShadow = true;

    // Recessed carved wooden door leaf
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.28, 2.38, 0.08), carvedWoodMat);
    leaf.position.set(0, 1.26, 0.04);
    leaf.receiveShadow = true;

    // Upper fanlight transom grille
    const transom = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.22, 0.06), darkRecessMat);
    transom.position.set(0, 2.48, 0.05);

    // Traditional brass knocker ring
    const knocker = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 14), brassMat);
    knocker.position.set(0.18, 1.38, 0.1);

    door.add(step, leftJamb, rightJamb, header, leaf, transom, knocker);
    door.position.set(x, 0, z);
    door.rotation.y = rotY;
    group.add(door);
  };

  // Realistic Upper-Story Casbah Window with Shutters, Sill Corbels & Wrought-Iron Grille
  const addCasbahUpperWindow = (group: THREE.Group, x: number, y: number, z: number, rotY: number) => {
    const win = new THREE.Group();

    // Recessed dark glass interior
    const recess = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.48, 0.06), darkRecessMat);
    recess.position.set(0, 0, 0.03);

    // Sculpted stone sill & corbel brackets
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.14, 0.28), stoneMat);
    sill.position.set(0, -0.78, 0.14);
    sill.castShadow = true;
    for (const cx of [-0.46, 0.46]) {
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.22), stoneMat);
      corbel.position.set(cx, -0.94, 0.11);
      win.add(corbel);
    }

    // Timber frame surround + arched header
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.18, 0.16), stoneMat);
    topFrame.position.set(0, 0.8, 0.08);
    topFrame.castShadow = true;

    // Left & right open louvered shutters (aged Casbah teal wood)
    const shutterL = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.42, 0.06), shutterMat);
    shutterL.position.set(-0.78, 0, 0.08);
    shutterL.rotation.y = 0.22;
    shutterL.castShadow = true;

    const shutterR = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.42, 0.06), shutterMat);
    shutterR.position.set(0.78, 0, 0.08);
    shutterR.rotation.y = -0.22;
    shutterR.castShadow = true;

    // Wrought-iron traditional security grille bars
    for (const bx of [-0.34, -0.11, 0.11, 0.34]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.42, 6), wroughtIronMat);
      bar.position.set(bx, 0, 0.11);
      win.add(bar);
    }
    for (const by of [-0.36, 0.12, 0.48]) {
      const hbar = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.03, 0.03), wroughtIronMat);
      hbar.position.set(0, by, 0.11);
      win.add(hbar);
    }

    win.add(recess, sill, topFrame, shutterL, shutterR);
    win.position.set(x, y, z);
    win.rotation.y = rotY;
    group.add(win);
  };

  // Grand Quadruple Traditional Casbah Door (باب رباعي تقليدي بعرض كبير - 4 أجنحة خشبية)
  const addQuadrupleCasbahDoor = (group: THREE.Group, x: number, z: number, rotY: number) => {
    const portal = new THREE.Group();

    // Wide stone steps
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.16, 0.56), stoneMat);
    step1.position.set(0, 0.08, 0.28);
    step1.receiveShadow = true;
    portal.add(step1);

    // Side sculpted pilasters
    for (const sx of [-2.35, 2.35]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.44, 4.1, 0.36), stoneMat);
      pilaster.position.set(sx, 2.05, 0.18);
      pilaster.castShadow = true;
      pilaster.receiveShadow = true;
      portal.add(pilaster);
    }

    // Grand Horseshoe Stone Arch / Cornice Header
    const archLint = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.65, 0.42), stoneMat);
    archLint.position.set(0, 4.15, 0.2);
    archLint.castShadow = true;
    const archInner = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.24, 10, 24, Math.PI), stoneMat);
    archInner.position.set(0, 2.75, 0.22);
    portal.add(archLint, archInner);

    // 4 Distinct Wooden Door Leaves (الأبواب الرباعية: 4 ضلف منفصلة بإطارات وزخارف نحاسية)
    const leafWidth = 1.02;
    const leafCenters = [-1.59, -0.53, 0.53, 1.59];
    leafCenters.forEach((lx, idx) => {
      const leafPanel = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, 3.65, 0.1), carvedWoodMat);
      leafPanel.position.set(lx, 1.98, 0.06);
      leafPanel.receiveShadow = true;
      portal.add(leafPanel);

      // Vertical carved stile molding separating each of the 4 leaves
      const stile = new THREE.Mesh(new THREE.BoxGeometry(0.11, 3.7, 0.15), darkTimberMat);
      stile.position.set(lx + (idx < 2 ? -leafWidth * 0.48 : leafWidth * 0.48), 1.98, 0.08);
      portal.add(stile);

      // Decorative brass rosette studs on each leaf
      for (const sy of [1.2, 2.1, 3.0]) {
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), brassMat);
        stud.position.set(lx, sy, 0.12);
        portal.add(stud);
      }
    });

    // Central heavy meeting astragal + traditional small inset wicket door frame ("خوخة") on leaf 2
    const centerBar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.72, 0.17), darkTimberMat);
    centerBar.position.set(0, 1.98, 0.09);
    const wicketFrame = new THREE.Mesh(new THREE.BoxGeometry(0.74, 1.65, 0.04), darkTimberMat);
    wicketFrame.position.set(-0.53, 1.02, 0.11);
    const knockerL = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 16), brassMat);
    knockerL.position.set(-0.53, 1.62, 0.15);
    const knockerR = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 16), brassMat);
    knockerR.position.set(0.53, 1.62, 0.15);

    portal.add(centerBar, wicketFrame, knockerL, knockerR);
    portal.position.set(x, 0, z);
    portal.rotation.y = rotY;
    group.add(portal);
  };

  // Open Grand 4-Leaf Casbah Archway Gate (doors swung wide open against piers, 4.0m clear walk)
  const addQuadrupleOpenArchGate = (group: THREE.Group, x: number, z: number, rotY = 0) => {
    const gate = new THREE.Group();
    const stonePierL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.4), stoneMat);
    stonePierL.position.set(-2.55, 2.6, 0);
    stonePierL.castShadow = true;
    stonePierL.receiveShadow = true;

    const stonePierR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.4), stoneMat);
    stonePierR.position.set(2.55, 2.6, 0);
    stonePierR.castShadow = true;
    stonePierR.receiveShadow = true;

    const topLintel = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.4, 1.5), stoneMat);
    topLintel.position.set(0, 4.55, 0);
    topLintel.castShadow = true;

    // 4 Open folded wooden door leaves pinned open at the sides (2 left, 2 right)
    const leafL1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.6, 0.1), carvedWoodMat);
    leafL1.position.set(-1.92, 1.8, 0.55);
    leafL1.rotation.y = Math.PI / 2 - 0.15;
    const leafL2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.6, 0.1), carvedWoodMat);
    leafL2.position.set(-1.92, 1.8, -0.45);
    leafL2.rotation.y = Math.PI / 2 + 0.1;

    const leafR1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.6, 0.1), carvedWoodMat);
    leafR1.position.set(1.92, 1.8, 0.55);
    leafR1.rotation.y = -Math.PI / 2 + 0.15;
    const leafR2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.6, 0.1), carvedWoodMat);
    leafR2.position.set(1.92, 1.8, -0.45);
    leafR2.rotation.y = -Math.PI / 2 - 0.1;

    gate.add(stonePierL, stonePierR, topLintel, leafL1, leafL2, leafR1, leafR2);
    gate.position.set(x, 0, z);
    gate.rotation.y = rotY;
    group.add(gate);

    // Axis-aligned pier colliders leaving a clean 3.7m central portal
    const isRot = Math.abs(Math.sin(rotY)) > 0.5;
    if (!isRot) {
      colliders.push(
        { min: new THREE.Vector3(x - 3.1, 0, z - 0.7), max: new THREE.Vector3(x - 1.85, 5.2, z + 0.7), surface: 'concrete' },
        { min: new THREE.Vector3(x + 1.85, 0, z - 0.7), max: new THREE.Vector3(x + 3.1, 5.2, z + 0.7), surface: 'concrete' }
      );
    } else {
      colliders.push(
        { min: new THREE.Vector3(x - 0.7, 0, z - 3.1), max: new THREE.Vector3(x + 0.7, 5.2, z - 1.85), surface: 'concrete' },
        { min: new THREE.Vector3(x - 0.7, 0, z + 1.85), max: new THREE.Vector3(x + 0.7, 5.2, z + 3.1), surface: 'concrete' }
      );
    }
  };

  // Covered Sabat Archway Bridge Overhead (y = 3.9..6.4, clear underneath for players/bots)
  const addSabatArchway = (
    group: THREE.Group,
    x: number,
    z: number,
    spanW: number,
    depth: number,
    axis: 'x' | 'z'
  ) => {
    const w = axis === 'x' ? spanW : depth;
    const d = axis === 'x' ? depth : spanW;
    addBox(group, w, 2.4, d, x, 3.9, z, plasterMat, false, true, 'concrete');
    // Timber support beams underneath Sabat ceiling
    const count = 3;
    for (let i = -1; i <= 1; i++) {
      const beam = new THREE.Mesh(
        axis === 'x'
          ? new THREE.BoxGeometry(spanW, 0.22, 0.22)
          : new THREE.BoxGeometry(0.22, 0.22, spanW),
        darkTimberMat
      );
      beam.position.set(
        axis === 'x' ? x : x + i * (depth * 0.32),
        3.82,
        axis === 'x' ? z + i * (depth * 0.32) : z
      );
      beam.castShadow = true;
      group.add(beam);
    }
    void count;
  };

  // Traditional Courtyard Octagonal Stone Fountain (tactical cover in plazas)
  const addCasbahFountain = (group: THREE.Group, x: number, z: number) => {
    const fGroup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.72, 0.88, 8), stoneMat);
    base.position.y = 0.44;
    base.castShadow = true;
    base.receiveShadow = true;

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 0.08, 8),
      new THREE.MeshStandardMaterial({
        color: 0x1d5b6e,
        roughness: 0.24,
        metalness: 0.22,
        envMapIntensity: 0.55
      })
    );
    water.position.y = 0.82;

    const centerPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.55, 8), stoneMat);
    centerPillar.position.y = 0.78;
    centerPillar.castShadow = true;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), brassMat);
    finial.position.y = 1.66;

    fGroup.add(base, water, centerPillar, finial);
    fGroup.position.set(x, 0, z);
    group.add(fGroup);

    colliders.push({
      min: new THREE.Vector3(x - 1.55, 0, z - 1.55),
      max: new THREE.Vector3(x + 1.55, 1.15, z + 1.55),
      surface: 'concrete'
    });
  };

  // Wooden Cargo Crate (tactical cover)
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0x9b6b3e,
    map: tex.woodCarvedAlbedo,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.1
  });
  const addCrate = (group: THREE.Group, x: number, y: number, z: number, s = 1.85) => {
    addBox(group, s, s, s, x, y, z, crateMat, true, true, 'wood');
  };

  // Deserted Vegetable Market Street Shop (4 stalls, rich produce crates/baskets, ZERO people)
  const addVegetableStall = (
    group: THREE.Group,
    x: number,
    z: number,
    rotY: number,
    variant: 0 | 1 | 2 | 3
  ) => {
    const stall = new THREE.Group();
    const vRand = seededRand(1200 + variant * 313);

    const awningMat = new THREE.MeshStandardMaterial({
      map: tex.awnings[variant],
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.08,
      side: THREE.DoubleSide
    });
    const basketMat = new THREE.MeshStandardMaterial({
      color: 0xb78b4b,
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 0.08
    });

    // 4 Timber Corner Posts
    const postGeo = new THREE.BoxGeometry(0.14, 2.55, 0.14);
    for (const px of [-1.75, 1.75]) {
      for (const pz of [-0.95, 0.95]) {
        const post = new THREE.Mesh(postGeo, darkTimberMat);
        post.position.set(px, 1.275, pz);
        post.castShadow = true;
        post.receiveShadow = true;
        stall.add(post);
      }
    }

    // Sloped Striped Canvas Awning Roof (high enough at y=2.55..2.85, sloped forward)
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.08, 2.55), awningMat);
    canopy.position.set(0, 2.66, 0.12);
    canopy.rotation.x = 0.22;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    stall.add(canopy);

    // Wooden Shop Counter + Front Apron + Tilted Display Rack
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.96, 1.5), crateMat);
    counter.position.set(0, 0.48, 0.1);
    counter.castShadow = true;
    counter.receiveShadow = true;
    stall.add(counter);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.72), darkTimberMat);
    shelf.position.set(0, 1.06, -0.15);
    shelf.rotation.x = 0.25;
    shelf.castShadow = true;
    stall.add(shelf);

    // Empty weathered wooden stool tucked behind counter (emphasizes deserted shop with no vendor)
    const stoolTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10), darkTimberMat);
    stoolTop.position.set(-0.9, 0.48, -0.82);
    const stoolLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 0.46, 8), darkTimberMat);
    stoolLeg.position.set(-0.9, 0.23, -0.82);
    stall.add(stoolTop, stoolLeg);

    // Vegetable produce palettes per shop
    const produceSets: { color: number; radius: number; elongated?: boolean }[][] = [
      // Shop 0: Red Tomatoes, Green Bell Peppers, Red Chilis
      [
        { color: 0xcf2e24, radius: 0.075 },
        { color: 0x3b8a32, radius: 0.082 },
        { color: 0xb5241b, radius: 0.068 }
      ],
      // Shop 1: Deep Purple Eggplants, Green Zucchinis, White Garlic/Cauliflower
      [
        { color: 0x4b1d52, radius: 0.09, elongated: true },
        { color: 0x4f8a2b, radius: 0.078, elongated: true },
        { color: 0xebe5d5, radius: 0.085 }
      ],
      // Shop 2: Golden Potatoes, Red/Bronze Onions, Turnips
      [
        { color: 0xb98d52, radius: 0.078 },
        { color: 0x9b4540, radius: 0.072 },
        { color: 0xd6b072, radius: 0.074 }
      ],
      // Shop 3: Bright Carrots, Oranges/Lemons, Fresh Lettuce/Mint
      [
        { color: 0xe66e19, radius: 0.075, elongated: true },
        { color: 0xeb8c1c, radius: 0.082 },
        { color: 0x3d9434, radius: 0.095 }
      ]
    ];

    const items = produceSets[variant];
    const crateOffsets = [-1.15, 0.0, 1.15];

    crateOffsets.forEach((cx, ci) => {
      // Wooden display crate resting on tilted shelf
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.65), darkTimberMat);
      box.position.set(cx, 1.15, -0.05);
      box.rotation.x = 0.24;
      box.castShadow = true;
      stall.add(box);

      const itemSpec = items[ci % items.length];
      const vegMat = new THREE.MeshStandardMaterial({
        color: itemSpec.color,
        roughness: 0.72,
        metalness: 0.0,
        envMapIntensity: 0.18
      });

      // Mound of 14 distinct 3D vegetables inside each crate
      for (let k = 0; k < 14; k++) {
        const vx = cx + (vRand() - 0.5) * 0.72;
        const vz = -0.05 + (vRand() - 0.5) * 0.44;
        const vy = 1.24 + (1 - Math.abs(vx - cx) * 1.4) * 0.08 + vRand() * 0.07;
        const veg = new THREE.Mesh(
          itemSpec.elongated
            ? new THREE.CapsuleGeometry(itemSpec.radius * 0.62, itemSpec.radius * 1.2, 4, 8)
            : new THREE.SphereGeometry(itemSpec.radius * (0.85 + vRand() * 0.3), 8, 6),
          vegMat
        );
        veg.position.set(vx, vy, vz);
        if (itemSpec.elongated) {
          veg.rotation.set(vRand() * Math.PI, vRand() * Math.PI, vRand() * Math.PI);
        }
        stall.add(veg);
      }

      // Woven reed floor basket sitting directly in front of the counter
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.42, 12), basketMat);
      basket.position.set(cx * 0.92, 0.21, 0.95);
      basket.castShadow = true;
      basket.receiveShadow = true;
      stall.add(basket);

      for (let b = 0; b < 8; b++) {
        const bv = new THREE.Mesh(new THREE.SphereGeometry(itemSpec.radius * 0.95, 7, 6), vegMat);
        bv.position.set(
          cx * 0.92 + (vRand() - 0.5) * 0.34,
          0.42 + vRand() * 0.09,
          0.95 + (vRand() - 0.5) * 0.34
        );
        stall.add(bv);
      }
    });

    // Hanging brass balance scale on Shop 3
    if (variant === 3) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), wroughtIronMat);
      chain.position.set(1.35, 2.28, 0.62);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.03), brassMat);
      beam.position.set(1.35, 2.02, 0.62);
      const panL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.04, 10), brassMat);
      panL.position.set(1.14, 1.78, 0.62);
      const panR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.04, 10), brassMat);
      panR.position.set(1.56, 1.78, 0.62);
      stall.add(chain, beam, panL, panR);
    }

    stall.position.set(x, 0, z);
    stall.rotation.y = rotY;
    group.add(stall);

    // Axis-aligned collider matching counter + front baskets (height 1.15m -> shoot/peek over!)
    const rotated = Math.abs(Math.sin(rotY)) > 0.5;
    const halfX = rotated ? 1.22 : 1.95;
    const halfZ = rotated ? 1.95 : 1.22;
    colliders.push({
      min: new THREE.Vector3(x - halfX, 0, z - halfZ),
      max: new THREE.Vector3(x + halfX, 1.18, z + halfZ),
      surface: 'wood'
    });
  };

  // Hanging Traditional Brass Casbah Street Lantern (under Sabats & key corners)
  const addCasbahLantern = (group: THREE.Group, x: number, y: number, z: number, emitLight = true) => {
    if (emitLight) {
      const pt = new THREE.PointLight(0xffcb82, 3.1, 19, 1.4);
      pt.position.set(x, y - 0.3, z);
      group.add(pt);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), wroughtIronMat);
    rod.position.set(x, y + 0.25, z);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.36, 6), brassMat);
    housing.position.set(x, y - 0.1, z);
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.11, 0.22, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe4b3 })
    );
    glow.position.set(x, y - 0.1, z);
    group.add(rod, housing, glow);
  };

  // ==========================================
  // SPAWNS & WIDE CONVERGENCE BOMBSITES A & B
  // ==========================================
  const tSpawns: THREE.Vector3[] = [];
  const ctSpawns: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    tSpawns.push(new THREE.Vector3(-4.5 + col * 3.0, 0, 42 + row * 3.0));
    ctSpawns.push(new THREE.Vector3(-4.5 + col * 3.0, 0, -42 - row * 3.0));
  }

  const siteA: BombSiteZone = {
    id: 'A',
    name: 'Eastern Casbah Plaza (Site A)',
    nameAr: 'الموقع A (الساحة الشرقية الواسعة)',
    center: new THREE.Vector3(24, 0, -23),
    radius: 7.2
  };

  const siteB: BombSiteZone = {
    id: 'B',
    name: 'Ancient Fountain Plaza (Site B)',
    nameAr: 'الموقع B (ساحة العين العتيقة الواسعة)',
    center: new THREE.Vector3(-24, 0, -23),
    radius: 7.2
  };

  // ==========================================
  // BIDIRECTIONAL TACTICAL NAVGRAPH (Every node & segment 100% clear of colliders)
  // ==========================================
  const navNodes: Record<string, NavNode> = {
    // South Gang Spawn & Cross-Alley
    t_spawn: {
      id: 't_spawn',
      pos: new THREE.Vector3(0, 0, 42),
      connections: ['t_south_west', 't_south_mid', 't_south_east'],
      isTSpawn: true
    },
    t_south_west: {
      id: 't_south_west',
      pos: new THREE.Vector3(-14, 0, 40),
      connections: ['t_spawn', 't_far_west_corner', 'alley_sw_entry']
    },
    t_far_west_corner: {
      id: 't_far_west_corner',
      pos: new THREE.Vector3(-34, 0, 40),
      connections: ['t_south_west', 'alley_far_west_south']
    },
    t_south_mid: {
      id: 't_south_mid',
      pos: new THREE.Vector3(0, 0, 30),
      connections: ['t_spawn', 'south_cross_mid'],
      isChokepoint: true
    },
    t_south_east: {
      id: 't_south_east',
      pos: new THREE.Vector3(16, 0, 40),
      connections: ['t_spawn', 't_far_east_corner', 'alley_se_inner']
    },
    t_far_east_corner: {
      id: 't_far_east_corner',
      pos: new THREE.Vector3(34, 0, 40),
      connections: ['t_south_east', 'alley_far_east_south']
    },
    alley_far_west_south: {
      id: 'alley_far_west_south',
      pos: new THREE.Vector3(-34, 0, 23),
      connections: ['t_far_west_corner', 'market_sw', 'alley_sw_entry']
    },
    alley_sw_entry: {
      id: 'alley_sw_entry',
      pos: new THREE.Vector3(-14, 0, 23),
      connections: ['t_south_west', 'alley_far_west_south', 'market_south_entry', 'south_cross_mid']
    },
    south_cross_mid: {
      id: 'south_cross_mid',
      pos: new THREE.Vector3(0, 0, 23),
      connections: ['t_south_mid', 'alley_sw_entry', 'alley_se_inner', 'mid_south_entry']
    },
    alley_se_inner: {
      id: 'alley_se_inner',
      pos: new THREE.Vector3(16, 0, 23),
      connections: ['t_south_east', 'south_cross_mid', 'se_courtyard', 'alley_far_east_south']
    },
    alley_far_east_south: {
      id: 'alley_far_east_south',
      pos: new THREE.Vector3(34, 0, 23),
      connections: ['t_far_east_corner', 'alley_se_inner', 'east_lane_outer']
    },

    // Market Square (ساحة السوق الصغير)
    market_south_entry: {
      id: 'market_south_entry',
      pos: new THREE.Vector3(-24.8, 0, 22),
      connections: ['alley_sw_entry', 'market_center']
    },
    market_sw: {
      id: 'market_sw',
      pos: new THREE.Vector3(-34, 0, 12.5),
      connections: ['alley_far_west_south', 'west_lane_outer']
    },
    market_center: {
      id: 'market_center',
      pos: new THREE.Vector3(-24.8, 0, 12.5),
      connections: ['market_south_entry', 'market_mid_se', 'market_north_exit']
    },
    market_north_exit: {
      id: 'market_north_exit',
      pos: new THREE.Vector3(-20, 0, 3.5),
      connections: ['market_center', 'west_lane_inner']
    },
    market_mid_se: {
      id: 'market_mid_se',
      pos: new THREE.Vector3(-15.8, 0, 12.5),
      connections: ['market_center', 'market_se']
    },
    market_se: {
      id: 'market_se',
      pos: new THREE.Vector3(-15.8, 0, 8),
      connections: ['market_mid_se', 'market_to_mid_sabat']
    },
    market_to_mid_sabat: {
      id: 'market_to_mid_sabat',
      pos: new THREE.Vector3(-10, 0, 8),
      connections: ['market_se', 'mid_plaza_south'],
      isChokepoint: true
    },

    // Central Combat Plaza (الساحة الوسطى للاشتباك) & Upper Mid Plaza
    mid_south_entry: {
      id: 'mid_south_entry',
      pos: new THREE.Vector3(0, 0, 15),
      connections: ['south_cross_mid', 'mid_plaza_south'],
      isChokepoint: true
    },
    mid_plaza_south: {
      id: 'mid_plaza_south',
      pos: new THREE.Vector3(0, 0, 8),
      connections: ['mid_south_entry', 'market_to_mid_sabat', 'east_to_mid_sabat', 'mid_plaza_west', 'mid_plaza_east']
    },
    mid_plaza_west: {
      id: 'mid_plaza_west',
      pos: new THREE.Vector3(-6, 0, -2),
      connections: ['mid_plaza_south', 'twin_alley_west']
    },
    mid_plaza_east: {
      id: 'mid_plaza_east',
      pos: new THREE.Vector3(6, 0, -2),
      connections: ['mid_plaza_south', 'twin_alley_east']
    },
    twin_alley_west: {
      id: 'twin_alley_west',
      pos: new THREE.Vector3(-6, 0, -8),
      connections: ['mid_plaza_west', 'mid_west_cross', 'upper_mid_sw'],
      isChokepoint: true
    },
    twin_alley_east: {
      id: 'twin_alley_east',
      pos: new THREE.Vector3(6, 0, -8),
      connections: ['mid_plaza_east', 'mid_east_cross', 'upper_mid_se'],
      isChokepoint: true
    },
    mid_west_cross: {
      id: 'mid_west_cross',
      pos: new THREE.Vector3(-10, 0, -8),
      connections: ['twin_alley_west', 'west_cross_link']
    },
    west_cross_link: {
      id: 'west_cross_link',
      pos: new THREE.Vector3(-20, 0, -8),
      connections: ['mid_west_cross', 'west_cross_outer', 'west_lane_inner', 'b_inner_entry']
    },
    west_cross_outer: {
      id: 'west_cross_outer',
      pos: new THREE.Vector3(-34, 0, -8),
      connections: ['west_cross_link', 'west_lane_outer', 'b_west_entry']
    },
    mid_east_cross: {
      id: 'mid_east_cross',
      pos: new THREE.Vector3(10, 0, -8),
      connections: ['twin_alley_east', 'east_cross_hub']
    },
    east_cross_hub: {
      id: 'east_cross_hub',
      pos: new THREE.Vector3(14, 0, -8),
      connections: ['mid_east_cross', 'east_lane_inner', 'a_inner_entry']
    },
    upper_mid_sw: {
      id: 'upper_mid_sw',
      pos: new THREE.Vector3(-6, 0, -18),
      connections: ['twin_alley_west', 'upper_mid_to_b', 'upper_mid_plaza', 'upper_mid_nw']
    },
    upper_mid_se: {
      id: 'upper_mid_se',
      pos: new THREE.Vector3(6, 0, -18),
      connections: ['twin_alley_east', 'upper_mid_to_a', 'upper_mid_plaza', 'upper_mid_ne']
    },
    upper_mid_nw: {
      id: 'upper_mid_nw',
      pos: new THREE.Vector3(-6, 0, -28),
      connections: ['upper_mid_sw', 'upper_mid_plaza', 'upper_mid_north']
    },
    upper_mid_ne: {
      id: 'upper_mid_ne',
      pos: new THREE.Vector3(6, 0, -28),
      connections: ['upper_mid_se', 'upper_mid_plaza', 'upper_mid_north']
    },
    upper_mid_plaza: {
      id: 'upper_mid_plaza',
      pos: new THREE.Vector3(0, 0, -22),
      connections: ['upper_mid_sw', 'upper_mid_se', 'upper_mid_nw', 'upper_mid_ne', 'upper_mid_north'],
      isSniperSpot: true
    },
    upper_mid_north: {
      id: 'upper_mid_north',
      pos: new THREE.Vector3(0, 0, -32),
      connections: ['upper_mid_plaza', 'upper_mid_nw', 'upper_mid_ne', 'ct_mid_gate', 'ct_a_street', 'ct_b_street'],
      isSniperSpot: true
    },
    upper_mid_to_b: {
      id: 'upper_mid_to_b',
      pos: new THREE.Vector3(-10, 0, -18),
      connections: ['upper_mid_sw', 'b_inner_entry'],
      isChokepoint: true
    },
    upper_mid_to_a: {
      id: 'upper_mid_to_a',
      pos: new THREE.Vector3(10, 0, -18),
      connections: ['upper_mid_se', 'a_inner_entry'],
      isChokepoint: true
    },

    // West Intertwined Alleys -> Site B
    west_lane_outer: {
      id: 'west_lane_outer',
      pos: new THREE.Vector3(-34, 0, -4),
      connections: ['market_sw', 'west_cross_outer'],
      isChokepoint: true
    },
    b_west_entry: {
      id: 'b_west_entry',
      pos: new THREE.Vector3(-34, 0, -15),
      connections: ['west_cross_outer', 'b_south_plaza', 'b_sw_plaza']
    },
    b_south_plaza: {
      id: 'b_south_plaza',
      pos: new THREE.Vector3(-24, 0, -15),
      connections: ['b_west_entry', 'b_inner_entry', 'site_b']
    },
    b_sw_plaza: {
      id: 'b_sw_plaza',
      pos: new THREE.Vector3(-33, 0, -23),
      connections: ['b_west_entry', 'site_b', 'b_north_flank']
    },
    west_lane_inner: {
      id: 'west_lane_inner',
      pos: new THREE.Vector3(-20, 0, -4),
      connections: ['market_north_exit', 'west_cross_link'],
      isChokepoint: true
    },
    b_inner_entry: {
      id: 'b_inner_entry',
      pos: new THREE.Vector3(-16, 0, -18),
      connections: ['west_cross_link', 'upper_mid_to_b', 'b_south_plaza', 'site_b']
    },
    site_b: {
      id: 'site_b',
      pos: new THREE.Vector3(-24, 0, -23),
      connections: ['b_south_plaza', 'b_sw_plaza', 'b_inner_entry', 'b_north_hub'],
      isSiteB: true
    },
    b_north_hub: {
      id: 'b_north_hub',
      pos: new THREE.Vector3(-24, 0, -32),
      connections: ['site_b', 'b_north_flank', 'ct_b_street']
    },
    b_north_flank: {
      id: 'b_north_flank',
      pos: new THREE.Vector3(-33, 0, -32),
      connections: ['b_sw_plaza', 'b_north_hub', 'ct_b_outer'],
      isPostPlant: true,
      coverAngle: 0
    },

    // East Intertwined Alleys -> Site A
    se_courtyard: {
      id: 'se_courtyard',
      pos: new THREE.Vector3(14, 0, 14),
      connections: ['alley_se_inner', 'se_sabat_entry', 'east_lane_inner', 'se_east_cross']
    },
    se_sabat_entry: {
      id: 'se_sabat_entry',
      pos: new THREE.Vector3(14, 0, 8),
      connections: ['se_courtyard', 'east_to_mid_sabat']
    },
    east_to_mid_sabat: {
      id: 'east_to_mid_sabat',
      pos: new THREE.Vector3(10, 0, 8),
      connections: ['se_sabat_entry', 'mid_plaza_south'],
      isChokepoint: true
    },
    se_east_cross: {
      id: 'se_east_cross',
      pos: new THREE.Vector3(26, 0, 8),
      connections: ['se_courtyard', 'east_lane_mid']
    },
    east_lane_inner: {
      id: 'east_lane_inner',
      pos: new THREE.Vector3(14, 0, -2),
      connections: ['se_courtyard', 'east_cross_hub'],
      isChokepoint: true
    },
    a_inner_entry: {
      id: 'a_inner_entry',
      pos: new THREE.Vector3(16, 0, -18),
      connections: ['east_cross_hub', 'upper_mid_to_a', 'a_sw_plaza']
    },
    a_sw_plaza: {
      id: 'a_sw_plaza',
      pos: new THREE.Vector3(16, 0, -25),
      connections: ['a_inner_entry', 'site_a']
    },
    east_lane_mid: {
      id: 'east_lane_mid',
      pos: new THREE.Vector3(26, 0, -2),
      connections: ['se_east_cross', 'a_mid_entry'],
      isChokepoint: true
    },
    a_mid_entry: {
      id: 'a_mid_entry',
      pos: new THREE.Vector3(26, 0, -14),
      connections: ['east_lane_mid', 'a_outer_entry', 'site_a']
    },
    east_lane_outer: {
      id: 'east_lane_outer',
      pos: new THREE.Vector3(34, 0, -2),
      connections: ['alley_far_east_south', 'a_outer_entry'],
      isChokepoint: true
    },
    a_outer_entry: {
      id: 'a_outer_entry',
      pos: new THREE.Vector3(34, 0, -14),
      connections: ['east_lane_outer', 'a_mid_entry', 'site_a', 'a_east_plaza']
    },
    a_east_plaza: {
      id: 'a_east_plaza',
      pos: new THREE.Vector3(33, 0, -23),
      connections: ['a_outer_entry', 'site_a', 'a_north_flank']
    },
    site_a: {
      id: 'site_a',
      pos: new THREE.Vector3(24, 0, -23),
      connections: ['a_sw_plaza', 'a_mid_entry', 'a_outer_entry', 'a_east_plaza', 'a_north_hub', 'ct_a_street'],
      isSiteA: true
    },
    a_north_hub: {
      id: 'a_north_hub',
      pos: new THREE.Vector3(24, 0, -32),
      connections: ['site_a', 'a_north_flank', 'ct_a_street']
    },
    a_north_flank: {
      id: 'a_north_flank',
      pos: new THREE.Vector3(33, 0, -32),
      connections: ['a_east_plaza', 'a_north_hub', 'ct_a_outer'],
      isPostPlant: true,
      coverAngle: 0
    },

    // North SWAT Spawn & Defense Streets
    ct_spawn: {
      id: 'ct_spawn',
      pos: new THREE.Vector3(0, 0, -43),
      connections: ['ct_mid_gate', 'ct_east_yard', 'ct_west_yard'],
      isCTSpawn: true
    },
    ct_mid_gate: {
      id: 'ct_mid_gate',
      pos: new THREE.Vector3(0, 0, -35),
      connections: ['ct_spawn', 'upper_mid_north']
    },
    ct_east_yard: {
      id: 'ct_east_yard',
      pos: new THREE.Vector3(20, 0, -43),
      connections: ['ct_spawn', 'ct_a_street', 'ct_a_outer_yard']
    },
    ct_a_outer_yard: {
      id: 'ct_a_outer_yard',
      pos: new THREE.Vector3(34, 0, -43),
      connections: ['ct_east_yard', 'ct_a_outer']
    },
    ct_a_street: {
      id: 'ct_a_street',
      pos: new THREE.Vector3(20, 0, -32),
      connections: ['ct_east_yard', 'upper_mid_north', 'site_a', 'a_north_hub']
    },
    ct_a_outer: {
      id: 'ct_a_outer',
      pos: new THREE.Vector3(34, 0, -36),
      connections: ['ct_a_outer_yard', 'a_north_flank']
    },
    ct_west_yard: {
      id: 'ct_west_yard',
      pos: new THREE.Vector3(-20, 0, -43),
      connections: ['ct_spawn', 'ct_b_street', 'ct_b_outer_yard']
    },
    ct_b_outer_yard: {
      id: 'ct_b_outer_yard',
      pos: new THREE.Vector3(-34, 0, -43),
      connections: ['ct_west_yard', 'ct_b_outer']
    },
    ct_b_street: {
      id: 'ct_b_street',
      pos: new THREE.Vector3(-20, 0, -32),
      connections: ['ct_west_yard', 'upper_mid_north', 'b_north_hub']
    },
    ct_b_outer: {
      id: 'ct_b_outer',
      pos: new THREE.Vector3(-34, 0, -36),
      connections: ['ct_b_outer_yard', 'b_north_flank']
    }
  };

  const buildScene = (scene: THREE.Scene) => {
    const mapGroup = new THREE.Group();
    mapGroup.name = 'CasbahQuarterMap';

    // 1. Extended Ground & Mediterranean Hillside Horizon (no floating void)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), cobbleMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.castShadow = false;
    mapGroup.add(ground);

    // Distant Mediterranean Sea backdrop past the northern slope
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x1e5c82,
      roughness: 0.35,
      metalness: 0.25,
      envMapIntensity: 0.45
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(360, 140), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.4, -145);
    mapGroup.add(sea);

    // Outer Perimeter Casbah Walls (corners butt flush with zero Z-fighting overlap)
    addBox(mapGroup, 80, 9.0, 4, 0, 0, 50, plasterMat, true, true, 'concrete');
    addBox(mapGroup, 80, 9.0, 4, 0, 0, -50, plasterMat, true, true, 'concrete');
    addBox(mapGroup, 4, 9.0, 96, 38, 0, 0, plasterMat, true, true, 'concrete');
    addBox(mapGroup, 4, 9.0, 96, -38, 0, 0, plasterMat, true, true, 'concrete');

    // Distant Stepped Whitewashed Casbah Skyline & Minaret Silhouettes (outside arena)
    const skylineBlocks: [number, number, number, number, number, number][] = [
      [-52, 0, -38, 14, 15, 14],
      [-50, 0, 8, 12, 18, 16],
      [-52, 0, 36, 14, 13, 14],
      [52, 0, -34, 14, 16, 14],
      [50, 0, 10, 12, 19, 16],
      [52, 0, 40, 14, 14, 14],
      [-26, 0, 62, 16, 15, 12],
      [24, 0, 62, 18, 17, 12],
      [48, 0, -56, 7, 29, 7] // Traditional square Casbah minaret tower in distance
    ];
    for (const [bx, by, bz, bw, bh, bd] of skylineBlocks) {
      addBox(mapGroup, bw, bh, bd, bx, by, bz, warmPlasterMat, false, false);
    }

    // ==========================================
    // 2. SOUTH ROW HOUSE BLOCKS (4.0m Narrow Alleys)
    // ==========================================
    addCasbahBuilding(mapGroup, -32, -16, 25, 35, 7.4, false); // B_SW1
    addCasbahBuilding(mapGroup, -12, -2, 25, 35, 7.8, true);   // B_SCW
    addCasbahBuilding(mapGroup, 2, 14, 25, 35, 7.5, false);    // B_SCE
    addCasbahBuilding(mapGroup, 18, 32, 25, 35, 7.9, true);    // B_SE1

    // Facade doors & upper windows on South Row
    addCasbahHouseDoor(mapGroup, -24, 35.02, 0);
    addCasbahHouseDoor(mapGroup, 8, 35.02, 0);
    addCasbahHouseDoor(mapGroup, -24, 24.98, Math.PI);
    addCasbahHouseDoor(mapGroup, 25, 24.98, Math.PI);
    addCasbahUpperWindow(mapGroup, -27, 4.6, 35.02, 0);
    addCasbahUpperWindow(mapGroup, -21, 4.6, 35.02, 0);
    addCasbahUpperWindow(mapGroup, -7, 4.8, 35.02, 0);
    addCasbahUpperWindow(mapGroup, 7, 4.6, 35.02, 0);
    addCasbahUpperWindow(mapGroup, 25, 4.8, 35.02, 0);
    addCasbahUpperWindow(mapGroup, -27, 4.5, 24.98, Math.PI);
    addCasbahUpperWindow(mapGroup, -21, 4.5, 24.98, Math.PI);
    addCasbahUpperWindow(mapGroup, 8, 4.5, 24.98, Math.PI);
    addCasbahUpperWindow(mapGroup, 25, 4.7, 24.98, Math.PI);

    // Spawn Cover Crates & Planters
    addCrate(mapGroup, -7.5, 0, 37.5, 1.6);
    addCrate(mapGroup, 7.5, 0, 37.5, 1.6);

    // ==========================================
    // 3. CENTRAL PLAZA FLANKING BLOCKS & SABAT ARCHES
    // ==========================================
    addCasbahBuilding(mapGroup, -8, -2, 12, 21, 7.2, false);  // B_MID_SW
    addCasbahBuilding(mapGroup, 2, 8, 12, 21, 7.6, true);     // B_MID_SE
    addCasbahBuilding(mapGroup, -12, -8, 10, 21, 7.4, true);  // B_MID_W_WALL1
    addCasbahBuilding(mapGroup, -12, -8, -6, 6, 7.8, false);  // B_MID_W_WALL2
    addCasbahBuilding(mapGroup, 8, 12, 10, 21, 7.5, false);   // B_MID_E_WALL1
    addCasbahBuilding(mapGroup, 8, 12, -6, 6, 7.8, true);     // B_MID_E_WALL2

    // Sabat Covered Archway Bridges over Z = 6..10 connectors (4.0m wide clear beneath)
    addSabatArchway(mapGroup, -10, 8, 4.0, 4.0, 'z');
    addSabatArchway(mapGroup, 10, 8, 4.0, 4.0, 'z');
    addCasbahLantern(mapGroup, -10, 3.65, 8, true);
    addCasbahLantern(mapGroup, 10, 3.65, 8, true);

    // Facade doors & upper windows around Central Plaza & Sabats
    addCasbahHouseDoor(mapGroup, -7.98, 2.5, Math.PI / 2);
    addCasbahHouseDoor(mapGroup, 7.98, 1.5, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -7.98, 4.6, 0, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -7.98, 4.6, -3.5, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 7.98, 4.6, 0, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 7.98, 4.6, -3.5, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -5, 4.5, 11.98, Math.PI);
    addCasbahUpperWindow(mapGroup, 5, 4.5, 11.98, Math.PI);

    // ==========================================
    // 4. CENTER ISLAND HOUSE + AGED ALGERIAN FLAG MURAL
    // ==========================================
    addCasbahBuilding(mapGroup, -4, 4, -14, -6, 8.2, true); // B_MID_ISLAND

    // Aged Hand-Painted Algerian Flag Mural mounted on South Wall (z = -5.97, facing Central Plaza)
    const muralMat = new THREE.MeshStandardMaterial({
      map: tex.flagMuralAlbedo,
      normalMap: tex.wallNormal,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: tex.wallRoughness,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const muralMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.3), muralMat);
    muralMesh.position.set(0, 3.35, -5.97);
    muralMesh.receiveShadow = true;
    mapGroup.add(muralMesh);

    // Windows flanking the mural above and on the sides of B_MID_ISLAND
    addCasbahUpperWindow(mapGroup, -2.2, 6.25, -5.98, 0);
    addCasbahUpperWindow(mapGroup, 2.2, 6.25, -5.98, 0);
    addCasbahUpperWindow(mapGroup, -4.02, 4.6, -10, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 4.02, 4.6, -10, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 0, 4.6, -14.02, Math.PI);
    addCasbahHouseDoor(mapGroup, 0, -14.02, Math.PI);

    // Central Combat Plaza Fountain & Tactical Cover
    addCasbahFountain(mapGroup, 0, 2.5);
    addCrate(mapGroup, -5.0, 0, 3.8, 1.65);
    addCrate(mapGroup, 5.0, 0, 3.8, 1.65);

    // ==========================================
    // 5. MARKET SQUARE (ساحة السوق الصغير - 4 Vegetable Shops, No People)
    // ==========================================
    // 4 street stalls arranged around Market Square (X: -36..-12, Z: 5..21)
    addVegetableStall(mapGroup, -30.5, 16.5, Math.PI / 2, 0);   // Tomatoes & Peppers
    addVegetableStall(mapGroup, -30.5, 8.5, Math.PI / 2, 1);    // Eggplants & Zucchini
    addVegetableStall(mapGroup, -13.3, 16.5, -Math.PI / 2, 2);  // Potatoes & Onions (flush against B_MID_W_WALL1)
    addVegetableStall(mapGroup, -19.5, 8.5, -Math.PI / 2, 3);   // Carrots, Oranges, Lettuce + Scale

    // Facade doors & upper windows overlooking Market Square
    addCasbahHouseDoor(mapGroup, -12.02, 13.0, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -12.02, 4.7, 16.5, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -12.02, 4.7, 12.8, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -35.98, 4.7, 16.5, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -35.98, 4.7, 8.5, Math.PI / 2);

    // ==========================================
    // 6. INTERTWINED WEST & EAST MID ALLEYS
    // ==========================================
    // West Alleys (leading to Site B) — Z = -10..-6 forms continuous 4.0m cross-street
    addCasbahBuilding(mapGroup, -32, -22, -6, 1.5, 7.6, false); // B_NW_MID1
    addCasbahBuilding(mapGroup, -18, -12, -6, 1.5, 7.3, true);  // B_NW_MID2
    addCasbahHouseDoor(mapGroup, -27, 1.52, 0);
    addCasbahHouseDoor(mapGroup, -15, 1.52, 0);
    addCasbahUpperWindow(mapGroup, -27, 4.5, 1.52, 0);
    addCasbahUpperWindow(mapGroup, -21.98, 4.5, -2.25, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -18.02, 4.5, -2.25, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -32.02, 4.5, -2.25, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -27, 4.6, -6.02, Math.PI);
    addCasbahUpperWindow(mapGroup, -15, 4.6, -6.02, Math.PI);

    // East Alleys (3 parallel narrow streets + cross alleys leading to Site A)
    addCasbahBuilding(mapGroup, 16, 24, -10, 6, 7.7, true);   // B_NE_MID1
    addCasbahBuilding(mapGroup, 28, 32, -10, 6, 7.4, false);  // B_NE_MID2
    addCasbahHouseDoor(mapGroup, 20, 6.02, 0);
    addCasbahHouseDoor(mapGroup, 24.02, -2, Math.PI / 2);
    addCasbahHouseDoor(mapGroup, 15.98, -2, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 20, 4.7, 6.02, 0);
    addCasbahUpperWindow(mapGroup, 20, 4.7, -10.02, Math.PI);
    addCasbahUpperWindow(mapGroup, 24.02, 4.5, 1.5, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 24.02, 4.5, -5.5, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 27.98, 4.5, -2, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 32.02, 4.5, -2, Math.PI / 2);
    addCrate(mapGroup, 21.5, 0, 14.5, 1.65);

    // ==========================================
    // 7. UPPER MID PLAZA & SITE A / B DIVIDING WALLS
    // ==========================================
    addCasbahBuilding(mapGroup, -12, -8, -16, -10, 7.4, false); // B_MB1
    addCasbahBuilding(mapGroup, -12, -8, -30, -20, 7.8, true);  // B_MB2
    addCasbahBuilding(mapGroup, 8, 12, -16, -10, 7.4, true);    // B_MA1
    addCasbahBuilding(mapGroup, 8, 12, -30, -20, 7.8, false);   // B_MA2

    // Sabat Arches over Upper Mid -> Site A & Site B connectors (Z: -20..-16)
    addSabatArchway(mapGroup, -10, -18, 4.0, 4.0, 'z');
    addSabatArchway(mapGroup, 10, -18, 4.0, 4.0, 'z');
    addCasbahLantern(mapGroup, -10, 3.65, -18, true);
    addCasbahLantern(mapGroup, 10, 3.65, -18, true);

    // Upper Mid Plaza Combat Cover
    addCrate(mapGroup, -3.5, 0, -22, 1.7);
    addCrate(mapGroup, 3.5, 0, -22, 1.7);

    // ==========================================
    // 8. SITE A & SITE B WIDE CONVERGENCE PLAZAS
    // ==========================================
    // Site A (Eastern Wide Plaza): fountain/monumental 4-leaf door + tactical crates
    addQuadrupleCasbahDoor(mapGroup, 35.96, -23, -Math.PI / 2); // Grand 4-leaf traditional door on East wall!
    addCasbahUpperWindow(mapGroup, 35.98, 5.2, -17.5, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 35.98, 5.2, -28.5, -Math.PI / 2);
    addCasbahUpperWindow(mapGroup, 12.02, 4.7, -25, Math.PI / 2);
    addCrate(mapGroup, 19.5, 0, -20.5, 1.8);
    addCrate(mapGroup, 27.5, 0, -26.5, 1.85);
    addCrate(mapGroup, 27.5, 1.85, -26.5, 1.35);

    // Site B (Western Wide Plaza): fountain + monumental 4-leaf door + tactical crates
    addQuadrupleCasbahDoor(mapGroup, -35.96, -23, Math.PI / 2); // Grand 4-leaf traditional door on West wall!
    addCasbahUpperWindow(mapGroup, -35.98, 5.2, -17.5, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -35.98, 5.2, -28.5, Math.PI / 2);
    addCasbahUpperWindow(mapGroup, -12.02, 4.7, -25, -Math.PI / 2);
    addCasbahFountain(mapGroup, -19.2, -26.5);
    addCrate(mapGroup, -28.5, 0, -20.5, 1.85);
    addCrate(mapGroup, -28.5, 0, -26.8, 1.7);

    // ==========================================
    // 9. NORTH SWAT SPAWN BLOCKS & OPEN 4-LEAF GATEWAY
    // ==========================================
    addCasbahBuilding(mapGroup, -32, -22, -40, -34, 7.6, true);   // B_NW_CT
    addCasbahBuilding(mapGroup, -18, -3.1, -40, -34, 7.9, false); // B_NCW_CT (flush with gate pier)
    addCasbahBuilding(mapGroup, 3.1, 18, -40, -34, 7.9, true);    // B_NCE_CT (flush with gate pier)
    addCasbahBuilding(mapGroup, 22, 32, -40, -34, 7.6, false);    // B_NE_CT

    // Open Grand 4-Leaf Casbah Portal at CT-Mid Entrance (X: -3..+3, Z = -37)
    addQuadrupleOpenArchGate(mapGroup, 0, -37, 0);
    // Additional Grand Closed 4-Leaf Portal on South Perimeter Wall behind T-Spawn
    addQuadrupleCasbahDoor(mapGroup, 0, 47.96, Math.PI);

    // North Facade Windows & Doors
    addCasbahHouseDoor(mapGroup, -10.5, -40.02, Math.PI);
    addCasbahHouseDoor(mapGroup, 10.5, -40.02, Math.PI);
    addCasbahUpperWindow(mapGroup, -27, 4.6, -40.02, Math.PI);
    addCasbahUpperWindow(mapGroup, -10.5, 4.8, -40.02, Math.PI);
    addCasbahUpperWindow(mapGroup, 10.5, 4.8, -40.02, Math.PI);
    addCasbahUpperWindow(mapGroup, 27, 4.6, -40.02, Math.PI);
    addCasbahUpperWindow(mapGroup, -10.5, 4.7, -33.98, 0);
    addCasbahUpperWindow(mapGroup, 10.5, 4.7, -33.98, 0);

    // ==========================================
    // 10. FLOOR BOMBSITE MARKINGS (A & B)
    // ==========================================
    const makeSiteRing = (x: number, z: number, letter: string) => {
      const ringGeo = new THREE.RingGeometry(siteA.radius - 0.35, siteA.radius, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xdc2626,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.04, z);
      mapGroup.add(ring);

      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 96px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, 64, 64);
      const lTex = new THREE.CanvasTexture(canvas);
      lTex.colorSpace = THREE.SRGBColorSpace;
      const letterPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.8, 3.8),
        new THREE.MeshBasicMaterial({
          map: lTex,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        })
      );
      letterPlane.rotation.x = -Math.PI / 2;
      letterPlane.position.set(x, 0.05, z);
      mapGroup.add(letterPlane);
    };

    makeSiteRing(siteA.center.x, siteA.center.z, 'A');
    makeSiteRing(siteB.center.x, siteB.center.z, 'B');

    scene.add(mapGroup);
    return mapGroup;
  };

  return {
    id: 'casbah',
    name: 'Al-Casbah',
    nameAr: 'حي القصبة',
    descriptionAr:
      'أزقة ضيقة متشابكة بطابع القصبة العتيقة، ساحات اشتباك وسطى، سوق خضار تقليدي، وأبواب رباعية وجدارية العلم الجزائري القديمة',
    skyColor: 0xc8dff2,
    fogColor: 0xe6d5bc,
    lightColor: 0xffe4b8,
    groundColor: 0xa6947a,
    defaultGroundSurface: 'concrete',
    lightingProfile: {
      sunPosition: [34, 42, 26],
      sunIntensity: 2.25,
      hemiIntensity: 0.62,
      envIntensity: 0.25,
      fogNear: 56,
      fogFar: 190,
      exposure: 1.06
    },
    tSpawns,
    ctSpawns,
    siteA,
    siteB,
    navNodes,
    colliders,
    ramps,
    buildScene
  };
}
