import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cuesBetween } from "./cues.ts";
import {
	CHANNELS,
	type Channel,
	type Ease,
	easeAt,
	expandMotion,
	keysOf,
	MAX_STOPS,
	type MotionSpec,
	ramerDouglasPeucker,
	resolveEase,
	sampleAt,
} from "./motion.ts";
import { retime, reverseEase } from "./phrase.ts";
import { along, routeOf, smoothThrough } from "./route.ts";
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

	it("a loop that ends on a pass boundary plays every pass alike", () => {
		const stepsArb = fc.array(
			fc.oneof(
				fc.record({
					to: fc.record({ x: fc.integer({ min: -9, max: 9 }) }),
					over: fc.constantFrom(0.25, 0.5, 1),
				}),
				fc.record({ wait: fc.constantFrom(0.25, 0.5) }),
				fc.record({ set: fc.record({ x: fc.integer({ min: -9, max: 9 }) }) }),
			),
			{ minLength: 1, maxLength: 5 },
		);
		fc.assert(
			fc.property(
				stepsArb,
				fc.integer({ min: 1, max: 4 }),
				fc.constantFrom(0.5, 1, 3),
				fc.boolean(),
				(steps, passes, duration, counted) => {
					const spec: MotionSpec = { kind: "motion", steps };
					const one = expandMotion(spec, 0, duration, duration).steps;
					const all = expandMotion(
						{ ...spec, loop: counted ? passes : true },
						0,
						duration,
						duration * passes,
					).steps;
					// every pass, and the cut back to the start between two of them
					expect(all).toHaveLength(one.length * passes + passes - 1);
					const last = all.slice(all.length - one.length);
					expect(last.map((s) => s.values)).toEqual(one.map((s) => s.values));
				},
			),
		);
	});

	it("sampling passes through every key and stays between its neighbours", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						over: fc.constantFrom(0, 0.25, 1),
						gap: fc.constantFrom(0, 0.5),
						x: fc.integer({ min: -50, max: 50 }),
						ease: easeArb,
					}),
					{ minLength: 1, maxLength: 6 },
				),
				fc.double({ min: 0, max: 1, noNaN: true }),
				(moves, u) => {
					let at = 0;
					const segments = moves.map((m) => {
						const start = at + m.gap;
						at = start + m.over;
						return {
							start,
							over: m.over,
							ease: resolveEase(m.ease),
							values: { x: m.x },
						};
					});
					const period = at + 1;
					const keys = keysOf({ x: 0 }, segments, period);
					keys.forEach((k, i) => {
						// two keys a cut apart share a time; the later one holds
						if (keys[i + 1] && keys[i + 1].t - k.t <= 1e-9) return;
						expect(sampleAt(keys, k.t).x).toBeCloseTo(Number(k.values.x), 9);
					});
					const t = u * period;
					const i = keys.reduce((at, k, j) => (k.t <= t + 1e-9 ? j : at), 0);
					const [a, b] = [keys[i], keys[i + 1] ?? keys[i]];
					const [lo, hi] = [Number(a.values.x), Number(b.values.x)].sort(
						(p, q) => p - q,
					);
					const x = Number(sampleAt(keys, t).x);
					expect(x).toBeGreaterThanOrEqual(lo - 1e-9);
					expect(x).toBeLessThanOrEqual(hi + 1e-9);
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

describe("cues inside phrases (properties)", () => {
	const clockArb = fc.record({
		start: centis(1),
		pass: fc.constantFrom(0.5, 1, 1.5),
		repeat: fc.constantFrom(1, 2, 3, Number.POSITIVE_INFINITY),
		alternate: fc.boolean(),
		retrograde: fc.boolean(),
	});
	// A span inside one or two phrases; each phrase is as long as it needs
	const phrasedArb = fc
		.record({
			local: fc.record({ start: centis(1), duration: centis(1) }),
			inner: clockArb,
			outer: fc.option(clockArb, { nil: undefined }),
			loop: fc.boolean(),
		})
		.map(({ local, inner, outer, loop }) => {
			const length = 2;
			const span = (c: typeof inner) =>
				Number.isFinite(c.repeat) ? c.pass * c.repeat : c.pass;
			const outerLength = inner.start + span(inner) + 1;
			const clocks = {
				inner: {
					...inner,
					span: span(inner),
					length,
					...(outer ? { clock: "outer" } : {}),
				},
				...(outer
					? { outer: { ...outer, span: span(outer), length: outerLength } }
					: {}),
			};
			return {
				spans: { a: { start: 0, duration: 0 } },
				local: { a: { ...local, clock: "inner" } },
				clocks,
				duration: 12,
				loop,
			};
		});

	it("firing over (a, b] then (b, c] is the same as over (a, c]", () => {
		fc.assert(
			fc.property(
				phrasedArb,
				fc
					.tuple(centis(30), centis(30), centis(30))
					.map((xs) => xs.sort((x, y) => x - y)),
				(solution, [a, b, c]) => {
					const split = [
						...cuesBetween(solution, ["a", "a:end"], a, b),
						...cuesBetween(solution, ["a", "a:end"], b, c),
					];
					const whole = cuesBetween(solution, ["a", "a:end"], a, c);
					const sorted = (cues: typeof whole) =>
						cues.map((cue) => `${cue.at.toFixed(9)} ${cue.edge}`).sort();
					expect(sorted(split)).toEqual(sorted(whole));
				},
			),
		);
	});

	it("fire where the phrase plays a step over the same span", () => {
		fc.assert(
			fc.property(phrasedArb, (solution) => {
				const local = solution.local.a;
				fc.pre(local.duration > 0);
				const { inner, outer } = solution.clocks;
				const step = {
					start: local.start,
					over: local.duration,
					ease: resolveEase("linear"),
					values: { x: 1 },
				};
				const rest = () => 0;
				const inOuter = retime(
					{ initial: { x: 0 }, steps: [step] },
					inner,
					outer?.length ?? solution.duration,
					rest,
				);
				const played = outer
					? retime(inOuter, outer, solution.duration, rest)
					: inOuter;
				const moves = played.steps.filter((s) => s.over > 0);
				const once = { ...solution, loop: false };
				const ascending = (ts: number[]) => [...ts].sort((x, y) => x - y);
				const at = (key: string) =>
					ascending(cuesBetween(once, [key], -1, 1e3).map((c) => c.at));
				// Within a microsecond; rounding to one would split times that
				// fall on half of it
				const same = (got: number[], want: number[]) => {
					expect(got).toHaveLength(want.length);
					got.forEach((t, i) => {
						expect(Math.abs(t - want[i])).toBeLessThan(1e-6);
					});
				};
				same(at("a"), ascending(moves.map((s) => s.start)));
				same(at("a:end"), ascending(moves.map((s) => s.start + s.over)));
			}),
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

describe("ramerDouglasPeucker (properties)", () => {
	const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

	it("keeps samples that straight runs in time would miss, and no others", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						gap: fc.double({ min: 0.01, max: 2, noNaN: true }),
						x: fc.double({ min: -100, max: 100, noNaN: true }),
						y: fc.double({ min: -100, max: 100, noNaN: true }),
					}),
					{ minLength: 2, maxLength: 30 },
				),
				fc.double({ min: 0.01, max: 20, noNaN: true }),
				(points, tolerance) => {
					let t = 0;
					const times = points.map((p) => {
						t += p.gap;
						return t;
					});
					const samples = points.map((p) => [p.x, p.y]);
					const kept = ramerDouglasPeucker(samples, tolerance, times);
					expect(kept[0]).toBe(0);
					expect(kept.at(-1)).toBe(samples.length - 1);
					for (let k = 1; k < kept.length; k++) {
						const [a, b] = [kept[k - 1], kept[k]];
						expect(b).toBeGreaterThan(a);
						for (let i = a + 1; i < b; i++) {
							const u = (times[i] - times[a]) / (times[b] - times[a]);
							const miss = Math.hypot(
								samples[i][0] - lerp(samples[a][0], samples[b][0], u),
								samples[i][1] - lerp(samples[a][1], samples[b][1], u),
							);
							expect(miss).toBeLessThanOrEqual(tolerance + 1e-9);
						}
					}
				},
			),
		);
	});

	it("drops every sample on a line crossed at even speed, however they are spaced", () => {
		fc.assert(
			fc.property(
				fc.array(fc.double({ min: 0.01, max: 2, noNaN: true }), {
					minLength: 2,
					maxLength: 20,
				}),
				(gaps) => {
					let t = 0;
					const times = gaps.map((g) => {
						t += g;
						return t;
					});
					const samples = times.map((at) => [3 * at, -2 * at]);
					expect(ramerDouglasPeucker(samples, 1e-6, times)).toEqual([
						0,
						samples.length - 1,
					]);
				},
			),
		);
	});
});

const shapedArb: fc.Arbitrary<Ease> = fc.oneof(
	fc.record({
		kind: fc.constant("spring" as const),
		bounce: fc.double({ min: -0.9, max: 0.9, noNaN: true }),
	}),
	fc.record({
		kind: fc.constant("spring" as const),
		stiffness: fc.double({ min: 1, max: 2000, noNaN: true }),
		damping: fc.double({ min: 0.5, max: 200, noNaN: true }),
		mass: fc.double({ min: 0.1, max: 10, noNaN: true }),
	}),
	fc.record({
		kind: fc.constant("bounce" as const),
		bounces: fc.integer({ min: 1, max: 6 }),
		elasticity: fc.double({ min: 0.1, max: 0.9, noNaN: true }),
	}),
	fc.record({
		kind: fc.constant("elastic" as const),
		period: fc.double({ min: 0.1, max: 1, noNaN: true }),
	}),
);

describe("sampled eases (properties)", () => {
	it("resolve to the same bounded, rising stops every time", () => {
		fc.assert(
			fc.property(shapedArb, (ease) => {
				const e = resolveEase(ease);
				if (e.kind !== "stops") throw new Error("expected stops");
				expect(resolveEase({ ...(ease as object) } as Ease)).toEqual(e);
				expect(e.stops.length).toBeLessThanOrEqual(MAX_STOPS);
				expect(e.stops[0]).toEqual([0, 0]);
				expect(e.stops.at(-1)).toEqual([1, 1]);
				for (let i = 1; i < e.stops.length; i++)
					expect(e.stops[i][0]).toBeGreaterThan(e.stops[i - 1][0]);
				for (const [, y] of e.stops) expect(Number.isFinite(y)).toBe(true);
			}),
		);
	});

	it("play backwards as their own mirror", () => {
		fc.assert(
			fc.property(
				shapedArb,
				fc.double({ min: 0, max: 1, noNaN: true }),
				(ease, x) => {
					const e = resolveEase(ease);
					expect(easeAt(reverseEase(e), x)).toBeCloseTo(
						1 - easeAt(e, 1 - x),
						6,
					);
				},
			),
		);
	});

	it("never take a ranged channel out of its range", () => {
		fc.assert(
			fc.property(
				shapedArb,
				fc.constantFrom<Channel>("opacity", "draw", "width", "r", "blur"),
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 1, noNaN: true }),
				(ease, channel, from, to) => {
					const keys = keysOf(
						{ [channel]: from },
						[
							{
								start: 0,
								over: 1,
								ease: resolveEase(ease),
								values: { [channel]: to },
							},
						],
						1,
					);
					const [lo, hi] = CHANNELS[channel].range ?? [0, 1];
					for (let t = 0; t <= 1; t += 0.05) {
						const v = Number(sampleAt(keys, t)[channel]);
						expect(v).toBeGreaterThanOrEqual(lo);
						expect(v).toBeLessThanOrEqual(hi);
					}
				},
			),
		);
	});
});

describe("travel along a route (properties)", () => {
	const pointArb = fc.record({
		x: fc.integer({ min: -300, max: 300 }),
		y: fc.integer({ min: -300, max: 300 }),
	});

	it("stays within a quarter pixel of the route, and ends on the last waypoint", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(pointArb, {
					minLength: 2,
					maxLength: 5,
					selector: (p) => `${p.x},${p.y}`,
				}),
				fc.oneof(
					fc.constantFrom<Ease>("linear", "inOut", "out", "spring", "bounce"),
					shapedArb,
				),
				fc.boolean(),
				(waypoints, ease, smooth) => {
					const through = [{ x: 0, y: 0 }, ...waypoints].filter(
						(p, i, all) => i === 0 || p.x !== all[0].x || p.y !== all[0].y,
					);
					if (through.length < 3) return;
					const path = smooth
						? routeOf(smoothThrough(through).points)
						: routeOf(through);
					const total = path.lengths[path.lengths.length - 1];
					const { initial, steps } = expandMotion(
						{ kind: "travel", via: [], ease, pace: "trip", path },
						0,
						60,
						60,
					);
					const keys = keysOf(initial, steps, 60);
					const e = resolveEase(ease);
					const count = 997;
					const distance = Array.from(
						{ length: count + 1 },
						(_, i) => total * easeAt(e, i / count),
					);
					// Samples are no closer than a 240Hz frame, so a corner taken at
					// speed is cut by what the mover covers in one
					const frame =
						Math.max(
							...distance.slice(1).map((s, i) => Math.abs(s - distance[i])),
						) *
						(count / 60 / 240);
					distance.forEach((s, i) => {
						const at = sampleAt(keys, (60 * i) / count);
						const want = along(path, s);
						expect(
							Math.hypot(Number(at.x) - want.x, Number(at.y) - want.y),
						).toBeLessThan(0.25 + frame);
					});
					const last = through[through.length - 1];
					expect(Number(sampleAt(keys, 60).x)).toBeCloseTo(last.x, 6);
					expect(Number(sampleAt(keys, 60).y)).toBeCloseTo(last.y, 6);
				},
			),
		);
	});
});
