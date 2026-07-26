---
version: 1
slug: "src-routes-page-svelte"
primary_target: "src/routes/+page.svelte"
related_targets: ["src/App.svelte"]
---

# Surface brief — memory board (src/routes/+page.svelte)

- **Mode:** Operate. The owner captures memories in seconds and revisits/re-clusters the pile daily.
- **Audience:** a single private user (the owner), at a desk, in daylight.
- **Job / action:** see the pile → capture via one always-visible button → AI review → the card lands in its cluster. Navigation happens on the canvas and via the minimap.
- **Chosen direction:** The Specimen Cabinet (roll key 41a4062b, user-confirmed over the fused Miura-sheet challenger). Canvas = archival drawer sheet; cards = neutral specimen slips; tag color lives on typed labels and on the minimap's split-color index; one theme ink derives the palette.
- **Memorable moment:** the app reopens at the exact canvas position the owner left.
- **Constraints:** no topbar (floating controls only); no theme switcher (single `--theme-ink`); minimap must show all primary tag colors per card; capture must never slow down.
- **Unresolved:** manual drag placement is provisionally allowed (PRODUCT.md open decision — do not deepen it); tag-color-on-labels replaces card fills as an experiment the owner may revert.
