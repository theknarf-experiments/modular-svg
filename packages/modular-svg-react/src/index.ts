// Main exports for @modular-svg/react

// Re-export FiberProvider from its-fine for context forwarding
// Users should wrap their app with <FiberProvider> for context to work across reconcilers
export { FiberProvider } from "its-fine";
export type { CanvasProps } from "./Canvas";
export { Canvas } from "./Canvas";
export type { ReconcilerRoot } from "./reconciler";
// Reconciler exports for advanced usage
export { act, createRoot } from "./reconciler";
