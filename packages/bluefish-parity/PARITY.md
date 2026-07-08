# Bluefish parity matrix

Feature-by-feature comparison of modular-svg against Bluefish
(github.com/bluefishjs/bluefish, `main` @ `a6d2134` = npm `0.0.39`,
verified identical — no unreleased commits as of July 2026).

Status legend:

- ✅ **parity** — matches Bluefish geometry, covered by fixtures in `parity.spec.ts`
- 🟡 **partial** — core semantics match, listed props/behaviors missing
- ❌ **missing** — not implemented
- ➖ **non-goal** — deliberately not matched (reason given)
- 🚫 **unexported upstream** — exists in Bluefish source but is NOT exported
  from `bluefish-solid`/`bluefish-js`; matching by omission

## Marks

| Feature | Bluefish (source of truth) | modular-svg | Status |
|---|---|---|---|
| **Rect** | `x? y? width? height?` + all SVG attrs pass through (incl. `rx`/`ry`); unset dims stay unowned so relations can size it | same + arbitrary SVG attr passthrough; unset extents are unowned (assignable by total modes) | ✅ |
| **Circle** | `cx? cy?` (center), `r` required; paint derives r from `bbox.width/2`, so parents can resize | `cx cy` and top-left `x y` both accepted (fixture); r fixed at parse; no stroke-width default (matches Bluefish) | ✅ / 🟡 parent-resize |
| **Ellipse** | in src, **not exported** from either package (doc stub exists) | — | 🚫 |
| **Text** | Alegreya Sans 700 14px, canvas-measured; word wrap via `width`, `scaleToFit`, `angle`, `vertical-anchor`, `dx/dy`, line-height/cap-height | heuristic 8px/char × 16px line, single line, `fill` default black | ➖ text metrics (see below) / 🟡 props |
| **Image** | `x? y? width? height?` + `href`; layout identical to Rect | same (fixture: image in a stack) | ✅ |
| **Path** | `d` required, `x? y?`, `position: relative\|absolute`; bounds measured via paper.js; defaults stroke black, sw 3, fill none | — | ❌ |
| **Blob** | takes a **paper.js `Path` instance** as a prop (not serializable); exported but experimental | — | ➖ not expressible in JSON scenes |

## Relations

| Feature | Bluefish | modular-svg | Status |
|---|---|---|---|
| **StackH / StackV** | spacing default 10; alignment centerY/centerX; anchored on first owned child; bbox = union | same (fixtures: spacing, all 6 alignments, defaults, nesting, ref anchoring) | ✅ |
| Stack `total` modes | `total` only → spacing computed; `total`+`spacing` → children with unowned extent share leftover **size** (Bluefish quirk: gaps not subtracted — preserved); `spacing` with unowned extents → `DimUnownedError` | same three modes via extent ownership (fixtures); unowned-extent violations land in `warnings` | ✅ |
| **Stack (generic)** | in src, **not exported**; StackH/V wrap it | — | 🚫 |
| **Align** | 1D + 2D keywords; first-owned child anchors; bbox exposes only aligned axis | same keywords + anchor (fixtures); container bbox is full union of both axes | ✅ / 🟡 bbox axes |
| `guidePrimary` per-child override | commented out upstream — not implemented | — | 🚫 |
| **Distribute** | `direction` required; `spacing`, `total`, or both; first-owned child anchors; bbox exposes main axis only | `direction` horizontal/vertical or `axis` x/y; all three sizing modes (fixtures); spacing-less → even-spread **extension** (Bluefish throws) | ✅ |
| **Background** | padding 10; stroke black / fill none / sw 3; extra rect attrs pass through (`rx` in tutorial!); custom `background` render prop; `width`/`height`; centers unowned content; errors if frame pos owned | padding 10 + fill/stroke/sw + attr passthrough incl. `rx` (fixtures); no custom frame, no content centering | ✅ core / 🟡 details |
| **Group** | defaults unowned left/top to 0 (claims them); union skipping undefined; `rels` prop; extra attrs on `<g>` | union bbox; relations are just sibling children in JSON (≈ `rels`) | ✅ core / 🟡 details |
| **Line** | connects 2 children (Refs); `source`/`target` fractional [0..1,0..1] bbox anchors, clamped-to-box endpoint defaults; stroke black sw 3, dasharray | same, ported endpoint algorithm incl. center-bias quirk (fixtures: both anchors / source only / none); dasharray via attr passthrough | ✅ |
| **Arrow** | perfect-arrows curved quad path: bow .2, stretch .5, stretchMin 40, stretchMax 420, padStart 5, padEnd 20, flip, straights, `start` dot; bbox = union of endpoints' boxes | **deliberately straight**: line between facing box edges + polygon head, `padStart`/`padEnd` (default 5); no perfect-arrows dependency by choice | ➖ by preference |
| **GraphLayered / Node / Edge** | dagre layered graph layout; **not exported** | — | 🚫 |
| **Gradient** | linearGradient defs helper; **not exported** | — | 🚫 |

## Special / framework

| Feature | Bluefish | modular-svg | Status |
|---|---|---|---|
| **Bluefish root** | padding 10; optional width/height override; viewBox from content bbox; `debug` scenegraph dump | Group root + `layoutToSvg(margin)` (default 0; CLI default 3); width/height always derived | 🟡 |
| **Ref** | `select: Id \| [Id, ...names]` — path selection through scoped names; helpful "Available names" errors; ref-of-ref throws | flat `target` id (global unique ids); unknown ref throws | ✅ core / ➖ scoped paths (our ids are globally unique, scoping is moot in JSON) |
| **name / createName scoping** | scope tree, `name(uid)` ids, `data-bluefish-id` attr on `<g>` | `id`/`key` on nodes → `id` attr on emitted elements | ➖ equivalent-by-design |
| **zOrder** (new in 0.0.39) | `zOrder?: number` on every component; paint order sorted stably per parent | `zOrder` prop, global stable sort in layoutToAst (fixture); nuance: Bluefish sorts per parent, we sort globally | ✅ / 🟡 nuance |
| **withBluefish HOC** | wraps custom components; naming + zOrder | react package reconciler plays this role | ➖ framework-specific |
| **Layout / LayoutFunction** | custom layout escape hatches (function props) | custom `LayoutOperator` via `solveLayout` API | ➖ equivalent-by-design (not JSON-expressible upstream either) |
| **Ownership errors** | typed errors (DimAlreadyOwned w/ provenance, DimUnowned, NaN, …) — but currently soft (`console.warn`) | `JsonScene.warnings` for double hard ownership; hard throws for dup ids / unknown refs | ✅ comparable |
| **Reactivity / control flow** | Solid signals; For/Show/Index/Switch/Match (hyperscript) | react package (state → re-render); JSON is data | ➖ framework-specific |
| **Interactivity** | signals driving props; no dedicated API | react Canvas event handlers | ➖ different mechanism |
| **debug / window.bluefish / DEBUG-name breakpoints** | scenegraph dump, debugger triggers | — | ➖ |

## Layout-model differences (accepted)

- Bluefish: linear-system bbox (any 2 dims per axis determine all 4; over-determination throws),
  single bottom-up pass, per-container transforms.
  modular-svg: flat `Float64Array`, damped fixed-point solver, parse-time ownership,
  subtree-delta moves. Geometry parity is verified by fixture, not by construction.
- Distribute/Align in Bluefish expose partial bboxes (one axis); our containers always
  get full union bboxes. Only observable when another relation targets those containers.

## Remaining gaps (deliberate or low priority)

- Arrow curves (straight arrows preferred; no perfect-arrows dependency);
  Text props/metrics; Path mark; Blob; parent-resizable circles; Background
  custom frame + content centering; Bluefish-root width/height overrides;
  per-parent zOrder scoping; partial-axis container bboxes.

Non-goals (revisit only deliberately): text metrics (needs real font measurement),
Path/Blob (paper.js), anything unexported upstream (Ellipse, generic Stack, Gradient,
GraphLayered), scoped name paths, debug tooling.
