/**
 * Body System — per-turn processing for body parts on the floor.
 *
 * Handles detached part decay. Parts on the floor lose HP each turn
 * based on their detachedDecayRate. When HP reaches 0, the part is
 * marked Dead and a part_destroyed event is queued.
 */
import { query, hasComponent, addComponent } from 'bitecs';
import { Position, Health, PartIdentity, AttachedTo, Dead } from '../components';
import { getPartData } from '../body';
import type { VisualEventQueue } from '../../visual/EventQueue';

/**
 * Process detached parts on the floor: apply decay, destroy at 0 HP.
 */
export function processBodySystem(
  world: object,
  eventQueue: VisualEventQueue,
): void {
  // Query all part entities that are on the floor (have Position + PartIdentity, no AttachedTo)
  const partEntities = query(world, [Position, Health, PartIdentity]);

  for (const pEid of partEntities) {
    if (hasComponent(world, pEid, Dead)) continue;
    if (hasComponent(world, pEid, AttachedTo)) continue; // still attached, skip

    const partDef = getPartData(pEid);
    if (!partDef) continue;

    const decay = partDef.detachedDecayRate;
    if (decay <= 0) continue; // stable parts don't decay

    Health.hp[pEid] = Math.max(0, Health.hp[pEid] - decay);

    if (Health.hp[pEid] <= 0) {
      addComponent(world, pEid, Dead);
      eventQueue.push({
        type: 'part_destroyed',
        entityId: pEid,
        data: {
          partName: partDef.name,
          x: Position.x[pEid],
          y: Position.y[pEid],
        },
      });
    }
  }
}
