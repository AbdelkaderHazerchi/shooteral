import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import bloodVfx1Url from '../../assets/images/blood_vfx_1.png';
import bloodVfx2Url from '../../assets/images/blood_vfx_2.png';
import { BoxCollider, getSurfaceHeightAt, RampZone } from '../maps/MapBuilder';

interface ReceiverEntry {
  mesh: THREE.Mesh;
  worldBox: THREE.Box3;
}

interface FlyingBloodDroplet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  landed: boolean;
  baseScale: number;
}

const _worldY = new THREE.Vector3(0, 1, 0);
const _worldZ = new THREE.Vector3(0, 0, 1);

function createChromaKeyBloodTexture(url: string, maxAniso: number): THREE.Texture {
  const placeholder = document.createElement('canvas');
  placeholder.width = 4;
  placeholder.height = 4;
  const texture = new THREE.Texture(placeholder);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(img.width || 512, img.height || 512));
    const w = Math.max(64, Math.round((img.width || 512) * scale));
    const h = Math.max(64, Math.round((img.height || 512) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);
    // Inset slightly (3px) so ClampToEdgeWrapping never stretches edge blood pixels
    ctx.drawImage(img, 3, 3, w - 6, h - 6);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const srcA = data[i + 3];

      if (srcA < 6) {
        data[i + 3] = 0;
        continue;
      }

      // Key out light/white paper background cleanly while preserving dark arterial crimson & fine mist
      const maxGB = Math.max(g, b);
      const redness = r - maxGB;
      const whiteDist = Math.max(255 - g, 255 - b);

      const signal =
        Math.max(0, (whiteDist - 12) / 96) * 0.78 + Math.max(0, (redness - 8) / 72) * 0.62;
      const normAlpha = Math.min(1, Math.pow(Math.min(1, signal), 1.15));
      const finalAlpha = Math.round((srcA / 255) * normAlpha * 255);

      if (finalAlpha < 8) {
        data[i + 3] = 0;
      } else {
        // De-matte white fringe and enrich deep wet arterial crimson tone
        data[i] = Math.max(24, Math.min(205, Math.round(r * 0.72)));
        data[i + 1] = Math.round(g * 0.12);
        data[i + 2] = Math.round(b * 0.12);
        data[i + 3] = finalAlpha;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    texture.image = canvas;
    texture.anisotropy = Math.min(8, maxAniso);
    texture.needsUpdate = true;
  };
  img.src = url;
  return texture;
}

export class BloodVfxSystem {
  private readonly scene: THREE.Scene;
  private receivers: ReceiverEntry[] = [];
  private bloodDecals: THREE.Mesh[] = [];
  private droplets: FlyingBloodDroplet[] = [];

  private readonly bloodTextures: [THREE.Texture, THREE.Texture];
  private readonly bloodMaterials: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private readonly dropletGeo = new THREE.SphereGeometry(0.036, 5, 5);
  private readonly dropletMats: [
    THREE.MeshBasicMaterial,
    THREE.MeshBasicMaterial,
    THREE.MeshBasicMaterial
  ];

  private readonly raycaster = new THREE.Raycaster();
  private readonly _dummy = new THREE.Object3D();
  private readonly _lookTarget = new THREE.Vector3();
  private readonly _decalBox = new THREE.Box3();
  private readonly _decalSize = new THREE.Vector3();
  private readonly _normalMat = new THREE.Matrix3();
  private readonly _hitNormal = new THREE.Vector3();
  private readonly _projDir = new THREE.Vector3();
  private readonly _toOrigin = new THREE.Vector3();
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _rayDir = new THREE.Vector3();
  private readonly _tmpA = new THREE.Vector3();
  private readonly _tmpB = new THREE.Vector3();
  private readonly _triN = new THREE.Vector3();
  private readonly _sizeHalf = new THREE.Vector3();
  private readonly _hitExitDir = new THREE.Vector3();
  private readonly _deathOrigin = new THREE.Vector3();
  private readonly _deathExitDir = new THREE.Vector3();
  private readonly _groundOrigin = new THREE.Vector3();
  private readonly _sprayDir = new THREE.Vector3();

  constructor(scene: THREE.Scene, maxAnisotropy: number) {
    this.scene = scene;
    this.bloodTextures = [
      createChromaKeyBloodTexture(bloodVfx1Url, maxAnisotropy),
      createChromaKeyBloodTexture(bloodVfx2Url, maxAnisotropy)
    ];

    const makeDecalMat = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        opacity: 0.94,
        alphaTest: 0.03,
        roughness: 0.24,
        metalness: 0.04,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      });

    this.bloodMaterials = [
      makeDecalMat(this.bloodTextures[0]),
      makeDecalMat(this.bloodTextures[1])
    ];

    this.dropletMats = [
      new THREE.MeshBasicMaterial({ color: 0xb91c1c }),
      new THREE.MeshBasicMaterial({ color: 0x7f1d1d }),
      new THREE.MeshBasicMaterial({ color: 0x5c0909 })
    ];
  }

  /**
   * Indexes all solid static map meshes (walls, floors, crates, ramps, barrels, containers)
   * so blood decals can wrap & fold accurately across corners and surface intersections.
   */
  public registerMapGroup(mapGroup: THREE.Group | null) {
    this.receivers = [];
    if (!mapGroup) return;

    mapGroup.updateMatrixWorld(true);
    mapGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!mat || mat.transparent) return;
      // Skip deep water ocean planes below playable pier level
      if (mesh.geometry instanceof THREE.PlaneGeometry && mesh.position.y < -0.25) return;

      const worldBox = new THREE.Box3().setFromObject(mesh);
      if (worldBox.isEmpty()) return;
      worldBox.expandByScalar(0.12);
      this.receivers.push({ mesh, worldBox });
    });
  }

  /**
   * Non-lethal or lethal bullet impact blood spray + surface splatter behind target.
   */
  public spawnHitBlood(
    hitPos: THREE.Vector3,
    isHeadshot: boolean,
    shotDir: THREE.Vector3 | undefined,
    qualityScale: number
  ) {
    const count = Math.max(5, Math.round((isHeadshot ? 14 : 8) * qualityScale));
    const exitDir = this._hitExitDir.copy(shotDir || _worldZ);
    if (exitDir.lengthSq() < 0.0001) exitDir.set(0, 0.1, 1);
    else exitDir.normalize();

    for (let i = 0; i < count; i++) {
      this.spawnDroplet(
        hitPos,
        exitDir.x * (2.6 + Math.random() * 2.8) + (Math.random() - 0.5) * 3.2,
        exitDir.y * 1.4 + Math.random() * 2.4 + 0.5,
        exitDir.z * (2.6 + Math.random() * 2.8) + (Math.random() - 0.5) * 3.2,
        0.65 + Math.random() * 0.9,
        0.44 + Math.random() * 0.16,
        i % 3
      );
    }

    // Project directional arterial splatter along exit ray onto nearby wall/crate/floor
    this._sprayDir.set(exitDir.x, exitDir.y - 0.16, exitDir.z).normalize();
    this.raycastAndProjectDecal(
      hitPos,
      this._sprayDir,
      4.5,
      isHeadshot ? 1.55 : 1.15,
      1.15,
      1,
      qualityScale
    );
  }

  /**
   * Visceral blood eruption when a player or enemy dies:
   * - High-velocity ballistic blood droplets spraying outward
   * - Multi-surface folded decals (blood_vfx_1 & blood_vfx_2) wrapping across floors, walls, crates & corners
   */
  public spawnDeathBloodBurst(
    deathPos: THREE.Vector3,
    hitPos: THREE.Vector3 | undefined,
    shotDir: THREE.Vector3 | undefined,
    isHeadshot: boolean,
    qualityScale: number
  ) {
    const origin = this._deathOrigin.copy(hitPos || deathPos);
    if (!hitPos) origin.y += 1.08;

    const exitDir = this._deathExitDir.copy(shotDir || _worldZ);
    if (exitDir.lengthSq() < 0.0001) {
      const ang = Math.random() * Math.PI * 2;
      exitDir.set(Math.cos(ang), 0.1, Math.sin(ang));
    } else {
      exitDir.normalize();
    }

    // 1. Erupting 3D blood spray particles (arterial jet + 360° splash droplets)
    const burstCount = Math.max(12, Math.round((isHeadshot ? 26 : 20) * qualityScale));
    for (let i = 0; i < burstCount; i++) {
      const isDirectionalJet = i < burstCount * 0.55;
      let vx: number;
      let vy: number;
      let vz: number;
      if (isDirectionalJet) {
        const speed = 3.4 + Math.random() * 4.4;
        vx = exitDir.x * speed + (Math.random() - 0.5) * 2.8;
        vy = exitDir.y * 1.8 + 1.1 + Math.random() * 2.8;
        vz = exitDir.z * speed + (Math.random() - 0.5) * 2.8;
      } else {
        const ang = Math.random() * Math.PI * 2;
        const speed = 1.6 + Math.random() * 3.6;
        vx = Math.cos(ang) * speed;
        vy = 1.4 + Math.random() * 3.1;
        vz = Math.sin(ang) * speed;
      }

      this.spawnDroplet(
        origin,
        vx,
        vy,
        vz,
        0.75 + Math.random() * 1.15,
        0.5 + Math.random() * 0.25,
        i % 3
      );
    }

    // 2. Main Ground / Adjacent-Corner Blood Pool (blood_vfx_1.png) — folds up nearby crates/walls/steps!
    this._groundOrigin.set(
      origin.x + exitDir.x * 0.35,
      origin.y + 0.35,
      origin.z + exitDir.z * 0.35
    );
    this._sprayDir.set(-exitDir.x * 0.14, -1, -exitDir.z * 0.14).normalize();
    this.raycastAndProjectDecal(
      this._groundOrigin,
      this._sprayDir,
      4.5,
      isHeadshot ? 2.45 : 2.1,
      1.65,
      0,
      qualityScale,
      origin
    );

    // 3. Primary Arterial Wall / Crate Exit Spray (blood_vfx_2.png)
    this._sprayDir.set(exitDir.x, exitDir.y - 0.14, exitDir.z).normalize();
    this.raycastAndProjectDecal(
      origin,
      this._sprayDir,
      6.2,
      isHeadshot ? 2.5 : 2.05,
      1.5,
      1,
      qualityScale,
      origin
    );

    // 4. Side Corner / Floor Scatter Splashes (mixes blood_vfx_1 & 2 across nearby edges)
    const sideAngles = [0.68, -0.74];
    for (let s = 0; s < sideAngles.length; s++) {
      const ang = sideAngles[s];
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const sx = exitDir.x * cosA - exitDir.z * sinA;
      const sz = exitDir.x * sinA + exitDir.z * cosA;
      this._sprayDir.set(sx, -0.45 - Math.random() * 0.35, sz).normalize();
      this.raycastAndProjectDecal(
        origin,
        this._sprayDir,
        4.2,
        1.45 + Math.random() * 0.45,
        1.35,
        s === 0 ? 1 : 0,
        qualityScale,
        origin
      );
    }
  }

  private spawnDroplet(
    origin: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    scale: number,
    maxAge: number,
    matIndex: number
  ) {
    if (this.droplets.length >= 96) {
      const oldest = this.droplets.shift()!;
      this.scene.remove(oldest.mesh);
    }
    const mesh = new THREE.Mesh(this.dropletGeo, this.dropletMats[matIndex % 3]);
    mesh.position.copy(origin);
    mesh.scale.setScalar(scale);
    this.scene.add(mesh);
    this.droplets.push({
      mesh,
      vel: new THREE.Vector3(vx, vy, vz),
      age: 0,
      maxAge,
      landed: false,
      baseScale: scale
    });
  }

  private raycastAndProjectDecal(
    rayOrigin: THREE.Vector3,
    rayDir: THREE.Vector3,
    maxDist: number,
    sizeXY: number,
    depth: number,
    variant: 0 | 1,
    qualityScale: number,
    sprayOrigin?: THREE.Vector3
  ) {
    if (this.receivers.length === 0) return;

    this._rayOrigin.copy(rayOrigin);
    this._rayDir.copy(rayDir).normalize();
    this.raycaster.set(this._rayOrigin, this._rayDir);
    this.raycaster.near = 0.05;
    this.raycaster.far = maxDist;

    // Coarse AABB pre-filter against static receivers for instant raycasts
    const candidates: THREE.Mesh[] = [];
    for (let i = 0; i < this.receivers.length; i++) {
      const rec = this.receivers[i];
      if (this.raycaster.ray.intersectsBox(rec.worldBox)) {
        candidates.push(rec.mesh);
      }
    }
    if (candidates.length === 0) return;

    const hits = this.raycaster.intersectObjects(candidates, false);
    if (hits.length === 0) return;

    const hit = hits[0];
    if (!hit.face) return;

    this._normalMat.getNormalMatrix(hit.object.matrixWorld);
    this._hitNormal.copy(hit.face.normal).applyMatrix3(this._normalMat).normalize();

    const originRef = sprayOrigin || rayOrigin;
    this.projectWrappedDecal(
      hit.point,
      this._hitNormal,
      originRef,
      sizeXY,
      depth,
      variant,
      qualityScale
    );
  }

  /**
   * Projects a decal onto ALL nearby surfaces intersecting the decal volume,
   * clipping and folding cleanly across 90-degree corners, crate edges, stairs, and floor seams.
   */
  private projectWrappedDecal(
    hitPoint: THREE.Vector3,
    surfaceNormal: THREE.Vector3,
    sprayOrigin: THREE.Vector3,
    sizeXY: number,
    depth: number,
    variant: 0 | 1,
    qualityScale: number
  ) {
    const maxBudget = Math.max(22, Math.round(52 * qualityScale));

    // Blend surface normal with direction back to spray origin so adjacent corner faces
    // (e.g. wall + floor seam or crate top + side) both face the projector and fold smoothly!
    this._toOrigin.copy(sprayOrigin).sub(hitPoint);
    if (this._toOrigin.lengthSq() > 0.001) {
      this._toOrigin.normalize();
      this._projDir.copy(surfaceNormal).lerp(this._toOrigin, 0.34).normalize();
    } else {
      this._projDir.copy(surfaceNormal).normalize();
    }

    const up = Math.abs(this._projDir.y) > 0.92 ? _worldZ : _worldY;
    this._dummy.up.copy(up);
    this._dummy.position.copy(hitPoint);
    this._lookTarget.copy(hitPoint).add(this._projDir);
    this._dummy.lookAt(this._lookTarget);
    this._dummy.rotateZ(Math.random() * Math.PI * 2);
    this._dummy.updateMatrix();

    const aspectJitter = 0.88 + Math.random() * 0.24;
    this._decalSize.set(sizeXY, sizeXY * aspectJitter, depth);
    const halfReach = Math.max(sizeXY, depth) * 0.82;
    this._sizeHalf.set(halfReach, halfReach, halfReach);
    this._decalBox.set(
      this._tmpA.copy(hitPoint).sub(this._sizeHalf),
      this._tmpB.copy(hitPoint).add(this._sizeHalf)
    );

    const mat = this.bloodMaterials[variant];

    for (let i = 0; i < this.receivers.length; i++) {
      const rec = this.receivers[i];
      if (!this._decalBox.intersectsBox(rec.worldBox)) continue;

      const decalGeo = new DecalGeometry(rec.mesh, hitPoint, this._dummy.rotation, this._decalSize);
      const finalGeo = this.filterAndOffsetDecalGeometry(decalGeo, this._projDir);
      if (!finalGeo) continue;

      while (this.bloodDecals.length >= maxBudget) {
        const oldest = this.bloodDecals.shift()!;
        this.scene.remove(oldest);
        oldest.geometry.dispose();
      }

      const decalMesh = new THREE.Mesh(finalGeo, mat);
      decalMesh.renderOrder = 2;
      decalMesh.matrixAutoUpdate = false;
      decalMesh.updateMatrix();
      this.scene.add(decalMesh);
      this.bloodDecals.push(decalMesh);
    }
  }

  /**
   * Removes back-facing clipped triangles (prevents blood bleeding through thin walls onto the opposite side)
   * while keeping all front & corner-wrapped faces, and offsets vertices slightly along normals to stop Z-fighting.
   */
  private filterAndOffsetDecalGeometry(
    geo: THREE.BufferGeometry,
    frontDir: THREE.Vector3
  ): THREE.BufferGeometry | null {
    const posAttr = geo.getAttribute('position');
    const normAttr = geo.getAttribute('normal');
    const uvAttr = geo.getAttribute('uv');
    if (!posAttr || posAttr.count < 3) {
      geo.dispose();
      return null;
    }

    if (!normAttr || !uvAttr) {
      return geo;
    }

    const triCount = Math.floor(posAttr.count / 3);
    const keptPos: number[] = [];
    const keptNorm: number[] = [];
    const keptUv: number[] = [];
    let droppedAny = false;

    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;
      const i1 = i0 + 1;
      const i2 = i0 + 2;

      this._triN
        .set(
          normAttr.getX(i0) + normAttr.getX(i1) + normAttr.getX(i2),
          normAttr.getY(i0) + normAttr.getY(i1) + normAttr.getY(i2),
          normAttr.getZ(i0) + normAttr.getZ(i1) + normAttr.getZ(i2)
        )
        .normalize();

      if (this._triN.dot(frontDir) <= 0.04) {
        droppedAny = true;
        continue;
      }

      for (let k = 0; k < 3; k++) {
        const idx = i0 + k;
        const nx = normAttr.getX(idx);
        const ny = normAttr.getY(idx);
        const nz = normAttr.getZ(idx);
        keptPos.push(
          posAttr.getX(idx) + nx * 0.008,
          posAttr.getY(idx) + ny * 0.008,
          posAttr.getZ(idx) + nz * 0.008
        );
        keptNorm.push(nx, ny, nz);
        keptUv.push(uvAttr.getX(idx), uvAttr.getY(idx));
      }
    }

    if (keptPos.length === 0) {
      geo.dispose();
      return null;
    }

    if (!droppedAny) {
      // Nudge positions in-place without allocating a second BufferGeometry
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(
          i,
          posAttr.getX(i) + normAttr.getX(i) * 0.008,
          posAttr.getY(i) + normAttr.getY(i) * 0.008,
          posAttr.getZ(i) + normAttr.getZ(i) * 0.008
        );
      }
      posAttr.needsUpdate = true;
      return geo;
    }

    geo.dispose();
    const filtered = new THREE.BufferGeometry();
    filtered.setAttribute('position', new THREE.Float32BufferAttribute(keptPos, 3));
    filtered.setAttribute('normal', new THREE.Float32BufferAttribute(keptNorm, 3));
    filtered.setAttribute('uv', new THREE.Float32BufferAttribute(keptUv, 2));
    return filtered;
  }

  public update(dt: number, colliders: BoxCollider[], ramps: RampZone[]) {
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const bd = this.droplets[i];
      bd.age += dt;
      if (!bd.landed) {
        bd.vel.y -= 14.5 * dt;
        bd.mesh.position.addScaledVector(bd.vel, dt);
        const floorY = getSurfaceHeightAt(
          bd.mesh.position.x,
          bd.mesh.position.z,
          bd.mesh.position.y + 0.1,
          colliders,
          ramps,
          0.04
        );
        if (bd.mesh.position.y <= floorY + 0.025) {
          bd.mesh.position.y = floorY + 0.02;
          bd.vel.set(0, 0, 0);
          bd.landed = true;
          bd.mesh.scale.set(bd.baseScale * 1.45, bd.baseScale * 0.35, bd.baseScale * 1.45);
        }
      }
      if (bd.age >= bd.maxAge) {
        this.scene.remove(bd.mesh);
        this.droplets.splice(i, 1);
      }
    }
  }

  public clearRound() {
    for (const d of this.bloodDecals) {
      this.scene.remove(d);
      d.geometry.dispose();
    }
    this.bloodDecals = [];

    for (const bd of this.droplets) {
      this.scene.remove(bd.mesh);
    }
    this.droplets = [];
  }

  public dispose() {
    this.clearRound();
    this.receivers = [];
    this.dropletGeo.dispose();
    this.dropletMats.forEach((m) => m.dispose());
    this.bloodMaterials.forEach((m) => m.dispose());
    this.bloodTextures.forEach((t) => t.dispose());
  }
}
