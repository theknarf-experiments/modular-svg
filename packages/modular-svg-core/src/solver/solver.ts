import { hslToHex } from "../color.ts";
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

type RelaxOptions = { maxIter: number; epsilon: number; damping: number };

/** Damped fixed-point iteration: each operator pulls the state part of the way to its target. */
export function relax(
	values: Float64Array,
	operators: readonly LayoutOperator[],
	{ maxIter, epsilon, damping }: RelaxOptions,
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
				const diff = next[i] - values[i];
				const abs = Math.abs(diff);
				if (abs > residual) residual = abs;
				values[i] += damping * diff;
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
	// Colors are solved by the same damped iteration over their own array
	const colors = new Float64Array(scene.colorSeed ?? []);
	relax(colors, scene.colorOperators ?? [], relaxOpts);
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
						fill: hslToHex(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]),
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
