import { oklchToDisplayRgb, rgbaToHex } from "../color.ts";

/** A solved color slot group as displayable hex (8 digits when translucent). */
const colorHex = (colors: Float64Array, base: number): string =>
	rgbaToHex(
		...oklchToDisplayRgb(colors[base], colors[base + 1], colors[base + 2]),
		colors[base + 3],
	);

import type { LayoutOperator, NodeRecord } from "./index.ts";

export type Scene = {
	nodes: NodeRecord[];
	operators: LayoutOperator[];
	/** operators over the color array (3 slots per node: h, s, l) */
	colorOperators?: LayoutOperator[];
	/** initial h,s,l per node (length nodes * 3) */
	colorSeed?: number[];
	/** ids whose solved color should be emitted into the result */
	coloredIds?: string[];
	/** operators over the time array (2 slots per node: start, duration) */
	timeOperators?: LayoutOperator[];
	/** initial start, duration per node (length nodes * 2) */
	timeSeed?: number[];
	/** ids whose solved time span should be emitted into the result */
	timedIds?: string[];
};

export type LayoutResult = Record<
	string,
	{
		x: number;
		y: number;
		width: number;
		height: number;
		fill?: string;
		/** solved start time in seconds, for timed nodes */
		start?: number;
		/** solved duration in seconds, for timed nodes */
		duration?: number;
	}
>;

/** Slots holding an angle in degrees: every `stride`th slot from `offset`. */
export type AngleSlots = { stride: number; offset: number };

type RelaxOptions = {
	maxIter: number;
	epsilon: number;
	damping: number;
	angles?: AngleSlots;
};

/** The signed shortest turn from a to b, in degrees (-180..180]. */
export const angleDiff = (a: number, b: number): number => {
	const d = ((((b - a) % 360) + 540) % 360) - 180;
	return d === -180 ? 180 : d;
};

const isAngle = (i: number, angles?: AngleSlots) =>
	angles !== undefined && i % angles.stride === angles.offset;

/** How far an operator moved slot i, taking angles the short way round. */
export const slotDiff = (
	from: number,
	to: number,
	i: number,
	angles?: AngleSlots,
) => (isAngle(i, angles) ? angleDiff(from, to) : to - from);

/** Color slots per node (OKLCH lightness, chroma, hue, alpha); hue is an angle. */
export const COLOR_SLOTS = 4;
export const COLOR_ANGLES: AngleSlots = { stride: COLOR_SLOTS, offset: 2 };

/** Damped fixed-point iteration: each operator pulls the state part of the way to its target. */
export function relax(
	values: Float64Array,
	operators: readonly LayoutOperator[],
	{ maxIter, epsilon, damping, angles }: RelaxOptions,
): void {
	if (operators.length === 0) return;
	const next = new Float64Array(values.length);
	let residual = Infinity;
	for (let iter = 0; iter < maxIter && residual > epsilon; iter++) {
		residual = 0;
		for (const op of operators) {
			next.set(values);
			op(values, next);
			for (let i = 0; i < values.length; i++) {
				const diff = slotDiff(values[i], next[i], i, angles);
				const abs = Math.abs(diff);
				if (abs > residual) residual = abs;
				values[i] += damping * diff;
				// Hues blend the short way round and stay in [0, 360)
				if (isAngle(i, angles)) values[i] = ((values[i] % 360) + 360) % 360;
			}
		}
	}
}

/** Solve only the time domain; the array holds start, duration per node. */
export function solveTime(
	scene: Scene,
	opts?: Partial<RelaxOptions>,
): Float64Array {
	const times = new Float64Array(scene.timeSeed ?? []);
	relax(times, scene.timeOperators ?? [], {
		// Time feeds keyframe percentages, so it converges further than layout
		maxIter: opts?.maxIter ?? 400,
		epsilon: opts?.epsilon ?? 1e-9,
		damping: opts?.damping ?? 0.5,
	});
	return times;
}

export function compileScene(scene: Scene): {
	indexMap: Map<string, number>;
	cur: Float64Array;
	operators: LayoutOperator[];
} {
	const indexMap = new Map<string, number>();
	scene.nodes.forEach((n, i) => {
		indexMap.set(n.id, i * 4);
	});
	const cur = new Float64Array(scene.nodes.length * 4);
	scene.nodes.forEach((n) => {
		const base = indexMap.get(n.id) as number;
		cur[base] = n.x;
		cur[base + 1] = n.y;
		cur[base + 2] = n.width;
		cur[base + 3] = n.height;
	});
	return { indexMap, cur, operators: scene.operators };
}

/** Solve only the colors: COLOR_SLOTS per node, by the same damped iteration. */
export function solveColors(
	scene: Scene,
	opts?: Partial<RelaxOptions>,
): Float64Array {
	const colors = new Float64Array(scene.colorSeed ?? []);
	relax(colors, scene.colorOperators ?? [], {
		maxIter: opts?.maxIter ?? 100,
		epsilon: opts?.epsilon ?? 1e-6,
		damping: opts?.damping ?? 0.5,
		angles: COLOR_ANGLES,
	});
	return colors;
}

export function solveLayout(
	scene: Scene,
	opts?: { maxIter?: number; epsilon?: number; damping?: number },
): LayoutResult {
	const { indexMap, cur, operators } = compileScene(scene);
	const relaxOpts = {
		maxIter: opts?.maxIter ?? 100,
		epsilon: opts?.epsilon ?? 1e-6,
		damping: opts?.damping ?? 0.5,
	};
	relax(cur, operators, relaxOpts);
	const colors = solveColors(scene, relaxOpts);
	const times = solveTime(scene, { damping: relaxOpts.damping });
	const timed = new Set(scene.timedIds ?? []);
	const colored = new Set(scene.coloredIds ?? []);

	const result: LayoutResult = {};
	scene.nodes.forEach((n, i) => {
		const base = indexMap.get(n.id) as number;
		result[n.id] = {
			x: cur[base],
			y: cur[base + 1],
			width: cur[base + 2],
			height: cur[base + 3],
			...(colored.has(n.id)
				? {
						fill: colorHex(colors, i * COLOR_SLOTS),
					}
				: {}),
			...(timed.has(n.id)
				? {
						start: roundTime(times[i * 2]),
						duration: roundTime(times[i * 2 + 1]),
					}
				: {}),
		};
	});
	return result;
}

// Keyframes are written in percentages; drop the damping residue
const roundTime = (t: number): number => Math.round(t * 1e6) / 1e6 || 0;
