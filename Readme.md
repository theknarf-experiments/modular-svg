# Modular SVG

`modular-svg` is a small TypeScript library for generating SVG diagrams from a
declarative scene description. It takes inspiration from the
[Bluefish](https://bluefishjs.org/) project where a scene is expressed as a tree
of primitives (such as `StackH` or `Align`) that impose layout relations between
shapes. The library parses a JSON version of this syntax, solves the layout and
produces an SVG string.

## Usage

```bash
./bin/modular-svg.ts examples/planet.json planet.svg
```

The CLI reads a JSON scene either from a file or from `stdin` and writes the
resulting SVG to `stdout` or to the file specified as the second argument.

## Color

Colors are solved like positions: color relations ref nodes and the solver
settles them. Every node has a fill and a stroke color; a ref chooses one with
`paint` (`<Ref target="box" paint="stroke"/>`), defaulting to what the mark
is drawn with (strokes for lines, curves and arrows, fills otherwise).

| Relation | Meaning |
| --- | --- |
| `DistinctColors lightness chroma startHue` | evenly spaced hues at one perceived lightness; pinned colors keep theirs and the rest keep a full step away |
| `SameColor` | the rest take the first's color (alpha included) |
| `Lighten amount`, `Darken amount` | the rest take the first's color, lighter or darker |
| `Contrast ratio` | the first's lightness moves until it meets the WCAG ratio against the second |

Colors are solved in OKLCH, a perceptual space, so equal lightness looks
equally light across hues and lightening is even; results are gamut-mapped to
sRGB (chroma gives way, lightness and hue stay). An explicit color pins it:
any CSS color the parser reads (`#rgb(a)`, `#rrggbb(aa)`, `rgb()`, `hsl()`,
`oklch()`, named colors, `transparent`); anything else (gradients, `url()`)
is left alone. Conflicting color relations are reported like layout ones.

## Time

Animation is expressed the same way as layout and color: as relations over
`Ref`s, solved by the same iteration. The motion vocabulary follows
[svjeez](https://github.com/saiashirwad/svjeez), and the output is a
self-contained SVG with CSS keyframes and no runtime script.

**Motions** are nodes that ref the marks they animate. Each gets a time span
(`start`, `duration`), from `at`/`over` props or from relations:

| Motion | Does |
| --- | --- |
| `Enter from`, `Exit to` | arrive from / leave to `opacity x y scale rotate blur` |
| `Draw` | stroke a shape on |
| `Shake amplitude`, `Wiggle amplitude seed` | damped shake; seeded looping noise |
| `Motion from steps` | svjeez-style steps: `{to, over, ease}`, `{set}`, `{wait}`; any channel, `fill`/`stroke`/`width`/`height`/`d` and a circle's `r` included |
| `Sampled fn tolerance` | bake a function of time into few keyframes |
| `Travel` | move the first child through the following refs, at even speed |

Colors in `Motion` (`fill`, `stroke`) may be `{ ref: "id" }`: that node's
solved color, so motions can animate to colors that `DistinctColors`,
`SameColor` and the other color relations picked.

Eases: `linear in out inOut pop hold steps(n)` or bezier points. `loop` repeats a
motion's span until the scene ends (or `n` times). A looping motion is a
one-motion `Phrase` (below), so both repeat alike: every pass starts over from
where the motion began (its `from`; a channel that names none, where the mark
rests), and `alternate` runs every other pass backwards, with no cut at the turn.

**Time relations** ref motions, marks (a mark spans its motions) or other
relations (a relation spans its members), and moving one carries its contents:

| Relation | Meaning |
| --- | --- |
| `Sequence gap` | back to back, exact gap (negative overlaps) |
| `SameTime align` | starts (or `end`, `center`) line up |
| `Stagger spacing\|total ease` | starts spread out; an `ease` makes the cascade speed up or settle |
| `Before gap` | each starts no earlier than the previous ends (inequality) |
| `After gap` | the first starts after every other ends (a join) |
| `During` | the rest stay inside the first's span |
| `Stretch` | the rest take the first's span; with `beats`, only its length times `beats` (note values) |
| `At time` | pin starts |
| `Legato`, `Staccato fraction` | each lasts until the next starts (or that fraction of it) |
| `Beat bpm\|period offset toBpm ramp` | a beat; `toBpm` over `ramp` beats makes a ritardando or accelerando that every beat relation follows |
| `OnBeat every division offset swing align snap` | snap onto the beat grid: `division` subdivides (3 = triplets), `offset={0.5}` is the offbeat, `swing={2/3}` swings every second step, `align="end"` lands the end on the grid (a pickup) |
| `Bar beats count` | a span on bar lines lasting `count` bars, to sequence sections or fit things into |
| `Rest over`, `Fermata hold` | an empty span; a span of its members plus a hold |
| `Polyrhythm of` | `of={[3, 2]}`: three of the first beat in the time of two of the second |
| `Modulate ease`, `Resolve ease` | a change of layout: the relations inside a `Modulate` hold from its start on; a `Resolve` releases them (see below) |
| `Phrase rate retrograde repeat alternate` | a clock: what it takes plays as a unit in the phrase's own time, faster or slower (`rate`, `over`, or stretched like a motion), backwards (`retrograde`), `repeat` times (`true`: until the enclosing time ends), every other pass reversed (`alternate`) |

A `Phrase` is how a group gets a length: outside it is a leaf like a motion,
so every relation above works on it; inside, its members are solved in the
phrase's own seconds (an `at` inside is local). A relation only moves nodes
in its own time, so to place a phrase's content from outside, relate the
`Phrase`. What a relation only reads may play in a time around it: the beat
of an `OnBeat`, `Bar` or `Polyrhythm`, the source of a `Stretch`, the span a
`During` keeps to and what an `After` waits for. So a phrase's content can
land on a beat of the scene, seen through every phrase in between (a
`Polyrhythm` starts its own beat on the first downbeat the two share inside
the phrase):

```tsx
<beat key="beat" bpm={120} />
<phrase key="fill" rate={2} repeat={2}>
  <enter key="hit">...</enter>
  <onBeat><ref target="beat" /><ref target="hit" /></onBeat>
</phrase>
```

The order of dependence runs one way: the time around a phrase is solved
first and places it, its start and `rate` say how the beat looks inside, the
beat places the content, and the content gives the phrase its length. The
beat is read on the phrase's first pass; later passes land on it when a pass
is a whole number of beats. A phrase whose length is set (`over`, a `Stretch`)
gets its speed from that length, and a `retrograde` one counts from its end,
so there the content would place the beat it reads: that warns and the
relation is dropped (give the phrase a `rate`, or a `Beat` of its own).
Reading into a phrase from outside warns too. A relation written inside a
phrase brings what it moves into the phrase (as a `Sequence` there does) and
leaves what it reads where it is. A `Resolve` releases only in its own time:
one declared outside over a phrase's `Modulate` joins that phrase, and one
inside a phrase that names a `Modulate` outside warns. Stretching a phrase changes its tape speed (a `Shake` inside keeps
its number of shakes), and `over` is its whole span: `over={2} repeat={3}` is
three passes in two seconds (it must be above 0; a phrase left with no time
warns, since nothing in it plays).

Lanes that hold one value (`fill`, `stroke`, `width`, `height`, `r`, `d`, `draw`)
are shared by the motions on a mark. The one that moves a lane first decides
where it starts; where a later one starts from (its `from`, or the last frame
of a phrase played backwards) is a cut at the moment it starts; a backward
phrase that is the first to move a lane shows that last frame from the start
of the scene. A phrase picks
a lane up where the time around it left it, so its passes repeat from there
and a backward phrase hands back what it found.

**Layout in time.** The layout relations outside any `Modulate` are *home*:
what a static render shows, solved by exactly the relations the scene would
have without its `Modulate`s. A `Modulate` is a time leaf holding layout
relations (`StackV`, `StackH`, `Align`, `Distribute`, `Span`, `Background`)
over refs. From its start on they hold instead of the home relations that
placed the same things, and everything that ends up somewhere else gets there
over the `Modulate`'s span (`over`, `ease`). A later `Modulate` wins where two
place the same thing, and a `Resolve` lets the ones it refs go (all of them
when it refs none), so what they moved returns to wherever the remaining
relations put it.

```tsx
<modulate key="shuffle" at={1} over={0.5}>
  <stackV spacing={8}><ref target="c" /><ref target="a" /><ref target="b" /></stackV>
</modulate>
<modulate key="select" at={2} over={0.5}>
  <background padding={6}><ref target="frame" /><ref target="a" /><ref target="b" /></background>
</modulate>
<resolve at={3} />
```

A `Background` inside a `Modulate` draws no box of its own: it restates one
that is already there. Its first ref is that box (a `Background` or a `Rect`),
the rest are what the box wraps, with this `padding`, while the `Modulate`
holds; the relation that wrapped it at home lets go. A box that still wraps
its own content is carried by whatever places it, so a stack makes room as
its padding grows. A box that wraps something else is placed by that alone,
and a relation that placed it lets go. If a home stack places the box and
what it now wraps side by side, restate that stack in the `Modulate` too
(this warns). Anything else in a `Modulate` (a `Group`, an arrow, a color or
time relation) cannot be modulated: it warns and is read as if it were
declared outside.

Each distinct set of active modulations is one more solve, and the browser
tweens between them: boxes translate, rects and images also resize, a circle
or arc takes its radius from the width of its box and keeps to the centre of
it (a `Span` that gives it one side gives it the other too, so it stays round
inside its box; text and paths keep their size), and a
line, curve or arrow whose ends move apart is redrawn between wherever its
ends are, so an arrow stays attached without extra markup. The redrawn path
is written twice: as CSS keyframes on `d`, which keep time with the boxes,
and as SMIL for browsers that do not animate `d` in CSS (there the path runs
on SMIL's own clock, which `Graphic` sets to that of the scene's CSS
animations whenever no `transition` tween is running on it). Inside a
`Modulate`, put what stays first: a member anchors the relation only if you
pinned it, an earlier relation of the same `Modulate` placed it, or a home
relation that this one does not restate did; with no anchor a stack packs
from where its members' box already is, so a reorder happens in place. A
relation that restates one list and takes in a member from elsewhere anchors
on whichever of them comes first, so the list stays when its own member
does. Taking a member out of a container that some relation places, or
places other things by, makes that relation let go as well: it would drag
the member along, so what it placed stays where it was unless the
`Modulate` restates it. Between two `Modulate`s the later one wins the same
way: while it places a container, an earlier relation that took a member out
of that container lets go, and the member is back where the container has it.
`Modulate` and `Resolve` are placed like motions (`Sequence`, `OnBeat`, ...),
and a `Phrase` that takes them plays the layout change faster, backwards or
there and back. Modulations in different clocks that move the same thing add
up (positions, sizes and redrawn connectors alike), which warns, since it is
rarely meant. Frames between two layouts are interpolated, not solved, so
boxes that swap places pass through each other. A motion plays on things where
the layout has them: a mark follows its box innermost, and `scale` and
`rotate` pivot on the centre of their target as it then is, so a reordered
list turns as the list it has become. Offsets are still measured from home, so
a `Travel` towards something a modulation moves warns.

**Connectors follow their ends.** The same holds for motions: a line, curve
or arrow whose end a motion moves (`Travel`, `x`/`y` in `Enter`, `Exit`,
`Motion`, `Shake`, `Wiggle`, `Sampled`), on the end itself or on a group around
it, is redrawn between wherever its ends are, in or out of a `Phrase` and
together with any modulation of the same end. When its ends move alike (one
motion on both, or on a group holding both) it rides along in that motion's
shell instead, and a motion on the connector itself (`Draw`, a fade, a slide)
stays its own. A motion on a group that holds the connector and one end keeps
the other end where it is. The redrawn path keeps only the keys it needs
(within half a pixel), and the reduced-motion still shows it attached.
Only the translate is followed: an end that a motion scales or rotates keeps
its connector at the unscaled box, and an end inside a group that turns or
scales is not followed around the pivot.

A `Sequence` and a `Legato` over the same pair are circular (each sets the
other's input), which warns: place legato members with `Stagger`, `OnBeat` or `At`.

As with layout, a relation anchors on its first member whose start is already
fixed (pinned by `at`/`At`/`Beat`, or placed by an earlier relation) and moves
the rest; two relations fighting over one start, or an inequality that pinned
starts violate, produce warnings. See `examples/pipeline.json` and the
Animation page of the docs.

```bash
./bin/modular-svg.ts examples/pipeline.json pipeline.svg --loop --duration 4
```

After solving, `checkSolution(scene, layout)` applies every relation once
more to the result and names any that would still move something, so
over-constrained scenes are reported rather than silently drifting. `Graphic`
logs these warnings outside production builds, and the CLI prints them.

In React, `Graphic` takes `transition` (tween marks from their previous solved
geometry and color whenever state changes the solution), `playhead` (hold every motion at a time, for
scrubbing; while it holds, changes apply at once, since the tweens share the
held clock) and `onSolve`, which hands out the solved spans of every timed ref,
the layout boxes, warnings and a live animation clock. `useCues(solution,
{ hit3: () => ..., "hit3:end": () => ... })` calls back as the animation
passes those refs, so sound or anything else can follow the solved schedule
without the solver knowing about it. Inside a `Phrase` a cue fires on every
pass, nested phrases and a looping scene included: the plain cue when the ref
starts to play and `:end` when it stops, whichever way the pass runs (a
repeating phrase cut by the end of its time ends its cues there):

```tsx
const [solution, onSolve] = useSolution();
useCues(solution, { kick: () => playKick() });
return <Graphic onSolve={onSolve}>...</Graphic>;
```

## Solver Architecture

The layout solver is built around an approximate fixed-point method inspired by Bluefish. It parses a JSON tree of marks and relations, compiles it into numeric variables and simple operators, then runs a damped Picard iteration until the layout stabilizes.

Parsing collects nodes such as `Stack`, `Align`, and `Distribute`, resolving references so every relation acts on the same objects. During compilation each node contributes `x`, `y`, `width`, and `height` variables while relations become small operator objects that know how to update those variables.

At runtime the solver repeatedly applies all operators to a state vector. After each pass it computes the maximum difference between the old and new states. If this residual is below a tolerance `ε`, the system has converged. Otherwise the algorithm updates the state using a relaxation step `cur = cur + λ (next - cur)` with `0 < λ ≤ 1` to ensure stability.

This iterative approach is efficient because each iteration touches only the affected variables. When the combined operators form a contraction—often the case with common layout primitives—the Banach fixed-point theorem guarantees convergence to a unique layout. Even when strict contraction is hard to prove, damping empirically leads to a stable solution.
