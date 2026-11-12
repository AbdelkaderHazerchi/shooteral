import * as THREE from 'three';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const E = new THREE.Euler();
const sn = Math.sin;
const cs = Math.cos;
const TAU = Math.PI * 2;
const mx = Math.max;

/* ===== Skeleton: [name, parentName, x, y, z] in rest world coords ===== */
export const BONE_DEFS: [string, string | number, number, number, number][] = [
  ['hips', 0, 0, 0.95, 0],
  ['spine', 'hips', 0, 1.05, 0],
  ['chest', 'spine', 0, 1.25, 0],
  ['neck', 'chest', 0, 1.5, 0],
  ['head', 'neck', 0, 1.58, 0],
  ['weapon', 'chest', 0, 1.3, 0],
  ['uArmL', 'chest', 0.26, 1.45, 0],
  ['fArmL', 'uArmL', 0.26, 1.13, 0],
  ['handL', 'fArmL', 0.26, 0.83, 0],
  ['uArmR', 'chest', -0.26, 1.45, 0],
  ['fArmR', 'uArmR', -0.26, 1.13, 0],
  ['handR', 'fArmR', -0.26, 0.83, 0],
  ['thighL', 'hips', 0.11, 0.92, 0],
  ['shinL', 'thighL', 0.11, 0.5, 0],
  ['footL', 'shinL', 0.11, 0.1, 0],
  ['thighR', 'hips', -0.11, 0.92, 0],
  ['shinR', 'thighR', -0.11, 0.5, 0],
  ['footR', 'shinR', -0.11, 0.1, 0]
];

export interface CharacterInstance {
  name: string;
  team: 'swat' | 'gang';
  bones: THREE.Bone[];
  by: Record<string, THREE.Bone>;
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  grip: { L: THREE.Vector3; R: THREE.Vector3 };
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
  act: Record<string, THREE.AnimationAction>;
  curActionName: string | null;
  playAnimation: (name: string, fadeDuration?: number) => void;
  headBone: THREE.Bone;
  chestBone: THREE.Bone;
}

/* ===== Material Group Slots ===== */
const MAT_SKIN = 0;
const MAT_FABRIC = 1;
const MAT_CORDURA = 2;
const MAT_POLYMER = 3;
const MAT_METAL = 4;
const MAT_LEATHER = 5;
const MAT_VISOR = 6;
const MAT_WOOD = 7;

/* ===== Procedural PBR Texture Cache (Shared across all characters) ===== */
interface CharTextureSet {
  fabricColor: THREE.CanvasTexture;
  fabricBump: THREE.CanvasTexture;
  corduraColor: THREE.CanvasTexture;
  corduraBump: THREE.CanvasTexture;
  polymerColor: THREE.CanvasTexture;
  polymerBump: THREE.CanvasTexture;
  leatherColor: THREE.CanvasTexture;
  leatherBump: THREE.CanvasTexture;
  skinColor: THREE.CanvasTexture;
  skinBump: THREE.CanvasTexture;
  metalColor: THREE.CanvasTexture;
}

let cachedTextures: CharTextureSet | null = null;

function makeCanvasTex(
  size: number,
  isColor: boolean,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void,
  repeat = 2
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getTextureSet(): CharTextureSet {
  if (cachedTextures) return cachedTextures;

  const rnd = mulberry32(42197);

  // 1. Ripstop / Twill Tactical Fabric
  const fabricColor = makeCanvasTex(
    256,
    true,
    (ctx, s) => {
      ctx.fillStyle = '#f2f3f5';
      ctx.fillRect(0, 0, s, s);
      // Fine twill diagonal weave
      ctx.strokeStyle = 'rgba(0,0,0,0.065)';
      ctx.lineWidth = 1;
      for (let i = -s; i < s * 2; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + s, s);
        ctx.stroke();
      }
      // Ripstop reinforcement grid
      ctx.strokeStyle = 'rgba(0,0,0,0.09)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < s; i += 16) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
      }
      // Subtle cloth micro-variation
      for (let i = 0; i < 1600; i++) {
        const v = Math.floor(215 + rnd() * 40);
        ctx.fillStyle = `rgba(${v},${v},${v},0.16)`;
        ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
      }
    },
    3
  );

  const fabricBump = makeCanvasTex(
    256,
    false,
    (ctx, s) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(220,220,220,0.35)';
      ctx.lineWidth = 1;
      for (let i = -s; i < s * 2; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + s, s);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < s; i += 16) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
      }
    },
    3
  );

  // 2. Heavy 1000D Ballistic Cordura + MOLLE Webbing
  const corduraColor = makeCanvasTex(
    256,
    true,
    (ctx, s) => {
      ctx.fillStyle = '#ededef';
      ctx.fillRect(0, 0, s, s);
      // Heavy basketweave
      for (let y = 0; y < s; y += 4) {
        for (let x = 0; x < s; x += 4) {
          const alt = ((x + y) / 4) % 2 === 0;
          ctx.fillStyle = alt ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
          ctx.fillRect(x, y, 3, 3);
        }
      }
      // Subtle horizontal PALS/MOLLE stitching bands
      for (let y = 16; y < s; y += 48) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, y, s, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, y + 1, s, 2);
        // Vertical bar-tack stitches
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        for (let x = 8; x < s; x += 32) {
          ctx.fillRect(x, y + 2, 2, 10);
        }
      }
    },
    2
  );

  const corduraBump = makeCanvasTex(
    256,
    false,
    (ctx, s) => {
      ctx.fillStyle = '#787878';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 4) {
        for (let x = 0; x < s; x += 4) {
          const alt = ((x + y) / 4) % 2 === 0;
          ctx.fillStyle = alt ? '#a8a8a8' : '#585858';
          ctx.fillRect(x, y, 3, 3);
        }
      }
      for (let y = 16; y < s; y += 48) {
        ctx.fillStyle = '#c8c8c8';
        ctx.fillRect(0, y, s, 14);
        ctx.fillStyle = '#404040';
        ctx.fillRect(0, y + 14, s, 2);
      }
    },
    2
  );

  // 3. Bead-Blasted Matte Tactical Polymer
  const polymerColor = makeCanvasTex(
    128,
    true,
    (ctx, s) => {
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1800; i++) {
        const shade = Math.floor(215 + rnd() * 38);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
      }
    },
    2
  );

  const polymerBump = makeCanvasTex(
    128,
    false,
    (ctx, s) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2000; i++) {
        const shade = Math.floor(90 + rnd() * 80);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
      }
    },
    2
  );

  // 4. Grained Tactical Leather & Boot Rubber
  const leatherColor = makeCanvasTex(
    128,
    true,
    (ctx, s) => {
      ctx.fillStyle = '#ececec';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 600; i++) {
        const v = Math.floor(195 + rnd() * 55);
        ctx.fillStyle = `rgba(${v},${v},${v},0.32)`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 1.2 + rnd() * 2.2, 0, TAU);
        ctx.fill();
      }
    },
    3
  );

  const leatherBump = makeCanvasTex(
    128,
    false,
    (ctx, s) => {
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 650; i++) {
        const v = Math.floor(110 + rnd() * 110);
        ctx.fillStyle = `rgba(${v},${v},${v},0.4)`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 1.2 + rnd() * 2.2, 0, TAU);
        ctx.fill();
      }
    },
    3
  );

  // 5. Organic Skin Micro-Pore Texture
  const skinColor = makeCanvasTex(
    128,
    true,
    (ctx, s) => {
      ctx.fillStyle = '#f8f5f3';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        const warm = rnd() > 0.5;
        ctx.fillStyle = warm ? 'rgba(225,180,160,0.12)' : 'rgba(255,235,220,0.12)';
        ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
      }
    },
    2
  );

  const skinBump = makeCanvasTex(
    128,
    false,
    (ctx, s) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        const v = Math.floor(115 + rnd() * 30);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
      }
    },
    2
  );

  // 6. Brushed Gunmetal Grain
  const metalColor = makeCanvasTex(
    128,
    true,
    (ctx, s) => {
      ctx.fillStyle = '#f0f1f4';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y++) {
        const v = Math.floor(220 + rnd() * 35);
        ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
        ctx.fillRect(0, y, s, 1);
      }
    },
    2
  );

  cachedTextures = {
    fabricColor,
    fabricBump,
    corduraColor,
    corduraBump,
    polymerColor,
    polymerBump,
    leatherColor,
    leatherBump,
    skinColor,
    skinBump,
    metalColor
  };
  return cachedTextures;
}

function createCharacterMaterials(): THREE.Material[] {
  const tex = getTextureSet();
  return [
    // 0: MAT_SKIN
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: tex.skinColor,
      bumpMap: tex.skinBump,
      bumpScale: 0.0025,
      roughness: 0.64,
      metalness: 0.02
    }),
    // 1: MAT_FABRIC
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      map: tex.fabricColor,
      bumpMap: tex.fabricBump,
      bumpScale: 0.007,
      roughness: 0.86,
      metalness: 0.02,
      sheen: 0.28,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(0xdbe4ee)
    }),
    // 2: MAT_CORDURA
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: tex.corduraColor,
      bumpMap: tex.corduraBump,
      bumpScale: 0.009,
      roughness: 0.76,
      metalness: 0.06
    }),
    // 3: MAT_POLYMER
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: tex.polymerColor,
      bumpMap: tex.polymerBump,
      bumpScale: 0.004,
      roughness: 0.42,
      metalness: 0.16
    }),
    // 4: MAT_METAL
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: tex.metalColor,
      roughness: 0.26,
      metalness: 0.88,
      envMapIntensity: 1.35
    }),
    // 5: MAT_LEATHER
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: tex.leatherColor,
      bumpMap: tex.leatherBump,
      bumpScale: 0.007,
      roughness: 0.54,
      metalness: 0.06
    }),
    // 6: MAT_VISOR
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.06,
      metalness: 0.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.9
    }),
    // 7: MAT_WOOD
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: tex.fabricColor,
      bumpMap: tex.leatherBump,
      bumpScale: 0.005,
      roughness: 0.56,
      metalness: 0.06
    })
  ];
}

/* ===== Sculpted Procedural Geometry Builders ===== */
interface LoftSlice {
  y: number;
  rx: number;
  rz: number;
  ox?: number;
  oz?: number;
  shade?: number;
}

/**
 * Generates an organic anatomical lofted mesh from elliptical cross-section slices
 * with smooth vertex normals and per-slice ambient-occlusion shading.
 */
function createEllipticalLoft(
  slices: LoftSlice[],
  radialSegs = 14,
  capBottom = true,
  capTop = true
): { geo: THREE.BufferGeometry; shades: number[] } {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vShades: number[] = [];

  const ringStride = radialSegs + 1;
  const minY = slices[0].y;
  const maxY = slices[slices.length - 1].y;
  const heightSpan = Math.max(0.001, maxY - minY);

  for (let s = 0; s < slices.length; s++) {
    const sl = slices[s];
    const v = (sl.y - minY) / heightSpan;
    const ox = sl.ox || 0;
    const oz = sl.oz || 0;
    const sh = sl.shade ?? 1.0;

    for (let i = 0; i <= radialSegs; i++) {
      const u = i / radialSegs;
      const theta = u * TAU;
      const x = ox + Math.sin(theta) * sl.rx;
      const z = oz + Math.cos(theta) * sl.rz;
      positions.push(x, sl.y, z);
      uvs.push(u, v);
      vShades.push(sh);
    }
  }

  for (let s = 0; s < slices.length - 1; s++) {
    for (let i = 0; i < radialSegs; i++) {
      const a = s * ringStride + i;
      const b = a + 1;
      const c = (s + 1) * ringStride + i;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  if (capBottom) {
    const s0 = slices[0];
    const centerIdx = positions.length / 3;
    positions.push(s0.ox || 0, s0.y, s0.oz || 0);
    uvs.push(0.5, 0);
    vShades.push((s0.shade ?? 1.0) * 0.9);
    for (let i = 0; i < radialSegs; i++) {
      indices.push(centerIdx, i + 1, i);
    }
  }

  if (capTop) {
    const last = slices[slices.length - 1];
    const base = (slices.length - 1) * ringStride;
    const centerIdx = positions.length / 3;
    positions.push(last.ox || 0, last.y, last.oz || 0);
    uvs.push(0.5, 1);
    vShades.push((last.shade ?? 1.0) * 0.95);
    for (let i = 0; i < radialSegs; i++) {
      indices.push(centerIdx, base + i, base + i + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Convert to non-indexed while tracking per-vertex shade multiplier
  const nonIndexed = geo.toNonIndexed();
  const nonIdxShades: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    nonIdxShades.push(vShades[indices[i]]);
  }
  geo.dispose();

  return { geo: nonIndexed, shades: nonIdxShades };
}

/**
 * Beveled rounded rectangle prism using ExtrudeGeometry for armor plates, pouches & hardware.
 */
function createBeveledBox(w: number, h: number, d: number, bevel = 0.008, radius = 0.014): THREE.BufferGeometry {
  const hw = Math.max(0.004, w / 2 - bevel);
  const hh = Math.max(0.004, h / 2 - bevel);
  const r = Math.min(radius, hw * 0.65, hh * 0.65);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const depth = Math.max(0.004, d - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Chamfered military SAPI ballistic plate silhouette (authentic hexagonal upper shoulders).
 */
function createSapiPlate(w: number, h: number, d: number, cutW = 0.065, cutH = 0.075, bevel = 0.012): THREE.BufferGeometry {
  const hw = w / 2 - bevel;
  const hh = h / 2 - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + 0.02, -hh);
  shape.lineTo(hw - 0.02, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + 0.02);
  shape.lineTo(hw, hh - cutH);
  shape.lineTo(hw - cutW, hh);
  shape.lineTo(-hw + cutW, hh);
  shape.lineTo(-hw, hh - cutH);
  shape.lineTo(-hw, -hh + 0.02);
  shape.quadraticCurveTo(-hw, -hh, -hw + 0.02, -hh);

  const depth = Math.max(0.01, d - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 3
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted High-Cut OPS-CORE FAST Ballistic Helmet Shell with ear arches & nape flare.
 */
function createFastHelmetShell(rx = 0.128, ry = 0.125, rz = 0.145): THREE.BufferGeometry {
  const segU = 24;
  const segV = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const vFrac = iv / segV;
    // Polar angle from crown (0) down to lower brim (~0.66 PI)
    const phi = vFrac * Math.PI * 0.64;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let iu = 0; iu <= segU; iu++) {
      const uFrac = iu / segU;
      const theta = uFrac * TAU; // 0 = front (+Z), PI/2 = left (+X), PI = back (-Z)
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      let x = rx * sinPhi * sinT;
      let y = ry * cosPhi;
      let z = rz * sinPhi * cosT;

      // High-cut ear arch cutout on left & right sides (when sinT is strong and cosT near 0)
      const sideFactor = Math.pow(Math.abs(sinT), 2.4) * Math.max(0, 1 - Math.abs(cosT) * 1.4);
      if (vFrac > 0.45 && sideFactor > 0.05) {
        const lift = (vFrac - 0.45) * 0.075 * sideFactor;
        y += lift;
      }

      // Subtle nape flare at rear lower brim (cosT < -0.3)
      if (cosT < -0.25 && vFrac > 0.6) {
        const rearWeight = (-cosT - 0.25) / 0.75;
        const brimWeight = (vFrac - 0.6) / 0.4;
        z -= 0.018 * rearWeight * brimWeight;
        y -= 0.022 * rearWeight * brimWeight;
      }

      // Subtle brow peak at front brim
      if (cosT > 0.5 && vFrac > 0.72) {
        z += 0.01 * ((cosT - 0.5) / 0.5) * ((vFrac - 0.72) / 0.28);
      }

      positions.push(x, y, z);
      uvs.push(uFrac, vFrac);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = (iv + 1) * stride + iu;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  // Add inner dark lining underside ring for thickness feel
  const rimStart = positions.length / 3;
  for (let iu = 0; iu <= segU; iu++) {
    const idx = segV * stride + iu;
    const px = positions[idx * 3] * 0.9;
    const py = positions[idx * 3 + 1] + 0.008;
    const pz = positions[idx * 3 + 2] * 0.9;
    positions.push(px, py, pz);
    uvs.push(iu / segU, 1);
  }
  for (let iu = 0; iu < segU; iu++) {
    const a = segV * stride + iu;
    const b = a + 1;
    const c = rimStart + iu;
    const d = c + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved wrap-around band/goggle/strap geometry hugging an elliptical body.
 */
function createCurvedBand(
  rx: number,
  rz: number,
  height: number,
  arcStart: number,
  arcEnd: number,
  thickness = 0.012,
  segs = 14
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segs; i++) {
    const a = arcStart + (arcEnd - arcStart) * (i / segs);
    const x = Math.sin(a) * (rx + thickness);
    const y = Math.cos(a) * (rz + thickness);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = segs; i >= 0; i--) {
    const a = arcStart + (arcEnd - arcStart) * (i / segs);
    const x = Math.sin(a) * rx;
    const y = Math.cos(a) * rz;
    shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -height / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted tactical boot footprint outsole with heel notch & toe taper.
 */
function createBootSole(w = 0.128, len = 0.285, h = 0.028): THREE.BufferGeometry {
  const hw = w / 2;
  const hl = len / 2;
  const shape = new THREE.Shape();
  // Footprint in XY (later rotated to XZ): +Y is front toe
  shape.moveTo(-hw * 0.72, -hl);
  shape.quadraticCurveTo(0, -hl - 0.015, hw * 0.72, -hl);
  shape.lineTo(hw * 0.84, -hl * 0.35);
  shape.lineTo(hw * 0.78, -hl * 0.05); // arch waist
  shape.lineTo(hw * 0.98, hl * 0.38);
  shape.quadraticCurveTo(hw * 0.96, hl * 0.9, 0, hl + 0.012);
  shape.quadraticCurveTo(-hw * 0.96, hl * 0.9, -hw * 0.98, hl * 0.38);
  shape.lineTo(-hw * 0.78, -hl * 0.05);
  shape.lineTo(-hw * 0.84, -hl * 0.35);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/* ===== Part Collector for SkinnedMesh Assembly ===== */
interface CollectedPart {
  boneIdx: number;
  matIdx: number;
  color: THREE.Color;
  geo: THREE.BufferGeometry;
  shades?: number[];
  shadeBottom?: number;
  shadeTop?: number;
}

class CharacterMeshAssembler {
  private parts: CollectedPart[] = [];
  private boneLookup: Record<string, number> = {};

  constructor() {
    BONE_DEFS.forEach((b, i) => {
      this.boneLookup[b[0]] = i;
    });
  }

  public add(
    bone: string,
    matIdx: number,
    colorHex: number,
    geo: THREE.BufferGeometry,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    shadeBottom = 0.88,
    shadeTop = 1.04
  ) {
    if (rx !== 0) geo.rotateX(rx);
    if (ry !== 0) geo.rotateY(ry);
    if (rz !== 0) geo.rotateZ(rz);
    if (x !== 0 || y !== 0 || z !== 0) geo.translate(x, y, z);

    const nonIdx = geo.index ? geo.toNonIndexed() : geo;
    if (!nonIdx.attributes.normal) nonIdx.computeVertexNormals();
    if (!nonIdx.attributes.uv) {
      const count = nonIdx.attributes.position.count;
      const uv = new Float32Array(count * 2);
      const pos = nonIdx.attributes.position;
      for (let i = 0; i < count; i++) {
        uv[i * 2] = pos.getX(i) * 3.0 + pos.getZ(i) * 2.0;
        uv[i * 2 + 1] = pos.getY(i) * 3.0;
      }
      nonIdx.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }

    this.parts.push({
      boneIdx: this.boneLookup[bone] ?? 0,
      matIdx,
      color: new THREE.Color(colorHex),
      geo: nonIdx,
      shadeBottom,
      shadeTop
    });
  }

  public addLoft(
    bone: string,
    matIdx: number,
    colorHex: number,
    slices: LoftSlice[],
    radialSegs = 14,
    capBottom = true,
    capTop = true
  ) {
    const { geo, shades } = createEllipticalLoft(slices, radialSegs, capBottom, capTop);
    this.parts.push({
      boneIdx: this.boneLookup[bone] ?? 0,
      matIdx,
      color: new THREE.Color(colorHex),
      geo,
      shades
    });
  }

  public addMirror(
    bonePrefix: string,
    matIdx: number,
    colorHex: number,
    mk: () => THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    mirrorRy = false
  ) {
    this.add(bonePrefix + 'L', matIdx, colorHex, mk(), x, y, z, rx, ry, rz);
    this.add(bonePrefix + 'R', matIdx, colorHex, mk(), -x, y, z, rx, mirrorRy ? -ry : ry, mirrorRy ? -rz : rz);
  }

  public buildGeometry(): THREE.BufferGeometry {
    // Group parts by material index so we emit clean geometry.groups
    const buckets: CollectedPart[][] = Array.from({ length: 8 }, () => []);
    for (const part of this.parts) {
      buckets[part.matIdx].push(part);
    }

    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const si: number[] = [];
    const sw: number[] = [];

    const geo = new THREE.BufferGeometry();
    let vertexCursor = 0;

    for (let matIdx = 0; matIdx < buckets.length; matIdx++) {
      const list = buckets[matIdx];
      if (list.length === 0) continue;

      const groupStart = vertexCursor;

      for (const part of list) {
        const p = part.geo.attributes.position;
        const n = part.geo.attributes.normal;
        const u = part.geo.attributes.uv;
        const cc = part.color;

        let minY = Infinity;
        let maxY = -Infinity;
        if (!part.shades) {
          for (let i = 0; i < p.count; i++) {
            const py = p.getY(i);
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }
        const ySpan = Math.max(0.001, maxY - minY);

        for (let i = 0; i < p.count; i++) {
          const px = p.getX(i);
          const py = p.getY(i);
          const pz = p.getZ(i);
          pos.push(px, py, pz);
          nor.push(n.getX(i), n.getY(i), n.getZ(i));
          uv.push(u.getX(i), u.getY(i));

          let shade = 1.0;
          if (part.shades) {
            shade = part.shades[i];
          } else {
            const t = (py - minY) / ySpan;
            shade = (part.shadeBottom ?? 0.9) + t * ((part.shadeTop ?? 1.04) - (part.shadeBottom ?? 0.9));
          }

          col.push(
            Math.min(1, cc.r * shade),
            Math.min(1, cc.g * shade),
            Math.min(1, cc.b * shade)
          );
          si.push(part.boneIdx, 0, 0, 0);
          sw.push(1, 0, 0, 0);
        }

        vertexCursor += p.count;
        part.geo.dispose();
      }

      geo.addGroup(groupStart, vertexCursor - groupStart, matIdx);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

    return geo;
  }
}

/* ===== Anatomy & Shared Humanoid Base Builder ===== */
interface FactionPalette {
  name: string;
  label: string;
  skin: number;
  shirt: number;
  shirtShadow: number;
  sleeve: number;
  pants: number;
  boots: number;
  sole: number;
  gloves: number;
  wp: 'rifle' | 'smg';
  fingerlessGloves?: boolean;
}

const PALETTES: Record<'swat' | 'gang', FactionPalette> = {
  swat: {
    name: 'SpecialForces',
    label: 'القوات الخاصة',
    skin: 0xd7a07a,
    shirt: 0x222c3c,
    shirtShadow: 0x1b2330,
    sleeve: 0x242e3e,
    pants: 0x1d2532,
    boots: 0x15171c,
    sole: 0x0c0d10,
    gloves: 0x171a20,
    wp: 'rifle'
  },
  gang: {
    name: 'Gang',
    label: 'العصابة',
    skin: 0x996342,
    shirt: 0xd8dadf,
    shirtShadow: 0xbac0c9,
    sleeve: 0x996342,
    pants: 0x2c4668,
    boots: 0x262930,
    sole: 0xd8d8dc,
    gloves: 0x231d1a,
    wp: 'smg',
    fingerlessGloves: true
  }
};

function buildAnatomicalBody(asm: CharacterMeshAssembler, pal: FactionPalette, isSwat: boolean) {
  const Cy = (rt: number, rb: number, l: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, l, seg);
  const Sp = (rx: number, ry: number, rz: number, wSeg = 12, hSeg = 8) => {
    const g = new THREE.SphereGeometry(1, wSeg, hSeg);
    g.scale(rx, ry, rz);
    return g;
  };

  // --- 1. HIPS / PELVIS & WAIST TRANSITION ---
  asm.addLoft(
    'hips',
    MAT_FABRIC,
    pal.pants,
    [
      { y: 0.86, rx: 0.175, rz: 0.112, shade: 0.85 },
      { y: 0.94, rx: 0.184, rz: 0.12, oz: -0.004, shade: 0.95 },
      { y: 1.03, rx: 0.168, rz: 0.11, shade: 0.92 }
    ],
    16
  );

  // --- 2. SPINE / ABDOMEN ---
  asm.addLoft(
    'spine',
    MAT_FABRIC,
    pal.shirtShadow,
    [
      { y: 1.0, rx: 0.158, rz: 0.102, shade: 0.86 },
      { y: 1.1, rx: 0.168, rz: 0.11, oz: 0.004, shade: 0.96 },
      { y: 1.22, rx: 0.182, rz: 0.118, oz: 0.008, shade: 1.0 }
    ],
    16
  );

  // --- 3. ATHLETIC CHEST / RIBCAGE / SHOULDERS ---
  asm.addLoft(
    'chest',
    MAT_FABRIC,
    pal.shirt,
    [
      { y: 1.18, rx: 0.174, rz: 0.114, oz: 0.006, shade: 0.9 },
      { y: 1.29, rx: 0.198, rz: 0.128, oz: 0.012, shade: 1.02 },
      { y: 1.38, rx: 0.214, rz: 0.132, oz: 0.014, shade: 1.06 },
      { y: 1.46, rx: 0.19, rz: 0.106, oz: 0.004, shade: 0.98 },
      { y: 1.5, rx: 0.088, rz: 0.082, shade: 0.88 }
    ],
    18
  );

  // Shirt Collar / Turtleneck base
  asm.addLoft(
    'chest',
    MAT_FABRIC,
    isSwat ? 0x181f2a : 0xc5c8cf,
    [
      { y: 1.47, rx: 0.092, rz: 0.086, shade: 0.9 },
      { y: 1.52, rx: 0.074, rz: 0.072, shade: 1.0 }
    ],
    14
  );

  // --- 4. NECK & ANATOMICAL SCULPTED HEAD ---
  asm.addLoft(
    'neck',
    MAT_SKIN,
    isSwat ? 0x171a20 : pal.skin, // SWAT wears dark tactical balaclava neck gaiter
    [
      { y: 1.48, rx: 0.068, rz: 0.068, shade: 0.84 },
      { y: 1.55, rx: 0.058, rz: 0.06, shade: 0.96 },
      { y: 1.6, rx: 0.056, rz: 0.058, shade: 0.9 }
    ],
    12
  );

  // Head cranial loft (chin -> cheekbones -> brow -> crown)
  const headBaseColor = isSwat ? 0x1a1e25 : pal.skin; // SWAT has tactical balaclava
  asm.addLoft(
    'head',
    isSwat ? MAT_FABRIC : MAT_SKIN,
    headBaseColor,
    [
      { y: 1.565, rx: 0.058, rz: 0.068, oz: 0.022, shade: 0.82 },
      { y: 1.615, rx: 0.082, rz: 0.092, oz: 0.012, shade: 0.94 },
      { y: 1.675, rx: 0.094, rz: 0.104, oz: 0.008, shade: 1.02 },
      { y: 1.735, rx: 0.095, rz: 0.108, oz: 0.004, shade: 1.04 },
      { y: 1.785, rx: 0.085, rz: 0.098, oz: -0.005, shade: 0.98 },
      { y: 1.825, rx: 0.044, rz: 0.052, oz: -0.008, shade: 0.92 }
    ],
    16
  );

  // Skin cutout eye-bridge on SWAT balaclava or facial features on Gang
  if (isSwat) {
    // Exposed skin around eyes beneath balaclava opening
    asm.add('head', MAT_SKIN, pal.skin, createBeveledBox(0.125, 0.045, 0.032, 0.006, 0.012), 0, 1.705, 0.094);
  } else {
    // Sculpted Nose Bridge
    asm.add('head', MAT_SKIN, pal.skin, createBeveledBox(0.026, 0.052, 0.03, 0.007, 0.008), 0, 1.685, 0.106, -0.18, 0, 0, 0.9, 1.05);
    // Brow Ridge
    asm.add('head', MAT_SKIN, pal.skin, createBeveledBox(0.145, 0.022, 0.028, 0.006, 0.008), 0, 1.732, 0.098, 0, 0, 0, 0.86, 0.98);
    // Ears
    [-1, 1].forEach((sg) => {
      asm.add('head', MAT_SKIN, pal.skin, Sp(0.016, 0.032, 0.022, 8, 6), sg * 0.098, 1.69, -0.006);
    });
  }

  // --- 5. ARMS (SHOULDERS, BICEPS, ELBOWS, FOREARMS, HANDS) ---
  ([-1, 1] as const).forEach((sg) => {
    const side = sg === 1 ? 'L' : 'R';
    const xA = sg * 0.26;

    // Deltoid shoulder sphere cap (prevents gap when raising arm)
    asm.add('uArm' + side, MAT_FABRIC, isSwat ? pal.sleeve : pal.shirt, Sp(0.072, 0.074, 0.072, 12, 8), xA, 1.44, 0);

    if (!isSwat) {
      // Gang: rolled heather-grey short sleeve cuff at mid-bicep
      asm.addLoft(
        'uArm' + side,
        MAT_FABRIC,
        pal.shirt,
        [
          { y: 1.31, rx: 0.066, rz: 0.068, ox: xA, shade: 0.92 },
          { y: 1.39, rx: 0.068, rz: 0.07, ox: xA, shade: 1.02 },
          { y: 1.46, rx: 0.066, rz: 0.068, ox: xA, shade: 1.0 }
        ],
        12
      );
      // Rolled hem ring
      asm.add('uArm' + side, MAT_FABRIC, pal.shirtShadow, Cy(0.069, 0.068, 0.022, 12), xA, 1.31, 0);
      // Muscular bare skin lower bicep
      asm.addLoft(
        'uArm' + side,
        MAT_SKIN,
        pal.skin,
        [
          { y: 1.12, rx: 0.052, rz: 0.054, ox: xA, shade: 0.88 },
          { y: 1.22, rx: 0.06, rz: 0.062, ox: xA, shade: 1.0 },
          { y: 1.31, rx: 0.062, rz: 0.064, ox: xA, shade: 0.95 }
        ],
        12
      );
    } else {
      // SWAT: full tactical BDU combat sleeve
      asm.addLoft(
        'uArm' + side,
        MAT_FABRIC,
        pal.sleeve,
        [
          { y: 1.12, rx: 0.056, rz: 0.058, ox: xA, shade: 0.88 },
          { y: 1.28, rx: 0.065, rz: 0.068, ox: xA, shade: 1.02 },
          { y: 1.44, rx: 0.068, rz: 0.07, ox: xA, shade: 1.0 }
        ],
        12
      );
    }

    // Elbow joint cap (seamless bend at y=1.13)
    asm.add('fArm' + side, isSwat ? MAT_FABRIC : MAT_SKIN, pal.sleeve, Sp(0.054, 0.054, 0.054, 10, 8), xA, 1.13, 0);

    // Tapered Forearm
    asm.addLoft(
      'fArm' + side,
      isSwat ? MAT_FABRIC : MAT_SKIN,
      pal.sleeve,
      [
        { y: 0.84, rx: 0.041, rz: 0.044, ox: xA, shade: 0.9 },
        { y: 0.98, rx: 0.049, rz: 0.052, ox: xA, shade: 0.98 },
        { y: 1.11, rx: 0.056, rz: 0.058, ox: xA, shade: 1.02 }
      ],
      12
    );

    if (isSwat) {
      // Velcro tactical sleeve cuff at wrist
      asm.add('fArm' + side, MAT_CORDURA, 0x161b24, Cy(0.047, 0.045, 0.04, 12), xA, 0.86, 0);
    }

    // --- Sculpted Gloved Hand ---
    // Wrist strap
    asm.add('hand' + side, MAT_LEATHER, 0x131519, Cy(0.042, 0.042, 0.028, 10), xA, 0.835, 0);
    // Sculpted palm block
    asm.add('hand' + side, MAT_LEATHER, pal.gloves, createBeveledBox(0.062, 0.075, 0.078, 0.01, 0.014), xA, 0.785, 0.008);
    // Hard knuckle guard plate
    asm.add('hand' + side, MAT_POLYMER, 0x1d2026, createBeveledBox(0.066, 0.022, 0.036, 0.005, 0.008), xA, 0.78, 0.032);
    // Finger bank (skin fingertips if fingerless gloves for Gang!)
    const fingerMat = pal.fingerlessGloves ? MAT_SKIN : MAT_LEATHER;
    const fingerCol = pal.fingerlessGloves ? pal.skin : pal.gloves;
    asm.add('hand' + side, fingerMat, fingerCol, createBeveledBox(0.056, 0.036, 0.048, 0.008, 0.01), xA, 0.735, 0.016);
    // Thumb
    asm.add(
      'hand' + side,
      fingerMat,
      fingerCol,
      createBeveledBox(0.024, 0.046, 0.028, 0.006, 0.008),
      xA - sg * 0.034,
      0.775,
      0.028,
      0.2,
      0,
      sg * 0.25
    );
  });

  // --- 6. LEGS (THIGHS, KNEES, CALVES, BOOTS) ---
  ([-1, 1] as const).forEach((sg) => {
    const side = sg === 1 ? 'L' : 'R';
    const xL = sg * 0.11;

    // Hip joint overlap sphere
    asm.add('thigh' + side, MAT_FABRIC, pal.pants, Sp(0.092, 0.09, 0.095, 10, 8), xL, 0.91, 0);

    // Muscular tapered thigh
    asm.addLoft(
      'thigh' + side,
      MAT_FABRIC,
      pal.pants,
      [
        { y: 0.5, rx: 0.068, rz: 0.072, ox: xL, shade: 0.86 },
        { y: 0.65, rx: 0.082, rz: 0.088, ox: xL, oz: 0.006, shade: 0.96 },
        { y: 0.82, rx: 0.094, rz: 0.1, ox: xL, oz: 0.004, shade: 1.02 },
        { y: 0.93, rx: 0.092, rz: 0.096, ox: xL, shade: 0.94 }
      ],
      14
    );

    // Cargo side pocket on outer thigh
    asm.add(
      'thigh' + side,
      MAT_FABRIC,
      pal.pants,
      createBeveledBox(0.028, 0.145, 0.115, 0.008, 0.014),
      xL + sg * 0.084,
      0.71,
      -0.005,
      0,
      0,
      0,
      0.86,
      1.0
    );

    // Knee joint overlap sphere (seamless bend at y=0.50)
    asm.add('shin' + side, MAT_FABRIC, pal.pants, Sp(0.068, 0.068, 0.07, 10, 8), xL, 0.5, 0);

    // Calf / Shin with gastrocnemius curve & bloused boot cuff
    asm.addLoft(
      'shin' + side,
      MAT_FABRIC,
      pal.pants,
      [
        { y: 0.15, rx: 0.056, rz: 0.06, ox: xL, shade: 0.84 },
        { y: 0.22, rx: 0.068, rz: 0.072, ox: xL, shade: 0.94 }, // bloused pants fold over boot top
        { y: 0.36, rx: 0.072, rz: 0.08, ox: xL, oz: -0.012, shade: 1.02 },
        { y: 0.5, rx: 0.068, rz: 0.072, ox: xL, shade: 0.92 }
      ],
      14
    );

    // --- Multi-Part Tactical Combat Boot (ground contact at y = 0.00) ---
    // 1. Lugged Outsole
    asm.add('foot' + side, MAT_LEATHER, pal.sole, createBootSole(0.126, 0.282, 0.024), xL, 0.006, 0.048, 0, 0, 0, 0.85, 0.98);
    // 2. Boot Midsole / Upper Foot Chassis
    asm.add('foot' + side, MAT_LEATHER, pal.boots, createBootSole(0.116, 0.268, 0.036), xL, 0.03, 0.048, 0, 0, 0, 0.9, 1.02);
    // 3. Rounded Toe Box
    asm.add('foot' + side, MAT_LEATHER, pal.boots, Sp(0.056, 0.038, 0.068, 10, 8), xL, 0.052, 0.125);
    // 4. Laced Ankle Shaft & Padded Collar
    asm.addLoft(
      'foot' + side,
      MAT_LEATHER,
      pal.boots,
      [
        { y: 0.045, rx: 0.058, rz: 0.068, ox: xL, oz: -0.004, shade: 0.9 },
        { y: 0.12, rx: 0.054, rz: 0.062, ox: xL, oz: -0.004, shade: 1.0 },
        { y: 0.18, rx: 0.056, rz: 0.062, ox: xL, oz: -0.006, shade: 0.94 }
      ],
      12
    );
    // 5. Boot Heel Counter & Lace Ridge
    asm.add('foot' + side, MAT_POLYMER, 0x111317, createBeveledBox(0.042, 0.065, 0.025, 0.005, 0.008), xL, 0.105, 0.058, -0.35, 0, 0);
  });
}

/* ===== SWAT / Tier-1 Special Forces Tactical Equipment ===== */
function addSwatEquipment(asm: CharacterMeshAssembler) {
  const vest = 0x2b3442;
  const corduraDk = 0x202733;
  const tan = 0x877756;
  const armor = 0x28303b;
  const helmetCol = 0x2f3846;
  const metal = 0x3b424d;

  // 1. Crye JPC / AVS Ballistic Plate Carrier (Front & Back Chamfered SAPI Plates)
  asm.add('chest', MAT_CORDURA, vest, createSapiPlate(0.32, 0.31, 0.065, 0.06, 0.014), 0, 1.335, 0.122, -0.04, 0, 0, 0.88, 1.05);
  asm.add('chest', MAT_CORDURA, vest, createSapiPlate(0.31, 0.3, 0.06, 0.06, 0.014), 0, 1.335, -0.118, 0.04, 0, 0, 0.86, 1.02);

  // Padded Shoulder Straps connecting front & back plates
  [-0.12, 0.12].forEach((x) => {
    asm.add('chest', MAT_CORDURA, corduraDk, createBeveledBox(0.072, 0.032, 0.24, 0.008, 0.01), x, 1.48, 0.0);
  });

  // Side MOLLE Cummerbund wrapping ribcage
  asm.add('chest', MAT_CORDURA, corduraDk, createBeveledBox(0.415, 0.135, 0.225, 0.012, 0.02), 0, 1.245, 0.0, 0, 0, 0, 0.86, 0.98);
  asm.add('spine', MAT_CORDURA, corduraDk, createBeveledBox(0.365, 0.11, 0.22, 0.012, 0.02), 0, 1.15, 0.0, 0, 0, 0, 0.84, 0.96);

  // Front Loadout: Triple 5.56 Rifle Magazine Pouches + Polymer Mag Tops
  [-0.092, 0, 0.092].forEach((x) => {
    asm.add('chest', MAT_CORDURA, tan, createBeveledBox(0.078, 0.125, 0.048, 0.008, 0.01), x, 1.255, 0.165);
    // Curved PMAG magazine peeking from top of pouch
    asm.add('chest', MAT_POLYMER, 0x1b1e24, createBeveledBox(0.064, 0.055, 0.032, 0.005, 0.006), x, 1.32, 0.165);
    // Elastic retention cord strap across front
    asm.add('chest', MAT_METAL, 0x181a1f, createBeveledBox(0.07, 0.014, 0.052, 0.002, 0.003), x, 1.28, 0.166);
  });

  // Upper Chest Admin Pouch + Subdued Morale Patch + Blue Chem-light
  asm.add('chest', MAT_CORDURA, corduraDk, createBeveledBox(0.155, 0.08, 0.034, 0.006, 0.008), 0, 1.405, 0.158);
  asm.add('chest', MAT_FABRIC, 0x3b82f6, createBeveledBox(0.072, 0.038, 0.01, 0.002, 0.004), 0.02, 1.41, 0.175);

  // PRC-152 Tactical Radio on Left Chest + Whip Antenna over Shoulder
  asm.add('chest', MAT_POLYMER, 0x1c2026, createBeveledBox(0.058, 0.125, 0.045, 0.006, 0.008), 0.145, 1.375, 0.14, 0, 0.25, 0);
  asm.add('chest', MAT_METAL, 0x111216, new THREE.CylinderGeometry(0.007, 0.009, 0.24, 8), 0.158, 1.54, 0.11, -0.18, 0, -0.08);

  // Assault Hydration / Back Pack Panel
  asm.add('chest', MAT_CORDURA, corduraDk, createBeveledBox(0.24, 0.27, 0.095, 0.014, 0.02), 0, 1.34, -0.18, 0, 0, 0, 0.85, 1.0);
  asm.add('chest', MAT_CORDURA, tan, createBeveledBox(0.17, 0.11, 0.04, 0.008, 0.012), 0, 1.27, -0.228);

  // 2. Shoulder Tactical Armor Pads + Subdued Flag Patch
  asm.addMirror(
    'uArm',
    MAT_CORDURA,
    armor,
    () => createBeveledBox(0.06, 0.14, 0.125, 0.012, 0.022),
    0.312,
    1.41,
    0.0,
    0,
    0,
    0.12,
    true
  );
  asm.addMirror(
    'uArm',
    MAT_FABRIC,
    0x475569,
    () => createBeveledBox(0.014, 0.048, 0.072, 0.003, 0.004),
    0.34,
    1.418,
    0.0,
    0,
    0,
    0.12,
    true
  );

  // 3. Padded Tactical War Belt + Cobra Metal Buckle + Rear IFAK Medkit
  asm.add('hips', MAT_CORDURA, 0x181c23, createCurvedBand(0.184, 0.12, 0.068, 0, TAU, 0.016, 18), 0, 1.025, 0);
  // Metallic Cobra Buckle at front
  asm.add('hips', MAT_METAL, 0x64748b, createBeveledBox(0.075, 0.048, 0.026, 0.004, 0.005), 0, 1.025, 0.132);
  // Rear IFAK Trauma Kit Pouch + Red Cross Tag
  asm.add('hips', MAT_CORDURA, tan, createBeveledBox(0.15, 0.095, 0.068, 0.01, 0.014), 0, 1.02, -0.15);
  asm.add('hips', MAT_FABRIC, 0xc81e1e, createBeveledBox(0.036, 0.036, 0.012, 0.002, 0.003), 0, 1.02, -0.186);
  // Left Hip Dump Pouch
  asm.add('hips', MAT_CORDURA, corduraDk, createBeveledBox(0.055, 0.145, 0.11, 0.01, 0.014), 0.195, 0.97, -0.01);

  // 4. Drop-Leg Kydex Pistol Holster on Right Thigh + Dual Leg Straps
  asm.add('thighR', MAT_POLYMER, 0x1a1e26, createBeveledBox(0.055, 0.165, 0.1, 0.008, 0.014), -0.215, 0.77, 0.015);
  // Holstered pistol grip peeking out
  asm.add('thighR', MAT_POLYMER, 0x111318, createBeveledBox(0.035, 0.085, 0.042, 0.005, 0.006), -0.222, 0.865, -0.01, -0.3, 0, 0.1);
  // Wrap-around thigh straps
  [0.81, 0.72].forEach((yPos) => {
    asm.add('thighR', MAT_CORDURA, 0x161920, createCurvedBand(0.092, 0.096, 0.024, 0, TAU, 0.008, 14), -0.11, yPos, 0);
  });

  // 5. Contoured Hard-Shell Knee Pads (Both Knees)
  asm.addMirror(
    'shin',
    MAT_POLYMER,
    0x1e242d,
    () => createBeveledBox(0.105, 0.115, 0.042, 0.012, 0.025),
    0.11,
    0.49,
    0.072
  );
  asm.addMirror(
    'shin',
    MAT_CORDURA,
    corduraDk,
    () => createCurvedBand(0.072, 0.076, 0.028, 0, TAU, 0.006, 12),
    0.11,
    0.48,
    0
  );

  // 6. OPS-CORE FAST High-Cut Ballistic Helmet + NVG + ComTac Headset + Ballistic Goggles
  asm.add('head', MAT_POLYMER, helmetCol, createFastHelmetShell(0.128, 0.125, 0.145), 0, 1.725, -0.005, 0, 0, 0, 0.88, 1.05);
  // Top Velcro Loop Panel & IR Strobe Beacon
  asm.add('head', MAT_CORDURA, 0x1d232c, createBeveledBox(0.095, 0.018, 0.11, 0.004, 0.01), 0, 1.845, -0.02);
  asm.add('head', MAT_POLYMER, 0x161920, createBeveledBox(0.044, 0.024, 0.052, 0.005, 0.006), 0, 1.862, -0.025);
  // Rear Counterweight Battery Pack
  asm.add('head', MAT_CORDURA, tan, createBeveledBox(0.11, 0.062, 0.042, 0.008, 0.01), 0, 1.72, -0.148);
  // ARC Side Accessory Rails
  [-1, 1].forEach((sg) => {
    asm.add('head', MAT_POLYMER, 0x1f252e, createBeveledBox(0.016, 0.028, 0.125, 0.004, 0.006), sg * 0.122, 1.755, 0.01, -0.1, sg * 0.18, 0);
  });
  // Right-Rail Tactical Helmet Flashlight
  asm.add('head', MAT_METAL, metal, new THREE.CylinderGeometry(0.014, 0.014, 0.082, 10).rotateX(Math.PI / 2), -0.132, 1.77, 0.03);
  asm.add('head', MAT_VISOR, 0x93c5fd, new THREE.CylinderGeometry(0.012, 0.012, 0.008, 10).rotateX(Math.PI / 2), -0.132, 1.77, 0.072);

  // Wilcox NVG Forehead Shroud + Dual-Tube PVS-31 Night Vision Goggles (tilted up cleanly)
  asm.add('head', MAT_METAL, metal, createBeveledBox(0.048, 0.054, 0.022, 0.004, 0.006), 0, 1.79, 0.138, -0.18, 0, 0);
  asm.add('head', MAT_METAL, 0x1c2026, createBeveledBox(0.032, 0.028, 0.056, 0.004, 0.006), 0, 1.815, 0.162, -0.35, 0, 0);
  // NVG Bridge + Twin Optical Tubes
  asm.add('head', MAT_POLYMER, 0x15181d, createBeveledBox(0.105, 0.02, 0.024, 0.004, 0.006), 0, 1.832, 0.182);
  [-0.042, 0.042].forEach((x) => {
    asm.add('head', MAT_POLYMER, 0x171b21, new THREE.CylinderGeometry(0.021, 0.023, 0.088, 12).rotateX(Math.PI / 2), x, 1.84, 0.175, -0.58, 0, 0);
    // Blue-coated NVG glass objective lens
    asm.add('head', MAT_VISOR, 0x38bdf8, new THREE.CylinderGeometry(0.017, 0.017, 0.008, 12).rotateX(Math.PI / 2), x, 1.864, 0.212, -0.58, 0, 0);
  });

  // Peltor ComTac Tactical Headset (Ear Cups + Boom Mic)
  [-1, 1].forEach((sg) => {
    asm.add('head', MAT_POLYMER, 0x262d36, createBeveledBox(0.036, 0.086, 0.072, 0.012, 0.028), sg * 0.118, 1.695, -0.008);
    asm.add('head', MAT_LEATHER, 0x111317, createBeveledBox(0.016, 0.072, 0.058, 0.005, 0.02), sg * 0.104, 1.695, -0.008);
  });
  // Boom microphone curving from left ear cup to mouth
  asm.add('head', MAT_METAL, 0x15181d, new THREE.CylinderGeometry(0.004, 0.004, 0.11, 6).rotateX(Math.PI / 2), 0.095, 1.645, 0.055, 0.35, -0.42, 0);
  asm.add('head', MAT_POLYMER, 0x0e1014, new THREE.SphereGeometry(0.012, 8, 6), 0.055, 1.622, 0.105);

  // Curved Ballistic Tactical Goggles + Elastic Strap
  asm.add('head', MAT_POLYMER, 0x181c22, createCurvedBand(0.098, 0.11, 0.058, -0.78, 0.78, 0.016, 12), 0, 1.705, 0.006);
  asm.add('head', MAT_VISOR, 0x4ea8de, createCurvedBand(0.102, 0.114, 0.044, -0.68, 0.68, 0.012, 12), 0, 1.705, 0.009);
  asm.add('head', MAT_CORDURA, 0x1a1e24, createCurvedBand(0.124, 0.142, 0.028, 0.78, TAU - 0.78, 0.007, 16), 0, 1.72, -0.004);
}

/* ===== Gang / Tactical Mercenary Equipment ===== */
function addGangEquipment(asm: CharacterMeshAssembler) {
  const rig = 0x262b26; // Charcoal-olive tactical chest rig
  const rigStrap = 0x1e221e;
  const crimson = 0xa81c1c;
  const brass = 0xd4a338;
  const leather = 0x2a1d17;
  const bakelite = 0x8f3f1d;

  // 1. Subtle Gold Chain / Dog-Tag Necklace on Shirt Collar
  asm.add('chest', MAT_METAL, brass, createCurvedBand(0.088, 0.084, 0.01, -1.1, 1.1, 0.008, 12), 0, 1.465, 0.02, 0.32, 0, 0);
  asm.add('chest', MAT_METAL, brass, createBeveledBox(0.024, 0.036, 0.006, 0.002, 0.004), 0, 1.418, 0.128, -0.15, 0, 0);

  // 2. Low-Profile Tactical AK Chest Rig (Split-Front / Chicom Rig over Light Henley)
  asm.add('chest', MAT_CORDURA, rig, createBeveledBox(0.35, 0.165, 0.255, 0.014, 0.02), 0, 1.255, 0.008, 0, 0, 0, 0.86, 1.02);
  // Harness shoulder straps over chest & back
  [-0.105, 0.105].forEach((x) => {
    asm.add('chest', MAT_CORDURA, rigStrap, createBeveledBox(0.052, 0.18, 0.022, 0.005, 0.008), x, 1.385, 0.122, -0.12, 0, 0);
    asm.add('chest', MAT_CORDURA, rigStrap, createBeveledBox(0.052, 0.18, 0.022, 0.005, 0.008), x, 1.385, -0.11, 0.12, 0, 0);
    asm.add('chest', MAT_CORDURA, rigStrap, createBeveledBox(0.054, 0.024, 0.23, 0.005, 0.008), x, 1.478, 0.006);
    // Metal D-ring buckles on shoulder straps
    asm.add('chest', MAT_METAL, 0x4b5563, createBeveledBox(0.044, 0.022, 0.026, 0.003, 0.004), x, 1.355, 0.13);
  });

  // 3 Curved AK Magazine Pouches across front rig + Bakelite AK Mag Tops
  [-0.092, 0, 0.092].forEach((x) => {
    asm.add('chest', MAT_CORDURA, 0x2d332d, createBeveledBox(0.076, 0.125, 0.048, 0.008, 0.01), x, 1.255, 0.145);
    asm.add('chest', MAT_WOOD, bakelite, createBeveledBox(0.056, 0.045, 0.032, 0.005, 0.006), x, 1.32, 0.146, 0, 0, 0.08);
    asm.add('chest', MAT_LEATHER, leather, createBeveledBox(0.068, 0.024, 0.052, 0.004, 0.005), x, 1.28, 0.148);
  });

  // Zippered Side Utility Pouch on Chest Rig
  asm.add('chest', MAT_CORDURA, rigStrap, createBeveledBox(0.045, 0.13, 0.115, 0.008, 0.012), -0.195, 1.255, 0.01);

  // 3. Crimson Faction Armband (Left Bicep) + Forearm Tactical Wrap & Watch
  asm.add('uArmL', MAT_FABRIC, crimson, createCurvedBand(0.066, 0.068, 0.065, 0, TAU, 0.007, 14), 0.26, 1.24, 0);
  // Forearm wrist tape & tactical watch on Left Forearm
  asm.add('fArmL', MAT_FABRIC, 0x1a1c20, createCurvedBand(0.046, 0.049, 0.075, 0, TAU, 0.005, 12), 0.26, 0.91, 0);
  asm.add('fArmL', MAT_METAL, 0x333842, createBeveledBox(0.022, 0.036, 0.038, 0.004, 0.008), 0.304, 0.895, 0.01);

  // 4. Heavy Saddle-Leather Belt + Brass Buckle + Crimson Hip Sash + Tactical Knife Sheath
  asm.add('hips', MAT_LEATHER, leather, createCurvedBand(0.178, 0.116, 0.058, 0, TAU, 0.014, 18), 0, 1.022, 0);
  asm.add('hips', MAT_METAL, brass, createBeveledBox(0.064, 0.044, 0.024, 0.004, 0.006), 0, 1.022, 0.125);
  // Crimson hip cloth sash peeking on left hip
  asm.add('hips', MAT_FABRIC, crimson, createBeveledBox(0.032, 0.15, 0.075, 0.008, 0.012), 0.185, 0.96, 0.02, 0.08, 0, -0.08);
  // Strapped Tactical Combat Knife Sheath on Right Thigh
  asm.add('thighR', MAT_CORDURA, 0x1b1e23, createBeveledBox(0.04, 0.17, 0.06, 0.007, 0.01), -0.206, 0.77, 0.01);
  asm.add('thighR', MAT_LEATHER, leather, createBeveledBox(0.032, 0.08, 0.034, 0.006, 0.008), -0.208, 0.875, 0.01);
  asm.add('thighR', MAT_CORDURA, 0x181a1f, createCurvedBand(0.092, 0.096, 0.022, 0, TAU, 0.006, 14), -0.11, 0.77, 0);

  // 5. Asymmetrical Single Hard-Shell Knee Pad (Left Knee) + Reinforced Knee Patch (Right)
  asm.add('shinL', MAT_POLYMER, 0x1b1f26, createBeveledBox(0.104, 0.112, 0.04, 0.012, 0.024), 0.11, 0.49, 0.072);
  asm.add('shinL', MAT_CORDURA, 0x181a1e, createCurvedBand(0.072, 0.076, 0.026, 0, TAU, 0.006, 12), 0.11, 0.48, 0);
  asm.add('shinR', MAT_FABRIC, 0x20334d, createBeveledBox(0.09, 0.095, 0.022, 0.008, 0.016), -0.11, 0.49, 0.062);

  // 6. Knit Tactical Watch Cap / Beanie + Wrap-around Sunglasses + Crimson Face Bandana
  // Beanie cap dome & folded ribbed cuff
  asm.add('head', MAT_FABRIC, 0x1b1d23, createFastHelmetShell(0.104, 0.106, 0.116), 0, 1.735, -0.006, -0.08, 0, 0, 0.86, 1.04);
  asm.add('head', MAT_FABRIC, 0x14161b, createCurvedBand(0.099, 0.111, 0.046, 0, TAU, 0.01, 16), 0, 1.755, -0.004, -0.08, 0, 0);

  // Wrap-around Ballistic Sunglasses (reflective smoke lenses + frame temples)
  asm.add('head', MAT_VISOR, 0x0b0d12, createCurvedBand(0.094, 0.106, 0.036, -0.68, 0.68, 0.014, 10), 0, 1.705, 0.008);
  asm.add('head', MAT_POLYMER, 0x181a20, createCurvedBand(0.097, 0.109, 0.01, -0.82, 0.82, 0.012, 10), 0, 1.722, 0.009);
  [-1, 1].forEach((sg) => {
    asm.add('head', MAT_POLYMER, 0x181a20, createBeveledBox(0.012, 0.012, 0.09, 0.002, 0.003), sg * 0.096, 1.712, 0.03);
  });

  // Crimson Patterned Face Bandana wrapped around nose/jaw + rear tie knot & trailing ends
  asm.addLoft(
    'head',
    MAT_FABRIC,
    crimson,
    [
      { y: 1.56, rx: 0.068, rz: 0.078, oz: 0.02, shade: 0.84 },
      { y: 1.615, rx: 0.09, rz: 0.1, oz: 0.014, shade: 0.96 },
      { y: 1.665, rx: 0.098, rz: 0.108, oz: 0.012, shade: 1.04 },
      { y: 1.69, rx: 0.088, rz: 0.102, oz: 0.016, shade: 0.95 }
    ],
    14
  );
  // Bandana knot & trailing tails behind neck
  asm.add('head', MAT_FABRIC, 0x8f1515, new THREE.SphereGeometry(0.028, 8, 6), 0, 1.61, -0.105);
  asm.add('head', MAT_FABRIC, crimson, createBeveledBox(0.035, 0.095, 0.016, 0.004, 0.006), -0.02, 1.565, -0.118, 0.25, 0, -0.22);
  asm.add('head', MAT_FABRIC, crimson, createBeveledBox(0.035, 0.085, 0.016, 0.004, 0.006), 0.022, 1.57, -0.116, 0.22, 0, 0.26);
}

/* ===== Realistic Multi-Part World Firearms ===== */
function addCharacterWeapon(asm: CharacterMeshAssembler, type: 'rifle' | 'smg'): { gr: [number, number, number]; gl: [number, number, number] } {
  const x0 = -0.09;
  const y0 = 1.37;
  const darkMetal = 0x1b1e23;
  const gunSteel = 0x2f3540;
  const polymer = 0x16181d;
  const fde = 0x7b6d50;
  const wood = 0x6c3818;
  const bakelite = 0x92431d;

  const Cy = (rt: number, rb: number, l: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, l, seg).rotateX(Math.PI / 2);

  if (type === 'rifle') {
    // --- M4A1 SOPMOD II Tactical Carbine ---
    // SOPMOD Crane Stock + Buttpad
    asm.add('weapon', MAT_POLYMER, fde, createBeveledBox(0.056, 0.105, 0.19, 0.008, 0.012), x0, y0 - 0.015, 0.14);
    asm.add('weapon', MAT_LEATHER, polymer, createBeveledBox(0.052, 0.112, 0.022, 0.005, 0.008), x0, y0 - 0.016, 0.042);
    // Buffer Tube
    asm.add('weapon', MAT_METAL, darkMetal, Cy(0.018, 0.018, 0.14, 10), x0, y0 + 0.005, 0.22);
    // Upper & Lower Receiver
    asm.add('weapon', MAT_METAL, gunSteel, createBeveledBox(0.048, 0.088, 0.22, 0.006, 0.008), x0, y0, 0.36);
    // Ergonomic Pistol Grip
    asm.add('weapon', MAT_POLYMER, polymer, createBeveledBox(0.036, 0.105, 0.046, 0.006, 0.008), x0, y0 - 0.075, 0.295, -0.32, 0, 0);
    // Curved 30-rd STANAG Magazine
    asm.add('weapon', MAT_METAL, 0x262b33, createBeveledBox(0.036, 0.14, 0.064, 0.004, 0.006), x0, y0 - 0.105, 0.415, 0.14, 0, 0);
    // Quad-Rail Handguard (FDE)
    asm.add('weapon', MAT_POLYMER, fde, createBeveledBox(0.056, 0.066, 0.24, 0.006, 0.008), x0, y0 + 0.008, 0.59);
    // Vertical Foregrip
    asm.add('weapon', MAT_POLYMER, polymer, Cy(0.016, 0.015, 0.09, 8).rotateX(Math.PI / 2), x0, y0 - 0.062, 0.55);
    // PEQ-15 Tactical Laser Module on top handguard
    asm.add('weapon', MAT_POLYMER, fde, createBeveledBox(0.044, 0.026, 0.072, 0.004, 0.005), x0, y0 + 0.052, 0.63);
    // EOTech Holographic Sight + Reflective Glass Window
    asm.add('weapon', MAT_METAL, darkMetal, createBeveledBox(0.046, 0.052, 0.088, 0.005, 0.006), x0, y0 + 0.068, 0.37);
    asm.add('weapon', MAT_VISOR, 0x38bdf8, createBeveledBox(0.034, 0.032, 0.012, 0.002, 0.003), x0, y0 + 0.072, 0.39);
    // Free-float Barrel + Tactical Suppressor
    asm.add('weapon', MAT_METAL, darkMetal, Cy(0.013, 0.013, 0.16, 10), x0, y0 + 0.01, 0.77);
    asm.add('weapon', MAT_METAL, 0x22262e, Cy(0.023, 0.023, 0.17, 12), x0, y0 + 0.01, 0.92);

    return {
      gr: [x0, y0 - 0.085, 0.295],
      gl: [x0 + 0.01, y0 - 0.05, 0.52]
    };
  } else {
    // --- AK-105 / Tactical AK Carbine ---
    // Folding Skeleton Stock
    asm.add('weapon', MAT_METAL, darkMetal, createBeveledBox(0.028, 0.022, 0.2, 0.004, 0.005), x0, y0 + 0.014, 0.14);
    asm.add('weapon', MAT_METAL, darkMetal, createBeveledBox(0.028, 0.02, 0.21, 0.004, 0.005), x0, y0 - 0.032, 0.145, -0.22, 0, 0);
    asm.add('weapon', MAT_LEATHER, polymer, createBeveledBox(0.038, 0.102, 0.024, 0.005, 0.007), x0, y0 - 0.014, 0.046);
    // Stamped Receiver + Dust Cover
    asm.add('weapon', MAT_METAL, gunSteel, createBeveledBox(0.046, 0.082, 0.24, 0.006, 0.008), x0, y0, 0.36);
    // Pistol Grip (Bakelite)
    asm.add('weapon', MAT_WOOD, wood, createBeveledBox(0.034, 0.1, 0.044, 0.006, 0.008), x0, y0 - 0.072, 0.285, -0.34, 0, 0);
    // Iconic Curved AK 30-rd Bakelite Magazine
    asm.add('weapon', MAT_WOOD, bakelite, createBeveledBox(0.034, 0.11, 0.062, 0.005, 0.006), x0, y0 - 0.09, 0.405, 0.16, 0, 0);
    asm.add('weapon', MAT_WOOD, bakelite, createBeveledBox(0.033, 0.085, 0.058, 0.005, 0.006), x0, y0 - 0.17, 0.435, 0.42, 0, 0);
    // Handguard + Gas Tube (Walnut Wood)
    asm.add('weapon', MAT_WOOD, wood, createBeveledBox(0.052, 0.058, 0.19, 0.007, 0.01), x0, y0 + 0.004, 0.56);
    asm.add('weapon', MAT_METAL, darkMetal, Cy(0.014, 0.014, 0.16, 8), x0, y0 + 0.036, 0.56);
    // Top Reflex Sight
    asm.add('weapon', MAT_METAL, darkMetal, createBeveledBox(0.038, 0.036, 0.072, 0.004, 0.005), x0, y0 + 0.056, 0.36);
    asm.add('weapon', MAT_VISOR, 0xef4444, createBeveledBox(0.026, 0.022, 0.01, 0.002, 0.003), x0, y0 + 0.06, 0.38);
    // Barrel + Front Sight Tower + Tactical Cone Booster
    asm.add('weapon', MAT_METAL, darkMetal, Cy(0.013, 0.013, 0.16, 10), x0, y0 + 0.008, 0.72);
    asm.add('weapon', MAT_METAL, darkMetal, createBeveledBox(0.02, 0.048, 0.024, 0.003, 0.004), x0, y0 + 0.03, 0.74);
    asm.add('weapon', MAT_METAL, 0x252930, Cy(0.024, 0.018, 0.065, 10), x0, y0 + 0.008, 0.82);

    return {
      gr: [x0, y0 - 0.082, 0.285],
      gl: [x0 + 0.01, y0 - 0.025, 0.50]
    };
  }
}

/* ===== Two-bone Analytical IK for arms ===== */
function ik(S: THREE.Vector3, T: THREE.Vector3, pole: THREE.Vector3, pq: THREE.Quaternion) {
  const a = 0.32;
  const b = 0.30;
  const d0 = T.clone().sub(S);
  const d = Math.min(Math.max(d0.length(), 0.1), a + b - 0.002);
  const u = d0.normalize();
  const al = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(a * a - al * al, 0));
  const pp = pole.clone().addScaledVector(u, -pole.dot(u)).normalize();
  const El = S.clone().addScaledVector(u, al).addScaledVector(pp, h);
  const D = V(0, -1, 0);
  const qU = new THREE.Quaternion().setFromUnitVectors(D, El.clone().sub(S).normalize());
  const qF = new THREE.Quaternion().setFromUnitVectors(D, S.clone().addScaledVector(u, d).sub(El).normalize());
  return [pq.clone().invert().multiply(qU), qU.clone().invert().multiply(qF)];
}

interface PoseData {
  y?: number;
  z?: number;
  wp?: [number, number, number];
  ik?: number;
  r?: Record<string, [number, number, number]>;
  a?: {
    L: [[number, number, number], [number, number, number]];
    R: [[number, number, number], [number, number, number]];
  };
}

function pose(
  ch: { bones: THREE.Bone[]; by: Record<string, THREE.Bone>; group: THREE.Group; grip: { L: THREE.Vector3; R: THREE.Vector3 } },
  p: PoseData
) {
  const by = ch.by;
  ch.bones.forEach((b) => {
    b.position.copy(b.userData.rest);
    b.quaternion.identity();
  });
  by.hips.position.y += p.y || 0;
  by.hips.position.z += p.z || 0;
  if (p.wp) by.weapon.position.add(V(...p.wp));
  if (p.r) {
    for (const k in p.r) {
      if (by[k]) {
        by[k].quaternion.setFromEuler(E.set(...p.r[k]));
      }
    }
  }
  ch.group.updateMatrixWorld(true);
  const cq = by.chest.getWorldQuaternion(new THREE.Quaternion());
  const w = p.ik == null ? 1 : p.ik;
  (['L', 'R'] as const).forEach((s) => {
    const sg = s === 'L' ? 1 : -1;
    const u = by['uArm' + s];
    const f = by['fArm' + s];
    const S = u.getWorldPosition(V(0, 0, 0));
    const T = by.weapon.localToWorld(ch.grip[s].clone());
    const [qu, qf] = ik(S, T, V(sg * 0.5, -1, -0.1).applyQuaternion(cq), cq);
    const fu = new THREE.Quaternion();
    const ff = new THREE.Quaternion();
    if (p.a) {
      fu.setFromEuler(E.set(...p.a[s][0]));
      ff.setFromEuler(E.set(...p.a[s][1]));
    }
    u.quaternion.copy(fu.slerp(qu, w));
    f.quaternion.copy(ff.slerp(qf, w));
  });
}

const K = (t: number, k: [number, number][]) => {
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const a = k[i - 1];
      const b = k[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * u * u * (3 - 2 * u);
    }
  }
  return k[k.length - 1][1];
};

const leg = (q: number, A: number, Bk: number, base: number) => {
  const th = -A * sn(q);
  const sh = base + Bk * mx(0, cs(q));
  return [th, sh, -(th + sh) * 0.8] as const;
};

function gait(
  t: number,
  A: number,
  Bk: number,
  base: number,
  lean: number,
  wpx: number,
  dyf: (p: number) => number
): PoseData {
  const p = t * TAU;
  const [tl, sl, fl] = leg(p, A, Bk, base);
  const [tr, sr, fr] = leg(p + Math.PI, A, Bk, base);
  return {
    y: dyf(p),
    r: {
      thighL: [tl, 0, 0],
      shinL: [sl, 0, 0],
      footL: [fl, 0, 0],
      thighR: [tr, 0, 0],
      shinR: [sr, 0, 0],
      footR: [fr, 0, 0],
      spine: [lean, 0.12 * sn(p), 0],
      chest: [lean * 0.5, -0.2 * sn(p), 0],
      head: [-lean * 1.4, 0.08 * sn(p), 0],
      weapon: [wpx, 0, 0]
    }
  };
}

export const ANIM_DEFS: Record<string, { d: number; once?: number; f: (t: number) => PoseData }> = {
  idle: {
    d: 2,
    f: (t) => {
      const b = sn(t * TAU);
      return {
        y: -0.05 + 0.004 * b,
        r: {
          hips: [0, 0.5, 0],
          spine: [0.12, -0.2, 0],
          chest: [0.05 + 0.012 * b, -0.3, 0],
          head: [-0.15, 0.05, 0],
          weapon: [-0.1 + 0.01 * b, 0, 0],
          thighL: [-0.35, 0, 0.04],
          shinL: [0.3, 0, 0],
          footL: [-0.05, 0, 0],
          thighR: [0.25, 0, -0.06],
          shinR: [0.45, 0, 0],
          footR: [-0.7, 0, 0]
        }
      };
    }
  },
  walk: {
    d: 1,
    f: (t) => gait(t, 0.42, 0.75, 0.08, 0.05, 0.2, (p) => -0.07 * Math.pow(sn(p), 2))
  },
  run: {
    d: 0.6,
    f: (t) => gait(t, 0.8, 1.5, 0.25, 0.2, 0.4, (p) => -0.03 + 0.14 * Math.pow(sn(p), 2))
  },
  crouch: {
    d: 3,
    f: (t) => {
      const b = sn(t * TAU);
      return {
        y: -0.42,
        r: {
          hips: [0, 0.3, 0],
          spine: [0.25, -0.15, 0],
          chest: [0.05 + 0.01 * b, -0.15, 0],
          head: [-0.25, 0, 0],
          weapon: [-0.3 + 0.02 * b, 0, 0],
          thighL: [-1.5, 0, 0.04],
          shinL: [1.5, 0, 0],
          footL: [0, 0, 0],
          thighR: [-0.1, 0, -0.05],
          shinR: [1.5, 0, 0],
          footR: [-0.4, 0, 0]
        }
      };
    }
  },
  prone: {
    d: 3,
    f: (t) => {
      const b = sn(t * TAU);
      return {
        y: -0.74,
        z: -0.1,
        r: {
          hips: [1.5, 0, 0],
          spine: [-0.1, 0, 0],
          chest: [-0.12 + 0.015 * b, 0, 0],
          neck: [-0.65, 0, 0],
          head: [-0.55, 0, 0],
          weapon: [-1.3, 0, 0],
          shinL: [0.25 + 0.2 * b, 0, 0],
          shinR: [0.25 - 0.2 * b, 0, 0]
        }
      };
    }
  },
  jump: {
    d: 1,
    f: (t) => {
      const c = K(t, [[0, 0], [0.18, 1], [0.3, 0], [0.75, 0], [0.85, 1], [1, 0]]);
      const T = K(t, [[0, 0], [0.3, 0], [0.45, 1], [0.65, 1], [0.78, 0], [1, 0]]);
      const e = K(t, [[0, 0], [0.18, 0], [0.24, 1], [0.32, 1], [0.4, 0], [1, 0]]);
      const u = Math.min(Math.max((t - 0.3) / 0.45, 0), 1);
      const thL = -(1.1 * c + T);
      const shL = 1.3 * c + 1.2 * T;
      const thR = -(1.1 * c + 0.35 * T);
      const shR = 1.3 * c + 0.9 * T;
      return {
        y: 4 * u * (1 - u) * 0.6 - 0.27 * c,
        z: -0.28 * c,
        r: {
          hips: [0, 0.2 * T, 0],
          thighL: [thL, 0, 0],
          shinL: [shL, 0, 0],
          footL: [-(thL + shL) * 0.8 + 0.6 * e, 0, 0],
          thighR: [thR, 0, 0],
          shinR: [shR, 0, 0],
          footR: [-(thR + shR) * 0.8 + 0.6 * e, 0, 0],
          spine: [0.45 * c + 0.2 * T, 0, 0],
          chest: [0.1 * T, 0, 0],
          head: [-0.9 * (0.45 * c + 0.2 * T), 0, 0],
          weapon: [-0.3 * c - 0.1 * T, 0, 0]
        }
      };
    }
  },
  death: {
    d: 1.6,
    once: 1,
    f: (t) => {
      const F = K(t, [[0, 0], [0.7, 1], [0.8, 0.94], [1, 1]]);
      const k1 = K(t, [[0, 0], [0.3, 1], [0.7, 0.2], [1, 0.2]]);
      const Ar = K(t, [[0, 0], [0.5, 1], [1, 1]]);
      const D = K(t, [[0, 0], [0.2, 0], [0.8, 1], [1, 1]]);
      const hu = K(t, [[0, 0], [0.25, 1], [0.6, 0], [1, 0]]);
      const th = -0.5 * k1;
      const sh = 0.9 * k1;
      const ft = -(th + sh) * 0.8;
      return {
        y: -0.77 * F,
        z: -0.5 * F,
        ik: K(t, [[0, 1], [0.2, 0], [1, 0]]),
        wp: [0.45 * D, 0, 0.12 * D],
        a: {
          L: [[-0.3 * Ar, 0, 1.1 * Ar], [-0.6 * Ar, 0, 0]],
          R: [[-0.3 * Ar, 0, -1.1 * Ar], [-0.6 * Ar, 0, 0]]
        },
        r: {
          hips: [-1.5 * F, 0, 0],
          spine: [0.3 * hu, 0, 0],
          chest: [0.2 * hu, 0, 0],
          head: [-0.3 * F, 0, 0],
          weapon: [1.5 * D, 0, 0],
          thighL: [th, 0, 0.1 * F],
          thighR: [th, 0, -0.1 * F],
          shinL: [sh, 0, 0],
          shinR: [sh, 0, 0],
          footL: [ft, 0, 0],
          footR: [ft, 0, 0]
        }
      };
    }
  }
};

/* ===== Bake animation clips into THREE.AnimationClip ===== */
function bakeClip(
  ch: { bones: THREE.Bone[]; by: Record<string, THREE.Bone>; group: THREE.Group; grip: { L: THREE.Vector3; R: THREE.Vector3 } },
  key: string
): THREE.AnimationClip {
  const A = ANIM_DEFS[key];
  const N = Math.round(A.d * 30);
  const times: number[] = [];
  const Q: Record<string, number[]> = {};
  const P: Record<string, number[]> = { hips: [], weapon: [] };

  ch.bones.forEach((b) => (Q[b.name] = []));
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    times.push(t * A.d);
    pose(ch, A.f(t));
    ch.bones.forEach((b) => Q[b.name].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
    for (const k in P) {
      P[k].push(...ch.by[k].position.toArray());
    }
  }

  const tr: (THREE.QuaternionKeyframeTrack | THREE.VectorKeyframeTrack)[] = ch.bones.map(
    (b) => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, Q[b.name])
  );
  for (const k in P) {
    tr.push(new THREE.VectorKeyframeTrack(k + '.position', times, P[k]));
  }

  // Restore rest pose after baking
  ch.bones.forEach((b) => {
    b.position.copy(b.userData.rest);
    b.quaternion.identity();
  });
  ch.group.updateMatrixWorld(true);

  return new THREE.AnimationClip(key, A.d, tr);
}

/* ===== Template Cache per Team (cloned per instance for safe disposal) ===== */
interface CharacterTemplate {
  geo: THREE.BufferGeometry;
  grip: { L: THREE.Vector3; R: THREE.Vector3 };
}

const templateCache: Partial<Record<'swat' | 'gang', CharacterTemplate>> = {};

function getCharacterTemplate(team: 'swat' | 'gang'): CharacterTemplate {
  const existing = templateCache[team];
  if (existing) return existing;

  const pal = PALETTES[team];
  const isSwat = team === 'swat';
  const asm = new CharacterMeshAssembler();

  buildAnatomicalBody(asm, pal, isSwat);
  if (isSwat) {
    addSwatEquipment(asm);
  } else {
    addGangEquipment(asm);
  }

  const { gr, gl } = addCharacterWeapon(asm, pal.wp);
  const wp = V(0, 1.3, 0);
  const template: CharacterTemplate = {
    geo: asm.buildGeometry(),
    grip: {
      L: V(...gl).sub(wp),
      R: V(...gr).sub(wp)
    }
  };
  templateCache[team] = template;
  return template;
}

/* ===== Build Complete Skinned Character ===== */
export function buildCharacter(team: 'swat' | 'gang', customName?: string): CharacterInstance {
  const pal = PALETTES[team];
  const template = getCharacterTemplate(team);

  const bones = BONE_DEFS.map((b) => {
    const n = new THREE.Bone();
    n.name = b[0];
    return n;
  });
  const by: Record<string, THREE.Bone> = {};
  bones.forEach((b) => (by[b.name] = b));

  BONE_DEFS.forEach((b, i) => {
    const p = b[1] ? BONE_DEFS.find((x) => x[0] === b[1]) : null;
    const w = V(b[2], b[3], b[4]);
    bones[i].position.copy(p ? w.sub(V(p[2], p[3], p[4])) : w);
    if (p) by[p[0] as string].add(bones[i]);
    bones[i].userData.rest = bones[i].position.clone();
  });

  // Clone template geometry so MenuShowcase3D/scene disposal never corrupts shared cache
  const geo = template.geo.clone();
  const materials = createCharacterMaterials();

  const mesh = new THREE.SkinnedMesh(geo, materials);
  mesh.name = (customName || pal.name) + '_Mesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.name = customName || pal.name;
  group.add(mesh);
  group.add(bones[0]); // add hips root bone
  group.updateMatrixWorld(true);

  mesh.bind(new THREE.Skeleton(bones));

  const grip = {
    L: template.grip.L.clone(),
    R: template.grip.R.clone()
  };

  const chData = { bones, by, group, grip };
  const clips = Object.keys(ANIM_DEFS).map((k) => bakeClip(chData, k));
  const mixer = new THREE.AnimationMixer(group);
  const act: Record<string, THREE.AnimationAction> = {};

  clips.forEach((c) => {
    const a = mixer.clipAction(c);
    if (ANIM_DEFS[c.name].once) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    act[c.name] = a;
  });

  let curActionName: string | null = null;
  const playAnimation = (name: string, fadeDuration = 0.2) => {
    if (!act[name] || curActionName === name) return;
    const nextAction = act[name];
    if (curActionName && act[curActionName]) {
      nextAction.reset().crossFadeFrom(act[curActionName], fadeDuration, false).play();
    } else {
      nextAction.reset().play();
    }
    curActionName = name;
  };

  // Start with idle animation
  playAnimation('idle');

  return {
    name: customName || pal.name,
    team,
    bones,
    by,
    group,
    mesh,
    grip,
    clips,
    mixer,
    act,
    curActionName,
    playAnimation,
    headBone: by['head'],
    chestBone: by['chest']
  };
}
