---
name: Mobile horizontal overflow
description: Why pages sideways-scroll on phones and how the app guards against it
---
Each page has its own scroll container (`flex-1 overflow-y-auto`). CSS makes `overflow-y: auto` force `overflow-x` to auto too, so any wide child (long Nominatim addresses, native iOS date/time inputs with min-content width, grid children defaulting to min-width:auto) makes that page scroll sideways — the shell-level `overflow-x-clip` cannot stop it.

**Why:** long map addresses from location search stretched the Home "Up Next" card sideways on phones (July 2026).

**How to apply:** every page scroller must be `overflow-y-auto overflow-x-hidden` (all pages patched); give grid/flex columns `min-w-0`; give native date/time inputs `min-w-0 w-full`.
