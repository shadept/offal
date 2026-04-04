<script lang="ts">
  import DraggableWindow from './DraggableWindow.svelte';
  import { lootStore, type LootItemInfo } from './lootStore';
  import { inventoryStore, type InventoryItemInfo } from './inventoryStore';
  import { bodyStore } from './bodyStore';
  import { partIconDataUrls } from '../scenes/BootScene';

  const {
    playerEid,
    world,
    onTakeItem,
    onTakePart,
    onDropItem,
  }: {
    playerEid: number;
    world: object;
    onTakeItem: (corpseEid: number, itemEid: number) => void;
    onTakePart: (corpseEid: number, partEid: number) => void;
    onDropItem: (itemEid: number) => void;
  } = $props();

  let tick = $state(0);
  lootStore.onChange(() => { tick++; });
  inventoryStore.onChange(() => { tick++; });

  let open = $derived.by(() => { tick; return lootStore.open; });
  let targetEid = $derived.by(() => { tick; return lootStore.targetEid; });

  // Corpse data
  let corpseBodyParts = $derived.by(() => { tick; if (targetEid < 0) return []; return lootStore.getBodyParts(targetEid); });
  let corpseItems = $derived.by(() => { tick; if (targetEid < 0) return []; return lootStore.getInventoryItems(targetEid); });

  // Player inventory
  let playerItems = $derived.by(() => { tick; return inventoryStore.getInventoryItems(playerEid); });
  let playerCapacity = $derived.by(() => { tick; return inventoryStore.getCapacityInfo(playerEid); });

  // Corpse name
  let corpseName = $derived.by(() => {
    tick;
    if (targetEid < 0) return 'LOOT';
    // Use bodyStore to get species name
    const info = bodyStore.getBodyInfo(targetEid);
    return info ? `${info.speciesName.toUpperCase()} (DEAD)` : 'CORPSE';
  });

  function handleTakeItem(itemEid: number) {
    onTakeItem(targetEid, itemEid);
    lootStore.notify();
    inventoryStore.notify();
  }

  function handleTakePart(partEid: number) {
    onTakePart(targetEid, partEid);
    lootStore.notify();
    inventoryStore.notify();
    bodyStore.notify();
  }

  function handleDropItem(itemEid: number) {
    onDropItem(itemEid);
    lootStore.notify();
    inventoryStore.notify();
  }

  function close() {
    lootStore.close();
  }

  // Drag: corpse item → player (take)
  function onCorpseItemDragStart(e: DragEvent, item: LootItemInfo) {
    e.dataTransfer?.setData('text/loot-eid', String(item.eid));
    e.dataTransfer?.setData('text/loot-type', item.isPart ? 'part' : 'item');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  // Drag: player item → drop zone (drop to floor)
  function onPlayerItemDragStart(e: DragEvent, item: InventoryItemInfo) {
    e.dataTransfer?.setData('text/drop-eid', String(item.eid));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  // Drop zone: player inventory panel accepts corpse items
  function onPlayerPanelDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function onPlayerPanelDrop(e: DragEvent) {
    e.preventDefault();
    const eidStr = e.dataTransfer?.getData('text/loot-eid');
    const type = e.dataTransfer?.getData('text/loot-type');
    if (!eidStr) return;
    const eid = parseInt(eidStr, 10);
    if (isNaN(eid)) return;
    if (type === 'part') {
      handleTakePart(eid);
    } else {
      handleTakeItem(eid);
    }
  }

  // Drop outside valid target: player item → drop to floor
  function onPlayerItemDragEnd(e: DragEvent, item: InventoryItemInfo) {
    if (e.dataTransfer?.dropEffect === 'none') {
      handleDropItem(item.eid);
    }
  }
</script>

<DraggableWindow title="LOOT" {open} defaultX={200} defaultY={60} width="44rem" onClose={close}>
  <div class="loot-layout">
    <!-- Left: Corpse contents -->
    <div class="loot-column">
      <div class="loot-col-header">{corpseName}</div>
      <div class="loot-scroll">
        <!-- Body parts -->
        {#if corpseBodyParts.length > 0}
          <div class="loot-section-label">Body Parts</div>
          {#each corpseBodyParts as part (part.eid)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="loot-item loot-part"
              draggable="true"
              ondragstart={(e) => onCorpseItemDragStart(e, part)}
            >
              <div class="loot-item-name">
                {#if part.partRole && partIconDataUrls.get(part.partRole)}
                  <img class="loot-part-icon" src={partIconDataUrls.get(part.partRole)} alt="" />
                {/if}
                {part.name}
              </div>
              <div class="loot-item-detail">
                <span class="loot-mat">{part.material}</span>
                <span class="loot-role">{part.partRole}</span>
                <button class="loot-take-btn" onclick={() => handleTakePart(part.eid)}>take</button>
              </div>
            </div>
          {/each}
        {/if}

        <!-- Inventory items -->
        {#if corpseItems.length > 0}
          <div class="loot-section-label">Carried Items</div>
          {#each corpseItems as item (item.eid)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="loot-item"
              draggable="true"
              ondragstart={(e) => onCorpseItemDragStart(e, item)}
            >
              <div class="loot-item-name">
                {item.name}
                {#if item.stackCount > 1}<span class="loot-stack">x{item.stackCount}</span>{/if}
              </div>
              <div class="loot-item-detail">
                <span class="loot-mat">{item.material}</span>
                <span class="loot-size">{item.size}</span>
                <button class="loot-take-btn" onclick={() => handleTakeItem(item.eid)}>take</button>
              </div>
            </div>
          {/each}
        {/if}

        {#if corpseBodyParts.length === 0 && corpseItems.length === 0}
          <div class="loot-empty">Nothing to loot</div>
        {/if}
      </div>
    </div>

    <!-- Divider -->
    <div class="loot-divider"></div>

    <!-- Right: Player inventory -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="loot-column"
      ondragover={onPlayerPanelDragOver}
      ondrop={onPlayerPanelDrop}
    >
      <div class="loot-col-header">
        YOUR INVENTORY
        <span class="loot-cap">{playerCapacity.used}/{playerCapacity.max}</span>
      </div>
      <div class="loot-scroll">
        {#each playerItems as item (item.eid)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="loot-item"
            class:loot-part={item.isPart}
            draggable="true"
            ondragstart={(e) => onPlayerItemDragStart(e, item)}
            ondragend={(e) => onPlayerItemDragEnd(e, item)}
          >
            <div class="loot-item-name">
              {#if item.isPart && item.partRole && partIconDataUrls.get(item.partRole)}
                <img class="loot-part-icon" src={partIconDataUrls.get(item.partRole)} alt="" />
              {/if}
              {item.name}
              {#if item.stackCount > 1}<span class="loot-stack">x{item.stackCount}</span>{/if}
            </div>
            <div class="loot-item-detail">
              <span class="loot-mat">{item.material}</span>
              {#if item.isPart}
                <span class="loot-role">{item.partRole}</span>
              {:else}
                <span class="loot-size">{item.size}</span>
              {/if}
              <button class="loot-drop-btn" onclick={() => handleDropItem(item.eid)}>drop</button>
            </div>
          </div>
        {:else}
          <div class="loot-empty">Empty</div>
        {/each}
      </div>
    </div>
  </div>
</DraggableWindow>

<style>
  .loot-layout {
    display: flex;
    min-height: 200px;
    max-height: 60vh;
  }
  .loot-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .loot-divider {
    width: 1px;
    background: #334;
    flex-shrink: 0;
  }
  .loot-col-header {
    color: #ccdddd;
    font-size: 0.7rem;
    letter-spacing: 1px;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid #222;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }
  .loot-cap {
    color: #668;
    font-size: 0.65rem;
  }
  .loot-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.2rem;
  }
  .loot-scroll::-webkit-scrollbar { width: 4px; }
  .loot-scroll::-webkit-scrollbar-track { background: transparent; }
  .loot-scroll::-webkit-scrollbar-thumb { background: #334; border-radius: 2px; }
  .loot-section-label {
    color: #556;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 0.3rem 0.3rem 0.15rem;
    border-bottom: 1px solid #1a1a2e;
  }
  .loot-item {
    display: flex;
    flex-direction: column;
    padding: 0.25rem 0.4rem;
    border-bottom: 1px solid #1a1a22;
    cursor: grab;
  }
  .loot-item:hover {
    background: rgba(78, 201, 176, 0.05);
  }
  .loot-part {
    border-left: 2px solid #4ec9b044;
  }
  .loot-part:hover {
    border-left-color: #4ec9b0;
  }
  .loot-item-name {
    color: #aabbbb;
    font-size: 0.72rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .loot-part-icon {
    width: 14px;
    height: 14px;
    image-rendering: pixelated;
    filter: brightness(0.7);
  }
  .loot-stack {
    color: #668;
    font-size: 0.65rem;
    margin-left: 0.3rem;
  }
  .loot-item-detail {
    display: flex;
    gap: 0.5rem;
    font-size: 0.6rem;
    color: #556;
    align-items: center;
    margin-top: 0.1rem;
  }
  .loot-mat { color: #558; }
  .loot-size { color: #585; }
  .loot-role { color: #5a8; font-style: italic; }
  .loot-take-btn, .loot-drop-btn {
    background: none;
    border: 1px solid #334;
    color: #668;
    font-family: monospace;
    font-size: 0.55rem;
    padding: 0 0.3rem;
    cursor: pointer;
    border-radius: 2px;
    margin-left: auto;
  }
  .loot-take-btn:hover { color: #4ec9b0; border-color: #4ec9b0; }
  .loot-drop-btn:hover { color: #e94560; border-color: #e94560; }
  .loot-empty {
    color: #334;
    font-style: italic;
    padding: 1rem;
    text-align: center;
  }
</style>
