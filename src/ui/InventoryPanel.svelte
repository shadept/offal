<script lang="ts">
  import DraggableWindow from './DraggableWindow.svelte';
  import { inventoryStore, type InventoryItemInfo } from './inventoryStore';
  import { findMatchingRecipes, executeCraft, executeCrudeCraft, type RecipeMatch } from '../ecs/crafting';
  import { partIconDataUrls } from '../scenes/BootScene';
  import type { VisualEventQueue } from '../visual/EventQueue';

  const {
    playerEid,
    world,
    eventQueue,
    turnCount,
    onDrop,
    onPickUp,
    maxEid,
    playerX,
    playerY,
  }: {
    playerEid: number;
    world: object;
    eventQueue: VisualEventQueue;
    turnCount: number;
    onDrop: (itemEid: number) => void;
    onPickUp: (itemEid: number) => void;
    maxEid: number;
    playerX: number;
    playerY: number;
  } = $props();

  let tick = $state(0);
  inventoryStore.onChange(() => { tick++; });

  // Reactive reads
  let open = $derived.by(() => { tick; return inventoryStore.open; });
  let craftMode = $derived.by(() => { tick; return inventoryStore.craftMode; });
  let items = $derived.by(() => { tick; return inventoryStore.getInventoryItems(playerEid); });
  let capacity = $derived.by(() => { tick; return inventoryStore.getCapacityInfo(playerEid); });
  let floorItems = $derived.by(() => { tick; return inventoryStore.getFloorItems(playerX, playerY, maxEid); });

  // Crafting state
  let recipeMatches = $derived.by(() => {
    tick;
    if (!craftMode) return [];
    const selected = inventoryStore.getSelectedItems();
    if (selected.length < 2) return [];
    return findMatchingRecipes(selected);
  });

  let selectedCount = $derived.by(() => { tick; return inventoryStore.getSelectedItems().length; });

  function handleItemClick(eid: number) {
    if (craftMode) {
      inventoryStore.toggleItemSelection(eid);
    }
  }

  function handleDrop(eid: number) {
    onDrop(eid);
    inventoryStore.notify();
  }

  function handlePickUp(eid: number) {
    onPickUp(eid);
    inventoryStore.notify();
  }

  function handleCraft(match: RecipeMatch) {
    executeCraft(world, playerEid, match, eventQueue, turnCount);
    inventoryStore.clearSelection();
    inventoryStore.notify();
  }

  function handleCrudeCraft() {
    const selected = inventoryStore.getSelectedItems();
    executeCrudeCraft(world, playerEid, selected, eventQueue, turnCount);
    inventoryStore.clearSelection();
    inventoryStore.notify();
  }

  function close() {
    inventoryStore.close();
  }

  // Drag support for body parts
  function onItemDragStart(e: DragEvent, item: InventoryItemInfo) {
    if (!item.isPart) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/part-eid', String(item.eid));
    e.dataTransfer?.setData('text/source', 'inventory');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  // Double-click to auto-attach body parts
  function handleItemDblClick(item: InventoryItemInfo) {
    if (!item.isPart) return;
    // Dispatch a custom event that GameScene picks up for attachment
    window.dispatchEvent(new CustomEvent('body-auto-attach', { detail: { partEid: item.eid } }));
  }
</script>

<DraggableWindow title="INVENTORY" {open} defaultX={320} defaultY={80} width="22rem" onClose={close}>
  <!-- Capacity display in header area -->
  <div class="inv-cap-bar">
    <span class="inv-capacity">{capacity.used}/{capacity.max}</span>
  </div>

  <!-- Craft mode toggle -->
  <div class="inv-toolbar">
    <button
      class="inv-btn"
      class:active={craftMode}
      onclick={() => inventoryStore.toggleCraftMode()}
    >
      {craftMode ? 'Cancel Craft' : 'Craft'}
    </button>
  </div>

  <!-- Inventory items -->
  <div class="inv-scroll">
    <div class="inv-section-label">Carried</div>
    {#each items as item (item.eid)}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="inv-item"
        class:selected={item.selected}
        class:inv-part={item.isPart}
        draggable={item.isPart ? 'true' : 'false'}
        onclick={() => handleItemClick(item.eid)}
        ondblclick={() => handleItemDblClick(item)}
        ondragstart={(e) => onItemDragStart(e, item)}
      >
        <div class="inv-item-name">
          {#if item.isPart && item.partRole}
            <img class="inv-part-icon" src={partIconDataUrls.get(item.partRole)} alt="" />
          {/if}
          {item.name}
          {#if item.stackCount > 1}<span class="inv-stack">x{item.stackCount}</span>{/if}
        </div>
        <div class="inv-item-detail">
          <span class="inv-mat">{item.material}</span>
          {#if !item.isPart}
            <span class="inv-size">{item.size}</span>
            <span class="inv-vol">{item.volume}vol</span>
          {:else}
            <span class="inv-part-tag">{item.partRole}</span>
          {/if}
          {#if !craftMode}
            <button class="inv-drop-btn" onclick={(e: MouseEvent) => { e.stopPropagation(); handleDrop(item.eid); }}>drop</button>
          {/if}
        </div>
      </div>
    {:else}
      <div class="inv-empty">Empty</div>
    {/each}

    <!-- Floor items -->
    {#if floorItems.length > 0}
      <div class="inv-section-label">On Floor</div>
      {#each floorItems as fi (fi.eid)}
        <div class="inv-item floor-item">
          <div class="inv-item-name">{fi.name}</div>
          <div class="inv-item-detail">
            <span class="inv-mat">{fi.material}</span>
            <span class="inv-size">{fi.size}</span>
            <button class="inv-pickup-btn" onclick={() => handlePickUp(fi.eid)}>pick up</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Crafting panel -->
  {#if craftMode && selectedCount >= 2}
    <div class="craft-panel">
      <div class="craft-label">
        {selectedCount} items selected
      </div>
      {#if recipeMatches.length > 0}
        {#each recipeMatches as match (match.recipe.id)}
          <button class="craft-btn recipe" onclick={() => handleCraft(match)}>
            {match.recipe.name ?? match.recipe.id}
            {#if match.recipe.description}
              <span class="craft-desc">{match.recipe.description}</span>
            {/if}
          </button>
        {/each}
      {/if}
      <button class="craft-btn crude" onclick={handleCrudeCraft}>
        Crude Composite
        <span class="craft-desc">Merge items into improvised result</span>
      </button>
    </div>
  {/if}
</DraggableWindow>

<style>
  .inv-cap-bar {
    display: flex;
    justify-content: flex-end;
    padding: 0.2rem 0.6rem;
    border-bottom: 1px solid #222;
  }
  .inv-capacity {
    color: #668;
    font-size: 0.7rem;
  }
  .inv-toolbar {
    display: flex;
    padding: 0.3rem 0.6rem;
    border-bottom: 1px solid #222;
    gap: 0.4rem;
  }
  .inv-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #889999;
    font-family: monospace;
    font-size: 0.65rem;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    border-radius: 2px;
  }
  .inv-btn:hover { border-color: #558; color: #aabbbb; }
  .inv-btn.active { border-color: #e94560; color: #e94560; }
  .inv-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.3rem;
    max-height: 40vh;
  }
  .inv-scroll::-webkit-scrollbar { width: 4px; }
  .inv-scroll::-webkit-scrollbar-track { background: transparent; }
  .inv-scroll::-webkit-scrollbar-thumb { background: #334; border-radius: 2px; }
  .inv-section-label {
    color: #556;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 0.3rem 0.3rem 0.15rem;
    border-bottom: 1px solid #1a1a2e;
  }
  .inv-item {
    display: flex;
    flex-direction: column;
    padding: 0.25rem 0.4rem;
    border-bottom: 1px solid #1a1a22;
    cursor: default;
  }
  .inv-item.selected {
    background: rgba(233, 69, 96, 0.12);
    border-left: 2px solid #e94560;
  }
  .inv-item.floor-item {
    background: rgba(80, 80, 40, 0.1);
  }
  .inv-part {
    cursor: grab;
    border-left: 2px solid #4ec9b044;
  }
  .inv-part:hover {
    border-left-color: #4ec9b0;
  }
  .inv-item-name {
    color: #aabbbb;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .inv-part-icon {
    width: 14px;
    height: 14px;
    image-rendering: pixelated;
    filter: brightness(0.7);
  }
  .inv-stack {
    color: #668;
    font-size: 0.65rem;
    margin-left: 0.3rem;
  }
  .inv-item-detail {
    display: flex;
    gap: 0.5rem;
    font-size: 0.6rem;
    color: #556;
    align-items: center;
    margin-top: 0.1rem;
  }
  .inv-mat { color: #558; }
  .inv-size { color: #585; }
  .inv-vol { color: #655; }
  .inv-part-tag {
    color: #5a8;
    font-style: italic;
  }
  .inv-drop-btn, .inv-pickup-btn {
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
  .inv-drop-btn:hover { color: #e94560; border-color: #e94560; }
  .inv-pickup-btn:hover { color: #4ec9b0; border-color: #4ec9b0; }
  .inv-empty {
    color: #334;
    font-style: italic;
    padding: 1rem;
    text-align: center;
  }
  .craft-panel {
    border-top: 1px solid #334;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex-shrink: 0;
  }
  .craft-label {
    color: #668;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .craft-btn {
    background: #1a1a2e;
    border: 1px solid #334;
    color: #aabbbb;
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    border-radius: 2px;
    text-align: left;
    display: flex;
    flex-direction: column;
  }
  .craft-btn:hover { border-color: #4ec9b0; }
  .craft-btn.recipe { border-color: #4ec9b0; }
  .craft-btn.crude { border-color: #885; }
  .craft-desc {
    font-size: 0.6rem;
    color: #556;
    margin-top: 0.1rem;
  }
</style>
