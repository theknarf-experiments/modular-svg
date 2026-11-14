import { describe, expect, it } from "vitest";
import {
	clampEase,
	type Ease,
	easeAt,
	easeProblems,
	expandMotion,
	intrinsicDuration,
	keysOf,
	MAX_STOPS,
	type MotionSpec,
	mixNumbers,
	progressWindow,
	resolveEase,
	sampleAt,
	settleTime,
	springAt,
} from "./motion.ts";
import { reverseEase } from "./phrase.ts";
import { along, arcPoints, routeOf, smoothThrough } from "./route.ts";

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

	it("starts every pass of a loop from rest when the motion has no from", () => {
		const { steps } = expandMotion(
			{
				kind: "motion",
				steps: [{ to: { x: 10, scale: 2 }, over: 1 }],
				loop: 2,
			},
			0,
			1,
			5,
		);
		expect(steps.map((s) => [s.start, s.over, s.values])).toEqual([
			[0, 1, { x: 10, scale: 2 }],
			[1, 0, { x: 0, scale: 1 }],
			[1, 1, { x: 10, scale: 2 }],
		]);
	});

	it("plays every other pass of an alternating loop backwards, with no cut at the turn", () => {
		const spec: MotionSpec = {
			kind: "motion",
			steps: [{ to: { x: 10 }, over: 1, ease: "in" }],
			loop: true,
			alternate: true,
		};
		const { initial, steps } = expandMotion(spec, 1, 1, 3.5);
		expect(initial).toEqual({});
		expect(steps.map((s) => [s.start, s.over, s.values.x])).toEqual([
			[1, 1, 10],
			[2, 1, 0],
			[3, 0.5, 10],
		]);
		expect(steps[1].ease).toEqual(reverseEase(resolveEase("in")));
	});

	it("keeps a cut that lands exactly on the scene end in the last pass of a loop", () => {
		const spec: MotionSpec = {
			kind: "motion",
			steps: [{ to: { x: 10 }, over: 1 }, { set: { x: 0 } }],
			loop: true,
		};
		const { steps } = expandMotion(spec, 0, 1, 2);
		expect(steps.map((s) => [s.start, s.over, s.values.x])).toEqual([
			[0, 1, 10],
			[1, 0, 0],
			// the pass starts over from rest
			[1, 0, 0],
			[1, 1, 10],
			[2, 0, 0],
		]);
		// a pass that would only begin at the end still does not
		const tight = expandMotion({ kind: "draw", loop: true }, 0, 1, 2);
		expect(tight.steps.map((s) => s.start)).toEqual([0, 1, 1]);
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

	it("lands several cuts at the very end on one last key", () => {
		const cut = (x: number) => ({
			start: 2,
			over: 0,
			ease: resolveEase("hold"),
			values: { x },
		});
		const keys = keysOf(
			{ x: 0 },
			[
				{ start: 1, over: 1, ease: resolveEase("linear"), values: { x: 5 } },
				cut(7),
				cut(9),
			],
			2,
		);
		expect(keys.map((k) => k.values.x)).toEqual([0, 0, 5, 9]);
		expect(new Set(keys.map((k) => k.t)).size).toBe(keys.length);
	});
});

describe("springs and sampled eases", () => {
	const shaped: Ease[] = [
		"spring",
		"bounce",
		"elastic",
		{ kind: "spring", bounce: 0.7 },
		{ kind: "spring", bounce: -0.5 },
		{ kind: "spring", stiffness: 180, damping: 12 },
		{ kind: "bounce", bounces: 5, elasticity: 0.7 },
		{ kind: "elastic", period: 0.15 },
	];

	it("resolves each to bounded stops with exact ends", () => {
		for (const ease of shaped) {
			const e = resolveEase(ease);
			if (e.kind !== "stops") throw new Error("expected stops");
			expect(e.stops.length).toBeLessThanOrEqual(MAX_STOPS);
			expect(e.stops[0]).toEqual([0, 0]);
			expect(e.stops[e.stops.length - 1]).toEqual([1, 1]);
			expect(easeAt(e, 0)).toBe(0);
			expect(easeAt(e, 1)).toBe(1);
		}
	});

	it("draws a spring to within a few thousandths of its response", () => {
		const e = resolveEase({ kind: "spring", bounce: 0.4 });
		// Damping ratio 0.6 over its own settle time
		const length = -Math.log(0.001 * Math.sqrt(1 - 0.36)) / 0.6;
		let peak = 0;
		for (let x = 0.005; x < 1; x += 0.005) {
			const y = easeAt(e, x);
			peak = Math.max(peak, y);
			expect(Math.abs(y - springAt(0.6, 1, x * length))).toBeLessThan(0.004);
		}
		expect(peak).toBeGreaterThan(1.08);
		expect(peak).toBeLessThan(1.11);
	});

	it("never passes the target on a bounce", () => {
		const e = resolveEase("bounce");
		for (let x = 0; x <= 1; x += 0.01)
			expect(easeAt(e, x)).toBeLessThanOrEqual(1);
		// Penner's easeOutBounce at a half
		expect(easeAt(e, 0.5)).toBeCloseTo(0.7656, 2);
	});

	it("names the anticipating and overshooting beziers", () => {
		expect(resolveEase("overshoot")).toEqual(resolveEase("pop"));
		expect(easeAt(resolveEase("anticipate"), 0.3)).toBeLessThan(0);
		const both = resolveEase("anticipateOvershoot");
		expect(easeAt(both, 0.15)).toBeLessThan(0);
		expect(easeAt(both, 0.85)).toBeGreaterThan(1);
	});

	it("rejects a kind it does not know", () => {
		expect(() => resolveEase({ kind: "wobble" } as unknown as Ease)).toThrow(
			/Unknown ease/,
		);
	});

	it("gives only a physical spring a settle time", () => {
		const zeta = 12 / (2 * Math.sqrt(180));
		const omega = Math.sqrt(180);
		expect(
			settleTime({ kind: "spring", stiffness: 180, damping: 12 }),
		).toBeCloseTo(
			-Math.log(0.001 * Math.sqrt(1 - zeta * zeta)) / (zeta * omega),
			9,
		);
		expect(settleTime("spring")).toBeUndefined();
		expect(settleTime({ kind: "spring", bounce: 0.2 })).toBeUndefined();
		expect(settleTime("out")).toBeUndefined();
	});

	it("makes the settle time the motion's own length, which over replaces", () => {
		const ease = { kind: "spring", stiffness: 180, damping: 12 } as const;
		const settle = settleTime(ease) as number;
		expect(intrinsicDuration({ kind: "enter", ease })).toBe(settle);
		expect(intrinsicDuration({ kind: "enter", ease: "spring" })).toBe(0.5);
		const spec: MotionSpec = {
			kind: "motion",
			steps: [
				{ to: { x: 10 }, ease },
				{ to: { x: 0 }, over: 0.2 },
			],
		};
		expect(intrinsicDuration(spec)).toBeCloseTo(settle + 0.2, 9);
		const { steps } = expandMotion(spec, 0, settle + 0.2, 10);
		expect(steps[0].over).toBeCloseTo(settle, 9);
		expect(() =>
			expandMotion({ kind: "motion", steps: [{ to: { x: 1 } }] }, 0, 1, 1),
		).toThrow(/needs a positive over/);
	});

	it("keeps a ranged channel inside its range and leaves the rest alone", () => {
		const spring = resolveEase("spring");
		const fade = clampEase(
			spring,
			progressWindow(["opacity"], { opacity: 0 }, { opacity: 1 }),
		);
		if (fade.kind !== "stops") throw new Error("expected stops");
		expect(Math.max(...fade.stops.map(([, y]) => y))).toBe(1);
		expect(
			fade.stops.every(([x], i) => i === 0 || x >= fade.stops[i - 1][0]),
		).toBe(true);
		expect(progressWindow(["scale"], { scale: 0 }, { scale: 1 })).toEqual([
			-Infinity,
			Infinity,
		]);
		expect(clampEase(spring, [-Infinity, Infinity])).toBe(spring);
		const pop = resolveEase("pop");
		expect(clampEase(pop, [0, 1])).toBe(pop);
		// Fading out, progress past 1 would go below 0
		expect(progressWindow(["opacity"], { opacity: 1 }, { opacity: 0 })).toEqual(
			[0, 1],
		);
		const keys = keysOf(
			{ opacity: 0 },
			[{ start: 0, over: 1, ease: spring, values: { opacity: 1 } }],
			1,
		);
		for (let t = 0; t <= 1; t += 0.02)
			expect(Number(sampleAt(keys, t).opacity)).toBeLessThanOrEqual(1);
	});

	it("mixes strings number by number", () => {
		expect(mixNumbers("10", "20", 0.5)).toBe("15");
		expect(mixNumbers("0 0", "10 -20", 1.5)).toBe("15 -30");
		expect(mixNumbers("M 0,0 L 10,10", "M 10,0 L 20,30", 0.25)).toBe(
			"M 2.5,0 L 12.5,15",
		);
		expect(
			mixNumbers("M 0,0 L 10,10", "M 0,0 C 1,1 2,2 3,3", 0.5),
		).toBeUndefined();
		expect(mixNumbers("red", "blue", 0.5)).toBeUndefined();
	});

	it("says which numbers an ease cannot take", () => {
		expect(easeProblems("spring")).toEqual([]);
		expect(easeProblems({ kind: "spring", bounce: 0.3 })).toEqual([]);
		expect(easeProblems({ kind: "spring", bounce: 2 })).toEqual([
			"spring bounce must be between -0.9 and 0.9, got 2",
		]);
		expect(easeProblems({ kind: "spring", stiffness: 0, damping: 10 })).toEqual(
			["spring stiffness and damping must be above 0, got 0 and 10"],
		);
		expect(
			easeProblems({ kind: "spring", stiffness: 100, damping: 10, mass: -1 }),
		).toEqual(["spring mass must be above 0, got -1"]);
		expect(easeProblems({ kind: "bounce", bounces: 9, elasticity: 1 })).toEqual(
			[
				"bounce bounces must be 1 to 6, got 9",
				"bounce elasticity must be between 0.1 and 0.9, got 1",
			],
		);
		expect(easeProblems({ kind: "elastic", period: 3 })).toEqual([
			"elastic period must be between 0.1 and 1, got 3",
		]);
		// Out of range reads as the nearest allowed value
		expect(resolveEase({ kind: "spring", bounce: 2 })).toEqual(
			resolveEase({ kind: "spring", bounce: 0.9 }),
		);
	});
});

describe("travel along a route", () => {
	const position = (spec: MotionSpec, t: number) => {
		const { initial, steps } = expandMotion(spec, 0, 1, 1);
		const lane = (channels: string[]) =>
			keysOf(
				Object.fromEntries(channels.map((c) => [c, initial[c as "x"] ?? 0])),
				steps.filter((s) => channels.some((c) => c in s.values)),
				1,
			);
		return {
			...sampleAt(lane(["x", "y"]), t),
			...("rotate" in initial ? sampleAt(lane(["rotate"]), t) : {}),
		};
	};
	const smooth = smoothThrough([
		{ x: 0, y: 0 },
		{ x: 120, y: 60 },
		{ x: 200, y: -40 },
		{ x: 320, y: 20 },
	]);
	const path = routeOf(smooth.points, undefined, smooth.closed);
	const total = path.lengths[path.lengths.length - 1];

	it("keeps straight legs exactly as they were", () => {
		const legacy: MotionSpec = {
			kind: "travel",
			via: ["a", "b"],
			points: [
				{ x: 100, y: 0 },
				{ x: 100, y: 50 },
			],
			ease: "inOut",
		};
		expect(expandMotion(legacy, 0, 3, 3).steps).toEqual([
			{
				start: 0,
				over: 2,
				ease: resolveEase("inOut"),
				values: { x: 100, y: 0 },
			},
			{
				start: 2,
				over: 1,
				ease: resolveEase("inOut"),
				values: { x: 100, y: 50 },
			},
		]);
	});

	it("moves a single stretch in one step, whatever the ease", () => {
		const one: MotionSpec = {
			kind: "travel",
			via: ["a"],
			pace: "trip",
			ease: "spring",
			path: routeOf([
				{ x: 5, y: 5 },
				{ x: 105, y: 5 },
			]),
		};
		const { initial, steps } = expandMotion(one, 0, 1, 1);
		expect(initial).toEqual({ x: 5, y: 5 });
		expect(steps).toHaveLength(1);
		expect(steps[0].ease).toEqual(resolveEase("spring"));
	});

	it("follows the curve at even speed, to within a quarter pixel", () => {
		const spec: MotionSpec = { kind: "travel", via: [], route: "smooth", path };
		const { steps } = expandMotion(spec, 0, 1, 1);
		expect(steps.length).toBeLessThan(120);
		for (let t = 0; t <= 1; t += 0.01) {
			const at = position(spec, t);
			const want = along(path, total * t);
			expect(
				Math.hypot(Number(at.x) - want.x, Number(at.y) - want.y),
			).toBeLessThan(0.3);
		}
		expect(position(spec, 1)).toMatchObject({ x: 320, y: 20 });
	});

	it("overshoots a spring along the tangent and comes back", () => {
		const spec: MotionSpec = {
			kind: "travel",
			via: [],
			ease: "spring",
			path: routeOf([
				{ x: 0, y: 0 },
				{ x: 50, y: 0 },
				{ x: 100, y: 0 },
			]),
		};
		let far = 0;
		for (let t = 0; t <= 1; t += 0.01)
			far = Math.max(far, Number(position(spec, t).x));
		expect(far).toBeGreaterThan(105);
		expect(position(spec, 1)).toMatchObject({ x: 100, y: 0 });
	});

	it("settles at every waypoint when paced by leg", () => {
		const legs: MotionSpec = {
			kind: "travel",
			via: [],
			ease: "inOut",
			path: routeOf(smooth.points, smooth.marks),
		};
		// The first leg's share of the time ends on the first waypoint
		const t = smooth.marks[1] / total;
		const at = position(legs, t);
		expect(Math.hypot(Number(at.x) - 120, Number(at.y) - 60)).toBeLessThan(0.3);
	});

	it("turns the mover to face along the route, without spinning through a half turn", () => {
		const circle = routeOf(arcPoints(0, 100, 100, 0, 360), undefined, true);
		const spec: MotionSpec = {
			kind: "travel",
			via: [],
			orient: 90,
			path: circle,
		};
		const { initial } = expandMotion(spec, 0, 1, 1);
		expect(Number(initial.rotate)).toBeCloseTo(90, 0);
		for (const t of [0.25, 0.5, 0.75, 1])
			expect(Number(position(spec, t).rotate)).toBeCloseTo(90 + 360 * t, 0);
	});

	it("cuts between points on the route under a stepped ease", () => {
		const spec: MotionSpec = {
			kind: "travel",
			via: [],
			ease: "steps(4)",
			path,
		};
		const { steps } = expandMotion(spec, 0, 1, 1);
		expect(steps.map((s) => [s.start, s.over])).toEqual([
			[0.25, 0],
			[0.5, 0],
			[0.75, 0],
			[1, 0],
		]);
		const want = along(path, total / 2);
		expect(steps[1].values).toEqual({ x: want.x, y: want.y });
	});
});
