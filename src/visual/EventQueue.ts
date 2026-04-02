/**
 * Visual Event Queue.
 *
 * Logic produces visual events during turn processing. All state mutations
 * happen immediately — events are purely descriptive snapshots of what
 * happened for the visual layer to animate.
 *
 * On drain(), all queued events fire their handlers in parallel. The next
 * turn does not start until every animation has called its onComplete.
 */
import type { VisualEvent } from '../types';

export type EventCallback = (event: VisualEvent, onComplete: () => void) => void;

export class VisualEventQueue {
  private queue: VisualEvent[] = [];
  private handlers = new Map<string, EventCallback>();
  private draining = false;
  private _skipMode = false;
  private onDrainComplete: (() => void) | null = null;

  /** Register a handler for a visual event type */
  registerHandler(type: string, handler: EventCallback): void {
    this.handlers.set(type, handler);
  }

  /** Enqueue a visual event */
  push(event: VisualEvent): void {
    this.queue.push(event);
  }

  /** Number of events remaining */
  get length(): number {
    return this.queue.length;
  }

  /** Whether the queue is currently playing events */
  get isDraining(): boolean {
    return this.draining;
  }

  /** Enable skip mode — all events resolve instantly */
  set skipMode(v: boolean) {
    this._skipMode = v;
  }

  get skipMode(): boolean {
    return this._skipMode;
  }

  /**
   * Start draining the queue. Fires all handlers in parallel.
   * Calls onComplete when every animation has finished.
   */
  drain(onComplete: () => void): void {
    if (this.queue.length === 0) {
      onComplete();
      return;
    }

    this.draining = true;
    this.onDrainComplete = onComplete;

    // Skip mode: resolve immediately
    if (this._skipMode) {
      this.skipAll();
      return;
    }

    // Fire all events in parallel
    const events = this.queue.splice(0);
    let remaining = events.length;

    const finish = () => {
      remaining--;
      if (remaining <= 0) {
        this.draining = false;
        if (this.onDrainComplete) {
          const cb = this.onDrainComplete;
          this.onDrainComplete = null;
          cb();
        }
      }
    };

    for (const event of events) {
      const handler = this.handlers.get(event.type);
      if (!handler) {
        console.warn(`[visual] No handler for event type: ${event.type}`);
        finish();
        continue;
      }
      handler(event, finish);
    }
  }

  /** Skip all remaining events instantly */
  skipAll(): void {
    this.queue.length = 0;
    this.draining = false;
    if (this.onDrainComplete) {
      const cb = this.onDrainComplete;
      this.onDrainComplete = null;
      cb();
    }
  }

  /** Clear all events without executing them */
  clear(): void {
    this.queue.length = 0;
    this.draining = false;
    this.onDrainComplete = null;
  }

  /**
   * Flush all events instantly — discard all queued events.
   * State is already committed, so nothing to apply.
   * Does NOT invoke the onDrainComplete callback.
   */
  flushAll(): void {
    this.queue.length = 0;
    this.draining = false;
    this.onDrainComplete = null;
  }
}
