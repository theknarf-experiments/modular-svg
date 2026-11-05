// Motions: what changes on a mark over its solved time span. Ported from
// svjeez's motion/recipes/keys, except that a motion never knows its absolute
// time: the time solver places it, and expandMotion turns it into steps.

export type Ease =
	| "linear"
	| "in"
	| "out"
	| "inOut"
	| "pop"
	| "hold"
	| `steps(${number})`
	| readonly [number, number, number, number];

export type ResolvedEase =
	| { kind: "linear" }
	| { kind: "bezier"; points: readonly [number, number, number, number] }
	/** `count` equal jumps, each at the end of its slice */
	| { kind: "steps"; count: number };

const NAMED: Record<string, ResolvedEase> = {
	linear: { kind: "linear" },
	in: { kind: "bezier", points: [0.55, 0.06, 0.68, 0.19] },
	out: { kind: "bezier", points: [0.23, 1, 0.32, 1] },
	inOut: { kind: "bezier", points: [0.77, 0, 0.175, 1] },
	/** overshoots, then settles */
	pop: { kind: "bezier", points: [0.34, 1.56, 0.64, 1] },
	hold: { kind: "steps", count: 1 },
};

export function resolveEase(ease: Ease | undefined): ResolvedEase {
	if (ease === undefined) return NAMED.out;
	if (Array.isArray(ease)) {
		const [x1, y1, x2, y2] = ease as readonly number[];
		return { kind: "bezier", points: [x1, y1, x2, y2] };
	}
	const named = NAMED[ease as string];
	if (named) return named;
	const steps = /^steps\((\d+)\)$/.exec(ease as string);
	if (steps && Number(steps[1]) >= 1)
		return { kind: "steps", count: Number(steps[1]) };
	throw new Error(`Unknown ease ${JSON.stringify(ease)}`);
}

/** Progress (0..1, may overshoot) of an ease at x in [0, 1]. */
export function easeAt(ease: ResolvedEase, x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	if (ease.kind === "linear") return x;
	if (ease.kind === "steps") return Math.floor(x * ease.count) / ease.count;
	const [x1, y1, x2, y2] = ease.points;
	const bez = (a: number, b: number, t: number) =>
		3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
	// x(t) is monotonic for valid easing curves, so bisect for t
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (bez(x1, x2, mid) < x) lo = mid;
		else hi = mid;
	}
	return bez(y1, y2, (lo + hi) / 2);
}

export type Channel =
	| "opacity"
	| "x"
	| "y"
	| "scale"
	| "rotate"
	| "blur"
	| "draw"
	| "d"
	| "fill"
	| "stroke"
	| "width"
	| "height";

export type Values = Partial<Record<Channel, number | string>>;

/** A color taken from another node's solved color (after color relations). */
export type ColorRef = { ref: string };

/** Values as authored: colors may name another node's solved color. */
export type AuthoredValues = Partial<
	Record<Channel, number | string | ColorRef>
>;

const isColorRef = (v: unknown): v is ColorRef =>
	typeof v === "object" &&
	v !== null &&
	typeof (v as ColorRef).ref === "string";

/** Mark kinds a channel may animate on; undefined means every mark. */
type ChannelSpec = {
	lane: string;
	/** nest lanes compose by wrapping (opacity multiplies, translate adds) */
	nest: boolean;
	identity?: number;
	range?: readonly [number, number];
	marks?: readonly string[];
};

const GEOMETRY = ["rect", "circle", "line", "curve", "path", "arc", "arrow"];

export const CHANNELS: Record<Channel, ChannelSpec> = {
	opacity: { lane: "opacity", nest: true, identity: 1, range: [0, 1] },
	x: { lane: "translate", nest: true, identity: 0 },
	y: { lane: "translate", nest: true, identity: 0 },
	scale: { lane: "scale", nest: true, identity: 1 },
	rotate: { lane: "rotate", nest: true, identity: 0 },
	blur: { lane: "blur", nest: true, identity: 0, range: [0, Infinity] },
	draw: {
		lane: "draw",
		nest: false,
		identity: 1,
		range: [0, 1],
		marks: GEOMETRY,
	},
	d: { lane: "d", nest: false, marks: ["path"] },
	fill: { lane: "fill", nest: false },
	stroke: { lane: "stroke", nest: false },
	width: {
		lane: "width",
		nest: false,
		range: [0, Infinity],
		marks: ["rect", "image"],
	},
	height: {
		lane: "height",
		nest: false,
		range: [0, Infinity],
		marks: ["rect", "image"],
	},
};

export const isChannel = (name: string): name is Channel =>
	Object.hasOwn(CHANNELS, name);

type RestChannel = "opacity" | "x" | "y" | "scale" | "rotate" | "blur";

export type MotionStep =
	/** transition from the current values, starting at the cursor (or `at`, relative to the motion's start) */
	| { to: AuthoredValues; over: number; ease?: Ease; at?: number }
	/** hard cut at the cursor */
	| { set: AuthoredValues; at?: number }
	/** hold; advances the cursor */
	| { wait: number };

/** One sample of a `sampled` function, relative seconds in. */
export type SampleFn = (t: number) => Values;

export type MotionSpec = (
	| { kind: "motion"; from?: AuthoredValues; steps: readonly MotionStep[] }
	| { kind: "enter"; from?: Values; ease?: Ease }
	| { kind: "exit"; to?: Values; ease?: Ease }
	| { kind: "draw"; ease?: Ease }
	| { kind: "shake"; amplitude: Values; rate?: number }
	| {
			kind: "wiggle";
			amplitude: Values;
			seed: string | number;
			rate?: number;
			ease?: Ease;
	  }
	| {
			kind: "travel";
			/** ids of the waypoints, in order */
			via: readonly string[];
			/** offsets from the mover's rest position to each waypoint, known after layout */
			points?: readonly { x: number; y: number }[];
			ease?: Ease;
	  }
	| {
			kind: "sampled";
			fn: SampleFn;
			/** max drift per lane, in the lane's units (translate is px distance) */
			tolerance: Partial<Record<string, number>>;
			step?: number;
	  }
) & {
	/** repeat the motion's span: true until the scene ends, or a count */
	loop?: boolean | number;
};

/** A transition at absolute scene time. Zero `over` is a cut. */
export type Step = {
	start: number;
	over: number;
	ease: ResolvedEase;
	values: Values;
};

export type Expanded = { initial: Values; steps: Step[] };

const LINEAR = NAMED.linear;
const HOLD = NAMED.hold;

/** Default length of a motion that no relation or `over` sizes. */
export const DEFAULT_OVER = 0.5;

function checkValues(values: AuthoredValues, what: string): Values {
	for (const [k, v] of Object.entries(values)) {
		if (isColorRef(v))
			throw new Error(
				`${what}: ${k} names ${v.ref}'s color, which is only known after solving`,
			);
		if (!isChannel(k))
			throw new Error(`${what}: "${k}" is not an animatable channel`);
		if (typeof v === "number" && !Number.isFinite(v))
			throw new Error(`${what}: ${k} must be finite, got ${v}`);
	}
	return values as Values;
}

/** Replace color refs in a motion with the colors they name. */
export function resolveColorRefs(
	spec: MotionSpec,
	colorOf: (id: string) => string | undefined,
): MotionSpec {
	if (spec.kind !== "motion") return spec;
	const resolve = (
		values: AuthoredValues | undefined,
	): AuthoredValues | undefined =>
		values &&
		Object.fromEntries(
			Object.entries(values).map(([k, v]) => {
				if (!isColorRef(v)) return [k, v];
				const color = colorOf(v.ref);
				if (color === undefined)
					throw new Error(`${k}: ${v.ref} has no color to take`);
				return [k, color];
			}),
		);
	return {
		...spec,
		from: resolve(spec.from),
		steps: spec.steps.map((step) =>
			"to" in step
				? { ...step, to: resolve(step.to) ?? {} }
				: "set" in step
					? { ...step, set: resolve(step.set) ?? {} }
					: step,
		),
	};
}

/** The length a motion has before any relation stretches it. */
export function intrinsicDuration(spec: MotionSpec): number {
	if (spec.kind === "motion") {
		let cursor = 0;
		let last = 0;
		for (const step of spec.steps) {
			if ("wait" in step) cursor += step.wait;
			else {
				if (step.at !== undefined) cursor = step.at;
				if ("to" in step) cursor += step.over;
			}
			last = Math.max(last, cursor);
		}
		return last > 0 ? last : DEFAULT_OVER;
	}
	if (spec.kind === "wiggle") return 2;
	return DEFAULT_OVER;
}

const restOf = (values: Values): Values =>
	Object.fromEntries(
		Object.keys(values).map((c) => [c, CHANNELS[c as Channel].identity ?? 0]),
	);

const fnv1a = (text: string): number => {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++)
		hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
	return hash >>> 0;
};

const mulberry32 = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function clampChannel(channel: Channel, value: number): number {
	const range = CHANNELS[channel].range;
	return range ? Math.min(range[1], Math.max(range[0], value)) : value;
}

/** Steps for one pass of the motion over [start, start + duration]. */
function onePass(spec: MotionSpec, start: number, duration: number): Expanded {
	const what = spec.kind;
	switch (spec.kind) {
		case "enter": {
			const from = checkValues(spec.from ?? { opacity: 0 }, what);
			assertRest(from, what);
			return {
				initial: from,
				steps: [
					{
						start,
						over: duration,
						ease: resolveEase(spec.ease),
						values: restOf(from),
					},
				],
			};
		}
		case "exit": {
			const to = checkValues(spec.to ?? { opacity: 0 }, what);
			assertRest(to, what);
			return {
				initial: restOf(to),
				steps: [
					{ start, over: duration, ease: resolveEase(spec.ease), values: to },
				],
			};
		}
		case "draw":
			return {
				initial: { draw: 0 },
				steps: [
					{
						start,
						over: duration,
						ease: resolveEase(spec.ease),
						values: { draw: 1 },
					},
				],
			};
		case "shake": {
			const amp = checkValues(spec.amplitude, what);
			const count = Math.max(2, Math.round(duration * (spec.rate ?? 12)));
			const steps: Step[] = [];
			for (let k = 1; k <= count; k++) {
				const values = Object.fromEntries(
					Object.entries(amp).map(([c, a]) => [
						c,
						k === count ? 0 : (k % 2 ? -1 : 1) * Number(a) * (1 - k / count),
					]),
				);
				steps.push({
					start: start + ((k - 1) * duration) / count,
					over: duration / count,
					ease: LINEAR,
					values,
				});
			}
			return { initial: restOf(amp), steps };
		}
		case "wiggle": {
			const amp = checkValues(spec.amplitude, what);
			assertRest(amp, what);
			const count = Math.max(2, Math.round((spec.rate ?? 8) * duration));
			const random = mulberry32(fnv1a(String(spec.seed)));
			const channels = (Object.keys(amp) as RestChannel[]).sort();
			const samples = channels.map((c) =>
				Array.from({ length: count }, () =>
					clampChannel(
						c,
						(CHANNELS[c].identity ?? 0) + Number(amp[c]) * (random() * 2 - 1),
					),
				),
			);
			const at = (i: number): Values =>
				Object.fromEntries(channels.map((c, j) => [c, samples[j][i % count]]));
			const ease = resolveEase(spec.ease ?? "inOut");
			return {
				initial: at(0),
				steps: Array.from({ length: count }, (_, i) => ({
					start: start + (i * duration) / count,
					over: duration / count,
					ease,
					values: at(i + 1),
				})),
			};
		}
		case "sampled":
			return sampledPass(spec, start, duration);
		case "travel": {
			if (!spec.points)
				throw new Error("travel: waypoints are resolved after layout");
			// Legs take time in proportion to their length, so the speed is even
			const path = [{ x: 0, y: 0 }, ...spec.points];
			const lengths = path
				.slice(1)
				.map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
			const total = lengths.reduce((a, b) => a + b, 0);
			const ease = resolveEase(spec.ease ?? "linear");
			let at = start;
			const steps = spec.points.map((p, i) => {
				const over =
					total > 0
						? (duration * lengths[i]) / total
						: duration / lengths.length;
				const step = { start: at, over, ease, values: { x: p.x, y: p.y } };
				at += over;
				return step;
			});
			return {
				initial: { x: 0, y: 0 },
				steps: steps.filter((s) => s.over > 0),
			};
		}
		case "motion": {
			const from = checkValues(spec.from ?? {}, what);
			const k = duration / intrinsicDuration(spec);
			const steps: Step[] = [];
			let cursor = 0;
			for (const step of spec.steps) {
				if ("wait" in step) {
					cursor += step.wait;
					continue;
				}
				if (step.at !== undefined) cursor = step.at;
				if ("to" in step) {
					if (!(step.over > 0))
						throw new Error(
							`motion: a "to" step needs a positive over, got ${step.over}; use "set" for a cut`,
						);
					steps.push({
						start: start + cursor * k,
						over: step.over * k,
						ease: resolveEase(step.ease),
						values: checkValues(step.to, what),
					});
					cursor += step.over;
				} else {
					steps.push({
						start: start + cursor * k,
						over: 0,
						ease: HOLD,
						values: checkValues(step.set, what),
					});
				}
			}
			assertNoOverlap(steps);
			return { initial: from, steps };
		}
	}
}

function assertRest(values: Values, what: string): void {
	for (const c of Object.keys(values)) {
		if (!CHANNELS[c as Channel].nest)
			throw new Error(
				`${what} only takes opacity, x, y, scale, rotate or blur; use Motion for ${c}`,
			);
	}
}

function assertNoOverlap(steps: readonly Step[]): void {
	for (let i = 0; i < steps.length; i++) {
		for (let j = i + 1; j < steps.length; j++) {
			const a = steps[i];
			const b = steps[j];
			const shared = Object.keys(a.values).find((c) =>
				Object.keys(b.values).some(
					(d) => CHANNELS[c as Channel].lane === CHANNELS[d as Channel].lane,
				),
			);
			if (
				shared &&
				a.start < b.start + b.over - 1e-9 &&
				b.start < a.start + a.over - 1e-9
			)
				throw new Error(
					`Two transitions move ${CHANNELS[shared as Channel].lane} at once (${Math.max(a.start, b.start)}s); move them in one step`,
				);
		}
	}
}

/**
 * Absolute steps for a motion placed at [start, start + duration]. A looping
 * motion repeats its span until `sceneEnd` (or `loop` times); a pass that
 * crosses the scene end is cut there.
 */
export function expandMotion(
	spec: MotionSpec,
	start: number,
	duration: number,
	sceneEnd: number,
): Expanded {
	const first = onePass(spec, start, duration);
	if (!spec.loop || !(duration > 0)) return first;
	const passes =
		spec.loop === true
			? Math.ceil((sceneEnd - start) / duration - 1e-9)
			: Math.max(1, Math.floor(spec.loop));
	const steps: Step[] = [];
	for (let p = 0; p < passes; p++) {
		const offset = p * duration;
		// Each pass returns to the initial values with a cut at its start
		if (p > 0)
			steps.push({
				start: start + offset,
				over: 0,
				ease: HOLD,
				values: first.initial,
			});
		for (const s of first.steps) {
			const at = s.start + offset;
			if (at >= sceneEnd - 1e-9) break;
			steps.push({ ...s, start: at, over: Math.min(s.over, sceneEnd - at) });
		}
	}
	return { initial: first.initial, steps };
}

// --- sampled ---------------------------------------------------------------

type Point = { t: number; values: number[] };

const distance = (a: Point, b: Point): number =>
	Math.hypot(...a.values.map((v, c) => v - b.values[c]));

function ramerDouglasPeucker(
	samples: readonly number[][],
	tolerance: number,
): number[] {
	const kept = [0, samples.length - 1];
	const split = (a: number, b: number): void => {
		let worst = -1;
		let error = tolerance;
		for (let i = a + 1; i < b; i++) {
			const u = (i - a) / (b - a);
			const miss = Math.hypot(
				...samples[i].map(
					(v, c) => v - (samples[a][c] + (samples[b][c] - samples[a][c]) * u),
				),
			);
			if (miss > error) [worst, error] = [i, miss];
		}
		if (worst < 0) return;
		kept.push(worst);
		split(a, worst);
		split(worst, b);
	};
	split(0, samples.length - 1);
	return kept.sort((x, y) => x - y);
}

// Halving shrinks a smooth change with the span; a change that survives every
// halving is a jump, which becomes a cut instead of a sweep.
function jump(
	a: Point,
	b: Point,
	at: (t: number) => Point,
	tolerance: number,
): readonly [Point, Point] | undefined {
	const floor = Math.max(tolerance, distance(a, b) / 1000);
	let [lo, hi] = [a, b];
	for (let i = 0; i < 20; i++) {
		const mid = at((lo.t + hi.t) / 2);
		[lo, hi] = distance(lo, mid) > distance(mid, hi) ? [lo, mid] : [mid, hi];
		if (distance(lo, hi) <= floor) return undefined;
	}
	return [lo, hi];
}

/** Sample densely, keep only the keys each lane needs (svjeez's sampled). */
function sampledPass(
	spec: Extract<MotionSpec, { kind: "sampled" }>,
	start: number,
	duration: number,
): Expanded {
	const step = spec.step ?? 0.05;
	if (!(step > 0))
		throw new Error(`sampled needs a positive step, got ${step}`);
	const edge = duration * 1e-5;
	const times = Array.from(
		{ length: Math.ceil((duration - edge) / step) },
		(_, i) => i * step,
	).concat(duration);
	const first = checkValues(spec.fn(0), "sampled");
	const channels = (Object.keys(first) as Channel[])
		.filter((c) => typeof first[c] === "number")
		.sort();
	const frameAt = (t: number): Values => {
		const frame = t === 0 ? first : spec.fn(t);
		const keys = Object.keys(frame)
			.filter((c) => Number.isFinite(frame[c as Channel]))
			.sort();
		if (keys.join() !== channels.join())
			throw new Error(
				`sampled returned different channels at t=${t} than at t=0`,
			);
		return frame;
	};
	const frames = times.map(frameAt);
	const lanes = new Map<string, Channel[]>();
	for (const c of channels) {
		const lane = CHANNELS[c].lane;
		lanes.set(lane, [...(lanes.get(lane) ?? []), c]);
	}
	const steps: Step[] = [];
	for (const [lane, members] of lanes) {
		const tolerance = spec.tolerance[lane];
		if (tolerance === undefined || !(tolerance >= 0))
			throw new Error(`sampled needs a non-negative tolerance for ${lane}`);
		const point = (t: number, frame = frameAt(t)): Point => ({
			t,
			values: members.map((c) => Number(frame[c])),
		});
		const valuesOf = (p: Point): Values =>
			Object.fromEntries(members.map((c, i) => [c, p.values[i]]));
		const runs: Point[][] = [[point(0, frames[0])]];
		for (let i = 1; i < times.length; i++) {
			const next = point(times[i], frames[i]);
			const run = runs[runs.length - 1];
			const last = run[run.length - 1];
			const cut =
				distance(last, next) > tolerance
					? jump(last, next, point, tolerance)
					: undefined;
			if (cut) {
				if (cut[0].t > last.t) run.push(cut[0]);
				runs.push(cut[1].t < next.t ? [cut[1], next] : [next]);
			} else run.push(next);
		}
		runs.forEach((run, r) => {
			if (r > 0)
				steps.push({
					start: start + run[0].t,
					over: 0,
					ease: HOLD,
					values: valuesOf(run[0]),
				});
			const kept =
				run.length > 1
					? ramerDouglasPeucker(
							run.map((p) => p.values),
							tolerance,
						)
					: [];
			for (let j = 1; j < kept.length; j++) {
				const a = run[kept[j - 1]];
				const b = run[kept[j]];
				steps.push({
					start: start + a.t,
					over: b.t - a.t,
					ease: LINEAR,
					values: valuesOf(b),
				});
			}
		});
	}
	return {
		initial: Object.fromEntries(channels.map((c) => [c, first[c]])),
		steps,
	};
}

// --- keys --------------------------------------------------------------------

/** A keyframe: the lane's values at t, and the ease of the segment that starts there. */
export type Key = { t: number; values: Values; ease: ResolvedEase };

const NUDGE = 1e-5;

const same = (a: Values, b: Values): boolean =>
	Object.keys(a).every((c) => a[c as Channel] === b[c as Channel]);

export const moving = (keys: readonly Key[], index: number): boolean => {
	const next = keys[index + 1];
	return next !== undefined && !same(keys[index].values, next.values);
};

/** Keyframes for one lane over [0, period], holding between transitions. */
export function keysOf(
	initial: Values,
	segments: readonly Step[],
	period: number,
): Key[] {
	const keys: Key[] = [{ t: 0, values: initial, ease: NAMED.out }];
	const nudge = period * NUDGE;
	let current = initial;
	for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
		const next = { ...current, ...segment.values };
		const last = keys[keys.length - 1];
		const contiguous = segment.start < last.t + nudge;
		if (segment.over >= nudge) {
			if (contiguous) keys[keys.length - 1] = { ...last, ease: segment.ease };
			else keys.push({ t: segment.start, values: current, ease: segment.ease });
			keys.push({
				t: segment.start + segment.over,
				values: next,
				ease: NAMED.out,
			});
		} else if (keys.length === 1 && segment.start <= nudge) {
			keys[0] = { ...last, values: next };
		} else if (contiguous && last.t + nudge > period + 1e-9) {
			// A cut at the very end: hold one nudge early so it still lands on the period
			keys[keys.length - 1] = { ...last, t: last.t - nudge, ease: HOLD };
			keys.push({ t: period, values: next, ease: NAMED.out });
		} else {
			keys[keys.length - 1] = { ...last, ease: HOLD };
			keys.push({
				t: contiguous ? last.t + nudge : segment.start,
				values: next,
				ease: NAMED.out,
			});
		}
		current = next;
	}
	if (keys[keys.length - 1].t < period - 1e-9)
		keys.push({ t: period, values: current, ease: NAMED.out });
	return keys;
}

export function valueAt(keys: readonly Key[], t: number): Values {
	let found = keys[0];
	for (const k of keys) if (k.t <= t + 1e-9) found = k;
	return found.values;
}
