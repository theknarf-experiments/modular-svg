# Modular SVG Layout

`modular-svg` is a small TypeScript library for generating SVG diagrams from a
declarative scene description. It takes inspiration from the
[Bluefish](https://bluefishjs.org/) project where a scene is expressed as a tree
of primitives (such as `StackH` or `Align`) that impose layout relations between
shapes. The library parses a JSON version of this syntax, solves the layout and
produces an SVG string.

## Usage

```bash
bun ./bin/modular-svg examples/planet.json planet.svg
```

The CLI reads a JSON scene either from a file or from `stdin` and writes the
resulting SVG to `stdout` or to the file specified as the second argument.

## Design

The solver compiles every node into a flat array of variables representing its
`x`, `y`, `width` and `height`. Layout relations are implemented as operators.
Each operator reads from the current state and writes its suggestions into the
next state. By repeatedly applying all operators in sequence (a damped Picard
iteration) the layout converges towards a fixed point that satisfies all
relations. The process starts by parsing the JSON scene into a flat array of
numeric variables for every node. Operators such as `StackH`, `Align` or
`Distribute` read these variables and suggest new positions in a fresh array.
After each pass the solver mixes the new values with the previous ones using a
damping factor. Iteration stops once the maximum change falls below a small
threshold or a safety limit is hit. This local fixed‑point approach keeps the
solver fast—time grows roughly linearly with scene size—and stable even when
relations overlap or form cycles.

