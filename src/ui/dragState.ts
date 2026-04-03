/**
 * Shared drag-and-drop state singleton.
 * Tracks what is currently being dragged between UI panels.
 */
import type { PartRole } from '../types';

export interface DragPayload {
  type: 'part';
  eid: number;
  sourcePanel: 'inventory' | 'body';
  partRole?: PartRole;
}

class DragState {
  private _dragging: DragPayload | null = null;
  private _listeners: (() => void)[] = [];

  get dragging(): DragPayload | null { return this._dragging; }

  startDrag(payload: DragPayload): void {
    this._dragging = payload;
    this.notify();
  }

  endDrag(): DragPayload | null {
    const payload = this._dragging;
    this._dragging = null;
    this.notify();
    return payload;
  }

  onChange(fn: () => void): void {
    this._listeners.push(fn);
  }

  notify(): void {
    for (const fn of this._listeners) fn();
  }
}

export const dragState = new DragState();
