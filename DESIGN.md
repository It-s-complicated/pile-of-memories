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
    lineHeight: 1.3
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
rounded:
  label: "2px"
  card: "3px"
  dialog: "4px"
  fab: "50%"
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
  specimen-slip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "0.9rem 1.1rem 1rem"
  tag-primary:
    backgroundColor: "oklch(0.46 0.09 <hue>)"
    textColor: "{colors.paper}"
    rounded: "{rounded.label}"
    padding: "0.4rem 0.5rem"
  tag-topic:
    backgroundColor: "{colors.paper}"
    textColor: "oklch(0.44 0.08 <hue>)"
    rounded: "{rounded.label}"
    padding: "0.4rem 0.5rem"
  input-field:
    backgroundColor: "#ffffff"
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

## Colors

Restrained: archival paper neutrals plus one theme ink, everything derived.

### Primary

- **Archive Ink** (`--theme-ink`, oklch(0.44 0.06 168)): the single source of
  the palette. Owns the capture FAB, primary buttons, focus and selection
  states, links, and control icons. Change this one custom property to
  re-theme the whole app.

### Neutral

- **Paper** (`--paper`): slip and dialog surfaces, minimap ground.
- **Sheet** (`--sheet`): the canvas ground, one step deeper than paper so
  slips lift.
- **Text** (`--text`): near-black with a breath of ink (13.9:1 on paper).
- **Muted** (`--muted`): typed metadata — accession numbers, kickers, field
  labels (7.2:1 on paper).
- **Hairline** (`--hairline`): 1px structure lines, input borders, the canvas
  grid (56px lines, Svelte Flow `Background`).
- **Ink Tint** (`--ink-tint`): hover wash on paper controls, code blocks.

### Semantic

- **Cabinet Red** (`--danger`, #a04032): permanent actions only — delete
  forever. Never decoration.

### Tag colors

A normalized OKLCH family — fixed lightness and chroma, hue per tag — so every
tag stays scannable while the pile sits calm. Primary tags: filled labels,
`oklch(0.46 0.09 <hue>)` with paper text. Topic tags: outlined typed labels,
`oklch(0.44 0.08 <hue>)`. Minimap segments: `oklch(0.62 0.1 <hue>)`. Hues live
in `src/lib/scene.ts`; unknown tags fall back to the theme ink.

### Named Rules

**The One Ink Rule.** Every chrome color derives from `--theme-ink` by
`color-mix`; no second accent hue enters the interface chrome. (Tag colors and
the destructive red are meaning, not chrome.)

**The Color-on-Labels Rule.** Tag color appears on labels, chips, and the
minimap index — never as a full card background fill.

## Typography

**Reading/UI face:** Archivo Variable (grotesque workhorse) — titles, body,
controls.
**Label face:** Cutive Mono (typewritten) — accession numbers, kickers, tag
labels, buttons on floating chrome, status text.

**Character:** a catalog card typed on a museum label maker, annotated in a
modern grotesque.

### Hierarchy

- **Title** (600, 1.05rem, −0.01em): slip titles, dialog headings.
- **Body** (400, 0.86rem, 1.5): Markdown card bodies; dialogs may go to 1rem.
- **Label** (400, 0.64–0.68rem, +0.08–0.18em, uppercase, Cutive Mono): all
  metadata — accession №, field labels, tags, chip buttons, status pill.

### Named Rules

**The Typed Label Rule.** Metadata is set in the mono face like a catalog
entry; prose is set in the grotesque. The mono is never used for body copy,
and the grotesque is never tracked out like a label.

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
- **Bottom-right:** the capture cluster — paper chips (Archive, Reorganize)
  beside the round inked FAB. Under 520px the chips stack above the FAB.
- **Top-center:** the status pill, only when there is something to say.

The app reopens at the exact spot the owner left: the world-space center and
zoom are persisted to localStorage on `moveend` (Zod-validated on read), so
the restore survives window-size changes. A first visit with no stored
viewport fits the cards once, floored at 0.8 zoom so they stay readable —
the minimap carries whole-board orientation. Dialogs are centered catalog
cards, max 34rem, on a dimmed sheet.

## Elevation & Depth

Structure is declared by 1px hairlines; elevation by one offset soft shadow —
never both on the same surface beyond a resting slip's hairline.

### Shadow Vocabulary

- **Slip** (`--shadow-slip`: 0 1px 2px + 0 6px 18px, ink at 14%/10%): resting
  cards and floating chrome.
- **Dialog** (`--shadow-dialog`: 0 24px 70px, ink at 30%): catalog dialogs
  above the dimmed sheet.

## Shapes

Near-square corners, archival card stock: 2px on labels and tag chips, 3px on
slips, inputs, and buttons, 4px on dialogs. The single round element in the
system is the capture FAB. Pills are banned everywhere else.

## Components

### Buttons

- **Shape:** near-square (3px); the FAB alone is round (3rem, ink).
- **Primary:** Archive Ink fill, Paper text (0.55rem 0.85rem); hover darkens
  to Ink Strong.
- **Secondary:** transparent, ink text and hairline border; hover Ink Tint wash.
- **Danger:** transparent, Cabinet Red text and border; hover 8% red wash.
- **Floating chips:** paper, hairline, shadow-slip, Cutive Mono uppercase —
  the quiet actions beside the FAB.

### Cards / Slips

- **Corner Style:** near-square (3px).
- **Background:** Paper with 1px Hairline; shadow-slip.
- **Selection:** border deepens to 65% ink; keyboard focus gets a 2px ink outline.
- **Anatomy:** accession `NO.` and updated date (typed, muted) → title
  (Archivo 600) → quiet typed Edit action → Markdown body (max 13rem,
  scrolls) → tag labels → links.

### Tags

- **Primary:** filled with the tag's family color, paper text, typed uppercase,
  with roomy label padding (0.4rem 0.5rem) and near-square corners (2px).
- **Topic:** paper ground, colored text and 55% colored hairline, typed
  uppercase, with the same label padding and corners.

### Inputs / Fields

- **Style:** white ground, hairline border, 3px, 0.65rem padding.
- **Focus:** 2px outline at 55% ink, offset 1px.
- Field labels are typed uppercase mono above the control.

### Navigation

The canvas and the drawer index (minimap) are the navigation. The minimap is
click-to-center; each node shows all of its primary tag colors as hard
vertical segments. There are no menus, tabs, or breadcrumbs.

### Dialogs

Centered catalog cards (4px, shadow-dialog) with a typed kicker
(`CAPTURE`, `REVIEW`, `EDIT MEMORY · № XXXX`), Archivo heading, and a sticky
footer of right-aligned buttons held above a hairline rule, so actions stay
visible when the form scrolls. Selected tags in the tag editor carry the same
filled-primary / outlined-topic color roles as card labels. Entrance: 160ms
fade-rise (cubic-bezier(0.16, 1, 0.3, 1)); disabled under
prefers-reduced-motion.

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
