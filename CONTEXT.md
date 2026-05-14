# Saiyan — context note for new chat

## What this is
In-browser generative art editor for Automattic's Radical Speed Month
(Marko Ivanović, Nebojša Jurcić, 2026). Single page app: left rail
(Text/Graphic/Brand/Export/Info), middle controls panel, right canvas.
7 brand presets + Custom mode.

## Project layout
```
saiyan/
├── index.html            single-file app shell + registry + runtime
├── fonts.css             @font-face declarations for brand fonts
├── fonts/                local font files (.woff2)
└── effects/text/
    ├── drumroll.js       per-letter scale+rotation pulses
    ├── tessellate.js     grid with traveling-wave size pattern
    ├── stack.js          frames stacked behind each other, z-order sweep
    ├── breathe.js        variable-font weight breathing in a grid
    ├── repel.js          opentype.js particle field, cursor repel
    └── gravity.js        matter.js letter physics, auto-loop
```

## Current state of each effect — STABLE
All 6 are working. None need rewrites; only polish if requested.

### Drumroll, Tessellate, Stack
Untouched recently. Working.

### Breathe
- Async / Sync / Hover presets
- Rows + Columns sliders (1-16)
- Speed slider, Invert checkbox
- Self-contained font registry: Inter (everywhere) + Jost / Fraunces /
  Bricolage Grotesque / JetBrains Mono (Custom mode only)
- Loaded via separate Google Fonts CSS link in <head>
- Layout uses binary-search-for-fit on both axes (horizontal AND vertical)
  so no row collisions even at single-column-multi-row

### Repel
- opentype.js loads Inter 900, samples glyph paths into particles
- Cursor:none scoped to host (not body) so it doesn't leak

### Gravity
- matter.js bodies, settle detection, hold-then-redrop
- Mouse drag interaction
- Hooked into FONT_CATALOG for font picking

## App-level systems (don't touch unless asked)
- Aspect ratio overlay + selector
- Fullscreen mode (X-with-circle cursor, click-to-exit)
- Export: PNG / MP4 / WebM / GIF
- Color system: brand palette popover for brand mode, native picker for
  Custom; mixed mode for slots beyond brand palette length
- Font system: FONT_CATALOG single source of truth for most effects;
  Breathe maintains its own list

## Where things stood at end of last session
User reported breathing async mode lags at 9×3 grids and up. Tried
weight bucketing optimization — visual got worse, reverted. Lag
hypothesized to be variable-font weight resolution cost in canvas, but
not confirmed. User accepted current behavior (per-cell font set,
continuous integer weights).

## Pending discussion / next up
- User wants tighter row/column spacing in Breathe — "much closer,
  minimum spacing, like 10px". Currently uses fractional MARGIN_RATIO
  (0.06), GUTTER_RATIO (0.04), ROW_GAP_RATIO (0.25). User wants to
  switch to absolute pixel values or much smaller fractions. NOT YET
  DONE.

## Stylistic notes for collaborator
- User wants ULTRA simple solutions
- Vector quality non-negotiable for export
- Don't invent new behavior; ask first if unclear
- 6 effects is the current set; not adding more unless user asks
