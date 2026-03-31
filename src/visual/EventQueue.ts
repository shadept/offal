/**
 * Visual Event Queue.
 *
 * Logic produces an ordered queue of visual events during turn processing.
 * The visual layer drains the queue sequentially, playing each event's
 * animation before advancing. The next turn does not start until the
 * queue is empty.
 *
 * Architecture constraint: "Logic is tentative until animation completes."
 * State mutations (position updates, damage, etc.) happen in each event's
 * onComplete callback, not when the event is enqueued.
 */
import type { VisualEvent } from '../types';

export type EventCallback = (event: VisualEvent, onComplete: () => void) => void;

export class VisualEventQueue {
  private queue: VisualEvent[] = [];
  private handlers = new Map<string, EventCallback>();
  private draining = false;
  private _skipMode = false;
  private onDrainComplete: (() => void) | null = null;
  /** Callbacks to run when an event's animation completes (state commits) */
  private commitCallbacks = new Map<VisualEvent, () => void>();
  /** The event currently being animated (already shifted off queue) */
  private currentEvent: VisualEvent | null = null;

  /** Register a handler for a visual event type */
  registerHandler(type: string, handler: EventCallback): void {
    this.handlers.set(type, handler);
  }

  /** Enqueue a visual event with an optional state-commit callback */
  push(event: VisualEvent, onCommit?: () => void): void {
    this.queue.push(event);
    if (onCommit) {
      this.commitCallbacks.set(event, onCommit);
    }
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
   * Start draining the queue. Calls onComplete when all events have played.
   * Each event plays sequentially — the next starts only after the previous
   * finishes (via its onComplete callback).
   */
  drain(onComplete: () => void): void {
    if (this.queue.length === 0) {
      onComplete();
      return;
    }
    this.draining = true;
    this.onDrainComplete = onComplete;
    this.processNext();
  }

  /** Skip all remaining events instantly */
  skipAll(): void {
    // Commit the in-flight event (already shifted off the queue)
    if (this.currentEvent) {
      const commit = this.commitCallbacks.get(this.currentEvent);
      if (commit) {
        commit();
        this.commitCallbacks.delete(this.currentEvent);
      }
      this.currentEvent = null;
    }
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      const commit = this.commitCallbacks.get(event);
      if (commit) {
        commit();
        this.commitCallbacks.delete(event);
      }
    }
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
    this.commitCallbacks.clear();
    this.currentEvent = null;
    this.draining = false;
    this.onDrainComplete = null;
  }

  /**
   * Flush all events instantly — commit the in-flight event and all queued
   * events, but do NOT invoke the onDrainComplete callback.  The caller is
   * responsible for any post-drain work (FOV update, phase transition, etc.).
   */
  flushAll(): void {
    // Commit the event whose animation is currently running
    if (this.currentEvent) {
      const commit = this.commitCallbacks.get(this.currentEvent);
      if (commit) {
        commit();
        this.commitCallbacks.delete(this.currentEvent);
      }
      this.currentEvent = null;
    }
    // Commit every remaining queued event
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      const commit = this.commitCallbacks.get(event);
      if (commit) {
        commit();
        this.commitCallbacks.delete(event);
      }
    }
    this.draining = false;
    this.onDrainComplete = null;
  }

  private processNext(): void {
    if (this.queue.length === 0) {
      this.draining = false;
      if (this.onDrainComplete) {
        const cb = this.onDrainComplete;
        this.onDrainComplete = null;
        cb();
      }
      return;
    }

    // Skip mode: resolve all instantly
    if (this._skipMode) {
      this.skipAll();
      return;
    }

    const event = this.queue.shift()!;
    this.currentEvent = event;
    const handler = this.handlers.get(event.type);

    if (!handler) {
      console.warn(`[visual] No handler for event type: ${event.type}`);
      // Still run commit callback
      const commit = this.commitCallbacks.get(event);
      if (commit) {
        commit();
        this.commitCallbacks.delete(event);
      }
      this.currentEvent = null;
      this.processNext();
      return;
    }

    handler(event, () => {
      // Run the state-commit callback when animation finishes
      const commit = this.commitCallbacks.get(event);
      if (commit) {
        commit();
        this.commitCallbacks.delete(event);
      }
      this.currentEvent = null;
      this.processNext();
    });
  }
}
