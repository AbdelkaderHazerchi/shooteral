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

export interface CharDefinition {
  name: string;
  label: string;
  skin: number;
  top: number;
  sleeve: number;
  pants: number;
  boots: number;
  gloves: number;
  f: number;
  wp: 'rifle' | 'smg';
  extra: (
    P: (b: string, c: number, g: THREE.BufferGeometry, x?: number, y?: number, z?: number) => void,
    Bx: (w: number, h: number, d: number) => THREE.BoxGeometry,
    Cy: (r: number, l: number) => THREE.BufferGeometry,
    S: (r: number) => THREE.SphereGeometry,
    M: (n: string, c: number, mk: () => THREE.BufferGeometry, x: number, y: number, z: number) => void
  ) => void;
}

export const CHAR_DEFS: Record<'swat' | 'gang', CharDefinition> = {
  swat: {
    name: 'SpecialForces',
    label: 'القوات الخاصة',
    skin: 0xd9a47e,
    top: 0x222b38,
    sleeve: 0x222b38,
    pants: 0x1c232d,
    boots: 0x111114,
    gloves: 0x15171b,
    f: 1,
    wp: 'rifle',
    extra(P, Bx, _Cy, _S, M) {
      const vest = 0x2f3745;
      const pad = 0x3a4352;
      const tan = 0x8d7b55;
      const dk = 0x232a33;
      P('chest', vest, Bx(0.47, 0.29, 0.3), 0, 1.34, 0);
      P('spine', vest, Bx(0.37, 0.12, 0.23), 0, 1.17, 0);
      [-0.12, 0, 0.12].forEach((x) => P('chest', tan, Bx(0.09, 0.11, 0.06), x, 1.25, 0.17));
      P('chest', pad, Bx(0.3, 0.28, 0.12), 0, 1.34, -0.2);
      P('chest', 0x111111, Bx(0.03, 0.16, 0.03), 0.17, 1.62, -0.18);
      P('hips', 0x151820, Bx(0.4, 0.06, 0.25), 0, 1.04, 0);
      P('thighR', pad, Bx(0.07, 0.15, 0.1), -0.22, 0.8, 0.03);
      M('uArm', pad, () => Bx(0.15, 0.09, 0.16), 0.26, 1.45, 0);
      M('shin', pad, () => Bx(0.16, 0.12, 0.08), 0.11, 0.5, 0.09);
      M('fArm', pad, () => Bx(0.12, 0.07, 0.12), 0.26, 1.08, 0);
      P('head', dk, Bx(0.27, 0.1, 0.28), 0, 1.82, 0);
      P('head', dk, Bx(0.24, 0.04, 0.25), 0, 1.88, 0);
      P('head', dk, Bx(0.27, 0.04, 0.06), 0, 1.78, 0.15);
      P('head', dk, Bx(0.03, 0.1, 0.12), 0.135, 1.74, 0);
      P('head', dk, Bx(0.03, 0.1, 0.12), -0.135, 1.74, 0);
      P('head', 0x5ab4e8, Bx(0.2, 0.06, 0.04), 0, 1.7, 0.12);
      P('head', 0x0e0e10, Bx(0.21, 0.1, 0.05), 0, 1.62, 0.12);
    }
  },
  gang: {
    name: 'Gang',
    label: 'العصابة',
    skin: 0x8d5a3a,
    top: 0xe9e9e9,
    sleeve: 0x8d5a3a,
    pants: 0x34527a,
    boots: 0xf2f2f2,
    gloves: 0x8d5a3a,
    f: 1.2,
    wp: 'smg',
    extra(P, Bx, _Cy, _S, M) {
      P('hips', 0xb71c1c, Bx(0.4, 0.05, 0.25), 0, 1.03, 0);
      M('uArm', 0x1d2a33, () => Bx(0.125, 0.1, 0.135), 0.26, 1.26, 0);
      M('fArm', 0x1d2a33, () => Bx(0.105, 0.07, 0.115), 0.26, 1.0, 0);
      P('chest', 0xf1c40f, Bx(0.22, 0.03, 0.04), 0, 1.47, 0.14);
      P('chest', 0xf1c40f, Bx(0.05, 0.07, 0.03), 0, 1.42, 0.15);
      P('chest', 0xb71c1c, Bx(0.44, 0.04, 0.26), 0, 1.2, 0);
      P('head', 0x1b1b1f, Bx(0.26, 0.12, 0.27), 0, 1.82, 0);
      P('head', 0x1b1b1f, Bx(0.27, 0.05, 0.28), 0, 1.76, 0);
      P('head', 0xb71c1c, Bx(0.21, 0.1, 0.05), 0, 1.62, 0.12);
      P('head', 0xb71c1c, Bx(0.07, 0.07, 0.07), 0, 1.6, -0.13);
      P('head', 0x0b0b0d, Bx(0.21, 0.045, 0.04), 0, 1.71, 0.125);
      M('foot', 0x2a2a2a, () => Bx(0.16, 0.03, 0.3), 0.11, 0.015, 0.05);
      M('foot', 0xc0392b, () => Bx(0.12, 0.04, 0.1), 0.11, 0.09, 0.12);
    }
  }
};

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

function pose(ch: { bones: THREE.Bone[]; by: Record<string, THREE.Bone>; group: THREE.Group; grip: { L: THREE.Vector3; R: THREE.Vector3 } }, p: PoseData) {
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

function gait(t: number, A: number, Bk: number, base: number, lean: number, wpx: number, dyf: (p: number) => number): PoseData {
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

/* ===== Build Complete Skinned Character ===== */
export function buildCharacter(team: 'swat' | 'gang', customName?: string): CharacterInstance {
  const o = CHAR_DEFS[team];
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

  const parts: [string, number, THREE.BufferGeometry][] = [];
  const Bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const Cy = (r: number, l: number) => new THREE.CylinderGeometry(r, r, l, 8).rotateX(Math.PI / 2);
  const S = (r: number) => new THREE.SphereGeometry(r, 8, 6);
  const P = (b: string, c: number, g: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    parts.push([b, c, g.translate(x, y, z).toNonIndexed()]);
  };
  const M = (n: string, c: number, mk: () => THREE.BufferGeometry, x: number, y: number, z: number) => {
    P(n + 'L', c, mk(), x, y, z);
    P(n + 'R', c, mk(), -x, y, z);
  };

  const f = o.f;
  const sk = o.skin;
  P('hips', o.pants, Bx(0.38 * f, 0.2, 0.23 * f), 0, 0.96, 0);
  P('spine', o.top, Bx(0.34, 0.22, 0.2), 0, 1.12, 0);
  P('chest', o.top, Bx(0.42, 0.3, 0.25), 0, 1.34, 0);
  P('neck', sk, Bx(0.12, 0.1, 0.12), 0, 1.52, 0);
  P('head', sk, Bx(0.22, 0.25, 0.23), 0, 1.69, 0);
  P('head', sk, Bx(0.03, 0.05, 0.03), 0, 1.67, 0.125);
  [0.055, -0.055].forEach((x) => P('head', 0x15110f, Bx(0.04, 0.03, 0.02), x, 1.71, 0.116));
  [0.12, -0.12].forEach((x) => P('head', sk, Bx(0.03, 0.07, 0.05), x, 1.69, 0));
  M('uArm', o.sleeve, () => Bx(0.12, 0.35, 0.13), 0.26, 1.29, 0);
  M('fArm', o.sleeve, () => Bx(0.1, 0.33, 0.11), 0.26, 0.98, 0);
  M('hand', o.gloves, () => Bx(0.09, 0.1, 0.1), 0.26, 0.78, 0);
  M('thigh', o.pants, () => Bx(0.17 * f, 0.45, 0.18 * f), 0.11, 0.71, 0);
  M('shin', o.pants, () => Bx(0.14 * f, 0.43, 0.15 * f), 0.11, 0.31, 0);
  M('foot', o.boots, () => Bx(0.15, 0.1, 0.29), 0.11, 0.05, 0.05);

  o.extra(P, Bx, Cy, S, M);

  const W = (c: number, g: THREE.BufferGeometry, x: number, y: number, z: number) => P('weapon', c, g, x, y, z);
  const x0 = -0.1;
  let gr: [number, number, number];
  let gl: [number, number, number];

  if (o.wp === 'rifle') {
    const d = 0x1c1d20;
    const t = 0x8d7b55;
    W(d, Bx(0.05, 0.11, 0.19), x0, 1.38, 0.25);
    W(d, Bx(0.07, 0.11, 0.26), x0, 1.38, 0.45);
    W(t, Bx(0.065, 0.08, 0.25), x0, 1.37, 0.69);
    W(d, Cy(0.017, 0.22), x0, 1.38, 0.93);
    W(d, Cy(0.024, 0.05), x0, 1.38, 1.06);
    W(d, Bx(0.05, 0.18, 0.07), x0, 1.27, 0.47);
    W(d, Bx(0.045, 0.1, 0.05), x0, 1.29, 0.35);
    W(d, Bx(0.04, 0.04, 0.12), x0, 1.45, 0.45);
    W(0x444444, Bx(0.05, 0.05, 0.1), x0, 1.435, 0.55);
    gr = [x0, 1.28, 0.35];
    gl = [x0, 1.31, 0.5];
  } else {
    const d = 0x222226;
    W(d, Bx(0.06, 0.1, 0.3), x0, 1.37, 0.33);
    W(d, Cy(0.016, 0.14), x0, 1.38, 0.55);
    W(d, Cy(0.024, 0.06), x0, 1.38, 0.63);
    W(d, Bx(0.04, 0.22, 0.05), x0, 1.25, 0.36);
    W(d, Bx(0.045, 0.1, 0.05), x0, 1.29, 0.27);
    W(0x555555, Bx(0.03, 0.03, 0.08), x0, 1.435, 0.33);
    gr = [x0, 1.285, 0.27];
    gl = [x0, 1.3, 0.4];
  }

  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];

  parts.forEach(([bn, c, g]) => {
    const bi = BONE_DEFS.findIndex((b) => b[0] === bn);
    const cc = new THREE.Color(c);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(cc.r, cc.g, cc.b);
      si.push(bi, 0, 0, 0);
      sw.push(1, 0, 0, 0);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.15
  });

  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = (customName || o.name) + '_Mesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.name = customName || o.name;
  group.add(mesh);
  group.add(bones[0]); // add hips root bone
  group.updateMatrixWorld(true);

  mesh.bind(new THREE.Skeleton(bones));

  const wp = V(0, 1.3, 0);
  const grip = {
    L: V(...gl).sub(wp),
    R: V(...gr).sub(wp)
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
    name: customName || o.name,
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
