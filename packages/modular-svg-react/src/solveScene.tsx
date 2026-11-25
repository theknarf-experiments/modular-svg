import {
	type JsonScene,
	type LayoutBox,
	type LayoutResult,
	layoutBounds,
	layoutToAst,
	solveLayout,
} from "@modular-svg/core";
import type * as React from "react";
import { renderScene } from "./reconciler";
import {
	type SvgElementOptions,
	type SvgReactElement,
	svgElement,
} from "./svgElement";

type Point = { x: number; y: number };

export type SolveSceneOptions = {
	/**
	 * Place `node`'s top-left at (x, y); without a node, the scene's origin.
	 * Pinning a node that holds still keeps the picture still across states,
	 * where fitting the canvas to each state's bounds would shift it
	 */
	pin?: Point & { node?: string };
	/** how marks are positioned unless `marks` says otherwise */
	position?: SvgElementOptions["position"];
};

export type SolvedScene = {
	scene: JsonScene;
	/** the solver's boxes, in the scene's own coordinates */
	layout: LayoutResult;
	/** where a node landed, in the pinned frame */
	box: (id: string) => LayoutBox;
	/** a point in the pinned frame, in the scene's own coordinates */
	toScene: (p: Point) => Point;
	/**
	 * the marks whose ids pass `pick` (all of them without one), as plain
	 * React SVG elements in the pinned frame; `origin` draws them relative to
	 * a group placed there
	 */
	marks: (
		pick?: (id: string) => boolean,
		options?: Omit<SvgElementOptions, "child">,
	) => SvgReactElement[];
};

/**
 * Lay out scene JSX right away and hand back its boxes and marks as plain
 * SVG elements, for a host that renders the picture itself: a drag library
 * that renders every state a drag could reach (Dragology), say, where
 * Graphic's asynchronous commit and its own svg do not fit.
 */
export function solveScene(
	element: React.ReactNode,
	options: SolveSceneOptions = {},
): SolvedScene {
	const scene = renderScene(element);
	const layout = solveLayout(scene);
	const doc = layoutToAst(layout, scene.nodes, 0, { animation: false });
	// layoutToAst moves the bounds' start to 0; marks move back from there
	const { start } = layoutBounds(layout, scene.nodes);
	const pin = options.pin ?? { x: 0, y: 0 };
	const pinned = pin.node ? layout[pin.node] : { x: 0, y: 0 };
	if (!pinned) throw new Error(`No node ${pin.node} in the scene`);
	const shift = { x: pin.x - pinned.x, y: pin.y - pinned.y };

	return {
		scene,
		layout,
		box: (id) => {
			const b = layout[id];
			if (!b) throw new Error(`No node ${id} in the scene`);
			return { ...b, x: b.x + shift.x, y: b.y + shift.y };
		},
		toScene: ({ x, y }) => ({ x: x - shift.x, y: y - shift.y }),
		marks: (pick, opts = {}) => {
			const origin = opts.origin ?? { x: 0, y: 0 };
			return doc.children
				.filter((el) => !pick || (el.id !== undefined && pick(el.id)))
				.map((el) =>
					svgElement(el, {
						position: options.position,
						...opts,
						origin: {
							x: origin.x - start.x - shift.x,
							y: origin.y - start.y - shift.y,
						},
					}),
				);
		},
	};
}
