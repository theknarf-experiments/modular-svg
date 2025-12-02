// Main exports for @modular-svg/react

// Re-export FiberProvider for advanced use cases
// Note: Canvas includes FiberProvider internally, so you don't need to wrap your app with it
// Only export this for users who want to use the reconciler directly without Canvas
export { FiberProvider } from "its-fine";
// Canvas component - automatically includes context forwarding via its-fine
export type { CanvasProps } from "./Canvas";
export { Canvas } from "./Canvas";
// Reconciler exports for advanced usage and testing
export type { ReconcilerRoot } from "./reconciler";
export { act, createRoot } from "./reconciler";
