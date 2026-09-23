# SpriteCutter

A browser tool that cuts sprite sheets — including messy ones from image
generators — into clean, uniformly sized, named sprites.

## Stack

- Vue 3 + TypeScript + Vite
- Vuetify 4 (UI components)
- Pinia (state management)
- VueUse (composables)
- Tailwind CSS v4 (utilities)
- Canvas API (rendering and pixel processing)

## Features

**Finding sprites**

- Object detection for irregular sheets: rows of different lengths, sprites of
  different sizes, read back in row order
- Background detection from the sheet border: transparent, solid colour, or a
  fake "transparency" checkerboard; adjustable tolerance and colour picker
- Sparkles and detached bits attach to the nearest sprite; dust is dropped
- Uniform grid method for classic sheets; picked automatically when drawn grid
  lines glue a sheet together

**Cleaning and sizing**

- Background removal with edge de-fringing (no white halo)
- Parts of neighbouring sprites that poke into a sprite's box are cut out
- Trim, centre or bottom-align in one common frame; keep original pixels, fit
  every sprite to the frame, or use one shared scale

**Names from any text**

- Paste a plain list, JSON, a markdown table, CSV/TSV, "name — description"
  lines, YAML-style blocks or XML attributes; names are applied in order
- Type the name of any one sprite as a keyword and the extractor picks the
  column / field / part of the cell that holds it (file name from a path, last
  segment of `A → B → C`, text before a bracket, bold text)
- Preview with thumbnails, shift, and "pin this name to the selected sprite"

**Editing**

- Click / Shift-click / marquee selection, move and resize boxes, draw new
  boxes (they snap to the sprite under them), merge, delete, undo/redo
- Paste an image or text with Ctrl+V anywhere, or drop files on the page

**Export**

- ZIP of individual PNG/WebP files, a packed sheet (keeping source rows or as a
  grid), and a TexturePacker JSON Hash atlas with animations — or all at once

## Development

```bash
yarn install
yarn dev
```

## Build

```bash
yarn build
```
