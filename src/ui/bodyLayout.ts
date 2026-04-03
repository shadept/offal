/**
 * Body layout algorithm — positions body-part slots on a curved diagram
 * based on the species' locomotion baseline.
 *
 * 5 templates: upright (biped), horizontal (quadruped), chain (serpentine),
 * radial (hover), blob (amorphous).
 *
 * Parts of the same role are evenly distributed within their role's region.
 */
import type { PartRole } from '../types';
import type { SlotInfo } from './bodyStore';

export interface SlotPosition {
  x: number;
  y: number;
}

/** Diagram viewport dimensions (px). */
const W = 300;
const H = 380;

/** Slot icon size — used to calculate minimum spacing. */
const SLOT = 48;

/** Distribute N items evenly on a horizontal line segment. */
function spreadH(
  y: number, cx: number, spacing: number, count: number,
): { x: number; y: number }[] {
  if (count === 0) return [];
  const totalW = (count - 1) * spacing;
  const startX = cx - totalW / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * spacing,
    y,
  }));
}

/** Distribute N items evenly on a vertical line segment. */
function spreadV(
  x: number, cy: number, spacing: number, count: number,
): { x: number; y: number }[] {
  if (count === 0) return [];
  const totalH = (count - 1) * spacing;
  const startY = cy - totalH / 2;
  return Array.from({ length: count }, (_, i) => ({
    x,
    y: startY + i * spacing,
  }));
}

/** Distribute N items evenly along an arc on an ellipse. */
function distributeOnArc(
  cx: number, cy: number, rx: number, ry: number,
  startAngle: number, endAngle: number,
  count: number,
): { x: number; y: number }[] {
  if (count === 0) return [];
  if (count === 1) {
    const mid = (startAngle + endAngle) / 2;
    return [{ x: cx + Math.cos(mid) * rx, y: cy + Math.sin(mid) * ry }];
  }
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const angle = startAngle + (endAngle - startAngle) * t;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

/** Group slots by role. */
function groupByRole(slots: SlotInfo[]): Map<PartRole, SlotInfo[]> {
  const groups = new Map<PartRole, SlotInfo[]>();
  for (const s of slots) {
    const list = groups.get(s.role) ?? [];
    list.push(s);
    groups.set(s.role, list);
  }
  return groups;
}

function assignPositions(
  groups: Map<PartRole, SlotInfo[]>,
  positionFn: (role: PartRole, count: number) => { x: number; y: number }[],
): Map<string, SlotPosition> {
  const result = new Map<string, SlotPosition>();
  for (const [role, slots] of groups) {
    const positions = positionFn(role, slots.length);
    for (let i = 0; i < slots.length; i++) {
      result.set(slots[i].slotId, positions[i] ?? { x: W / 2, y: H / 2 });
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// Template: Upright (biped)
//
//     [sensor]  [head]  [sensor]        row 0: y = 30
//
//     [arm] [arm]  T  [arm] [arm]       row 1: y = 100  (arms flanking torso)
//
//          [organ] [organ] [organ]       row 2: y = 170  (organs center)
//
//     [leg]  [leg]  [leg]  [leg]         row 3: y = 250  (legs spread)
//
// ═══════════════════════════════════════════════════════════

function layoutUpright(slots: SlotInfo[]): Map<string, SlotPosition> {
  const cx = W / 2;
  const groups = groupByRole(slots);

  return assignPositions(groups, (role, count) => {
    switch (role) {
      case 'head':
        return spreadH(45, cx, SLOT + 4, count);
      case 'sensor':
        return spreadH(35, cx + 40, SLOT, count);
      case 'torso':
        return [{ x: cx, y: 130 }];
      case 'arm': {
        // Split evenly left/right of the torso
        const leftCount = Math.ceil(count / 2);
        const rightCount = count - leftCount;
        const leftPos = spreadV(cx - 60, 130, SLOT + 2, leftCount);
        const rightPos = spreadV(cx + 60, 130, SLOT + 2, rightCount);
        return [...leftPos, ...rightPos];
      }
      case 'organ':
        return spreadH(225, cx, SLOT + 2, count);
      case 'leg':
        return spreadH(315, cx, SLOT + 6, count);
      case 'mouth':
        return spreadH(75, cx, SLOT, count);
      default:
        return spreadH(175, cx, SLOT + 2, count);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Template: Horizontal (quadruped)
//
//   [head]                               left side
//   [sensor]
//       [front legs]  [torso]  [back legs]
//                    [organs]
//
// ═══════════════════════════════════════════════════════════

function layoutHorizontal(slots: SlotInfo[]): Map<string, SlotPosition> {
  const cx = W / 2;
  const cy = H * 0.38;
  const groups = groupByRole(slots);

  return assignPositions(groups, (role, count) => {
    switch (role) {
      case 'head':
        return spreadH(cy - 20, 40, SLOT, count);
      case 'sensor':
        return spreadH(cy - 50, 45, SLOT, count);
      case 'torso':
        return [{ x: cx, y: cy }];
      case 'leg': {
        const half = Math.ceil(count / 2);
        const front = spreadH(cy + 55, 55, SLOT, half);
        const back = spreadH(cy + 55, W - 55, SLOT, count - half);
        return [...front, ...back];
      }
      case 'organ':
        return spreadH(cy + 25, cx, SLOT + 4, count);
      default:
        return spreadH(cy, cx, SLOT, count);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Template: Chain (serpentine)
// ═══════════════════════════════════════════════════════════

function layoutChain(slots: SlotInfo[]): Map<string, SlotPosition> {
  const cy = H * 0.35;
  const groups = groupByRole(slots);

  return assignPositions(groups, (role, count) => {
    switch (role) {
      case 'mouth':
        return [{ x: 30, y: cy }];
      case 'head':
        return [{ x: 40, y: cy - 30 }];
      case 'sensor':
        return spreadH(cy - 45, 35, SLOT, count);
      case 'segment':
        return spreadH(cy, W / 2 + 20, SLOT + 8, count);
      case 'organ':
        return spreadH(cy + 45, W / 2, SLOT + 4, count);
      case 'torso':
        return [{ x: W / 2, y: cy }];
      default:
        return spreadH(cy + 20, W / 2, SLOT, count);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Template: Radial (hover)
// ═══════════════════════════════════════════════════════════

function layoutRadial(slots: SlotInfo[]): Map<string, SlotPosition> {
  const cx = W / 2;
  const cy = H * 0.4;
  const r = 80;
  const groups = groupByRole(slots);

  return assignPositions(groups, (role, count) => {
    switch (role) {
      case 'torso':
        return [{ x: cx, y: cy }];
      case 'rotor':
        return distributeOnArc(cx, cy, r, r, 0, Math.PI * 2 * (1 - 1 / Math.max(count, 3)), count);
      case 'sensor':
        return distributeOnArc(cx, cy, r * 0.55, r * 0.55, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4, count);
      case 'organ':
        return distributeOnArc(cx, cy, 35, 35, Math.PI * 0.2, Math.PI * 0.8, count);
      default:
        return distributeOnArc(cx, cy, r * 0.7, r * 0.7, 0, Math.PI * 1.5, count);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Template: Blob (amorphous)
// ═══════════════════════════════════════════════════════════

function layoutBlob(slots: SlotInfo[]): Map<string, SlotPosition> {
  const cx = W / 2;
  const cy = H * 0.4;
  const r = 75;
  const groups = groupByRole(slots);

  let angleOffset = 0;
  return assignPositions(groups, (role, count) => {
    if (role === 'torso') return [{ x: cx, y: cy }];
    const nonTorsoGroups = groups.size - (groups.has('torso') ? 1 : 0);
    const span = (Math.PI * 2) / Math.max(nonTorsoGroups, 1);
    const start = angleOffset;
    angleOffset += span;
    const outerR = role === 'organ' ? r * 0.5 : r;
    return distributeOnArc(cx, cy, outerR, outerR, start, start + span * 0.7, count);
  });
}

/** Layout template selector. */
const TEMPLATES: Record<string, (slots: SlotInfo[]) => Map<string, SlotPosition>> = {
  biped: layoutUpright,
  quadruped: layoutHorizontal,
  serpentine: layoutChain,
  hover: layoutRadial,
  amorphous: layoutBlob,
};

/**
 * Compute slot positions within the body diagram viewport.
 * Returns a map of slotId → {x, y} in pixel coordinates.
 */
export function computeSlotPositions(
  locomotionBaseline: string,
  slots: SlotInfo[],
): Map<string, SlotPosition> {
  const fn = TEMPLATES[locomotionBaseline] ?? layoutUpright;
  return fn(slots);
}

/** Diagram viewport dimensions (exported for the component). */
export const DIAGRAM_W = W;
export const DIAGRAM_H = H;
