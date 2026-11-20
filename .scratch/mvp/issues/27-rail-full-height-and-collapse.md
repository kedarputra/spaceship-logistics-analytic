# 27: The rail: full height, and collapsible to icons

**What to build:** The rail stays in view at the window's full height while the page scrolls beside it, and it can collapse to icons.

Today the shell is a flex row with `min-h-screen` and `items-stretch` (`src/components/app-shell.tsx`), so the rail is as tall as the page. Seen on the live site on 21 Nov 2026: on `/delivery`, opening the on-time chart's Data table makes the page longer, and the rail's Data and AI card slides down off screen with it.

**Blocked by:** 25
_25 Redesign: the Delivery, Carriers and Forecast pages_

**Status:** ready-for-agent

- [ ] **Full height.**
  - Where the rail sits beside the page, it is `sticky` at the top with the window's height (`h-dvh`). The page scrolls; the rail does not.
  - If the window is too short for the rail's contents, the rail scrolls on its own.
  - The Data and AI card always sits at the bottom of the window, whatever the page's length or an open Data table.
  - Where the rail stacks above the page on narrow screens, nothing changes and it is not sticky.
- [ ] **Collapse.**
  - A button at the top of the rail, beside the product name, switches between two states:
    - **Expanded:** 232 px, as today.
    - **Collapsed:** about 64 px, with the product mark, the menu icons, and the AI status dot.
  - **When collapsed:**
    - Each icon's accessible name is its page name, and a tooltip shows it on hover and on keyboard focus.
    - The current page keeps its amber marker.
    - The Data card shrinks to the AI status dot. Its tooltip gives the status, the model name and the data file.
  - **The button:** `aria-expanded`, `aria-controls`, an accessible name of "Collapse menu" or "Expand menu", and an icon that points the way it will move.
  - **The choice is kept per viewer** (a cookie or localStorage) and applied before the first paint: no flash of the wrong width and no layout shift on load.
  - **The width change** animates in about 150 ms, and not at all under `prefers-reduced-motion`.
  - **The page** takes the freed width, up to its existing 1200 px maximum.
  - Only on layouts where the rail sits beside the page; no collapse button when it stacks above.
- [ ] **Tests.**
  - Collapsed, every menu item still has its page name as its accessible name, and the current page is still marked.
  - The choice survives a reload.
  - `npm run check` passes.
  - In headless Edge:
    - At 1280 px on `/delivery`, with a Data table open and the page scrolled to the bottom, the rail fills the window and the Data card is visible.
    - Also at 1280 px, collapsed and expanded, on all five pages.
    - At 320 px, the layout is as before.

## Comments
