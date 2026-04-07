import Phaser from 'phaser';

export interface UIInitPayload {
  playerEid: number;
  world: object;
}

let latestInitPayload: UIInitPayload | null = null;

export const uiEventBus = new Phaser.Events.EventEmitter();

export function setUIInitPayload(payload: UIInitPayload): void {
  latestInitPayload = payload;
  uiEventBus.emit('ui-init', payload);
}

export function getUIInitPayload(): UIInitPayload | null {
  return latestInitPayload;
}
