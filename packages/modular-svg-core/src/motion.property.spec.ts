import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cuesBetween } from "./cues.ts";
import {
	easeAt,
	expandMotion,
	keysOf,
	type MotionSpec,
	resolveEase,
} from "./motion.ts";
import { beatWarp, snapToGrid } from "./solver/time.ts";

const easeArb = fc.oneof(
	fc.constantFrom(
		"linear" as const,
		"in" as const,
		"out" as const,
		"inOut" as const,
		"hold" as const,
	),
	fc.integer({ min: 1, max: 8 }).map((n) => `steps(${n})` as const),
	// y control points in [0, 1] keep the curve monotone
	fc.tuple(
		fc.double({ min: 0, max: 1, noNaN: true }),
		fc.double({ min: 0, max: 1, noNaN: true }),
		fc.double({ min: 0, max: 1, noNaN: true }),
		fc.double({ min: 0, max: 1, noNaN: true }),
	),
);

const specArb: fc.Arbitrary<MotionSpec> = fc.oneof(
	fc.record({
		kind: fc.constant("enter" as const),
		from: fc.constant({ opacity: 0, y: 10 }),
		ease: easeArb,
	}),
	fc.record({
		kind: fc.constant("exit" as const),
		to: fc.constant({ scale: 0 }),
	}),
	fc.record({ kind: fc.constant("draw" as const), loop: fc.boolean() }),
	fc.record({
		kind: fc.constant("shake" as const),
		amplitude: fc.constant({ x: 6 }),
		rate: fc.integer({ min: 2, max: 20 }),
	}),
	fc.record({
		kind: fc.constant("wiggle" as const),
		amplitude: fc.constant({ rotate: 4 }),
		seed: fc.string(),
		loop: fc.constant(true),
	}),
	fc.record({
		kind: fc.constant("motion" as const),
		from: fc.constant({ opacity: 0 }),
		steps: fc.array(
			fc.oneof(
				fc.record({
					to: fc.record({
						opacity: fc.double({ min: 0, max: 1, noNaN: true }),
					}),
					over: fc.constantFrom(0.1, 0.5, 1),
				}),
				fc.record({ wait: fc.constantFrom(0.1, 0.5) }),
				fc.record({ set: fc.constant({ opacity: 1 }) }),
			),
			{ maxLength: 5 },
		),
		loop: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
	}),
);

describe("motions (properties)", () => {
	it("expanded steps stay inside the scene with finite values", () => {
		fc.assert(
			fc.property(
				specArb,
				fc.double({ min: 0, max: 3, noNaN: true }),
				fc.double({ min: 0.1, max: 3, noNaN: true }),
				(spec, start, duration) => {
					const sceneEnd = start + duration * 4;
					const { initial, steps } = expandMotion(
						spec,
						start,
						duration,
						sceneEnd,
					);
					for (const v of Object.values(initial))
						if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
					for (const step of steps) {
						expect(step.start).toBeGreaterThanOrEqual(start - 1e-9);
						expect(step.over).toBeGreaterThanOrEqual(0);
						expect(step.start + step.over).toBeLessThanOrEqual(sceneEnd + 1e-9);
						for (const v of Object.values(step.values))
							if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
					}
				},
			),
		);
	});

	it("keys are ordered and run from 0 to the period", () => {
		fc.assert(
			fc.property(
				specArb,
				fc.double({ min: 0.1, max: 2, noNaN: true }),
				(spec, duration) => {
					const period = duration * 4;
					const { initial, steps } = expandMotion(spec, 0, duration, period);
					const lane = Object.keys(initial)[0] ?? "opacity";
					const segments = steps.filter((s) => lane in s.values);
					const keys = keysOf(
						{ [lane]: initial[lane as keyof typeof initial] ?? 0 },
						segments,
						period,
					);
					expect(keys[0].t).toBe(0);
					expect(keys.at(-1)?.t).toBeCloseTo(period, 9);
					for (let i = 1; i < keys.length; i++)
						expect(keys[i].t).toBeGreaterThanOrEqual(keys[i - 1].t);
				},
			),
		);
	});

	it("eases start at 0, end at 1 and never go back", () => {
		fc.assert(
			fc.property(
				easeArb,
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 1, noNaN: true }),
				(ease, a, b) => {
					const e = resolveEase(ease);
					expect(easeAt(e, 0)).toBe(0);
					expect(easeAt(e, 1)).toBe(1);
					const [lo, hi] = a < b ? [a, b] : [b, a];
					expect(easeAt(e, hi)).toBeGreaterThanOrEqual(easeAt(e, lo) - 1e-9);
				},
			),
		);
	});
});

const tempoArb = fc.option(
	fc.record({
		ratio: fc.double({ min: 0.25, max: 4, noNaN: true }),
		ramp: fc.integer({ min: 1, max: 8 }),
	}),
	{ nil: undefined },
);

describe("beat math (properties)", () => {
	it("beats and seconds convert back and forth, in order", () => {
		fc.assert(
			fc.property(
				fc.double({ min: -2, max: 2, noNaN: true }),
				fc.double({ min: 0.1, max: 2, noNaN: true }),
				tempoArb,
				fc.double({ min: -4, max: 20, noNaN: true }),
				fc.double({ min: 0.01, max: 3, noNaN: true }),
				(origin, period, tempo, u, du) => {
					const warp = beatWarp(origin, period, tempo);
					expect(warp.beats(warp.time(u))).toBeCloseTo(u, 6);
					expect(warp.time(u + du)).toBeGreaterThan(warp.time(u));
				},
			),
		);
	});

	it("snapping lands on the grid, never earlier for next, and is idempotent", () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 20, noNaN: true }),
				fc.double({ min: 0.1, max: 2, noNaN: true }),
				fc.record({
					every: fc.constantFrom(1, 2, 4),
					division: fc.constantFrom(1, 2, 3),
					offset: fc.constantFrom(0, 0.5),
					swing: fc.constantFrom(0.5, 2 / 3),
					tempo: tempoArb,
				}),
				(t, period, grid) => {
					const next = snapToGrid(t, 0, period, grid, "next");
					expect(next).toBeGreaterThanOrEqual(t - 1e-6);
					expect(snapToGrid(next, 0, period, grid, "next")).toBeCloseTo(
						next,
						6,
					);
					expect(snapToGrid(next, 0, period, grid, "nearest")).toBeCloseTo(
						next,
						6,
					);
				},
			),
		);
	});
});

// Times on a 10ms grid: sub-ulp spans cannot be shifted by a period exactly
const centis = (max: number) =>
	fc.integer({ min: 0, max: max * 100 }).map((n) => n / 100);
const cueSolutionArb = fc.record({
	spans: fc.dictionary(
		fc.constantFrom("a", "b", "c", "d"),
		fc.record({ start: centis(4), duration: centis(1) }),
	),
	duration: fc.constant(5),
	loop: fc.boolean(),
});
const keys = ["a", "b", "c", "d", "a:end", "c:end"];

describe("cues (properties)", () => {
	it("firing over (a, b] then (b, c] is the same as over (a, c]", () => {
		fc.assert(
			fc.property(
				cueSolutionArb,
				fc
					.tuple(centis(20), centis(20), centis(20))
					.map((xs) => xs.sort((x, y) => x - y)),
				(solution, [a, b, c]) => {
					const split = [
						...cuesBetween(solution, keys, a, b),
						...cuesBetween(solution, keys, b, c),
					];
					expect(split).toEqual(cuesBetween(solution, keys, a, c));
				},
			),
		);
	});

	it("a looping scene repeats its cues every period", () => {
		fc.assert(
			fc.property(
				cueSolutionArb,
				centis(10),
				centis(4),
				(solution, a, width) => {
					const looped = { ...solution, loop: true };
					const once = cuesBetween(looped, keys, a, a + width);
					const later = cuesBetween(looped, keys, a + 5, a + width + 5);
					expect(later.map((c) => c.id)).toEqual(once.map((c) => c.id));
				},
			),
		);
	});
});

describe("diverged inputs", () => {
	it("snapping and cues terminate on huge or infinite times", () => {
		const grid = { every: 1, division: 1, offset: 0, swing: 0.5 };
		for (const t of [1e17, 1e300, Number.POSITIVE_INFINITY, Number.NaN]) {
			expect(() => snapToGrid(t, 0, 0.5, grid, "next")).not.toThrow();
		}
		const solution = {
			spans: { a: { start: 0, duration: 1 } },
			duration: 5,
			loop: true,
		};
		expect(
			cuesBetween(solution, ["a"], 1e17, 1e17 + 10).length,
		).toBeLessThanOrEqual(3);
	});

	it("refuses to unroll a loop into thousands of passes", () => {
		expect(() =>
			expandMotion({ kind: "draw", loop: true }, 0, 1e-4, 10),
		).toThrow(/would repeat \d+ times/);
	});
});
