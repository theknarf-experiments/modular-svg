import { oklchToDisplayRgb, rgbaToHex } from "../color.ts";

/** A solved color slot group as displayable hex (8 digits when translucent). */
const colorHex = (colors: Float64Array, base: number): string =>
	rgbaToHex(
		...oklchToDisplayRgb(colors[base], colors[base + 1], colors[base + 2]),
		colors[base + 3],
	);

import { passesOf } from "../motion.ts";
import { type Clock, imageOf } from "../phrase.ts";
import type { LayoutOperator, NodeRecord } from "./index.ts";
import {
	foldPhases,
	type LayoutBox,
	type PhaseOperators,
	phaseMoves,
	solvePhase,
	solvePhases,
} from "./phases.ts";

export type Scene = {
	nodes: NodeRecord[];
	operators: LayoutOperator[];
	/** operators over the color array (3 slots per node: h, s, l) */
	colorOperators?: LayoutOperator[];
	/** initial h,s,l per node (length nodes * 3) */
	colorSeed?: number[];
	/** solved paints to emit into the result, as "id:fill" or "id:stroke" */
	coloredPaints?: string[];
	/** operators over the time array (2 slots per node: start, duration) */
	timeOperators?: LayoutOperator[];
	/** initial start, duration per node (nodes * 2, then the slots of timeViews) */
	timeSeed?: number[];
	/** spans a phrase's content reads from the time around it, and that content's slots */
	timeViews?: { operators: LayoutOperator[]; inside: number[] };
	/** ids whose solved time span should be emitted into the result */
	timedIds?: string[];
	/** the layout relations that hold while the given Modulates are active */
	phaseOperators?: PhaseOperators;
	/** boxes no home relation reads: written once from the solved home */
	restOperators?: LayoutOperator[];
};

export type LayoutResult = Record<
	string,
	{
		x: number;
		y: number;
		width: number;
		height: number;
		/** solved fill, when a color relation set it */
		fill?: string;
		/** solved stroke, when a color relation set it */
		stroke?: string;
		/** solved start time in seconds, for timed nodes */
		start?: number;
		/** solved duration in seconds, for timed nodes */
		duration?: number;
		/**
		 * for nodes inside a phrase: the span in the phrase's own time (start and
		 * duration are then where its first pass lands in scene time)
		 */
		local?: { start: number; duration: number };
		/** for phrases: how long one pass is in the phrase's own time */
		length?: number;
		/**
		 * where a Modulate or Resolve moves the node to, by the id of each one
		 * that moves it; x, y, width and height stay the home layout
		 */
		phases?: Record<string, LayoutBox>;
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

/**
 * Damped fixed-point iteration: each operator pulls the state part of the way
 * to its target. `mirror` is a copy of `values` to work in, for a caller that
 * solves many times over one state; it is a copy again on return.
 */
export function relax(
	values: Float64Array,
	operators: readonly LayoutOperator[],
	{ maxIter, epsilon, damping, angles }: RelaxOptions,
	mirror?: Float64Array,
): void {
	if (operators.length === 0) return;
	// next mirrors values between operators; an operator that declares its
	// writes only has those slots copied back and checked (linear per sweep),
	// one that does not gets the full scan
	const next = mirror ?? new Float64Array(values);
	let residual = Infinity;
	const settle = (i: number): void => {
		const diff = slotDiff(values[i], next[i], i, angles);
		const abs = Math.abs(diff);
		if (abs > residual) residual = abs;
		values[i] += damping * diff;
		// Hues blend the short way round and stay in [0, 360)
		if (isAngle(i, angles)) values[i] = ((values[i] % 360) + 360) % 360;
		next[i] = values[i];
	};
	for (let iter = 0; iter < maxIter && residual > epsilon; iter++) {
		residual = 0;
		for (const op of operators) {
			op(values, next);
			if (op.writes) for (const i of op.writes) settle(i);
			else for (let i = 0; i < values.length; i++) settle(i);
		}
	}
}

/** Solve only the time domain; the array holds start, duration per node. */
export function solveTime(
	scene: Scene,
	opts?: Partial<RelaxOptions>,
): Float64Array {
	const seed = scene.timeSeed ?? [];
	const times = new Float64Array(seed);
	const options = {
		// Time feeds keyframe percentages, so it converges further than layout
		maxIter: opts?.maxIter ?? 400,
		epsilon: opts?.epsilon ?? 1e-9,
		damping: opts?.damping ?? 0.5,
	};
	relax(times, scene.timeOperators ?? [], options);
	// The time around a phrase comes first: while the phrase is still finding
	// its start the beat it reads drifts, and what snaps onto a drifting beat
	// overshoots for good. So its content starts over once the rest is settled
	const inside = scene.timeViews?.inside ?? [];
	if (inside.length > 0) {
		for (const i of inside) times[i] = seed[i];
		relax(times, scene.timeOperators ?? [], options);
	}
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
	for (const rest of scene.restOperators ?? []) rest(cur, cur);
	const colors = solveColors(scene, relaxOpts);
	const times = solveTime(scene, { damping: relaxOpts.damping });
	const timed = new Set(scene.timedIds ?? []);
	const colored = new Set(scene.coloredPaints ?? []);

	// Phrases: what plays inside holds the phrase's own seconds
	const index = new Map(scene.nodes.map((n, i) => [n.id, i]));
	const lengths = new Map<string, number>();
	scene.nodes.forEach((n, i) => {
		if (n.clock === undefined || !timed.has(n.id)) return;
		// A numbered loop plays all its passes inside the phrase
		const end = times[i * 2] + times[i * 2 + 1] * passesOf(n.motion?.loop);
		lengths.set(n.clock, Math.max(lengths.get(n.clock) ?? 0, end));
	});
	const clockAt = (id: string): Clock | undefined => {
		const i = index.get(id);
		const phrase = i === undefined ? undefined : scene.nodes[i].phrase;
		if (i === undefined || !phrase) return undefined;
		return {
			start: times[i * 2],
			span: times[i * 2 + 1],
			length: lengths.get(id) ?? 0,
			...phrase,
		};
	};
	const spanOf = (n: NodeRecord, i: number) => {
		const local = { start: times[i * 2], duration: times[i * 2 + 1] };
		const rounded = {
			start: roundTime(local.start),
			duration: roundTime(local.duration),
		};
		if (n.clock === undefined) return rounded;
		let span = local;
		let node: NodeRecord | undefined = n;
		for (let d = 0; node?.clock !== undefined && d < scene.nodes.length; d++) {
			const clock = clockAt(node.clock);
			if (!clock) break;
			span = imageOf(clock, span);
			node = scene.nodes[index.get(node.clock) as number];
		}
		return {
			start: roundTime(span.start),
			duration: roundTime(span.duration),
			local: rounded,
		};
	};

	// Layout in time: one more solve per distinct set of active modulations
	const clocks = scene.phaseOperators
		? foldPhases(scene.nodes, (id) => {
				const i = index.get(id);
				return i !== undefined && timed.has(id)
					? {
							start: roundTime(times[i * 2]),
							duration: roundTime(times[i * 2 + 1]),
						}
					: undefined;
			})
		: [];
	const phased = (phaseOperators: PhaseOperators) => {
		// Every phase is solved from home on the one state, then put back
		const [state, mirror] = [new Float64Array(cur), new Float64Array(cur)];
		return solvePhases(phaseOperators, clocks, (phase) =>
			solvePhase(phase, cur, state, mirror, (values, next) =>
				relax(values, phase, relaxOpts, next),
			),
		);
	};
	const moves =
		scene.phaseOperators && clocks.length > 0
			? phaseMoves(cur, clocks, phased(scene.phaseOperators))
			: undefined;

	const result: LayoutResult = {};
	scene.nodes.forEach((n, i) => {
		const base = indexMap.get(n.id) as number;
		result[n.id] = {
			x: cur[base],
			y: cur[base + 1],
			width: cur[base + 2],
			height: cur[base + 3],
			...(colored.has(`${n.id}:fill`)
				? { fill: colorHex(colors, i * COLOR_SLOTS * 2) }
				: {}),
			...(colored.has(`${n.id}:stroke`)
				? { stroke: colorHex(colors, i * COLOR_SLOTS * 2 + COLOR_SLOTS) }
				: {}),
			...(timed.has(n.id) ? spanOf(n, i) : {}),
			...(n.phrase ? { length: roundTime(lengths.get(n.id) ?? 0) } : {}),
			...(moves?.[i] ? { phases: moves[i] } : {}),
		};
	});
	return result;
}

// Keyframes are written in percentages; drop the damping residue
const roundTime = (t: number): number => Math.round(t * 1e6) / 1e6 || 0;
