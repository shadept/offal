# Body UI & Attachment System

> Design spec for the body-slot attachment UI, window system, and limb attach/detach mechanics.
> Companion to [body-system.md](body-system.md) and GDD.md Section 2.

---

## Overview

The body panel is an MMO-style draggable window that shows a creature's anatomy as a schematic diagram. Parts are displayed as silhouette icons arranged on a curved layout derived from the species' locomotion type. Players attach and detach limbs by dragging between the inventory and body panels, or by double-clicking.

---

## Window System

All game panels (body, inventory, future panels) use a shared MMO-style window system.

| Property | Behaviour |
|---|---|
| **Draggable** | By title bar |
| **Closeable** | X button or keybind toggle |
| **Z-ordering** | Click to bring to front |
| **Transparency** | Unfocused windows become semi-transparent so the game world shows through |
| **Position** | Resets to default on open (no persistence yet) |
| **Resize** | Not supported |
| **Snapping** | Not supported |

### Keybinds

| Key | Panel |
|---|---|
| `B` | Body panel (toggle) |
| `I` | Inventory panel (toggle) |

Both panels are independent and can be open simultaneously. Drag-and-drop between them requires both to be open.

---

## Body Panel

### Two-Layer Diagram

1. **Blueprint layer** (always visible) — a faint/ghosted rendering of the species' default body plan. All natural slots shown as low-opacity silhouettes. This is "what you're supposed to look like."

2. **Actual parts layer** (on top) — real attached parts rendered opaque with their silhouette icon, HP bar below, and status condition icons. Where a part exists, it covers the blueprint ghost. Where a slot is empty, the ghost shows through.

### Slot Model

- **Blueprint slots** are permanent. They always appear in the diagram even when empty. They represent the species' natural body plan (e.g. salvager: head, torso, 2 arms, 2 legs, organs).
- **Extra slots** appear dynamically when parts are attached beyond the blueprint. They disappear when the extra part is removed. The layout animates to accommodate additions and removals.
- There is no hard limit on attachments. Heart capacity is a soft cap — exceeding it applies performance penalties but never prevents attachment.

### Slot Visual States

| State | Visual |
|---|---|
| **Occupied — Functional** (hp > 0) | Full opacity icon, HP bar, status icons |
| **Occupied — Deactivated** (hp = 0, still attached) | Dimmed/degraded icon, HP bar at zero, dead weight indicator |
| **Empty** (blueprint slot, nothing attached) | Transparent — blueprint ghost shows through |

No stump concept. Empty is empty.

### Per-Slot Display

**Default view:**
- Part silhouette icon
- HP bar below
- Status condition icons (wound, burning, low circulation, rejected, etc.)

**On hover — tooltip** (shared component with inventory):

```
[Sprite] Part Name
         [condition icons]
───────────────────────
HP 12/15 · Material · Weight
Capacity contribution
───────────────────────
Description text.
```

Horizontal layout: sprite and name top-left, condition icons beside name, stats as a compact line, description at bottom.

---

## Layout Algorithm

### Templates

Body diagram layout is determined by the species' `locomotionBaseline` field (no new data field needed).

| `locomotionBaseline` | Template | Layout |
|---|---|---|
| `biped` | Upright | Head above, arms fanning on sides, organs in middle, legs fanning below. Curved ellipse around torso. |
| `quadruped` | Horizontal | Head to one side, two leg groups (front pair, back pair) on each side, organs in center. |
| `serpentine` | Chain | Mouth at one end, segments chaining linearly. |
| `hover` | Radial | Core in center, rotors/radial parts evenly spaced around it, sensors near top. |
| `amorphous` | Blob | Central mass, parts positioned semi-randomly on perimeter. Chaos is the layout. |

### Distribution Rule

Parts of the same role are evenly distributed within their role's region on the curved layout (analogous to CSS flexbox `justify: space-between` on a curve).

- 2 legs = left/right
- 3 legs = evenly spaced across bottom
- N legs = evenly spaced

Adding a part: existing parts animate to their new positions to make room. Removing a part: remaining parts animate to fill the gap. Extra slots beyond the blueprint appear with the same animation.

---

## Placeholder Art

Silhouette icons per role, one shape each. Enough to distinguish roles visually. These are swappable for real part sprites in a future art/asset pass (Task B — modular creature rendering).

Roles requiring icons: `arm`, `leg`, `head`, `torso`, `organ`, `sensor`, `mouth`, `segment`, `rotor`.

Blueprint ghost layer uses the same icons at low opacity.

---

## Attach Mechanic

### ECS: `attachPart`

Mirror of the existing `detachPart` function.

1. Remove `Position` and `Renderable` from part entity (take off floor)
2. Remove `HeldBy` if held in inventory
3. Add `AttachedTo` component (`parentEid`, `slotId`)
4. Update part lookup index
5. Recalculate body capacities
6. Update speed from capacity
7. Deduct 1 turn cost

### Compatibility Rules

| Check | Behaviour |
|---|---|
| **Role match** | Part role must match slot role (arm part → arm slot). Hard requirement. |
| **Material compatibility** | Checked against species `compatibleWith` list. Mismatch → `rejected` status effect (timed detachment + bleeding). Attachment still succeeds. |
| **Size** | Compatible size required (TBD thresholds). |
| **Heart capacity** | Soft cap. Exceeding it applies performance penalties. Never prevents attachment. |

### Player Interaction — Attach

1. Player drags a part from the inventory panel toward the body panel
2. Body panel highlights the appropriate slot(s) for the part's role:
   - If an empty blueprint slot exists for that role → slot glows
   - If all slots are full → a phantom slot appears in the role's region (existing parts animate apart to make room)
3. Player drops anywhere on the body panel → part attaches to the highlighted/phantom slot
4. **Double-click shortcut**: double-click a part in inventory → auto-attaches to best available slot
5. Turn cost: 1 turn

## Detach Mechanic

Same controls in reverse.

1. Player drags a part off the body panel → part detaches, appears in inventory or drops to floor
2. **Double-click shortcut**: double-click a part on the body panel → detaches
3. No item requirement for detachment (blade requirement deferred)
4. Turn cost: 1 turn
5. Wound effects apply per the body system (bleeding on severance for organic parts)

---

## Inspection

The body panel can display any creature's body, not just the player's.

| Target | Access |
|---|---|
| **Player** | Press `B` at any time |
| **Dead body** | Stand adjacent/on tile → right-click → "Inspect" from context menu |
| **Any creature (sandbox)** | Right-click → "Inspect" in sandbox mode |

### Right-Click Context Menu

A right-click on an adjacent or same-tile entity opens a context menu. "Inspect" is one action; the menu is extensible for future actions (loot, talk, shove, etc.).

---

## Scope Summary

| Deliverable | Description |
|---|---|
| **Window system** | Generic draggable panel component. Refit existing inventory panel. |
| **Body panel** | Two-layer diagram, curved layout, 5 templates, silhouette icons |
| **Layout algorithm** | Template selection from `locomotionBaseline`, flex distribution on curve, animated transitions |
| **Silhouette icons** | One per role as placeholder art |
| **Tooltip component** | Shared horizontal tooltip for body and inventory hover |
| **`attachPart`** | ECS function, compatibility checks, capacity updates |
| **Drag-and-drop** | Inventory ↔ body panel, slot highlighting, phantom slots, double-click shortcut |
| **Context menu** | Right-click on adjacent entities, "Inspect" action |

### Deferred (not in scope)

| Item | Reason |
|---|---|
| Modular creature rendering (Task B) | Separate art/asset pass. Silhouette icons are the placeholder. |
| Blade requirement for amputation | Deferred for testing. Detach is unrestricted for now. |
| Window position persistence | No UI config system yet. Positions reset on open. |
| Resize / snap / dock | Not needed yet. |

---

*v1.0 — 2026-04-03*
