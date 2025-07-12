Modular layout engine for SVG inspired by Bluefish.
The library should work both in Node and on the web.

## Tooling

- Node (uses the version specified in .node-version)

- Pnpm (uses the version specified in package.json)

- Biome (formating and linting)

- Vitest (for testing)

- TypeScript

## Coding style

- Prefer functional programming and pure functions

- Keep type definitions in the same files as other code (avoid having files called types.ts)

- Write TDD (use `.spec.ts` as nameingconventino, keep test files as close to the code their testing)

- In TS use `type`-declerations, avoid `Interface`

- Use discriminated unions when possible

- Use JSDoc, but don't add types to the JSDoc since we already use TypeScript

- Keep comments minimal and concise, assume that a competent developer will read the code. But do add comments if there are surprising behavior or workarounds done, try to document intention (not explanation).

- Try to avoid dependency bloat
