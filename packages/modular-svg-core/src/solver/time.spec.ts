import { describe, expect, it } from "vitest";
import type { LayoutOperator } from "./operators.ts";
import { solveTime } from "./solver.ts";
import {
	afterOp,
	atOp,
	beforeOp,
	duringOp,
	onBeatOp,
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
			[staggerOp([leaf(0), leaf(1), leaf(2)], { spacing: 0.5, anchor: 0 })],
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
			[onBeatOp(0, [leaf(1)], { every: 4, snap: "next", movable: [true] })],
		);
		expect(bars[1][0]).toBe(2);
		const nearest = solve(
			[
				[0, 0.5],
				[0.6, 1],
			],
			[onBeatOp(0, [leaf(1)], { every: 1, snap: "nearest", movable: [true] })],
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
				onBeatOp(0, [leaf(2)], { every: 1, snap: "next", movable: [true] }),
			],
		);
		expect(r[2][0]).toBe(1);
	});
});
