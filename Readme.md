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


