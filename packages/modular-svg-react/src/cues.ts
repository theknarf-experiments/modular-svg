import {
	type Cue,
	type CueClock,
	cuesBetween,
	type LayoutResult,
	type LocalSpan,
	type Span,
} from "@modular-svg/core";
import * as React from "react";

/** What the solver decided for a scene, handed out by Graphic's onSolve. */
export type Solution = {
	/**
	 * solved time spans of every timed node (motions, marks, relations, beats),
	 * by id; for what plays inside a phrase, its first pass
	 */
	spans: Record<string, Span>;
	/** what plays inside a phrase: its span in the phrase's own time */
	local: Record<string, LocalSpan>;
	/** those phrases, by id: how each plays its passes */
	clocks: Record<string, CueClock>;
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

/**
 * Handlers by ref id: "hit3" fires as hit3 starts to play, "hit3:end" as it
 * stops, on every pass of a phrase it is in (and of a looping scene).
 */
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

// How a scene's stylesheet names its keyframes
const SCENE_KEYFRAMES = /^ms[0-9a-z]+-k\d+$/;

/**
 * The CSS animations a scene's own stylesheet runs under an SVG. Whatever
 * else animates its marks (a transition from the page's styles, say) keeps
 * a clock of its own.
 */
export function sceneAnimations(svg: SVGSVGElement): Animation[] {
	if (typeof svg.getAnimations !== "function") return [];
	return svg
		.getAnimations({ subtree: true })
		.filter((a) =>
			SCENE_KEYFRAMES.test((a as Partial<CSSAnimation>).animationName ?? ""),
		);
}

/** The clock of a scene's animations under an SVG, in seconds (unwrapped). */
export function animationTime(svg: SVGSVGElement): number | undefined {
	for (const a of sceneAnimations(svg)) {
		if (typeof a.currentTime === "number") return a.currentTime / 1000;
	}
	// Scenes animated only through SMIL keep their own document clock
	return typeof svg.getCurrentTime === "function"
		? svg.getCurrentTime()
		: undefined;
}
