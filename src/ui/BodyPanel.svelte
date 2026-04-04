<script lang="ts">
  import DraggableWindow from './DraggableWindow.svelte';
  import Tooltip from './Tooltip.svelte';
  import { bodyStore, type SlotInfo, type BodyInfo } from './bodyStore';
  import { computeSlotPositions, DIAGRAM_W, DIAGRAM_H } from './bodyLayout';
  import { partIconDataUrls } from '../scenes/BootScene';
  import type { TooltipData } from './tooltipTypes';

  const {
    playerEid,
    world,
    onAttach,
    onDetach,
  }: {
    playerEid: number;
    world: object;
    onAttach: (partEid: number, bodyEid: number) => void;
    onDetach: (partEid: number, bodyEid: number) => void;
  } = $props();

  // Reactive bridge
  let tick = $state(0);
  bodyStore.onChange(() => { tick++; });

  let open = $derived.by(() => { tick; return bodyStore.open; });
  let targetEid = $derived.by(() => { tick; return bodyStore.targetEid; });
  let isPlayerBody = $derived.by(() => { tick; return bodyStore.isPlayerBody; });
  let highlightedRole = $derived.by(() => { tick; return bodyStore.highlightedRole; });

  let bodyInfo = $derived.by((): BodyInfo | null => { tick; return bodyStore.getBodyInfo(targetEid); });

  let positions = $derived.by(() => {
    if (!bodyInfo) return new Map();
    return computeSlotPositions(bodyInfo.locomotionBaseline, bodyInfo.slots);
  });

  let title = $derived.by(() => {
    if (!bodyInfo) return 'BODY';
    return isPlayerBody ? 'BODY' : bodyInfo.speciesName.toUpperCase();
  });

  // Tooltip state
  let tooltipVisible = $state(false);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let tooltipData = $state<TooltipData | null>(null);

  function onSlotEnter(e: MouseEvent, slot: SlotInfo) {
    if (!slot.occupied) return;
    tooltipX = e.clientX;
    tooltipY = e.clientY;
    const iconUrl = partIconDataUrls.get(slot.role);
    const conditions: string[] = [];
    if (!slot.isFunctional && slot.occupied) conditions.push('deactivated');

    tooltipData = {
      name: slot.partName,
      iconUrl,
      conditions,
      stats: `HP ${slot.hp}/${slot.maxHp} \u00b7 ${slot.material} \u00b7 ${slot.role}`,
      coverage: `Coverage: ${slot.hitWeight} weight (${slot.coveragePct}%)`,
      capacities: slot.capacityContribution?.join(', '),
    };
    tooltipVisible = true;
  }

  function onSlotMove(e: MouseEvent) {
    tooltipX = e.clientX;
    tooltipY = e.clientY;
  }

  function onSlotLeave() {
    tooltipVisible = false;
    tooltipData = null;
  }

  function handleSlotDblClick(slot: SlotInfo) {
    if (!isPlayerBody) return;
    if (!slot.occupied) return;
    onDetach(slot.partEid, targetEid);
  }

  function close() {
    bodyStore.close();
  }

  function hpColor(hp: number, maxHp: number): string {
    if (maxHp <= 0) return '#334';
    const ratio = hp / maxHp;
    if (ratio > 0.6) return '#4ec9b0';
    if (ratio > 0.3) return '#c9a84e';
    return '#e94560';
  }

  // Drag-and-drop: accept parts dragged from inventory
  function onDiagramDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function onDiagramDrop(e: DragEvent) {
    e.preventDefault();
    const partEidStr = e.dataTransfer?.getData('text/part-eid');
    if (!partEidStr || !isPlayerBody) return;
    const partEid = parseInt(partEidStr, 10);
    if (!isNaN(partEid)) {
      onAttach(partEid, targetEid);
    }
  }

  // Drag parts out of the body panel (detach)
  function onPartDragStart(e: DragEvent, slot: SlotInfo) {
    if (!isPlayerBody || !slot.occupied) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/part-eid', String(slot.partEid));
    e.dataTransfer?.setData('text/source', 'body');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onPartDragEnd(e: DragEvent, slot: SlotInfo) {
    if (e.dataTransfer?.dropEffect === 'none' && isPlayerBody && slot.occupied) {
      // Dropped outside any valid target — detach
      onDetach(slot.partEid, targetEid);
    }
  }
</script>

<DraggableWindow {title} {open} defaultX={60} defaultY={80} width="340px" onClose={close}>
  {#if bodyInfo}
  <div class="bp-content">
    <!-- Body HP bar -->
    <div class="bp-body-hp">
      <span class="bp-hp-label">Body</span>
      <div class="bp-hp-bar-track">
        <div
          class="bp-hp-bar-fill"
          style="width: {(bodyInfo.bodyHp / bodyInfo.bodyMaxHp) * 100}%; background: {hpColor(bodyInfo.bodyHp, bodyInfo.bodyMaxHp)};"
        ></div>
      </div>
      <span class="bp-hp-text">{bodyInfo.bodyHp}/{bodyInfo.bodyMaxHp}</span>
    </div>

    <!-- Diagram area -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bp-diagram"
      style="width: {DIAGRAM_W}px; height: {DIAGRAM_H}px;"
      ondragover={onDiagramDragOver}
      ondrop={onDiagramDrop}
    >
      {#each bodyInfo.slots as slot (slot.slotId)}
        {@const pos = positions.get(slot.slotId)}
        {#if pos}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="bp-slot"
            class:bp-slot-occupied={slot.occupied}
            class:bp-slot-empty={!slot.occupied && !slot.wasSevered}
            class:bp-slot-severed={slot.wasSevered}
            class:bp-slot-deactivated={slot.occupied && !slot.isFunctional}
            class:bp-slot-highlight={highlightedRole === slot.role && !slot.occupied}
            style="left: {pos.x - 22}px; top: {pos.y - 22}px;"
            draggable={isPlayerBody && slot.occupied ? 'true' : 'false'}
            ondragstart={(e) => onPartDragStart(e, slot)}
            ondragend={(e) => onPartDragEnd(e, slot)}
            onmouseenter={(e) => onSlotEnter(e, slot)}
            onmousemove={onSlotMove}
            onmouseleave={onSlotLeave}
            ondblclick={() => handleSlotDblClick(slot)}
          >
            {#if slot.occupied}
              <!-- Actual part icon -->
              {#if partIconDataUrls.get(slot.role)}
                <img
                  class="bp-part-icon"
                  src={partIconDataUrls.get(slot.role)}
                  alt={slot.partName}
                />
              {/if}
              <!-- HP bar -->
              <div class="bp-part-hp-track">
                <div
                  class="bp-part-hp-fill"
                  style="width: {(slot.hp / slot.maxHp) * 100}%; background: {hpColor(slot.hp, slot.maxHp)};"
                ></div>
              </div>
            {:else if slot.wasSevered}
              <!-- Severed stump -->
              {#if partIconDataUrls.get(slot.role)}
                <img
                  class="bp-severed-icon"
                  src={partIconDataUrls.get(slot.role)}
                  alt={slot.role}
                />
              {/if}
              <span class="bp-severed-label">LOST</span>
            {:else}
              <!-- Blueprint ghost -->
              {#if partIconDataUrls.get(slot.role)}
                <img
                  class="bp-ghost-icon"
                  src={partIconDataUrls.get(slot.role)}
                  alt={slot.role}
                />
              {/if}
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    <!-- Capacities -->
    <div class="bp-capacities">
      {#each Object.entries(bodyInfo.capacities) as [key, val]}
        <div class="bp-cap-row">
          <span class="bp-cap-label">{key.slice(0, 3).toUpperCase()}</span>
          <div class="bp-cap-bar-track">
            <div class="bp-cap-bar-fill" style="width: {val}%; background: {val > 50 ? '#4ec9b0' : val > 0 ? '#c9a84e' : '#e94560'};"></div>
          </div>
          <span class="bp-cap-val">{val}%</span>
        </div>
      {/each}
    </div>
  </div>
  {:else}
    <div class="bp-empty">No body data</div>
  {/if}
</DraggableWindow>

<Tooltip visible={tooltipVisible} x={tooltipX} y={tooltipY} data={tooltipData} />

<style>
  .bp-content {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.3rem;
  }

  /* Body HP */
  .bp-body-hp {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.3rem;
  }
  .bp-hp-label {
    color: #667;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    width: 2.5rem;
  }
  .bp-hp-bar-track {
    flex: 1;
    height: 4px;
    background: #1a1a2e;
    border-radius: 2px;
    overflow: hidden;
  }
  .bp-hp-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.2s ease;
  }
  .bp-hp-text {
    color: #778;
    font-size: 0.6rem;
    min-width: 3rem;
    text-align: right;
  }

  /* Diagram */
  .bp-diagram {
    position: relative;
    margin: 0 auto;
    border: 1px solid #1a1a2e;
    border-radius: 3px;
    background: rgba(10, 10, 20, 0.5);
    overflow: hidden;
  }

  /* Slots */
  .bp-slot {
    position: absolute;
    width: 44px;
    height: 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: left 0.3s ease, top 0.3s ease, opacity 0.2s ease;
    cursor: default;
  }
  .bp-slot-occupied {
    border: 1px solid #334;
    background: rgba(20, 20, 35, 0.8);
  }
  .bp-slot-occupied:hover {
    border-color: #558;
    background: rgba(30, 30, 50, 0.9);
  }
  .bp-slot-empty {
    border: 1px dashed #223;
    background: transparent;
  }
  .bp-slot-severed {
    border: 1px solid #733;
    background: rgba(80, 20, 20, 0.3);
  }
  .bp-slot-deactivated {
    opacity: 0.4;
    border-color: #533;
  }
  .bp-slot-highlight {
    border-color: #4ec9b0;
    box-shadow: 0 0 6px rgba(78, 201, 176, 0.4);
    animation: slot-pulse 1s ease-in-out infinite;
  }
  @keyframes slot-pulse {
    0%, 100% { box-shadow: 0 0 4px rgba(78, 201, 176, 0.3); }
    50% { box-shadow: 0 0 10px rgba(78, 201, 176, 0.6); }
  }

  /* Part icon */
  .bp-part-icon {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    filter: brightness(0.85);
    pointer-events: none;
  }
  .bp-ghost-icon {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    opacity: 0.2;
    pointer-events: none;
  }
  .bp-severed-icon {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    opacity: 0.15;
    pointer-events: none;
    filter: saturate(0) brightness(0.5);
  }
  .bp-severed-label {
    font-size: 0.45rem;
    color: #a44;
    letter-spacing: 1px;
    pointer-events: none;
  }

  /* Part HP bar (tiny bar under icon) */
  .bp-part-hp-track {
    width: 32px;
    height: 3px;
    background: #111;
    border-radius: 1px;
    margin-top: 1px;
    overflow: hidden;
  }
  .bp-part-hp-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 0.2s ease;
  }

  /* Capacities */
  .bp-capacities {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.2rem 0.3rem;
    border-top: 1px solid #1a1a2e;
  }
  .bp-cap-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .bp-cap-label {
    color: #556;
    font-size: 0.55rem;
    width: 2rem;
    letter-spacing: 1px;
  }
  .bp-cap-bar-track {
    flex: 1;
    height: 3px;
    background: #1a1a2e;
    border-radius: 1px;
    overflow: hidden;
  }
  .bp-cap-bar-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 0.2s ease;
  }
  .bp-cap-val {
    color: #667;
    font-size: 0.55rem;
    min-width: 2rem;
    text-align: right;
  }

  .bp-empty {
    color: #334;
    font-style: italic;
    padding: 2rem;
    text-align: center;
  }
</style>
