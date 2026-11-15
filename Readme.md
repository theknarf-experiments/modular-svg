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
| `Enter from`, `Exit to` | arrive from / leave to `opacity x y scale rotate blur`, or a crop: `cropLeft cropRight cropTop cropBottom` (see Clips and masks) |
| `Draw` | stroke a shape on |
| `Shake amplitude`, `Wiggle amplitude seed` | damped shake; seeded looping noise |
| `Motion from steps` | svjeez-style steps: `{to, over, ease}`, `{set}`, `{wait}`; any channel, `fill`/`stroke`/`width`/`height`/`d` and a circle's `r` included |
| `Sampled fn tolerance` | bake a function of time into few keyframes |
| `Travel route pace orient` | move the first child through the following refs, at even speed: in straight legs between their centres, along one smooth curve through them (`route="smooth"`), or along the marks themselves (`route="along"`, below) |

**Routes.** A `Travel`'s first child is the mover; the rest are refs to where
it goes, and nothing but the mover is moved. `route="smooth"` passes through
the same centres as the straight legs do, on one curve (a centripetal
Catmull-Rom spline); when the last waypoint is where the mover started, the
route closes and loops without a seam. `route="along"` reads the refs as the
route itself, in order: a `Line`'s segment, a `Curve`'s curve, an `Arrow` up
to the tip of its head, a `Path`'s first subpath where it is drawn (`M L H V
C S Q T Z`) and an `Arc`'s outer arc from its start angle. A gap between two
marks is crossed in a straight run, and the mover sits on the start of the
route from the start of the scene, as an `Enter`'s `from` holds before it
plays.

```tsx
<curve key="wire"><ref target="a" /><ref target="b" /></curve>
<travel key="trip" route="along" orient over={1.2} ease="inOut">
  <ref target="packet" /><ref target="wire" />
</travel>
```

Speed is even along the length of the route. `pace` says what the `ease`
shapes: `"leg"` eases every stretch between two waypoints on its own, so the
mover settles at each (the default on a straight route), and `"trip"` eases
the whole way once (the default otherwise; a route along marks has no legs).
An ease that leaves 0..1 runs off the ends of the route along their tangents,
so a spring overshoots the last waypoint and comes back; on a closed route it
runs on round. `orient` turns the mover to face along the route, about its
own centre: `true` for a mover drawn facing right, or the degrees to add for
one that is not. It keeps its first heading until the trip starts and its
last afterwards, and played backwards (`retrograde`) it keeps the forward
heading, as a tape would. A curved route is written as sampled `translate`
(and `rotate`) keyframes within a quarter pixel of the curve, never closer
together than a 240Hz frame, so it is an ordinary motion to everything else:
phrases retime it and connectors follow it. A route is read where layout has
it at home: a `Travel` along something a modulation moves warns, as does one
sent along a mark with no path or a path that draws nothing (it passes
through its centre), a path's second subpath or an `A` command (crossed in a
straight line).

Colors in `Motion` (`fill`, `stroke`) may be `{ ref: "id" }`: that node's
solved color, so motions can animate to colors that `DistinctColors`,
`SameColor` and the other color relations picked.

Eases: `linear in out inOut pop hold steps(n)` or bezier points; `anticipate`
(pulls back first), `overshoot` (another name for `pop`) and
`anticipateOvershoot`; and three that are sampled curves rather than one
bezier: `spring`, `bounce` (a ball landing on the target, never past it) and
`elastic`. Each of those also takes parameters as an object:
`{ kind: "spring", bounce: 0.3 }` (-0.9..0.9: how far it overshoots; below 0
it only creeps in), `{ kind: "spring", stiffness: 180, damping: 14, mass: 1 }`,
`{ kind: "bounce", bounces: 3, elasticity: 0.5 }`, `{ kind: "elastic", period: 0.3 }`.
Numbers out of range warn and are read as the nearest allowed value, and a
number that belongs to another kind (`bounces` on a spring, `bounce` on a
`bounce`) warns and does nothing. A sampled curve is drawn with at most 32
straight runs, so one with many swings (a spring `bounce` of 0.8, an elastic
`period` of 0.15) is within about 1.5% of the distance moved rather than
exact.

```tsx
<enter ease="spring" from={{ scale: 0 }}>...</enter>
<modulate ease={{ kind: "spring", bounce: 0.3 }} over={0.6}>...</modulate>
<travel ease={{ kind: "spring", stiffness: 180, damping: 14 }}>...</travel>
```

A spring is a shape fitted to the span it eases, like every other ease: the
solved span owns the length, so `over`, a relation or a `Phrase` that resizes
the span plays the same spring faster or slower. Only a physical spring
(`stiffness`, `damping`) brings a length of its own, the time it takes to
settle, and only as the length the motion has when nothing else sizes it (a
`Motion` step with such an ease may leave out `over`). The browser gets a
sampled ease as one CSS `linear()` timing function. Where a value has a
range, the ease is cut at it: a spring fade stops at opaque and a spring
`Draw` at the whole stroke, while positions, scales, turns and path shapes
overshoot freely. A `Stagger` whose `ease` overshoots would start its members
out of order, which warns.

`loop` repeats a
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
| `Camera ease padding fit follow` | a change of view: from its start on the view frames what it refs (see Camera) |
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
a `Travel` towards something a modulation moves warns (a waypoint, a mark of
its route, or an end of a connector it rides along). A `Modulate` on a spring
`ease` overshoots like anything else: boxes run past and settle, sizes stop at
zero, and a connector between them is redrawn at every turn of the spring, so
it stays attached through the overshoot.

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
A mover on a curved route is followed the same way, round every bend.
Only the translate is followed: an end that a motion scales or rotates (a
`Travel`'s `orient` included) keeps its connector at the unscaled, unturned
box, and an end inside a group that turns or scales is not followed around
the pivot.

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
geometry and color whenever state changes the solution; with a spring or an
overshooting `ease`, geometry runs past and settles while colors ease out;
when the change is to what the camera does, the view tweens too, from where
it is to where the new scene's camera has it, so a camera that cuts to
whatever state says is in focus pans and zooms there; a camera the change
leaves alone plays on), `view` (the size of the picture, see Camera), `playhead` (hold every motion at a time, for
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

### Camera

A `Camera` is a timed leaf, like a `Modulate`: from its start on, the view
frames what it refs, and gets there over its span. The last camera to start
holds the view; one that refs nothing frames the whole canvas, which is the
pull-back, and before the first camera the view is everything.

```tsx
<camera key="onApi" over={0.8} padding={24}><ref target="api" /></camera>
<camera key="chase" follow padding={40}><ref target="parcel" /></camera>
<camera key="wide" over={0} />
<sequence><ref target="onApi" /><rest over={1} /><ref target="chase" /><ref target="wide" /></sequence>
<shake amplitude={{ x: 6 }} over={0.3}><ref target="onApi" /></shake>
```

| Prop | Meaning |
| --- | --- |
| `at`, `over` | as on any timed leaf; `over={0}` is a cut, and with neither it takes half a second |
| `ease` | any ease, springs included; `inOut` by default |
| `padding` | scene px kept round what is framed |
| `fit` | `"contain"` shows all of it (default), `"cover"` fills the viewport and crops |
| `follow` | also follow where motions take what is framed |

What is framed is the box round every mark under the camera's children,
strokes included; a ref to a relation (a `StackV` of refs, a `Group`) frames
the marks it relates. The framing follows layout: on a list a `Modulate`
reorders, the view moves with the framed mark over the `Modulate`'s span and
ease. It does not follow motions unless told to, because an `Enter` that
slides a framed mark in would make the camera bob and cancel the slide; with
`follow` it keeps up with the `x`/`y` a motion gives the mark (`Travel`
round every bend of a curved route, `Enter`, ...), though not with a
motion's scale or rotation.

Between two framings the view rect moves in a straight line, as an animated
`viewBox` would, but the zoom is geometric, so a long push-in has an even
pace instead of rushing at its end. Everything scales, strokes and text
included; pass `vector-effect="non-scaling-stroke"` on a mark that should
stay a hairline. The view is one group round every mark whose CSS
`transform` is keyframed, so it keeps time with the marks, loops, pauses on
the reduced-motion still frame and follows `Graphic`'s `playhead` like
everything else. The keyframes are straight pieces, as many as it takes to
stay within half a pixel on screen of the exact view, also while a spring,
a bounce or a bezier moves what is framed; a push-in takes 60 to 130 of
them. No
piece is shorter than 1/40000 of the timeline, so on a timeline of many
minutes a fast move is drawn more coarsely. The `<svg>` clips at the viewport; under `contain` in a
viewport of another shape more of the scene shows, with no bars.

Cameras are placed like motions (`Sequence`, `OnBeat`, `Stretch`, ...). A
camera that starts while the one before it is still settling cuts that one
short, which warns. A `Phrase` that takes cameras plays them in its own
time: faster, backwards (from its last framing, handing back the view it
found), there and back. Every pass of a repeating phrase starts from the
view the time around it left, as lanes do. Cameras in different time take
the view from one another (the one that started last holds it), which warns.

A motion that refs a camera moves the view itself, in screen pixels and
about the middle of the viewport: a `Shake` for an impact, a `Motion` with
`scale` for a punch-in. It takes `x`, `y`, `scale`, `rotate`, `opacity`, `blur`
and the crop channels.

The size of the picture is a document option, next to `margin` and
`animation`: `layoutToSvg(layout, nodes, margin, { view })` with
`view: { width?, height?, aspect? }` (`Graphic`'s `view` prop, the CLI's
`--width`, `--height` and `--aspect`). Both sides are taken as given; one
side follows `aspect`, or the canvas's own shape, to the nearest pixel;
`aspect` alone gives the smallest viewport of that shape that holds the
canvas. The canvas is fitted into it
and centred. A scene with a `view` or a camera gets a `viewBox`; one with
neither is written exactly as before.

### Clips and masks

A `Clip` shows what is inside it only within a shape. Its first child is the
shape, by the same convention as a `Travel`'s mover: a mark, a group or
relation of marks, or a `<ref>` to one declared earlier. The shape is never
drawn. The rest of its children are the content, which paints as one group
where the clip stands in paint order (its `zOrder` among its siblings; the
children's `zOrder` sorts inside it). Clips nest.

```tsx
<clip key="window" feather={0}>
  <rect key="wipe" width={320} height={90} />
  <stackV key="title">...</stackV>
</clip>
<motion from={{ width: 0 }} steps={[{ to: { width: 320 }, over: 0.6 }]}>
  <ref target="wipe" />
</motion>

<mask key="spotlight" by="alpha" feather={12}>
  <circle key="spot" r={80} fill="black" stroke="none" />
  ...
</mask>

<enter from={{ cropRight: 1 }}><ref target="headline" /></enter>
```

| Node | Shows the content |
| --- | --- |
| `Clip` | inside the shape's geometry, whatever it is painted with: marks count by their filled area, connectors by their stroke |
| `Clip inverse` | outside it |
| `Mask by` | through the shape's paint as authored: its opacity (`by="alpha"`, the default) or its lightness (`"luminance"`: white shows, black hides). Give the shape a `fill`; a rect has none by default |
| `feather` (both) | px the matte is blurred by, which is the soft edge |

The shape stays an ordinary node, and so does the content. Layout relations
place them (nothing ties the two together until a relation does), a motion
on the shape moves the cut (`width` for a wipe, `scale` for an iris, a
`Travel` for a spotlight), a motion on a content mark plays under the cut,
and a `Modulate` that restates the shape (a `Span`, a `Background`) resizes
the window while one that reflows the content moves it underneath. A motion
whose target is the clip, or a group that holds it, wraps the clipped group
once: it fades or blurs as one picture and the cut rides along (`fill` and
the other lanes that are set on an element still go to each mark). All of it
is the same CSS keyframes as everywhere else, so phrases retime it (a
`retrograde` wipe closes), it loops, pauses on the reduced-motion still frame
and follows `Graphic`'s `playhead`, and it zooms with a `Camera`.

A clip's box is what shows: the box round its content cut to the box round
its shape (with `inverse`, the content's). The canvas is sized the same way:
a shape never counts, and content counts only where every clip round it can
show it (out to two feathers past a soft edge). So an iris circle far larger
than the picture, or a ticker strip ten times its window, leaves the canvas
alone. A `Camera` that refs a clip frames that box. Bounds follow layout, not
motions: let the shape rest open and give the motion a `from`, since a shape
with no area at rest shows nothing in a render without animation (this
warns). In a scene with clips only drawn marks size the canvas, not the boxes
of groups and relations.

The **crop channels** need no clip: `cropLeft`, `cropRight`, `cropTop` and
`cropBottom` hide that fraction (0..1) of the target's own box, stroke
included, from that side. They work in `Enter`, `Exit`, `Motion`, `Wiggle`
and `Sampled`; `from={{ cropRight: 1 }}` wipes a mark on from left to right.
On a group each mark is cropped by its own box (wrap them in a `Clip` to wipe
them as one), on a clip the crop measures the content before it is cut, and
a crop cuts whatever lies past the box, a blur's halo included: declare the
blur motion before the crop, since earlier motions wrap later ones.

What cannot be read warns and the scene still renders: a clip with no shape
or nothing inside, a shape that draws nothing or that holds the clip itself
(the clip is then a plain group), content named by a `<ref>` after the shape
(what shows must be declared inside, since it paints as one group), a mark
that shapes two clips (give each a shape of its own and move both with one
motion), a mark inside one clip that is named as the shape of another (it
is no longer drawn in the first), a clip inside a shape (not applied there),
and a `fill` or `stroke` motion aimed at a `Clip`'s shape (a clip ignores
paint; use a `Mask`. Aimed at the clip, the same motion recolours its
content). There is no
inverse `Mask` (paint the shape the other way round), a shape is not also
drawn (declare a second mark and `Span` or `Align` it), and a clip inside a
`Modulate` is read as declared outside it.

In the SVG every clip is a `<mask>` in `<defs>` holding the shape's elements,
and a `<g mask="url(#...)">` holding the content. A real `<clipPath>` would
drop the wrapper groups that motions on the shape need, and a mask leaves
hit-testing alone. A matte reaches no further than its shape does: the box
round the shape through every motion and `Modulate` on it, cut to what the
picture can show (the canvas and every view a camera takes of it). That
matters under a camera: Chromium draws a layer that is being animated at a
resolution that falls as the layer grows, so a matte over the whole picture
would soften every zoom for as long as the timeline plays. An inverse clip,
and a shape whose box does not say where it paints (text, a path, a
connector), still get a matte over all the picture shows, and pay that
price in a zoomed scene; so does any large filled mark, clip or no clip.
With `transition`, a matte also keeps the room its shape tweens from.
Mattes are named after their content;
`layoutToSvg(layout, nodes, margin, { idPrefix })` names them otherwise, and
`Graphic` gives every mounted graphic a prefix of its own, so two copies of
one scene on a page never share a matte. With `transition`, a shape's
geometry tweens like any mark's, and marks that leave a clip go at once
instead of fading out on top of it. In JSX `mask` is also React's name for
the SVG element, whose type an intrinsic element cannot replace: `feather`
and `zOrder` are added to that type, and `by` is checked when the scene is
parsed rather than by TypeScript.

Springs, routes, the camera, clips and masks are measured in Chromium only;
Firefox and Safari are untested.

## Solver Architecture

The layout solver is built around an approximate fixed-point method inspired by Bluefish. It parses a JSON tree of marks and relations, compiles it into numeric variables and simple operators, then runs a damped Picard iteration until the layout stabilizes.

Parsing collects nodes such as `Stack`, `Align`, and `Distribute`, resolving references so every relation acts on the same objects. During compilation each node contributes `x`, `y`, `width`, and `height` variables while relations become small operator objects that know how to update those variables.

At runtime the solver repeatedly applies all operators to a state vector. After each pass it computes the maximum difference between the old and new states. If this residual is below a tolerance `ε`, the system has converged. Otherwise the algorithm updates the state using a relaxation step `cur = cur + λ (next - cur)` with `0 < λ ≤ 1` to ensure stability.

This iterative approach is efficient because each iteration touches only the affected variables. When the combined operators form a contraction—often the case with common layout primitives—the Banach fixed-point theorem guarantees convergence to a unique layout. Even when strict contraction is hard to prove, damping empirically leads to a stable solution.
