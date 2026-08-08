# Guided Memory Placement

Memories sharing the same normalized, sorted union of areas and topics form a cluster. New memories join an exact cluster at the nearest collision-free position; new combinations are placed beside the cluster with the highest Jaccard similarity. Creation then opens the tag-proximity layout preview so the new memory can reshape the board.

**Reorganize clusters** opens the same deterministic two-dimensional force layout. Exact clusters use balanced grids with 24px card gaps. Jaccard similarity pulls overlapping tag sets closer, while the spacing target reaches 180px between unrelated cluster bounds. Collision resolution prevents overlaps at the required gap. Cancel keeps a newly created memory at its collision-free position while restoring the existing board. Apply persists only changed positions and restores the original layout if persistence fails.

Placement stays client-side. Svelte Flow measurements are used when available, with a 320×220 fallback.
