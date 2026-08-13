---
name: Mobile horizontal overflow
description: Why pages sideways-scroll on phones and how the app guards against it
---
CSS makes `overflow-y: auto` force `overflow-x` to auto too, so any wide child (long addresses, native date/time inputs with min-content width, grid children defaulting to min-width:auto) makes a page-level scroll container scroll sideways — an outer shell-level `overflow-x-clip` cannot stop it.

**Why:** wide content inside per-page scrollers caused sideways scrolling on phones.

**How to apply:** page scrollers must pair `overflow-y-auto` with `overflow-x-hidden`; give grid/flex columns `min-w-0`; give native date/time inputs `min-w-0 w-full`.
