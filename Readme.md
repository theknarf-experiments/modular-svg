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
| `Motion from steps` | svjeez-style steps: `{to, over, ease}`, `{set}`, `{wait}`; any channel, `fill`/`stroke`/`width`/`height`/`d` included |
| `Sampled fn tolerance` | bake a function of time into few keyframes |
| `Travel` | move the first child through the following refs, at even speed |

Eases: `linear in out inOut pop hold steps(n)` or bezier points. `loop` repeats a
motion's span until the scene ends (or `n` times).

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
| `Beat bpm\|period offset` + `OnBeat every division offset align snap` | a beat grid and starts snapped onto it; `division` subdivides (3 = triplets), `offset={0.5}` is the offbeat, `align="end"` lands the end on the beat (a pickup) |

As with layout, a relation anchors on its first member whose start is already
fixed (pinned by `at`/`At`/`Beat`, or placed by an earlier relation) and moves
the rest; two relations fighting over one start, or an inequality that pinned
starts violate, produce warnings. See `examples/pipeline.json` and the
Animation page of the docs.

```bash
./bin/modular-svg.ts examples/pipeline.json pipeline.svg --loop --duration 4
```

## Solver Architecture

The layout solver is built around an approximate fixed-point method inspired by Bluefish. It parses a JSON tree of marks and relations, compiles it into numeric variables and simple operators, then runs a damped Picard iteration until the layout stabilizes.

Parsing collects nodes such as `Stack`, `Align`, and `Distribute`, resolving references so every relation acts on the same objects. During compilation each node contributes `x`, `y`, `width`, and `height` variables while relations become small operator objects that know how to update those variables.

At runtime the solver repeatedly applies all operators to a state vector. After each pass it computes the maximum difference between the old and new states. If this residual is below a tolerance `ε`, the system has converged. Otherwise the algorithm updates the state using a relaxation step `cur = cur + λ (next - cur)` with `0 < λ ≤ 1` to ensure stability.

This iterative approach is efficient because each iteration touches only the affected variables. When the combined operators form a contraction—often the case with common layout primitives—the Banach fixed-point theorem guarantees convergence to a unique layout. Even when strict contraction is hard to prove, damping empirically leads to a stable solution.
