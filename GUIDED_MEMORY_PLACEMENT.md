# Guided Memory Placement

## Goal

Creating a memory should capture enough context to place it meaningfully without making the user manually tidy the canvas every time.

## Flow

1. **New Memory** opens a dialog for the title, memory text, areas, and topics.
2. Existing memories are scored by shared areas and topics.
3. A unique best match with at least two shared values places the new memory automatically beside it.
4. Weaker or tied matches are offered as placement choices.
5. **In open space** is always available and is the fallback when nothing matches.

## First implementation

There is no explicit cluster model yet. The first version treats a related existing memory as a cluster anchor, then scans for an unoccupied position beside it. This is deterministic, local-only, and uses the metadata already stored on every memory.

## Later, if needed

- Detect geometric clusters rather than using one memory as an anchor.
- Learn the confidence threshold from real usage.
- Preview the proposed position on the canvas before creating the memory.
- Replace the grid scan if large boards make it noticeably slow.
