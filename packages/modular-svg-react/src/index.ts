// Main exports for @modular-svg/react

// Motion and timing types for typing the time intrinsics
export type {
	AnimationOptions,
	AuthoredValues,
	ColorRef,
	Ease,
	MotionStep,
	Values,
} from "@modular-svg/core";
// Re-export FiberProvider for advanced use cases
// Note: Graphic includes FiberProvider internally, so you don't need to wrap your app with it
// Only export this for users who want to use the reconciler directly without Graphic
export { FiberProvider } from "its-fine";
// Solver output for hooks: solved spans, a live clock, and cues
export type { Cue, CueHandlers, Solution, Span } from "./cues";
export { cuesBetween, useCues, useSolution } from "./cues";
// Graphic component - automatically includes context forwarding via its-fine
export type { GraphicProps } from "./Graphic";
export { Graphic } from "./Graphic";
// Reconciler exports for advanced usage and testing
export type { ReconcilerRoot } from "./reconciler";
export { act, createRoot } from "./reconciler";
