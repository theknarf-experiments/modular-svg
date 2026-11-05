import { describe, expect, it } from "vitest";
import {
	expandMotion,
	intrinsicDuration,
	keysOf,
	resolveEase,
} from "./motion.ts";

describe("motion expansion", () => {
	it("places an enter over its solved span", () => {
		const { initial, steps } = expandMotion(
			{ kind: "enter", from: { y: 20, opacity: 0 } },
			1,
			0.5,
			10,
		);
		expect(initial).toEqual({ y: 20, opacity: 0 });
		expect(steps).toEqual([
			{
				start: 1,
				over: 0.5,
				ease: resolveEase("out"),
				values: { y: 0, opacity: 1 },
			},
		]);
	});

	it("rejects non-rest channels on enter", () => {
		expect(() =>
			expandMotion({ kind: "enter", from: { fill: "red" } }, 0, 1, 1),
		).toThrow(/use Motion for fill/);
	});

	it("scales a motion's relative steps to the solved duration", () => {
		const spec = {
			kind: "motion" as const,
			from: { opacity: 0 },
			steps: [
				{ to: { opacity: 1 }, over: 1 },
				{ wait: 2 },
				{ to: { opacity: 0 }, over: 1, ease: "in" as const },
			],
		};
		expect(intrinsicDuration(spec)).toBe(4);
		const { steps } = expandMotion(spec, 2, 8, 20);
		expect(steps.map((s) => [s.start, s.over])).toEqual([
			[2, 2],
			[8, 2],
		]);
	});

	it("refuses two overlapping transitions on one lane", () => {
		const spec = {
			kind: "motion" as const,
			steps: [
				{ to: { x: 1 }, over: 1 },
				{ at: 0.5, to: { y: 1 }, over: 1 },
			],
		};
		expect(() => expandMotion(spec, 0, 1.5, 2)).toThrow(/translate/);
	});

	it("unrolls a loop until the scene ends, cutting the last pass", () => {
		const { steps } = expandMotion({ kind: "draw", loop: true }, 1, 1, 2.5);
		expect(steps.map((s) => [s.start, s.over])).toEqual([
			[1, 1],
			[2, 0],
			[2, 0.5],
		]);
	});

	it("makes a deterministic damped shake ending at rest", () => {
		const { steps } = expandMotion(
			{ kind: "shake", amplitude: { x: 6 }, rate: 4 },
			0,
			1,
			1,
		);
		expect(steps).toHaveLength(4);
		expect(steps[0].values.x).toBe(-4.5);
		expect(steps[3].values.x).toBe(0);
	});

	it("wiggles reproducibly per seed", () => {
		const a = expandMotion(
			{ kind: "wiggle", amplitude: { rotate: 4 }, seed: "leaf" },
			0,
			2,
			2,
		);
		const b = expandMotion(
			{ kind: "wiggle", amplitude: { rotate: 4 }, seed: "leaf" },
			0,
			2,
			2,
		);
		const c = expandMotion(
			{ kind: "wiggle", amplitude: { rotate: 4 }, seed: "tree" },
			0,
			2,
			2,
		);
		expect(a).toEqual(b);
		expect(a).not.toEqual(c);
		// the last sample returns to the first, so the loop is seamless
		expect(a.steps.at(-1)?.values).toEqual(a.initial);
	});

	it("bakes a sampled function, keeping few keys on straight runs and cutting jumps", () => {
		const line = expandMotion(
			{
				kind: "sampled",
				fn: (t) => ({ x: 10 * t }),
				tolerance: { translate: 0.1 },
			},
			0,
			2,
			2,
		);
		expect(line.steps).toHaveLength(1);
		const saw = expandMotion(
			{
				kind: "sampled",
				fn: (t) => ({ rotate: (t * 360) % 360 }),
				tolerance: { rotate: 1 },
			},
			0,
			1.5,
			1.5,
		);
		expect(saw.steps.some((s) => s.over === 0)).toBe(true);
		expect(() =>
			expandMotion(
				{ kind: "sampled", fn: (t) => ({ x: t }), tolerance: {} },
				0,
				1,
				1,
			),
		).toThrow(/tolerance for translate/);
	});
});

describe("keysOf", () => {
	it("holds between transitions and ends on the period", () => {
		const keys = keysOf(
			{ opacity: 0 },
			[
				{
					start: 1,
					over: 1,
					ease: resolveEase("linear"),
					values: { opacity: 1 },
				},
			],
			4,
		);
		expect(keys.map((k) => [k.t, k.values.opacity])).toEqual([
			[0, 0],
			[1, 0],
			[2, 1],
			[4, 1],
		]);
	});

	it("turns a cut into a held key followed by the new value", () => {
		const keys = keysOf(
			{ scale: 1 },
			[{ start: 2, over: 0, ease: resolveEase("hold"), values: { scale: 2 } }],
			4,
		);
		expect(keys.map((k) => [k.t, k.values.scale, k.ease.kind])).toEqual([
			[0, 1, "steps"],
			[2, 2, "bezier"],
			[4, 2, "bezier"],
		]);
	});
});
