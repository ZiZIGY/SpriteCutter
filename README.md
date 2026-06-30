# SpriteCutter

A browser-based tool for slicing sprite sheets into individual frames.

## Stack

- Vue 3 + TypeScript + Vite
- Vuetify 4 (UI components)
- Pinia (state management)
- VueUse (composables)
- Tailwind CSS v4 (utilities)
- Canvas API (grid rendering)

## Features

- Load images by drag-and-drop or file dialog
- Uniform grid setup: cell size, edge offset, gap between cells
- Column/row count sync with cell size
- Click to select individual cells
- Offset mode — drag each cell's center point independently
- Pan (Space + LMB or middle mouse) and zoom
- Light and dark theme, persisted across sessions
- Export: individual sprites, packed sheet, full sheet without grid lines
- Atlas export in TexturePacker JSON Hash format (Phaser, PixiJS, Unity)

## Development

```bash
yarn install
yarn dev
```

## Build

```bash
yarn build
```
