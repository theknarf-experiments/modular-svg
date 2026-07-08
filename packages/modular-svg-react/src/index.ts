// Main exports for @modular-svg/react

// Re-export FiberProvider for advanced use cases
// Note: Graphic includes FiberProvider internally, so you don't need to wrap your app with it
// Only export this for users who want to use the reconciler directly without Graphic
export { FiberProvider } from "its-fine";
// Graphic component - automatically includes context forwarding via its-fine
export type { GraphicProps } from "./Graphic";
export { Graphic } from "./Graphic";
// Reconciler exports for advanced usage and testing
export type { ReconcilerRoot } from "./reconciler";
export { act, createRoot } from "./reconciler";
