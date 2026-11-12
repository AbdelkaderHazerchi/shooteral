import * as THREE from 'three';
import { WeaponStats } from './WeaponData';

export interface BuiltViewmodel {
  group: THREE.Group;
  muzzleOffset: THREE.Vector3;
  slideMesh?: THREE.Object3D;
  slideRestZ?: number;
  magGroup?: THREE.Group;
  magRestPos?: THREE.Vector3;
  magRestRot?: THREE.Euler;
  leftHandGroup?: THREE.Group;
  leftHandRestPos?: THREE.Vector3;
  leftHandRestRot?: THREE.Euler;
  rightHandGroup?: THREE.Group;
  rightHandRestPos?: THREE.Vector3;
  rightHandRestRot?: THREE.Euler;
  extraAnimParts?: {
    cutterJawL?: THREE.Object3D;
    cutterJawR?: THREE.Object3D;
  };
}

function createSharedMaterials(team: 'gang' | 'swat') {
  return {
    gunmetalDark: new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.88, roughness: 0.26 }),
    gunmetalBrushed: new THREE.MeshStandardMaterial({ color: 0x4b525e, metalness: 0.92, roughness: 0.22 }),
    chromeSteel: new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 0.96, roughness: 0.14 }),
    polymerBlack: new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.12, roughness: 0.76 }),
    rubberGrip: new THREE.MeshStandardMaterial({ color: 0x111215, metalness: 0.05, roughness: 0.92 }),
    woodWalnut: new THREE.MeshStandardMaterial({ color: 0x6e3714, metalness: 0.08, roughness: 0.62 }),
    bakeliteOrange: new THREE.MeshStandardMaterial({ color: 0x9c481c, metalness: 0.1, roughness: 0.48 }),
    oliveChassis: new THREE.MeshStandardMaterial({ color: 0x3b4d34, metalness: 0.14, roughness: 0.68 }),
    opticGlass: new THREE.MeshStandardMaterial({
      color: 0x224466,
      metalness: 0.95,
      roughness: 0.05,
      transparent: true,
      opacity: 0.52
    }),
    crimsonDot: new THREE.MeshBasicMaterial({ color: 0xff2233 }),
    greenTritium: new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
    sleeveMat: new THREE.MeshStandardMaterial({
      color: team === 'swat' ? 0x222c3c : 0x996342,
      roughness: team === 'swat' ? 0.86 : 0.64,
      metalness: 0.02
    }),
    gloveMat: new THREE.MeshStandardMaterial({
      color: team === 'swat' ? 0x171a20 : 0x231d1a,
      roughness: 0.56,
      metalness: 0.06
    }),
    fingerTipMat: new THREE.MeshStandardMaterial({
      color: team === 'swat' ? 0x171a20 : 0x996342,
      roughness: team === 'swat' ? 0.56 : 0.64,
      metalness: 0.04
    }),
    knuckleArmor: new THREE.MeshStandardMaterial({ color: 0x1d2026, metalness: 0.35, roughness: 0.42 }),
    cuffMat: new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.82 })
  };
}

/**
 * Builds an articulated tactical gloved hand + forearm wrapped naturally around a grip or handguard.
 */
function buildArticulatedArm(
  side: 'left' | 'right',
  style: 'pistol_trigger' | 'pistol_support' | 'rifle_trigger' | 'rifle_support' | 'knife' | 'c4_hold' | 'c4_type' | 'defuse',
  mats: ReturnType<typeof createSharedMaterials>
): THREE.Group {
  const arm = new THREE.Group();
  const cap = (r: number, len: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
  const cyl = (rt: number, rb: number, len: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, 10).rotateX(Math.PI / 2), mat);
  const bx = (w: number, h: number, d: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // Contoured Palm & Hard-Knuckle Tactical Guard
  const palm = cap(0.024, 0.032, mats.gloveMat);
  palm.rotation.x = Math.PI / 2;
  palm.scale.set(1.05, 1.0, 0.85);
  arm.add(palm);

  const knuckle = bx(0.044, 0.012, 0.026, mats.knuckleArmor);
  knuckle.position.set(0, 0.019, -0.012);
  arm.add(knuckle);

  const fingerTip = mats.fingerTipMat;

  if (style === 'pistol_trigger' || style === 'rifle_trigger') {
    // Index trigger finger reaching forward toward trigger guard
    const triggerProximal = cap(0.0065, 0.022, mats.gloveMat);
    triggerProximal.rotation.x = Math.PI / 2 + 0.14;
    triggerProximal.position.set(0.015, 0.004, -0.044);
    const triggerTip = cap(0.006, 0.014, fingerTip);
    triggerTip.rotation.set(Math.PI / 2, 0, -0.55);
    triggerTip.position.set(0.005, 0.002, -0.062);
    arm.add(triggerProximal, triggerTip);

    // 3 wrapped fingers curling tightly around front of pistol grip
    for (let i = 0; i < 3; i++) {
      const f = cap(0.0065, 0.022, fingerTip);
      f.rotation.set(Math.PI / 2, 0, -0.45);
      f.position.set(-0.012, -0.008 - i * 0.013, -0.032);
      arm.add(f);
    }
    // Thumb resting on left side of frame/grip
    const thumb = cap(0.0075, 0.028, fingerTip);
    thumb.rotation.x = Math.PI / 2 - 0.18;
    thumb.position.set(-0.024, 0.015, -0.025);
    arm.add(thumb);
  } else if (style === 'pistol_support') {
    // Two-handed Weaver/Isosceles support palm wrapping front of right fingers
    for (let i = 0; i < 3; i++) {
      const f = cap(0.0065, 0.024, fingerTip);
      f.rotation.set(Math.PI / 2, 0, 0.5);
      f.position.set(0.018, -0.006 - i * 0.013, -0.034);
      arm.add(f);
    }
    const thumb = cap(0.0075, 0.032, fingerTip);
    thumb.rotation.x = Math.PI / 2;
    thumb.position.set(-0.012, 0.022, -0.038);
    arm.add(thumb);
  } else if (style === 'rifle_support') {
    // Ergonomic C-clamp / handguard cup with fingers curling up right side & thumb over top
    for (let i = 0; i < 4; i++) {
      const f = cap(0.0065, 0.02, fingerTip);
      f.position.set(0.024, 0.012, -0.022 + i * 0.015);
      f.rotation.z = 0.35;
      arm.add(f);
    }
    const thumb = cap(0.0075, 0.02, fingerTip);
    thumb.position.set(-0.016, 0.028, -0.008);
    thumb.rotation.z = Math.PI / 2 - 0.45;
    arm.add(thumb);
  } else if (style === 'knife') {
    for (let i = 0; i < 4; i++) {
      const f = cap(0.007, 0.022, fingerTip);
      f.rotation.z = Math.PI / 2;
      f.position.set(-0.012, 0.018, -0.025 + i * 0.015);
      arm.add(f);
    }
    const thumb = cap(0.0075, 0.026, fingerTip);
    thumb.rotation.x = Math.PI / 2;
    thumb.position.set(-0.016, 0.025, -0.022);
    arm.add(thumb);
  } else {
    for (let i = 0; i < 3; i++) {
      const f = cap(0.006, 0.022, fingerTip);
      f.rotation.x = Math.PI / 2 + 0.35;
      f.position.set(-0.014 + i * 0.014, -0.004, -0.04);
      arm.add(f);
    }
  }

  // Wrist strap / Velcro cuff & Tapered Tactical Forearm extending cleanly back toward player's shoulder
  const dirSign = side === 'right' ? 1 : -1;
  const wrist = cyl(0.027, 0.029, 0.045, mats.cuffMat);
  wrist.position.set(dirSign * 0.008, -0.012, 0.048);
  arm.add(wrist);

  if (side === 'left') {
    const watch = bx(0.012, 0.022, 0.024, mats.knuckleArmor);
    watch.position.set(-0.028, -0.008, 0.056);
    arm.add(watch);
  }

  const forearm = cyl(0.031, 0.043, 0.29, mats.sleeveMat);
  forearm.position.set(dirSign * 0.056, -0.068, 0.178);
  forearm.rotation.set(0.32, dirSign * -0.34, dirSign * 0.08);
  arm.add(forearm);

  return arm;
}

/**
 * Builds detailed, multi-part realistic 3D real-world firearm viewmodels
 * with anatomical two-handed tactical grips, PBR metallic/polymer/wood finishes,
 * detachable magazine groups, optics, and reciprocating slide/bolt meshes.
 */
export function buildRealisticViewmodel(w: WeaponStats, team: 'gang' | 'swat'): BuiltViewmodel {
  const g = new THREE.Group();
  g.name = 'VM_' + w.id;
  const mats = createSharedMaterials(team);

  let muzzleZ = -0.5;
  let muzzleY = 0.025;
  let slideMesh: THREE.Object3D | undefined;
  let slideRestZ = 0;
  let magGroup: THREE.Group | undefined;

  const bx = (width: number, height: number, depth: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  const cy = (rt: number, rb: number, len: number, seg: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg).rotateX(Math.PI / 2), mat);

  const addRail = (x: number, y: number, zStart: number, len: number, notches: number) => {
    const base = bx(0.024, 0.006, len, mats.gunmetalDark);
    base.position.set(x, y, zStart);
    g.add(base);
    const step = len / Math.max(1, notches);
    for (let i = 0; i < notches; i++) {
      const slot = bx(0.026, 0.004, step * 0.45, mats.gunmetalBrushed);
      slot.position.set(x, y + 0.004, zStart - len / 2 + step * (i + 0.5));
      g.add(slot);
    }
  };

  const addHoloOptic = (yBase: number, zCenter: number) => {
    const optic = new THREE.Group();
    const mount = bx(0.036, 0.014, 0.082, mats.gunmetalDark);
    mount.position.set(0, yBase + 0.007, zCenter);

    const hoodL = bx(0.005, 0.042, 0.056, mats.gunmetalDark);
    hoodL.position.set(-0.02, yBase + 0.033, zCenter);
    const hoodR = hoodL.clone();
    hoodR.position.x = 0.02;
    const hoodTop = bx(0.045, 0.005, 0.056, mats.gunmetalDark);
    hoodTop.position.set(0, yBase + 0.054, zCenter);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.036), mats.opticGlass);
    glass.position.set(0, yBase + 0.033, zCenter - 0.012);

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 8, 8), mats.crimsonDot);
    dot.position.set(0, yBase + 0.033, zCenter - 0.01);

    optic.add(mount, hoodL, hoodR, hoodTop, glass, dot);
    g.add(optic);
  };

  let rightHandGroup: THREE.Group;
  let leftHandGroup: THREE.Group | undefined;

  if (w.id === 'knife') {
    const bladeMain = bx(0.008, 0.044, 0.24, mats.chromeSteel);
    bladeMain.position.set(0, 0.005, -0.175);
    const bladeTip = bx(0.007, 0.03, 0.075, mats.chromeSteel);
    bladeTip.position.set(0, -0.002, -0.31);
    bladeTip.rotation.x = 0.24;
    const fuller = bx(0.01, 0.008, 0.15, mats.gunmetalBrushed);
    fuller.position.set(0, 0.012, -0.16);
    const guard = bx(0.02, 0.084, 0.016, mats.gunmetalDark);
    guard.position.set(0, 0.002, -0.05);
    const grip = cy(0.019, 0.021, 0.13, 10, mats.rubberGrip);
    grip.position.set(0, -0.004, 0.022);
    const pommel = cy(0.021, 0.017, 0.024, 10, mats.gunmetalDark);
    pommel.position.set(0, -0.004, 0.098);

    g.add(bladeMain, bladeTip, fuller, guard, grip, pommel);
    muzzleZ = -0.35;
    muzzleY = 0;

    rightHandGroup = buildArticulatedArm('right', 'knife', mats);
    rightHandGroup.position.set(0.012, -0.006, 0.024);
    rightHandGroup.rotation.set(0.05, 0.0, 0.15);
    g.add(rightHandGroup);
  } else if (w.id === 'c4') {
    const c4Clay = new THREE.MeshStandardMaterial({ color: 0xb7a078, roughness: 0.88 });
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x3b4230, roughness: 0.7 });
    const brick1 = bx(0.15, 0.072, 0.22, c4Clay);
    const strap1 = bx(0.156, 0.078, 0.035, tapeMat);
    strap1.position.z = -0.055;
    const strap2 = strap1.clone();
    strap2.position.z = 0.055;

    const circuitBoard = bx(0.11, 0.016, 0.125, mats.gunmetalDark);
    circuitBoard.position.set(0, 0.044, 0.01);
    const screen = bx(0.078, 0.006, 0.036, new THREE.MeshBasicMaterial({ color: 0x063b1e }));
    screen.position.set(0, 0.053, -0.022);
    const keypad = bx(0.082, 0.008, 0.052, mats.polymerBlack);
    keypad.position.set(0, 0.053, 0.032);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    led.position.set(0.038, 0.056, -0.035);
    const wire = cy(0.004, 0.004, 0.09, 6, new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
    wire.position.set(-0.042, 0.05, -0.05);

    g.add(brick1, strap1, strap2, circuitBoard, screen, keypad, led, wire);

    leftHandGroup = buildArticulatedArm('left', 'c4_hold', mats);
    leftHandGroup.position.set(-0.072, -0.028, 0.042);
    leftHandGroup.rotation.set(0.05, -0.15, -0.35);

    rightHandGroup = buildArticulatedArm('right', 'c4_type', mats);
    rightHandGroup.position.set(0.068, 0.025, 0.068);
    rightHandGroup.rotation.set(-0.22, 0.28, 0.15);

    g.add(leftHandGroup, rightHandGroup);
  } else if (w.category === 'pistol') {
    const isDeagle = w.id === 'deagle';
    const isUSP = w.id === 'usp';
    const slideMat = isDeagle ? mats.chromeSteel : mats.gunmetalDark;
    const slideLen = isDeagle ? 0.31 : 0.245;
    const frameLen = isDeagle ? 0.27 : 0.22;

    const frame = bx(0.034, 0.026, frameLen, isDeagle ? mats.chromeSteel : mats.polymerBlack);
    frame.position.set(0, -0.015, -0.025);
    const triggerGuard = bx(0.014, 0.034, 0.058, isDeagle ? mats.chromeSteel : mats.polymerBlack);
    triggerGuard.position.set(0, -0.042, 0.01);
    const triggerCutout = bx(0.016, 0.022, 0.036, mats.gunmetalDark);
    triggerCutout.position.set(0, -0.042, 0.01);
    const triggerShoe = bx(0.006, 0.022, 0.01, mats.gunmetalBrushed);
    triggerShoe.position.set(0, -0.039, 0.014);
    triggerShoe.rotation.x = 0.35;

    const grip = bx(0.034, 0.135, 0.056, isDeagle ? mats.rubberGrip : mats.polymerBlack);
    grip.position.set(0, -0.084, 0.068);
    grip.rotation.x = 0.25;

    // Detachable Pistol Magazine (slides down/out of grip during reload!)
    magGroup = new THREE.Group();
    const magBody = bx(0.026, 0.115, 0.044, mats.gunmetalBrushed);
    magBody.position.set(0, -0.088, 0.069);
    magBody.rotation.x = 0.25;
    const magBase = bx(0.036, 0.014, 0.06, mats.gunmetalDark);
    magBase.position.set(0, -0.148, 0.084);
    magBase.rotation.x = 0.25;
    magGroup.add(magBody, magBase);
    g.add(magGroup);

    // Reciprocating Machined Slide Group
    const slideGrp = new THREE.Group();
    const slideTop = bx(0.036, 0.038, slideLen, slideMat);
    slideTop.position.set(0, 0.015, -0.022);
    const ejectionPort = bx(0.037, 0.016, 0.052, mats.chromeSteel);
    ejectionPort.position.set(0.002, 0.024, -0.015);
    const barrelInside = cy(0.01, 0.01, slideLen * 0.85, 10, mats.gunmetalBrushed);
    barrelInside.position.set(0, 0.016, -0.035);

    const frontSight = bx(0.005, 0.011, 0.01, mats.gunmetalDark);
    frontSight.position.set(0, 0.039, -slideLen / 2 - 0.008);
    const frontDot = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.003), mats.greenTritium);
    frontDot.position.set(0, 0.041, -slideLen / 2 - 0.004);

    const rearL = bx(0.007, 0.011, 0.012, mats.gunmetalDark);
    rearL.position.set(-0.01, 0.039, slideLen / 2 - 0.03);
    const rearR = rearL.clone();
    rearR.position.x = 0.01;
    const rearDotL = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.003), mats.greenTritium);
    rearDotL.position.set(-0.01, 0.04, slideLen / 2 - 0.024);
    const rearDotR = rearDotL.clone();
    rearDotR.position.x = 0.01;

    slideGrp.add(slideTop, ejectionPort, frontSight, frontDot, rearL, rearR, rearDotL, rearDotR);

    if (isDeagle) {
      const shroud = bx(0.038, 0.036, 0.16, mats.chromeSteel);
      shroud.position.set(0, 0.016, -0.145);
      addRail(0, 0.037, -0.13, 0.14, 6);
      g.add(shroud);
    }

    if (isUSP) {
      const collar = cy(0.018, 0.018, 0.024, 12, mats.gunmetalBrushed);
      collar.position.set(0, 0.014, -0.155);
      const suppressor = cy(0.019, 0.019, 0.185, 14, mats.polymerBlack);
      suppressor.position.set(0, 0.014, -0.255);
      const endcap = cy(0.015, 0.019, 0.014, 14, mats.gunmetalDark);
      endcap.position.set(0, 0.014, -0.352);
      g.add(collar, suppressor, endcap);
      muzzleZ = -0.365;
    } else {
      muzzleZ = isDeagle ? -0.23 : -0.16;
    }

    g.add(frame, triggerGuard, triggerCutout, triggerShoe, grip, barrelInside, slideGrp);
    slideMesh = slideGrp;
    slideRestZ = 0;
    muzzleY = 0.015;

    // Anatomical two-handed pistol grip: right hand seats directly on grip, left hand wraps right fingers!
    rightHandGroup = buildArticulatedArm('right', 'pistol_trigger', mats);
    rightHandGroup.position.set(0.012, -0.056, 0.072);
    rightHandGroup.rotation.set(0.22, 0.0, 0.0);

    leftHandGroup = buildArticulatedArm('left', 'pistol_support', mats);
    leftHandGroup.position.set(-0.022, -0.068, 0.058);
    leftHandGroup.rotation.set(0.2, -0.14, -0.12);

    g.add(rightHandGroup, leftHandGroup);
  } else if (w.id === 'awp') {
    const chassis = bx(0.054, 0.076, 0.56, mats.oliveChassis);
    chassis.position.set(0, -0.008, -0.08);
    const stock = bx(0.044, 0.092, 0.24, mats.oliveChassis);
    stock.position.set(0, -0.018, 0.26);
    const cheekRest = bx(0.046, 0.024, 0.12, mats.rubberGrip);
    cheekRest.position.set(0, 0.036, 0.25);
    const action = cy(0.024, 0.024, 0.26, 12, mats.gunmetalDark);
    action.position.set(0, 0.032, -0.06);

    const boltGrp = new THREE.Group();
    const boltStem = bx(0.045, 0.01, 0.012, mats.gunmetalBrushed);
    boltStem.position.set(0.028, 0.032, 0.03);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), mats.polymerBlack);
    boltKnob.position.set(0.052, 0.028, 0.03);
    boltGrp.add(boltStem, boltKnob);
    g.add(boltGrp);
    slideMesh = boltGrp;

    const barrel = cy(0.015, 0.018, 0.64, 12, mats.gunmetalDark);
    barrel.position.set(0, 0.032, -0.49);
    const muzzleBrake = bx(0.038, 0.032, 0.076, mats.gunmetalBrushed);
    muzzleBrake.position.set(0, 0.032, -0.835);

    magGroup = new THREE.Group();
    const mag = bx(0.036, 0.085, 0.095, mats.gunmetalDark);
    mag.position.set(0, -0.065, -0.09);
    magGroup.add(mag);
    g.add(magGroup);

    const bipodBase = bx(0.04, 0.022, 0.045, mats.gunmetalDark);
    bipodBase.position.set(0, -0.048, -0.33);
    const legL = cy(0.008, 0.008, 0.18, 8, mats.gunmetalBrushed);
    legL.position.set(-0.028, -0.05, -0.24);
    const legR = legL.clone();
    legR.position.x = 0.028;

    addRail(0, 0.056, -0.06, 0.18, 8);
    const ring1 = cy(0.024, 0.024, 0.022, 12, mats.gunmetalDark);
    ring1.position.set(0, 0.082, -0.01);
    const ring2 = ring1.clone();
    ring2.position.z = -0.11;
    const scopeTube = cy(0.019, 0.019, 0.28, 12, mats.polymerBlack);
    scopeTube.position.set(0, 0.085, -0.07);
    const scopeObjBell = cy(0.029, 0.021, 0.095, 14, mats.polymerBlack);
    scopeObjBell.position.set(0, 0.085, -0.22);
    const scopeEyeBell = cy(0.024, 0.02, 0.07, 14, mats.polymerBlack);
    scopeEyeBell.position.set(0, 0.085, 0.08);
    const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10), mats.gunmetalBrushed);
    turretTop.position.set(0, 0.108, -0.06);

    g.add(chassis, stock, cheekRest, action, barrel, muzzleBrake, bipodBase, legL, legR, ring1, ring2, scopeTube, scopeObjBell, scopeEyeBell, turretTop);
    muzzleZ = -0.88;
    muzzleY = 0.032;

    rightHandGroup = buildArticulatedArm('right', 'rifle_trigger', mats);
    rightHandGroup.position.set(0.014, -0.038, 0.105);
    rightHandGroup.rotation.set(0.18, 0, 0);

    leftHandGroup = buildArticulatedArm('left', 'rifle_support', mats);
    leftHandGroup.position.set(-0.022, -0.038, -0.23);
    leftHandGroup.rotation.set(0.08, -0.18, -0.18);

    g.add(rightHandGroup, leftHandGroup);
  } else if (w.id === 'ak47') {
    const receiver = bx(0.044, 0.066, 0.29, mats.gunmetalDark);
    receiver.position.set(0, 0.0, 0.01);
    const dustCover = cy(0.021, 0.022, 0.27, 10, mats.gunmetalBrushed);
    dustCover.position.set(0, 0.033, 0.015);

    const boltCarrier = bx(0.012, 0.018, 0.065, mats.chromeSteel);
    boltCarrier.position.set(0.026, 0.024, -0.02);
    g.add(boltCarrier);
    slideMesh = boltCarrier;
    slideRestZ = -0.02;

    const stock = bx(0.036, 0.078, 0.19, mats.woodWalnut);
    stock.position.set(0, -0.014, 0.23);
    stock.rotation.x = 0.06;
    const grip = bx(0.032, 0.105, 0.046, mats.bakeliteOrange);
    grip.position.set(0, -0.075, 0.105);
    grip.rotation.x = 0.34;
    const trigGuard = bx(0.012, 0.028, 0.052, mats.gunmetalDark);
    trigGuard.position.set(0, -0.042, 0.052);

    const lowerWood = bx(0.046, 0.042, 0.21, mats.woodWalnut);
    lowerWood.position.set(0, -0.004, -0.235);
    const upperWood = cy(0.019, 0.019, 0.18, 10, mats.woodWalnut);
    upperWood.position.set(0, 0.032, -0.22);
    const gasBlock = bx(0.026, 0.048, 0.035, mats.gunmetalDark);
    gasBlock.position.set(0, 0.02, -0.35);

    const barrel = cy(0.012, 0.013, 0.32, 10, mats.gunmetalDark);
    barrel.position.set(0, 0.012, -0.47);
    const sightTower = bx(0.018, 0.046, 0.028, mats.gunmetalDark);
    sightTower.position.set(0, 0.034, -0.57);
    const brake = cy(0.015, 0.014, 0.048, 10, mats.gunmetalBrushed);
    brake.position.set(0, 0.012, -0.64);
    brake.rotation.x = -0.12;

    magGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const seg = bx(0.032, 0.052, 0.064, mats.bakeliteOrange);
      const t = i * 0.045;
      seg.position.set(0, -0.052 - t * 0.95, -0.058 - i * 0.012 - t * 0.28);
      seg.rotation.x = -0.14 - i * 0.11;
      magGroup.add(seg);
    }
    g.add(magGroup);

    addRail(0, 0.053, 0.0, 0.11, 5);
    addHoloOptic(0.056, -0.005);

    g.add(receiver, dustCover, stock, grip, trigGuard, lowerWood, upperWood, gasBlock, barrel, sightTower, brake);
    muzzleZ = -0.67;
    muzzleY = 0.014;

    rightHandGroup = buildArticulatedArm('right', 'rifle_trigger', mats);
    rightHandGroup.position.set(0.012, -0.046, 0.108);
    rightHandGroup.rotation.set(0.28, 0, 0);

    leftHandGroup = buildArticulatedArm('left', 'rifle_support', mats);
    leftHandGroup.position.set(-0.02, -0.024, -0.23);
    leftHandGroup.rotation.set(0.06, -0.18, -0.22);

    g.add(rightHandGroup, leftHandGroup);
  } else if (w.id === 'm4a1') {
    const upper = bx(0.044, 0.054, 0.27, mats.gunmetalDark);
    upper.position.set(0, 0.018, 0.0);
    const lower = bx(0.042, 0.045, 0.23, mats.gunmetalDark);
    lower.position.set(0, -0.018, 0.01);
    const deflector = bx(0.018, 0.022, 0.028, mats.gunmetalBrushed);
    deflector.position.set(0.025, 0.02, 0.03);

    const bolt = bx(0.008, 0.02, 0.062, mats.chromeSteel);
    bolt.position.set(0.021, 0.02, -0.015);
    g.add(bolt);
    slideMesh = bolt;
    slideRestZ = -0.015;

    const bufferTube = cy(0.019, 0.019, 0.22, 10, mats.gunmetalBrushed);
    bufferTube.position.set(0, 0.012, 0.22);
    const stock = bx(0.048, 0.088, 0.15, mats.polymerBlack);
    stock.position.set(0, -0.01, 0.25);
    const grip = bx(0.032, 0.108, 0.046, mats.rubberGrip);
    grip.position.set(0, -0.078, 0.095);
    grip.rotation.x = 0.3;

    const handguard = bx(0.048, 0.052, 0.24, mats.gunmetalDark);
    handguard.position.set(0, 0.016, -0.255);
    addRail(0, 0.045, -0.12, 0.44, 16);
    const foregrip = cy(0.017, 0.016, 0.092, 10, mats.rubberGrip);
    foregrip.rotation.x = Math.PI / 2;
    foregrip.position.set(0, -0.045, -0.26);

    const barrel = cy(0.012, 0.012, 0.14, 10, mats.gunmetalBrushed);
    barrel.position.set(0, 0.018, -0.42);
    const suppressor = cy(0.022, 0.022, 0.24, 14, mats.polymerBlack);
    suppressor.position.set(0, 0.018, -0.58);

    magGroup = new THREE.Group();
    const mag1 = bx(0.03, 0.09, 0.066, mats.gunmetalBrushed);
    mag1.position.set(0, -0.068, -0.075);
    mag1.rotation.x = -0.1;
    const mag2 = bx(0.03, 0.065, 0.065, mats.gunmetalBrushed);
    mag2.position.set(0, -0.125, -0.085);
    mag2.rotation.x = -0.22;
    magGroup.add(mag1, mag2);
    g.add(magGroup);

    addHoloOptic(0.049, -0.015);

    g.add(upper, lower, deflector, bufferTube, stock, grip, handguard, foregrip, barrel, suppressor);
    muzzleZ = -0.71;
    muzzleY = 0.018;

    rightHandGroup = buildArticulatedArm('right', 'rifle_trigger', mats);
    rightHandGroup.position.set(0.012, -0.048, 0.098);
    rightHandGroup.rotation.set(0.24, 0, 0);

    leftHandGroup = buildArticulatedArm('left', 'rifle_support', mats);
    leftHandGroup.position.set(-0.018, -0.042, -0.255);
    leftHandGroup.rotation.set(0.08, -0.15, -0.18);

    g.add(rightHandGroup, leftHandGroup);
  } else {
    // HK MP5-SD Suppressed SMG
    const receiver = bx(0.04, 0.058, 0.25, mats.gunmetalDark);
    receiver.position.set(0, 0.01, -0.01);
    const upperTube = cy(0.018, 0.018, 0.28, 12, mats.gunmetalDark);
    upperTube.position.set(0, 0.036, -0.04);

    const bolt = bx(0.026, 0.012, 0.016, mats.gunmetalBrushed);
    bolt.position.set(-0.022, 0.038, -0.15);
    g.add(bolt);
    slideMesh = bolt;
    slideRestZ = -0.15;

    const sdShroud = cy(0.026, 0.026, 0.25, 14, mats.rubberGrip);
    sdShroud.position.set(0, 0.02, -0.27);
    const sdTip = cy(0.018, 0.025, 0.022, 14, mats.gunmetalDark);
    sdTip.position.set(0, 0.02, -0.405);

    const grip = bx(0.032, 0.105, 0.046, mats.polymerBlack);
    grip.position.set(0, -0.068, 0.072);
    grip.rotation.x = 0.26;

    magGroup = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const seg = bx(0.024, 0.056, 0.042, mats.gunmetalBrushed);
      seg.position.set(0, -0.048 - i * 0.048, -0.068 - i * 0.018);
      seg.rotation.x = -0.22 - i * 0.1;
      magGroup.add(seg);
    }
    g.add(magGroup);

    const railL = cy(0.005, 0.005, 0.2, 6, mats.gunmetalBrushed);
    railL.position.set(-0.022, 0.01, 0.12);
    const railR = railL.clone();
    railR.position.x = 0.022;

    addRail(0, 0.052, -0.01, 0.11, 5);
    addHoloOptic(0.055, -0.015);

    g.add(receiver, upperTube, sdShroud, sdTip, grip, railL, railR);
    muzzleZ = -0.425;
    muzzleY = 0.02;

    rightHandGroup = buildArticulatedArm('right', 'rifle_trigger', mats);
    rightHandGroup.position.set(0.012, -0.044, 0.078);
    rightHandGroup.rotation.set(0.22, 0, 0);

    leftHandGroup = buildArticulatedArm('left', 'rifle_support', mats);
    leftHandGroup.position.set(-0.02, -0.012, -0.24);
    leftHandGroup.rotation.set(0.06, -0.18, -0.22);

    g.add(rightHandGroup, leftHandGroup);
  }

  return {
    group: g,
    muzzleOffset: new THREE.Vector3(0, muzzleY, muzzleZ),
    slideMesh,
    slideRestZ,
    magGroup,
    magRestPos: magGroup ? magGroup.position.clone() : undefined,
    magRestRot: magGroup ? magGroup.rotation.clone() : undefined,
    leftHandGroup,
    leftHandRestPos: leftHandGroup ? leftHandGroup.position.clone() : undefined,
    leftHandRestRot: leftHandGroup ? leftHandGroup.rotation.clone() : undefined,
    rightHandGroup,
    rightHandRestPos: rightHandGroup.position.clone(),
    rightHandRestRot: rightHandGroup.rotation.clone()
  };
}

/**
 * Builds the 3D Tactical Bomb Defusal Tool & Dual Animated Hands
 * shown when a Police (CT) player holds E to defuse C4.
 */
export function buildDefuseToolViewmodel(team: 'gang' | 'swat'): BuiltViewmodel {
  const g = new THREE.Group();
  g.name = 'VM_DefuseTool';
  const mats = createSharedMaterials(team);
  const bx = (w: number, h: number, d: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // Right Hand holding Heavy Tactical Wire Cutters / Pliers
  const rightHandGroup = buildArticulatedArm('right', 'defuse', mats);
  rightHandGroup.position.set(0.075, -0.055, 0.03);
  rightHandGroup.rotation.set(0.22, 0.25, 0.15);

  const handleR = bx(0.018, 0.016, 0.11, new THREE.MeshStandardMaterial({ color: 0xe03c1f, roughness: 0.7 }));
  handleR.position.set(0.008, 0.01, -0.03);
  handleR.rotation.y = 0.25;
  const handleL = bx(0.018, 0.016, 0.11, new THREE.MeshStandardMaterial({ color: 0xe03c1f, roughness: 0.7 }));
  handleL.position.set(-0.016, 0.01, -0.03);
  handleL.rotation.y = -0.25;

  const cutterJawL = bx(0.012, 0.014, 0.055, mats.chromeSteel);
  cutterJawL.position.set(-0.008, 0.012, -0.095);
  const cutterJawR = bx(0.012, 0.014, 0.055, mats.chromeSteel);
  cutterJawR.position.set(0.008, 0.012, -0.095);

  rightHandGroup.add(handleR, handleL, cutterJawL, cutterJawR);

  // Left Hand holding Multimeter Probe / Holding Wire Bundle
  const leftHandGroup = buildArticulatedArm('left', 'defuse', mats);
  leftHandGroup.position.set(-0.085, -0.065, 0.02);
  leftHandGroup.rotation.set(0.25, -0.28, -0.18);

  const meter = bx(0.055, 0.022, 0.085, new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 }));
  meter.position.set(-0.01, 0.018, -0.03);
  const meterScreen = bx(0.04, 0.005, 0.035, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  meterScreen.position.set(-0.01, 0.03, -0.042);
  leftHandGroup.add(meter, meterScreen);

  g.add(rightHandGroup, leftHandGroup);

  return {
    group: g,
    muzzleOffset: new THREE.Vector3(),
    leftHandGroup,
    leftHandRestPos: leftHandGroup.position.clone(),
    leftHandRestRot: leftHandGroup.rotation.clone(),
    rightHandGroup,
    rightHandRestPos: rightHandGroup.position.clone(),
    rightHandRestRot: rightHandGroup.rotation.clone(),
    extraAnimParts: { cutterJawL, cutterJawR }
  };
}

export interface BuiltInspectWeapon {
  group: THREE.Group;
  magGroup?: THREE.Group;
  slideMesh?: THREE.Object3D;
  magRestPos?: THREE.Vector3;
  defaultDistance: number;
}

/**
 * Builds a centered, standalone 3D firearm/item model (without first-person hands/arms)
 * for interactive 360-degree Weapon Armory inspection in the Main Menu.
 */
export function buildInspectWeaponModel(w: WeaponStats): BuiltInspectWeapon {
  const team: 'gang' | 'swat' = w.team === 'swat' ? 'swat' : 'gang';
  const vm = buildRealisticViewmodel(w, team);

  if (vm.leftHandGroup) {
    vm.group.remove(vm.leftHandGroup);
  }
  if (vm.rightHandGroup) {
    vm.group.remove(vm.rightHandGroup);
  }

  // Wrap inside a centered pivot so rotation & OrbitControls orbit the exact geometric center
  const pivot = new THREE.Group();
  pivot.name = 'Inspect_' + w.id;
  pivot.add(vm.group);

  // Rotate weapon to clean broadside presentation facing +X/+Z viewer angle
  vm.group.rotation.y = Math.PI / 2;
  vm.group.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(vm.group);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  vm.group.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.35);
  const defaultDistance = Math.max(0.55, maxDim * 1.48);

  return {
    group: pivot,
    magGroup: vm.magGroup,
    slideMesh: vm.slideMesh,
    magRestPos: vm.magRestPos,
    defaultDistance
  };
}

