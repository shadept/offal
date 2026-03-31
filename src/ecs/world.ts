/**
 * ECS world creation and entity factory helpers.
 */
import {
  createWorld,
  addEntity,
  addComponent,
} from 'bitecs';
import { Position, Renderable, Turn, FOV, PlayerTag } from './components';

export type GameWorld = ReturnType<typeof createGameWorld>;

export function createGameWorld() {
  const world = createWorld();
  return world;
}

/** Sprite index constants — mapped to generated textures in BootScene */
export const SpriteIndex = {
  PLAYER: 0,
  FLOOR: 1,
  WALL: 2,
  DOOR_CLOSED: 3,
  DOOR_OPEN: 4,
} as const;

export interface SpawnPlayerOpts {
  x: number;
  y: number;
  speed?: number;
  viewRange?: number;
}

/** Spawn the player entity */
export function spawnPlayer(world: object, opts: SpawnPlayerOpts): number {
  const eid = addEntity(world);
  addComponent(world, eid, Position);
  addComponent(world, eid, Renderable);
  addComponent(world, eid, Turn);
  addComponent(world, eid, FOV);
  addComponent(world, eid, PlayerTag);

  Position.x[eid] = opts.x;
  Position.y[eid] = opts.y;
  Renderable.spriteIndex[eid] = SpriteIndex.PLAYER;
  Renderable.layer[eid] = 2;
  Turn.energy[eid] = 0;
  Turn.speed[eid] = opts.speed ?? 100;
  Turn.actionCost[eid] = 0;
  FOV.range[eid] = opts.viewRange ?? 8;

  return eid;
}
