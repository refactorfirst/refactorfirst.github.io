# CSS-Only Dark Mode — Implementation Plan

## Goals

1. Three-mode theme control — **light / dark / system** — with small images
   (icons) for each mode, on a sub-row below the top menu bar.
2. The control's right edge aligns with the menu bar's right content edge at
   every viewport (mirroring how the breadcrumb trail aligns with the menu's
   left edge).
3. All *theming* is pure CSS: custom properties + `prefers-color-scheme` +
   `:has()`. No JS adds classes, styles, or colors.
4. WCAG 2.2 AA in **both** palettes, enforced by the existing guard suite.

## Architecture

### Single source of truth: three radio inputs

`components/theme-toggle.jsx` (a Server Component — no state, no handlers)
renders three radios named `rf-theme` (`rf-theme-light`, `rf-theme-dark`,
`rf-theme-system`, with `system` `defaultChecked`), each wrapped in a labelled
icon pill (inline SVG: sun / moon / monitor). The toggle sits on the
**`.theme-bar` sub-row under `.menu-bar`**, inside `#top-menu`, right-aligned
with the menu bar's content edge.

Why radios: "one of three modes" is exactly a radio group, the checked state
is queryable from CSS (`:has(#id:checked)`), and switching requires zero JS.
Buttons + `aria-pressed` would need a script to do anything.

### Cascade design (app/globals.css)

```css
:root        { color-scheme: light;  /* light palette */ }
html:root    { /* mvp.css --color-* overrides, light */ }
:root:has(#rf-theme-dark:checked)      { color-scheme: dark; /* dark palette */ }
@media (prefers-color-scheme: dark) {
  :root:has(#rf-theme-system:checked)  { color-scheme: dark; /* same dark palette */ }
}
```

- **system + OS dark** → the media block applies (specificity (1,2,0) beats the
  base `:root` (0,1,0) regardless of load order — required because mvp.css is
  linked after the bundle).
- **explicit dark** → the `:has()` block applies at any OS setting.
- **explicit light** → neither dark block matches (the system radio is
  unchecked), so the base light palette wins even when the OS is dark.
- **OS theme flips while "system" is selected** → CSS re-evaluates live; no JS
  listener is ever needed. This is the key payoff of the radio + `:has()`
  design.

The dark declaration block is necessarily duplicated (one copy inside the
media query, one without — plain CSS has no mixins). A unit test compares the
two blocks byte-for-byte to prevent drift.

### mvp.css integration

mvp.css 1.15 is fully variable-driven (`--color-bg/-text/-bg-secondary/
-text-secondary/-link/-accent/-secondary-accent/-shadow/-table/-scrollbar`),
and its own dark support requires `:root[color-mode="user"]`, which we never
set. Both palettes therefore *redeclare mvp's variables*:

- Light redeclarations must survive mvp.css loading after the bundle, so they
  live on `html:root` (specificity (0,1,1) > mvp's `:root` (0,1,0)).
- Dark redeclarations live inside the (1,2,0) `:has()` blocks, which beat
  everything.

Inputs, blockquotes, `mark`, table headers, scrollbars etc. then follow the
theme with no per-element rules.

### Color roles (the one real refactor)

Today `--brand-color` serves two incompatible roles. Dark mode forces the
split because #2a6f97 as *text* on a dark page fails AA (3.3:1), while as a
*background* for white text it passes in both modes (5.5:1):

| Variable | Role | Light | Dark | Dark-mode check |
|---|---|---|---|---|
| `--brand-color` | accent **backgrounds** (CTA, hover fills) | #2a6f97 | #2a6f97 | white text 5.5:1 |
| `--link-color` (new) | accent **text** (links, wordmark, hero h1) | #2a6f97 | #6fb1d9 | 7.7:1 on dark bg |
| `--brand-accent` | hover bg + focus indicator | #1f5273 | #3178a6 | 3.8:1 on dark bg, 3.3:1 vs surface, 4.8:1 vs white |
| `--bg-color` / `--surface-color` | page / panels | #ffffff / #f5f8fa | #10161d / #1a2330 | — |
| `--text-color` / `--muted-color` | text | #1f2d3d / #5c6b7a | #e6edf3 / #9fb0c0 | 13:1 / 8:1 |
| `--border-color`, `--input-border`, `--card-bg` | chrome (was #dde4ea / #c6d2dc / #fff hardcoded) | as today | #2c3a4d / #5b7396 / #1a2330 | input border ≥3:1 vs surface |
| `--error-color` / `--success-color` | status text | #c0392b / #1e8449 | #f0928c / #5bbd8b | ~8:1 on dark bg |
| `--error-bg` / `--error-border` | error page panel | #fdf6f5 / #f0c6c0 | #2b1d1f / #7a4a48 | — |

All remaining hardcoded colors in globals.css (#dde4ea, #c6d2dc, #fff
surfaces, error-page pastels) are swept into these variables. The toast is
already dark-on-light and works unchanged in both modes.

### Report template (mustache) — untouched

`public/assets/refactor-first-report.mustache` stays **byte-identical**
(`tests/unit/report-template.test.js` asserts the served copy matches the
source, and the WCAG template guard asserts its literal hex colors). Its
light-only rules (popup `#fff` background, `.rf-page-btn` white buttons,
`.rf-page-btn:focus-visible` outline #1f5273) are restyled from globals.css
with `main#app`-prefixed selectors — specificity (1,1,1) beats the template's
injected `<style>` (0,1,0) regardless of load order — driven by theme
variables whose **light values equal the template's current hexes**, so a
single rule serves both modes with no duplication. Its brand-colored bits
(`thead` #2a6f97 + white text, table borders via `currentColor`) already work
on dark. Both copies (`assets/` + `public/assets/`) remain in sync trivially
since neither changes.

### Persistence — the one, flagged deviation

CSS cannot read `localStorage`; a strictly-CSS site loses an explicit choice
on every hard load (Next's client-side navigation preserves it — the layout
never remounts — but refresh/new tab resets). "Follow dark mode best
practices" and "only CSS" conflict here, so the plan resolves it as:

- **Switching, system-following and all colors: 100% CSS.** With JS disabled
  the toggle still works per page view and the OS preference still themes the
  site.
- **An ~8-line inline script** right after the header in `app/layout.jsx`
  restores `localStorage['rf-theme']` into the radios (parser-blocking, i.e.
  before first paint in practice) and saves the value on a delegated
  `change` listener. It sets the radio `checked` *property* (never the
  attribute), so React hydration is unaffected.
- `scripts/fix-csp-hashes.mjs` already hashes every inline script in the
  export, so the strict CSP keeps working with zero pipeline changes.

### Alignment with the menu

The toggle lives on a `.theme-bar` sub-row inside `#top-menu`, right after
`.menu-bar`, and pinned right via `justify-content: flex-end`. The row
reuses the breadcrumbs' exact alignment formula — `max-width:
var(--width-content)`, `box-sizing: border-box`, `margin: 0 auto`,
`padding: 0.2rem 0.8rem 0.45rem` (see `tests/unit/layout-styles.test.js` for
the breadcrumb invariant this mirrors) — so its right content edge is the
menu bar's right content edge at every viewport, with no positioning tricks
or magic numbers; the formula works identically at mobile widths, where the
sub-row simply follows the wrapped menu bar.

### Toggle UI / a11y

- Container: `<div role="radiogroup" aria-label="Color theme">` — three
  labelled, native radios (`aria-label` "Light theme" / "Dark theme" /
  "System preference"), each visually replaced by its icon pill via
  `appearance: none; position: absolute; inset: 0` (still keyboard-focusable;
  the checked input itself renders the brand pill).
- Each pill: 28×28px label (≥ 24px, SC 2.5.8), inline `stroke="currentColor"`
  SVG icon (`aria-hidden="true"` — the radio label carries the name).
- Selected state: `:checked` background on the input plus
  `:checked + svg` icon recolor. Focus: the global `:focus-visible` rule
  outlines the input (SC 2.4.7/2.4.11).
- `color-scheme` per palette + `<meta name="color-scheme" content="light dark">`
  for native controls, scrollbars and the pre-CSS canvas.
- No color-transition animation (instant switch; nothing for
  `prefers-reduced-motion` to suppress).

### Known limitation (documented, out of scope)

Chart.js / WASM canvases draw their own palettes into canvas bitmaps; CSS
cannot restyle them. Charts keep their existing colors (future work: read
CSS variables in `lib/report-view.js` at render time).

## Tests (TDD — written first, must fail before implementation)

1. `tests/integration/theme-toggle.test.jsx` — renders three `rf-theme`
   radios with system checked by default, labelled inputs, decorative icons,
   `radiogroup` with accessible name; header renders the toggle after the
   search box (alignment precondition).
2. `tests/unit/theme-css.test.js` — structural guards on globals.css:
   base light `:root` (+ `color-scheme: light`), dark `:has()` block
   (+ `color-scheme: dark`), media-wrapped system block, the two dark blocks
   **byte-identical**, `html:root` mvp overrides, no hardcoded light hex left
   in component rules; dark palette contrast pairs computed the same way
   `css-a11y.test.js` does (bg/text, muted, link, focus ≥3:1, brand bg vs
   white ≥4.5:1).
3. `tests/unit/css-a11y.test.js` — extend the resolver to be palette-aware
   (light values from the base block, dark values from the dark blocks) and
   assert the existing light guarantees **and** their dark equivalents. The
    palette values are chosen so the file's last-occurrence resolution (used
    by the unchanged light tests) still passes: dark `--brand-accent`
    (#3178a6) must keep ≥3:1 vs white as well as vs the dark background.
4. `tests/e2e/dark-mode.spec.js` (against the built export, as always):
   - toggle right edge == `.menu-bar` content right edge (±1px, incl. mobile);
   - three options render with icons, system preselected;
   - clicking "dark" flips `body` background; reload → still dark
     (persistence); selecting "system" follows the emulated OS scheme
     (`colorScheme: 'dark'` → dark without any click);
   - default light rendering under `colorScheme: 'light'` is unchanged.

Existing guards that must stay green untouched: `layout-styles`,
`report-template*`, `report-template-wcag`, `html5-attributes`, `page-titles`,
`zz-style-check`, plus the full integration suite (the renderer forbids
`<input>` — irrelevant here since the toggle is React-rendered, not
mustache-rendered).

## Implementation steps

1. Write the failing unit/integration tests (above).
2. `components/theme-toggle.jsx` + render it in `components/site-header.jsx`
   on a `.theme-bar` sub-row after `.menu-bar`.
3. globals.css: split color roles, sweep hardcoded colors into variables, add
   the three cascade blocks + mvp variable overrides + dark overrides for the
   report template's light-only rules + `.theme-bar`/toggle styles.
4. `app/layout.jsx`: inline persistence script after `<SiteHeader />` +
   `color-scheme` meta.
5. Unit/integration green; `npx eslint` clean.
6. E2E: new spec + the header-adjacent specs (`layout`, `user-journeys`,
   `mobile-responsiveness`, `breadcrumbs`) against a fresh `bun run build`.
7. Update `AGENTS.md` (feature bullet + theming notes).

## Critical review (self-review of this plan)

1. **"Only CSS" is not literally achievable end-to-end** — persistence needs
   ~8 lines of JS. This is called out rather than hidden: every *visual* aspect
   (switching, system-following, palettes, no-FOUC for the system default)
   remains pure CSS; the script only remembers the choice. A strictly-CSS
   alternative (no persistence) was rejected: losing the theme on every
   refresh fails the "best practices" requirement, which the user also
   stated. Best-practice guides (web.dev, MDN) list persistence as
   fundamental.
2. **FOUC audit** — with the system default there is *zero* flash (media
   query applies at first style resolution). With an explicit saved choice the
   inline script runs before the parser yields (it sits immediately after the
   header markup), so no content is painted before it executes; the residual
   worst case is a single light frame of the 48px menu bar. A `<head>`-set
   `data-theme` attribute would remove even that but was rejected: it makes
   the attribute a *second source of truth* and breaks "radios work without
   JS".
3. **`:has()` support** — Baseline since Dec 2023 (Chromium 105+, Firefox
   121+, Safari 15.4+). In browsers without it the toggle is inert but the
   system preference still themes the site via the plain media query —
   graceful degradation, matching the site's evergreen toolchain (Next 15,
   WASM widgets).
4. **Hydration safety** — the restore script sets the `checked` DOM property
   only (never the attribute), so React sees no hydration mismatch, and
   uncontrolled radios are never re-managed by React afterwards. Verified
   pattern for static-export + hydration.
5. **Cascade order verified against the naive test parsers** —
   `css-a11y.test.js`/`layout-styles.test.js` parse globals.css with a
   flat regex; the plan deliberately keeps single-level `@media` nesting and
   chooses dark values that also satisfy the light assertions under the
    parser's last-occurrence variable resolution (e.g. dark `--brand-accent`
    #3178a6 is ≥3:1 vs white). The new `theme-css.test.js` then adds a
   palette-aware resolver so this fragile coincidence becomes an enforced
   property instead of luck.
6. **Duplication risk** — the dark block exists twice (media + explicit).
   Unavoidable in plain CSS; mitigated by the byte-identical test, which turns
   the duplication into an invariant.
7. **mvp.css beat strategy re-checked** — light overrides need `html:root`
   because mvp's `:root` declarations load later; dark blocks win on
   specificity (1,2,0). Confirmed against mvp.css 1.15.0's actual source
   (fetched and inspected), not assumption.
8. **Report scope contained** — the mustache template stays untouched
   (guarded byte-for-byte by an existing test), so ~200 E2E report assertions
   are structurally unaffected; dark overrides live in globals.css where the
   new unit tests cover them.
9. **Contrast choices are computed, not eyeballed** — every dark palette pair
   is asserted in tests using the same WCAG math as the existing suite; values
   were pre-verified (dark bg/text ≈13:1, muted ≈8:1, links ≈7.7:1, focus
    indicator 3.8:1 on the page bg (3.3:1 on surfaces), brand-bg+white 5.5:1,
    error/success ≈8:1).
10. **Alignment is structural, not geometric** — the `.theme-bar` sub-row
    reuses the breadcrumbs' `--width-content` column + 0.8rem padding formula,
    so the toggle's right edge is the menu bar's right content edge at every
    viewport with zero positioning code; the E2E test pins it with a
    bounding-box comparison, at desktop and mobile widths.

Verdict: the design is sound. The only genuine trade-offs — the persistence
shim (flagged deviation) and the duplicated dark block (test-guarded) — are
the standard costs of doing three-mode theming in pure CSS, and both are
consciously mitigated rather than accidental.
