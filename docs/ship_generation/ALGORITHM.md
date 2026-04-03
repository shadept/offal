# **Graph-Based Procedural Spaceship Generation Algorithm**

**Target Architecture:** Grid-based Roguelike

## **1\. Overview**

The algorithm generates spaceships using a graph-based, collision-aware growth model. Instead of relying on BSP (Binary Space Partitioning) or cellular automata, it uses a **seed-growth approach**. The ship is a Graph where **Nodes** are physical rooms (with spatial coordinates and dimensions) and **Edges** are traversal connections (doors, corridors, or teleporters).

The generation is entirely data-driven, defined by two major input vectors:

1. **Ship Class (Size & Purpose):** Dictates the *Deck Manifest* (what rooms exist, how many, and their sizes).  
2. **Architecture (Species/Culture):** Dictates the *Layout Algorithm* (how rooms attach to each other), aesthetic properties, and post-processing behaviors.

## **2\. Core Data Structures & Mechanics**

### **Nodes (Rooms)**

Each node represents a distinct module.

* id: Unique integer.  
* type: Functional category (Corridor, Cargo, Weapons, Quarters, etc.).  
* x, y, w, h: Spatial data. (For a grid-based roguelike, treat x, y as center coordinates and w, h as tile dimensions).  
* dir: Direction facing (N, S, E, W). Crucial for external modules like engines or turrets.

### **Edges (Connections)**

* source, target: Node IDs.  
* type: physical (adjacent doors) or teleport (non-adjacent spatial jumps).

### **Core Action: tryAttach(parent, config, direction)**

The fundamental building block of the algorithm.

1. Takes a parent node and a target direction (N, S, E, W).  
2. Calculates the prospective x, y for the new room so it sits flush against the parent's edge.  
3. Performs **AABB (Axis-Aligned Bounding Box) Collision Detection** against all existing nodes.  
4. If free, adds the Node and creates an Edge back to the parent.  
5. If blocked, returns null (allowing the layout algorithm to try another node or direction).

## **3\. The Generation Pipeline**

### **Step 1: Deck Manifest Generation**

Based on the Ship Class (e.g., Scout, Transport, Dreadnought), the algorithm rolls to determine the exact payload of the ship.

* **Scale Limits:** Calculates sizes (e.g., "Tiny" ships cap room width/height at 2-4 tiles; "Massive" ships scale them to 8-14 tiles).  
* **Room Pools:** Pulls from a class-specific dictionary specifying \[min, max\] counts for specific rooms. For instance, a Mining ship rolls heavily for Refineries and Drills, while a Prison ship rolls for Cells and Security.  
* *Output:* A shuffled array of room types to place, and an integer count for corridors and engines.

### **Step 2: Seed Placement**

* A Bridge (Command) node is always placed at (0, 0\) facing North (N). Its size is scaled based on the Ship Class.

### **Step 3: Layout Growth (The Architecture Phase)**

The algorithm drains the Deck Manifest array using one of five distinct topological algorithms, based on the chosen Architecture.

#### **A. SPINE (Human)**

* **Phase 1:** Forcibly builds a straight line of Corridor nodes straight South (S) from the bridge. This forms the main spine.  
* **Phase 2:** Iterates through the remaining rooms. For each room, it picks a random node on the spine. It has a high probability (e.g., 30%) to force **Symmetry** (calling tryAttach on both East and West simultaneously). If symmetry fails or isn't rolled, it tries a random flush direction.

#### **B. RADIAL (Alien)**

* **Goal:** Dense circular packing.  
* Pops a room from the manifest. Scans *every* valid attachment point on *every* currently placed node across all 4 directions.  
* Calculates the Euclidean distance from the prospective coordinate (nx, ny) to the Bridge (0, 0).  
* Selects the valid attachment point that yields the **lowest possible distance** to the center. This mathematically forces a saucer/sphere shape.

#### **C. SEGMENTED (Insectoid)**

* **Goal:** Distinct clusters (Head, Thorax, Abdomen).  
* Splits the manifest into 1 to 3 equal chunks depending on the total room count.  
* Builds Chunk 1 using random attachments, but with a heavy mathematical bias against expanding North/South to force lateral growth.  
* Finds the southernmost node of Chunk 1, attaches a very long, thin corridor (Segment Link), and places a Hub node at the end.  
* Repeats the cluster growth process starting from the new Hub for Chunk 2, etc.

#### **D. SCAFFOLD (Industrial)**

* **Goal:** Chaotic, sprawling webs.  
* **Phase 1:** Injects a massive amount of extra Corridor nodes into the pool. Builds a wandering, branching maze of corridors first by attaching them to random existing corridors.  
* **Phase 2:** Takes the functional rooms (cargo, etc.) and attaches them only to the outer edges of this massive corridor scaffold.

#### **E. FLOATING (Monolithic / Protoss)**

* **Goal:** Disjointed islands.  
* Bypasses tryAttach. Uses a unique tryPlaceFloating function.  
* Places rooms at a strict distance buffer (e.g., 3 to 7 tiles away) from the parent node.  
* Connects them using teleport edges instead of physical edges.

### **Step 4: Engine Placement**

1. Filters all nodes to find the southernmost cluster (highest y coordinates), excluding existing engines/weapons.  
2. Iterates through these nodes, calling tryAttach specifically aiming South (S).  
3. *(Optional based on Architecture):* If attached to a central spine, forces symmetry to place twin engines.

### **Step 5: Post-Processing & Mutations**

#### **A. Weapon Line-of-Sight (LOS) Raycasting**

Weapons require context to make sense (turrets belong outside, missile silos inside).

1. Algorithm scans every generated Weapons node.  
2. Projects a bounding-box raycast infinitely in all 4 directions (N, S, E, W).  
3. If a ray hits another node, that direction is "blocked".  
4. **Mutation Check:**  
   * If ![][image1] direction is unblocked: The room is adjacent to space. It is mutated into an **Exterior Weapon** (e.g., "Turret", "Bio-Artillery"). Its dir is set to point into the void.  
   * If 0 directions are unblocked: The room is trapped inside the hull. It is mutated into an **Interior Weapon** (e.g., "Missile Bay", "Torpedo Tube").

#### **B. Cross-Connection (Loop Generation)**

Tree-based generation results in dead-ends. A ship needs to be a navigable labyrinth.

1. Iterates through all pairs of nodes (n1, n2).  
2. Filters out exterior modules (Engines, Turrets).  
3. Checks spatial adjacency: Do their bounding boxes touch? (e.g., touchX or touchY distance is ![][image2]).  
4. If they touch physically but do not share an edge in the Graph, rolls against the Architecture's crossProb (e.g., 85% for Industrial, 25% for Human).  
5. If successful, pushes a new physical edge connecting them.

### **Step 6: Hull Generation (Visual / Grid Masking)**

To wrap the rooms in a contiguous hull:

1. The algorithm performs a "Double-Fill" pass.  
2. For every internal room, it calculates an expanded bounding box (padding out by ![][image3] tiles).  
3. It mathematically unites these expanded boxes. In a grid-based game, this translates to doing a Flood Fill or drawing a filled rectangle of "Hull Wall" tiles, and then drawing the actual "Interior Floor" tiles inside them, naturally creating thick exterior walls and seamlessly merging adjacent rooms.

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAZCAYAAABQDyyRAAABS0lEQVR4XmNgGAWjgPaAWU5OLkwBCNAl4EBeXt4RiE8A1UQYGxuzosuTCmRkZDiBlvoCzZsINPcpEH8F8o3R1aEAkCagwiQgvgDEyeLi4tzoaogFULM8gQ5wAFpcT5QDYAAUAqCQAGo6A8Q1KioqfOhqSAFAi8tJcgASYAZqdALiw0DcLS0tLYyugBhAiQNggBEYIuZAQ/YD8RQglkRXgA9QwwFgAIwKdqAhdUDDngDjWAVdHheg2AHIiRNoSD6piZNsB4AsAlkI1HyOkuxJsgNAqR6ooUYeUi74A4WY0dWQAoh2AChxQRPZfiC2YqDQYhggygFASR8g3qioqKgH5DKiy1MCoA74Jisra4ouRzMATT8rgBa/A+L/SPgZEPehqx94AErhwOAXh6YDvFhZWVmMgUrpAw6Aqd0AaPgsInEvyCHoZoyCUTBkAQC29WAB30IXngAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAZCAYAAABQDyyRAAABvklEQVR4Xu2Vv0vDQBzFU0RQFEWkBtumaX6A4FSo4C7iqKIOouBfIHRzchDEQcXFUXBwcHIWBR2KLmLB0cXBRXAXHAU/X0zkPJPYBjoIefBo+u7dfd/3klwMI0OGDsJxnDHbtvfgEVwplUq9uqdl+L4/wCKblUrlxrIsTx/XgXcRPuKv5vP5fq634ZXruoO6NxHFYnGYifvwFk4hdekeHYVCwcL7BFdDrVwuD/G/CddVbywwOvBYOoaTSDndEwcpDN8pWlPkHNopbMiOKPpPBPftTMgC40YbhUMw9zAigEEjJ+iv6K6qC3LSJYMX0rV0rxvaQVAoLsAvXQbmGHiDC0aKjlUED1wjqlBsAEGahy0Kpmn2Mf86qlBigBDh6wbvZGeMFEHiCsXpkZBOMNaZ8MDvWjuHCHN2ogoFAV7Y7ZKqJ6JWq3UzcTkIUpdgukcHB9Us/g/806HGGj1o50K5Vv2toktuCYteshu+PqhCnie893Ar1GSOdC/NKNbOgV2YoOAzgTfgEtdNiu/KjurejkFuF0FmKDwvx7M+/g1JxQloknL0L3qeN2KkeDMSQcKq/fXJbIUHEkRfI0OGf4tPNyt6eFPJdEgAAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAaCAYAAABVX2cEAAABM0lEQVR4XmNgGAUUATk5OS15efk7QPwfCX+TlZW1BckD2ZPR5O4rKSmpoZuDAoCKLIH4JxDfBmJJmLiKigo7kL8eaGm9uLg4N7IenEBGRoYTqGEHUOM/BQUFD6gwI5BfCsIgNrJ6ggBoSATUK8uNjY1ZoQZ1g9joagkCRUVFcaDm60D8HoibgXgyWQbBANCAVpDrgK48BAxofnR5kgDQIC9QuAHxCYoMAxqgCcT7gBFxC2QgUkSQBoDhJQ80ZCMwVlWQIwIoxYKuFi8AeQdowCqggWYgPnJEABOvDrp6nABkEFDTOiD2RhYHGt4AjYgGZHGcAKhYEeQ1oIZCdDmguA1Q/jdQ7pS0tLQwujwcABXGAhX+goYLCP8FavKHyQP5WSAxZHmgnp3A8BRCNmcUjIIhCQBFAlXpFEdzGQAAAABJRU5ErkJggg==>