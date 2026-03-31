/**
 * AI system — processes non-player entity turns.
 *
 * Phase 4 will add seek, flee, patrol, detection, faction relations.
 * For now all AI entities idle (wait in place), consuming energy.
 */
import { query } from 'bitecs';
import { AI, Turn, PlayerTag } from '../components';

/** Standard action cost for idling */
const IDLE_COST = 100;

/**
 * Process all AI entities that have enough energy to act.
 * Each one idles (no movement, no visual events) and pays the energy cost.
 * Returns the number of entities that acted.
 */
export function processAITurns(world: object): number {
  const aiEntities = query(world, [AI, Turn]);
  const players = query(world, [PlayerTag]);
  let acted = 0;

  for (const eid of aiEntities) {
    if (players.includes(eid)) continue;
    if (Turn.energy[eid] >= IDLE_COST) {
      Turn.energy[eid] -= IDLE_COST;
      acted++;
    }
  }

  return acted;
}
