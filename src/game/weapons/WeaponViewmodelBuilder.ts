import * as THREE from 'three';
import { WeaponStats } from './WeaponData';
import { createWeaponMaterials, WeaponFinishOverride, WeaponMaterialSet } from './WeaponMaterials';
import {
  createBeveledBox,
  createCurvedAKMagazine,
  createCurvedM4Magazine,
  createHollowMuzzleBore,
  createLatheZ,
  createOpenHoloOptic,
  createPicatinnyRail,
  createScrewHead,
  extrudeSideProfile
} from './WeaponGeometry';

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

/**
 * Builds an articulated tactical gloved hand + forearm wrapped naturally around a grip or handguard.
 */
function buildArticulatedArm(
  side: 'left' | 'right',
  style: 'pistol_trigger' | 'pistol_support' | 'rifle_trigger' | 'rifle_support' | 'knife' | 'c4_hold' | 'c4_type' | 'defuse',
  mats: WeaponMaterialSet
): THREE.Group {
  const arm = new THREE.Group();
  const cap = (r: number, len: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
  const cyl = (rt: number, rb: number, len: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, 10).rotateX(Math.PI / 2), mat);
  const bx = (w: number, h: number, d: number, mat: THREE.Material) =>
    new THREE.Mesh(createBeveledBox(w, h, d, 0.002, 2), mat);

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
export function buildRealisticViewmodel(
  w: WeaponStats,
  team: 'gang' | 'swat',
  finish?: WeaponFinishOverride
): BuiltViewmodel {
  const g = new THREE.Group();
  g.name = 'VM_' + w.id;
  const mats = createWeaponMaterials(team, finish);

  let muzzleZ = -0.5;
  let muzzleY = 0.025;
  let slideMesh: THREE.Object3D | undefined;
  let slideRestZ = 0;
  let magGroup: THREE.Group | undefined;

  const bx = (width: number, height: number, depth: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  const bbx = (width: number, height: number, depth: number, mat: THREE.Material, bevel = 0.0018) =>
    new THREE.Mesh(createBeveledBox(width, height, depth, bevel, 2), mat);
  const cy = (rt: number, rb: number, len: number, seg: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg).rotateX(Math.PI / 2), mat);

  const addRail = (x: number, y: number, zCenter: number, len: number, notches: number) => {
    const rail = createPicatinnyRail(len, notches, mats.anodizedBlack, mats.gunmetalBrushed, 0.022);
    rail.position.set(x, y, zCenter);
    g.add(rail);
  };

  const addHoloOptic = (yBase: number, zCenter: number) => {
    g.add(createOpenHoloOptic(yBase, zCenter, mats));
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
  } else if (w.id === 'hegrenade') {
    const heOlive = new THREE.MeshStandardMaterial({ color: 0x3b4d2b, roughness: 0.62, metalness: 0.25 });
    const heBand = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.45, metalness: 0.35 });
    const brassSpoon = new THREE.MeshStandardMaterial({ color: 0xb48a3e, roughness: 0.32, metalness: 0.85 });

    // Textured fragmentation egg body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.044, 14, 12), heOlive);
    body.scale.set(0.92, 1.18, 0.92);
    const fragBand = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.004, 6, 14), heBand);
    fragBand.rotation.x = Math.PI / 2;
    fragBand.position.y = 0.012;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.024, 10), mats.gunmetalDark);
    neck.position.set(0, 0.056, 0);
    const fuseHead = bx(0.026, 0.022, 0.028, mats.gunmetalBrushed);
    fuseHead.position.set(0, 0.072, 0);

    // Brass safety spoon lever along right/back side
    const spoonTop = bx(0.014, 0.007, 0.048, brassSpoon);
    spoonTop.position.set(0.016, 0.078, 0.014);
    spoonTop.rotation.x = 0.28;
    const spoonArm = bx(0.012, 0.078, 0.008, brassSpoon);
    spoonArm.position.set(0.024, 0.036, 0.038);
    spoonArm.rotation.x = -0.22;

    // Pull pin ring on left side
    const pinRing = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0026, 6, 16), mats.chromeSteel);
    pinRing.position.set(-0.024, 0.068, -0.004);
    pinRing.rotation.y = Math.PI / 2 - 0.3;

    g.add(body, fragBand, neck, fuseHead, spoonTop, spoonArm, pinRing);
    muzzleZ = -0.1;
    muzzleY = 0.04;

    rightHandGroup = buildArticulatedArm('right', 'knife', mats);
    rightHandGroup.position.set(0.016, -0.028, 0.018);
    rightHandGroup.rotation.set(0.18, -0.08, 0.22);

    leftHandGroup = buildArticulatedArm('left', 'c4_hold', mats);
    leftHandGroup.position.set(-0.085, -0.032, 0.016);
    leftHandGroup.rotation.set(0.12, -0.22, -0.32);

    g.add(rightHandGroup, leftHandGroup);
  } else if (w.id === 'smokegrenade') {
    const smokeBodyMat = new THREE.MeshStandardMaterial({ color: 0x525b66, roughness: 0.52, metalness: 0.42 });
    const smokeStripe = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.45, metalness: 0.2 });
    const smokeTop = new THREE.MeshStandardMaterial({ color: 0x262b33, roughness: 0.35, metalness: 0.78 });

    const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.135, 16), smokeBodyMat);
    const bandMid = new THREE.Mesh(new THREE.CylinderGeometry(0.0375, 0.0375, 0.024, 16), smokeStripe);
    bandMid.position.y = 0.022;
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.018, 16), smokeTop);
    capTop.position.y = 0.072;
    const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.014, 16), smokeTop);
    capBot.position.y = -0.068;

    const fuseTower = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.024, 10), mats.gunmetalBrushed);
    fuseTower.position.y = 0.09;
    const spoon = bx(0.012, 0.088, 0.008, mats.gunmetalBrushed);
    spoon.position.set(0.028, 0.048, 0.026);
    spoon.rotation.x = -0.15;
    const pinRing = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0026, 6, 16), mats.chromeSteel);
    pinRing.position.set(-0.024, 0.086, -0.006);
    pinRing.rotation.y = Math.PI / 2 - 0.25;

    g.add(canister, bandMid, capTop, capBot, fuseTower, spoon, pinRing);
    muzzleZ = -0.1;
    muzzleY = 0.05;

    rightHandGroup = buildArticulatedArm('right', 'knife', mats);
    rightHandGroup.position.set(0.018, -0.034, 0.018);
    rightHandGroup.rotation.set(0.16, -0.08, 0.22);

    leftHandGroup = buildArticulatedArm('left', 'c4_hold', mats);
    leftHandGroup.position.set(-0.085, -0.03, 0.016);
    leftHandGroup.rotation.set(0.14, -0.22, -0.32);

    g.add(rightHandGroup, leftHandGroup);
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
    // === BATCH 1 PILOT: AWP MAGNUM (L96A1 Precision Chassis Rifle) ===
    // 1. Sculpted Olive-Drab L96A1 Thumbhole Polymer Chassis with real hollow thumbhole cutout
    const chassisShape: [number, number][] = [
      [-0.39, -0.055],
      [-0.39, 0.014],
      [-0.145, 0.016],
      [-0.08, 0.024],
      [0.37, 0.02],
      [0.37, -0.024],
      [0.14, -0.034],
      [0.01, -0.036],
      [-0.085, -0.034],
      [-0.11, -0.108],
      [-0.155, -0.105],
      [-0.19, -0.068],
      [-0.355, -0.064]
    ];
    const thumbhole: [number, number][] = [
      [-0.245, -0.042],
      [-0.155, -0.042],
      [-0.142, -0.004],
      [-0.255, -0.004]
    ];
    const chassis = new THREE.Mesh(
      extrudeSideProfile(chassisShape, 0.046, 0.0032, 0.0032, 2, [thumbhole]),
      mats.oliveChassis
    );
    g.add(chassis);

    // Adjustable Cheek Rest + Rubber Buttpad + Spacers
    const cheekRest = bbx(0.048, 0.024, 0.135, mats.rubberGrip, 0.004);
    cheekRest.position.set(0, 0.026, 0.255);
    const buttSpacer = bbx(0.044, 0.072, 0.016, mats.polymerBlack, 0.002);
    buttSpacer.position.set(0, -0.02, 0.396);
    const buttPad = bbx(0.046, 0.076, 0.022, mats.rubberGrip, 0.0035);
    buttPad.position.set(0, -0.02, 0.413);
    g.add(cheekRest, buttSpacer, buttPad);

    // Trigger Guard & Match Trigger
    const trigGuardShape: [number, number][] = [
      [-0.105, -0.03],
      [-0.045, -0.03],
      [-0.048, -0.064],
      [-0.105, -0.064]
    ];
    const trigHole: [number, number][] = [
      [-0.097, -0.035],
      [-0.055, -0.035],
      [-0.057, -0.058],
      [-0.097, -0.058]
    ];
    const trigGuard = new THREE.Mesh(
      extrudeSideProfile(trigGuardShape, 0.014, 0.0012, 0.0012, 1, [trigHole]),
      mats.gunmetalDark
    );
    const trigger = bbx(0.005, 0.02, 0.009, mats.gunmetalBrushed, 0.001);
    trigger.position.set(0, -0.046, 0.078);
    trigger.rotation.x = 0.25;
    g.add(trigGuard, trigger);

    // Chassis assembly screws on left/right panels
    for (const sz of [0.16, 0.02, -0.14]) {
      const scL = createScrewHead(0.004, mats.gunmetalBrushed);
      scL.position.set(-0.024, -0.008, sz);
      const scR = scL.clone();
      scR.position.x = 0.024;
      g.add(scL, scR);
    }

    // 2. Heavy Flat-Bottom Steel Action + Recessed Ejection Port + Reciprocating Bolt
    const actionBody = bbx(0.044, 0.036, 0.25, mats.gunmetalDark, 0.003);
    actionBody.position.set(0, 0.034, -0.04);
    const portCavity = bx(0.014, 0.018, 0.088, mats.hollowBore);
    portCavity.position.set(0.017, 0.038, -0.035);
    const boltBody = cy(0.011, 0.011, 0.14, 10, mats.chromeSteel);
    boltBody.position.set(0.012, 0.038, -0.015);
    g.add(actionBody, portCavity, boltBody);

    const boltGrp = new THREE.Group();
    const boltShroud = cy(0.014, 0.014, 0.036, 12, mats.gunmetalDark);
    boltShroud.position.set(0, 0.038, 0.082);
    const boltArm = bbx(0.042, 0.009, 0.011, mats.gunmetalBrushed, 0.0015);
    boltArm.position.set(0.025, 0.036, 0.055);
    boltArm.rotation.z = -0.22;
    const boltKnob = new THREE.Mesh(
      createLatheZ(
        [
          [0.005, -0.012],
          [0.012, -0.004],
          [0.013, 0.006],
          [0.006, 0.014]
        ],
        12
      ),
      mats.rubberGrip
    );
    boltKnob.rotation.y = Math.PI / 2;
    boltKnob.position.set(0.049, 0.027, 0.055);
    boltGrp.add(boltShroud, boltArm, boltKnob);
    g.add(boltGrp);
    slideMesh = boltGrp;
    slideRestZ = 0;

    // 3. Free-Floating Stepped Match Barrel + Dual-Chamber Slotted Muzzle Brake with Hollow Bore
    const barrelProfile: [number, number][] = [
      [0.02, -0.16],
      [0.0185, -0.17],
      [0.016, -0.35],
      [0.014, -0.785],
      [0.0155, -0.79]
    ];
    const barrel = new THREE.Mesh(createLatheZ(barrelProfile, 16), mats.gunmetalDark);
    barrel.position.set(0, 0.036, 0);
    g.add(barrel);

    // Muzzle Brake with dual baffled side ports + dark bore cavity
    const brakeGroup = new THREE.Group();
    brakeGroup.position.set(0, 0.036, -0.825);
    const brakeFront = bbx(0.034, 0.028, 0.018, mats.muzzleSoot, 0.0022);
    brakeFront.position.z = -0.03;
    const brakeMid = bbx(0.034, 0.028, 0.014, mats.gunmetalBrushed, 0.002);
    brakeMid.position.z = 0;
    const brakeRear = bbx(0.034, 0.028, 0.02, mats.gunmetalBrushed, 0.002);
    brakeRear.position.z = 0.028;
    const brakeCore = cy(0.011, 0.011, 0.072, 12, mats.gunmetalDark);
    const brakePorts = bx(0.035, 0.016, 0.046, mats.hollowBore);
    const brakeBore = createHollowMuzzleBore(0.0085, 0.042, mats.hollowBore);
    brakeBore.position.z = -0.039;
    brakeGroup.add(brakeFront, brakeMid, brakeRear, brakeCore, brakePorts, brakeBore);
    g.add(brakeGroup);

    // 4. Detachable Steel .338 Box Magazine
    magGroup = new THREE.Group();
    const magBody = bbx(0.032, 0.088, 0.092, mats.gunmetalDark, 0.002);
    magBody.position.set(0, -0.062, -0.072);
    magBody.rotation.x = -0.06;
    const magFloor = bbx(0.036, 0.012, 0.098, mats.gunmetalBrushed, 0.0018);
    magFloor.position.set(0, -0.106, -0.075);
    magFloor.rotation.x = -0.06;
    magGroup.add(magBody, magFloor);
    g.add(magGroup);

    // 5. Folded Tactical Bipod (Pivot, Springs & Fluted Legs)
    const bipodBase = bbx(0.042, 0.02, 0.042, mats.gunmetalDark, 0.002);
    bipodBase.position.set(0, -0.044, -0.345);
    g.add(bipodBase);
    for (const sx of [-1, 1]) {
      const leg = cy(0.0075, 0.007, 0.175, 10, mats.gunmetalBrushed);
      leg.position.set(sx * 0.028, -0.046, -0.252);
      const foot = cy(0.01, 0.009, 0.024, 10, mats.rubberGrip);
      foot.position.set(sx * 0.028, -0.046, -0.16);
      g.add(leg, foot);
    }

    // 6. Picatinny Scope Rail, Precision Rings, Multi-Stage Scope & Coated Glass Lenses
    addRail(0, 0.056, -0.045, 0.185, 9);
    for (const rz of [0.005, -0.105]) {
      const ringBase = bbx(0.036, 0.014, 0.024, mats.gunmetalDark, 0.0018);
      ringBase.position.set(0, 0.066, rz);
      const ringCap = cy(0.0235, 0.0235, 0.024, 14, mats.gunmetalDark);
      ringCap.position.set(0, 0.088, rz);
      const ringScrew = createScrewHead(0.004, mats.gunmetalBrushed);
      ringScrew.position.set(-0.02, 0.068, rz);
      g.add(ringBase, ringCap, ringScrew);
    }

    const scopeBody = new THREE.Mesh(
      createLatheZ(
        [
          [0.025, 0.125],
          [0.024, 0.06],
          [0.018, 0.035],
          [0.018, -0.155],
          [0.029, -0.205],
          [0.03, -0.285],
          [0.027, -0.286]
        ],
        18
      ),
      mats.anodizedBlack
    );
    scopeBody.position.set(0, 0.088, 0);

    // Objective & Ocular Recessed Multi-Coated Sniper Lenses
    const objLens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), mats.sniperLens);
    objLens.position.set(0, 0.088, -0.282);
    objLens.rotation.y = Math.PI;
    const eyeLens = new THREE.Mesh(new THREE.CircleGeometry(0.021, 16), mats.sniperLens);
    eyeLens.position.set(0, 0.088, 0.124);

    // Knurled Elevation, Windage & Parallax Turrets
    const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.022, 12), mats.gunmetalBrushed);
    elevTurret.position.set(0, 0.114, -0.05);
    const windTurret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.013, 0.02, 12).rotateZ(Math.PI / 2),
      mats.gunmetalBrushed
    );
    windTurret.position.set(0.024, 0.088, -0.05);
    const paraTurret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.013, 0.018, 12).rotateZ(Math.PI / 2),
      mats.gunmetalBrushed
    );
    paraTurret.position.set(-0.023, 0.088, -0.05);

    // Open Flip-Up Objective Dust Cap
    const flipCap = bbx(0.044, 0.006, 0.038, mats.polymerBlack, 0.0015);
    flipCap.position.set(0, 0.126, -0.268);
    flipCap.rotation.x = -0.35;

    g.add(scopeBody, objLens, eyeLens, elevTurret, windTurret, paraTurret, flipCap);
    muzzleZ = -0.885;
    muzzleY = 0.036;

    rightHandGroup = buildArticulatedArm('right', 'rifle_trigger', mats);
    rightHandGroup.position.set(0.014, -0.038, 0.105);
    rightHandGroup.rotation.set(0.18, 0, 0);

    leftHandGroup = buildArticulatedArm('left', 'rifle_support', mats);
    leftHandGroup.position.set(-0.022, -0.038, -0.23);
    leftHandGroup.rotation.set(0.08, -0.18, -0.18);

    g.add(rightHandGroup, leftHandGroup);
  } else if (w.id === 'ak47') {
    // === BATCH 1 PILOT: AK-47 KALASHNIKOV ===
    // 1. Stamped Steel Receiver with Bevels, Magwell Dimples & Side Optics Rail
    const receiverShape: [number, number][] = [
      [-0.14, -0.026],
      [0.145, -0.026],
      [0.145, 0.022],
      [-0.132, 0.024],
      [-0.14, 0.012]
    ];
    const receiver = new THREE.Mesh(extrudeSideProfile(receiverShape, 0.042, 0.0022, 0.0022, 2), mats.gunmetalDark);
    g.add(receiver);

    // Ribbed Arched Dust Cover + Recessed Ejection Port Cavity
    const dustCoverShape: [number, number][] = [
      [-0.132, 0.021],
      [0.142, 0.019],
      [0.136, 0.038],
      [0.06, 0.045],
      [-0.08, 0.045],
      [-0.128, 0.037]
    ];
    const dustCover = new THREE.Mesh(extrudeSideProfile(dustCoverShape, 0.038, 0.003, 0.003, 2), mats.anodizedBlack);
    const portCavity = bx(0.012, 0.016, 0.086, mats.hollowBore);
    portCavity.position.set(0.017, 0.022, -0.018);
    g.add(dustCover, portCavity);

    // Stamped Rivets, Side Optics Dovetail Plate & Fire Selector Lever
    for (const rz of [-0.11, -0.085, 0.115]) {
      const rL = createScrewHead(0.0032, mats.gunmetalBrushed);
      rL.position.set(-0.0215, 0.006, rz);
      const rR = rL.clone();
      rR.position.x = 0.0215;
      g.add(rL, rR);
    }
    const dovetailPlate = bbx(0.007, 0.016, 0.105, mats.gunmetalBrushed, 0.001);
    dovetailPlate.position.set(-0.023, 0.004, 0.025);
    const selectorLever = bbx(0.005, 0.012, 0.082, mats.gunmetalBrushed, 0.001);
    selectorLever.position.set(0.023, 0.005, 0.042);
    selectorLever.rotation.x = 0.12;
    g.add(dovetailPlate, selectorLever);

    // Reciprocating Chrome Steel Bolt Carrier + Curved Charging Handle
    const boltGrp = new THREE.Group();
    const boltBody = bbx(0.011, 0.015, 0.068, mats.chromeSteel, 0.0016);
    boltBody.position.set(0.018, 0.022, -0.016);
    const chargeStem = bbx(0.018, 0.008, 0.01, mats.chromeSteel, 0.0012);
    chargeStem.position.set(0.028, 0.022, -0.036);
    chargeStem.rotation.z = 0.16;
    boltGrp.add(boltBody, chargeStem);
    g.add(boltGrp);
    slideMesh = boltGrp;
    slideRestZ = 0;

    // 2. Sculpted Sloped Walnut Buttstock + Stamped Steel Buttplate + Sling Loop
    const stockShape: [number, number][] = [
      [-0.365, -0.068],
      [-0.365, 0.006],
      [-0.14, 0.02],
      [-0.14, -0.022]
    ];
    const stock = new THREE.Mesh(extrudeSideProfile(stockShape, 0.036, 0.003, 0.003, 2), mats.woodWalnut);
    const buttPlate = bbx(0.038, 0.078, 0.012, mats.gunmetalDark, 0.002);
    buttPlate.position.set(0, -0.031, 0.368);
    g.add(stock, buttPlate);

    // 3. Bakelite Pistol Grip + Trigger Guard + Curved Trigger
    const gripShape: [number, number][] = [
      [-0.105, -0.024],
      [-0.065, -0.024],
      [-0.098, -0.118],
      [-0.136, -0.112]
    ];
    const grip = new THREE.Mesh(extrudeSideProfile(gripShape, 0.03, 0.0032, 0.0032, 2), mats.bakeliteOrange);
    const trigGuardShape: [number, number][] = [
      [-0.068, -0.024],
      [-0.014, -0.024],
      [-0.018, -0.056],
      [-0.068, -0.056]
    ];
    const trigHole: [number, number][] = [
      [-0.061, -0.029],
      [-0.022, -0.029],
      [-0.025, -0.05],
      [-0.061, -0.05]
    ];
    const trigGuard = new THREE.Mesh(
      extrudeSideProfile(trigGuardShape, 0.012, 0.001, 0.001, 1, [trigHole]),
      mats.gunmetalDark
    );
    const trigger = bbx(0.005, 0.02, 0.008, mats.gunmetalBrushed, 0.001);
    trigger.position.set(0, -0.038, 0.046);
    trigger.rotation.x = 0.32;
    g.add(grip, trigGuard, trigger);

    // 4. Vented Walnut Handguards + Gas Tube + Angled Gas Block + Cleaning Rod
    const lowerHgShape: [number, number][] = [
      [0.145, -0.022],
      [0.335, -0.012],
      [0.335, 0.018],
      [0.145, 0.018]
    ];
    const lowerWood = new THREE.Mesh(extrudeSideProfile(lowerHgShape, 0.044, 0.0035, 0.0035, 2), mats.woodWalnut);
    const upperWood = new THREE.Mesh(
      createLatheZ(
        [
          [0.017, -0.155],
          [0.0195, -0.19],
          [0.0195, -0.295],
          [0.017, -0.325]
        ],
        12
      ),
      mats.woodWalnut
    );
    upperWood.position.set(0, 0.031, 0);
    const hgRetainer = bbx(0.036, 0.034, 0.014, mats.gunmetalDark, 0.0018);
    hgRetainer.position.set(0, 0.006, -0.335);
    const gasTube = cy(0.011, 0.011, 0.19, 10, mats.gunmetalDark);
    gasTube.position.set(0, 0.031, -0.255);
    const gasBlockShape: [number, number][] = [
      [0.34, 0.002],
      [0.365, 0.002],
      [0.352, 0.041],
      [0.332, 0.041]
    ];
    const gasBlock = new THREE.Mesh(extrudeSideProfile(gasBlockShape, 0.024, 0.002, 0.002, 2), mats.gunmetalDark);
    g.add(lowerWood, upperWood, hgRetainer, gasTube, gasBlock);

    // 5. Blued Barrel + Cleaning Rod + Hooded Front Sight + Slanted 7.62 Compensator w/ Hollow Bore
    const barrel = new THREE.Mesh(
      createLatheZ(
        [
          [0.014, -0.14],
          [0.0125, -0.36],
          [0.011, -0.625]
        ],
        14
      ),
      mats.gunmetalDark
    );
    barrel.position.set(0, 0.012, 0);
    const cleaningRod = cy(0.0032, 0.0032, 0.25, 8, mats.gunmetalBrushed);
    cleaningRod.position.set(0, -0.003, -0.455);

    const sightBase = bbx(0.02, 0.03, 0.026, mats.gunmetalDark, 0.0015);
    sightBase.position.set(0, 0.022, -0.575);
    const sightHood = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.022, 12, 1, true, -Math.PI * 0.68, Math.PI * 1.36).rotateX(Math.PI / 2),
      mats.gunmetalDark
    );
    sightHood.position.set(0, 0.042, -0.575);
    const sightPost = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.002, 0.014, 6), mats.greenTritium);
    sightPost.position.set(0, 0.04, -0.575);

    // Iconic Slant Muzzle Compensator + Hollow Dark Bore
    const brake = new THREE.Mesh(
      createLatheZ(
        [
          [0.0135, -0.618],
          [0.015, -0.625],
          [0.015, -0.662],
          [0.013, -0.664]
        ],
        14
      ),
      mats.muzzleSoot
    );
    brake.position.set(0, 0.012, 0);
    const brakeBore = createHollowMuzzleBore(0.0085, 0.038, mats.hollowBore);
    brakeBore.position.set(0, 0.012, -0.664);

    g.add(barrel, cleaningRod, sightBase, sightHood, sightPost, brake, brakeBore);

    // 6. Real Circular-Arc Curved 30rd Bakelite Magazine
    magGroup = createCurvedAKMagazine(mats);
    g.add(magGroup);

    // 7. Rear Iron Sight Leaf + Side-Mount Picatinny Rail + Open Holo Optic
    const rearLeaf = bbx(0.018, 0.012, 0.045, mats.gunmetalBrushed, 0.0012);
    rearLeaf.position.set(0, 0.04, -0.145);
    g.add(rearLeaf);
    addRail(0, 0.05, 0.0, 0.115, 6);
    addHoloOptic(0.054, -0.005);

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
    // === BATCH 1 PILOT: M4A1-S TACTICAL CARBINE ===
    // 1. Forged AR-15 Upper & Lower Receiver with Bevels, Magwell Flare & Brass Deflector
    const upperShape: [number, number][] = [
      [-0.135, -0.002],
      [0.135, -0.002],
      [0.135, 0.039],
      [-0.115, 0.039],
      [-0.135, 0.026]
    ];
    const upper = new THREE.Mesh(extrudeSideProfile(upperShape, 0.042, 0.0022, 0.0022, 2), mats.anodizedBlack);

    const lowerShape: [number, number][] = [
      [-0.125, -0.032],
      [-0.03, -0.032],
      [-0.022, -0.044],
      [0.105, -0.044],
      [0.112, 0.0],
      [-0.125, 0.0]
    ];
    const lower = new THREE.Mesh(extrudeSideProfile(lowerShape, 0.04, 0.0022, 0.0022, 2), mats.anodizedBlack);

    // Brass Deflector + Forward Assist + Ejection Port + Chrome BCG
    const deflector = bbx(0.018, 0.024, 0.024, mats.gunmetalBrushed, 0.002);
    deflector.position.set(0.025, 0.02, 0.034);
    const forwardAssist = cy(0.007, 0.007, 0.024, 10, mats.gunmetalDark);
    forwardAssist.position.set(0.023, 0.016, 0.068);
    forwardAssist.rotation.y = 0.25;
    const portCavity = bx(0.012, 0.018, 0.066, mats.hollowBore);
    portCavity.position.set(0.017, 0.02, -0.018);
    const dustDoor = bbx(0.004, 0.016, 0.066, mats.gunmetalDark, 0.001);
    dustDoor.position.set(0.024, 0.005, -0.018);
    dustDoor.rotation.z = -1.35;

    const bolt = bbx(0.009, 0.017, 0.062, mats.chromeSteel, 0.0012);
    bolt.position.set(0.018, 0.02, -0.015);
    g.add(upper, lower, deflector, forwardAssist, portCavity, dustDoor, bolt);
    slideMesh = bolt;
    slideRestZ = -0.015;

    // AR-15 Charging Handle Latch + Fire Selector + Trigger Guard & Takedown Pins
    const chargeLatch = bbx(0.032, 0.01, 0.018, mats.gunmetalBrushed, 0.0014);
    chargeLatch.position.set(0, 0.034, 0.138);
    const selector = bbx(0.005, 0.009, 0.028, mats.gunmetalBrushed, 0.001);
    selector.position.set(-0.022, -0.008, 0.088);
    selector.rotation.x = 0.45;
    const trigGuard = bbx(0.01, 0.006, 0.056, mats.anodizedBlack, 0.0012);
    trigGuard.position.set(0, -0.048, 0.042);
    const trigger = bbx(0.005, 0.022, 0.008, mats.gunmetalBrushed, 0.001);
    trigger.position.set(0, -0.034, 0.036);
    trigger.rotation.x = 0.34;
    for (const pz of [0.105, -0.025]) {
      const pin = createScrewHead(0.0036, mats.gunmetalBrushed);
      pin.position.set(-0.021, -0.008, pz);
      g.add(pin);
    }
    g.add(chargeLatch, selector, trigGuard, trigger);

    // 2. Buffer Tube + Castle Nut + SOPMOD Crane Stock with Sling Slot
    const bufferTube = new THREE.Mesh(
      createLatheZ(
        [
          [0.023, 0.135],
          [0.023, 0.152],
          [0.0185, 0.154],
          [0.0185, 0.34]
        ],
        14
      ),
      mats.gunmetalBrushed
    );
    bufferTube.position.set(0, 0.015, 0);

    const craneShape: [number, number][] = [
      [-0.355, -0.068],
      [-0.355, 0.034],
      [-0.225, 0.034],
      [-0.175, 0.012],
      [-0.19, -0.026],
      [-0.31, -0.066]
    ];
    const slingHole: [number, number][] = [
      [-0.328, -0.034],
      [-0.275, -0.034],
      [-0.275, -0.018],
      [-0.328, -0.018]
    ];
    const stock = new THREE.Mesh(
      extrudeSideProfile(craneShape, 0.046, 0.0035, 0.0035, 2, [slingHole]),
      mats.polymerBlack
    );
    const stockPad = bbx(0.044, 0.096, 0.014, mats.rubberGrip, 0.003);
    stockPad.position.set(0, -0.017, 0.36);

    // Stippled Ergonomic Pistol Grip
    const gripShape: [number, number][] = [
      [-0.118, -0.025],
      [-0.072, -0.025],
      [-0.105, -0.124],
      [-0.145, -0.118]
    ];
    const grip = new THREE.Mesh(extrudeSideProfile(gripShape, 0.032, 0.0032, 0.0032, 2), mats.rubberGrip);
    g.add(bufferTube, stock, stockPad, grip);

    // 3. Ventilated Free-Float M-LOK Handguard + Inner Barrel + Angled Foregrip + Continuous Top Rail
    const hgOuter = bbx(0.046, 0.048, 0.245, mats.anodizedBlack, 0.0028);
    hgOuter.position.set(0, 0.017, -0.258);
    // Dark recessed cooling slots along left & right handguard flanks
    for (let i = 0; i < 4; i++) {
      const vent = bx(0.048, 0.011, 0.036, mats.hollowBore);
      vent.position.set(0, 0.017, -0.18 - i * 0.048);
      g.add(vent);
    }
    addRail(0, 0.043, -0.125, 0.48, 18);

    // Tactical Textured Vertical Foregrip with mounting clamp
    const fgMount = bbx(0.028, 0.01, 0.036, mats.gunmetalDark, 0.0015);
    fgMount.position.set(0, -0.011, -0.26);
    const foregrip = new THREE.Mesh(
      createLatheZ(
        [
          [0.017, -0.016],
          [0.0155, -0.055],
          [0.0165, -0.095],
          [0.014, -0.102]
        ],
        12
      ),
      mats.rubberGrip
    );
    foregrip.rotation.x = -Math.PI / 2;
    foregrip.position.set(0, 0.0, -0.26);
    g.add(hgOuter, fgMount, foregrip);

    // 4. Stepped 5.56 Barrel + QD Suppressor w/ Heat Rings + Deep Hollow Bore
    const barrel = new THREE.Mesh(
      createLatheZ(
        [
          [0.014, -0.35],
          [0.012, -0.38],
          [0.012, -0.455],
          [0.017, -0.46]
        ],
        14
      ),
      mats.gunmetalBrushed
    );
    barrel.position.set(0, 0.018, 0);

    const suppressor = new THREE.Mesh(
      createLatheZ(
        [
          [0.021, -0.458],
          [0.0225, -0.478],
          [0.0215, -0.485],
          [0.0215, -0.688],
          [0.019, -0.706],
          [0.014, -0.708]
        ],
        18
      ),
      mats.polymerBlack
    );
    suppressor.position.set(0, 0.018, 0);
    const suppCollar = cy(0.023, 0.023, 0.02, 16, mats.muzzleSoot);
    suppCollar.position.set(0, 0.018, -0.472);
    const suppBore = createHollowMuzzleBore(0.009, 0.042, mats.hollowBore);
    suppBore.position.set(0, 0.018, -0.708);
    g.add(barrel, suppressor, suppCollar, suppBore);

    // 5. Curved Ribbed 5.56 STANAG Magazine
    magGroup = createCurvedM4Magazine(mats);
    g.add(magGroup);

    // 6. Rear Flip Iron + Open Holographic Optic
    const flipRear = bbx(0.024, 0.01, 0.028, mats.gunmetalDark, 0.0014);
    flipRear.position.set(0, 0.05, 0.095);
    g.add(flipRear);
    addHoloOptic(0.047, -0.02);

    muzzleZ = -0.715;
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
  const mats = createWeaponMaterials(team);
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

