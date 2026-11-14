import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Channel,
	type Expanded,
	easeAt,
	expandMotion,
	type MotionSpec,
	type ResolvedEase,
	resolveEase,
	type Values,
} from "./motion.ts";
import { type Clock, imageOf, retime, reverseEase } from "./phrase.ts";

const once: Clock = {
	start: 0,
	span: 1,
	length: 1,
	repeat: 1,
	alternate: false,
	retrograde: false,
};
const noRest = (c: Channel): number => {
	throw new Error(`${c} has no rest`);
};

/** The numeric state of an expanded motion at time t. */
function stateAt(e: Expanded, t: number, rest: Values = {}): Values {
	let state: Values = { ...rest, ...e.initial };
	for (const s of [...e.steps].sort((a, b) => a.start - b.start)) {
		if (s.start > t) break;
		const p = s.over > 0 ? easeAt(s.ease, (t - s.start) / s.over) : 1;
		const from = state;
		state = {
			...state,
			...Object.fromEntries(
				Object.entries(s.values).map(([c, v]) => {
					const a = Number(from[c as Channel]);
					return [c, a + (Number(v) - a) * p];
				}),
			),
		};
	}
	return state;
}

const eases: ResolvedEase[] = [
	resolveEase("linear"),
	resolveEase("in"),
	resolveEase("out"),
	resolveEase("pop"),
	resolveEase("hold"),
	resolveEase("steps(3)"),
];

describe("reverseEase", () => {
	it("is its own inverse", () => {
		for (const e of eases) {
			const back = reverseEase(reverseEase(e));
			expect(back.kind).toBe(e.kind);
			if (e.kind === "bezier" && back.kind === "bezier")
				e.points.forEach((p, i) => {
					expect(back.points[i]).toBeCloseTo(p, 12);
				});
			else expect(back).toEqual(e);
		}
	});

	it("plays the ease backwards: at x it has 1 - e(1 - x) left", () => {
		for (const e of eases)
			for (const x of [0, 0.1, 0.25, 1 / 3, 0.5, 0.7, 0.9, 1])
				expect(easeAt(reverseEase(e), x)).toBeCloseTo(1 - easeAt(e, 1 - x), 6);
	});

	it("turns end jumps into start jumps", () => {
		expect(reverseEase(resolveEase("steps(3)"))).toEqual({
			kind: "steps",
			count: 3,
			jump: "start",
		});
	});
});

describe("retime", () => {
	const enter: MotionSpec = { kind: "enter", from: { opacity: 0, y: 8 } };
	const shake: MotionSpec = { kind: "shake", amplitude: { x: 6 } };

	it("leaves the steps alone under a clock that changes nothing", () => {
		for (const spec of [enter, shake]) {
			const e = expandMotion(spec, 0.25, 0.5, 1);
			expect(retime(e, once, 1, noRest)).toEqual(e);
		}
	});

	it("maps a span onto the first pass", () => {
		const c = { ...once, start: 2, span: 6, length: 2, repeat: 3 };
		expect(imageOf(c, { start: 0.5, duration: 1 })).toEqual({
			start: 2.5,
			duration: 1,
		});
		expect(
			imageOf({ ...c, retrograde: true }, { start: 0.5, duration: 1 }),
		).toEqual({ start: 2.5, duration: 1 });
		expect(
			imageOf({ ...c, span: 3, retrograde: true }, { start: 0, duration: 0.5 }),
		).toEqual({ start: 2.75, duration: 0.25 });
	});

	it("repeats forwards exactly as a looping motion does", () => {
		for (const spec of [enter, shake]) {
			const looped = expandMotion({ ...spec, loop: 3 }, 0, 0.5, 10);
			const phrased = retime(
				expandMotion(spec, 0, 0.5, 0.5),
				{ ...once, span: 1.5, length: 0.5, repeat: 3 },
				10,
				noRest,
			);
			expect(phrased).toEqual(looped);
		}
	});

	it("turns without a cut when alternating", () => {
		const e = retime(
			expandMotion(enter, 0, 1, 1),
			{ ...once, span: 2, repeat: 2, alternate: true },
			2,
			noRest,
		);
		expect(e.steps.map((s) => [s.start, s.over])).toEqual([
			[0, 1],
			[1, 1],
		]);
		expect(e.steps[1].values).toEqual({ opacity: 0, y: 8 });
		expect(stateAt(e, 1)).toEqual({ opacity: 1, y: 0 });
		expect(stateAt(e, 2)).toEqual({ opacity: 0, y: 8 });
	});

	it("starts a backward pass from the final state, completed from rest", () => {
		const fade: Expanded = {
			initial: {},
			steps: [
				{
					start: 0,
					over: 1,
					ease: resolveEase("linear"),
					values: { fill: "#f00", x: 4 },
				},
			],
		};
		const e = retime(fade, { ...once, retrograde: true }, 1, (c) =>
			c === "fill" ? "#00f" : noRest(c),
		);
		expect(e.initial).toEqual({ fill: "#f00", x: 4 });
		expect(e.steps[0].values).toEqual({ fill: "#00f", x: 0 });
	});

	it("keeps cuts as cuts, in mirrored order", () => {
		const e: Expanded = {
			initial: { x: 0 },
			steps: [
				{ start: 0, over: 1, ease: resolveEase("linear"), values: { x: 10 } },
				{ start: 1, over: 0, ease: resolveEase("hold"), values: { x: 3 } },
			],
		};
		const back = retime(e, { ...once, retrograde: true }, 1, noRest);
		expect(back.initial).toEqual({ x: 3 });
		expect(back.steps.map((s) => [s.start, s.over, s.values.x])).toEqual([
			[0, 0, 10],
			[0, 1, 0],
		]);
	});

	// 0.2 + 0.5 is not 0.7 in floats: the mirrored tween must not slip before the cut
	it("keeps a mirrored cut ahead of the step it precedes", () => {
		const e: Expanded = {
			initial: { x: 0 },
			steps: [
				{
					start: 0.2,
					over: 0.5,
					ease: resolveEase("linear"),
					values: { x: 35 },
				},
				{ start: 0.7, over: 0, ease: resolveEase("hold"), values: { x: 62 } },
			],
		};
		const c = { ...once, span: 1.4, length: 0.7, repeat: 2, retrograde: true };
		const back = retime(e, c, 1.4, noRest);
		const played = [...back.steps].sort((a, b) => a.start - b.start);
		expect(played.map((s) => s.values.x)).toEqual([35, 0, 62, 35, 0]);
		expect(played.every((s) => s.start >= 0)).toBe(true);
		expect(stateAt(back, 1.4)).toEqual({ x: 0 });
	});

	it("repeats until the enclosing time ends, clipping the last pass", () => {
		const e = retime(
			expandMotion(enter, 0, 1, 1),
			{ ...once, repeat: Infinity },
			2.5,
			noRest,
		);
		expect(e.steps.filter((s) => s.over > 0).map((s) => s.start)).toEqual([
			0, 1, 2,
		]);
		expect(e.steps.at(-1)?.over).toBe(0.5);
	});

	it("refuses to unroll more passes than the cap", () => {
		expect(() =>
			retime(
				expandMotion(enter, 0, 1, 1),
				{ ...once, span: 0.001, length: 1, repeat: Infinity },
				10,
				noRest,
			),
		).toThrow(/cap is 2000/);
	});

	it("under retrograde shows at start + τk what the phrase shows at length - τ (property)", () => {
		const stepArb = fc.record({
			gap: fc.constantFrom(0, 0.25, 0.5),
			over: fc.constantFrom(0.25, 0.5, 1),
			ease: fc.constantFrom(...eases.filter((e) => e.kind !== "steps")),
			x: fc.integer({ min: -20, max: 20 }),
			opacity: fc.constantFrom(0, 0.5, 1),
		});
		fc.assert(
			fc.property(
				fc.array(stepArb, { minLength: 1, maxLength: 5 }),
				fc.constantFrom(0.5, 1, 3),
				fc.constantFrom(0, 2),
				fc.double({ min: 0, max: 1, noNaN: true }),
				(parts, speed, start, u) => {
					let cursor = 0;
					const local: Expanded = {
						initial: { x: 0 },
						steps: parts.map((p) => {
							cursor += p.gap;
							const step = {
								start: cursor,
								over: p.over,
								ease: p.ease,
								values: { x: p.x, opacity: p.opacity },
							};
							cursor += p.over;
							return step;
						}),
					};
					const length = cursor;
					const k = 1 / speed;
					const scene = retime(
						local,
						{ ...once, start, span: length * k, length, retrograde: true },
						start + length * k,
						noRest,
					);
					const tau = u * length;
					const a = stateAt(scene, start + tau * k);
					const b = stateAt(local, length - tau, { opacity: 1 });
					expect(Number(a.x)).toBeCloseTo(Number(b.x), 4);
					expect(Number(a.opacity)).toBeCloseTo(Number(b.opacity), 4);
				},
			),
			{ numRuns: 300 },
		);
	});

	it("mirrors cuts and times that do not round (property)", () => {
		const partArb = fc.record({
			gap: fc.constantFrom(0, 0.1, 0.3),
			over: fc.constantFrom(0.1, 0.2, 0.5, 0.7),
			x: fc.integer({ min: -20, max: 20 }),
			// a cut right after the step, to a value of its own
			cut: fc.option(fc.integer({ min: 30, max: 60 }), { nil: undefined }),
		});
		fc.assert(
			fc.property(
				fc.array(partArb, { minLength: 1, maxLength: 5 }),
				fc.constantFrom(0, 0.1, 0.2, 0.3, 0.4),
				fc.constantFrom(1, 2, 3),
				fc.double({ min: 0.01, max: 0.99, noNaN: true }),
				(parts, lead, repeat, u) => {
					let cursor = lead;
					const steps: Expanded["steps"] = [];
					for (const p of parts) {
						cursor += p.gap;
						steps.push({
							start: cursor,
							over: p.over,
							ease: resolveEase("linear"),
							values: { x: p.x },
						});
						cursor += p.over;
						if (p.cut !== undefined)
							steps.push({
								start: cursor,
								over: 0,
								ease: resolveEase("hold"),
								values: { x: p.cut },
							});
					}
					const local: Expanded = { initial: { x: 0 }, steps };
					const length = cursor;
					const scene = retime(
						local,
						{
							...once,
							span: length * repeat,
							length,
							repeat,
							retrograde: true,
						},
						length * repeat,
						noRest,
					);
					const tau = u * length;
					// at an instant something happens, before and after differ
					const edges = steps.flatMap((s) => [s.start, s.start + s.over]);
					fc.pre(edges.every((e) => Math.abs(length - tau - e) > 1e-6));
					const want = Number(stateAt(local, length - tau).x);
					for (let pass = 0; pass < repeat; pass++)
						expect(Number(stateAt(scene, pass * length + tau).x)).toBeCloseTo(
							want,
							4,
						);
				},
			),
			{ numRuns: 500 },
		);
	});
});

describe("a looping motion (properties)", () => {
	const stepsArb = fc.array(
		fc.oneof(
			fc.record({
				to: fc.record({ x: fc.integer({ min: -9, max: 9 }) }),
				over: fc.constantFrom(0.25, 0.5, 1),
				ease: fc.constantFrom("linear" as const, "in" as const, "out" as const),
			}),
			fc.record({ wait: fc.constantFrom(0.25, 0.5) }),
			fc.record({ set: fc.record({ x: fc.integer({ min: -9, max: 9 }) }) }),
		),
		{ minLength: 1, maxLength: 5 },
	);

	it("starts every pass from rest, and mirrors every other one when it alternates", () => {
		fc.assert(
			fc.property(
				stepsArb,
				fc.integer({ min: 2, max: 4 }),
				fc.constantFrom(0.5, 1, 3),
				fc.boolean(),
				fc.boolean(),
				(steps, passes, duration, counted, alternate) => {
					const spec: MotionSpec = { kind: "motion", steps };
					const one = expandMotion(spec, 0, duration, duration);
					const all = expandMotion(
						{ ...spec, loop: counted ? passes : true, alternate },
						2,
						duration,
						2 + duration * passes,
					);
					for (let j = 0; j < passes; j++)
						for (const u of [0.137, 0.482, 0.618, 0.901]) {
							const back = alternate && j % 2 === 1;
							const there = stateAt(one, (back ? 1 - u : u) * duration, {
								x: 0,
							});
							const here = stateAt(all, 2 + (j + u) * duration, { x: 0 });
							expect(Number(here.x)).toBeCloseTo(Number(there.x), 4);
						}
				},
			),
		);
	});
});
