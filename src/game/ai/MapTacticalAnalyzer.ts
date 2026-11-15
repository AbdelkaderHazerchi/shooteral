import * as THREE from 'three';
import { BoxCollider, getSurfaceHeightAt, MapData, NavNode, RampZone } from '../maps/MapBuilder';

export type TacticalZone = 'site_a' | 'mid' | 'site_b';
export type ExtendedZone = TacticalZone | 't_side' | 'ct_side';

export interface SniperPerch {
  nodeId: string;
  pos: THREE.Vector3;
  watchPos: THREE.Vector3;
  watchZone: TacticalZone;
  teamBias: 'swat' | 'gang' | 'both';
  sightLength: number;
  coverScore: number;
  coverAngle: number;
}

export interface TacticalMapProfile {
  mapId: string;
  siteANodeId: string;
  siteBNodeId: string;
  tSpawnNodeId: string;
  ctSpawnNodeId: string;
  siteACenter: THREE.Vector3;
  siteBCenter: THREE.Vector3;
  tSpawnCenter: THREE.Vector3;
  ctSpawnCenter: THREE.Vector3;
  nodeZones: Record<string, ExtendedZone>;
  midNodes: string[];
  chokeNodesA: string[];
  chokeNodesB: string[];
  chokeNodesMid: string[];
  flankNodesA: string[];
  flankNodesB: string[];
  postPlantNodesA: string[];
  postPlantNodesB: string[];
  sniperPerches: SniperPerch[];
  classifyPositionZone: (pos: THREE.Vector3) => TacticalZone;
  findNearestNodeId: (pos: THREE.Vector3) => string;
  pickSniperPerch: (
    team: 'gang' | 'swat',
    preferredZone: TacticalZone,
    excludeNodeIds?: Set<string>
  ) => SniperPerch | null;
  findNearestCoverPos: (
    botPos: THREE.Vector3,
    threatPos: THREE.Vector3,
    colliders: BoxCollider[],
    ramps: RampZone[],
    maxSearchRadius?: number
  ) => THREE.Vector3 | null;
}

const _ray = new THREE.Ray();
const _box = new THREE.Box3();
const _hit = new THREE.Vector3();
const _fromHead = new THREE.Vector3();
const _toHead = new THREE.Vector3();
const _diff = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function hasClearStaticLoS(
  from: THREE.Vector3,
  to: THREE.Vector3,
  colliders: BoxCollider[],
  eyeHeight = 1.48
): boolean {
  _fromHead.set(from.x, from.y + eyeHeight, from.z);
  _toHead.set(to.x, to.y + eyeHeight, to.z);
  _diff.copy(_toHead).sub(_fromHead);
  const dist = _diff.length();
  if (dist < 0.1) return true;
  _dir.copy(_diff).divideScalar(dist);

  const minX = Math.min(_fromHead.x, _toHead.x);
  const maxX = Math.max(_fromHead.x, _toHead.x);
  const minY = Math.min(_fromHead.y, _toHead.y);
  const maxY = Math.max(_fromHead.y, _toHead.y);
  const minZ = Math.min(_fromHead.z, _toHead.z);
  const maxZ = Math.max(_fromHead.z, _toHead.z);

  _ray.set(_fromHead, _dir);

  for (const c of colliders) {
    if (
      c.max.x < minX ||
      c.min.x > maxX ||
      c.max.z < minZ ||
      c.min.z > maxZ ||
      c.max.y < minY ||
      c.min.y > maxY
    ) {
      continue;
    }
    _box.set(c.min, c.max);
    const hit = _ray.intersectBox(_box, _hit);
    if (hit && hit.distanceTo(_fromHead) < dist - 0.35) {
      return false;
    }
  }
  return true;
}

function findClosestNodeIdToPoint(nodes: NavNode[], pt: THREE.Vector3, fallbackId: string): string {
  let bestId = fallbackId;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = n.pos.distanceTo(pt);
    if (d < bestDist) {
      bestDist = d;
      bestId = n.id;
    }
  }
  return bestId;
}

function countNearbyCover(pos: THREE.Vector3, colliders: BoxCollider[]): number {
  let count = 0;
  for (const c of colliders) {
    if (c.max.y < pos.y + 0.9 || c.min.y > pos.y + 1.8) continue;
    const dx = Math.max(c.min.x - pos.x, 0, pos.x - c.max.x);
    const dz = Math.max(c.min.z - pos.z, 0, pos.z - c.max.z);
    const dist = Math.hypot(dx, dz);
    if (dist > 0.3 && dist < 3.2) {
      count++;
    }
  }
  return count;
}

function isPointWalkable(
  x: number,
  y: number,
  z: number,
  colliders: BoxCollider[],
  ramps: RampZone[]
): { ok: boolean; groundY: number } {
  const groundY = getSurfaceHeightAt(x, z, y + 0.3, colliders, ramps, 0.38);
  if (Math.abs(groundY - y) > 1.2) {
    return { ok: false, groundY };
  }
  const rad = 0.44;
  for (const c of colliders) {
    if (
      x + rad > c.min.x &&
      x - rad < c.max.x &&
      z + rad > c.min.z &&
      z - rad < c.max.z &&
      groundY + 0.55 < c.max.y &&
      groundY + 1.75 > c.min.y
    ) {
      return { ok: false, groundY };
    }
  }
  return { ok: true, groundY };
}

/**
 * Analyzes ANY MapData purely geometrically and topologically so AI works seamlessly
 * on Sand Bastion, Apex Foundry, Obsidian Port, and any future maps added later.
 */
export function analyzeMapTactics(map: MapData): TacticalMapProfile {
  const nodes = Object.values(map.navNodes);
  const firstId = nodes[0]?.id || 'site_a';

  const tSpawnCenter = map.tSpawns[0] ? map.tSpawns[0].clone() : new THREE.Vector3(0, 0, 40);
  const ctSpawnCenter = map.ctSpawns[0] ? map.ctSpawns[0].clone() : new THREE.Vector3(0, 0, -40);
  const siteACenter = map.siteA.center.clone();
  const siteBCenter = map.siteB.center.clone();

  const siteANodeId =
    nodes.find((n) => n.isSiteA)?.id ?? findClosestNodeIdToPoint(nodes, siteACenter, firstId);
  const siteBNodeId =
    nodes.find((n) => n.isSiteB)?.id ?? findClosestNodeIdToPoint(nodes, siteBCenter, firstId);
  const tSpawnNodeId =
    nodes.find((n) => n.isTSpawn)?.id ?? findClosestNodeIdToPoint(nodes, tSpawnCenter, firstId);
  const ctSpawnNodeId =
    nodes.find((n) => n.isCTSpawn)?.id ?? findClosestNodeIdToPoint(nodes, ctSpawnCenter, firstId);

  const nodeZones: Record<string, ExtendedZone> = {};
  const midNodes: string[] = [];
  const chokeNodesA: string[] = [];
  const chokeNodesB: string[] = [];
  const chokeNodesMid: string[] = [];
  const flankNodesA: string[] = [];
  const flankNodesB: string[] = [];
  const postPlantNodesA: string[] = [];
  const postPlantNodesB: string[] = [];

  // Map-agnostic lateral axis from Site B -> Site A
  const abAxis = new THREE.Vector3().subVectors(siteACenter, siteBCenter);
  abAxis.y = 0;
  const abLen = Math.max(1, abAxis.length());
  abAxis.divideScalar(abLen);
  const midCenter = new THREE.Vector3().addVectors(siteACenter, siteBCenter).multiplyScalar(0.5);

  const classifyPositionZone = (pos: THREE.Vector3): TacticalZone => {
    const dA = pos.distanceTo(siteACenter);
    const dB = pos.distanceTo(siteBCenter);
    // Lateral projection along Site B -> Site A axis (-1 = B side, 0 = Mid, +1 = A side)
    const rel = new THREE.Vector3(pos.x - midCenter.x, 0, pos.z - midCenter.z);
    const proj = rel.dot(abAxis) / (abLen * 0.5);
    if (dA < 18 || proj > 0.38) return 'site_a';
    if (dB < 18 || proj < -0.38) return 'site_b';
    return 'mid';
  };

  for (const n of nodes) {
    if (n.isTSpawn || n.id === tSpawnNodeId) {
      nodeZones[n.id] = 't_side';
    } else if (n.isCTSpawn || n.id === ctSpawnNodeId) {
      nodeZones[n.id] = 'ct_side';
    } else {
      const z = classifyPositionZone(n.pos);
      nodeZones[n.id] = z;
      if (z === 'mid' && !n.isSiteA && !n.isSiteB) {
        midNodes.push(n.id);
      }
    }

    const dToA = n.pos.distanceTo(siteACenter);
    const dToB = n.pos.distanceTo(siteBCenter);

    if (n.isChokepoint) {
      const z = classifyPositionZone(n.pos);
      if (z === 'site_a') chokeNodesA.push(n.id);
      else if (z === 'site_b') chokeNodesB.push(n.id);
      else chokeNodesMid.push(n.id);
    }

    // Approach / flank nodes (12m..34m from site, not inside spawn)
    if (!n.isTSpawn && !n.isCTSpawn) {
      if (dToA >= 11 && dToA <= 34 && dToA < dToB) {
        flankNodesA.push(n.id);
      }
      if (dToB >= 11 && dToB <= 34 && dToB < dToA) {
        flankNodesB.push(n.id);
      }
    }

    // Post-plant cover nodes near Site A / Site B
    const coverCount = countNearbyCover(n.pos, map.colliders);
    if ((n.isPostPlant || coverCount >= 1) && !n.isTSpawn && !n.isCTSpawn) {
      if (dToA <= 22 && n.id !== siteANodeId) {
        postPlantNodesA.push(n.id);
      }
      if (dToB <= 22 && n.id !== siteBNodeId) {
        postPlantNodesB.push(n.id);
      }
    }
  }

  // Fallback guarantees so lists are never empty on minimal maps
  if (midNodes.length === 0) {
    midNodes.push(findClosestNodeIdToPoint(nodes, midCenter, ctSpawnNodeId));
  }
  if (postPlantNodesA.length === 0) postPlantNodesA.push(siteANodeId);
  if (postPlantNodesB.length === 0) postPlantNodesB.push(siteBNodeId);
  if (flankNodesA.length === 0) flankNodesA.push(...midNodes);
  if (flankNodesB.length === 0) flankNodesB.push(...midNodes);

  // Automatic Sniper Perch Discovery across ALL navNodes
  const sniperPerches: SniperPerch[] = [];
  const watchTargets: { pos: THREE.Vector3; zone: TacticalZone }[] = [
    { pos: siteACenter, zone: 'site_a' },
    { pos: siteBCenter, zone: 'site_b' },
    ...midNodes.slice(0, 4).map((id) => ({ pos: map.navNodes[id].pos, zone: 'mid' as TacticalZone })),
    ...chokeNodesA.slice(0, 2).map((id) => ({ pos: map.navNodes[id].pos, zone: 'site_a' as TacticalZone })),
    ...chokeNodesB.slice(0, 2).map((id) => ({ pos: map.navNodes[id].pos, zone: 'site_b' as TacticalZone }))
  ];

  for (const n of nodes) {
    const dToCT = n.pos.distanceTo(ctSpawnCenter);
    const dToT = n.pos.distanceTo(tSpawnCenter);
    const elevationBonus = n.pos.y > 0.6 ? 5 : 0;

    let bestSightLen = 0;
    let bestWatchPos: THREE.Vector3 | null = null;
    let bestWatchZone: TacticalZone = classifyPositionZone(n.pos);

    for (const wt of watchTargets) {
      const dist = n.pos.distanceTo(wt.pos);
      if (dist < 14) continue;
      if (hasClearStaticLoS(n.pos, wt.pos, map.colliders)) {
        const scoreDist = dist + elevationBonus;
        if (scoreDist > bestSightLen) {
          bestSightLen = scoreDist;
          bestWatchPos = wt.pos.clone();
          bestWatchZone = wt.zone;
        }
      }
    }

    // Also include explicit map sniper spots even if angled slightly around a corner
    if (n.isSniperSpot || bestSightLen >= 18) {
      const watchPos =
        bestWatchPos ||
        (classifyPositionZone(n.pos) === 'site_a'
          ? siteACenter.clone()
          : classifyPositionZone(n.pos) === 'site_b'
            ? siteBCenter.clone()
            : midCenter.clone());

      const coverScore = countNearbyCover(n.pos, map.colliders) + (n.pos.y > 0.6 ? 1.5 : 0);
      const teamBias: 'swat' | 'gang' | 'both' =
        dToCT + 6 < dToT ? 'swat' : dToT + 6 < dToCT ? 'gang' : 'both';

      const dirToWatch = new THREE.Vector3().subVectors(watchPos, n.pos);
      const computedAngle =
        n.coverAngle !== undefined ? n.coverAngle : Math.atan2(dirToWatch.x, dirToWatch.z);

      sniperPerches.push({
        nodeId: n.id,
        pos: n.pos.clone(),
        watchPos,
        watchZone: bestWatchZone,
        teamBias,
        sightLength: Math.max(18, bestSightLen),
        coverScore,
        coverAngle: computedAngle
      });
    }
  }

  // Sort sniper perches by tactical quality (sightLength + cover)
  sniperPerches.sort((a, b) => b.sightLength + b.coverScore * 4 - (a.sightLength + a.coverScore * 4));

  const findNearestNodeId = (pos: THREE.Vector3): string =>
    findClosestNodeIdToPoint(nodes, pos, firstId);

  const pickSniperPerch = (
    team: 'gang' | 'swat',
    preferredZone: TacticalZone,
    excludeNodeIds?: Set<string>
  ): SniperPerch | null => {
    const candidates = sniperPerches.filter((p) => !excludeNodeIds?.has(p.nodeId));
    const pool = candidates.length > 0 ? candidates : sniperPerches;
    if (pool.length === 0) return null;

    let best: SniperPerch | null = null;
    let bestScore = -Infinity;
    for (const p of pool) {
      let score = p.sightLength + p.coverScore * 4;
      if (p.teamBias === team) score += 16;
      else if (p.teamBias === 'both') score += 7;
      else score -= 12;

      if (p.watchZone === preferredZone) score += 14;
      else if (p.watchZone === 'mid') score += 5;

      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  };

  const findNearestCoverPos = (
    botPos: THREE.Vector3,
    threatPos: THREE.Vector3,
    colliders: BoxCollider[],
    ramps: RampZone[],
    maxSearchRadius = 10.5
  ): THREE.Vector3 | null => {
    let bestCover: THREE.Vector3 | null = null;
    let bestScore = Infinity;

    for (const c of colliders) {
      const width = c.max.x - c.min.x;
      const depth = c.max.z - c.min.z;
      const height = c.max.y - c.min.y;
      // Ignore tiny props or giant outer perimeter walls
      if (height < 0.95 || c.min.y > botPos.y + 0.9 || c.max.y < botPos.y + 1.05) continue;
      if (width * depth > 280) continue;

      const cx = (c.min.x + c.max.x) * 0.5;
      const cz = (c.min.z + c.max.z) * 0.5;
      const approxDist = Math.hypot(cx - botPos.x, cz - botPos.z);
      if (approxDist > maxSearchRadius + Math.max(width, depth) * 0.5) continue;

      const offset = 0.88;
      const faceCandidates = [
        new THREE.Vector3(c.min.x - offset, botPos.y, THREE.MathUtils.clamp(botPos.z, c.min.z, c.max.z)),
        new THREE.Vector3(c.max.x + offset, botPos.y, THREE.MathUtils.clamp(botPos.z, c.min.z, c.max.z)),
        new THREE.Vector3(THREE.MathUtils.clamp(botPos.x, c.min.x, c.max.x), botPos.y, c.min.z - offset),
        new THREE.Vector3(THREE.MathUtils.clamp(botPos.x, c.min.x, c.max.x), botPos.y, c.max.z + offset)
      ];

      for (const cand of faceCandidates) {
        const dBot = cand.distanceTo(botPos);
        if (dBot < 0.6 || dBot > maxSearchRadius) continue;

        const walk = isPointWalkable(cand.x, botPos.y, cand.z, colliders, ramps);
        if (!walk.ok) continue;
        cand.y = walk.groundY;

        // Verify candidate actually blocks Line-of-Sight from threatPos at crouch/upper-body height!
        if (!hasClearStaticLoS(threatPos, cand, colliders, 1.1)) {
          // Prefer close cover that doesn't move directly toward the threat
          const dThreatCand = cand.distanceTo(threatPos);
          const dThreatBot = botPos.distanceTo(threatPos);
          const retreatBonus = dThreatCand > dThreatBot ? -1.4 : 0.8;
          const score = dBot + retreatBonus;
          if (score < bestScore) {
            bestScore = score;
            bestCover = cand;
          }
        }
      }
    }

    return bestCover;
  };

  return {
    mapId: map.id,
    siteANodeId,
    siteBNodeId,
    tSpawnNodeId,
    ctSpawnNodeId,
    siteACenter,
    siteBCenter,
    tSpawnCenter,
    ctSpawnCenter,
    nodeZones,
    midNodes,
    chokeNodesA,
    chokeNodesB,
    chokeNodesMid,
    flankNodesA,
    flankNodesB,
    postPlantNodesA,
    postPlantNodesB,
    sniperPerches,
    classifyPositionZone,
    findNearestNodeId,
    pickSniperPerch,
    findNearestCoverPos
  };
}
