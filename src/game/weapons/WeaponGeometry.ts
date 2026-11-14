import * as THREE from 'three';
import { WeaponMaterialSet } from './WeaponMaterials';

/**
 * Extrudes a 2D side-view firearm silhouette into centered 3D geometry with subtle metal bevels.
 * Input points use [zForwardMeters, yUpMeters] where +zForward points toward the muzzle (-Z in weapon space).
 */
export function extrudeSideProfile(
  points: [number, number][],
  width: number,
  bevelSize = 0.002,
  bevelThickness = 0.002,
  bevelSegments = 2,
  holes?: [number, number][][]
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  if (holes && holes.length > 0) {
    for (const holePts of holes) {
      const hole = new THREE.Path();
      hole.moveTo(holePts[0][0], holePts[0][1]);
      for (let i = 1; i < holePts.length; i++) {
        hole.lineTo(holePts[i][0], holePts[i][1]);
      }
      hole.closePath();
      shape.holes.push(hole);
    }
  }

  const innerDepth = Math.max(0.002, width - bevelThickness * 2);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: innerDepth,
    bevelEnabled: bevelSize > 0 && bevelThickness > 0,
    bevelSize,
    bevelThickness,
    bevelSegments,
    curveSegments: 6
  });
  geom.translate(0, 0, -innerDepth / 2);
  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a chamfered/beveled box centered at the origin so edges catch realistic specular highlights.
 */
export function createBeveledBox(
  w: number,
  h: number,
  d: number,
  bevel = 0.0018,
  segments = 2
): THREE.BufferGeometry {
  const b = Math.min(bevel, w * 0.28, h * 0.28, d * 0.28);
  const hw = Math.max(0.001, w * 0.5 - b);
  const hh = Math.max(0.001, h * 0.5 - b);
  const innerD = Math.max(0.001, d - b * 2);

  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: innerD,
    bevelEnabled: b > 0.0002,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: segments,
    curveSegments: 2
  });
  geom.translate(0, 0, -innerD / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a turned cylindrical part along the weapon's -Z axis from [radius, zWorld] stations.
 */
export function createLatheZ(profile: [number, number][], radialSegments = 16): THREE.BufferGeometry {
  const pts = profile.map(([r, zWorld]) => new THREE.Vector2(Math.max(0.0001, r), -zWorld));
  const geom = new THREE.LatheGeometry(pts, radialSegments);
  geom.rotateX(-Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a recessed hollow muzzle bore & crown collar so the front barrel opening has true physical depth.
 */
export function createHollowMuzzleBore(
  boreRadius: number,
  depth: number,
  boreMat: THREE.Material
): THREE.Group {
  const grp = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(boreRadius, boreRadius, depth, 14, 1, true).rotateX(Math.PI / 2),
    boreMat
  );
  wall.position.z = depth * 0.5;
  const backCap = new THREE.Mesh(new THREE.CircleGeometry(boreRadius, 14), boreMat);
  backCap.position.z = depth;
  backCap.rotation.y = Math.PI;
  grp.add(wall, backCap);
  return grp;
}

/**
 * Builds a machined Picatinny rail (MIL-STD-1913) with beveled base and crisp T-slot recoil grooves.
 */
export function createPicatinnyRail(
  length: number,
  notches: number,
  baseMat: THREE.Material,
  toothMat: THREE.Material,
  width = 0.022
): THREE.Group {
  const rail = new THREE.Group();
  const base = new THREE.Mesh(createBeveledBox(width, 0.0055, length, 0.001, 1), baseMat);
  rail.add(base);

  const step = length / Math.max(1, notches);
  const toothGeo = createBeveledBox(width + 0.0025, 0.0042, step * 0.52, 0.0008, 1);
  for (let i = 0; i < notches; i++) {
    const tooth = new THREE.Mesh(toothGeo, toothMat);
    tooth.position.set(0, 0.0042, -length * 0.5 + step * (i + 0.5));
    rail.add(tooth);
  }
  return rail;
}

export function createScrewHead(radius: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, radius * 0.7, 8).rotateZ(Math.PI / 2), mat);
  return m;
}

/**
 * Curved 30-round 7.62x39 AK Bakelite / steel-reinforced magazine extruded along a smooth circular arc.
 */
export function createCurvedAKMagazine(mats: WeaponMaterialSet): THREE.Group {
  const grp = new THREE.Group();

  // Parametric curved box polygon along an authentic AK-47 arc
  const steps = 7;
  const frontPts: [number, number][] = [];
  const backPts: [number, number][] = [];
  const magDepth = 0.062;
  const magLen = 0.21;
  const radius = 0.42;

  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * magLen;
    const theta = s / radius + 0.12;
    const cy = -Math.cos(theta) * radius + radius * Math.cos(0.12) - 0.025;
    const czFwd = Math.sin(theta) * radius - radius * Math.sin(0.12) + 0.058;
    const nx = Math.sin(theta);
    const ny = Math.cos(theta);
    // Slight taper toward floorplate
    const halfD = (magDepth * (1 - (i / steps) * 0.07)) * 0.5;
    frontPts.push([czFwd + ny * halfD, cy + nx * halfD]);
    backPts.push([czFwd - ny * halfD, cy - nx * halfD]);
  }
  const poly: [number, number][] = [...frontPts, ...backPts.reverse()];
  const magBody = new THREE.Mesh(extrudeSideProfile(poly, 0.028, 0.0024, 0.0024, 2), mats.bakeliteOrange);
  grp.add(magBody);

  // Top steel locking collar + front locking lug + rear rib
  const collar = new THREE.Mesh(createBeveledBox(0.03, 0.026, 0.064, 0.0014, 1), mats.gunmetalDark);
  collar.position.set(0, -0.022, -0.058);
  collar.rotation.x = -0.14;
  grp.add(collar);

  // Subtle brass 7.62 cartridge visible at feed lips
  const cartridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0046, 0.0052, 0.038, 8).rotateX(Math.PI / 2),
    mats.brassDetail
  );
  cartridge.position.set(0, -0.008, -0.056);
  grp.add(cartridge);

  // Stamped steel floorplate at the curved bottom tip
  const endTheta = magLen / radius + 0.12;
  const endY = -Math.cos(endTheta) * radius + radius * Math.cos(0.12) - 0.025;
  const endZFwd = Math.sin(endTheta) * radius - radius * Math.sin(0.12) + 0.058;
  const floorplate = new THREE.Mesh(createBeveledBox(0.031, 0.011, 0.062, 0.0015, 1), mats.gunmetalDark);
  floorplate.position.set(0, endY, -endZFwd);
  floorplate.rotation.x = -endTheta;
  grp.add(floorplate);

  return grp;
}

/**
 * Curved aluminum 5.56 STANAG magazine with stamped feed ribs & tactical pull-tab baseplate.
 */
export function createCurvedM4Magazine(mats: WeaponMaterialSet): THREE.Group {
  const grp = new THREE.Group();
  const poly: [number, number][] = [
    [0.105, -0.012],
    [0.042, -0.012],
    [0.046, -0.092],
    [0.062, -0.172],
    [0.124, -0.162],
    [0.107, -0.09]
  ];
  const body = new THREE.Mesh(extrudeSideProfile(poly, 0.025, 0.0018, 0.002, 2), mats.anodizedBlack);
  grp.add(body);

  // Stamped reinforcement side ribs
  for (let i = 0; i < 2; i++) {
    const rib = new THREE.Mesh(createBeveledBox(0.027, 0.088, 0.011, 0.0008, 1), mats.gunmetalBrushed);
    rib.position.set(0, -0.105, -0.066 - i * 0.026);
    rib.rotation.x = -0.12;
    grp.add(rib);
  }

  // Rubberized tactical mag-pull baseplate
  const basePlate = new THREE.Mesh(createBeveledBox(0.029, 0.014, 0.066, 0.0018, 1), mats.rubberGrip);
  basePlate.position.set(0, -0.171, -0.092);
  basePlate.rotation.x = -0.16;
  grp.add(basePlate);

  return grp;
}

/**
 * Open-window holographic reflex optic with beveled protective hood, side adjustment screws,
 * anti-reflective coated glass window, and floating crisp crimson dot reticle.
 */
export function createOpenHoloOptic(yBase: number, zCenter: number, mats: WeaponMaterialSet): THREE.Group {
  const optic = new THREE.Group();

  // QD Rail Base & Locking Lever
  const mount = new THREE.Mesh(createBeveledBox(0.034, 0.013, 0.082, 0.0016, 2), mats.anodizedBlack);
  mount.position.set(0, yBase + 0.0065, zCenter);
  const qdNut = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 6).rotateZ(Math.PI / 2), mats.gunmetalBrushed);
  qdNut.position.set(-0.02, yBase + 0.007, zCenter + 0.012);
  optic.add(mount, qdNut);

  // Protective C-shaped aluminum shroud (open sight window!)
  const hoodShape: [number, number][] = [
    [-0.024, 0],
    [0.024, 0],
    [0.024, 0.041],
    [0.017, 0.045],
    [-0.017, 0.045],
    [-0.024, 0.041]
  ];
  const wallGeo = extrudeSideProfile(hoodShape, 0.0045, 0.001, 0.001, 1);
  const hoodL = new THREE.Mesh(wallGeo, mats.gunmetalDark);
  hoodL.position.set(-0.019, yBase + 0.012, zCenter);
  const hoodR = new THREE.Mesh(wallGeo, mats.gunmetalDark);
  hoodR.position.set(0.019, yBase + 0.012, zCenter);

  const hoodTop = new THREE.Mesh(createBeveledBox(0.043, 0.0055, 0.05, 0.0012, 2), mats.gunmetalDark);
  hoodTop.position.set(0, yBase + 0.055, zCenter);

  // Windage & elevation micro turrets on right side
  const windScrew = createScrewHead(0.0042, mats.gunmetalBrushed);
  windScrew.position.set(0.023, yBase + 0.022, zCenter + 0.006);
  const elevScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 8), mats.gunmetalBrushed);
  elevScrew.position.set(0.012, yBase + 0.059, zCenter + 0.01);

  // Coated optical lens & crisp holographic reticle (center dot + outer ring)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.033, 0.036), mats.opticGlass);
  glass.position.set(0, yBase + 0.034, zCenter - 0.011);
  glass.rotation.x = 0.06;

  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.00105, 8, 8), mats.crimsonDot);
  dot.position.set(0, yBase + 0.034, zCenter - 0.008);

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.0052, 0.0061, 24), mats.crimsonDot);
  ring.position.set(0, yBase + 0.034, zCenter - 0.0082);

  optic.add(hoodL, hoodR, hoodTop, windScrew, elevScrew, glass, dot, ring);
  return optic;
}
