# Guided Memory Placement

## Current behavior

After saving a new card, open the full-board reorganization preview, including the new card and all existing active cards. Existing cards can move as the new content reshapes the board. The owner applies or cancels the layout; creation does not automatically persist the reorganization. If every position already matches the layout, report that the board is already organized.

Before saving, place the new card in a collision-free slot near its most similar card, using weighted Jaccard similarity across normalized tags and topics. Topics have twice the weight of broad tags. This initial placement preserves existing positions so canceling the subsequent preview leaves the new card safely placed.

**Reorganize** opens the same deterministic layout manually. Complete-link grouping requires every pair within a group to have at least 0.25 similarity, keeping bridge cards from joining unrelated groups. Groups are packed into compact islands, with card gaps starting at 24px and increasing as cohesion falls; separate islands have a 160px gap.

Cancel restores the pre-preview positions and viewport while retaining a newly saved card. Apply persists only changed positions; failed persistence restores the confirmed board. Archived cards do not participate.

Placement runs client-side in `src/lib/cluster-layout.ts`; `src/App.svelte` coordinates creation, preview, cancellation, and persistence. Svelte Flow measurements are used when available, with a 320×220 fallback.

## Future direction

Move placement primarily into the AI backend, with the owner steering organization through preferences. This is a direction to explore; the current layout is deterministic and client-side.
