/**
 * GameLog — typed message log for combat, environment, and system events.
 * Not an ECS component — a plain append-only list rendered by a Svelte component.
 */

export type LogCategory = 'combat' | 'environment' | 'death' | 'system';

export interface LogEntry {
  turn: number;
  category: LogCategory;
  text: string;
}

const MAX_ENTRIES = 500;

class GameLog {
  private entries: LogEntry[] = [];
  private listeners: (() => void)[] = [];

  push(turn: number, category: LogCategory, text: string): void {
    this.entries.push({ turn, category, text });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    for (const fn of this.listeners) fn();
  }

  getAll(): readonly LogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  removeListener(fn: () => void): void {
    this.listeners = this.listeners.filter(l => l !== fn);
  }
}

/** Singleton game log instance. */
export const gameLog = new GameLog();
