# Altoids Pick Insert Configurator

Design a slanted guitar-pick comb that drops into a classic Altoids tin.
Built as a TanStack Start app with OpenSCAD WASM rendering and a WebMCP
tool surface so an agent can edit the slot list, render, and export an
STL or a two-filament 3MF.

## What you configure

The only design inputs are the **slots**: each slot is a pick shape plus
that pick’s thickness in mm. Shapes:

| Name | Size (mm) | Note |
|------|-----------|------|
| `teardrop` | 26 × 30 | Fits the default 45° comb |
| `butterfly` | 25 × 29 | Fits the default 45° comb |
| `diamond` | 20 × 25 | Fits the default 45° comb |
| `rounded_triangle` | 29 × 28 | Steepens lean to clear the lid |
| `triangle` | 30 × 30 | Steepens lean to clear the lid |

Add or remove slots (up to 16). If they won’t fit the tin, OpenSCAD’s
assert messages surface as a friendly “Does not fit” banner.

Optional preview toggles draw translucent picks and the tin outline in
the 3D view. **Export STL** always re-renders with those flags off so
the file is printable.

## Two-filament export

**Export 3MF** writes the insert as two parts rather than one solid: the
slotted **comb** down the middle, and the **tray** that surrounds it —
floor, wall, and thumb scallop. They share coincident faces and no
volume, so their union is exactly the one-piece STL; the point is only
that a slicer can hand each one a different filament.

On opening the file, PrusaSlicer / Orca / Bambu Studio will ask whether
to load it as a single object with multiple parts. Say yes, then assign
a filament per part.

The 3MF is assembled by the app ([`src/model/three-mf.ts`](src/model/three-mf.ts)),
not by OpenSCAD: the WASM builds are compiled without the 3MF exporter,
and answer a request for one with `Export to 3MF format was not enabled
when building the application`, exit code 0, and a zero-byte file. So
each part is rendered to OFF — an indexed mesh, unlike STL — and the two
are packed into one 3MF with a base material each. A desktop OpenSCAD
can do it in one shot instead:

```bash
openscad -o insert.3mf --enable=lazy-union -D 'part="split"' \
    src/model/altoids_pick_insert.scad
```

## Run it

```bash
pnpm install
pnpm dev
# open http://localhost:3000
```

The model sources live in `src/model/` and are bundled via Vite `?raw`
imports — no URL loading or Code tab.

## WebMCP tools

Registered on `navigator.modelContext` via `@mcp-b/global`:

| Tool | Purpose |
|------|---------|
| `get_design` | Slots, project name, render/fit status |
| `list_pick_types` | The five shapes + thickness limits |
| `set_slots` / `add_slot` / `remove_slot` / `update_slot` | Edit the comb |
| `set_all_thickness` / `reset_design` | Bulk edits |
| `render` / `get_render_status` | Force render / read status + fit |
| `export_stl` | Base64 STL (preview geometry off) |
| `export_3mf` | Base64 two-part 3MF (comb + tray) |
| `get_project_name` / `set_project_name` | Export filename |
| `get_history` | Recent actions |

### Connect a client

**MCP-B Chrome extension:** install from the Chrome Web Store, open
`http://localhost:3000`, and use the extension’s Tools tab.

**Local relay:** the page embeds `@mcp-b/webmcp-local-relay`; point
Claude Desktop / Cursor at that stdio server as documented by MCP-B.

## Stack

- **TanStack Start** (Vite + Nitro)
- **TanStack Store** — design state (`slots`, render, fit, history)
- **Official OpenSCAD playground WASM** (`src/vendor/openscad/`) — Manifold backend in a Web Worker
- **react-three-fiber** + **three** — STL preview
- **@mcp-b/global** — WebMCP runtime

## Model files

- [`src/model/altoids_pick_insert.scad`](src/model/altoids_pick_insert.scad) — the insert
- [`src/model/pick_profiles.scad`](src/model/pick_profiles.scad) — normalized pick outlines

The worker writes both into its virtual filesystem so
`include <pick_profiles.scad>` resolves. The bundled source is a fixed
asset; each render rewrites the `slots` array, `preview_picks`, and
`part` into a copy of it ([`src/model/apply-design.ts`](src/model/apply-design.ts)),
because `-D` is unreliable for nested string/number lists.
