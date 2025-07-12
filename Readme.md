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



## Solver Architecture

The layout solver is built around an approximate fixed-point method inspired by Bluefish. It parses a JSON tree of marks and relations, compiles it into numeric variables and simple operators, then runs a damped Picard iteration until the layout stabilizes.

Parsing collects nodes such as `Stack`, `Align`, and `Distribute`, resolving references so every relation acts on the same objects. During compilation each node contributes `x`, `y`, `width`, and `height` variables while relations become small operator objects that know how to update those variables.

At runtime the solver repeatedly applies all operators to a state vector. After each pass it computes the maximum difference between the old and new states. If this residual is below a tolerance `ε`, the system has converged. Otherwise the algorithm updates the state using a relaxation step `cur = cur + λ (next - cur)` with `0 < λ ≤ 1` to ensure stability.

This iterative approach is efficient because each iteration touches only the affected variables. When the combined operators form a contraction—often the case with common layout primitives—the Banach fixed-point theorem guarantees convergence to a unique layout. Even when strict contraction is hard to prove, damping empirically leads to a stable solution.



