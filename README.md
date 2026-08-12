# PoE1 Skill Comparison

Live at https://nvljn.github.io/PoE1SkillComparison/

<img width="1908" height="896" alt="image" src="https://github.com/user-attachments/assets/e8a79980-2e82-41d3-bf96-64e76331162b" />


A spreadsheet-like tool for comparing Path of Exile 1 skills using data exported from Path of Building Community.

The point is to make it quick to eyeball skills and their potential. It is not meant to replace Path of Building or give a final answer about real build damage.

## Current state

Spells have had an early manual pass for mechanics such as hit counts, corpse damage, stages, overlaps, and unusual cast intervals. These settings are experimental and will keep changing.

Attacks currently use mostly raw exported values and still need a proper manual pass.

Click a skill name to open its settings. The info button shows the gem tooltip, opens PoE Wiki when clicked, and opens PoEDB when Shift-clicked.

Filters support skill names, descriptions, tags, and flags. Columns can be sorted, resized, or double-clicked to fit their contents. Skill settings are saved locally in the browser.

## Tech stack

- Vite
- React
- TypeScript
- TanStack Table

The finished app is static. There is no backend and no Lua parsing in the browser.

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Test

```bash
npm test
```

## Build

```bash
npm run build
```

## Exporting PoB data

The exporter reads the local PoE1 Path of Building data and generates the JSON used by the website.

```bash
npm run export:pob:damage
```

By default, this expects Path of Building Community to be in the neighboring `../Path of Building Community/` folder. Generated files are written to `data/generated/`.

## Notes

Default skill settings are estimates, not a full calculation engine. Enemy defences, ailments, realistic projectile overlap, and many skill-specific conditions are not fully modelled yet.
