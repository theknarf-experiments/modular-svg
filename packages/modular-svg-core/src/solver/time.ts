import type { LayoutOperator } from "./operators.ts";

// Time slots: base+0 = start, base+1 = duration (seconds). Like layout's
// SubtreeChild, moving a child in time shifts every start in its time subtree
// (a mark's motions, a relation's members) by the same delta.
export type TimeChild = { base: number; subtree: readonly number[] };

export type TimeAlignment = "start" | "end" | "center";

const end = (t: Float64Array, base: number): number => t[base] + t[base + 1];

function coord(t: Float64Array, base: number, align: TimeAlignment): number {
	if (align === "start") return t[base];
	if (align === "end") return end(t, base);
	return t[base] + t[base + 1] / 2;
}

function shift(
	cur: Float64Array,
	next: Float64Array,
	child: TimeChild,
	delta: number,
): void {
	if (delta === 0) return;
	for (const base of child.subtree) next[base] = cur[base] + delta;
}

/** A container spans its members: earliest start to latest end. */
export function timeUnionOp(
	children: readonly number[],
	container: number,
): LayoutOperator {
	return (cur, next) => {
		if (children.length === 0) return;
		let lo = Infinity;
		let hi = -Infinity;
		for (const c of children) {
			lo = Math.min(lo, cur[c]);
			hi = Math.max(hi, end(cur, c));
		}
		next[container] = lo;
		next[container + 1] = hi - lo;
	};
}

/** Back to back with an exact gap; the anchor stays, the rest pack around it. */
export function sequenceOp(
	children: readonly TimeChild[],
	opts: { gap: number; anchor: number },
): LayoutOperator {
	return (cur, next) => {
		const { gap, anchor } = opts;
		const starts = children.map((c) => cur[c.base]);
		for (let i = anchor + 1; i < children.length; i++) {
			starts[i] = starts[i - 1] + cur[children[i - 1].base + 1] + gap;
		}
		for (let i = anchor - 1; i >= 0; i--) {
			starts[i] = starts[i + 1] - gap - cur[children[i].base + 1];
		}
		children.forEach((c, i) => {
			if (i !== anchor) shift(cur, next, c, starts[i] - cur[c.base]);
		});
	};
}

/** Line up starts, ends or midpoints on the anchor's. */
export function sameTimeOp(
	children: readonly TimeChild[],
	opts: { align: TimeAlignment; anchor: number },
): LayoutOperator {
	return (cur, next) => {
		const line = coord(cur, children[opts.anchor].base, opts.align);
		children.forEach((c, i) => {
			if (i === opts.anchor) return;
			shift(cur, next, c, line - coord(cur, c.base, opts.align));
		});
	};
}

/**
 * Starts spread over `total` seconds; members may overlap. `shape` maps
 * position (0..1) to progress (0..1): linear spaces evenly, an ease makes
 * the cascade speed up or settle.
 */
export function staggerOp(
	children: readonly TimeChild[],
	opts: { total: number; anchor: number; shape?: (x: number) => number },
): LayoutOperator {
	const n = children.length - 1;
	const shape = opts.shape ?? ((x: number) => x);
	const at = (i: number) => (n > 0 ? opts.total * shape(i / n) : 0);
	return (cur, next) => {
		const origin = cur[children[opts.anchor].base] - at(opts.anchor);
		children.forEach((c, i) => {
			if (i === opts.anchor) return;
			shift(cur, next, c, origin + at(i) - cur[c.base]);
		});
	};
}

/** Pin starts to an absolute time. */
export function atOp(
	children: readonly TimeChild[],
	time: number,
): LayoutOperator {
	return (cur, next) => {
		for (const c of children) shift(cur, next, c, time - cur[c.base]);
	};
}

/**
 * Each member starts no earlier than `gap` after the previous one ends. An
 * inequality: it only ever pushes later, and never moves pinned members.
 */
export function beforeOp(
	children: readonly TimeChild[],
	opts: { gap: number; movable: readonly boolean[] },
): LayoutOperator {
	return (cur, next) => {
		let floor = -Infinity;
		children.forEach((c, i) => {
			let start = cur[c.base];
			if (opts.movable[i] && start < floor) {
				shift(cur, next, c, floor - start);
				start = floor;
			}
			floor = start + cur[c.base + 1] + opts.gap;
		});
	};
}

/** The first member starts no earlier than `gap` after every other member ends (a join). */
export function afterOp(
	follower: TimeChild,
	leaders: readonly number[],
	gap: number,
): LayoutOperator {
	return (cur, next) => {
		let floor = -Infinity;
		for (const l of leaders) floor = Math.max(floor, end(cur, l) + gap);
		if (cur[follower.base] < floor)
			shift(cur, next, follower, floor - cur[follower.base]);
	};
}

/** Members stay inside the outer span, moved as little as possible. */
export function duringOp(
	outer: number,
	children: readonly TimeChild[],
	movable: readonly boolean[],
): LayoutOperator {
	return (cur, next) => {
		const lo = cur[outer];
		const hi = end(cur, outer);
		children.forEach((c, i) => {
			if (!movable[i]) return;
			const s = cur[c.base];
			const clamped = Math.max(lo, Math.min(s, hi - cur[c.base + 1]));
			shift(cur, next, c, clamped - s);
		});
	};
}

/** Members take the source's start and duration. */
export function stretchOp(
	source: number,
	children: readonly TimeChild[],
): LayoutOperator {
	return (cur, next) => {
		for (const c of children) {
			shift(cur, next, c, cur[source] - cur[c.base]);
			next[c.base + 1] = cur[source + 1];
		}
	};
}

/**
 * Snap onto a beat grid (the beat node's start is the downbeat, its duration
 * the period). The grid is every `every` beats, split into `division` steps
 * and shifted by `offset` steps (0.5 = offbeat). `align: "end"` lands the end
 * on the grid instead of the start, like a pickup into the beat. `next` only
 * pushes later, so it composes with Before/After; `nearest` may pull earlier.
 */
export function onBeatOp(
	beat: number,
	children: readonly TimeChild[],
	opts: {
		every: number;
		division: number;
		offset: number;
		align: "start" | "end";
		snap: "next" | "nearest";
		movable: readonly boolean[];
	},
): LayoutOperator {
	return (cur, next) => {
		const period = (cur[beat + 1] * opts.every) / opts.division;
		if (!(period > 0)) return;
		const origin = cur[beat] + opts.offset * period;
		children.forEach((c, i) => {
			if (!opts.movable[i]) return;
			const at = coord(cur, c.base, opts.align);
			const k = (at - origin) / period;
			// Tolerate float noise so a point sitting on the grid stays on it
			const n = opts.snap === "next" ? Math.ceil(k - 1e-6) : Math.round(k);
			shift(cur, next, c, origin + n * period - at);
		});
	};
}

/**
 * Articulation: each member lasts `fill` of the time until the next member
 * starts (1 = legato, less = staccato). The last member keeps its length.
 */
export function articulateOp(
	children: readonly number[],
	fill: number,
): LayoutOperator {
	return (cur, next) => {
		for (let i = 0; i + 1 < children.length; i++) {
			const slot = cur[children[i + 1]] - cur[children[i]];
			next[children[i] + 1] = Math.max(0, slot * fill);
		}
	};
}

/** Members last `factor` times the source's duration (note values: beats). */
export function lengthOp(
	source: number,
	children: readonly number[],
	factor: number,
): LayoutOperator {
	return (cur, next) => {
		for (const c of children) next[c + 1] = cur[source + 1] * factor;
	};
}

export const TIME_EPSILON = 1e-4;
