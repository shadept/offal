/**
 * Turn state machine and time-energy scheduler.
 *
 * State flow:
 *   PLAYER_INPUT → PROCESSING → ANIMATION → ENEMY_TURN → ENEMY_ANIMATION → PLAYER_INPUT
 *
 * Time-energy model: each entity accumulates energy based on speed.
 * When an entity has enough energy to act (>= threshold), it gets a turn.
 * Action cost is deducted from energy after acting.
 */
import { query } from 'bitecs';
import { Turn, PlayerTag } from '../components';
import { TurnPhase } from '../../types';

/** Energy threshold to take an action */
const ACTION_THRESHOLD = 100;

/** The energy tick amount (all entities gain speed * this per tick) */
const ENERGY_TICK = 1;

export class TurnSystem {
  phase: TurnPhase = TurnPhase.PLAYER_INPUT;
  turnCount = 0;

  /** Pending player action direction (set by input handler) */
  pendingAction: { dx: number; dy: number } | null = null;

  /**
   * Tick energy for all entities with Turn component.
   * Called repeatedly until at least one entity can act.
   */
  tickEnergy(world: object): void {
    const entities = query(world, [Turn]);
    for (const eid of entities) {
      Turn.energy[eid] += Turn.speed[eid] * ENERGY_TICK;
    }
  }

  /**
   * Get the next entity that should act (highest energy above threshold).
   * Returns -1 if no entity can act yet.
   */
  getNextActor(world: object): number {
    const entities = query(world, [Turn]);
    let bestEid = -1;
    let bestEnergy = ACTION_THRESHOLD - 1;

    for (const eid of entities) {
      if (Turn.energy[eid] > bestEnergy) {
        bestEnergy = Turn.energy[eid];
        bestEid = eid;
      }
    }

    return bestEid;
  }

  /** Check if the given entity is the player */
  isPlayer(world: object, eid: number): boolean {
    const players = query(world, [PlayerTag]);
    for (const pid of players) {
      if (pid === eid) return true;
    }
    return false;
  }

  /** Deduct action cost from entity's energy */
  deductEnergy(eid: number, cost: number): void {
    Turn.energy[eid] -= cost;
  }

  /**
   * Advance the turn system. Called from GameScene.update().
   * Returns the current phase so the scene can respond appropriately.
   */
  advance(world: object): TurnPhase {
    switch (this.phase) {
      case TurnPhase.PLAYER_INPUT:
        // Wait for player input — scene handles this
        return this.phase;

      case TurnPhase.PROCESSING:
        // Player action was submitted, now processing.
        // Scene should process the action and queue visual events.
        // After processing, transition to ANIMATION.
        this.phase = TurnPhase.ANIMATION;
        return this.phase;

      case TurnPhase.ANIMATION:
        // Visual queue is draining — scene handles this.
        // When drain completes, scene calls onAnimationComplete().
        return this.phase;

      case TurnPhase.ENEMY_TURN:
        // Process all non-player entities that can act
        this.phase = TurnPhase.ENEMY_ANIMATION;
        return this.phase;

      case TurnPhase.ENEMY_ANIMATION:
        // Enemy animation draining — on complete, back to input
        return this.phase;

      default:
        return this.phase;
    }
  }

  /** Called when player animation finishes */
  onPlayerAnimationComplete(world: object): void {
    this.phase = TurnPhase.ENEMY_TURN;
  }

  /** Called when enemy animation finishes (or skipped if no enemies) */
  onEnemyAnimationComplete(world: object): void {
    this.turnCount++;
    // Tick energy for next round
    this.tickEnergy(world);
    // Find next actor
    const next = this.getNextActor(world);
    if (next >= 0 && this.isPlayer(world, next)) {
      this.phase = TurnPhase.PLAYER_INPUT;
    } else if (next >= 0) {
      // Non-player entity acts next (Phase 4+)
      this.phase = TurnPhase.ENEMY_TURN;
    } else {
      // No one can act — tick more energy
      this.tickEnergy(world);
      this.phase = TurnPhase.PLAYER_INPUT;
    }
  }

  /** Submit player action — transitions from PLAYER_INPUT to PROCESSING */
  submitAction(dx: number, dy: number): void {
    if (this.phase !== TurnPhase.PLAYER_INPUT) return;
    this.pendingAction = { dx, dy };
    this.phase = TurnPhase.PROCESSING;
  }
}
