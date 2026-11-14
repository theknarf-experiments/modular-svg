import { backwards, type Clock } from "./phrase.ts";
import type { NodeRecord } from "./solver/operators.ts";
import type { LayoutResult } from "./solver/solver.ts";

/** A solved time span, in seconds. */
export type Span = { start: number; duration: number };

/** A span in the own time of the phrase `clock`. */
export type LocalSpan = Span & { clock: string };

/** A phrase's passes; `clock` is the phrase it plays in, if any. */
export type CueClock = Clock & { clock?: string };

export type Cue = { id: string; edge: "start" | "end"; at: number };

type Schedule = {
	/** in scene time; for what plays inside a phrase, its first pass */
	spans: Record<string, Span>;
	/** what plays inside a phrase: its span in the phrase's own time */
	local?: Record<string, LocalSpan>;
	/** those phrases, by id */
	clocks?: Record<string, CueClock>;
};

/** The spans and phrases of a solved scene, for `cuesBetween`. */
export function cueSchedule(
	layout: LayoutResult,
	nodes: readonly NodeRecord[],
): Required<Schedule> {
	const spans: Record<string, Span> = {};
	const local: Record<string, LocalSpan> = {};
	const clocks: Record<string, CueClock> = {};
	for (const n of nodes) {
		const box = layout[n.id];
		if (box?.start === undefined) continue;
		const scene = { start: box.start, duration: box.duration ?? 0 };
		const own = box.local ?? scene;
		const inside = n.clock !== undefined ? { clock: n.clock } : {};
		spans[n.id] = scene;
		if (n.clock !== undefined) local[n.id] = { ...own, clock: n.clock };
		if (!n.phrase) continue;
		clocks[n.id] = {
			start: own.start,
			span: own.duration,
			length: box.length ?? 0,
			...n.phrase,
			...inside,
		};
	}
	return { spans, local, clocks };
}

type Interval = [start: number, end: number];

// Most passes of one phrase, or of the scene, looked at for one cue
const MOST = 1e4;
// Windows are widened by this on the way in; the cue's own time decides
const SLACK = 1e-6;

/**
 * When a span plays, in the time around its outermost phrase: once per pass
 * of every phrase it is in, running from when it starts to play until it
 * stops (so a backward pass swaps its edges). Only passes that can touch
 * [lo, hi] are looked at. `until` is where that time ends.
 */
function playsOf(
	local: Span,
	chain: readonly CueClock[],
	until: number,
): {
	first: number;
	last: number;
	within: (lo: number, hi: number) => Interval[];
} {
	const within = (
		i: number,
		lo: number,
		hi: number,
		ends: number,
	): Interval[] => {
		if (i === chain.length)
			return [[local.start, local.start + local.duration]];
		const c = chain[i];
		const forever = !Number.isFinite(c.repeat);
		const pass = forever ? c.span : c.span / c.repeat;
		if (!(pass > 0) || !(c.length > 0)) return [];
		const k = pass / c.length;
		const passes = forever
			? Math.ceil((ends - c.start) / pass - 1e-9)
			: c.repeat;
		const from = Math.max(0, Math.floor((lo - c.start) / pass) - 1);
		const to = Math.min(passes - 1, Math.floor((hi - c.start) / pass) + 1);
		const found: Interval[] = [];
		for (let j = from; j <= to && j - from < MOST; j++) {
			const origin = c.start + j * pass;
			const back = backwards(c, j);
			const [a, b] = [(lo - origin) / k - SLACK, (hi - origin) / k + SLACK];
			const inner = back
				? within(i + 1, c.length - b, c.length - a, c.length)
				: within(i + 1, a, b, c.length);
			for (const [s, e] of inner) {
				const start = origin + (back ? c.length - e : s) * k;
				const end = origin + (back ? c.length - s : e) * k;
				// A phrase that repeats until its time ends is cut there
				if (forever && start >= ends - 1e-9) continue;
				found.push([start, forever ? Math.min(end, ends) : end]);
			}
		}
		return found;
	};
	const outer = chain[0];
	if (!outer) {
		const at: Interval = [local.start, local.start + local.duration];
		return { first: at[0], last: at[1], within: () => [at] };
	}
	return {
		first: outer.start,
		last: Number.isFinite(outer.repeat) ? outer.start + outer.span : until,
		within: (lo, hi) => within(0, lo, hi, until),
	};
}

/**
 * Cues whose time falls in (from, to] on the unwrapped clock. A looping
 * scene repeats every cue each pass, and what plays inside a phrase fires on
 * every pass of the phrase: "start" as it starts to play and "end" as it
 * stops, whichever way the pass runs. A backwards jump (scrubbing) fires
 * nothing.
 */
export function cuesBetween(
	solution: Schedule & { duration: number; loop: boolean },
	keys: readonly string[],
	from: number,
	to: number,
): Cue[] {
	// Compare on a nanosecond grid, so float noise cannot make a cue fire in
	// one pass of a loop and not the next, or twice across a frame boundary
	const q = (t: number) => Math.round(t * 1e9);
	const [lo, hi] = [q(from), q(to)];
	if (!(hi > lo)) return [];
	const fires = (t: number) => q(t) > lo && q(t) <= hi;
	const found: Cue[] = [];
	const period = solution.duration;
	for (const key of keys) {
		const [id, suffix] = key.split(":");
		const span = solution.spans[id];
		if (!span) continue;
		const edge = suffix === "end" ? "end" : "start";
		// The phrases the span plays in, outermost first
		const inside = solution.local?.[id];
		const chain: CueClock[] = [];
		for (
			let at = inside?.clock;
			at !== undefined && solution.clocks?.[at] && chain.length < MOST;
			at = solution.clocks[at].clock
		)
			chain.unshift(solution.clocks[at]);
		const plays = playsOf(
			chain.length > 0 && inside ? inside : span,
			chain,
			period,
		);
		const edgeOf = (play: Interval) => play[edge === "end" ? 1 : 0];
		if (solution.loop && period > 0) {
			// Pass n plays a cue at its time + n * period; count passes, not n, so
			// a huge clock cannot stall the loop
			const bound =
				chain.length > 0 ? plays.last : edgeOf([plays.first, plays.last]);
			const least = chain.length > 0 ? plays.first : bound;
			const first = Math.max(0, Math.floor((from - bound) / period));
			const passes = Math.min(
				MOST,
				Math.floor((to - least) / period) - first + 2,
			);
			for (let j = 0; j < passes; j++) {
				const shift = (first + j) * period;
				for (const play of plays.within(from - shift, to - shift)) {
					const t = edgeOf(play) + shift;
					if (fires(t)) found.push({ id, edge, at: t });
				}
			}
		} else
			for (const play of plays.within(from, to)) {
				const at = edgeOf(play);
				if (fires(at)) found.push({ id, edge, at });
			}
	}
	// Cues at the same instant keep key order, whatever float noise says
	return found.sort((a, b) => q(a.at) - q(b.at));
}
