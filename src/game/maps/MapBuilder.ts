import * as THREE from 'three';

export interface NavNode {
  id: string;
  pos: THREE.Vector3;
  connections: string[];
  isSiteA?: boolean;
  isSiteB?: boolean;
  isTSpawn?: boolean;
  isCTSpawn?: boolean;
  isChokepoint?: boolean;
  isPostPlant?: boolean;
  isSniperSpot?: boolean;
  coverAngle?: number; // radians to face when holding angle
}

export type SurfaceMaterial = 'concrete' | 'metal' | 'wood' | 'dirt';

export interface BoxCollider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  surface?: SurfaceMaterial;
}

export interface RampZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  startY: number;
  endY: number;
  axis: 'x' | 'z'; // direction along which height interpolates from startY (at min) to endY (at max)
}

export interface BombSiteZone {
  id: 'A' | 'B';
  name: string;
  nameAr: string;
  center: THREE.Vector3;
  radius: number;
}

export type MapId = 'citadel' | 'foundry' | 'harbor';

export interface MapLightingProfile {
  sunPosition: [number, number, number];
  sunIntensity: number;
  hemiIntensity: number;
  envIntensity: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
}

export interface MapData {
  id: MapId;
  name: string;
  nameAr: string;
  descriptionAr: string;
  skyColor: number;
  fogColor: number;
  lightColor: number;
  groundColor: number;
  defaultGroundSurface?: SurfaceMaterial;
  lightingProfile: MapLightingProfile;
  tSpawns: THREE.Vector3[];
  ctSpawns: THREE.Vector3[];
  siteA: BombSiteZone;
  siteB: BombSiteZone;
  navNodes: Record<string, NavNode>;
  colliders: BoxCollider[];
  ramps: RampZone[];
  buildScene: (scene: THREE.Scene) => THREE.Group;
}

/**
 * Helper to resolve ground floor/platform/ramp height under a position (x, z)
 * given the actor's current Y height so raised bombsites, catwalks, and stairs work seamlessly.
 */
export function getSurfaceHeightAt(
  x: number,
  z: number,
  currentY: number,
  colliders: BoxCollider[],
  ramps: RampZone[],
  actorRadius = 0.35
): number {
  let highest = 0;

  // Check walkable ramps
  for (const r of ramps) {
    if (x >= r.minX - 0.1 && x <= r.maxX + 0.1 && z >= r.minZ - 0.1 && z <= r.maxZ + 0.1) {
      const t =
        r.axis === 'z'
          ? THREE.MathUtils.clamp((z - r.minZ) / Math.max(0.01, r.maxZ - r.minZ), 0, 1)
          : THREE.MathUtils.clamp((x - r.minX) / Math.max(0.01, r.maxX - r.minX), 0, 1);
      const y = THREE.MathUtils.lerp(r.startY, r.endY, t);
      if (y <= currentY + 0.75 && y > highest) {
        highest = y;
      }
    }
  }

  // Check walkable platform / crate tops within step/fall threshold
  for (const c of colliders) {
    if (
      x + actorRadius > c.min.x &&
      x - actorRadius < c.max.x &&
      z + actorRadius > c.min.z &&
      z - actorRadius < c.max.z
    ) {
      if (c.max.y <= currentY + 0.55 && c.max.y > highest) {
        highest = c.max.y;
      }
    }
  }

  return highest;
}

export function getGroundSurfaceAt(
  x: number,
  z: number,
  currentY: number,
  colliders: BoxCollider[],
  defaultSurface: SurfaceMaterial = 'concrete',
  actorRadius = 0.35
): SurfaceMaterial {
  let highest = 0.05;
  let surface: SurfaceMaterial = defaultSurface;

  for (const c of colliders) {
    if (
      x + actorRadius > c.min.x &&
      x - actorRadius < c.max.x &&
      z + actorRadius > c.min.z &&
      z - actorRadius < c.max.z
    ) {
      if (c.max.y <= currentY + 0.55 && c.max.y > highest) {
        highest = c.max.y;
        surface = c.surface ?? defaultSurface;
      }
    }
  }

  return surface;
}

// Deterministic PRNG for consistent procedural surface grain
function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Procedural PBR Canvas Albedo Textures (SRGBColorSpace)
function createTileTexture(
  type:
    | 'sandstone_floor'
    | 'moroccan_wall'
    | 'wood_door'
    | 'concrete_floor'
    | 'metal_panel'
    | 'crate'
    | 'container'
    | 'hazard'
    | 'harbor_tarmac'
    | 'harbor_water'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(type.length * 9187 + type.charCodeAt(0) * 131);

  if (type === 'sandstone_floor') {
    ctx.fillStyle = '#cfa97a';
    ctx.fillRect(0, 0, 512, 512);
    // Cobblestone pavers & sandy grit
    ctx.strokeStyle = '#a88456';
    ctx.lineWidth = 3;
    for (let y = 0; y < 512; y += 64) {
      const offset = (y / 64) % 2 === 0 ? 0 : 32;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
      for (let x = offset; x < 512; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 64);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 4500; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(115,80,42,0.1)' : 'rgba(255,240,210,0.08)';
      ctx.fillRect(rand() * 512, rand() * 512, 3, 3);
    }
  } else if (type === 'moroccan_wall') {
    ctx.fillStyle = '#d9be94';
    ctx.fillRect(0, 0, 512, 512);
    // Top and bottom sandstone stone trim bands
    ctx.fillStyle = '#ad8858';
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillRect(0, 445, 512, 67);
    // Plaster blocks & subtle weathering
    ctx.strokeStyle = 'rgba(110,80,42,0.16)';
    ctx.lineWidth = 2;
    for (let y = 64; y < 445; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    for (let i = 0; i < 3500; i++) {
      ctx.fillStyle = 'rgba(85,60,30,0.06)';
      ctx.fillRect(rand() * 512, rand() * 512, 4, 4);
    }
  } else if (type === 'wood_door') {
    // Heavy Reinforced Wooden Door with steel crossbars
    ctx.fillStyle = '#6c492c';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#53351d';
    for (let x = 0; x < 512; x += 64) {
      ctx.fillRect(x, 0, 6, 512);
    }
    // Iron reinforcement bars
    ctx.fillStyle = '#2d3136';
    ctx.fillRect(0, 70, 512, 36);
    ctx.fillRect(0, 400, 512, 36);
    ctx.fillStyle = '#8b95a1';
    for (let x = 32; x < 512; x += 64) {
      ctx.beginPath();
      ctx.arc(x, 88, 6, 0, Math.PI * 2);
      ctx.arc(x, 418, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'concrete_floor') {
    ctx.fillStyle = '#9aa8b6';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#73818f';
    ctx.lineWidth = 4;
    for (let i = 0; i < 512; i += 128) {
      ctx.strokeRect(i, 0, 128, 512);
      ctx.strokeRect(0, i, 512, 128);
    }
    for (let i = 0; i < 3200; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(28,36,48,0.06)';
      ctx.fillRect(rand() * 512, rand() * 512, 3, 3);
    }
  } else if (type === 'metal_panel') {
    ctx.fillStyle = '#b4c4d4';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#9aaaba';
    for (let x = 0; x < 512; x += 64) {
      ctx.fillRect(x, 0, 28, 512);
    }
    // Yellow-black industrial trim stripe at base
    ctx.fillStyle = '#eab308';
    ctx.fillRect(0, 460, 512, 52);
    ctx.fillStyle = '#1f2937';
    for (let x = -64; x < 576; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 460);
      ctx.lineTo(x + 28, 460);
      ctx.lineTo(x + 56, 512);
      ctx.lineTo(x + 28, 512);
      ctx.fill();
    }
  } else if (type === 'crate') {
    ctx.fillStyle = '#99673c';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#5c3b1e';
    ctx.lineWidth = 28;
    ctx.strokeRect(14, 14, 484, 484);
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(14, 14);
    ctx.lineTo(498, 498);
    ctx.moveTo(498, 14);
    ctx.lineTo(14, 498);
    ctx.stroke();
    // Wood plank lines
    ctx.strokeStyle = 'rgba(40,24,10,0.22)';
    ctx.lineWidth = 2;
    for (let y = 64; y < 448; y += 64) {
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(484, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,20,10,0.55)';
    ctx.font = 'bold 44px monospace';
    ctx.fillText('OPS-CARGO', 132, 270);
  } else if (type === 'container') {
    ctx.fillStyle = '#ffffff'; // tinted by material color
    ctx.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 32) {
      ctx.fillStyle = x % 64 === 0 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, 0, 16, 512);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.34)';
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, 494, 494);
  } else if (type === 'hazard') {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#18181b';
    for (let i = -512; i < 1024; i += 96) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 48, 0);
      ctx.lineTo(i + 512 + 48, 512);
      ctx.lineTo(i + 512, 512);
      ctx.fill();
    }
  } else if (type === 'harbor_tarmac') {
    ctx.fillStyle = '#38414e';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#28303a';
    ctx.lineWidth = 4;
    for (let i = 0; i < 512; i += 128) {
      ctx.strokeRect(i, 0, 128, 512);
      ctx.strokeRect(0, i, 512, 128);
    }
    ctx.fillStyle = 'rgba(234, 179, 8, 0.22)';
    ctx.fillRect(0, 250, 512, 12);
    for (let i = 0; i < 3800; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(10,15,25,0.08)';
      ctx.fillRect(rand() * 512, rand() * 512, 3, 3);
    }
  } else if (type === 'harbor_water') {
    ctx.fillStyle = '#0d2238';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 16) {
      ctx.fillStyle = y % 32 === 0 ? 'rgba(56, 189, 248, 0.08)' : 'rgba(12, 74, 110, 0.14)';
      ctx.fillRect(0, y, 512, 8);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Linear Data Maps (Bump & Roughness) - MUST remain THREE.NoColorSpace
function createSurfaceDataTexture(
  kind:
    | 'sandstone_bump'
    | 'sandstone_roughness'
    | 'plaster_bump'
    | 'wood_bump'
    | 'concrete_bump'
    | 'concrete_roughness'
    | 'corrugated_bump'
    | 'corrugated_roughness'
    | 'water_bump'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(kind.length * 4129 + kind.charCodeAt(2) * 257);

  if (kind === 'sandstone_bump') {
    ctx.fillStyle = '#909090';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#383838';
    ctx.lineWidth = 3;
    for (let y = 0; y < 256; y += 32) {
      const off = (y / 32) % 2 === 0 ? 0 : 16;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
      for (let x = off; x < 256; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 32);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 2200; i++) {
      const v = Math.floor(110 + rand() * 75);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
  } else if (kind === 'sandstone_roughness') {
    // High roughness (215..252) ensures dry desert stone never shines like plastic
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      const v = Math.floor(215 + rand() * 38);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * 256, rand() * 256, 3, 3);
    }
  } else if (kind === 'plaster_bump') {
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 2;
    for (let y = 32; y < 224; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(105 + rand() * 70);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * 256, rand() * 256, 3, 2);
    }
  } else if (kind === 'wood_bump') {
    ctx.fillStyle = '#848484';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = '#404040';
      ctx.fillRect(0, y, 256, 2);
    }
    for (let i = 0; i < 650; i++) {
      const v = Math.floor(95 + rand() * 75);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * 256, rand() * 256, 12 + rand() * 28, 1);
    }
  } else if (kind === 'concrete_bump') {
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 3;
    for (let i = 0; i < 256; i += 64) {
      ctx.strokeRect(i, 0, 64, 256);
      ctx.strokeRect(0, i, 256, 64);
    }
    for (let i = 0; i < 2500; i++) {
      const v = Math.floor(108 + rand() * 68);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
  } else if (kind === 'concrete_roughness') {
    // Varied matte-to-satin traffic wear patches (180..242)
    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 120; i++) {
      const v = Math.floor(182 + rand() * 58);
      ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
      ctx.beginPath();
      ctx.arc(rand() * 256, rand() * 256, 6 + rand() * 16, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'corrugated_bump') {
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, '#383838');
      grad.addColorStop(0.5, '#d8d8d8');
      grad.addColorStop(1, '#383838');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 16, 256);
    }
  } else if (kind === 'corrugated_roughness') {
    // Ridges slightly shinier than recessed valleys
    ctx.fillStyle = '#a8a8a8';
    ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = x % 32 === 0 ? '#8c8c8c' : '#c0c0c0';
      ctx.fillRect(x + 3, 0, 10, 256);
    }
  } else if (kind === 'water_bump') {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x += 4) {
        const w =
          Math.sin((x / 256) * Math.PI * 8 + (y / 256) * Math.PI * 4) * 0.5 +
          Math.cos((y / 256) * Math.PI * 10 - (x / 256) * Math.PI * 2) * 0.5;
        const v = Math.floor(128 + w * 48);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 4, 1);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

const textures = {
  sandstoneFloor: createTileTexture('sandstone_floor'),
  moroccanWall: createTileTexture('moroccan_wall'),
  woodDoor: createTileTexture('wood_door'),
  concreteFloor: createTileTexture('concrete_floor'),
  metalPanel: createTileTexture('metal_panel'),
  crate: createTileTexture('crate'),
  container: createTileTexture('container'),
  hazard: createTileTexture('hazard'),
  harborTarmac: createTileTexture('harbor_tarmac'),
  harborWater: createTileTexture('harbor_water')
};

const dataTextures = {
  sandstoneBump: createSurfaceDataTexture('sandstone_bump'),
  sandstoneRoughness: createSurfaceDataTexture('sandstone_roughness'),
  plasterBump: createSurfaceDataTexture('plaster_bump'),
  woodBump: createSurfaceDataTexture('wood_bump'),
  concreteBump: createSurfaceDataTexture('concrete_bump'),
  concreteRoughness: createSurfaceDataTexture('concrete_roughness'),
  corrugatedBump: createSurfaceDataTexture('corrugated_bump'),
  corrugatedRoughness: createSurfaceDataTexture('corrugated_roughness'),
  waterBump: createSurfaceDataTexture('water_bump')
};

export function applyTextureAnisotropy(maxAnisotropy: number) {
  Object.values(textures).forEach((t) => {
    t.anisotropy = maxAnisotropy;
    t.needsUpdate = true;
  });
  Object.values(dataTextures).forEach((t) => {
    t.anisotropy = maxAnisotropy;
    t.needsUpdate = true;
  });
}

function addSprayDecal(
  group: THREE.Group,
  label: string,
  color: string,
  x: number,
  y: number,
  z: number,
  rotY: number,
  size = 2.6
) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.strokeRect(20, 20, 216, 216);

  ctx.fillStyle = color;
  ctx.font = 'bold 130px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 134);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  plane.position.set(x, y, z);
  plane.rotation.y = rotY;
  group.add(plane);
}

function addRampMesh(
  group: THREE.Group,
  ramps: RampZone[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  startY: number,
  endY: number,
  axis: 'x' | 'z',
  mat: THREE.Material
) {
  ramps.push({ minX, maxX, minZ, maxZ, startY, endY, axis });

  const w = maxX - minX;
  const d = maxZ - minZ;
  const dy = endY - startY;
  const len = axis === 'z' ? d : w;
  const hyp = Math.sqrt(len * len + dy * dy);
  const angle = Math.atan2(dy, len);

  const thickness = 0.28;
  const geo = axis === 'z' ? new THREE.BoxGeometry(w, thickness, hyp) : new THREE.BoxGeometry(hyp, thickness, d);
  const mesh = new THREE.Mesh(geo, mat);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const cy = (startY + endY) / 2 - thickness / 2;
  mesh.position.set(cx, cy, cz);

  if (axis === 'z') {
    mesh.rotation.x = -angle;
  } else {
    mesh.rotation.z = angle;
  }

  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
}

function inferSurfaceFromMaterial(mat: THREE.Material, fallback: SurfaceMaterial = 'concrete'): SurfaceMaterial {
  const std = mat as THREE.MeshStandardMaterial;
  if (std?.map) {
    if (std.map === textures.woodDoor || std.map === textures.crate) return 'wood';
    if (std.map === textures.metalPanel || std.map === textures.container || std.map === textures.hazard) return 'metal';
    if (std.map === textures.sandstoneFloor) return 'dirt';
    if (std.map === textures.concreteFloor || std.map === textures.moroccanWall || std.map === textures.harborTarmac) return 'concrete';
  }
  if (typeof std?.metalness === 'number' && std.metalness >= 0.38) return 'metal';
  return fallback;
}

// ==========================================================
// MAP 1: SAND BASTION (حصن الرمال)
// 3-Lane Tactical Citadel Geometry:
//   - Elevated T-Spawn Sniper Terrace overlooking Mid
//   - Long East Corridor + Double Doors + A Ramp -> Raised Bombsite A (y = 1.2)
//   - Middle Gates + Cargo Stack + Catwalk Stairs -> Site A
//   - West Roofed Archway Tunnels -> Fortified Bombsite B + B Window
// ==========================================================
export function getSandBastion(): MapData {
  const colliders: BoxCollider[] = [];
  const ramps: RampZone[] = [];

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
    castShadow = true
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
        surface: inferSurfaceFromMaterial(mat, 'concrete')
      });
    }
    return mesh;
  };

  // Shared dry matte timber crate material
  const crateMat = new THREE.MeshStandardMaterial({
    map: textures.crate,
    bumpMap: dataTextures.woodBump,
    bumpScale: 0.04,
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.16
  });

  const addCrate = (group: THREE.Group, x: number, y: number, z: number, s = 2.0, rot = 0) => {
    const m = addBox(group, s, s, s, x, y, z, crateMat);
    m.rotation.y = rot;
  };

  const addBarrel = (group: THREE.Group, x: number, y: number, z: number, color = 0xa93226) => {
    const barrelGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 1.35, 16),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.36,
        metalness: 0.65,
        envMapIntensity: 0.88
      })
    );
    body.position.y = 0.675;
    body.castShadow = true;
    body.receiveShadow = true;
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.28,
      metalness: 0.88,
      envMapIntensity: 0.95
    });
    const rim1 = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 8, 16).rotateX(Math.PI / 2), rimMat);
    rim1.position.y = 0.4;
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 8, 16).rotateX(Math.PI / 2), rimMat);
    rim2.position.y = 1.0;
    barrelGroup.add(body, rim1, rim2);
    barrelGroup.position.set(x, y, z);
    group.add(barrelGroup);

    colliders.push({
      min: new THREE.Vector3(x - 0.5, y, z - 0.5),
      max: new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5),
      surface: 'metal'
    });
  };

  const addPalmTree = (group: THREE.Group, x: number, z: number) => {
    const palm = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x6b4c30,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.14
    });
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.28 - i * 0.03, 0.32 - i * 0.03, 1.3, 8), trunkMat);
      seg.position.set(Math.sin(i * 0.15) * 0.25, 0.65 + i * 1.2, 0);
      seg.castShadow = true;
      seg.receiveShadow = true;
      palm.add(seg);
    }
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x3f7a2c,
      roughness: 0.84,
      metalness: 0.0,
      envMapIntensity: 0.18
    });
    for (let a = 0; a < 7; a++) {
      const ang = (a / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 2.8), leafMat);
      frond.position.set(Math.sin(ang) * 1.35 + 0.2, 7.6, Math.cos(ang) * 1.35);
      frond.rotation.y = ang;
      frond.rotation.x = 0.32;
      frond.castShadow = true;
      palm.add(frond);
    }
    palm.position.set(x, 0, z);
    group.add(palm);
  };

  // Spawns: T Spawn is elevated terrace at y = 1.0!
  const tSpawns: THREE.Vector3[] = [];
  const ctSpawns: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    tSpawns.push(new THREE.Vector3(-4.5 + col * 3.0, 1.0, 41 + row * 3.0));
    ctSpawns.push(new THREE.Vector3(-4.5 + col * 3.0, 0, -41 - row * 3.0));
  }

  const siteA: BombSiteZone = {
    id: 'A',
    name: 'Bombsite A',
    nameAr: 'الموقع A (منصة القلعة المرتفعة)',
    center: new THREE.Vector3(23, 1.2, -25),
    radius: 7.2
  };

  const siteB: BombSiteZone = {
    id: 'B',
    name: 'Bombsite B',
    nameAr: 'الموقع B (فناء النفق المحصن)',
    center: new THREE.Vector3(-23, 0, -24),
    radius: 7.2
  };

  const navNodes: Record<string, NavNode> = {
    // T Spawn & Balcony
    t_spawn: { id: 't_spawn', pos: new THREE.Vector3(0, 1.0, 42), connections: ['t_long_entry', 't_mid_entry', 't_b_entry'], isTSpawn: true, isSniperSpot: true },
    t_long_entry: { id: 't_long_entry', pos: new THREE.Vector3(16, 0, 35), connections: ['t_spawn', 'long_doors_outer'] },
    t_mid_entry: { id: 't_mid_entry', pos: new THREE.Vector3(0, 0, 27), connections: ['t_spawn', 'mid_courtyard'], isSniperSpot: true },
    t_b_entry: { id: 't_b_entry', pos: new THREE.Vector3(-16, 0, 35), connections: ['t_spawn', 'b_tunnels_outer'] },

    // Lane 1: Long A -> Raised Site A
    long_doors_outer: { id: 'long_doors_outer', pos: new THREE.Vector3(24, 0, 22), connections: ['t_long_entry', 'long_doors_gap'] },
    long_doors_gap: { id: 'long_doors_gap', pos: new THREE.Vector3(24, 0, 10), connections: ['long_doors_outer', 'long_corner'], isChokepoint: true, coverAngle: Math.PI },
    long_corner: { id: 'long_corner', pos: new THREE.Vector3(24, 0, -4), connections: ['long_doors_gap', 'long_ramp'], coverAngle: Math.PI },
    long_ramp: { id: 'long_ramp', pos: new THREE.Vector3(24, 0.6, -15), connections: ['long_corner', 'site_a'] },
    site_a: { id: 'site_a', pos: new THREE.Vector3(23, 1.2, -25), connections: ['long_ramp', 'short_a', 'ct_a_connector', 'a_goose'], isSiteA: true },
    a_goose: { id: 'a_goose', pos: new THREE.Vector3(29, 1.2, -29), connections: ['site_a'], isPostPlant: true, coverAngle: 0 },
    short_a: { id: 'short_a', pos: new THREE.Vector3(11, 1.2, -25), connections: ['site_a', 'mid_catwalk'], isPostPlant: true, coverAngle: -Math.PI / 2 },

    // Lane 2: Middle (Mid) & Catwalk
    mid_courtyard: { id: 'mid_courtyard', pos: new THREE.Vector3(0, 0, 12), connections: ['t_mid_entry', 'mid_xbox', 'mid_underpass_b'] },
    mid_xbox: { id: 'mid_xbox', pos: new THREE.Vector3(-3.5, 0, -2), connections: ['mid_courtyard', 'mid_catwalk', 'mid_double_doors'] },
    mid_catwalk: { id: 'mid_catwalk', pos: new THREE.Vector3(8, 0.7, -12), connections: ['mid_xbox', 'short_a'], isChokepoint: true },
    mid_underpass_b: { id: 'mid_underpass_b', pos: new THREE.Vector3(-11, 0, 3), connections: ['mid_courtyard', 'b_tunnels_stairs'], isChokepoint: true },
    mid_double_doors: { id: 'mid_double_doors', pos: new THREE.Vector3(0, 0, -16), connections: ['mid_xbox', 'ct_mid'], isChokepoint: true, isSniperSpot: true },
    ct_mid: { id: 'ct_mid', pos: new THREE.Vector3(0, 0, -29), connections: ['mid_double_doors', 'ct_spawn', 'ct_a_connector', 'ct_b_connector'], isSniperSpot: true },

    // Lane 3: B Tunnels & Fortified Bombsite B
    b_tunnels_outer: { id: 'b_tunnels_outer', pos: new THREE.Vector3(-24, 0, 22), connections: ['t_b_entry', 'b_tunnels_stairs'] },
    b_tunnels_stairs: { id: 'b_tunnels_stairs', pos: new THREE.Vector3(-24, 0, 6), connections: ['b_tunnels_outer', 'mid_underpass_b', 'b_exit_doors'] },
    b_exit_doors: { id: 'b_exit_doors', pos: new THREE.Vector3(-24, 0, -10), connections: ['b_tunnels_stairs', 'site_b'], isChokepoint: true, coverAngle: Math.PI },
    site_b: { id: 'site_b', pos: new THREE.Vector3(-23, 0, -24), connections: ['b_exit_doors', 'b_window', 'b_back_plat', 'ct_b_connector'], isSiteB: true },
    b_back_plat: { id: 'b_back_plat', pos: new THREE.Vector3(-29, 0, -28), connections: ['site_b'], isPostPlant: true, coverAngle: 0 },
    b_window: { id: 'b_window', pos: new THREE.Vector3(-12, 0, -24), connections: ['site_b', 'ct_b_connector'], isChokepoint: true },

    // CT Spawn & Defense Hub
    ct_spawn: { id: 'ct_spawn', pos: new THREE.Vector3(0, 0, -41), connections: ['ct_mid', 'ct_a_connector', 'ct_b_connector'], isCTSpawn: true },
    ct_a_connector: { id: 'ct_a_connector', pos: new THREE.Vector3(15, 0.5, -34), connections: ['ct_spawn', 'ct_mid', 'site_a'] },
    ct_b_connector: { id: 'ct_b_connector', pos: new THREE.Vector3(-15, 0, -34), connections: ['ct_spawn', 'ct_mid', 'site_b', 'b_window'] }
  };

  const buildScene = (scene: THREE.Scene) => {
    const mapGroup = new THREE.Group();
    mapGroup.name = 'SandBastionMap';

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xe2c79d,
      map: textures.sandstoneFloor,
      bumpMap: dataTextures.sandstoneBump,
      bumpScale: 0.045,
      roughnessMap: dataTextures.sandstoneRoughness,
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 0.15
    });
    groundMat.map!.repeat.set(22, 22);
    dataTextures.sandstoneBump.repeat.set(22, 22);
    dataTextures.sandstoneRoughness.repeat.set(22, 22);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xdec49b,
      map: textures.moroccanWall,
      bumpMap: dataTextures.plasterBump,
      bumpScale: 0.04,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.16
    });
    wallMat.map!.repeat.set(4, 1);
    dataTextures.plasterBump.repeat.set(4, 1);

    const trimStoneMat = new THREE.MeshStandardMaterial({
      color: 0x9b7a4f,
      bumpMap: dataTextures.plasterBump,
      bumpScale: 0.03,
      roughness: 0.93,
      metalness: 0.0,
      envMapIntensity: 0.15
    });

    const woodDoorMat = new THREE.MeshStandardMaterial({
      map: textures.woodDoor,
      bumpMap: dataTextures.woodBump,
      bumpScale: 0.035,
      roughness: 0.85,
      metalness: 0.04,
      envMapIntensity: 0.22
    });

    // Extended natural horizon ground (prevents floating box void)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.castShadow = false;
    mapGroup.add(ground);

    // ==========================================
    // PERIMETER CITADEL WALLS + ARCHES
    // ==========================================
    addBox(mapGroup, 84, 8.5, 4, 0, 0, 52, wallMat);
    addBox(mapGroup, 84, 8.5, 4, 0, 0, -52, wallMat);
    addBox(mapGroup, 4, 8.5, 108, 38, 0, 0, wallMat);
    addBox(mapGroup, 4, 8.5, 108, -38, 0, 0, wallMat);

    // Distant Citadel Architecture & Palm Horizon (outside play zone, no shadow frustum waste)
    addBox(mapGroup, 14, 18, 14, -55, 0, -45, wallMat, false, false);
    addBox(mapGroup, 8, 26, 8, 56, 0, -35, wallMat, false, false);
    addBox(mapGroup, 16, 14, 16, 54, 0, 35, wallMat, false, false);
    addBox(mapGroup, 12, 22, 12, -52, 0, 42, wallMat, false, false);
    addPalmTree(mapGroup, 33, 38);
    addPalmTree(mapGroup, -33, -38);
    addPalmTree(mapGroup, 45, 0);
    addPalmTree(mapGroup, -45, 10);

    // ==========================================
    // T-SPAWN ELEVATED SNIPER BALCONY (y = 1.0)
    // ==========================================
    addBox(mapGroup, 26, 1.0, 14, 0, 0, 43, wallMat);
    // Mid sniper ramp sloping from z=36 (y=1.0) down to z=30 (y=0)
    addRampMesh(mapGroup, ramps, -4, 4, 30, 36, 0, 1.0, 'z', trimStoneMat);
    // Side ramps to Long A & B Tunnels
    addRampMesh(mapGroup, ramps, 13, 18, 37, 45, 1.0, 0, 'x', trimStoneMat);
    addRampMesh(mapGroup, ramps, -18, -13, 37, 45, 0, 1.0, 'x', trimStoneMat);
    addCrate(mapGroup, -5, 1.0, 37.5, 1.8);
    addCrate(mapGroup, 5, 1.0, 37.5, 1.8);

    // ==========================================
    // LANE 1: LONG A, DOUBLE DOORS & ELEVATED BOMBSITE A
    // ==========================================
    addBox(mapGroup, 4, 7.5, 18, 14, 0, 26, wallMat);
    addBox(mapGroup, 4, 7.5, 24, 14, 0, -4, wallMat);

    // Long A Double Wooden Doors with Overhead Archway
    addBox(mapGroup, 6, 7.5, 2.5, 19, 0, 10, wallMat);
    addBox(mapGroup, 6, 7.5, 2.5, 31, 0, 10, wallMat);
    addBox(mapGroup, 16, 2.2, 2.8, 25, 5.3, 10, trimStoneMat); // Overhead arch lintel
    addBox(mapGroup, 1.6, 5.3, 0.5, 22.1, 0, 10, woodDoorMat); // Left door wing (ajar)
    addBox(mapGroup, 1.6, 5.3, 0.5, 26.8, 0, 10, woodDoorMat); // Right door wing

    // Long Corner Painted Steel Dumpster Cover + Pit Boxes (distinct metallic reflection)
    addBox(
      mapGroup,
      4.2,
      2.3,
      6.2,
      30,
      0,
      -4,
      new THREE.MeshStandardMaterial({
        color: 0x2c5282,
        bumpMap: dataTextures.corrugatedBump,
        bumpScale: 0.03,
        roughness: 0.4,
        metalness: 0.65,
        envMapIntensity: 0.85
      })
    );
    addCrate(mapGroup, 21.5, 0, -2, 2.0);
    addCrate(mapGroup, 23.6, 0, -2, 2.0);

    // A Ramp rising smoothly from z=-10 (y=0) up to z=-18 (y=1.2)
    addRampMesh(mapGroup, ramps, 17, 34, -18, -10, 1.2, 0, 'z', trimStoneMat);

    // Raised Bombsite A Platform (y = 1.2) + CT A Ramp
    addBox(mapGroup, 20, 1.2, 18, 25, 0, -27, wallMat);
    addRampMesh(mapGroup, ramps, 10, 15, -35, -28, 0, 1.2, 'x', trimStoneMat);

    // Site A Tactical Cover: Default Triple Stack, Goose Corner & Ninja Crate
    addCrate(mapGroup, 21, 1.2, -23, 2.0);
    addCrate(mapGroup, 21, 1.2, -25.1, 2.0);
    addCrate(mapGroup, 21, 3.2, -23, 1.7);
    addCrate(mapGroup, 27, 1.2, -29, 2.1);
    addBarrel(mapGroup, 28, 1.2, -21, 0xb03a2e);
    addBarrel(mapGroup, 29, 1.2, -22, 0x2874a6);

    // Short A (Catwalk) Dividing Wall + Stencil
    addBox(mapGroup, 10, 7.5, 4, 5, 0, -24, wallMat);
    addSprayDecal(mapGroup, 'A', '#d92626', 35.9, 4.5, -25, -Math.PI / 2, 3.2);
    addSprayDecal(mapGroup, 'A ➔', '#d92626', 14, 3.5, 16, Math.PI, 2.0);

    // ==========================================
    // LANE 2: MIDDLE (MID), XBOX, CATWALK STAIRS & MID DOUBLE DOORS
    // ==========================================
    addBox(mapGroup, 4, 7.5, 20, -14, 0, 24, wallMat);
    addBox(mapGroup, 4, 7.5, 18, -14, 0, -7, wallMat);

    // Iconic Mid "Xbox" Stacked Crates
    addCrate(mapGroup, -2.5, 0, -2, 2.4);
    addCrate(mapGroup, 0.2, 0, -2, 1.8);
    addCrate(mapGroup, -2.5, 2.4, -2, 1.4);

    // Catwalk / Short A Elevated Ledge & Ramp from Mid (z=-6 to z=-18 rises 0 -> 1.2)
    addRampMesh(mapGroup, ramps, 5, 12, -18, -6, 1.2, 0, 'z', trimStoneMat);
    addBox(mapGroup, 7, 1.2, 10, 8.5, 0, -23, wallMat);

    // Mid Double Doors (Leaves narrow center sniper gap at x=0, z=-16)
    addBox(mapGroup, 8, 7.0, 3, -8, 0, -16, wallMat);
    addBox(mapGroup, 8, 7.0, 3, 8, 0, -16, wallMat);
    addBox(mapGroup, 16, 2.0, 3.2, 0, 5.0, -16, trimStoneMat); // Doorway lintel
    // Heavy wooden doors angled inward
    const midDoorL = addBox(mapGroup, 3.2, 5.0, 0.6, -2.3, 0, -16.1, woodDoorMat);
    midDoorL.rotation.y = 0.25;
    const midDoorR = addBox(mapGroup, 3.2, 5.0, 0.6, 2.3, 0, -15.9, woodDoorMat);
    midDoorR.rotation.y = -0.22;

    // ==========================================
    // LANE 3: ROOFED B TUNNELS & FORTIFIED BOMBSITE B
    // ==========================================
    // B Tunnels Overhead Roof & Archways (Authentic interior tunnel lighting feel)
    addBox(mapGroup, 20, 1.2, 32, -25, 6.2, 6, trimStoneMat); // Tunnel ceiling
    // Warm recessed tunnel lantern bounce so roofed corridor stays atmospheric & legible
    const tunnelLamp = new THREE.PointLight(0xffcb8a, 4.2, 26, 1.35);
    tunnelLamp.position.set(-25, 5.4, 6);
    mapGroup.add(tunnelLamp);
    const lanternMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.2, 0.9),
      new THREE.MeshStandardMaterial({
        color: 0xfff3d6,
        emissive: 0xffb866,
        emissiveIntensity: 1.6,
        roughness: 0.4
      })
    );
    lanternMesh.position.set(-25, 6.08, 6);
    mapGroup.add(lanternMesh);

    addBox(mapGroup, 5, 7.5, 3, -19, 0, -10, wallMat);
    addBox(mapGroup, 5, 7.5, 3, -31, 0, -10, wallMat);
    addBox(mapGroup, 12, 2.0, 3, -25, 5.5, -10, trimStoneMat);
    addCrate(mapGroup, -28, 0, 14, 2.0);

    // Site B Walls + B Window Frame + Back Plat
    addBox(mapGroup, 4, 7.5, 14, -14, 0, -21, wallMat); // B Door partition
    addBox(mapGroup, 4, 2.0, 6, -14, 0, -31, wallMat); // B Window lower sill
    addBox(mapGroup, 4, 2.5, 6, -14, 5.0, -31, wallMat); // B Window upper lintel
    addBox(mapGroup, 16, 7.5, 4, -22, 0, -34, wallMat); // Back CT-to-B wall

    // Site B Tactical Cover (Pillar, Double Stack, Car Cover & Barrels)
    addBox(mapGroup, 3.2, 6.5, 3.2, -27, 0, -20, trimStoneMat);
    addCrate(mapGroup, -20.5, 0, -22, 2.2);
    addCrate(mapGroup, -22.8, 0, -22, 2.0);
    addCrate(mapGroup, -20.5, 0, -27, 2.0);
    addBarrel(mapGroup, -29, 0, -27, 0x922b21);
    addSprayDecal(mapGroup, 'B', '#d92626', -35.9, 4.2, -24, Math.PI / 2, 3.2);
    addSprayDecal(mapGroup, '← B', '#d92626', -14, 3.5, 14, 0, 2.0);

    // CT Spawn Cover & Archways
    addCrate(mapGroup, -3, 0, -37, 2.0);
    addCrate(mapGroup, 3, 0, -37, 2.0);

    // Floor Site Markers
    const makeSiteRing = (x: number, y: number, z: number, color: number, letter: string) => {
      const ringGeo = new THREE.RingGeometry(siteA.radius - 0.35, siteA.radius, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.04, z);
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
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const letterPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.8, 3.8),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        })
      );
      letterPlane.rotation.x = -Math.PI / 2;
      letterPlane.position.set(x, y + 0.05, z);
      mapGroup.add(letterPlane);
    };

    makeSiteRing(siteA.center.x, 1.2, siteA.center.z, 0xef4444, 'A');
    makeSiteRing(siteB.center.x, 0, siteB.center.z, 0xef4444, 'B');

    scene.add(mapGroup);
    return mapGroup;
  };

  return {
    id: 'citadel',
    name: 'Sand Bastion',
    nameAr: 'حصن الرمال',
    descriptionAr:
      'خريطة صحراوية تكتيكية بثلاثة ممرات: شرفة القنص، الممر الطويل، الساحة الوسطى مع الممر المرتفع، وأنفاق الموقع B المحصن',
    skyColor: 0xcce2f5,
    fogColor: 0xe0cbb0,
    lightColor: 0xffe8c2,
    groundColor: 0xc49c68,
    defaultGroundSurface: 'dirt',
    lightingProfile: {
      sunPosition: [38, 40, 24],
      sunIntensity: 2.35,
      hemiIntensity: 0.56,
      envIntensity: 0.42,
      fogNear: 52,
      fogFar: 185,
      exposure: 1.08
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

// ==========================================================
// MAP 2: APEX FOUNDRY (المسبك الصناعي)
// Tactical Industrial Architecture:
//   - Crisp Industrial Daylight + Overhead Skylights & Floodlights
//   - Site A (Turbine Core) with Elevated Upper Catwalk (y = 3.0) & Ramp
//   - Mid Yard with Corrugated Steel Shipping Containers & Vent Connector
//   - Site B (Loading Bay) with Tactical Shipping Containers & Security Booth
// ==========================================================
export function getApexFoundry(): MapData {
  const colliders: BoxCollider[] = [];
  const ramps: RampZone[] = [];

  const addBox = (
    group: THREE.Group,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    collide = true
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (collide) {
      colliders.push({
        min: new THREE.Vector3(x - w / 2, y, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
        surface: inferSurfaceFromMaterial(mat, 'metal')
      });
    }
    return mesh;
  };

  const addContainer = (group: THREE.Group, x: number, y: number, z: number, color = 0x2980b9, rot = 0) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: textures.container,
      bumpMap: dataTextures.corrugatedBump,
      bumpScale: 0.055,
      roughnessMap: dataTextures.corrugatedRoughness,
      roughness: 0.42,
      metalness: 0.62,
      envMapIntensity: 0.84
    });
    // Keep axis aligned colliders clean for 0 and PI/2
    const isRotated = Math.abs(Math.sin(rot)) > 0.5;
    const w = isRotated ? 8 : 3.8;
    const d = isRotated ? 3.8 : 8;
    addBox(group, w, 3.2, d, x, y, z, mat, true);
  };

  const addReactorSilo = (group: THREE.Group, x: number, y: number, z: number) => {
    const siloGroup = new THREE.Group();
    const tankMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 4.4, 20),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        map: textures.hazard,
        roughness: 0.44,
        metalness: 0.48,
        envMapIntensity: 0.72
      })
    );
    tankMesh.position.y = 2.2;
    tankMesh.castShadow = true;
    tankMesh.receiveShadow = true;

    const capMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.28,
      metalness: 0.86,
      envMapIntensity: 0.96
    });
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.35, 20), capMat);
    topCap.position.y = 4.4;
    topCap.castShadow = true;
    const coreGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(1.64, 1.64, 0.28, 20),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    coreGlow.position.y = 3.2;

    siloGroup.add(tankMesh, topCap, coreGlow);
    siloGroup.position.set(x, y, z);
    group.add(siloGroup);

    colliders.push({
      min: new THREE.Vector3(x - 1.6, y, z - 1.6),
      max: new THREE.Vector3(x + 1.6, y + 4.5, z + 1.6),
      surface: 'metal'
    });
  };

  const tSpawns: THREE.Vector3[] = [];
  const ctSpawns: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    tSpawns.push(new THREE.Vector3(-4.5 + col * 3.0, 0, 41 + row * 3.0));
    ctSpawns.push(new THREE.Vector3(-4.5 + col * 3.0, 0, -41 - row * 3.0));
  }

  const siteA: BombSiteZone = {
    id: 'A',
    name: 'Reactor Core (Site A)',
    nameAr: 'الموقع A (قلب المفاعل والمنصة العلوية)',
    center: new THREE.Vector3(23, 0.8, -22),
    radius: 7.2
  };

  const siteB: BombSiteZone = {
    id: 'B',
    name: 'Cargo Bay (Site B)',
    nameAr: 'الموقع B (ساحة الشحن والحاويات)',
    center: new THREE.Vector3(-23, 0, -22),
    radius: 7.2
  };

  const navNodes: Record<string, NavNode> = {
    t_spawn: { id: 't_spawn', pos: new THREE.Vector3(0, 0, 41), connections: ['t_office_hall', 't_yard_mid', 't_hangar_entry'], isTSpawn: true },
    t_office_hall: { id: 't_office_hall', pos: new THREE.Vector3(16, 0, 35), connections: ['t_spawn', 'catwalk_corridor'] },
    t_yard_mid: { id: 't_yard_mid', pos: new THREE.Vector3(0, 0, 27), connections: ['t_spawn', 'conveyor_hall'] },
    t_hangar_entry: { id: 't_hangar_entry', pos: new THREE.Vector3(-16, 0, 35), connections: ['t_spawn', 'container_bay'] },

    // Lane 1: Lobby / Squeaky -> Site A + Heaven Catwalk
    catwalk_corridor: { id: 'catwalk_corridor', pos: new THREE.Vector3(24, 0, 20), connections: ['t_office_hall', 'catwalk_door'] },
    catwalk_door: { id: 'catwalk_door', pos: new THREE.Vector3(24, 0, 8), connections: ['catwalk_corridor', 'vat_room_entry'], isChokepoint: true, coverAngle: Math.PI },
    vat_room_entry: { id: 'vat_room_entry', pos: new THREE.Vector3(24, 0, -6), connections: ['catwalk_door', 'site_a'], coverAngle: Math.PI },
    site_a: { id: 'site_a', pos: new THREE.Vector3(23, 0.8, -22), connections: ['vat_room_entry', 'vent_hall', 'ct_security', 'a_heaven'], isSiteA: true },
    a_heaven: { id: 'a_heaven', pos: new THREE.Vector3(31, 3.0, -32), connections: ['ct_security', 'site_a'], isSniperSpot: true, isPostPlant: true, coverAngle: 0 },
    vent_hall: { id: 'vent_hall', pos: new THREE.Vector3(10, 0, -22), connections: ['site_a', 'conveyor_hall'], isPostPlant: true },

    // Lane 2: Outside Yard (Mid)
    conveyor_hall: { id: 'conveyor_hall', pos: new THREE.Vector3(0, 0, 8), connections: ['t_yard_mid', 'mid_forklift', 'hangar_connector'] },
    mid_forklift: { id: 'mid_forklift', pos: new THREE.Vector3(0, 0, -5), connections: ['conveyor_hall', 'vent_hall', 'mid_gate_north'] },
    hangar_connector: { id: 'hangar_connector', pos: new THREE.Vector3(-10, 0, 4), connections: ['conveyor_hall', 'container_bay'], isChokepoint: true },
    mid_gate_north: { id: 'mid_gate_north', pos: new THREE.Vector3(0, 0, -18), connections: ['mid_forklift', 'ct_mid_security'], isChokepoint: true, isSniperSpot: true },
    ct_mid_security: { id: 'ct_mid_security', pos: new THREE.Vector3(0, 0, -29), connections: ['mid_gate_north', 'ct_spawn', 'ct_security', 'ct_loading_bay'] },

    // Lane 3: Container Yard -> Site B
    container_bay: { id: 'container_bay', pos: new THREE.Vector3(-24, 0, 20), connections: ['t_hangar_entry', 'hangar_connector', 'bay_choke'] },
    bay_choke: { id: 'bay_choke', pos: new THREE.Vector3(-24, 0, 6), connections: ['container_bay', 'site_b_entrance'], isChokepoint: true, coverAngle: Math.PI },
    site_b_entrance: { id: 'site_b_entrance', pos: new THREE.Vector3(-24, 0, -8), connections: ['bay_choke', 'site_b'] },
    site_b: { id: 'site_b', pos: new THREE.Vector3(-23, 0, -22), connections: ['site_b_entrance', 'bay_window', 'ct_loading_bay', 'b_decon_corner'], isSiteB: true },
    b_decon_corner: { id: 'b_decon_corner', pos: new THREE.Vector3(-30, 0, -29), connections: ['site_b'], isPostPlant: true, coverAngle: 0 },
    bay_window: { id: 'bay_window', pos: new THREE.Vector3(-12, 0, -22), connections: ['site_b', 'ct_loading_bay'], isChokepoint: true },

    // CT Spawn & Security
    ct_spawn: { id: 'ct_spawn', pos: new THREE.Vector3(0, 0, -41), connections: ['ct_mid_security', 'ct_security', 'ct_loading_bay'], isCTSpawn: true },
    ct_security: { id: 'ct_security', pos: new THREE.Vector3(16, 0, -33), connections: ['ct_spawn', 'ct_mid_security', 'site_a', 'a_heaven'] },
    ct_loading_bay: { id: 'ct_loading_bay', pos: new THREE.Vector3(-16, 0, -33), connections: ['ct_spawn', 'ct_mid_security', 'site_b', 'bay_window'] }
  };

  const buildScene = (scene: THREE.Scene) => {
    const mapGroup = new THREE.Group();
    mapGroup.name = 'ApexFoundryMap';

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xa2b0be,
      map: textures.concreteFloor,
      bumpMap: dataTextures.concreteBump,
      bumpScale: 0.03,
      roughnessMap: dataTextures.concreteRoughness,
      roughness: 0.82,
      metalness: 0.04,
      envMapIntensity: 0.28
    });
    floorMat.map!.repeat.set(20, 20);
    dataTextures.concreteBump.repeat.set(20, 20);
    dataTextures.concreteRoughness.repeat.set(20, 20);

    const metalWallMat = new THREE.MeshStandardMaterial({
      color: 0xc2d0de,
      map: textures.metalPanel,
      bumpMap: dataTextures.corrugatedBump,
      bumpScale: 0.025,
      roughness: 0.56,
      metalness: 0.34,
      envMapIntensity: 0.52
    });
    metalWallMat.map!.repeat.set(6, 1);

    const steelBeamMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.34,
      metalness: 0.8,
      envMapIntensity: 0.9
    });

    const hazardFloorMat = new THREE.MeshStandardMaterial({
      map: textures.hazard,
      roughness: 0.65,
      metalness: 0.16,
      envMapIntensity: 0.35
    });

    // Extended Industrial Tarmac Ground
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.castShadow = false;
    mapGroup.add(floor);

    // Distant Factory Cooling Towers & Hangars (outside playable area)
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.86,
      metalness: 0.08,
      envMapIntensity: 0.22
    });
    const addCoolingTower = (tx: number, tz: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 26, 20), towerMat);
      m.position.set(tx, 13, tz);
      mapGroup.add(m);
    };
    addCoolingTower(-58, -50);
    addCoolingTower(58, -45);
    addCoolingTower(-56, 48);

    // Perimeter Hangar Walls
    addBox(mapGroup, 84, 9.5, 4, 0, 0, 52, metalWallMat);
    addBox(mapGroup, 84, 9.5, 4, 0, 0, -52, metalWallMat);
    addBox(mapGroup, 4, 9.5, 108, 38, 0, 0, metalWallMat);
    addBox(mapGroup, 4, 9.5, 108, -38, 0, 0, metalWallMat);

    // ==========================================
    // LANE 1: SQUEAKY ENTRY, SITE A REACTOR & HEAVEN BALCONY
    // ==========================================
    addBox(mapGroup, 4, 8.5, 16, 14, 0, 26, metalWallMat);
    addBox(mapGroup, 4, 8.5, 22, 14, 0, -4, metalWallMat);

    // Squeaky Door Frame
    addBox(mapGroup, 6, 8.0, 2.8, 19, 0, 8, steelBeamMat);
    addBox(mapGroup, 6, 8.0, 2.8, 31, 0, 8, steelBeamMat);
    addBox(mapGroup, 16, 2.0, 3.0, 25, 6.0, 8, steelBeamMat);

    // Raised Reactor Platform (y = 0.8) with Walkable Front Ramp
    addBox(mapGroup, 15, 0.8, 15, 23, 0, -22, steelBeamMat);
    addRampMesh(mapGroup, ramps, 17, 29, -14.5, -10.5, 0.8, 0, 'z', hazardFloorMat);
    addRampMesh(mapGroup, ramps, 11.5, 15.5, -26, -18, 0, 0.8, 'x', hazardFloorMat);

    // Reactor Silos on Platform
    addReactorSilo(mapGroup, 20.5, 0.8, -19.5);
    addReactorSilo(mapGroup, 25.5, 0.8, -19.5);
    addReactorSilo(mapGroup, 23.0, 0.8, -26.5);

    // Elevated "Heaven" Sniper Catwalk above Site A (y = 3.0) with Ramp from CT Security
    addBox(mapGroup, 10, 0.4, 12, 31, 2.6, -32, steelBeamMat);
    addRampMesh(mapGroup, ramps, 20, 26, -35, -31, 0, 3.0, 'x', steelBeamMat);

    // Vent Connector between Site A and Mid
    addBox(mapGroup, 8, 8.5, 4, 4, 0, -22, metalWallMat);
    addSprayDecal(mapGroup, 'A', '#0284c7', 35.9, 4.5, -22, -Math.PI / 2, 3.2);
    addSprayDecal(mapGroup, 'A ➔', '#0284c7', 14, 3.5, 16, Math.PI, 2.0);

    // ==========================================
    // LANE 2: OUTSIDE YARD / CONVEYOR MID
    // ==========================================
    addBox(mapGroup, 4, 8.5, 18, -14, 0, 24, metalWallMat);
    addBox(mapGroup, 4, 8.5, 18, -14, 0, -6, metalWallMat);

    // Central Mid Yard Containers
    addContainer(mapGroup, 0, 0, -4, 0xd35400, Math.PI / 2);
    addContainer(mapGroup, -3, 0, 12, 0x2471a3, 0);
    addBox(mapGroup, 10, 7.5, 3, -7, 0, -18, steelBeamMat);
    addBox(mapGroup, 10, 7.5, 3, 7, 0, -18, steelBeamMat);

    // ==========================================
    // LANE 3: LOADING BAY (SITE B) & CONTAINERS
    // ==========================================
    addBox(mapGroup, 6, 8.5, 3, -19, 0, 6, steelBeamMat);
    addBox(mapGroup, 6, 8.5, 3, -31, 0, 6, steelBeamMat);
    addBox(mapGroup, 16, 2.2, 3.2, -25, 6.3, 6, steelBeamMat);

    addContainer(mapGroup, -20, 0, -18, 0xc0392b, 0); // Crimson Red Container
    addContainer(mapGroup, -27, 0, -18, 0x2980b9, 0); // Maritime Blue Container
    addContainer(mapGroup, -23, 0, -27, 0x27ae60, Math.PI / 2); // Industrial Green Container
    addBox(mapGroup, 4, 8.5, 16, -14, 0, -22, metalWallMat);
    addSprayDecal(mapGroup, 'B', '#0284c7', -35.9, 4.5, -22, Math.PI / 2, 3.2);
    addSprayDecal(mapGroup, '← B', '#0284c7', -14, 3.5, 14, 0, 2.0);

    // Spawn Cover Containers
    addContainer(mapGroup, 0, 0, 36, 0x5d6d7e, Math.PI / 2);
    addContainer(mapGroup, 0, 0, -36, 0x5d6d7e, Math.PI / 2);

    // Overhead Steel Trusses + Strategic High-Bay Floodlights
    const addTruss = (z: number) => {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(72, 1.0, 1.0), steelBeamMat);
      truss.position.set(0, 8.8, z);
      truss.castShadow = true;
      truss.receiveShadow = true;
      mapGroup.add(truss);
    };
    addTruss(24);
    addTruss(0);
    addTruss(-24);

    const addIndustrialFloodlight = (
      x: number,
      y: number,
      z: number,
      color: number,
      intensity: number,
      dist = 42,
      emitLight = true
    ) => {
      if (emitLight) {
        const light = new THREE.PointLight(color, intensity, dist, 1.35);
        light.position.set(x, y, z);
        mapGroup.add(light);
      }

      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.9, 0.25, 12),
        new THREE.MeshBasicMaterial({ color })
      );
      lens.position.set(x, y + 0.15, z);
      mapGroup.add(lens);

      const hood = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.3, 0.4, 12),
        new THREE.MeshStandardMaterial({
          color: 0x3e4a57,
          metalness: 0.82,
          roughness: 0.28,
          envMapIntensity: 0.9
        })
      );
      hood.position.set(x, y + 0.45, z);
      mapGroup.add(hood);
    };

    // 5 strategic physical floodlights (warm loading bay vs cool turbine bay) + visual hoods
    addIndustrialFloodlight(23, 8.2, -22, 0xd8f3ff, 5.5, 44, true);
    addIndustrialFloodlight(-23, 8.2, -22, 0xffeed6, 5.5, 44, true);
    addIndustrialFloodlight(0, 8.2, 0, 0xf8fafc, 5.0, 42, true);
    addIndustrialFloodlight(24, 8.2, 12, 0xffe8cc, 4.2, 36, true);
    addIndustrialFloodlight(-24, 8.2, 10, 0xffe8cc, 4.2, 36, true);
    addIndustrialFloodlight(0, 8.2, 36, 0xfff8f0, 0, 0, false);
    addIndustrialFloodlight(0, 8.2, -36, 0xe8f4ff, 0, 0, false);

    // Site Marking Rings
    const makeSiteRing = (x: number, y: number, z: number, color: number, letter: string) => {
      const ringGeo = new THREE.RingGeometry(siteA.radius - 0.35, siteA.radius, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.04, z);
      mapGroup.add(ring);

      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 96px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const letterPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.8, 3.8),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        })
      );
      letterPlane.rotation.x = -Math.PI / 2;
      letterPlane.position.set(x, y + 0.05, z);
      mapGroup.add(letterPlane);
    };

    makeSiteRing(siteA.center.x, 0.8, siteA.center.z, 0xfacc15, 'A');
    makeSiteRing(siteB.center.x, 0, siteB.center.z, 0xfacc15, 'B');

    scene.add(mapGroup);
    return mapGroup;
  };

  return {
    id: 'foundry',
    name: 'Apex Foundry',
    nameAr: 'المسبك الصناعي',
    descriptionAr:
      'منشأة صناعية بإضاءة نهارية واضحة وثلاثة مسارات: غرفة التوربين (A) مع الجسر العلوي، ساحة الحاويات، وممرات التهوية',
    skyColor: 0xd4e4f2,
    fogColor: 0xcad8e6,
    lightColor: 0xfff8ef,
    groundColor: 0x7c8b99,
    defaultGroundSurface: 'concrete',
    lightingProfile: {
      sunPosition: [-28, 48, 26],
      sunIntensity: 1.95,
      hemiIntensity: 0.62,
      envIntensity: 0.64,
      fogNear: 58,
      fogFar: 195,
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

// ==========================================================
// MAP 3: OBSIDIAN PORT (ميناء الأوبسيديان)
// Coastal Night-Ops Cargo Harbor:
//   - Twilight maritime atmosphere with crisp dock floodlights
//   - East Customs Warehouse -> Raised Loading Deck (Site A, y = 1.0) + Crane Watchtower (y = 2.6)
//   - Center Container Rail Yard with staggered sightline containers & Mid-to-Site connectors
//   - West Roofed Cargo Canal -> Fuel Pier Terminal (Site B) with silos & flanking lane
// ==========================================================
export function getObsidianPort(): MapData {
  const colliders: BoxCollider[] = [];
  const ramps: RampZone[] = [];

  const addBox = (
    group: THREE.Group,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    collide = true
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (collide) {
      colliders.push({
        min: new THREE.Vector3(x - w / 2, y, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
        surface: inferSurfaceFromMaterial(mat, 'concrete')
      });
    }
    return mesh;
  };

  const crateMat = new THREE.MeshStandardMaterial({
    map: textures.crate,
    bumpMap: dataTextures.woodBump,
    bumpScale: 0.04,
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.16
  });

  const addCrate = (group: THREE.Group, x: number, y: number, z: number, s = 1.9, rot = 0) => {
    const m = addBox(group, s, s, s, x, y, z, crateMat, true);
    m.rotation.y = rot;
  };

  const addContainer = (
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    color: number,
    w: number,
    h: number,
    d: number
  ) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: textures.container,
      bumpMap: dataTextures.corrugatedBump,
      bumpScale: 0.055,
      roughnessMap: dataTextures.corrugatedRoughness,
      roughness: 0.42,
      metalness: 0.64,
      envMapIntensity: 0.86
    });
    addBox(group, w, h, d, x, y, z, mat, true);
  };

  const addFuelSilo = (group: THREE.Group, x: number, y: number, z: number) => {
    const siloGroup = new THREE.Group();
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.32,
      metalness: 0.78,
      envMapIntensity: 0.94
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4.2, 20), tankMat);
    body.position.y = 2.1;
    body.castShadow = true;
    body.receiveShadow = true;

    const bandMat = new THREE.MeshStandardMaterial({
      map: textures.hazard,
      roughness: 0.52,
      metalness: 0.25,
      envMapIntensity: 0.45
    });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.53, 0.55, 20), bandMat);
    band.position.y = 1.25;

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.28,
        metalness: 0.86,
        envMapIntensity: 0.96
      })
    );
    dome.position.y = 4.2;
    dome.castShadow = true;

    siloGroup.add(body, band, dome);
    siloGroup.position.set(x, y, z);
    group.add(siloGroup);

    colliders.push({
      min: new THREE.Vector3(x - 1.5, y, z - 1.5),
      max: new THREE.Vector3(x + 1.5, y + 4.8, z + 1.5),
      surface: 'metal'
    });
  };

  const addBollard = (group: THREE.Group, x: number, z: number) => {
    const bGroup = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.36,
      metalness: 0.84,
      envMapIntensity: 0.9
    });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.72, 12), metal);
    post.position.y = 0.36;
    post.castShadow = true;
    post.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.14, 12), metal);
    cap.position.y = 0.74;
    cap.castShadow = true;
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.255, 0.255, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.3 })
    );
    stripe.position.y = 0.52;
    bGroup.add(post, cap, stripe);
    bGroup.position.set(x, 0, z);
    group.add(bGroup);

    colliders.push({
      min: new THREE.Vector3(x - 0.35, 0, z - 0.35),
      max: new THREE.Vector3(x + 0.35, 0.82, z + 0.35),
      surface: 'metal'
    });
  };

  // 8 Gang Spawns (South Pier) & 8 SWAT Spawns (North Coastguard Plaza)
  const tSpawns: THREE.Vector3[] = [];
  const ctSpawns: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    tSpawns.push(new THREE.Vector3(-4.5 + col * 3.0, 0, 41 + row * 3.0));
    ctSpawns.push(new THREE.Vector3(-4.5 + col * 3.0, 0, -41 - row * 3.0));
  }

  const siteA: BombSiteZone = {
    id: 'A',
    name: 'Customs Deck (Site A)',
    nameAr: 'الموقع A (رصيف الجمارك المرتفع)',
    center: new THREE.Vector3(25, 1.0, -24),
    radius: 7.2
  };

  const siteB: BombSiteZone = {
    id: 'B',
    name: 'Fuel Terminal (Site B)',
    nameAr: 'الموقع B (محطة الوقود البحرية)',
    center: new THREE.Vector3(-25, 0, -24),
    radius: 7.2
  };

  // Verified bidirectional NavGraph with zero collider intersections
  const navNodes: Record<string, NavNode> = {
    t_spawn: { id: 't_spawn', pos: new THREE.Vector3(0, 0, 42), connections: ['t_long_entry', 't_mid_entry', 't_b_entry'], isTSpawn: true },
    t_long_entry: { id: 't_long_entry', pos: new THREE.Vector3(18, 0, 36), connections: ['t_spawn', 'warehouse_south'] },
    t_mid_entry: { id: 't_mid_entry', pos: new THREE.Vector3(0, 0, 26), connections: ['t_spawn', 'mid_courtyard'], isSniperSpot: true },
    t_b_entry: { id: 't_b_entry', pos: new THREE.Vector3(-18, 0, 36), connections: ['t_spawn', 'dock_south'] },

    // Lane 1 (East): Customs Warehouse -> Site A + Watchtower
    warehouse_south: { id: 'warehouse_south', pos: new THREE.Vector3(26, 0, 22), connections: ['t_long_entry', 'warehouse_gate', 'east_mid_link'] },
    east_mid_link: { id: 'east_mid_link', pos: new THREE.Vector3(14, 0, 13.5), connections: ['warehouse_south', 'mid_courtyard'], isChokepoint: true },
    warehouse_gate: { id: 'warehouse_gate', pos: new THREE.Vector3(26, 0, 12), connections: ['warehouse_south', 'warehouse_hall'], isChokepoint: true, coverAngle: Math.PI },
    warehouse_hall: { id: 'warehouse_hall', pos: new THREE.Vector3(24, 0, -2), connections: ['warehouse_gate', 'a_ramp_bottom', 'a_mid_link'] },
    a_mid_link: { id: 'a_mid_link', pos: new THREE.Vector3(14, 0, -13.5), connections: ['warehouse_hall', 'mid_xbox'], isChokepoint: true },
    a_ramp_bottom: { id: 'a_ramp_bottom', pos: new THREE.Vector3(25, 0, -10), connections: ['warehouse_hall', 'site_a'] },
    site_a: { id: 'site_a', pos: new THREE.Vector3(25, 1.0, -24), connections: ['a_ramp_bottom', 'a_side_cat', 'a_back_cover'], isSiteA: true },
    a_side_cat: { id: 'a_side_cat', pos: new THREE.Vector3(12, 0.5, -29), connections: ['site_a', 'ct_a_connector'], isPostPlant: true, coverAngle: -Math.PI / 2 },
    a_back_cover: { id: 'a_back_cover', pos: new THREE.Vector3(31.5, 1.0, -29), connections: ['site_a'], isPostPlant: true, coverAngle: 0 },
    a_watch_ramp: { id: 'a_watch_ramp', pos: new THREE.Vector3(22, 0, -37), connections: ['ct_a_connector', 'a_heaven'] },
    a_heaven: { id: 'a_heaven', pos: new THREE.Vector3(32, 2.6, -37), connections: ['a_watch_ramp'], isSniperSpot: true, isPostPlant: true, coverAngle: 0 },

    // Lane 2 (Mid): Rail Yard & North Archway
    mid_courtyard: { id: 'mid_courtyard', pos: new THREE.Vector3(0, 0, 14), connections: ['t_mid_entry', 'east_mid_link', 'west_mid_link', 'mid_xbox'] },
    mid_xbox: { id: 'mid_xbox', pos: new THREE.Vector3(-1.5, 0, -3), connections: ['mid_courtyard', 'a_mid_link', 'b_mid_link', 'mid_double_doors'] },
    mid_double_doors: { id: 'mid_double_doors', pos: new THREE.Vector3(-2.5, 0, -17), connections: ['mid_xbox', 'ct_mid'], isChokepoint: true, isSniperSpot: true },
    ct_mid: { id: 'ct_mid', pos: new THREE.Vector3(0, 0, -29), connections: ['mid_double_doors', 'ct_spawn', 'ct_a_connector', 'ct_b_connector'], isSniperSpot: true },

    // Lane 3 (West): Roofed Cargo Canal -> Site B
    dock_south: { id: 'dock_south', pos: new THREE.Vector3(-26, 0, 22), connections: ['t_b_entry', 'dock_gate', 'west_mid_link'] },
    west_mid_link: { id: 'west_mid_link', pos: new THREE.Vector3(-14, 0, 13.5), connections: ['dock_south', 'mid_courtyard'], isChokepoint: true },
    dock_gate: { id: 'dock_gate', pos: new THREE.Vector3(-26, 0, 6), connections: ['dock_south', 'dock_tunnel'], isChokepoint: true, coverAngle: Math.PI },
    dock_tunnel: { id: 'dock_tunnel', pos: new THREE.Vector3(-25, 0, -6), connections: ['dock_gate', 'b_mid_link', 'site_b'] },
    b_mid_link: { id: 'b_mid_link', pos: new THREE.Vector3(-14, 0, -13.5), connections: ['dock_tunnel', 'mid_xbox'], isChokepoint: true },
    site_b: { id: 'site_b', pos: new THREE.Vector3(-25, 0, -24), connections: ['dock_tunnel', 'b_silo_cover', 'b_north_flank', 'ct_b_connector'], isSiteB: true },
    b_silo_cover: { id: 'b_silo_cover', pos: new THREE.Vector3(-26, 0, -30), connections: ['site_b'], isPostPlant: true, coverAngle: 0 },
    b_north_flank: { id: 'b_north_flank', pos: new THREE.Vector3(-33, 0, -32), connections: ['site_b', 'ct_b_connector'], isPostPlant: true, coverAngle: 0 },

    // CT Security Plaza
    ct_spawn: { id: 'ct_spawn', pos: new THREE.Vector3(0, 0, -41), connections: ['ct_mid', 'ct_a_connector', 'ct_b_connector'], isCTSpawn: true },
    ct_a_connector: { id: 'ct_a_connector', pos: new THREE.Vector3(16, 0, -33), connections: ['ct_spawn', 'ct_mid', 'a_side_cat', 'a_watch_ramp'] },
    ct_b_connector: { id: 'ct_b_connector', pos: new THREE.Vector3(-14, 0, -31.5), connections: ['ct_spawn', 'ct_mid', 'site_b', 'b_north_flank'] }
  };

  const buildScene = (scene: THREE.Scene) => {
    const mapGroup = new THREE.Group();
    mapGroup.name = 'ObsidianPortMap';

    const tarmacMat = new THREE.MeshStandardMaterial({
      color: 0x5c6978,
      map: textures.harborTarmac,
      bumpMap: dataTextures.concreteBump,
      bumpScale: 0.035,
      roughnessMap: dataTextures.concreteRoughness,
      roughness: 0.76,
      metalness: 0.06,
      envMapIntensity: 0.42
    });
    tarmacMat.map!.repeat.set(16, 18);
    dataTextures.concreteBump.repeat.set(16, 18);
    dataTextures.concreteRoughness.repeat.set(16, 18);

    const concreteWallMat = new THREE.MeshStandardMaterial({
      color: 0x738192,
      map: textures.concreteFloor,
      bumpMap: dataTextures.concreteBump,
      bumpScale: 0.035,
      roughness: 0.9,
      metalness: 0.0,
      envMapIntensity: 0.18
    });
    concreteWallMat.map!.repeat.set(4, 1);

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x2a3441,
      roughness: 0.34,
      metalness: 0.82,
      envMapIntensity: 0.9
    });

    const dockPlatformMat = new THREE.MeshStandardMaterial({
      color: 0x4b5868,
      map: textures.metalPanel,
      bumpMap: dataTextures.corrugatedBump,
      bumpScale: 0.025,
      roughness: 0.52,
      metalness: 0.45,
      envMapIntensity: 0.62
    });

    const hazardMat = new THREE.MeshStandardMaterial({
      map: textures.hazard,
      roughness: 0.62,
      metalness: 0.16,
      envMapIntensity: 0.35
    });

    // Extended Ocean Horizon + Playable Harbor Pier Apron (authentic shimmering night water)
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x164266,
      map: textures.harborWater,
      bumpMap: dataTextures.waterBump,
      bumpScale: 0.085,
      roughness: 0.14,
      metalness: 0.68,
      envMapIntensity: 1.15
    });
    waterMat.map!.repeat.set(36, 36);
    dataTextures.waterBump.repeat.set(42, 42);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), waterMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -1.25;
    ocean.receiveShadow = true;
    ocean.castShadow = false;
    mapGroup.add(ocean);

    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(84, 1.25, 112), tarmacMat);
    pierDeck.position.set(0, -0.625, 0);
    pierDeck.receiveShadow = true;
    pierDeck.castShadow = false;
    mapGroup.add(pierDeck);

    // Distant Harbor Gantry Cranes & Coastal Lighthouse Silhouette outside perimeter
    const addHarborCrane = (cx: number, cz: number, rotY: number) => {
      const crane = new THREE.Group();
      const legMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.5, metalness: 0.55 });
      for (const sx of [-3.5, 3.5]) {
        for (const sz of [-3.5, 3.5]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 28, 0.9), legMat);
          leg.position.set(sx, 14, sz);
          crane.add(leg);
        }
      }
      const boom = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.0, 26), legMat);
      boom.position.set(0, 27, 4);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.8, 4.0), steelMat);
      cabin.position.set(0, 24.5, -1);
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5a1f })
      );
      beacon.position.set(0, 29, 15);
      crane.add(boom, cabin, beacon);
      crane.position.set(cx, -1.2, cz);
      crane.rotation.y = rotY;
      mapGroup.add(crane);
    };
    addHarborCrane(-54, -22, 0.35);
    addHarborCrane(56, 18, -0.45);

    // Perimeter Harbor Seawalls
    addBox(mapGroup, 84, 8.0, 4, 0, 0, 52, concreteWallMat);
    addBox(mapGroup, 84, 8.0, 4, 0, 0, -52, concreteWallMat);
    addBox(mapGroup, 4, 8.0, 108, 38, 0, 0, concreteWallMat);
    addBox(mapGroup, 4, 8.0, 108, -38, 0, 0, concreteWallMat);

    // Spawn Protection Containers
    addContainer(mapGroup, 0, 0, 35, 0x334155, 7.2, 2.8, 3.2);
    addContainer(mapGroup, 0, 0, -35, 0x334155, 7.2, 2.8, 3.2);
    addBollard(mapGroup, -7.5, 37);
    addBollard(mapGroup, 7.5, 37);
    addBollard(mapGroup, -7.5, -37);
    addBollard(mapGroup, 7.5, -37);

    // ==========================================
    // LANE 1 (EAST): CUSTOMS WAREHOUSE & RAISED SITE A
    // ==========================================
    addBox(mapGroup, 4, 7.5, 18, 14, 0, 25, concreteWallMat);
    addBox(mapGroup, 4, 7.5, 18, 14, 0, 0, concreteWallMat);

    // Customs Warehouse Gate (z = 12, wide 8m entry x=22..30)
    addBox(mapGroup, 6, 7.5, 3, 19, 0, 12, concreteWallMat);
    addBox(mapGroup, 6, 7.5, 3, 33, 0, 12, concreteWallMat);
    addBox(mapGroup, 18, 2.2, 3.2, 26, 5.4, 12, steelMat);
    // Overhead Warehouse Canopy
    addBox(mapGroup, 20, 0.7, 16, 26, 6.8, 1, steelMat, false);

    addCrate(mapGroup, 28, 0, 2, 1.9);

    // Raised Bombsite A Platform (y = 1.0)
    addBox(mapGroup, 22, 1.0, 18, 25, 0, -25, dockPlatformMat);
    addRampMesh(mapGroup, ramps, 20, 30, -16, -10, 1.0, 0, 'z', hazardMat);
    addRampMesh(mapGroup, ramps, 10, 14, -33, -25, 0, 1.0, 'x', hazardMat);

    // Site A Cover (Clear of plant center 25, 1.0, -24)
    addContainer(mapGroup, 20, 1.0, -21, 0x0369a1, 2.8, 2.5, 5.6);
    addCrate(mapGroup, 29, 1.0, -28, 1.9);
    addCrate(mapGroup, 29, 2.9, -28, 1.5);

    // Crane Watchtower Overlook above Site A (y = 2.6)
    addBox(mapGroup, 8, 0.4, 5, 32, 2.2, -37, steelMat);
    addRampMesh(mapGroup, ramps, 22, 28, -39, -35, 0, 2.6, 'x', hazardMat);
    // Mid-to-CT-A Separating Wall (keeps x=10 ramp clear)
    addBox(mapGroup, 8, 7.5, 3.5, 5, 0, -23, concreteWallMat);

    addSprayDecal(mapGroup, 'A', '#f59e0b', 35.9, 4.4, -24, -Math.PI / 2, 3.2);
    addSprayDecal(mapGroup, 'A ➔', '#f59e0b', 14, 3.5, 20, Math.PI, 2.0);

    // ==========================================
    // LANE 2 (MID): RAIL YARD & SECURITY ARCHWAY
    // ==========================================
    addBox(mapGroup, 4, 7.5, 18, -14, 0, 25, concreteWallMat);
    addBox(mapGroup, 4, 7.5, 18, -14, 0, 0, concreteWallMat);

    addContainer(mapGroup, -4.5, 0, 9, 0xd97706, 3.2, 2.8, 6.8);
    addContainer(mapGroup, 4.5, 0, -3, 0x0284c7, 3.2, 2.8, 6.8);
    addCrate(mapGroup, 0, 0, 2.5, 1.8);

    // Mid North Archway with dual 2.9m peek lanes
    addBox(mapGroup, 8, 7.2, 3, -8, 0, -17, concreteWallMat);
    addBox(mapGroup, 8, 7.2, 3, 8, 0, -17, concreteWallMat);
    addBox(mapGroup, 16, 2.0, 3.2, 0, 5.2, -17, steelMat);
    addBox(mapGroup, 2.2, 1.35, 1.2, 0, 0, -17, hazardMat);

    // ==========================================
    // LANE 3 (WEST): CARGO CANAL & FUEL TERMINAL (SITE B)
    // ==========================================
    addBox(mapGroup, 6, 7.5, 3, -19, 0, 6, concreteWallMat);
    addBox(mapGroup, 6, 7.5, 3, -33, 0, 6, concreteWallMat);
    addBox(mapGroup, 16, 1.8, 3.2, -26, 5.7, 6, steelMat);
    // Roofed Dock Tunnel Canopy
    addBox(mapGroup, 20, 1.0, 20, -26, 6.2, 2, steelMat, false);
    addCrate(mapGroup, -30, 0, -4, 1.9);

    // Site B Enclosure + Fuel Silos + Red Cargo Container
    addBox(mapGroup, 4, 7.5, 12, -14, 0, -22, concreteWallMat);
    addBox(mapGroup, 14, 7.5, 3, -23, 0, -36, concreteWallMat);
    addFuelSilo(mapGroup, -20, 0, -19);
    addFuelSilo(mapGroup, -30, 0, -29);
    addContainer(mapGroup, -30, 0, -20, 0xb91c1c, 3.2, 2.8, 6.4);
    addCrate(mapGroup, -22, 0, -27, 1.9);

    addSprayDecal(mapGroup, 'B', '#38bdf8', -35.9, 4.2, -24, Math.PI / 2, 3.2);
    addSprayDecal(mapGroup, '← B', '#38bdf8', -14, 3.5, 20, 0, 2.0);

    // Harbor Floodlights for sharp combat readability against twilight sky (warm sodium East vs cool cyan West)
    const addDockFloodlight = (
      x: number,
      y: number,
      z: number,
      color: number,
      intensity: number,
      dist = 46,
      emitLight = true
    ) => {
      if (emitLight) {
        const light = new THREE.PointLight(color, intensity, dist, 1.35);
        light.position.set(x, y, z);
        mapGroup.add(light);
      }

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, y, 8), steelMat);
      mast.position.set(x, y / 2, z);
      mast.castShadow = true;
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.35, 0.6),
        new THREE.MeshBasicMaterial({ color })
      );
      lamp.position.set(x, y + 0.15, z);
      mapGroup.add(mast, lamp);
    };

    addDockFloodlight(34, 8.2, -24, 0xffbe7b, 6.2, 48, true);
    addDockFloodlight(-34, 8.2, -24, 0x8ad8ff, 6.2, 48, true);
    addDockFloodlight(0, 8.2, 2, 0xfff0db, 5.4, 46, true);
    addDockFloodlight(26, 8.2, 24, 0xffc68a, 4.4, 42, true);
    addDockFloodlight(-26, 8.2, 24, 0xffc68a, 4.4, 42, true);
    addDockFloodlight(0, 8.2, -38, 0x9cd8ff, 0, 0, false);

    // Site Ground Markings
    const makeSiteRing = (x: number, y: number, z: number, color: number, letter: string, textHex: string) => {
      const ringGeo = new THREE.RingGeometry(siteA.radius - 0.35, siteA.radius, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.04, z);
      mapGroup.add(ring);

      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = textHex;
      ctx.font = 'bold 96px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const letterPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.8, 3.8),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        })
      );
      letterPlane.rotation.x = -Math.PI / 2;
      letterPlane.position.set(x, y + 0.05, z);
      mapGroup.add(letterPlane);
    };

    makeSiteRing(siteA.center.x, 1.0, siteA.center.z, 0xf59e0b, 'A', '#f59e0b');
    makeSiteRing(siteB.center.x, 0, siteB.center.z, 0x38bdf8, 'B', '#38bdf8');

    scene.add(mapGroup);
    return mapGroup;
  };

  return {
    id: 'harbor',
    name: 'Obsidian Port',
    nameAr: 'ميناء الأوبسيديان',
    descriptionAr:
      'ميناء شحن ليلي بثلاثة مسارات تكتيكية: رصيف الجمارك المرتفع (A) مع برج المراقبة، ساحة الحاويات الوسطى، ومحطة الوقود (B)',
    skyColor: 0x111d2e,
    fogColor: 0x0f1a2b,
    lightColor: 0x9bc4ff,
    groundColor: 0x223042,
    defaultGroundSurface: 'concrete',
    lightingProfile: {
      sunPosition: [32, 34, -26],
      sunIntensity: 1.38,
      hemiIntensity: 0.45,
      envIntensity: 0.5,
      fogNear: 42,
      fogFar: 165,
      exposure: 1.14
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

export function getMapById(mapId: MapId | string): MapData {
  if (mapId === 'foundry' || mapId === 'factory') return getApexFoundry();
  if (mapId === 'harbor') return getObsidianPort();
  return getSandBastion();
}

