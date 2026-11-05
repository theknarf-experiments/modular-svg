import {
	type Cue,
	cuesBetween,
	type LayoutResult,
	type Span,
} from "@modular-svg/core";
import * as React from "react";

/** What the solver decided for a scene, handed out by Graphic's onSolve. */
export type Solution = {
	/** solved time spans of every timed node (motions, marks, relations, beats), by id */
	spans: Record<string, Span>;
	/** solved layout boxes, by id */
	boxes: LayoutResult;
	/** seconds one pass of the animation lasts (0 when nothing animates) */
	duration: number;
	loop: boolean;
	/** over-constrained relations and violated time checks */
	warnings: string[];
	/**
	 * The live animation clock in seconds since the animation began, read from
	 * the rendered SVG (so it follows playhead scrubbing and restarts).
	 * Not wrapped by loops; undefined until the SVG is on screen.
	 */
	time: () => number | undefined;
};

/** Handlers by ref id: "hit3" fires as hit3 starts, "hit3:end" as it ends. */
export type CueHandlers = Record<string, (cue: Cue) => void>;

/**
 * Call handlers as the animation reaches the refs they name. Driven by the
 * rendered animation's own clock, so cues stay in sync with what is seen.
 */
export function useCues(
	solution: Solution | undefined,
	handlers: CueHandlers,
): void {
	const latest = React.useRef(handlers);
	latest.current = handlers;

	React.useEffect(() => {
		if (!solution || typeof requestAnimationFrame !== "function") return;
		let last = solution.time();
		let frame = requestAnimationFrame(function tick() {
			const now = solution.time();
			if (now !== undefined && last !== undefined) {
				const keys = Object.keys(latest.current);
				for (const cue of cuesBetween(solution, keys, last, now)) {
					latest.current[cue.edge === "end" ? `${cue.id}:end` : cue.id]?.(cue);
				}
			}
			last = now;
			frame = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(frame);
	}, [solution]);
}

/** Keep the latest solution in state: pass `onSolve` to Graphic. */
export function useSolution(): [
	Solution | undefined,
	(solution: Solution) => void,
] {
	return React.useState<Solution>();
}

/** The clock of the animations under an SVG, in seconds (unwrapped). */
export function animationTime(svg: SVGSVGElement): number | undefined {
	if (typeof svg.getAnimations === "function") {
		for (const a of svg.getAnimations({ subtree: true })) {
			if (typeof a.currentTime === "number") return a.currentTime / 1000;
		}
	}
	// Scenes animated only through SMIL keep their own document clock
	return typeof svg.getCurrentTime === "function"
		? svg.getCurrentTime()
		: undefined;
}
