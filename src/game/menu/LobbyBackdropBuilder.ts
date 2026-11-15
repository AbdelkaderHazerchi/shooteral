import * as THREE from 'three';
import { WEAPONS } from '../weapons/WeaponData';
import { buildInspectWeaponModel } from '../weapons/WeaponViewmodelBuilder';

export interface BuiltLobbyBackdrop {
  group: THREE.Group;
  textures: THREE.Texture[];
  disposeExtras: () => void;
}

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createWoodCrateTexture(maxAniso: number, textures: THREE.Texture[], variant: 'oak' | 'pine' = 'oak'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rnd = makeRng(variant === 'oak' ? 9123 : 4581);

  const baseTone = variant === 'oak' ? '#8c5d34' : '#a87b4c';
  ctx.fillStyle = baseTone;
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal wooden plank boards with grain & seams
  const plankCount = 6;
  const plankH = 512 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const py = p * plankH;
    const shade = (rnd() - 0.5) * 22;
    const r = Math.min(255, Math.max(40, (variant === 'oak' ? 138 : 168) + shade));
    const g = Math.min(255, Math.max(30, (variant === 'oak' ? 92 : 122) + shade * 0.7));
    const b = Math.min(255, Math.max(20, (variant === 'oak' ? 50 : 74) + shade * 0.45));
    ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    ctx.fillRect(0, py + 2, 512, plankH - 4);

    // Fine wood fiber streaks
    for (let k = 0; k < 28; k++) {
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(42, 22, 10, 0.16)' : 'rgba(235, 195, 145, 0.1)';
      ctx.lineWidth = 1 + rnd() * 2;
      const ly = py + 4 + rnd() * (plankH - 8);
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.bezierCurveTo(170, ly + (rnd() - 0.5) * 6, 340, ly + (rnd() - 0.5) * 6, 512, ly);
      ctx.stroke();
    }

    // Plank separation gap
    ctx.fillStyle = 'rgba(25, 14, 7, 0.65)';
    ctx.fillRect(0, py, 512, 3);
  }

  // Outer perimeter wooden battens
  ctx.strokeStyle = variant === 'oak' ? '#6e4523' : '#855c34';
  ctx.lineWidth = 44;
  ctx.strokeRect(22, 22, 468, 468);

  // Inner edge shadow around battens
  ctx.strokeStyle = 'rgba(20, 10, 5, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(44, 44, 424, 424);

  // Diagonal cross brace slat
  ctx.save();
  ctx.strokeStyle = variant === 'oak' ? '#7a4d28' : '#94673b';
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(36, 476);
  ctx.lineTo(476, 36);
  ctx.stroke();
  ctx.restore();

  // Metal corner nail heads
  ctx.fillStyle = '#2b2f36';
  const nailPts = [
    [22, 22], [490, 22], [22, 490], [490, 490],
    [256, 22], [256, 490], [22, 256], [490, 256]
  ];
  for (const [nx, ny] of nailPts) {
    ctx.beginPath();
    ctx.arc(nx, ny, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stenciled cargo marking
  ctx.fillStyle = 'rgba(25, 18, 12, 0.58)';
  ctx.font = 'bold 34px monospace';
  ctx.fillText(variant === 'oak' ? '7.62 // AMMO' : 'FRAG // LOT-4', 120, 270);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  textures.push(tex);
  return tex;
}

function createWarehouseBrickTexture(maxAniso: number, textures: THREE.Texture[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rnd = makeRng(7711);

  ctx.fillStyle = '#38302c';
  ctx.fillRect(0, 0, 512, 512);

  const rows = 16;
  const cols = 8;
  const bh = 512 / rows;
  const bw = 512 / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + offset;
      const y = r * bh;
      const tone = rnd();
      const red = Math.round(78 + tone * 34);
      const green = Math.round(46 + tone * 22);
      const blue = Math.round(38 + tone * 18);
      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }

  // Grime & aging streaks
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(15, 12, 10, 0.16)' : 'rgba(160, 130, 105, 0.06)';
    ctx.fillRect(rnd() * 512, rnd() * 512, 4, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  textures.push(tex);
  return tex;
}

function createCorrugatedMetalTexture(maxAniso: number, textures: THREE.Texture[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rnd = makeRng(3301);

  for (let x = 0; x < 512; x += 16) {
    const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, '#3a414a');
    grad.addColorStop(0.45, '#66717e');
    grad.addColorStop(0.55, '#6a7480');
    grad.addColorStop(1, '#2b3139');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 16, 512);
  }

  // Subtle rust patches
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(${115 + Math.round(rnd() * 40)}, ${56 + Math.round(rnd() * 20)}, 28, ${0.08 + rnd() * 0.18})`;
    ctx.beginPath();
    ctx.arc(rnd() * 512, rnd() * 512, 6 + rnd() * 22, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  textures.push(tex);
  return tex;
}

function createWarehouseConcreteTexture(maxAniso: number, textures: THREE.Texture[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rnd = makeRng(5521);

  ctx.fillStyle = '#36322e';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = 'rgba(18, 15, 12, 0.45)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  for (let i = 0; i < 4500; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255, 235, 210, 0.04)' : 'rgba(10, 8, 6, 0.14)';
    ctx.fillRect(rnd() * 512, rnd() * 512, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  textures.push(tex);
  return tex;
}

function createSwatDepotFloorTexture(maxAniso: number, textures: THREE.Texture[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rnd = makeRng(8842);

  ctx.fillStyle = '#1f2836';
  ctx.fillRect(0, 0, 512, 512);

  // Industrial epoxy tile seams
  ctx.strokeStyle = 'rgba(10, 16, 26, 0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Subtle tactical safety stripes on edge
  ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.fillRect(0, 246, 512, 8);

  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(180, 215, 255, 0.035)' : 'rgba(8, 12, 18, 0.1)';
    ctx.fillRect(rnd() * 512, rnd() * 512, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  textures.push(tex);
  return tex;
}

function createArmoryWallPanelTexture(maxAniso: number, textures: THREE.Texture[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#253142';
  ctx.fillRect(0, 0, 512, 512);

  // Modular armored wall panel seams + rivets
  ctx.strokeStyle = '#141c27';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 504);
  ctx.strokeRect(260, 4, 248, 504);

  // Pegboard / tactical rail vents
  ctx.fillStyle = '#18212e';
  for (let y = 70; y < 440; y += 22) {
    ctx.fillRect(36, y, 184, 6);
    ctx.fillRect(292, y, 184, 6);
  }

  // Cyan tactical unit stripe
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(4, 34, 504, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  textures.push(tex);
  return tex;
}

function createTableMatTexture(maxAniso: number, textures: THREE.Texture[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b222c';
  ctx.fillRect(0, 0, 512, 256);

  // Armorers rubber grid mat
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  ctx.lineWidth = 1.5;
  for (let x = 24; x < 490; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 16);
    ctx.lineTo(x, 240);
    ctx.stroke();
  }
  for (let y = 16; y < 245; y += 24) {
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(488, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(248, 250, 252, 0.28)';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 488, 232);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  textures.push(tex);
  return tex;
}

/**
 * Multi-part Wooden Cargo Crate (plank body + corner wood framing + metal brackets)
 * Grounded at bottom-center (y = 0).
 */
function buildDetailedWoodenCrate(
  w: number,
  h: number,
  d: number,
  woodMat: THREE.Material,
  battenMat: THREE.Material,
  bracketMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();

  const core = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat);
  core.position.y = h * 0.5;
  core.castShadow = true;
  core.receiveShadow = true;
  g.add(core);

  // Top & bottom perimeter raised wooden rails
  const railH = Math.min(0.08, h * 0.14);
  const railT = 0.035;
  const addRail = (rw: number, rh: number, rd: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), battenMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  // Horizontal frame bars
  for (const sy of [railH * 0.5, h - railH * 0.5]) {
    addRail(w + 0.02, railH, railT, 0, sy, d * 0.5 + railT * 0.4);
    addRail(w + 0.02, railH, railT, 0, sy, -d * 0.5 - railT * 0.4);
    addRail(railT, railH, d + 0.02, w * 0.5 + railT * 0.4, sy, 0);
    addRail(railT, railH, d + 0.02, -w * 0.5 - railT * 0.4, sy, 0);
  }

  // 4 Vertical Corner Posts + Steel Corner Straps
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addRail(railT * 1.4, h, railT * 1.4, sx * (w * 0.5), h * 0.5, sz * (d * 0.5));
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), bracketMat);
      strap.position.set(sx * (w * 0.5), h - 0.04, sz * (d * 0.5));
      g.add(strap);
    }
  }

  return g;
}

/**
 * Multi-part Wooden Shipping Pallet grounded at y = 0.
 */
function buildWoodenPallet(
  w: number,
  d: number,
  woodMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  for (const sz of [-d * 0.42, 0, d * 0.42]) {
    const runner = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.09), woodMat);
    runner.position.set(0, 0.03, sz);
    runner.receiveShadow = true;
    g.add(runner);
  }
  const slats = 5;
  for (let i = 0; i < slats; i++) {
    const sx = -w * 0.44 + (i / (slats - 1)) * (w * 0.88);
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, d), woodMat);
    slat.position.set(sx, 0.0725, 0);
    slat.receiveShadow = true;
    slat.castShadow = true;
    g.add(slat);
  }
  return g;
}

/**
 * Multi-part Ribbed Industrial Fuel Barrel grounded at y = 0.
 */
function buildFuelDrum(colorHex: number, rimMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.48,
    metalness: 0.55
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.88, 18), bodyMat);
  body.position.y = 0.44;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // 3 Raised Structural Steel Rolling Hoops
  for (const hy of [0.06, 0.32, 0.58, 0.84]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.014, 8, 22), rimMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = hy;
    g.add(hoop);
  }

  // Top filler bung cap
  const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), rimMat);
  bung.position.set(0.12, 0.89, 0.08);
  g.add(bung);
  return g;
}

/**
 * Multi-part Realistic Tactical Grenades (HE or Smoke) for display tables/crates.
 */
function buildDisplayGrenade(type: 'he' | 'smoke'): THREE.Group {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x3f4652, roughness: 0.35, metalness: 0.82 });
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.25, metalness: 0.9 });

  if (type === 'he') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b4d2b, roughness: 0.55, metalness: 0.35 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), bodyMat);
    body.scale.set(1, 1.15, 1);
    body.position.y = 0.06;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 18), bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.085;
    const fuze = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.032, 10), steelMat);
    fuze.position.y = 0.125;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.065, 0.014), steelMat);
    lever.position.set(0.025, 0.095, 0);
    lever.rotation.z = -0.25;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0025, 6, 14), pinMat);
    ring.position.set(-0.022, 0.125, 0);
    g.add(body, band, fuze, lever, ring);
  } else {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.48, metalness: 0.52 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.38, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 14), bodyMat);
    body.position.y = 0.075;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0415, 0.0415, 0.03, 14), stripeMat);
    stripe.position.y = 0.105;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.025, 12), steelMat);
    cap.position.y = 0.16;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0025, 6, 14), pinMat);
    ring.position.set(-0.022, 0.158, 0);
    g.add(body, stripe, cap, ring);
  }
  return g;
}

/**
 * Builds an illuminated Special Forces Locker Bay containing a complete hanging SWAT Squad Uniform
 * (Tactical Ripstop Combat Shirt, Molle Plate Carrier Vest, Belt & Trousers, Ballistic Helmet & Boots).
 */
function buildSwatUniformLocker(
  unitIndex: number,
  frameMat: THREE.Material,
  darkInteriorMat: THREE.Material,
  fabricMat: THREE.Material,
  vestMat: THREE.Material,
  armorTrimMat: THREE.Material,
  visorMat: THREE.Material
): THREE.Group {
  const locker = new THREE.Group();
  const W = 0.92;
  const H = 2.48;
  const D = 0.68;

  // Back Panel, Top, Bottom & Side Walls
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.04), darkInteriorMat);
  back.position.set(0, H * 0.5, -D * 0.5 + 0.02);
  back.receiveShadow = true;

  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.04, H, D), frameMat);
  sideL.position.set(-W * 0.5 + 0.02, H * 0.5, 0);
  sideL.castShadow = true;
  sideL.receiveShadow = true;

  const sideR = sideL.clone();
  sideR.position.x = W * 0.5 - 0.02;

  const topRoof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), frameMat);
  topRoof.position.set(0, H - 0.025, 0);

  const bottomFloor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, D), frameMat);
  bottomFloor.position.set(0, 0.04, 0);

  // Upper Gear Shelf (at y = 1.92)
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.03, D - 0.08), frameMat);
  shelf.position.set(0, 1.92, -0.02);

  // Overhead Locker LED Light Strip illuminating the hanging uniform
  const ledStrip = new THREE.Mesh(
    new THREE.BoxGeometry(W - 0.16, 0.02, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xbae6fd })
  );
  ledStrip.position.set(0, 1.89, 0.16);

  // Hanging Steel Coat Rod
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, W - 0.1, 8), armorTrimMat);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, 1.78, 0);

  locker.add(back, sideL, sideR, topRoof, bottomFloor, shelf, ledStrip, rod);

  // ---- HELMET & NVG MOUNT ON UPPER SHELF ----
  const helmetShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    vestMat
  );
  helmetShell.position.set(-0.14, 1.95, 0.04);
  const goggle = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.065, 0.08), visorMat);
  goggle.position.set(-0.14, 2.02, 0.15);
  const radioBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), armorTrimMat);
  radioBox.position.set(0.2, 2.0, 0.02);
  locker.add(helmetShell, goggle, radioBox);

  // ---- HANGING SWAT UNIFORM & PLATE CARRIER VEST ----
  const hangerHook = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), armorTrimMat);
  hangerHook.position.set(0, 1.74, 0);
  const hangerBar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.025, 0.03), armorTrimMat);
  hangerBar.position.set(0, 1.69, 0);

  // Combat Shirt Torso + Shoulders + Sleeves
  const torsoShirt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.2), fabricMat);
  torsoShirt.position.set(0, 1.4, 0);
  torsoShirt.castShadow = true;

  const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.5, 10), fabricMat);
  sleeveL.position.set(-0.27, 1.38, 0.01);
  sleeveL.rotation.z = 0.14;
  const sleeveR = sleeveL.clone();
  sleeveR.position.x = 0.27;
  sleeveR.rotation.z = -0.14;

  // Heavy Kevlar Plate Carrier Vest + Shoulder Pads + Mag Pouches + Cyan SWAT Insignia
  const vestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.24), vestMat);
  vestPlate.position.set(0, 1.42, 0.01);
  vestPlate.castShadow = true;

  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.04, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0369a1, emissiveIntensity: 0.7 })
  );
  badge.position.set(0, 1.54, 0.132);

  // 3 Triple Rifle Magazine Pouches on Lower Vest
  for (let m = -1; m <= 1; m++) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.14, 0.055), armorTrimMat);
    pouch.position.set(m * 0.105, 1.3, 0.145);
    locker.add(pouch);
  }

  // Tactical Belt & Combat Trousers Hanging Below
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.22), armorTrimMat);
  belt.position.set(0, 1.11, 0);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.72, 10), fabricMat);
  legL.position.set(-0.11, 0.72, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;

  // Tactical Knee Pads on Trousers
  const kneeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.35 });
  const kneeL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.06), kneeMat);
  kneeL.position.set(-0.11, 0.72, 0.08);
  const kneeR = kneeL.clone();
  kneeR.position.x = 0.11;

  // Combat Boots Sitting on Locker Floor
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.28), kneeMat);
  bootL.position.set(-0.13, 0.15, 0.06);
  const bootR = bootL.clone();
  bootR.position.x = 0.13;

  locker.add(
    hangerHook,
    hangerBar,
    torsoShirt,
    sleeveL,
    sleeveR,
    vestPlate,
    badge,
    belt,
    legL,
    legR,
    kneeL,
    kneeR,
    bootL,
    bootR
  );

  // Subtle side door frame lip + unit badge plaque
  const topPlaque = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.09, 0.03),
    new THREE.MeshStandardMaterial({
      color: unitIndex % 2 === 0 ? 0x0284c7 : 0x1e3a8a,
      roughness: 0.4,
      metalness: 0.4
    })
  );
  topPlaque.position.set(0, H - 0.14, D * 0.5 - 0.01);
  locker.add(topPlaque);

  return locker;
}

/**
 * Builds the themed 3D Lobby Backdrop matching the player's chosen team:
 * - GANG: Well-lit Abandoned Warehouse Hideout packed with wooden crates, pallets, oil drums, contraband bench, C4 & brick walls.
 * - SWAT: Special Forces Armory & Gear Depot with an organized Weapons/Grenades display workbench and illuminated Squad Uniform Lockers in the back.
 */
export function buildLobbyBackdrop(
  team: 'gang' | 'swat',
  maxAnisotropy: number
): BuiltLobbyBackdrop {
  const root = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const disposableModels: THREE.Object3D[] = [];

  if (team === 'gang') {
    // =========================================================================
    // GANG HIDEOUT: WELL-LIT ABANDONED WAREHOUSE WITH WOODEN CRATES & CONTRABAND
    // =========================================================================
    const floorTex = createWarehouseConcreteTexture(maxAnisotropy, textures);
    const brickTex = createWarehouseBrickTexture(maxAnisotropy, textures);
    const corrugatedTex = createCorrugatedMetalTexture(maxAnisotropy, textures);
    const oakTex = createWoodCrateTexture(maxAnisotropy, textures, 'oak');
    const pineTex = createWoodCrateTexture(maxAnisotropy, textures, 'pine');

    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.88, metalness: 0.1 });
    const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9, metalness: 0.05 });
    const corrugatedMat = new THREE.MeshStandardMaterial({ map: corrugatedTex, roughness: 0.55, metalness: 0.6 });
    const oakMat = new THREE.MeshStandardMaterial({ map: oakTex, roughness: 0.78, metalness: 0.06 });
    const pineMat = new THREE.MeshStandardMaterial({ map: pineTex, roughness: 0.75, metalness: 0.06 });
    const battenMat = new THREE.MeshStandardMaterial({ color: 0x6b4221, roughness: 0.85, metalness: 0.05 });
    const rustSteelMat = new THREE.MeshStandardMaterial({ color: 0x3b3532, roughness: 0.55, metalness: 0.75 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x26292f, roughness: 0.52, metalness: 0.78 });

    // Warehouse concrete slab floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);

    // Back Warehouse Brick & Corrugated Steel Walls (framing the hideout)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(16, 4.8, 0.4), brickMat);
    backWall.position.set(0.4, 2.4, -5.6);
    backWall.receiveShadow = true;
    root.add(backWall);

    // Corrugated steel wainscoting along lower back wall & right wing wall
    const lowerSheet = new THREE.Mesh(new THREE.BoxGeometry(16, 1.55, 0.12), corrugatedMat);
    lowerSheet.position.set(0.4, 0.775, -5.36);
    lowerSheet.receiveShadow = true;
    root.add(lowerSheet);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.8, 12), brickMat);
    rightWall.position.set(5.4, 2.4, -1.2);
    rightWall.receiveShadow = true;
    root.add(rightWall);

    // Industrial High Clerestory Lit Windows on Back Wall (warm golden daylight streaming in)
    const winGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd599 });
    for (const wx of [-1.2, 1.6, 4.0]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.95, 0.18), beamMat);
      frame.position.set(wx, 3.25, -5.38);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.78), winGlowMat);
      pane.position.set(wx, 3.25, -5.28);
      // Steel window bars
      for (const bx of [-0.45, 0, 0.45]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6), beamMat);
        bar.position.set(wx + bx, 3.25, -5.25);
        root.add(bar);
      }
      root.add(frame, pane);
    }

    // Heavy Steel I-Beam Pillars & Roof Trusses
    for (const px of [-2.6, 0.3, 3.1, 5.1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.8, 0.3), beamMat);
      pillar.position.set(px, 2.4, -5.25);
      pillar.castShadow = true;
      root.add(pillar);
    }
    const overheadTruss = new THREE.Mesh(new THREE.BoxGeometry(14, 0.24, 0.28), beamMat);
    overheadTruss.position.set(1.0, 4.15, -3.2);
    root.add(overheadTruss);

    // Hanging Warm Industrial Work Lamps
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe4b5 });
    for (const lx of [-0.6, 2.25]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), beamMat);
      cord.position.set(lx, 3.7, -3.2);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 14, 1, true), beamMat);
      shade.position.set(lx, 3.22, -3.2);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bulbMat);
      bulb.position.set(lx, 3.15, -3.2);
      root.add(cord, shade, bulb);
    }

    // ---- STACKED WOODEN CRATES (RIGHT SIDE - PROMINENTLY ABOVE DOCK) ----
    const palletR = buildWoodenPallet(2.4, 1.5, battenMat);
    palletR.position.set(2.35, 0, -2.9);
    palletR.rotation.y = -0.18;
    root.add(palletR);

    const crateR1 = buildDetailedWoodenCrate(1.12, 0.96, 1.05, oakMat, battenMat, rustSteelMat);
    crateR1.position.set(1.9, 0.085, -2.85);
    crateR1.rotation.y = -0.14;
    root.add(crateR1);

    const crateR2 = buildDetailedWoodenCrate(0.95, 0.88, 0.95, pineMat, battenMat, rustSteelMat);
    crateR2.position.set(3.05, 0.085, -3.05);
    crateR2.rotation.y = 0.22;
    root.add(crateR2);

    // Stacked Upper Wooden Crates (sit clearly in upper-right clear zone y = 1.05..2.0!)
    const crateRTop1 = buildDetailedWoodenCrate(0.84, 0.78, 0.84, pineMat, battenMat, rustSteelMat);
    crateRTop1.position.set(1.95, 1.045, -2.85);
    crateRTop1.rotation.y = 0.28;
    root.add(crateRTop1);

    const crateRTop2 = buildDetailedWoodenCrate(0.76, 0.72, 0.76, oakMat, battenMat, rustSteelMat);
    crateRTop2.position.set(3.02, 0.965, -3.12);
    crateRTop2.rotation.y = -0.32;
    root.add(crateRTop2);

    // ---- LEFT-REAR CRATE STACK & FUEL BARRELS ----
    const crateL1 = buildDetailedWoodenCrate(1.05, 0.95, 1.0, oakMat, battenMat, rustSteelMat);
    crateL1.position.set(-1.45, 0, -3.25);
    crateL1.rotation.y = 0.35;
    root.add(crateL1);

    const crateL2 = buildDetailedWoodenCrate(0.78, 0.72, 0.78, pineMat, battenMat, rustSteelMat);
    crateL2.position.set(-1.42, 0.95, -3.28);
    crateL2.rotation.y = -0.15;
    root.add(crateL2);

    const crateBack1 = buildDetailedWoodenCrate(1.25, 1.15, 1.1, oakMat, battenMat, rustSteelMat);
    crateBack1.position.set(-0.35, 0, -4.45);
    crateBack1.rotation.y = 0.08;
    root.add(crateBack1);

    const crateBack2 = buildDetailedWoodenCrate(0.9, 0.86, 0.9, pineMat, battenMat, rustSteelMat);
    crateBack2.position.set(-0.32, 1.15, -4.45);
    crateBack2.rotation.y = -0.24;
    root.add(crateBack2);

    // Red Hazard & Olive Steel Fuel Drums
    const drum1 = buildFuelDrum(0xb91c1c, rustSteelMat);
    drum1.position.set(-2.3, 0, -2.7);
    const drum2 = buildFuelDrum(0x4b5320, rustSteelMat);
    drum2.position.set(0.95, 0, -4.35);
    const drum3 = buildFuelDrum(0xc2410c, rustSteelMat);
    drum3.position.set(1.55, 0, -4.55);
    root.add(drum1, drum2, drum3);

    // Contraband Weapon & C4 Crate Display on Upper Right Crate Top (AK-47 + C4 Pack + HE Grenade!)
    const akDisplay = buildInspectWeaponModel(WEAPONS.ak47);
    akDisplay.group.scale.setScalar(1.18);
    akDisplay.group.rotation.set(Math.PI / 2, 0.25, 0.15);
    akDisplay.group.position.set(1.92, 1.855, -2.8);
    root.add(akDisplay.group);
    disposableModels.push(akDisplay.group);

    const c4Display = buildInspectWeaponModel(WEAPONS.c4);
    c4Display.group.scale.setScalar(1.3);
    c4Display.group.rotation.set(0, -0.35, 0);
    c4Display.group.position.set(2.96, 1.72, -3.06);
    root.add(c4Display.group);
    disposableModels.push(c4Display.group);

    // Extra well-balanced warm lights inside the abandoned warehouse
    const warehouseKeySpot = new THREE.SpotLight(0xffcb80, 14, 15, Math.PI / 3.2, 0.55, 1.1);
    warehouseKeySpot.position.set(2.15, 3.6, -2.5);
    warehouseKeySpot.target.position.set(2.2, 1.0, -3.0);
    root.add(warehouseKeySpot, warehouseKeySpot.target);

    const leftCrateFill = new THREE.PointLight(0xffb366, 6.5, 9, 1.2);
    leftCrateFill.position.set(-0.9, 2.35, -3.2);
    root.add(leftCrateFill);

    const backWallWash = new THREE.PointLight(0xfbbf24, 5.5, 12, 1.2);
    backWallWash.position.set(0.8, 2.8, -4.5);
    root.add(backWallWash);
  } else {
    // =========================================================================
    // SWAT DEPOT: SPECIAL FORCES ARMORY TABLE (WEAPONS + GRENADES) & UNIFORM LOCKERS
    // =========================================================================
    const floorTex = createSwatDepotFloorTexture(maxAnisotropy, textures);
    const wallTex = createArmoryWallPanelTexture(maxAnisotropy, textures);
    const tableMatTex = createTableMatTexture(maxAnisotropy, textures);

    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.25 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.52, metalness: 0.45 });
    const steelFrameMat = new THREE.MeshStandardMaterial({ color: 0x26303d, roughness: 0.36, metalness: 0.82 });
    const darkInteriorMat = new THREE.MeshStandardMaterial({ color: 0x151c26, roughness: 0.68, metalness: 0.42 });
    const rubberMat = new THREE.MeshStandardMaterial({ map: tableMatTex, roughness: 0.82, metalness: 0.08 });
    const swatFabricMat = new THREE.MeshStandardMaterial({ color: 0x1e3554, roughness: 0.84, metalness: 0.05 });
    const swatVestMat = new THREE.MeshStandardMaterial({ color: 0x17202b, roughness: 0.65, metalness: 0.18 });
    const armorTrimMat = new THREE.MeshStandardMaterial({ color: 0x3b4859, roughness: 0.42, metalness: 0.72 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.14, metalness: 0.85 });

    // Clean Tactical Depot Epoxy Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);

    // Armored Special Forces Depot Back & Side Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(16, 4.8, 0.4), wallMat);
    backWall.position.set(0.4, 2.4, -5.5);
    backWall.receiveShadow = true;
    root.add(backWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.8, 12), wallMat);
    rightWall.position.set(5.4, 2.4, -1.2);
    rightWall.receiveShadow = true;
    root.add(rightWall);

    // Ceiling Steel Beams + Cool White Overhead LED Light Panels
    const ledFixtureMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
    for (const bx of [-0.6, 2.15]) {
      const fixtureHousing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.34), steelFrameMat);
      fixtureHousing.position.set(bx, 3.65, -2.9);
      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.03, 0.24), ledFixtureMat);
      diffuser.position.set(bx, 3.59, -2.9);
      root.add(fixtureHousing, diffuser);
    }

    // ---- BACKGROUND SWAT SQUAD UNIFORMS IN ILLUMINATED ARMORY LOCKERS ----
    // Positioned at z = -4.75 across x = -1.15 .. +3.25 so squad gear is clearly visible behind operator & table
    const lockerPositionsX = [-1.15, -0.1, 0.95, 2.0, 3.05];
    lockerPositionsX.forEach((lx, idx) => {
      const locker = buildSwatUniformLocker(
        idx,
        steelFrameMat,
        darkInteriorMat,
        swatFabricMat,
        swatVestMat,
        armorTrimMat,
        visorMat
      );
      locker.position.set(lx, 0, -4.72);
      root.add(locker);
    });

    // Dedicated Locker Interior Wash Lights so every SWAT uniform & vest in the back is crisp and legible
    const lockerLightLeft = new THREE.PointLight(0xdbeafe, 8.5, 9, 1.1);
    lockerLightLeft.position.set(-0.3, 2.0, -3.7);
    const lockerLightRight = new THREE.PointLight(0xbae6fd, 8.5, 9, 1.1);
    lockerLightRight.position.set(2.3, 2.0, -3.7);
    root.add(lockerLightLeft, lockerLightRight);

    // ---- SPECIAL FORCES WEAPONS & GRENADES DISPLAY TABLE (Right-Rear, Raised Clearly Above Dock) ----
    const tableGroup = new THREE.Group();
    tableGroup.position.set(2.1, 0, -2.55);
    tableGroup.rotation.y = -0.34;

    const tblW = 2.45;
    const tblD = 1.02;
    const tblH = 1.1; // Tabletop height calibrated cleanly above bottom-right UI dock

    // Heavy Steel Frame Legs & Crossbars
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.075, tblH, 0.075), steelFrameMat);
        leg.position.set(sx * (tblW * 0.45), tblH * 0.5, sz * (tblD * 0.42));
        leg.castShadow = true;
        tableGroup.add(leg);
      }
    }
    const lowerShelf = new THREE.Mesh(new THREE.BoxGeometry(tblW - 0.14, 0.04, tblD - 0.14), steelFrameMat);
    lowerShelf.position.set(0, 0.36, 0);
    tableGroup.add(lowerShelf);

    // Pelican Hard Case on Lower Shelf
    const hardCase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.56), swatVestMat);
    hardCase.position.set(-0.5, 0.49, 0);
    tableGroup.add(hardCase);

    // Heavy Brushed Steel Tabletop + Blue-Grid Armorer Mat
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(tblW, 0.065, tblD), steelFrameMat);
    tableTop.position.set(0, tblH, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    tableGroup.add(tableTop);

    const armorerMat = new THREE.Mesh(new THREE.BoxGeometry(tblW - 0.12, 0.012, tblD - 0.12), rubberMat);
    armorerMat.position.set(0, tblH + 0.036, 0);
    armorerMat.receiveShadow = true;
    tableGroup.add(armorerMat);

    // Angled Polymer Rifle Display Stands + Actual 3D Weapons Mounted Neatly!
    const standMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.4 });
    const mountWeaponOnTable = (
      weaponId: string,
      x: number,
      z: number,
      scale: number,
      tiltX: number,
      yaw: number,
      liftY: number
    ) => {
      // Cradle base + 2 upright V-yokes
      const cradleBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.12), standMat);
      cradleBase.position.set(x, tblH + 0.052, z);
      cradleBase.rotation.y = yaw;
      const yokeL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.07), standMat);
      yokeL.position.set(-0.14, 0.07, 0);
      const yokeR = yokeL.clone();
      yokeR.position.x = 0.14;
      cradleBase.add(yokeL, yokeR);
      tableGroup.add(cradleBase);

      const built = buildInspectWeaponModel(WEAPONS[weaponId]);
      built.group.scale.setScalar(scale);
      built.group.rotation.set(tiltX, yaw, 0);
      built.group.position.set(x, tblH + 0.16 + liftY, z);
      tableGroup.add(built.group);
      disposableModels.push(built.group);
    };

    // Neatly arranged Primary Rifles & Sidearms along the armory workbench
    mountWeaponOnTable('m4a1', -0.72, -0.18, 1.15, -0.22, 0.04, 0.03);
    mountWeaponOnTable('awp', 0.24, -0.2, 1.1, -0.22, -0.02, 0.04);
    mountWeaponOnTable('mp5', -0.72, 0.22, 1.15, -0.16, 0.06, 0.0);

    // Sidearms neatly displayed side-by-side in front-center foam tray
    const pistolTray = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.022, 0.34), standMat);
    pistolTray.position.set(0.05, tblH + 0.052, 0.23);
    tableGroup.add(pistolTray);

    const uspModel = buildInspectWeaponModel(WEAPONS.usp);
    uspModel.group.scale.setScalar(1.05);
    uspModel.group.rotation.set(Math.PI / 2 - 0.12, 0.15, 0);
    uspModel.group.position.set(-0.08, tblH + 0.085, 0.23);
    tableGroup.add(uspModel.group);
    disposableModels.push(uspModel.group);

    const deagleModel = buildInspectWeaponModel(WEAPONS.deagle);
    deagleModel.group.scale.setScalar(1.05);
    deagleModel.group.rotation.set(Math.PI / 2 - 0.12, -0.15, 0);
    deagleModel.group.position.set(0.18, tblH + 0.085, 0.23);
    tableGroup.add(deagleModel.group);
    disposableModels.push(deagleModel.group);

    // Organized Grenade Ordnance Case Tray (Right end of table: 3 HE Grenades + 3 Smoke Grenades in neat grid!)
    const grenadeTray = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.045, 0.72), standMat);
    grenadeTray.position.set(0.84, tblH + 0.06, 0.02);
    tableGroup.add(grenadeTray);

    for (let i = 0; i < 3; i++) {
      const he = buildDisplayGrenade('he');
      he.position.set(0.69 + i * 0.15, tblH + 0.082, -0.14);
      tableGroup.add(he);

      const sm = buildDisplayGrenade('smoke');
      sm.position.set(0.69 + i * 0.15, tblH + 0.082, 0.18);
      tableGroup.add(sm);
    }

    // Back-Right Pegboard Rifle Rack next to table (shows extra carbines neatly racked vertically!)
    const gunRack = new THREE.Group();
    gunRack.position.set(3.45, 0, -3.7);
    gunRack.rotation.y = -0.55;
    const rackBack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.35, 0.08), steelFrameMat);
    rackBack.position.y = 1.175;
    const rackMat = new THREE.Mesh(new THREE.BoxGeometry(1.26, 2.15, 0.02), darkInteriorMat);
    rackMat.position.set(0, 1.18, 0.045);
    gunRack.add(rackBack, rackMat);
    for (let r = 0; r < 2; r++) {
      const ry = 1.32 + r * 0.44;
      for (const px of [-0.18, 0.18]) {
        const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), armorTrimMat);
        peg.rotation.x = Math.PI / 2;
        peg.position.set(px, ry - 0.05, 0.11);
        gunRack.add(peg);
      }
      const m4Wall = buildInspectWeaponModel(WEAPONS.m4a1);
      m4Wall.group.scale.setScalar(1.05);
      m4Wall.group.rotation.set(0, 0, 0.03);
      m4Wall.group.position.set(0, ry, 0.15);
      gunRack.add(m4Wall.group);
      disposableModels.push(m4Wall.group);
    }
    root.add(gunRack);

    root.add(tableGroup);

    // Crisp Overhead Armory Workbench SpotLight highlighting the weapons & grenades
    const tableSpot = new THREE.SpotLight(0xe0f2fe, 13, 12, Math.PI / 3.4, 0.45, 1.1);
    tableSpot.position.set(2.05, 3.35, -2.35);
    tableSpot.target.position.set(2.1, 1.15, -2.55);
    root.add(tableSpot, tableSpot.target);
  }

  return {
    group: root,
    textures,
    disposeExtras: () => {
      const disposedMats = new Set<THREE.Material>();
      const disposedGeos = new Set<THREE.BufferGeometry>();
      for (const obj of disposableModels) {
        obj.traverse((child) => {
          const m = child as THREE.Mesh;
          if (!m.isMesh) return;
          if (m.geometry && !disposedGeos.has(m.geometry)) {
            m.geometry.dispose();
            disposedGeos.add(m.geometry);
          }
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mt of mats) {
            if (mt && !disposedMats.has(mt)) {
              disposedMats.add(mt);
              const std = mt as THREE.MeshStandardMaterial;
              std.map?.dispose();
              std.bumpMap?.dispose();
              std.roughnessMap?.dispose();
              mt.dispose();
            }
          }
        });
      }
    }
  };
}
