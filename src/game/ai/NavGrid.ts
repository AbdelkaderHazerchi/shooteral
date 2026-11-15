import * as THREE from 'three';
import { BoxCollider, getSurfaceHeightAt, MapData, RampZone } from '../maps/MapBuilder';

export interface NavGridCell {
  id: number;
  ix: number;
  iz: number;
  x: number;
  y: number;
  z: number;
  wallClearance: number; // 0 = adjacent to wall/edge, higher = open corridor center
  neighbors: { id: number; cost: number }[];
}

export interface NavPathOptions {
  avoidZoneChecker?: (x: number, y: number, z: number) => boolean;
  avoidZonePenalty?: number;
  smooth?: boolean;
}

const CELL_SIZE = 0.75;
const BOT_GRID_RADIUS = 0.45;
const BOT_STEP_UP_MAX = 0.54;
const BOT_STEP_DOWN_MAX = 0.72;
const BOT_HEIGHT = 1.78;
const BOT_KNEE_CLEARANCE = 0.53;

/**
 * Checks if a bot capsule of radius `rad` can stand cleanly at `(x, groundY, z)`
 * without intersecting any wall, crate, door wing, barrel, or overhead low ceiling.
 */
export function isCapsulePositionWalkable(
  x: number,
  groundY: number,
  z: number,
  colliders: BoxCollider[],
  rad = BOT_GRID_RADIUS
): boolean {
  const minH = groundY + BOT_KNEE_CLEARANCE;
  const maxH = groundY + BOT_HEIGHT;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (
      x + rad > c.min.x &&
      x - rad < c.max.x &&
      z + rad > c.min.z &&
      z - rad < c.max.z &&
      minH < c.max.y &&
      maxH > c.min.y
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Verifies an entire continuous straight-line 2D walk segment `from -> to` is completely
 * free of walls, crates, door wings, pillars, and abrupt vertical cliff drops/ledges.
 */
export function isWalkSegmentClear(
  from: THREE.Vector3,
  to: THREE.Vector3,
  colliders: BoxCollider[],
  ramps: RampZone[],
  rad = 0.46
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const horizDist = Math.hypot(dx, dz);
  if (horizDist < 0.05) {
    return Math.abs(to.y - from.y) <= 0.9 && isCapsulePositionWalkable(to.x, to.y, to.z, colliders, rad);
  }

  const steps = Math.max(2, Math.ceil(horizDist / 0.34));
  let curY = from.y;

  // Check start validity slightly leniently if already close to a corner, enforce strictly along segment
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const px = from.x + dx * t;
    const pz = from.z + dz * t;
    const nextY = getSurfaceHeightAt(px, pz, curY + 0.45, colliders, ramps, 0.36);

    const dy = nextY - curY;
    if (dy > BOT_STEP_UP_MAX || dy < -BOT_STEP_DOWN_MAX) {
      return false;
    }
    if (!isCapsulePositionWalkable(px, nextY, pz, colliders, rad)) {
      return false;
    }
    curY = nextY;
  }

  return Math.abs(curY - to.y) <= 1.05;
}

/**
 * Precomputed 2.5D Multi-Layer Navigation Grid & Min-Heap A* Pathfinder.
 * Flood-fills directly from map spawns/sites/nodes using true collision + ramp geometry,
 * so bots NEVER trust blocked graph edges or walk blindly into walls, crates, or ledges.
 */
export class NavGrid {
  public readonly cells: NavGridCell[] = [];
  private readonly columnMap = new Map<number, number[]>();
  private readonly minIx: number;
  private readonly maxIx: number;
  private readonly minIz: number;
  private readonly maxIz: number;
  private readonly gridWidth: number;
  private readonly colliders: BoxCollider[];
  private readonly ramps: RampZone[];

  // Reusable typed arrays for allocation-free synchronous A* queries
  private readonly closedStamp: Int32Array;
  private readonly seenStamp: Int32Array;
  private readonly gScore: Float32Array;
  private readonly fScore: Float32Array;
  private readonly parentCell: Int32Array;
  private readonly heapNodes: Int32Array;
  private heapSize = 0;
  private queryStamp = 0;

  constructor(map: MapData) {
    this.colliders = map.colliders;
    this.ramps = map.ramps;

    // Derive playable XZ bounds from spawns, sites, navNodes, and ramps
    let minX = -37;
    let maxX = 37;
    let minZ = -51;
    let maxZ = 51;

    const expandBounds = (x: number, z: number, pad = 12) => {
      if (x - pad < minX) minX = x - pad;
      if (x + pad > maxX) maxX = x + pad;
      if (z - pad < minZ) minZ = z - pad;
      if (z + pad > maxZ) maxZ = z + pad;
    };

    for (const p of map.tSpawns) expandBounds(p.x, p.z);
    for (const p of map.ctSpawns) expandBounds(p.x, p.z);
    expandBounds(map.siteA.center.x, map.siteA.center.z);
    expandBounds(map.siteB.center.x, map.siteB.center.z);
    for (const n of Object.values(map.navNodes)) expandBounds(n.pos.x, n.pos.z);

    // Clamp to inner bounds of large outer perimeter walls so we don't flood into outer void
    this.minIx = Math.floor(Math.max(-44, minX) / CELL_SIZE);
    this.maxIx = Math.ceil(Math.min(44, maxX) / CELL_SIZE);
    this.minIz = Math.floor(Math.max(-56, minZ) / CELL_SIZE);
    this.maxIz = Math.ceil(Math.min(56, maxZ) / CELL_SIZE);
    this.gridWidth = this.maxIx - this.minIx + 1;

    this.buildFloodFill(map);

    const n = Math.max(1, this.cells.length);
    this.closedStamp = new Int32Array(n);
    this.seenStamp = new Int32Array(n);
    this.gScore = new Float32Array(n);
    this.fScore = new Float32Array(n);
    this.parentCell = new Int32Array(n);
    this.heapNodes = new Int32Array(n + 8);
  }

  private colKey(ix: number, iz: number): number {
    return (iz - this.minIz) * this.gridWidth + (ix - this.minIx);
  }

  private inBounds(ix: number, iz: number): boolean {
    return ix >= this.minIx && ix <= this.maxIx && iz >= this.minIz && iz <= this.maxIz;
  }

  private isOnAnyRamp(x: number, z: number): boolean {
    for (let i = 0; i < this.ramps.length; i++) {
      const r = this.ramps[i];
      if (x >= r.minX - 0.35 && x <= r.maxX + 0.35 && z >= r.minZ - 0.35 && z <= r.maxZ + 0.35) {
        return true;
      }
    }
    return false;
  }

  private getOrCreateCell(ix: number, iz: number, y: number): { id: number; created: boolean } {
    const key = this.colKey(ix, iz);
    let bucket = this.columnMap.get(key);
    if (bucket) {
      for (let i = 0; i < bucket.length; i++) {
        const cid = bucket[i];
        if (Math.abs(this.cells[cid].y - y) < 0.72) {
          return { id: cid, created: false };
        }
      }
    } else {
      bucket = [];
      this.columnMap.set(key, bucket);
    }

    const id = this.cells.length;
    this.cells.push({
      id,
      ix,
      iz,
      x: ix * CELL_SIZE,
      y,
      z: iz * CELL_SIZE,
      wallClearance: 3,
      neighbors: []
    });
    bucket.push(id);
    return { id, created: true };
  }

  private findColumnCellAtHeight(ix: number, iz: number, y: number, tol = 0.72): number {
    const bucket = this.columnMap.get(this.colKey(ix, iz));
    if (!bucket) return -1;
    let bestId = -1;
    let bestDy = tol;
    for (let i = 0; i < bucket.length; i++) {
      const cid = bucket[i];
      const dy = Math.abs(this.cells[cid].y - y);
      if (dy < bestDy) {
        bestDy = dy;
        bestId = cid;
      }
    }
    return bestId;
  }

  private isEdgeMidpointWalkable(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ): boolean {
    const samples = Math.abs(y2 - y1) > 0.18 ? 3 : 1;
    let prevY = y1;
    for (let s = 1; s <= samples; s++) {
      const t = s / (samples + 1);
      const sx = x1 + (x2 - x1) * t;
      const sz = z1 + (z2 - z1) * t;
      const sy = getSurfaceHeightAt(sx, sz, prevY + 0.45, this.colliders, this.ramps, 0.36);
      const dy = sy - prevY;
      if (dy > BOT_STEP_UP_MAX || dy < -BOT_STEP_DOWN_MAX) {
        return false;
      }
      if (!isCapsulePositionWalkable(sx, sy, sz, this.colliders, 0.43)) {
        return false;
      }
      prevY = sy;
    }
    const finalDy = y2 - prevY;
    return finalDy <= BOT_STEP_UP_MAX && finalDy >= -BOT_STEP_DOWN_MAX;
  }

  private buildFloodFill(map: MapData) {
    const seeds: THREE.Vector3[] = [
      ...map.tSpawns,
      ...map.ctSpawns,
      map.siteA.center,
      map.siteB.center,
      ...Object.values(map.navNodes).map((n) => n.pos)
    ];

    const queue: number[] = [];

    // Seed flood-fill from every known walkable spawn/site/node
    for (const seed of seeds) {
      const baseIx = Math.round(seed.x / CELL_SIZE);
      const baseIz = Math.round(seed.z / CELL_SIZE);

      let seeded = false;
      for (let r = 0; r <= 2 && !seeded; r++) {
        for (let dx = -r; dx <= r && !seeded; dx++) {
          for (let dz = -r; dz <= r && !seeded; dz++) {
            const ix = baseIx + dx;
            const iz = baseIz + dz;
            if (!this.inBounds(ix, iz)) continue;
            const wx = ix * CELL_SIZE;
            const wz = iz * CELL_SIZE;
            const groundY = getSurfaceHeightAt(wx, wz, seed.y + 0.35, this.colliders, this.ramps, 0.36);
            if (Math.abs(groundY - seed.y) > 0.9) continue;
            if (!isCapsulePositionWalkable(wx, groundY, wz, this.colliders, BOT_GRID_RADIUS)) continue;

            const res = this.getOrCreateCell(ix, iz, groundY);
            if (res.created) queue.push(res.id);
            seeded = true;
          }
        }
      }
    }

    // Phase 1: 4-connected BFS flood fill discovers every reachable floor/ramp/catwalk cell
    const dirs4: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    let head = 0;
    while (head < queue.length) {
      const cid = queue[head++];
      const c = this.cells[cid];

      for (let d = 0; d < 4; d++) {
        const nx = c.ix + dirs4[d][0];
        const nz = c.iz + dirs4[d][1];
        if (!this.inBounds(nx, nz)) continue;

        const wx = nx * CELL_SIZE;
        const wz = nz * CELL_SIZE;
        const nextY = getSurfaceHeightAt(wx, wz, c.y + 0.45, this.colliders, this.ramps, 0.36);
        const dy = nextY - c.y;

        if (dy > BOT_STEP_UP_MAX || dy < -BOT_STEP_DOWN_MAX) continue;
        if (!isCapsulePositionWalkable(wx, nextY, wz, this.colliders, BOT_GRID_RADIUS)) continue;
        if (!this.isEdgeMidpointWalkable(c.x, c.y, c.z, wx, nextY, wz)) continue;

        const res = this.getOrCreateCell(nx, nz, nextY);
        if (res.created) {
          queue.push(res.id);
        }
      }
    }

    // Phase 2: Build directed 8-neighbor graph (strict diagonal corner clearance)
    const dirs8: [number, number, number][] = [
      [1, 0, CELL_SIZE],
      [-1, 0, CELL_SIZE],
      [0, 1, CELL_SIZE],
      [0, -1, CELL_SIZE],
      [1, 1, CELL_SIZE * Math.SQRT2],
      [1, -1, CELL_SIZE * Math.SQRT2],
      [-1, 1, CELL_SIZE * Math.SQRT2],
      [-1, -1, CELL_SIZE * Math.SQRT2]
    ];

    for (let cid = 0; cid < this.cells.length; cid++) {
      const c = this.cells[cid];
      for (let d = 0; d < 8; d++) {
        const dx = dirs8[d][0];
        const dz = dirs8[d][1];
        const baseCost = dirs8[d][2];
        const nx = c.ix + dx;
        const nz = c.iz + dz;
        if (!this.inBounds(nx, nz)) continue;

        const wx = nx * CELL_SIZE;
        const wz = nz * CELL_SIZE;
        const expectedY = getSurfaceHeightAt(wx, wz, c.y + 0.45, this.colliders, this.ramps, 0.36);
        const targetId = this.findColumnCellAtHeight(nx, nz, expectedY, 0.72);
        if (targetId < 0 || targetId === cid) continue;

        const tCell = this.cells[targetId];
        const dy = tCell.y - c.y;
        if (dy > BOT_STEP_UP_MAX || dy < -BOT_STEP_DOWN_MAX) continue;
        if (!this.isEdgeMidpointWalkable(c.x, c.y, c.z, tCell.x, tCell.y, tCell.z)) continue;

        // Prevent corner clipping on diagonal steps: both adjacent orthogonal cells must exist at compatible height
        if (dx !== 0 && dz !== 0) {
          const adjX = this.findColumnCellAtHeight(c.ix + dx, c.iz, (c.y + tCell.y) * 0.5, 0.78);
          const adjZ = this.findColumnCellAtHeight(c.ix, c.iz + dz, (c.y + tCell.y) * 0.5, 0.78);
          if (adjX < 0 || adjZ < 0) continue;
        }

        // Prefer smooth ramps over blind ledge drops when possible
        let extraCost = 0;
        if (dy < -0.68 && !this.isOnAnyRamp(c.x, c.z) && !this.isOnAnyRamp(tCell.x, tCell.z)) {
          extraCost += 3.5;
        }

        c.neighbors.push({ id: targetId, cost: baseCost + extraCost });
      }
    }

    // Phase 3: Compute wall-clearance field via BFS from boundary/wall-adjacent cells
    // so A* naturally prefers open corridor centers over hugging wall corners.
    const clearQueue: number[] = [];
    for (let cid = 0; cid < this.cells.length; cid++) {
      const c = this.cells[cid];
      if (c.neighbors.length < 8) {
        c.wallClearance = 0;
        clearQueue.push(cid);
      } else {
        c.wallClearance = 99;
      }
    }

    let cHead = 0;
    while (cHead < clearQueue.length) {
      const cid = clearQueue[cHead++];
      const c = this.cells[cid];
      const nextDist = c.wallClearance + 1;
      if (nextDist > 3) continue;
      for (let i = 0; i < c.neighbors.length; i++) {
        const nCell = this.cells[c.neighbors[i].id];
        if (nCell.wallClearance > nextDist) {
          nCell.wallClearance = nextDist;
          clearQueue.push(nCell.id);
        }
      }
    }

    // Apply gentle wall-buffer cost to edges entering wall-hugging cells
    for (let cid = 0; cid < this.cells.length; cid++) {
      const c = this.cells[cid];
      for (let i = 0; i < c.neighbors.length; i++) {
        const edge = c.neighbors[i];
        const nCell = this.cells[edge.id];
        if (nCell.wallClearance === 0) edge.cost += 0.55;
        else if (nCell.wallClearance === 1) edge.cost += 0.18;
      }
    }
  }

  public findNearestCell(pos: THREE.Vector3, maxSearchRadiusCells = 7): NavGridCell | null {
    if (this.cells.length === 0) return null;
    const baseIx = THREE.MathUtils.clamp(Math.round(pos.x / CELL_SIZE), this.minIx, this.maxIx);
    const baseIz = THREE.MathUtils.clamp(Math.round(pos.z / CELL_SIZE), this.minIz, this.maxIz);

    let bestCell: NavGridCell | null = null;
    let bestScore = Infinity;

    for (let r = 0; r <= maxSearchRadiusCells; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const ix = baseIx + dx;
          const iz = baseIz + dz;
          if (!this.inBounds(ix, iz)) continue;

          const bucket = this.columnMap.get(this.colKey(ix, iz));
          if (!bucket) continue;

          for (let i = 0; i < bucket.length; i++) {
            const c = this.cells[bucket[i]];
            const distXZ = Math.hypot(c.x - pos.x, c.z - pos.z);
            const dy = Math.abs(c.y - pos.y);
            const heightPenalty = dy > 0.9 ? dy * 8.0 : dy * 1.4;
            const wallBias = c.wallClearance === 0 ? 0.35 : 0;
            const score = distXZ + heightPenalty + wallBias;
            if (score < bestScore) {
              bestScore = score;
              bestCell = c;
            }
          }
        }
      }
      const currentBest: NavGridCell | null = bestCell;
      if (currentBest && bestScore < (r + 1) * CELL_SIZE * 1.25 && Math.abs(currentBest.y - pos.y) < 1.0) {
        break;
      }
    }

    if (bestCell) return bestCell;

    // Fallback global scan in case target was far outside normal bounds
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const score = Math.hypot(c.x - pos.x, c.z - pos.z) + Math.abs(c.y - pos.y) * 5;
      if (score < bestScore) {
        bestScore = score;
        bestCell = c;
      }
    }
    return bestCell;
  }

  private heapPush(cellId: number) {
    let idx = this.heapSize++;
    this.heapNodes[idx] = cellId;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const pCell = this.heapNodes[parentIdx];
      if (this.fScore[cellId] < this.fScore[pCell]) {
        this.heapNodes[idx] = pCell;
        this.heapNodes[parentIdx] = cellId;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private heapPop(): number {
    const top = this.heapNodes[0];
    this.heapSize--;
    if (this.heapSize > 0) {
      const last = this.heapNodes[this.heapSize];
      this.heapNodes[0] = last;
      let idx = 0;
      while (true) {
        const left = (idx << 1) + 1;
        if (left >= this.heapSize) break;
        const right = left + 1;
        let smallest = left;
        if (right < this.heapSize && this.fScore[this.heapNodes[right]] < this.fScore[this.heapNodes[left]]) {
          smallest = right;
        }
        if (this.fScore[this.heapNodes[smallest]] < this.fScore[last]) {
          this.heapNodes[idx] = this.heapNodes[smallest];
          this.heapNodes[smallest] = last;
          idx = smallest;
        } else {
          break;
        }
      }
    }
    return top;
  }

  /**
   * Computes a collision-free, string-pulled 3D waypoint path from `startPos` to `goalPos`.
   * Guarantees zero wall-cutting shortcuts by verifying continuous capsule clearance along every segment.
   */
  public findPath(startPos: THREE.Vector3, goalPos: THREE.Vector3, options?: NavPathOptions): THREE.Vector3[] {
    if (this.cells.length === 0) return [];

    // Fast path: close direct unobstructed segment
    if (
      startPos.distanceTo(goalPos) < 12 &&
      isWalkSegmentClear(startPos, goalPos, this.colliders, this.ramps, 0.46)
    ) {
      return [goalPos.clone()];
    }

    const startCell = this.findNearestCell(startPos);
    const goalCell = this.findNearestCell(goalPos);
    if (!startCell || !goalCell) return [];

    if (startCell.id === goalCell.id) {
      const pt = new THREE.Vector3(goalCell.x, goalCell.y, goalCell.z);
      if (isWalkSegmentClear(startPos, goalPos, this.colliders, this.ramps, 0.45)) {
        return [goalPos.clone()];
      }
      return [pt];
    }

    const stamp = ++this.queryStamp;
    this.heapSize = 0;

    const startId = startCell.id;
    const goalId = goalCell.id;

    this.seenStamp[startId] = stamp;
    this.gScore[startId] = 0;
    this.fScore[startId] = Math.hypot(goalCell.x - startCell.x, goalCell.z - startCell.z);
    this.parentCell[startId] = -1;
    this.heapPush(startId);

    const avoidChecker = options?.avoidZoneChecker;
    const avoidPenalty = options?.avoidZonePenalty ?? 1.25;
    let found = false;

    while (this.heapSize > 0) {
      const curId = this.heapPop();
      if (this.closedStamp[curId] === stamp) continue;
      this.closedStamp[curId] = stamp;

      if (curId === goalId) {
        found = true;
        break;
      }

      const cur = this.cells[curId];
      const curG = this.gScore[curId];

      for (let i = 0; i < cur.neighbors.length; i++) {
        const edge = cur.neighbors[i];
        const nid = edge.id;
        if (this.closedStamp[nid] === stamp) continue;

        const nextCell = this.cells[nid];
        let stepCost = edge.cost;
        if (avoidChecker && nid !== goalId && avoidChecker(nextCell.x, nextCell.y, nextCell.z)) {
          stepCost += avoidPenalty;
        }

        const tentativeG = curG + stepCost;
        if (this.seenStamp[nid] !== stamp || tentativeG < this.gScore[nid]) {
          this.seenStamp[nid] = stamp;
          this.gScore[nid] = tentativeG;
          const h = Math.hypot(goalCell.x - nextCell.x, goalCell.z - nextCell.z) + Math.abs(goalCell.y - nextCell.y) * 0.6;
          this.fScore[nid] = tentativeG + h;
          this.parentCell[nid] = curId;
          this.heapPush(nid);
        }
      }
    }

    if (!found) return [];

    // Reconstruct raw grid centers
    const rawReversed: THREE.Vector3[] = [];
    let crawl = goalId;
    while (crawl !== -1) {
      const c = this.cells[crawl];
      rawReversed.push(new THREE.Vector3(c.x, c.y, c.z));
      crawl = this.parentCell[crawl];
    }
    rawReversed.reverse();

    // Smooth path via string-pulling with strict capsule-walkability checks
    if (options?.smooth === false) {
      return rawReversed;
    }

    const smoothed: THREE.Vector3[] = [];
    let anchor = startPos.clone();
    let idx = 0;

    while (idx < rawReversed.length) {
      // Binary/greedy lookahead: find farthest node `j` directly walkable from `anchor`
      let farthest = idx;
      const maxLook = Math.min(rawReversed.length - 1, idx + 28);
      for (let j = maxLook; j > idx; j--) {
        if (anchor.distanceTo(rawReversed[j]) > 16) continue;
        if (isWalkSegmentClear(anchor, rawReversed[j], this.colliders, this.ramps, 0.47)) {
          farthest = j;
          break;
        }
      }

      const chosen = rawReversed[farthest];
      if (chosen.distanceTo(startPos) > 0.35 || farthest === rawReversed.length - 1) {
        smoothed.push(chosen);
      }
      anchor = chosen;
      idx = farthest + 1;
    }

    if (smoothed.length === 0) {
      smoothed.push(rawReversed[rawReversed.length - 1]);
    }

    // Safely append exact world goalPos only if cleanly walkable from final waypoint
    const lastPt = smoothed[smoothed.length - 1];
    if (lastPt.distanceTo(goalPos) > 0.45 && isWalkSegmentClear(lastPt, goalPos, this.colliders, this.ramps, 0.45)) {
      smoothed.push(goalPos.clone());
    }

    return smoothed;
  }

  public isPointReachableFrom(fromPos: THREE.Vector3, targetPos: THREE.Vector3): boolean {
    const startCell = this.findNearestCell(fromPos, 3);
    const goalCell = this.findNearestCell(targetPos, 3);
    if (!startCell || !goalCell) return false;
    if (Math.hypot(goalCell.x - targetPos.x, goalCell.z - targetPos.z) > 2.2 || Math.abs(goalCell.y - targetPos.y) > 1.2) {
      return false;
    }
    return this.findPath(fromPos, targetPos, { smooth: false }).length > 0;
  }
}
