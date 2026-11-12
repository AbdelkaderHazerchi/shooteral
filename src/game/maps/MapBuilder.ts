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

export interface BoxCollider {
  min: THREE.Vector3;
  max: THREE.Vector3;
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

export interface MapData {
  id: 'dust' | 'factory';
  name: string;
  nameAr: string;
  descriptionAr: string;
  skyColor: number;
  fogColor: number;
  lightColor: number;
  groundColor: number;
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
 * given the actor's current Y height so raised CS2 bombsites, catwalks, and stairs work seamlessly.
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

// Procedural CS2-grade PBR Canvas Textures
function createTileTexture(
  type: 'sandstone_floor' | 'moroccan_wall' | 'wood_door' | 'concrete_floor' | 'metal_panel' | 'crate' | 'container' | 'hazard'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (type === 'sandstone_floor') {
    ctx.fillStyle = '#d4b88c';
    ctx.fillRect(0, 0, 512, 512);
    // Cobblestone pavers & sandy grit
    ctx.strokeStyle = '#b99b6e';
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
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(130,95,50,0.08)' : 'rgba(255,245,220,0.08)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }
  } else if (type === 'moroccan_wall') {
    ctx.fillStyle = '#dfc69d';
    ctx.fillRect(0, 0, 512, 512);
    // Top and bottom sandstone stone trim bands
    ctx.fillStyle = '#b39062';
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillRect(0, 445, 512, 67);
    // Plaster blocks & subtle stains
    ctx.strokeStyle = 'rgba(120,90,50,0.18)';
    ctx.lineWidth = 2;
    for (let y = 64; y < 445; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    for (let i = 0; i < 3500; i++) {
      ctx.fillStyle = 'rgba(90,65,35,0.05)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 4, 4);
    }
  } else if (type === 'wood_door') {
    // Classic Dust2 Mid/Long Heavy Wooden Door with steel crossbars
    ctx.fillStyle = '#6c492c';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#583920';
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
    ctx.fillStyle = '#a4b2c0';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#7b8a99';
    ctx.lineWidth = 4;
    for (let i = 0; i < 512; i += 128) {
      ctx.strokeRect(i, 0, 128, 512);
      ctx.strokeRect(0, i, 512, 128);
    }
    // Subtle industrial scuffing
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(30,40,55,0.05)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
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
    ctx.fillStyle = '#9e6c3f';
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
    // Stencil mark
    ctx.fillStyle = 'rgba(30,20,10,0.55)';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('CS-CARGO', 140, 270);
  } else if (type === 'container') {
    ctx.fillStyle = '#ffffff'; // tinted by material color
    ctx.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 32) {
      ctx.fillStyle = x % 64 === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, 0, 16, 512);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
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
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const textures = {
  sandstoneFloor: createTileTexture('sandstone_floor'),
  moroccanWall: createTileTexture('moroccan_wall'),
  woodDoor: createTileTexture('wood_door'),
  concreteFloor: createTileTexture('concrete_floor'),
  metalPanel: createTileTexture('metal_panel'),
  crate: createTileTexture('crate'),
  container: createTileTexture('container'),
  hazard: createTileTexture('hazard')
};

export function applyTextureAnisotropy(maxAnisotropy: number) {
  Object.values(textures).forEach((t) => {
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

// ==========================================================
// MAP 1: DUST II / MIRAGE CITADEL (واحة الغبار - نسخة CS2)
// Classic 3-Lane Competitive Geometry:
//   - Elevated T-Spawn Sniper Balcony overlooking Mid
//   - Long A + Double Doors + A Ramp -> Raised Bombsite A (y = 1.2)
//   - Middle Double Doors + Xbox + Catwalk/Short A Stairs -> Site A
//   - B Tunnels Roofed Archways -> Fortified Bombsite B + B Window
// ==========================================================
export function getDustMirage(): MapData {
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
        max: new THREE.Vector3(x + w / 2, y + h, z + d / 2)
      });
    }
    return mesh;
  };

  const addCrate = (group: THREE.Group, x: number, y: number, z: number, s = 2.0, rot = 0) => {
    const mat = new THREE.MeshStandardMaterial({
      map: textures.crate,
      roughness: 0.78,
      metalness: 0.08
    });
    const m = addBox(group, s, s, s, x, y, z, mat);
    m.rotation.y = rot;
  };

  const addBarrel = (group: THREE.Group, x: number, y: number, z: number, color = 0xa93226) => {
    const barrelGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 1.35, 16),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.55 })
    );
    body.position.y = 0.675;
    body.castShadow = true;
    body.receiveShadow = true;
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.35, metalness: 0.85 });
    const rim1 = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 8, 16).rotateX(Math.PI / 2), rimMat);
    rim1.position.y = 0.4;
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 8, 16).rotateX(Math.PI / 2), rimMat);
    rim2.position.y = 1.0;
    barrelGroup.add(body, rim1, rim2);
    barrelGroup.position.set(x, y, z);
    group.add(barrelGroup);

    colliders.push({
      min: new THREE.Vector3(x - 0.5, y, z - 0.5),
      max: new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5)
    });
  };

  const addPalmTree = (group: THREE.Group, x: number, z: number) => {
    const palm = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4c30, roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.28 - i * 0.03, 0.32 - i * 0.03, 1.3, 8), trunkMat);
      seg.position.set(Math.sin(i * 0.15) * 0.25, 0.65 + i * 1.2, 0);
      seg.castShadow = true;
      palm.add(seg);
    }
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 0.75 });
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
    mapGroup.name = 'DustMirageMap';

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xe6cfa8,
      map: textures.sandstoneFloor,
      roughness: 0.88,
      metalness: 0.04
    });
    groundMat.map!.repeat.set(22, 22);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xe2cba4,
      map: textures.moroccanWall,
      roughness: 0.82,
      metalness: 0.04
    });
    wallMat.map!.repeat.set(4, 1);

    const trimStoneMat = new THREE.MeshStandardMaterial({
      color: 0x9b7a4f,
      roughness: 0.88,
      metalness: 0.05
    });

    const woodDoorMat = new THREE.MeshStandardMaterial({
      map: textures.woodDoor,
      roughness: 0.72,
      metalness: 0.15
    });

    // Extended natural horizon ground (prevents floating box void)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    mapGroup.add(ground);

    // ==========================================
    // PERIMETER CITADEL WALLS + ARCHES
    // ==========================================
    addBox(mapGroup, 84, 8.5, 4, 0, 0, 52, wallMat);
    addBox(mapGroup, 84, 8.5, 4, 0, 0, -52, wallMat);
    addBox(mapGroup, 4, 8.5, 108, 38, 0, 0, wallMat);
    addBox(mapGroup, 4, 8.5, 108, -38, 0, 0, wallMat);

    // Distant Citadel Architecture & Palm Horizon (outside play zone)
    addBox(mapGroup, 14, 18, 14, -55, 0, -45, wallMat, false);
    addBox(mapGroup, 8, 26, 8, 56, 0, -35, wallMat, false);
    addBox(mapGroup, 16, 14, 16, 54, 0, 35, wallMat, false);
    addBox(mapGroup, 12, 22, 12, -52, 0, 42, wallMat, false);
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

    // Long Corner Blue Truck/Dumpster Cover + Pit Boxes
    addBox(mapGroup, 4.2, 2.3, 6.2, 30, 0, -4, new THREE.MeshStandardMaterial({ color: 0x2c5282, roughness: 0.55, metalness: 0.45 }));
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

    // Iconic Dust II Mid Double Doors (Leaves genuine narrow center sniper crack at x=0, z=-16!)
    addBox(mapGroup, 8, 7.0, 3, -8, 0, -16, wallMat);
    addBox(mapGroup, 8, 7.0, 3, 8, 0, -16, wallMat);
    addBox(mapGroup, 16, 2.0, 3.2, 0, 5.0, -16, trimStoneMat); // Doorway lintel
    // Heavy wooden doors slightly angled inward like CS2 Dust 2!
    const midDoorL = addBox(mapGroup, 3.2, 5.0, 0.6, -2.3, 0, -16.1, woodDoorMat);
    midDoorL.rotation.y = 0.25;
    const midDoorR = addBox(mapGroup, 3.2, 5.0, 0.6, 2.3, 0, -15.9, woodDoorMat);
    midDoorR.rotation.y = -0.22;

    // ==========================================
    // LANE 3: ROOFED B TUNNELS & FORTIFIED BOMBSITE B
    // ==========================================
    // B Tunnels Overhead Roof & Archways (Authentic interior tunnel lighting feel)
    addBox(mapGroup, 20, 1.2, 32, -25, 6.2, 6, trimStoneMat); // Tunnel ceiling
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
    id: 'dust',
    name: 'Dust II Citadel',
    nameAr: 'واحة الغبار (CS2 Dust II)',
    descriptionAr:
      'تصميم CS2 الأسطوري بثلاثة ممرات: شرفة التمركز، لونغ A، الميد والأبواب المزدوجة مع الكاتووك المرتفع، وأنفاق وموقع B المحصن',
    skyColor: 0xdbe9f6,
    fogColor: 0xe6d4bc,
    lightColor: 0xfff5e0,
    groundColor: 0xd8bd92,
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
// MAP 2: NUKE / VERTIGO REACTOR FACILITY (المجمع الصناعي - نسخة CS2)
// CS2 Tactical Architecture:
//   - Bright Source 2 Daylight + Overhead Skylights & Floodlights
//   - Site A (Reactor Core) with Elevated Rafters/Heaven Balcony (y = 3.2) & Ramp!
//   - Mid Yard with Corrugated Red/Blue Shipping Containers & Vent Connector
//   - Site B (Loading Bay) with Tactical Shipping Containers & Security Booth
// ==========================================================
export function getIndustrialFacility(): MapData {
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
        max: new THREE.Vector3(x + w / 2, y + h, z + d / 2)
      });
    }
    return mesh;
  };

  const addContainer = (group: THREE.Group, x: number, y: number, z: number, color = 0x2980b9, rot = 0) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: textures.container,
      roughness: 0.45,
      metalness: 0.4
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
      new THREE.MeshStandardMaterial({ color: 0xfacc15, map: textures.hazard, roughness: 0.4, metalness: 0.45 })
    );
    tankMesh.position.y = 2.2;
    tankMesh.castShadow = true;
    tankMesh.receiveShadow = true;

    const capMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.75 });
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.35, 20), capMat);
    topCap.position.y = 4.4;
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
      max: new THREE.Vector3(x + 1.6, y + 4.5, z + 1.6)
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
    mapGroup.name = 'IndustrialFacilityMap';

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xaab8c7,
      map: textures.concreteFloor,
      roughness: 0.62,
      metalness: 0.14
    });
    floorMat.map!.repeat.set(20, 20);

    const metalWallMat = new THREE.MeshStandardMaterial({
      color: 0xc2d0de,
      map: textures.metalPanel,
      roughness: 0.48,
      metalness: 0.28
    });
    metalWallMat.map!.repeat.set(6, 1);

    const steelBeamMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.4,
      metalness: 0.65
    });

    const hazardFloorMat = new THREE.MeshStandardMaterial({
      map: textures.hazard,
      roughness: 0.55,
      metalness: 0.25
    });

    // Extended Industrial Tarmac Ground
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    mapGroup.add(floor);

    // Distant Factory Cooling Towers & Hangars (outside playable area)
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.65, metalness: 0.2 });
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

    // Iconic Nuke Yard Containers (Red & Safety Orange)
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

    // Overhead Steel Trusses + High-Bay Floodlights
    const addTruss = (z: number) => {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(72, 1.0, 1.0), steelBeamMat);
      truss.position.set(0, 8.8, z);
      mapGroup.add(truss);
    };
    addTruss(24);
    addTruss(0);
    addTruss(-24);

    const addIndustrialFloodlight = (x: number, y: number, z: number, color: number, intensity: number, dist = 42) => {
      const light = new THREE.PointLight(color, intensity, dist, 1.0);
      light.position.set(x, y, z);
      mapGroup.add(light);

      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.9, 0.25, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      lens.position.set(x, y + 0.15, z);
      mapGroup.add(lens);

      const hood = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.3, 0.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x3e4a57, metalness: 0.7, roughness: 0.3 })
      );
      hood.position.set(x, y + 0.45, z);
      mapGroup.add(hood);
    };

    addIndustrialFloodlight(23, 8.2, -22, 0xe6f7ff, 2.8, 44);
    addIndustrialFloodlight(-23, 8.2, -22, 0xfff6ea, 2.8, 44);
    addIndustrialFloodlight(0, 8.2, 0, 0xffffff, 2.6, 40);
    addIndustrialFloodlight(0, 8.2, -18, 0xe8f4ff, 2.4, 36);
    addIndustrialFloodlight(24, 8.2, 10, 0xffeedd, 2.4, 36);
    addIndustrialFloodlight(-24, 8.2, 8, 0xffeedd, 2.4, 36);
    addIndustrialFloodlight(0, 8.2, 36, 0xfff8f0, 2.4, 36);
    addIndustrialFloodlight(0, 8.2, -36, 0xe8f4ff, 2.4, 36);

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
    id: 'factory',
    name: 'Nuke Reactor Facility',
    nameAr: 'المجمع النووي الصناعي (CS2 Nuke)',
    descriptionAr:
      'تصميم CS2 صناعي نقي وإضاءة نهارية واضحة: غرفة المفاعل (A) مع ممر Heaven العلوي، ساحة الحاويات، وممرات التهوية',
    skyColor: 0xdcebf7,
    fogColor: 0xd5e2ef,
    lightColor: 0xffffff,
    groundColor: 0xaab8c7,
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
