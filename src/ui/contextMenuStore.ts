/**
 * Context menu state — manages right-click menus.
 */

export interface ContextAction {
  label: string;
  enabled: boolean;
  callback: () => void;
}

export class ContextMenuStore {
  private _open = false;
  private _x = 0;
  private _y = 0;
  private _targetEid = -1;
  private _actions: ContextAction[] = [];
  private _listeners: (() => void)[] = [];

  get open(): boolean { return this._open; }
  get x(): number { return this._x; }
  get y(): number { return this._y; }
  get targetEid(): number { return this._targetEid; }
  get actions(): ContextAction[] { return this._actions; }

  show(x: number, y: number, targetEid: number, actions: ContextAction[]): void {
    this._open = true;
    this._x = x;
    this._y = y;
    this._targetEid = targetEid;
    this._actions = actions;
    this.notify();
  }

  close(): void {
    this._open = false;
    this._actions = [];
    this._targetEid = -1;
    this.notify();
  }

  onChange(fn: () => void): void {
    this._listeners.push(fn);
  }

  notify(): void {
    for (const fn of this._listeners) fn();
  }
}

export const contextMenuStore = new ContextMenuStore();
