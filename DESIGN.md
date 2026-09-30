---
name: Pile of Memories
description: A private spatial memory board — a quiet specimen cabinet for personal memories.
colors:
  theme-ink: "oklch(0.44 0.06 168)"
  paper: "color-mix(in oklch, #ffffff 96.5%, var(--theme-ink))"
  sheet: "color-mix(in oklch, #ffffff 90%, var(--theme-ink))"
  ink-strong: "color-mix(in oklch, var(--theme-ink) 82%, #000000)"
  text: "color-mix(in oklch, var(--theme-ink) 28%, #17181a)"
  muted: "color-mix(in oklch, var(--theme-ink) 42%, #4f5350)"
  hairline: "color-mix(in oklch, var(--theme-ink) 20%, var(--paper))"
  ink-tint: "color-mix(in oklch, var(--theme-ink) 9%, var(--paper))"
  danger: "#a04032"
typography:
  title:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Cutive Mono', ui-monospace, monospace"
    fontSize: "0.68rem"
    fontWeight: 400
    letterSpacing: "0.12em"
  reading:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  label: "2px"
  card: "3px"
  dialog: "4px"
  fab: "50%"
spacing:
  field-gap: "0.35rem"
  control-gap: "0.5rem"
  section-gap: "1rem"
  dialog-inset: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.theme-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "0.55rem 0.85rem"
  button-primary-hover:
    backgroundColor: "{colors.ink-strong}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.theme-ink}"
    rounded: "{rounded.card}"
    padding: "0.55rem 0.85rem"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.card}"
    padding: "0.55rem 0.85rem"
  fab-capture:
    backgroundColor: "{colors.theme-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.fab}"
    size: "3rem"
  chip-action:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "0.45rem 0.7rem"
  chip-mode-selected:
    backgroundColor: "{colors.theme-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.card}"
  specimen-slip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "0.9rem 1.1rem 1rem"
    width: "320px"
  tag-primary:
    backgroundColor: "var(--tag-color)"
    textColor: "{colors.paper}"
    rounded: "{rounded.label}"
    padding: "0.4rem 0.5rem"
  tag-topic:
    backgroundColor: "{colors.paper}"
    textColor: "var(--topic-color)"
    rounded: "{rounded.label}"
    padding: "0.4rem 0.5rem"
  input-field:
    backgroundColor: "#ffffff"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "0.65rem"
  input-list-sort:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "0.65rem"
---

# Design System: Pile of Memories

## Overview

**Creative North Star: "The Specimen Cabinet"**

The app is a natural-history drawer: the pile is a curated collection, and every
memory is a cataloged specimen slip on an archival sheet. The register is
museum-modern — hairline rules, typed catalog labels, near-black ink, one quiet
accent — never scrapbook-nostalgic (no washi tape, cork, or sentimentality) and
never productivity-SaaS (no topbar chrome, no dot grid, no blue).

Confirmed anti-references: productivity SaaS, cute/nostalgic scrapbook, dark
mode cave, anything that slows capture.

**Key Characteristics:**

- Canvas-first: the canvas is the app; there is no topbar, only floating controls.
- Cards are neutral archival slips; tag color lives on labels, not on card fills.
- One theme ink derives the entire UI palette via CSS `color-mix`.
- Typed mono labels carry metadata; a grotesque carries reading text.

Implementation sources: `src/styles.css` owns the global palette and chrome;
`src/components/MemoryNode.svelte`, `TagEditor.svelte`, and `MemoryListDialog.svelte`
own scoped component styles; `src/routes/+page.svelte` owns the access screen;
`src/lib/scene.ts` owns tag colors. Frontmatter records observed values, not a
new CSS token API. CSS custom properties in color values remain live dependencies;
tag components require the per-label property supplied by `scene.ts`.

## Colors

Restrained: archival paper neutrals plus one theme ink, everything derived.

### Primary

- **Archive Ink** (`--theme-ink`): the single source of
  the palette. Owns the capture FAB, primary buttons, focus and selection
  states, links, and control icons. Change this one custom property to
  re-theme the whole app.

### Neutral

- **Paper** (`--paper`): slip and dialog surfaces, minimap ground.
- **Sheet** (`--sheet`): the canvas ground, one step deeper than paper so
  slips lift.
- **Ink Strong** (`--ink-strong`): deeper primary hover fill and access heading ink.
- **Text** (`--text`): near-black with a breath of ink.
- **Muted** (`--muted`): typed metadata — dates, card kinds, kickers, field
  labels.
- **Hairline** (`--hairline`): 1px structure lines, input borders, the canvas
  grid (56px lines, Svelte Flow `Background`).
- **Ink Tint** (`--ink-tint`): hover wash on paper controls, code blocks.

### Semantic

- **Cabinet Red** (`--danger`): permanent deletion and error feedback, including
  alert text and alert borders. Never decoration.
- **Field White**: literal white used by capture/edit fields and the tag entry
  control; the list sort select uses Paper instead.

### Tag colors

A normalized OKLCH family — fixed lightness and chroma, hue per tag — so every
tag stays scannable while the pile sits calm. Primary tags: filled labels,
`oklch(0.46 0.09 <hue>)` with paper text. Topic tags: outlined typed labels,
`oklch(0.44 0.08 <hue>)`. Minimap segments: `oklch(0.62 0.1 <hue>)`. Hues live
in `src/lib/scene.ts`; unknown primary tags fall back to Archive Ink and unknown
topics to Muted. Minimap nodes show known primary-tag colors only; a node with
none uses `color-mix(in oklch, var(--muted) 45%, var(--paper))`.

### Named Rules

**The One Ink Rule.** Every chrome color derives from `--theme-ink` by
`color-mix`; no second accent hue enters the interface chrome. (Tag colors and
the semantic red are meaning, not chrome.)

**The Color-on-Labels Rule.** Tag color appears on labels, chips, and the
minimap index — never as a full card background fill.

## Typography

**Reading/UI face:** Archivo Variable (grotesque workhorse) — titles, body,
controls.
**Label face:** Cutive Mono (typewritten) — dates, card kinds, kickers, tag
labels, buttons on floating chrome, status text.

**Character:** a catalog card typed on a museum label maker, annotated in a
modern grotesque.

### Hierarchy

- **Title:** slip and memory read/edit headings use the frontmatter title role.
  Capture and list headings retain the browser's h2 size with weight 600 and
  −0.01em tracking; there is no global heading size or line-height reset.
- **Body:** compact Markdown in cards and the list uses the body role; list
  prose is capped at 75ch. The read dialog uses the larger reading role.
- **Label** (400, 0.64–0.68rem, +0.08–0.18em, uppercase, Cutive Mono): all
  metadata — dates, card kind, field labels, tags, chip buttons, status text.
  Dates and status copy preserve sentence case; uppercase applies to labels.
- **Access heading** (Archivo, 700, `clamp(1.8rem, 7vw, 2.8rem)`,
  line-height 1, −0.03em): the owner access screen only. Supporting text is
  0.95rem/1.55 and capped at 34ch; this is not a display scale for the board.

### Named Rules

**The Typed Label Rule.** Metadata is set in the mono face like a catalog
entry; prose is set in the grotesque. The mono is used for code as well as labels, never
for prose, and the grotesque is never tracked out like a label.

## Layout

The canvas owns the viewport edge to edge (`100dvh`). Chrome is floating:

A fixed hairline frame (1px, 42% ink, inset 0.6rem, radius 4px) runs around
the viewport — the drawer's inner edge. It carries no interaction.

- **Top-left:** the drawer plate — a small paper plaque (hairline, slip
  shadow) holding "PILE OF MEMORIES" in tracked mono with a count line
  (`n memories · n archived`). Non-interactive.
- **Bottom-left:** the drawer index (minimap, 220×160; 8.5×6.5rem under
  520px). Each card renders its primary tag colors as hard split segments via
  the MiniMap `nodeComponent`, framed by a 35% ink stroke.
- **Top-right:** zoom/fit controls.
- **Bottom-right:** the capture cluster — paper chips (Browse/Arrange, List,
  Archive, Reorganize) beside the round inked FAB. During reorganization,
  Cancel and Apply layout replace the list/archive/reorganize actions.
  At 520px and below the chips stack above the FAB.
- **Below the drawer plate:** Sign out and Export memories as floating chips.
- **Top-center:** a rectangular status notice, only when there is something to say.

The app reopens at the exact spot the owner left: the world-space center and
zoom are persisted to localStorage on `moveend` (Zod-validated on read), so
the restore survives window-size changes. Without a saved viewport, the board
keeps its initial translation (32px, 32px) at zoom 1; it does not auto-fit on
first visit. Zoom ranges from 0.1 to 1.5. The minimap and explicit fit control
carry whole-board orientation.

Dialogs are centered catalog cards, `min(34rem, calc(100vw - 2rem))`, on a
dimmed sheet. The memory list expands to 68rem and viewport height minus 2rem;
at 640px and below it becomes an edge-to-edge, square-cornered sheet with
single-column controls and summaries. At 520px and below regular dialog
insets reduce from 1.25rem to 1rem and the minimap shrinks to 8.5×6.5rem.

Spacing is compact and component-specific, not a strict mathematical scale.
The frontmatter names recurring observed gaps and insets; preserve their roles.

The owner access screen centers a Paper slip on Sheet with the same fixed
hairline frame. Its slip is capped at 28rem with 2.25rem padding; at 520px and
below screen/slip padding reduces to 1.25rem/1.6rem.

## Elevation & Depth

Paper surfaces lift from the darker Sheet through tonal contrast, 1px
hairlines, and soft shadows. Cards and floating controls use the low slip
shadow; modal dialogs and the access slip use the stronger dialog shadow.

### Shadow Vocabulary

- **Slip** (`--shadow-slip`: 0 1px 2px + 0 6px 18px, ink at 14%/10%): resting
  cards and floating chrome.
- **Dialog** (`--shadow-dialog`: 0 24px 70px, ink at 30%): catalog dialogs
  above the dimmed sheet.

## Shapes

Near-square corners, archival card stock: 2px on labels and tag chips, 3px on
slips, inputs, and buttons, 4px on dialogs. The single round element in the
system is the capture FAB. Pills are banned everywhere else; the class named
`status-pill` is actually a 3px rectangle. The full-screen mobile list has
square corners and no outer border.

## Components

### Buttons

- **Shape:** near-square (3px); the FAB alone is round (3rem, ink).
- **Primary:** Archive Ink fill, Paper text (0.55rem 0.85rem); hover darkens
  to Ink Strong.
- **Secondary:** transparent, ink text and hairline border; hover Ink Tint wash.
- **Danger:** transparent, Cabinet Red text and border; hover 8% red wash.
- **Floating chips:** paper, hairline, shadow-slip, Cutive Mono uppercase —
  the quiet actions beside the FAB.
- **Selected mode:** Browse uses Archive Ink fill and Paper text via
  `aria-pressed="true"`; Arrange retains the Paper chip. The mode button is
  at least 44px tall. Coarse pointers also give chips and dialog buttons a
  44px minimum height.
- **Disabled:** action buttons use opacity 0.5 and a not-allowed cursor;
  hover fills apply only while enabled. Native focus remains on dialog
  action buttons and floating chrome; custom ink outlines exist on fields,
  list controls, and card/read targets. Do not remove visible focus.

### Cards / Slips

- **Corner Style:** near-square (3px).
- **Background:** Paper with 1px Hairline; shadow-slip.
- **Selection:** border deepens to 65% ink; keyboard focus gets a 2px ink outline.
- **Size:** 320px wide, minimum 180px tall; height follows content.
- **Anatomy:** an 18px line icon with typed Memory/Idea/Note kind →
  compact created and updated dates (`DD.MM.YY`, typed, muted) →
  title (Archivo 600) → quiet typed Edit action → Markdown body (max 13rem,
  scrolls) → tag labels → links.
- **Browse:** the full card opens a read dialog; inline Edit is hidden,
  body overflow is clipped, and inline body/links are inert so gestures pan
  the canvas. Arrange exposes Edit, body scrolling, and card dragging.

### Tags

- **Primary:** filled with the tag's family color, paper text, typed uppercase,
  with roomy label padding (0.4rem 0.5rem) and near-square corners (2px).
- **Topic:** paper ground, colored text and 55% colored hairline, typed
  uppercase, with the same label padding and corners.
- **Editor:** removable selected tags retain those color roles with tighter
  padding (0.15rem 0.3rem 0.15rem 0.45rem), a native datalist input, and Add.
- **List:** tags use 0.25rem 0.4rem padding and 0.65rem mono type.

### Inputs / Fields

- **Style:** white ground, hairline border, 3px, 0.65rem padding.
- **Focus:** 2px outline at 55% ink, offset 1px.
- Field labels are typed uppercase mono above the control.

### Navigation

The canvas and the drawer index (minimap) are the navigation. The minimap is
click-to-center; each node shows all of its primary tag colors as hard
vertical segments. A floating List chip opens a sortable/filterable catalog
dialog with Locate on board actions. Browse/Arrange is a pressed-state button,
not a tab bar. There are no navigation menus or breadcrumbs.

### Dialogs

Centered catalog cards (4px, shadow-dialog) with a typed kicker (`CAPTURE`,
`REVIEW`, `EDIT MEMORY`), Archivo heading, and a sticky footer of right-aligned
buttons held above a hairline rule, so actions stay visible when the form scrolls.
Selected tags in the tag editor carry the same
filled-primary / outlined-topic color roles as card labels. Entrance: 160ms
fade-rise (cubic-bezier(0.16, 1, 0.3, 1)); disabled under
prefers-reduced-motion.

### Memory list

A wide catalog with native sort/select and checkbox filters above
hairline-separated expandable rows. Titles and dates sit opposite right-aligned
tag labels; hover/open summaries receive Ink Tint. Expanded bodies use the
compact body role and a right-aligned Locate on board action. On mobile the
summary stacks, tags align left, and the list occupies the viewport.

### Owner access

A centered archival slip with a typed private-collection kicker, a large
Archivo title, short explanatory copy, and a full-width inked GitHub sign-in
button. The button uses mono uppercase type and a 2.8rem minimum height.
Errors use Cabinet Red; the note below uses muted mono. Keep this access
treatment consistent with the board's paper, ink, frame, and shadows.

## Do's and Don'ts

### Do:

- **Do** derive every chrome color from `--theme-ink` via `color-mix`.
- **Do** keep cards neutral; express tag identity through label color and the minimap split.
- **Do** keep capture one click away on the canvas at all times.
- **Do** set metadata in the typed mono face at small sizes (0.64–0.68rem).
- **Do** preserve the persisted viewport; the owner returns to their spot.

### Don't:

- **Don't** fill card backgrounds with tag colors (the sticky-note look).
- **Don't** add a topbar, sidebar, or any persistent chrome band.
- **Don't** use pill radii, dot grids, or a second accent hue in the chrome.
- **Don't** add a dark mode; the scene is a desk in daylight.
- **Don't** animate canvas content or add hover effects to slips; motion
  belongs to dialog entrances only.
