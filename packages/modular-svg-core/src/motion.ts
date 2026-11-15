// Motions: what changes on a mark over its solved time span. Ported from
// svjeez's motion/recipes/keys, except that a motion never knows its absolute
// time: the time solver places it, and expandMotion turns it into steps.

import { type Clock, retime } from "./phrase.ts";
import { along, nearestTurn, type Point, type Route } from "./route.ts";

export type Ease =
	| "linear"
	| "in"
	| "out"
	| "inOut"
	| "pop"
	| "hold"
	| "anticipate"
	| "overshoot"
	| "anticipateOvershoot"
	| "spring"
	| "bounce"
	| "elastic"
	| `steps(${number})`
	| readonly [number, number, number, number]
	/** fitted to the span it eases; `bounce` (-0.9..0.9) is how far it overshoots */
	| { kind: "spring"; bounce?: number }
	/** a physical spring, which also brings its own settle time as the length */
	| { kind: "spring"; stiffness: number; damping: number; mass?: number }
	/** a ball landing on the target */
	| { kind: "bounce"; bounces?: number; elasticity?: number }
	| { kind: "elastic"; period?: number };

export type ResolvedEase =
	| { kind: "linear" }
	| { kind: "bezier"; points: readonly [number, number, number, number] }
	/** `count` equal jumps, each at the end of its slice (or its start) */
	| { kind: "steps"; count: number; jump?: "start" }
	/** straight runs through (x, progress); x rises from 0 to 1, ends are (0,0) and (1,1) */
	| { kind: "stops"; stops: readonly (readonly [number, number])[] };

const POP: ResolvedEase = { kind: "bezier", points: [0.34, 1.56, 0.64, 1] };

const NAMED: Record<string, ResolvedEase> = {
	linear: { kind: "linear" },
	in: { kind: "bezier", points: [0.55, 0.06, 0.68, 0.19] },
	out: { kind: "bezier", points: [0.23, 1, 0.32, 1] },
	inOut: { kind: "bezier", points: [0.77, 0, 0.175, 1] },
	/** overshoots, then settles */
	pop: POP,
	overshoot: POP,
	/** pulls back, then goes */
	anticipate: { kind: "bezier", points: [0.36, 0, 0.66, -0.56] },
	anticipateOvershoot: { kind: "bezier", points: [0.68, -0.6, 0.32, 1.6] },
	hold: { kind: "steps", count: 1 },
};

type SpringEase = Extract<Ease, { kind: "spring" }>;
type Physical = Extract<SpringEase, { stiffness: number }>;

const isPhysical = (ease: SpringEase): ease is Physical =>
	"stiffness" in ease || "damping" in ease;

const within = (
	v: unknown,
	lo: number,
	hi: number,
	fallback: number,
): number =>
	typeof v === "number" && Number.isFinite(v)
		? Math.min(hi, Math.max(lo, v))
		: fallback;

/** A spring's unit step response from rest: damping ratio, natural frequency, time. */
export function springAt(zeta: number, omega: number, t: number): number {
	if (t <= 0) return 0;
	if (zeta < 1 - 1e-9) {
		const wd = omega * Math.sqrt(1 - zeta * zeta);
		return (
			1 -
			Math.exp(-zeta * omega * t) *
				(Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t))
		);
	}
	if (zeta <= 1 + 1e-9) return 1 - Math.exp(-omega * t) * (1 + omega * t);
	const root = Math.sqrt(zeta * zeta - 1);
	const [slow, fast] = [omega * (zeta - root), omega * (zeta + root)];
	return (
		1 -
		(fast * Math.exp(-slow * t) - slow * Math.exp(-fast * t)) / (fast - slow)
	);
}

// When the spring's envelope is within 0.1% of its target
const settles = (zeta: number, omega: number): number =>
	zeta < 1
		? -Math.log(0.001 * Math.sqrt(1 - zeta * zeta)) / (zeta * omega)
		: -Math.log(0.001) / (omega * (zeta - Math.sqrt(zeta * zeta - 1)));

const physicsOf = (ease: Physical): { zeta: number; omega: number } => {
	const k = within(ease.stiffness, 1e-6, Infinity, 100);
	const c = within(ease.damping, 0, Infinity, 10);
	const m = within(ease.mass, 1e-6, Infinity, 1);
	return {
		zeta: Math.max(0.1, c / (2 * Math.sqrt(k * m))),
		omega: Math.sqrt(k / m),
	};
};

/**
 * How long a physical spring (`stiffness`, `damping`) takes to settle, which
 * is the length of what it eases unless something sizes that. Undefined for
 * every other ease: those are shapes fitted to a span.
 */
export function settleTime(ease: Ease | undefined): number | undefined {
	if (typeof ease !== "object" || ease === null || Array.isArray(ease))
		return undefined;
	const spring = ease as SpringEase;
	if (spring.kind !== "spring" || !isPhysical(spring)) return undefined;
	const { zeta, omega } = physicsOf(spring);
	return Math.min(10, Math.max(0.05, settles(zeta, omega)));
}

/** The most runs a sampled ease is drawn with. */
export const MAX_STOPS = 32;

/** A function of 0..1 as straight runs: what CSS `linear()` draws. */
export function stopsOf(f: (x: number) => number): ResolvedEase {
	const count = 400;
	const xs = Array.from({ length: count + 1 }, (_, i) => i / count);
	const ys = xs.map((x, i) => [i === 0 ? 0 : i === count ? 1 : f(x)]);
	let kept: number[] = [];
	for (let tolerance = 0.003; ; tolerance *= 1.5) {
		kept = ramerDouglasPeucker(ys, tolerance, xs);
		if (kept.length <= MAX_STOPS) break;
	}
	const round = (v: number) => Number(v.toFixed(4)) + 0;
	return {
		kind: "stops",
		stops: kept.map((i) => [round(xs[i]), round(ys[i][0])] as const),
	};
}

const springShape = (zeta: number): ((x: number) => number) => {
	const length = settles(zeta, 1);
	return (x) => springAt(zeta, 1, x * length);
};

function shapeOf(ease: Exclude<Ease, string | readonly number[]>) {
	if (ease.kind === "spring") {
		if (isPhysical(ease)) return springShape(physicsOf(ease).zeta);
		const bounce = within(ease.bounce, -0.9, 0.9, 0.4);
		return springShape(bounce >= 0 ? 1 - bounce : 1 / (1 + bounce));
	}
	if (ease.kind === "bounce") {
		const bounces = Math.round(within(ease.bounces, 1, 6, 3));
		const e = within(ease.elasticity, 0.1, 0.9, 0.5);
		// The fall, then each rebound: twice as long as its rise, which is e^i of the fall's
		const halves = Array.from({ length: bounces }, (_, i) => e ** (i + 1));
		const fall = 1 / (1 + 2 * halves.reduce((a, b) => a + b, 0));
		return (x: number) => {
			if (x <= fall) return (x / fall) ** 2;
			let peak = fall;
			for (const half of halves) {
				peak += half * fall;
				const u = (x - peak) / (half * fall);
				if (u <= 1) return 1 - half * half * (1 - u * u);
				peak += half * fall;
			}
			return 1;
		};
	}
	if (ease.kind === "elastic") {
		const p = within(ease.period, 0.1, 1, 0.3);
		return (x: number) =>
			2 ** (-10 * x) * Math.sin(((x - p / 4) * 2 * Math.PI) / p) + 1;
	}
	return undefined;
}

const shaped = new Map<string, ResolvedEase>();

export function resolveEase(ease: Ease | undefined): ResolvedEase {
	if (ease === undefined) return NAMED.out;
	if (Array.isArray(ease)) {
		const [x1, y1, x2, y2] = ease as readonly number[];
		return { kind: "bezier", points: [x1, y1, x2, y2] };
	}
	if (typeof ease === "string") {
		const named = NAMED[ease];
		if (named) return named;
		if (ease === "spring" || ease === "bounce" || ease === "elastic")
			return resolveEase({ kind: ease } as Ease);
		const steps = /^steps\((\d+)\)$/.exec(ease);
		if (steps && Number(steps[1]) >= 1)
			return { kind: "steps", count: Number(steps[1]) };
	} else if (typeof ease === "object" && ease !== null) {
		const shape = shapeOf(ease as Exclude<Ease, string | readonly number[]>);
		if (shape) {
			// Sampling a shape costs more than everything else here; scenes repeat few
			const key = JSON.stringify(ease);
			const known = shaped.get(key) ?? stopsOf(shape);
			shaped.set(key, known);
			return known;
		}
	}
	throw new Error(`Unknown ease ${JSON.stringify(ease)}`);
}

/** What an ease's numbers break, in words; such values are read as the nearest allowed. */
export function easeProblems(ease: unknown): string[] {
	if (typeof ease !== "object" || ease === null || Array.isArray(ease))
		return [];
	const e = ease as Record<string, unknown>;
	const out: string[] = [];
	const outside = (v: unknown, lo: number, hi: number): boolean =>
		v !== undefined &&
		!(typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi);
	if (e.kind === "spring") {
		if ("stiffness" in e || "damping" in e) {
			if (
				outside(e.stiffness ?? 0, 1e-12, Infinity) ||
				outside(e.damping ?? 0, 1e-12, Infinity)
			)
				out.push(
					`spring stiffness and damping must be above 0, got ${e.stiffness} and ${e.damping}`,
				);
			if (outside(e.mass, 1e-12, Infinity))
				out.push(`spring mass must be above 0, got ${e.mass}`);
		} else if (outside(e.bounce, -0.9, 0.9))
			out.push(`spring bounce must be between -0.9 and 0.9, got ${e.bounce}`);
	} else if (e.kind === "bounce") {
		if (outside(e.bounces, 1, 6))
			out.push(`bounce bounces must be 1 to 6, got ${e.bounces}`);
		if (outside(e.elasticity, 0.1, 0.9))
			out.push(
				`bounce elasticity must be between 0.1 and 0.9, got ${e.elasticity}`,
			);
	} else if (e.kind === "elastic" && outside(e.period, 0.1, 1))
		out.push(`elastic period must be between 0.1 and 1, got ${e.period}`);
	return out;
}

/** Progress (0..1, may overshoot) of an ease at x in [0, 1]. */
export function easeAt(ease: ResolvedEase, x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	if (ease.kind === "linear") return x;
	if (ease.kind === "steps")
		return (
			(ease.jump ? Math.ceil(x * ease.count) : Math.floor(x * ease.count)) /
			ease.count
		);
	if (ease.kind === "stops") {
		const { stops } = ease;
		let lo = 0;
		let hi = stops.length - 2;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (stops[mid][0] <= x) lo = mid;
			else hi = mid - 1;
		}
		const [[x0, y0], [x1, y1]] = [stops[lo], stops[lo + 1]];
		return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1;
	}
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

/** A bezier that leaves 0..1, which SMIL's keySplines cannot say. */
export const overshoots = (ease: ResolvedEase): boolean =>
	ease.kind === "bezier" &&
	[ease.points[1], ease.points[3]].some((y) => y < 0 || y > 1);

/**
 * The ease kept inside a window of progress, for values the browser would
 * clamp one by one (an opacity past 1) or not at all (a dash offset below 0).
 * Only a `stops` ease is cut; the rest are returned as they are.
 */
export function clampEase(
	ease: ResolvedEase,
	window: readonly [number, number],
): ResolvedEase {
	if (ease.kind !== "stops") return ease;
	const [lo, hi] = window;
	if (ease.stops.every(([, y]) => y >= lo && y <= hi)) return ease;
	const clamp = (y: number) => Math.min(hi, Math.max(lo, y));
	const stops: (readonly [number, number])[] = [];
	ease.stops.forEach(([x, y], i) => {
		const prev = ease.stops[i - 1];
		if (prev)
			// A run that crosses a bound turns flat exactly there
			for (const bound of [lo, hi].sort((a, b) =>
				prev[1] < y ? a - b : b - a,
			)) {
				if (!Number.isFinite(bound) || (prev[1] - bound) * (y - bound) >= 0)
					continue;
				const at =
					prev[0] + ((x - prev[0]) * (bound - prev[1])) / (y - prev[1]);
				stops.push([Number(at.toFixed(4)), bound]);
			}
		stops.push([x, clamp(y)]);
	});
	return { kind: "stops", stops };
}

/** The progress over which every ranged channel going from `from` to `to` stays in its range. */
export function progressWindow(
	channels: readonly Channel[],
	from: Values,
	to: Values,
): readonly [number, number] {
	let [lo, hi] = [-Infinity, Infinity];
	for (const c of channels) {
		const range = CHANNELS[c].range;
		const [a, b] = [from[c], to[c]];
		if (!range || typeof a !== "number" || typeof b !== "number" || a === b)
			continue;
		const ends = range.map((r) => (r - a) / (b - a) + 0).sort((x, y) => x - y);
		lo = Math.max(lo, ends[0]);
		hi = Math.min(hi, ends[1]);
	}
	return [lo, hi];
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/**
 * Two strings with the same text around their numbers (path data, a pair of
 * coordinates), mixed number by number at progress p. Undefined when the
 * text differs.
 */
export function mixNumbers(
	from: string,
	to: string,
	p: number,
): string | undefined {
	if (from.replace(NUMBER, "#") !== to.replace(NUMBER, "#")) return undefined;
	const targets = to.match(NUMBER) ?? [];
	let i = 0;
	return from.replace(NUMBER, (n) => {
		const [a, b] = [Number(n), Number(targets[i++])];
		return String(Number((a + (b - a) * p).toFixed(2)) + 0);
	});
}

export type Channel =
	| "opacity"
	| "x"
	| "y"
	| "scale"
	| "rotate"
	| "blur"
	| "cropLeft"
	| "cropRight"
	| "cropTop"
	| "cropBottom"
	| "draw"
	| "d"
	| "fill"
	| "stroke"
	| "width"
	| "height"
	| "r";

export type Values = Partial<Record<Channel, number | string>>;

/** A color taken from another node's solved color (after color relations). */
export type ColorRef = {
	ref: string;
	/** which of its colors; by default the one the node is drawn with */
	paint?: "fill" | "stroke";
};

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

const CROP: ChannelSpec = {
	lane: "crop",
	nest: true,
	identity: 0,
	range: [0, 1],
};

/** The sides a crop hides from, in the order CSS `inset()` lists them. */
export const CROP_CHANNELS = [
	"cropTop",
	"cropRight",
	"cropBottom",
	"cropLeft",
] as const satisfies readonly Channel[];

export const CHANNELS: Record<Channel, ChannelSpec> = {
	opacity: { lane: "opacity", nest: true, identity: 1, range: [0, 1] },
	x: { lane: "translate", nest: true, identity: 0 },
	y: { lane: "translate", nest: true, identity: 0 },
	scale: { lane: "scale", nest: true, identity: 1 },
	rotate: { lane: "rotate", nest: true, identity: 0 },
	blur: { lane: "blur", nest: true, identity: 0, range: [0, Infinity] },
	// The fraction of the target's own box hidden from each side
	cropLeft: CROP,
	cropRight: CROP,
	cropTop: CROP,
	cropBottom: CROP,
	draw: {
		lane: "draw",
		nest: false,
		identity: 1,
		range: [0, 1],
		marks: GEOMETRY,
	},
	// An arc's path is drawn from its box, so a motion on one must give a `from`
	d: { lane: "d", nest: false, marks: ["path", "arc"] },
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
	r: { lane: "r", nest: false, range: [0, Infinity], marks: ["circle"] },
};

export const isChannel = (name: string): name is Channel =>
	Object.hasOwn(CHANNELS, name);

type RestChannel =
	| "opacity"
	| "x"
	| "y"
	| "scale"
	| "rotate"
	| "blur"
	| (typeof CROP_CHANNELS)[number];

export type MotionStep =
	/** transition from the current values, starting at the cursor (or `at`, relative to the motion's start) */
	| { to: AuthoredValues; over?: number; ease?: Ease; at?: number }
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
			route?: "straight" | "smooth" | "along";
			pace?: "leg" | "trip";
			/** degrees added to the route's heading; undefined leaves the mover as drawn */
			orient?: number;
			/** the route as offsets from the mover's rest centre, when it is more than straight legs */
			path?: Route;
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
	/** every other pass of the loop runs backwards */
	alternate?: boolean;
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

/** Most passes a looping motion may unroll into (each pass adds keyframes). */
export const MAX_PASSES = 2000;

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
	colorOf: (id: string, paint?: "fill" | "stroke") => string | undefined,
): MotionSpec {
	if (spec.kind !== "motion") return spec;
	const resolve = (
		values: AuthoredValues | undefined,
	): AuthoredValues | undefined =>
		values &&
		Object.fromEntries(
			Object.entries(values).map(([k, v]) => {
				if (!isColorRef(v)) return [k, v];
				const color = colorOf(v.ref, v.paint);
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

/** The channels a motion names in its `from`, `to`, `steps` and `amplitude`, whatever their values. */
export function namedChannels(spec: MotionSpec): string[] {
	const named = (values: unknown): string[] =>
		typeof values === "object" && values !== null ? Object.keys(values) : [];
	const all =
		spec.kind === "motion"
			? [
					...named(spec.from),
					...(Array.isArray(spec.steps) ? spec.steps : []).flatMap((step) =>
						"to" in step
							? named(step.to)
							: "set" in step
								? named(step.set)
								: [],
					),
				]
			: spec.kind === "enter"
				? named(spec.from)
				: spec.kind === "exit"
					? named(spec.to)
					: spec.kind === "shake" || spec.kind === "wiggle"
						? named(spec.amplitude)
						: [];
	return [...new Set(all)];
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
				if ("to" in step) cursor += step.over ?? settleTime(step.ease) ?? 0;
			}
			last = Math.max(last, cursor);
		}
		return last > 0 ? last : DEFAULT_OVER;
	}
	if (spec.kind === "wiggle") return 2;
	if (spec.kind === "shake" || spec.kind === "sampled") return DEFAULT_OVER;
	return settleTime(spec.ease) ?? DEFAULT_OVER;
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
			const { path } = spec;
			if (path && (spec.orient !== undefined || path.points.length > 2))
				return travelPass(spec, path, start, duration);
			if (!path && !spec.points)
				throw new Error("travel: waypoints are resolved after layout");
			// Legs take time in proportion to their length, so the speed is even
			const points = path?.points ?? [{ x: 0, y: 0 }, ...(spec.points ?? [])];
			const lengths = points
				.slice(1)
				.map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
			const total = lengths.reduce((a, b) => a + b, 0);
			const ease = resolveEase(spec.ease ?? "linear");
			let at = start;
			const steps = points.slice(1).map((p, i) => {
				const over =
					total > 0
						? (duration * lengths[i]) / total
						: duration / lengths.length;
				const step = { start: at, over, ease, values: { x: p.x, y: p.y } };
				at += over;
				return step;
			});
			return {
				initial: { x: points[0].x, y: points[0].y },
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
					const over = step.over ?? settleTime(step.ease);
					if (!(over !== undefined && over > 0))
						throw new Error(
							`motion: a "to" step needs a positive over, got ${step.over}; use "set" for a cut`,
						);
					steps.push({
						start: start + cursor * k,
						over: over * k,
						ease: resolveEase(step.ease),
						values: checkValues(step.to, what),
					});
					cursor += over;
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

type Travelled = ReturnType<typeof along>;

// Seconds between the closest two samples of a travel: a 240Hz frame
const FRAME = 1 / 240;

// How far a sampled travel may stray from its route, in px and degrees
const TRAVEL_SLACK = 0.25;
const HEADING_SLACK = 0.5;

/**
 * A travel along a route, sampled into straight runs: the position (and the
 * heading, when oriented) at the distance the ease has covered. Each leg is
 * eased on its own, taking time in proportion to its length.
 */
function travelPass(
	spec: Extract<MotionSpec, { kind: "travel" }>,
	path: Route,
	start: number,
	duration: number,
): Expanded {
	const ease = resolveEase(spec.ease ?? "linear");
	const total = path.lengths[path.lengths.length - 1] ?? 0;
	const marks = path.marks.length > 1 ? path.marks : [0, total];
	const turn = spec.orient;
	const first = along(path, 0);
	let heading = first.angle;
	const steps: Step[] = [];
	const values = (p: Point): Values => ({ x: p.x, y: p.y });
	let at = start;
	for (let leg = 0; leg + 1 < marks.length; leg++) {
		const [s0, s1] = [marks[leg], marks[leg + 1]];
		const over =
			total > 0
				? (duration * (s1 - s0)) / total
				: duration / (marks.length - 1);
		if (!(over > 0)) continue;
		const from = at;
		at += over;
		if (ease.kind === "steps") {
			for (let j = 1; j <= ease.count; j++) {
				const p = along(path, s0 + ((s1 - s0) * j) / ease.count);
				heading = nearestTurn(p.angle, heading);
				steps.push({
					start: from + (over * (ease.jump ? j - 1 : j)) / ease.count,
					over: 0,
					ease: HOLD,
					values:
						turn === undefined
							? values(p)
							: { ...values(p), rotate: heading + turn },
				});
			}
			continue;
		}
		// No two samples closer in time than a frame can show
		const least = Math.min(0.5, FRAME / over);
		const count = Math.min(
			256,
			Math.max(16, Math.ceil((s1 - s0) / 4)),
			Math.max(1, Math.floor(1 / least)),
		);
		const sample = (u: number) => along(path, s0 + (s1 - s0) * easeAt(ease, u));
		// An even grid and wherever the ease turns, then halved until a straight
		// run between two samples misses nothing in between
		const grid = [
			...Array.from({ length: count + 1 }, (_, i) => i / count),
			...(ease.kind === "stops" ? ease.stops.map(([x]) => x) : []),
		].sort((a, b) => a - b);
		const us = [0];
		const samples = [sample(0)];
		const reach = (u1: number, p1: Travelled, depth: number): void => {
			const [u0, p0] = [us[us.length - 1], samples[samples.length - 1]];
			const half = sample((u0 + u1) / 2);
			const miss = Math.hypot(
				half.x - (p0.x + p1.x) / 2,
				half.y - (p0.y + p1.y) / 2,
			);
			if (depth < 10 && u1 - u0 >= 2 * least && miss > TRAVEL_SLACK / 6) {
				reach((u0 + u1) / 2, half, depth + 1);
				reach(u1, p1, depth + 1);
				return;
			}
			us.push(u1);
			samples.push(p1);
		};
		for (const u of grid)
			if (u === 1 || (u - us[us.length - 1] >= least && 1 - u >= least))
				reach(u, sample(u), 0);
		const run = (
			lane: number[][],
			slack: number,
			of: (i: number) => Values,
		) => {
			const kept = ramerDouglasPeucker(lane, slack, us);
			for (let k = 1; k < kept.length; k++)
				steps.push({
					start: from + over * us[kept[k - 1]],
					over: over * (us[kept[k]] - us[kept[k - 1]]),
					ease: LINEAR,
					values: of(kept[k]),
				});
		};
		run(
			samples.map((p) => [p.x, p.y]),
			TRAVEL_SLACK / 2,
			(i) => values(samples[i]),
		);
		if (turn === undefined) continue;
		const angles = samples.map((p) => {
			heading = nearestTurn(p.angle, heading);
			return heading;
		});
		run(
			angles.map((a) => [a]),
			HEADING_SLACK,
			(i) => ({ rotate: angles[i] + turn }),
		);
	}
	return {
		initial:
			turn === undefined
				? values(first)
				: { ...values(first), rotate: first.angle + turn },
		steps,
	};
}

function assertRest(values: Values, what: string): void {
	for (const c of Object.keys(values)) {
		if (!CHANNELS[c as Channel].nest)
			throw new Error(
				`${what} only takes opacity, x, y, scale, rotate, blur or a crop; use Motion for ${c}`,
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

/** How many times a motion plays its span; a loop without a number counts once. */
export const passesOf = (loop: MotionSpec["loop"]): number =>
	typeof loop === "number" ? Math.max(1, Math.floor(loop)) : 1;

/**
 * A looping motion is a phrase of its own: one pass in the phrase's time,
 * repeated until the time around it ends (or `loop` times) and cut there.
 * Undefined when the motion does not loop.
 */
export function loopClock(
	spec: MotionSpec,
	start: number,
	duration: number,
): Clock | undefined {
	if (!spec.loop || !(duration > 0)) return undefined;
	const passes = spec.loop === true ? Infinity : passesOf(spec.loop);
	return {
		start,
		span: spec.loop === true ? duration : duration * passes,
		length: duration,
		repeat: passes,
		alternate: spec.alternate === true,
		retrograde: false,
		cut: true,
	};
}

/**
 * Absolute steps for a motion placed at [start, start + duration]. A looping
 * motion repeats its span until `sceneEnd` (or `loop` times), each pass
 * starting over from where the motion began: its `from`, else a channel's
 * identity, else what `rest` says the mark has. A pass that crosses the scene
 * end is cut there.
 */
export function expandMotion(
	spec: MotionSpec,
	start: number,
	duration: number,
	sceneEnd: number,
	rest: (channel: Channel) => number | string | undefined = () => undefined,
): Expanded {
	const clock = loopClock(spec, start, duration);
	return clock
		? retime(onePass(spec, 0, duration), clock, sceneEnd, rest)
		: onePass(spec, start, duration);
}

// --- sampled ---------------------------------------------------------------

type Sample = { t: number; values: number[] };

const distance = (a: Sample, b: Sample): number =>
	Math.hypot(...a.values.map((v, c) => v - b.values[c]));

/**
 * The samples to keep so that straight runs between them miss none of the
 * rest by more than `tolerance`. Samples are evenly spaced unless `times` says
 * when each was taken.
 */
export function ramerDouglasPeucker(
	samples: readonly number[][],
	tolerance: number,
	times?: readonly number[],
): number[] {
	const kept = [0, samples.length - 1];
	const when = (i: number): number => times?.[i] ?? i;
	const split = (a: number, b: number): void => {
		let worst = -1;
		let error = tolerance;
		for (let i = a + 1; i < b; i++) {
			const u = (when(i) - when(a)) / (when(b) - when(a));
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
	a: Sample,
	b: Sample,
	at: (t: number) => Sample,
	tolerance: number,
): readonly [Sample, Sample] | undefined {
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
		const point = (t: number, frame = frameAt(t)): Sample => ({
			t,
			values: members.map((c) => Number(frame[c])),
		});
		const valuesOf = (p: Sample): Values =>
			Object.fromEntries(members.map((c, i) => [c, p.values[i]]));
		const runs: Sample[][] = [[point(0, frames[0])]];
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
		if (keys.length === 1 && segment.start + segment.over <= 1e-9) {
			// Over before the scene starts (which warns): the scene opens after it
			keys[0] = { ...last, values: next };
		} else if (segment.over >= nudge) {
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
			const held = keys[keys.length - 2];
			if (held?.ease === HOLD && last.t - held.t < nudge * 1.5) {
				// Another cut at the very end: the key it would hold from is taken
				keys[keys.length - 1] = { ...last, values: next };
			} else {
				// A cut at the very end: hold one nudge early so it still lands on the period
				keys[keys.length - 1] = { ...last, t: last.t - nudge, ease: HOLD };
				keys.push({ t: period, values: next, ease: NAMED.out });
			}
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

/**
 * A lane's values at t, eased between its keys (valueAt holds instead). At a
 * jump of a stepped ease this is the value after it.
 */
export function sampleAt(keys: readonly Key[], t: number): Values {
	let lo = 0;
	let hi = keys.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (keys[mid].t <= t + 1e-9) lo = mid;
		else hi = mid - 1;
	}
	const [a, b] = [keys[lo], keys[lo + 1]];
	if (!b || !moving(keys, lo)) return a.values;
	const x = (t - a.t) / (b.t - a.t);
	const p = easeAt(a.ease, a.ease.kind === "steps" ? x + 1e-9 : x);
	return Object.fromEntries(
		Object.entries(a.values).map(([c, from]) => {
			const to = b.values[c as Channel];
			return [
				c,
				typeof from === "number" && typeof to === "number"
					? clampChannel(c as Channel, from + (to - from) * p)
					: p >= 1
						? to
						: from,
			];
		}),
	);
}

export function valueAt(keys: readonly Key[], t: number): Values {
	let found = keys[0];
	for (const k of keys) if (k.t <= t + 1e-9) found = k;
	return found.values;
}
