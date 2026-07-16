# Guided Memory Placement

Memories sharing the same normalized, sorted union of areas and topics form a cluster. New memories join an exact cluster at the nearest collision-free position; new combinations are placed beside the cluster with the highest Jaccard similarity. Creation never moves existing memories, and separate cluster bounds keep a 640px gap.

**Reorganize clusters** is the only operation that moves existing memories as a group. It previews a deterministic three-column layout, orders neighboring clusters by similarity, and shelf-packs them with the same gap. Cancel restores the snapshot. Apply persists only changed positions and restores the original layout if persistence fails.

Placement stays client-side. Svelte Flow measurements are used when available, with a 320×220 fallback.
