/**
 * SandboxStore — Svelte 5 reactive wrapper around SandboxController.
 *
 * The controller owns all state and mutations.  This class bridges
 * controller events into Svelte's fine-grained reactivity by bumping
 * a $state tick on every event.  Getters read the tick (creating a
 * dependency) then return the live controller value.
 */
import type { SandboxController } from '../sandbox/SandboxController';

export class SandboxStore {
  #ctrl: SandboxController;
  #tick = $state(0);

  constructor(ctrl: SandboxController) {
    this.#ctrl = ctrl;
    ctrl.on(() => { this.#tick++; });
  }

  /** Reactive accessor — any template expression through store.ctrl
   *  creates a dependency on #tick, so it re-evaluates on state changes. */
  get ctrl(): SandboxController { this.#tick; return this.#ctrl; }

  // ── Convenience reactive getters ──

  get active()           { this.#tick; return this.#ctrl.active; }
  get selectedTile()     { this.#tick; return this.#ctrl.selectedTile; }
  get selectedEntity()   { this.#tick; return this.#ctrl.selectedEntity; }
  get selectedEntities() { this.#tick; return this.#ctrl.selectedEntities; }
  get activeTool()       { this.#tick; return this.#ctrl.activeTool; }
  get autoPlay()         { this.#tick; return this.#ctrl.autoPlay; }
  get autoPlaySpeed()    { this.#tick; return this.#ctrl.autoPlaySpeed; }
  get revealAll()        { this.#tick; return this.#ctrl.revealAll; }
  get aiOnly()           { this.#tick; return this.#ctrl.aiOnly; }
  get paintTileIndex()   { this.#tick; return this.#ctrl.paintTileIndex; }
  get selectedSpeciesId(){ this.#tick; return this.#ctrl.selectedSpeciesId; }
}
