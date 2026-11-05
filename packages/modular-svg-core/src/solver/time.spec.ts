import { describe, expect, it } from "vitest";
import type { LayoutOperator } from "./operators.ts";
import { solveTime } from "./solver.ts";
import {
	afterOp,
	articulateOp,
	atOp,
	beatLengthOp,
	beatWarp,
	beforeOp,
	duringOp,
	holdOp,
	lengthOp,
	onBeatOp,
	polyrhythmOp,
	sameTimeOp,
	sequenceOp,
	staggerOp,
	stretchOp,
	type TimeChild,
	timeUnionOp,
} from "./time.ts";

// spans: [start, duration] per node; node i lives at base i*2
const solve = (spans: [number, number][], ops: LayoutOperator[]) => {
	const t = solveTime({
		nodes: [],
		operators: [],
		timeSeed: spans.flat(),
		timeOperators: ops,
	});
	return spans.map((_, i) =>
		[t[i * 2], t[i * 2 + 1]].map((v) => Math.round(v * 1e6) / 1e6),
	);
};
const leaf = (i: number): TimeChild => ({ base: i * 2, subtree: [i * 2] });

describe("time operators", () => {
	it("sequences members end to start with a gap, around the anchor", () => {
		const r = solve(
			[
				[0, 1],
				[0, 2],
				[0, 0.5],
			],
			[sequenceOp([leaf(0), leaf(1), leaf(2)], { gap: 0.25, anchor: 0 })],
		);
		expect(r.map(([s]) => s)).toEqual([0, 1.25, 3.5]);
	});

	it("packs earlier members backwards from a later anchor", () => {
		const r = solve(
			[
				[0, 1],
				[5, 2],
			],
			[sequenceOp([leaf(0), leaf(1)], { gap: 0, anchor: 1 })],
		);
		expect(r[0][0]).toBe(4);
	});

	it("aligns starts, ends or midpoints", () => {
		const ends = solve(
			[
				[1, 2],
				[0, 1],
			],
			[sameTimeOp([leaf(0), leaf(1)], { align: "end", anchor: 0 })],
		);
		expect(ends[1][0]).toBe(2);
		const mids = solve(
			[
				[1, 2],
				[0, 1],
			],
			[sameTimeOp([leaf(0), leaf(1)], { align: "center", anchor: 0 })],
		);
		expect(mids[1][0]).toBe(1.5);
	});

	it("staggers starts by exact spacing, allowing overlap", () => {
		const r = solve(
			[
				[1, 2],
				[0, 2],
				[0, 2],
			],
			[staggerOp([leaf(0), leaf(1), leaf(2)], { total: 1, anchor: 0 })],
		);
		expect(r.map(([s]) => s)).toEqual([1, 1.5, 2]);
	});

	it("moves a member's whole time subtree", () => {
		// node 1 is a group spanning nodes 2 and 3
		const group: TimeChild = { base: 2, subtree: [2, 4, 6] };
		const r = solve(
			[
				[0, 1],
				[0, 0],
				[0, 1],
				[1, 1],
			],
			[
				sequenceOp([leaf(0), group], { gap: 0, anchor: 0 }),
				timeUnionOp([4, 6], 2),
			],
		);
		expect(r[2][0]).toBe(1);
		expect(r[3][0]).toBe(2);
		expect(r[1]).toEqual([1, 2]);
	});

	it("only pushes later for Before, and respects pinned members", () => {
		const already = solve(
			[
				[0, 1],
				[3, 1],
			],
			[beforeOp([leaf(0), leaf(1)], { gap: 0, movable: [true, true] })],
		);
		expect(already[1][0]).toBe(3);
		const pushed = solve(
			[
				[0, 2],
				[1, 1],
			],
			[beforeOp([leaf(0), leaf(1)], { gap: 0.5, movable: [true, true] })],
		);
		expect(pushed[1][0]).toBe(2.5);
		const pinned = solve(
			[
				[0, 2],
				[1, 1],
			],
			[beforeOp([leaf(0), leaf(1)], { gap: 0, movable: [true, false] })],
		);
		expect(pinned[1][0]).toBe(1);
	});

	it("joins: After waits for the latest leader", () => {
		const r = solve(
			[
				[0, 0.5],
				[0, 1],
				[2, 1],
			],
			[afterOp(leaf(0), [2, 4], 0.1)],
		);
		expect(r[0][0]).toBe(3.1);
	});

	it("keeps members inside an outer span", () => {
		const r = solve(
			[
				[2, 3],
				[0, 1],
				[9, 1],
			],
			[duringOp(0, [leaf(1), leaf(2)], [true, true])],
		);
		expect(r[1][0]).toBe(2);
		expect(r[2][0]).toBe(4);
	});

	it("stretches members to the source span", () => {
		const r = solve(
			[
				[1, 4],
				[0, 0.5],
			],
			[stretchOp(0, [leaf(1)])],
		);
		expect(r[1]).toEqual([1, 4]);
	});

	it("pins starts with At", () => {
		expect(solve([[0, 1]], [atOp([leaf(0)], 1.5)])[0][0]).toBe(1.5);
	});

	it("snaps starts onto the next beat, or the nearest one", () => {
		// beat at 0.25 with a 0.5s period
		const next = solve(
			[
				[0.25, 0.5],
				[0.3, 1],
				[0.75, 1],
			],
			[
				onBeatOp(0, [leaf(1), leaf(2)], {
					every: 1,
					division: 1,
					swing: 0.5,
					offset: 0,
					align: "start",
					snap: "next",
					movable: [true, true],
				}),
			],
		);
		expect(next[1][0]).toBe(0.75);
		expect(next[2][0]).toBe(0.75);
		const bars = solve(
			[
				[0, 0.5],
				[0.1, 1],
			],
			[
				onBeatOp(0, [leaf(1)], {
					every: 4,
					division: 1,
					swing: 0.5,
					offset: 0,
					align: "start",
					snap: "next",
					movable: [true],
				}),
			],
		);
		expect(bars[1][0]).toBe(2);
		const nearest = solve(
			[
				[0, 0.5],
				[0.6, 1],
			],
			[
				onBeatOp(0, [leaf(1)], {
					every: 1,
					division: 1,
					swing: 0.5,
					offset: 0,
					align: "start",
					snap: "nearest",
					movable: [true],
				}),
			],
		);
		expect(nearest[1][0]).toBe(0.5);
	});

	it("composes inequalities with beat snapping", () => {
		const r = solve(
			[
				[0, 0.5],
				[0, 0.7],
				[0, 1],
			],
			[
				beforeOp([leaf(1), leaf(2)], { gap: 0, movable: [true, true] }),
				onBeatOp(0, [leaf(2)], {
					every: 1,
					division: 1,
					swing: 0.5,
					offset: 0,
					align: "start",
					snap: "next",
					movable: [true],
				}),
			],
		);
		expect(r[2][0]).toBe(1);
	});
});

describe("musical time operators", () => {
	const grid = {
		every: 1,
		division: 1,
		swing: 0.5,
		offset: 0,
		align: "start" as const,
		snap: "next" as const,
		movable: [true],
	};

	it("lands a pickup's end on the beat", () => {
		// beat period 1; a 0.3s pickup starting at 0.5 ends at 0.8, so it moves to end on 1
		const r = solve(
			[
				[0, 1],
				[0.5, 0.3],
			],
			[onBeatOp(0, [leaf(1)], { ...grid, align: "end" })],
		);
		expect(r[1][0]).toBe(0.7);
	});

	it("snaps to subdivisions and offbeats", () => {
		const triplets = solve(
			[
				[0, 1],
				[0.4, 1],
			],
			[onBeatOp(0, [leaf(1)], { ...grid, division: 3 })],
		);
		expect(triplets[1][0]).toBeCloseTo(2 / 3, 6);
		const offbeat = solve(
			[
				[0, 1],
				[0.6, 1],
			],
			[onBeatOp(0, [leaf(1)], { ...grid, offset: 0.5 })],
		);
		expect(offbeat[1][0]).toBe(1.5);
	});

	it("articulates: legato fills to the next start, staccato a fraction of it", () => {
		const spans: [number, number][] = [
			[0, 0.1],
			[1, 0.1],
			[3, 0.1],
		];
		const legato = solve(spans, [articulateOp([0, 2, 4], 1)]);
		expect(legato.map(([, d]) => d)).toEqual([1, 2, 0.1]);
		const staccato = solve(spans, [articulateOp([0, 2, 4], 0.5)]);
		expect(staccato.map(([, d]) => d)).toEqual([0.5, 1, 0.1]);
	});

	it("measures lengths in beats", () => {
		const r = solve(
			[
				[0, 0.5],
				[2, 1],
			],
			[lengthOp(0, [2], 3)],
		);
		expect(r[1]).toEqual([2, 1.5]);
	});

	it("shapes a stagger with an ease", () => {
		const easeOut = (x: number) => 1 - (1 - x) ** 2;
		const r = solve(
			[
				[0, 1],
				[0, 1],
				[0, 1],
			],
			[
				staggerOp([leaf(0), leaf(1), leaf(2)], {
					total: 1,
					anchor: 0,
					shape: easeOut,
				}),
			],
		);
		expect(r.map(([s]) => s)).toEqual([0, 0.75, 1]);
	});
});

describe("more musical time", () => {
	const grid = {
		every: 1,
		division: 1,
		offset: 0,
		swing: 0.5,
		align: "start" as const,
		snap: "next" as const,
		movable: [true],
	};

	it("swings every second step late", () => {
		// eighths with a 2:1 swing: the "and" falls at 2/3 of the beat
		const r = solve(
			[
				[0, 1],
				[0.55, 1],
			],
			[onBeatOp(0, [leaf(1)], { ...grid, division: 2, swing: 2 / 3 })],
		);
		expect(r[1][0]).toBeCloseTo(2 / 3, 6);
	});

	it("follows a tempo ramp: a ritardando stretches later beats", () => {
		// period 1 slowing to 2 over 4 beats: beat k lands at k + k^2/8
		const warp = beatWarp(0, 1, { ratio: 2, ramp: 4 });
		expect(warp.time(2)).toBe(2.5);
		expect(warp.time(4)).toBe(6);
		expect(warp.time(5)).toBe(8);
		expect(warp.beats(warp.time(3.3))).toBeCloseTo(3.3, 9);
		const r = solve(
			[
				[0, 1],
				[2.1, 1],
			],
			[onBeatOp(0, [leaf(1)], { ...grid, tempo: { ratio: 2, ramp: 4 } })],
		);
		expect(r[1][0]).toBe(2.5);
	});

	it("measures beat lengths in the local tempo", () => {
		// beat 4 lands at 6s, where the ramp has ended: one beat is the final period
		const after = solve(
			[
				[0, 1],
				[6, 0],
			],
			[beatLengthOp(0, [2], 1, { ratio: 2, ramp: 4 })],
		);
		expect(after[1]).toEqual([6, 2]);
		// from the downbeat, one beat spans 1 + 1/8 as the period grows
		const during = solve(
			[
				[0, 1],
				[0, 0],
			],
			[beatLengthOp(0, [2], 1, { ratio: 2, ramp: 4 })],
		);
		expect(during[1]).toEqual([0, 1.125]);
	});

	it("locks two beats into a polyrhythm", () => {
		const r = solve(
			[
				[0.5, 0.6],
				[0, 1],
			],
			[polyrhythmOp(0, 2, [3, 2])],
		);
		expect(r[1][0]).toBe(0.5);
		expect(r[1][1]).toBeCloseTo(0.9, 9);
	});

	it("holds a fermata past its members", () => {
		const r = solve(
			[
				[0, 0],
				[1, 2],
			],
			[holdOp([2], 0, 0.5)],
		);
		expect(r[0]).toEqual([1, 2.5]);
	});
});
