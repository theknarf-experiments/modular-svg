import {
	CHANNELS,
	type Channel,
	clampEase,
	type Expanded,
	easeAt,
	expandMotion,
	type Key,
	keysOf,
	loopClock,
	type MotionSpec,
	mixNumbers,
	moving,
	overshoots,
	passesOf,
	progressWindow,
	type ResolvedEase,
	ramerDouglasPeucker,
	resolveColorRefs,
	resolveEase,
	type Step,
	sampleAt,
	stopsOf,
	type Values,
	valueAt,
} from "./motion.ts";
import { defaultPaint } from "./parser.ts";
import { type Clock, retime } from "./phrase.ts";
import {
	arcPoints,
	flattenPath,
	type Point,
	routeOf,
	smoothThrough,
} from "./route.ts";
import type { LayoutResult, NodeRecord } from "./solver/index.ts";
import {
	foldPhases,
	type LayoutBox,
	type PhaseEvent,
	phaseBoxes,
} from "./solver/phases.ts";

export type AnimationOptions = {
	/** scene length in seconds; defaults to the end of the last motion */
	duration?: number;
	/** replay forever (default: play once and hold the last frame) */
	loop?: boolean;
	/** frame held under prefers-reduced-motion; false disables the still */
	stillAt?: number | false;
};

/** A SMIL <animate> for attributes CSS cannot reach portably (path `d`). */
export type SmilAnimate = {
	attributeName: string;
	values: string;
	keyTimes: string;
	dur: string;
	calcMode?: string;
	keySplines?: string;
	repeatCount: string;
	fill?: string;
};

export type MarkAnimation = {
	/** class and pinned attributes for the mark's own elements */
	attrs: Record<string, string | number>;
	smil: SmilAnimate[];
	/** wrapper groups, outermost first, one per motion with nesting lanes */
	shells: { class: string }[];
	/**
	 * For SMIL path morphs, which CSS cannot pause: the path data at the
	 * reduced-motion still frame, and the classes that show either the moving
	 * path or a still copy of it depending on the viewer's preference
	 */
	still?: { d: string; movingClass: string; stillClass: string };
	/**
	 * For connectors whose ends a Modulate moves apart: each element (by id)
	 * becomes a path whose `d` follows the ends, with a still copy like above.
	 * `class` replaces the mark's own on that path: it also moves `d` in CSS
	 */
	paths?: Record<
		string,
		{
			class: string;
			smil: SmilAnimate;
			still?: { d: string; movingClass: string; stillClass: string };
		}
	>;
};

/**
 * A connector's elements as path data, drawn between the given boxes of its
 * two ends (the only entries of `ends`); an arc's, drawn in the box given
 * under its own id.
 */
export type PathsOf = (
	mark: NodeRecord,
	ends: LayoutResult,
) => { id: string; d: string }[];

export type CompiledAnimation = {
	duration: number;
	css: string;
	marks: Map<string, MarkAnimation>;
};

type Lane = {
	name: string;
	channels: Channel[];
	keys: Key[];
	/** for lanes whose declaration is not a channel's own */
	declare?: (values: Values) => string;
};

// Every class and keyframe name carries this until the CSS is hashed
const TOKEN = "§";

const num = (v: number, places = 4): string => {
	const r = Number(v.toFixed(places));
	return String(Object.is(r, -0) ? 0 : r);
};

function timing(ease: ResolvedEase): string {
	if (ease.kind === "linear") return "linear";
	if (ease.kind === "steps")
		return `steps(${ease.count}${ease.jump ? ",start" : ""})`;
	if (ease.kind === "stops") {
		const last = ease.stops.length - 1;
		return `linear(${ease.stops
			.map(([x, y], i) =>
				i === 0 || i === last ? num(y, 3) : `${num(y, 3)} ${num(x * 100, 2)}%`,
			)
			.join(",")})`;
	}
	return `cubic-bezier(${ease.points.map((p) => num(p)).join(",")})`;
}

function declarations(lane: string, values: Values): string {
	const n = (c: Channel) => Number(values[c] ?? CHANNELS[c].identity ?? 0);
	switch (lane) {
		case "translate":
			return `translate:${num(n("x"))}px ${num(n("y"))}px`;
		case "rotate":
			return `rotate:${num(n("rotate"))}deg`;
		case "scale":
			return `scale:${num(n("scale"))}`;
		case "opacity":
			return `opacity:${num(n("opacity"))}`;
		case "blur":
			return `filter:blur(${num(n("blur"))}px)`;
		case "draw": {
			const drawn = n("draw");
			// Round caps leave a dot at 0, so an undrawn stroke is hidden
			return `stroke-dashoffset:${num(1 - drawn)};visibility:${drawn > 0 ? "visible" : "hidden"}`;
		}
		case "width":
		case "height":
		case "r":
			return `${lane}:${num(n(lane))}px`;
		case "d":
			return `d:path("${String(values.d)}")`;
		default:
			return `${lane}:${String(values[lane as Channel])}`;
	}
}

function percents(keys: readonly Key[], period: number): string[] {
	for (const places of [3, 4, 5]) {
		const out = keys.map((k) => `${num((k.t / period) * 100, places)}%`);
		if (new Set(out).size === out.length) return out;
	}
	throw new Error(
		`Two keyframes are too close to tell apart on a ${period}s timeline`,
	);
}

function keyframes(lane: Lane, period: number): string {
	const at = percents(lane.keys, period);
	return lane.keys
		.map((k, i) => {
			const ease = moving(lane.keys, i)
				? `;animation-timing-function:${timing(
						clampEase(
							k.ease,
							progressWindow(lane.channels, k.values, lane.keys[i + 1].values),
						),
					)}`
				: "";
			const declared =
				lane.declare?.(k.values) ?? declarations(lane.name, k.values);
			return `${at[i]}{${declared}${ease}}`;
		})
		.join("");
}

function smil(lane: Lane, period: number, loop: boolean): SmilAnimate {
	const channel = lane.channels[0];
	const points: { t: number; value: string; spline: string }[] = [];
	lane.keys.forEach((k, i) => {
		const value = String(k.values[channel]);
		const next = lane.keys[i + 1];
		if (next && moving(lane.keys, i) && k.ease.kind === "steps") {
			// Path data cannot interpolate per step; hold, then jump at the end
			// (or jump first, for a step played backwards)
			const nudge = period * 1e-5;
			points.push({ t: k.t, value, spline: "0 0 1 1" });
			points.push(
				k.ease.jump
					? {
							t: k.t + nudge,
							value: String(next.values[channel]),
							spline: "0 0 1 1",
						}
					: { t: next.t - nudge, value, spline: "0 0 1 1" },
			);
			return;
		}
		if (
			next &&
			moving(lane.keys, i) &&
			(k.ease.kind === "stops" || overshoots(k.ease))
		) {
			// keySplines cannot leave 0..1, so the ease is spelled out in values
			const { ease } = k;
			const shape =
				ease.kind === "stops" ? ease : stopsOf((x) => easeAt(ease, x));
			const to = String(next.values[channel]);
			if (shape.kind === "stops")
				for (const [x, y] of shape.stops.slice(0, -1))
					points.push({
						t: k.t + (next.t - k.t) * x,
						value: mixNumbers(value, to, y) ?? (y < 1 ? value : to),
						spline: "0 0 1 1",
					});
			return;
		}
		const spline =
			next && moving(lane.keys, i) && k.ease.kind === "bezier"
				? k.ease.points.map((p) => num(p)).join(" ")
				: "0 0 1 1";
		points.push({ t: k.t, value, spline });
	});
	const spline = points.slice(0, -1).some((p) => p.spline !== "0 0 1 1");
	return {
		attributeName: channel,
		values: points.map((p) => p.value).join(";"),
		keyTimes: points.map((p) => num(p.t / period, 6)).join(";"),
		dur: `${num(period)}s`,
		...(spline
			? {
					calcMode: "spline",
					keySplines: points
						.slice(0, -1)
						.map((p) => p.spline)
						.join(";"),
				}
			: {}),
		...(loop
			? { repeatCount: "indefinite" }
			: { repeatCount: "1", fill: "freeze" }),
	};
}

const commandsOf = (d: string): string =>
	(d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [])
		.map((t) => (/[a-zA-Z]/.test(t) ? t : "n"))
		.join("");

/** Where a lane starts when no motion gives it a value. */
function restValue(
	channel: Channel,
	mark: NodeRecord,
	box: LayoutResult[string],
): number | string {
	const identity = CHANNELS[channel].identity;
	if (identity !== undefined) return identity;
	if (channel === "fill")
		return box.fill ?? mark.fill ?? (mark.type === "text" ? "black" : "none");
	if (channel === "stroke")
		return (
			box.stroke ?? mark.stroke ?? (mark.type === "text" ? "none" : "black")
		);
	if (channel === "width") return box.width;
	if (channel === "height") return box.height;
	if (channel === "r") return mark.r ?? box.width / 2;
	if (channel === "d" && mark.type === "path") return mark.d ?? "";
	throw new Error(
		`${channel} on ${mark.id} has no starting value; give the motion a from`,
	);
}

type Phrase = Clock & { id: string };

type Contribution = {
	motion: string;
	expanded: Expanded;
	pivot: { x: number; y: number };
	/** how far the pivot is from `pivot` as layout moves the target, in scene time */
	origin?: Expanded;
	/** a mark following its box: the innermost shell, inside every motion's */
	layout?: boolean;
};

/** One clock's changes of layout. */
type Change = {
	index: number;
	events: readonly PhaseEvent[];
	eases: ResolvedEase[];
	clocks: Phrase[];
	/** its last event, to name what runs past the scene */
	last: string;
};

/** One lane's keys in scene time. */
type Track = { channels: Channel[]; keys: Key[] };
/** What holds at `at` is reached over [start, start + over]. */
type Piece = { start: number; over: number; ease: ResolvedEase; at: number };

/** What a mark's element is sized by, read off its box. */
type Sized = Partial<
	Record<"width" | "height" | "r", (box: LayoutBox) => number>
>;
const BOX: Sized = { width: (b) => b.width, height: (b) => b.height };

/**
 * The stretches over which any of the tracks moves, cut into pieces short
 * enough to cross in a straight line: tracks from different clocks ease
 * differently, so what they add up to is sampled, `fine(t0, t1)` times over
 * a stretch.
 */
function piecesOf(
	tracks: readonly Track[],
	fine: (t0: number, t1: number) => number = () => SAMPLES,
): Piece[] {
	const times: number[] = [];
	for (const t of tracks
		.flatMap((track) => track.keys.map((k) => k.t))
		.sort((a, b) => a - b))
		if (times.length === 0 || t - times[times.length - 1] > 1e-9) times.push(t);
	const pieces: Piece[] = [];
	const at = tracks.map(() => 0);
	for (let i = 0; i + 1 < times.length; i++) {
		const [t0, t1] = [times[i], times[i + 1]];
		const movers = tracks.flatMap(({ keys }, j) => {
			while (at[j] + 1 < keys.length && keys[at[j] + 1].t <= t0 + 1e-9) at[j]++;
			return moving(keys, at[j]) ? [[keys[at[j]], keys[at[j] + 1]]] : [];
		});
		if (movers.length === 0) continue;
		if (movers.every(([k]) => k.ease.kind === "steps")) {
			// Only jumps: each is a cut, not a ramp. One at t0 that jumps at the
			// end of its step belongs to the stretch before
			const jumps = new Set<number>();
			for (const [k, next] of movers) {
				if (k.ease.kind !== "steps") continue;
				const first = k.ease.jump ? 0 : 1;
				for (let j = first; j < first + k.ease.count; j++) {
					const jump = k.t + ((next.t - k.t) * j) / k.ease.count;
					const here = k.ease.jump
						? jump >= t0 - 1e-9 && jump < t1 - 1e-9
						: jump > t0 + 1e-9 && jump <= t1 + 1e-9;
					if (here) jumps.add(jump);
				}
			}
			for (const jump of [...jumps].sort((a, b) => a - b))
				pieces.push({ start: jump, over: 0, ease: CUT, at: jump });
			continue;
		}
		const count = fine(t0, t1);
		const over = (t1 - t0) / count;
		if (!movers.some(([k]) => k.ease.kind === "stops")) {
			for (let j = 1; j <= count; j++)
				pieces.push({
					start: t0 + over * (j - 1),
					over,
					ease: LINEAR,
					at: j === count ? t1 : t0 + over * j,
				});
			continue;
		}
		// A sampled ease (a spring) turns at its stops: the ones that matter
		// at the distance it moves are cut on exactly
		const cuts = Array.from(
			{ length: count - 1 },
			(_, j) => t0 + over * (j + 1),
		);
		for (const [k, next] of movers) {
			if (k.ease.kind !== "stops") continue;
			const { stops } = k.ease;
			const far = Math.hypot(
				...Object.keys(k.values).map(
					(c) =>
						Number(next.values[c as Channel]) - Number(k.values[c as Channel]),
				),
			);
			const kept = ramerDouglasPeucker(
				stops.map(([, y]) => [y]),
				SLACK / 2 / Math.max(far, SLACK),
				stops.map(([x]) => x),
			);
			for (const i of kept) cuts.push(k.t + (next.t - k.t) * stops[i][0]);
		}
		let from = t0;
		for (const cut of [...cuts.sort((a, b) => a - b), t1]) {
			if (cut !== t1 && (cut - from < 1e-6 || t1 - cut < 1e-6)) continue;
			pieces.push({ start: from, over: cut - from, ease: LINEAR, at: cut });
			from = cut;
		}
	}
	return pieces;
}

/** `rest` plus what every track adds to it at t. */
function totalAt(tracks: readonly Track[], rest: Values, t: number): Values {
	const total: Values = { ...rest };
	for (const { channels, keys } of tracks) {
		const values = sampleAt(keys, t);
		for (const c of channels)
			if (c in rest)
				total[c] = Number(total[c]) + Number(values[c]) - Number(rest[c]);
	}
	return total;
}

const lanesOf = (values: Values): Map<string, Channel[]> => {
	const lanes = new Map<string, Channel[]>();
	for (const c of Object.keys(values) as Channel[]) {
		const lane = CHANNELS[c].lane;
		lanes.set(lane, [...new Set([...(lanes.get(lane) ?? []), c])]);
	}
	return lanes;
};

const touched = (e: Expanded): Values =>
	Object.assign({}, e.initial, ...e.steps.map((s) => s.values));

const LINEAR: ResolvedEase = { kind: "linear" };
const CUT: ResolvedEase = { kind: "steps", count: 1 };
// Seconds given to a timeline on which nothing takes any, so it can be held
const INSTANT = 1;
// Linear pieces a connector's path is sampled into across one change of layout
const SAMPLES = 16;
// Ends that move within this of each other carry their connector along whole
const RIGID = 1e-2;
// How far a path redrawn after a motion may stray from its samples, in px
const SLACK = 0.5;
// The most pieces one stretch of a motion is sampled into
const FINEST = 32;

/**
 * How many straight pieces draw a stretch over which the tracks move `far`
 * px between them. A piece's miss grows with the distance and falls with the
 * square of the count, so this keeps the miss SAMPLES pieces leave over 64px.
 */
const piecesFor = (far: number): number =>
	Math.min(FINEST, Math.max(2, Math.ceil(2 * Math.sqrt(far))));

/** How far the tracks move between two times, summed. */
function farBetween(tracks: readonly Track[], t0: number, t1: number): number {
	let far = 0;
	for (const { channels, keys } of tracks) {
		const [a, b] = [sampleAt(keys, t0), sampleAt(keys, t1)];
		far += Math.hypot(...channels.map((c) => Number(b[c]) - Number(a[c])));
	}
	return far;
}

// A recorded move carries the solver's residue on the sides that stayed put
const differs = (a: number, b: number): boolean => Math.abs(a - b) > 1e-3;

const isConnector = (n: NodeRecord): boolean =>
	n.type === "line" || n.type === "curve" || n.type === "arrow";

/**
 * A mark following its box through a clock's changes of layout: x and y as
 * offsets from home, and what `sized` reads off the box for the element.
 */
function followBox(
	home: LayoutBox,
	boxes: readonly LayoutBox[],
	events: readonly { start: number; over: number }[],
	eases: readonly ResolvedEase[],
	sized: Sized = {},
): Expanded | undefined {
	const initial: Values = {};
	const steps: Step[] = [];
	let prev = home;
	boxes.forEach((box, i) => {
		const values: Values = {};
		if (differs(box.x, prev.x) || differs(box.y, prev.y)) {
			values.x = box.x - home.x;
			values.y = box.y - home.y;
			initial.x = 0;
			initial.y = 0;
		}
		for (const [c, of] of Object.entries(sized) as [
			keyof Sized,
			Sized["r"],
		][]) {
			if (!of || !differs(of(box), of(prev))) continue;
			values[c] = of(box);
			initial[c] = of(home);
		}
		prev = box;
		if (Object.keys(values).length === 0) return;
		const { start, over } = events[i];
		steps.push({ start, over, ease: over > 0 ? eases[i] : CUT, values });
	});
	return steps.length > 0 ? { initial, steps } : undefined;
}

const pick = (values: Values, channels: readonly Channel[]): Values =>
	Object.fromEntries(
		channels.filter((c) => c in values).map((c) => [c, values[c]]),
	);

/** The part of `e` on the channels `keep` lets through, if any. */
function only(
	e: Expanded,
	keep: (c: Channel) => boolean,
): Expanded | undefined {
	const channels = (Object.keys(touched(e)) as Channel[]).filter(keep);
	if (channels.length === 0) return undefined;
	return {
		initial: pick(e.initial, channels),
		steps: e.steps
			.filter((s) => channels.some((c) => c in s.values))
			.map((s) => ({ ...s, values: pick(s.values, channels) })),
	};
}

const numbersOf = (d: string): number[] =>
	(d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

/**
 * The straight pieces of a sampled path without those its neighbours already
 * draw: runs of pieces that follow on from each other are thinned to within
 * SLACK. `initial` is the path before the first piece.
 */
function thinned(initial: string, pieces: readonly Step[]): Step[] {
	const out: Step[] = [];
	let before = initial;
	for (let i = 0; i < pieces.length; ) {
		const straight = (s: Step) => s.over > 0 && s.ease.kind === "linear";
		let j = i + 1;
		if (straight(pieces[i]))
			while (
				j < pieces.length &&
				straight(pieces[j]) &&
				Math.abs(pieces[j].start - pieces[j - 1].start - pieces[j - 1].over) <
					1e-9
			)
				j++;
		const run = pieces.slice(i, j);
		const paths = [before, ...run.map((s) => String(s.values.d))];
		const points = paths.map(numbersOf);
		before = paths[paths.length - 1];
		i = j;
		if (run.length < 2 || points.some((p) => p.length !== points[0].length)) {
			out.push(...run);
			continue;
		}
		const times = [run[0].start, ...run.map((s) => s.start + s.over)];
		const kept = ramerDouglasPeucker(points, SLACK, times);
		for (let k = 1; k < kept.length; k++)
			out.push({
				start: times[kept[k - 1]],
				over: times[kept[k]] - times[kept[k - 1]],
				ease: LINEAR,
				values: { d: paths[kept[k]] },
			});
	}
	return out;
}

const TRANSLATE = (c: Channel): boolean => c === "x" || c === "y";

const opposite = (e: Expanded): Expanded => {
	const flip = (values: Values): Values =>
		Object.fromEntries(Object.entries(values).map(([c, v]) => [c, -Number(v)]));
	return {
		initial: flip(e.initial),
		steps: e.steps.map((s) => ({ ...s, values: flip(s.values) })),
	};
};

type Performed = { motion: string; expanded: Expanded };
/** How the motions around a connector move it and its ends, in scene time. */
type Carried = {
	/** moves both ends alike: the connector rides along in a shell */
	both: Performed[];
	/** moves one end against the connector */
	from: Expanded[];
	to: Expanded[];
};
type ReplacedLane = {
	channels: Channel[];
	initial: Values;
	segments: Step[];
	owners: string[];
};

/**
 * A lane's value just before `t`, from what plays on it in `list`: the last
 * step to end by then, or the `initial` of a motion that started by then.
 * Undefined when nothing has set it yet.
 */
function valueBefore(
	list: readonly Performed[],
	channel: Channel,
	t: number,
): number | string | undefined {
	let at = -Infinity;
	let value: number | string | undefined;
	const set = (time: number, v: number | string | undefined): void => {
		if (v === undefined || time > t + 1e-9 || time < at) return;
		[at, value] = [time, v];
	};
	for (const { expanded } of list) {
		const steps = expanded.steps.filter((s) => channel in s.values);
		set(Math.min(...steps.map((s) => s.start)), expanded.initial[channel]);
		for (const s of steps) set(s.start + s.over, s.values[channel]);
	}
	return value;
}

/**
 * The lanes whose value each motion replaces (fill, width, d, ...), merged
 * across the motions on one mark. Two that move a lane at once is an error.
 * The motion that moves a lane first decides where it starts; where a later
 * one starts from (its `from`, a backward phrase's last frame) is a cut at
 * that motion's start.
 */
function replacedLanes(
	markId: string,
	list: readonly Performed[],
): Map<string, ReplacedLane> {
	type Part = Performed & { segments: Step[]; first: number };
	const parts = new Map<string, { channels: Channel[]; parts: Part[] }>();
	for (const performed of list) {
		for (const [name, channels] of lanesOf(touched(performed.expanded))) {
			if (CHANNELS[channels[0]].nest) continue;
			const lane = parts.get(name) ?? { channels, parts: [] };
			const segments = performed.expanded.steps
				.filter((s) => lane.channels.some((c) => c in s.values))
				.map((s) => ({ ...s, values: pick(s.values, lane.channels) }));
			const first = Math.min(...segments.map((s) => s.start));
			lane.parts.push({ ...performed, segments, first });
			parts.set(name, lane);
		}
	}
	const own = new Map<string, ReplacedLane>();
	for (const [name, lane] of parts) {
		const entry: ReplacedLane = {
			channels: lane.channels,
			initial: {},
			segments: [],
			owners: [],
		};
		// Array sort is stable, so equal starts keep the order they came in
		const ordered = [...lane.parts].sort((a, b) => a.first - b.first);
		ordered.forEach(({ motion, expanded, segments, first }, i) => {
			for (const a of segments) {
				const clash = entry.segments.find(
					(b) =>
						a.start < b.start + b.over - 1e-9 &&
						b.start < a.start + a.over - 1e-9,
				);
				if (clash)
					throw new Error(
						`${entry.owners.join(", ")} and ${motion} both move ${name} on ${markId} at ${num(Math.max(a.start, clash.start))}s`,
					);
			}
			const initial = pick(expanded.initial, lane.channels);
			if (i === 0 || !Number.isFinite(first))
				entry.initial = { ...initial, ...entry.initial };
			else {
				const so: Performed[] = [
					{
						motion,
						expanded: { initial: entry.initial, steps: entry.segments },
					},
				];
				const values = Object.fromEntries(
					Object.entries(initial).filter(
						([c, v]) => valueBefore(so, c as Channel, first) !== v,
					),
				);
				if (Object.keys(values).length > 0)
					entry.segments.push({ start: first, over: 0, ease: CUT, values });
			}
			entry.segments.push(...segments);
			entry.owners.push(motion);
		});
		own.set(name, entry);
	}
	return own;
}

/**
 * Compile the solved motions and changes of layout of a scene into CSS
 * keyframes, per-mark classes and SMIL. Returns undefined when nothing
 * animates. `pathsOf` draws connectors, for those whose ends move apart.
 */
export function compileAnimation(
	layout: LayoutResult,
	nodes: readonly NodeRecord[],
	offset: { x: number; y: number },
	opts: AnimationOptions = {},
	pathsOf?: PathsOf,
): CompiledAnimation | undefined {
	const motions = nodes.filter(
		(n) => n.type === "motion" && n.motion && layout[n.id]?.start !== undefined,
	);
	const span = (id: string) => ({
		start: layout[id].start ?? 0,
		duration: layout[id].duration ?? 0,
	});
	const phases = foldPhases(nodes, (id) =>
		layout[id]?.start === undefined
			? undefined
			: (layout[id].local ?? span(id)),
	);
	if (motions.length === 0 && phases.length === 0) return undefined;

	const natural = Math.max(
		...motions.map((m) => {
			const { start, duration } = span(m.id);
			const loop = m.motion?.loop;
			// Inside a phrase a loop's passes are part of the phrase's length
			return start + duration * (m.clock === undefined ? passesOf(loop) : 1);
		}),
		// Rests, bars and fermatas hold time too, so a trailing hold still plays
		...Object.values(layout).map((b) =>
			b.start !== undefined ? b.start + (b.duration ?? 0) : 0,
		),
	);
	// A change of layout that takes no time still holds once nothing else is
	// timed: the timeline is then one held frame
	const instant = natural <= 0 && phases.some((p) => p.clock === undefined);
	const period = opts.duration ?? (instant ? INSTANT : natural);
	if (!(period > 0)) return undefined;

	const byId = new Map(nodes.map((n) => [n.id, n]));
	// A phrase and those around it, innermost first
	const clocksFrom = (innermost: string | undefined): Phrase[] => {
		const chain: Phrase[] = [];
		for (
			let id = innermost;
			id !== undefined && chain.length < nodes.length;
			id = byId.get(id)?.clock
		) {
			const box = layout[id];
			const phrase = byId.get(id)?.phrase;
			if (!box || !phrase) break;
			const own = box.local ?? span(id);
			chain.push({
				id,
				start: own.start,
				span: own.duration,
				length: box.length ?? 0,
				...phrase,
			});
		}
		return chain;
	};
	// A looping motion is a phrase of its own, inside the one it plays in
	const loops = new Map<
		string,
		{ clock: Phrase; around: string | undefined }
	>();
	const loopOf = (m: NodeRecord): Phrase | undefined => {
		const id = `loop(${m.id})`;
		const known = loops.get(id);
		if (known) return known.clock;
		const { start, duration } = layout[m.id].local ?? span(m.id);
		const clock = m.motion && loopClock(m.motion, start, duration);
		if (!clock) return undefined;
		loops.set(id, { clock: { ...clock, id }, around: m.clock });
		return { ...clock, id };
	};
	const clocksOf = (n: NodeRecord): Phrase[] => {
		const loop = n.motion && loopOf(n);
		return loop ? [loop, ...clocksFrom(n.clock)] : clocksFrom(n.clock);
	};
	const chainOf = (id: string): Phrase[] => {
		const loop = loops.get(id);
		return loop ? [loop.clock, ...clocksFrom(loop.around)] : clocksFrom(id);
	};
	// Each phrase plays the steps in the time of the one around it
	const through = (
		clocks: readonly Clock[],
		e: Expanded,
		rest: (c: Channel) => number | string,
	): Expanded =>
		clocks.reduce(
			(inner, clock, i) =>
				retime(inner, clock, clocks[i + 1]?.length ?? period, rest),
			e,
		);
	const pastEnd = (id: string, expanded: Expanded): void => {
		const last = Math.max(0, ...expanded.steps.map((s) => s.start + s.over));
		if (last > period + 1e-6)
			throw new Error(
				`${id} runs until ${num(last)}s, past the ${num(period)}s scene`,
			);
	};

	const still =
		opts.stillAt === false
			? undefined
			: Math.min(opts.stillAt ?? (opts.loop ? period * 0.85 : period), period);

	const contributions = new Map<string, Contribution[]>();
	const contribute = (mark: string, c: Contribution): void => {
		const list = contributions.get(mark);
		if (list) list.push(c);
		else contributions.set(mark, [c]);
	};
	// Replaced lanes inside phrases, per mark and phrase, in the phrase's time
	const phrased = new Map<string, Map<string, Performed[]>>();
	/**
	 * Steps on a mark, in the time of the innermost of `clocks`. Nesting lanes
	 * compose, so each motion is retimed alone. A replaced lane is one value
	 * that every motion in the phrase takes over from the last, so those wait
	 * to be retimed together.
	 */
	const perform = (
		mark: NodeRecord,
		clocks: readonly Phrase[],
		c: Contribution,
	): void => {
		if (clocks.length === 0) {
			contribute(mark.id, c);
			return;
		}
		const nesting = only(c.expanded, (ch) => !!CHANNELS[ch].nest);
		if (nesting) {
			const played = through(clocks, nesting, (ch) =>
				restValue(ch, mark, layout[mark.id]),
			);
			pastEnd(c.motion, played);
			contribute(mark.id, { ...c, expanded: played });
		}
		const replaced = only(c.expanded, (ch) => !CHANNELS[ch].nest);
		if (!replaced) return;
		const byClock = phrased.get(mark.id) ?? new Map<string, Performed[]>();
		const list = byClock.get(clocks[0].id) ?? [];
		list.push({ motion: c.motion, expanded: replaced });
		byClock.set(clocks[0].id, list);
		phrased.set(mark.id, byClock);
	};

	// Layout in time. Each clock's changes of layout are followed on their own;
	// what several clocks do to one thing adds up
	const changeOf = new Map<string, Change>();
	phases.forEach(({ events }, index) => {
		const last = events[events.length - 1].id;
		const node = byId.get(last);
		const clocks = node ? clocksOf(node) : [];
		if (clocks.some((c) => !(c.length > 0 && c.span > 0))) return;
		const eases = events.map((e) =>
			resolveEase(byId.get(e.id)?.modulation?.ease),
		);
		const change = { index, events, eases, clocks, last };
		for (const e of events) changeOf.set(e.id, change);
	});
	const changesOf = (...ids: (string | undefined)[]): Change[] => {
		const found = new Set<Change>();
		for (const id of ids)
			for (const event of Object.keys(
				(id === undefined ? undefined : layout[id]?.phases) ?? {},
			)) {
				const change = changeOf.get(event);
				if (change) found.add(change);
			}
		return [...found].sort((a, b) => a.index - b.index);
	};
	const boxesIn = (change: Change, box: LayoutResult[string]): LayoutBox[] =>
		phaseBoxes(box, change.events);
	// A clock's steps in scene time
	const played = (change: Change, e: Expanded): Expanded => {
		const out = through(change.clocks, e, (c) => e.initial[c] ?? 0);
		pastEnd(change.last, out);
		return out;
	};
	const tracksOf = (e: Expanded): Track[] =>
		[...lanesOf(touched(e)).values()].map((channels) => ({
			channels,
			keys: keysOf(
				Object.fromEntries(channels.map((c) => [c, e.initial[c] ?? 0])),
				e.steps
					.filter((s) => channels.some((c) => c in s.values))
					.map((s) => ({ ...s, values: pick(s.values, channels) })),
				period,
			),
		}));
	const sampled = (tracks: readonly Track[], rest: Values): Expanded => ({
		initial: totalAt(tracks, rest, 0),
		steps: piecesOf(tracks).map(({ at, ...piece }) => ({
			...piece,
			values: totalAt(tracks, rest, at),
		})),
	});
	// The mark follows its box in a shell inside those of the motions on it
	const follow = (
		mark: NodeRecord,
		change: Change,
		e: Expanded | undefined,
	): void => {
		if (!e) return;
		const motion =
			change.events.find((x) => x.start === e.steps[0].start)?.id ?? "";
		if (change.clocks.length === 0) pastEnd(motion, e);
		perform(mark, change.clocks, {
			motion,
			expanded: e,
			pivot: { x: 0, y: 0 },
			layout: true,
		});
	};

	// Each motion once, in the time of its innermost phrase. A phrase with
	// nothing to play has no time to map onto the scene
	const expansions = new Map<
		string,
		{ clocks: Phrase[]; expanded: Expanded } | undefined
	>();
	const expansionOf = (m: NodeRecord) => {
		if (expansions.has(m.id)) return expansions.get(m.id);
		const clocks = clocksOf(m);
		const { start, duration } = layout[m.id].local ?? span(m.id);
		// One pass; a loop's passes are played by its clock, from the pass's start
		const looping = clocks[0]?.cut === true;
		const found = clocks.some((c) => !(c.length > 0 && c.span > 0))
			? undefined
			: {
					clocks,
					expanded: expandMotion(
						{
							...resolveColorRefs(
								resolveTravel(m, layout, byId, offset, pathsOf),
								(id, paint) => {
									const node = byId.get(id);
									if (!node) return undefined;
									const which = paint ?? defaultPaint(node);
									return layout[id]?.[which] ?? node[which];
								},
							),
							loop: undefined,
						},
						looping ? 0 : start,
						duration,
						clocks[0]?.length ?? period,
					),
				};
		expansions.set(m.id, found);
		return found;
	};
	// The motions that translate, by what they move. Built for the first
	// connector, and each one's steps are played into scene time only when a
	// connector needs them
	type Carrier = {
		motion: string;
		order: number;
		marks: Set<string>;
		targets: Set<string>;
		played: () => Expanded;
	};
	let carriers: Map<string, Carrier[]> | undefined;
	const carriersOf = (): Map<string, Carrier[]> => {
		const moving = new Map<string, Carrier[]>();
		motions.forEach((m, order) => {
			const found = expansionOf(m);
			const moved = found && only(found.expanded, TRANSLATE);
			if (!found || !moved) return;
			let e: Expanded | undefined;
			const carrier: Carrier = {
				motion: m.id,
				order,
				marks: new Set(m.targets?.flatMap((t) => t.marks)),
				targets: new Set(m.targets?.map((t) => t.id)),
				played: () => {
					e ??= through(found.clocks, moved, () => 0);
					return e;
				},
			};
			const under = m.targets?.flatMap((t) => [t.id, ...(t.under ?? [])]);
			for (const id of new Set(under)) {
				const list = moving.get(id);
				if (list) list.push(carrier);
				else moving.set(id, [carrier]);
			}
		});
		return moving;
	};
	/**
	 * What motions do to a connector's ends that they do not do to it. One on
	 * the connector itself is its own; one on a group around it and one end
	 * holds the other end back.
	 */
	const carriedOf = (id: string, from: string, to: string): Carried => {
		carriers ??= carriersOf();
		const [onFrom, onTo] = [carriers.get(from) ?? [], carriers.get(to) ?? []];
		const carried: Carried = { both: [], from: [], to: [] };
		for (const carrier of [...new Set([...onFrom, ...onTo])].sort(
			(x, y) => x.order - y.order,
		)) {
			const [a, b] = [onFrom.includes(carrier), onTo.includes(carrier)];
			if (!carrier.marks.has(id)) {
				const expanded = carrier.played();
				if (a && b) carried.both.push({ motion: carrier.motion, expanded });
				else carried[a ? "from" : "to"].push(expanded);
			} else if (a !== b && !carrier.targets.has(id))
				carried[a ? "to" : "from"].push(opposite(carrier.played()));
		}
		// Two motions that move the ends alike carry it as one would
		const keys = carried.to.map((e) => JSON.stringify(e));
		carried.from = carried.from.filter((e) => {
			const twin = keys.indexOf(JSON.stringify(e));
			if (twin < 0) return true;
			keys.splice(twin, 1);
			carried.both.push({ motion: "", expanded: carried.to[twin] });
			carried.to.splice(twin, 1);
			return false;
		});
		return carried;
	};

	const morphs = new Map<string, Map<string, Expanded & { still?: string }>>();
	for (const mark of nodes) {
		const box = layout[mark.id];
		if (!box || !mark.type || mark.type === "motion" || mark.type === "timing")
			continue;
		if (!isConnector(mark)) {
			const by = changesOf(mark.id);
			if (by.length === 0) continue;
			const grow = mark.type === "rect" ? (mark.strokeWidth ?? 0) : 0;
			// A circle or arc takes its radius from the width of its box and
			// keeps to the centre of it
			const round = mark.type === "circle" || mark.type === "arc";
			const r0 = mark.r ?? box.width / 2;
			const radius = (b: LayoutBox) =>
				Math.max(0, r0 + (b.width - box.width) / 2);
			const sized: Sized =
				mark.type === "rect" || mark.type === "image"
					? {
							width: (b) => b.width + grow,
							height: (b) => b.height + grow,
						}
					: round && (mark.type === "circle" || pathsOf)
						? { r: radius }
						: {};
			const centred = (b: LayoutBox): LayoutBox =>
				round
					? {
							...b,
							x: b.x + (b.width - box.width) / 2,
							y: b.y + (b.height - box.height) / 2,
						}
					: b;
			// An arc is a path: its radius becomes the path drawn at that radius,
			// which is linear in it, so the keys stay where they are
			const arc = (r: number | string | undefined): string =>
				pathsOf?.(
					{
						...mark,
						r: Number(r),
						innerR: r0 > 0 ? ((mark.innerR ?? 0) * Number(r)) / r0 : 0,
					},
					{
						[mark.id]: {
							...box,
							x: box.x + r0 - Number(r),
							y: box.y + r0 - Number(r),
						},
					},
				)[0]?.d ?? "";
			const drawn = (e: Expanded | undefined): Expanded | undefined => {
				if (!e || mark.type !== "arc") return e;
				const redraw = ({ r, ...rest }: Values): Values =>
					r === undefined ? rest : { ...rest, d: arc(r) };
				return {
					initial: redraw(e.initial),
					steps: e.steps.map((s) => ({ ...s, values: redraw(s.values) })),
				};
			};
			const moves = by.map((change) => ({
				change,
				e: followBox(
					centred(box),
					boxesIn(change, box).map(centred),
					change.events,
					change.eases,
					sized,
				),
			}));
			const resizing = moves.flatMap(({ change, e }) => {
				const sizes = e && only(e, (c) => !CHANNELS[c].nest);
				return sizes ? [{ change, sizes }] : [];
			});
			if (resizing.length < 2) {
				for (const { change, e } of moves) follow(mark, change, drawn(e));
				continue;
			}
			// Sizes from several clocks only add up in the time they share
			for (const { change, e } of moves)
				follow(mark, change, e && only(e, (c) => !!CHANNELS[c].nest));
			const tracks = resizing.flatMap(({ change, sizes }) =>
				tracksOf(played(change, sizes)),
			);
			for (const [side, of] of Object.entries(sized) as [
				keyof Sized,
				Sized["r"],
			][]) {
				const mine = tracks.filter((t) => t.channels.includes(side));
				if (mine.length === 0 || !of) continue;
				contribute(mark.id, {
					motion: resizing.map(({ change }) => change.last).join(", "),
					expanded: drawn(sampled(mine, { [side]: of(box) })) as Expanded,
					pivot: { x: 0, y: 0 },
				});
			}
			continue;
		}
		const [from, to] = [mark.from, mark.to];
		if (from === undefined || to === undefined) continue;
		const [a, b] = [layout[from], layout[to]];
		if (!a || !b) continue;
		const by = changesOf(from, to).map((change) => ({
			change,
			as: boxesIn(change, a),
			bs: boxesIn(change, b),
		}));
		const carried = carriedOf(mark.id, from, to);
		const apart = carried.from.length + carried.to.length > 0;
		if (by.length === 0 && !apart && carried.both.length === 0) continue;
		for (const c of carried.both)
			contribute(mark.id, { ...c, pivot: { x: 0, y: 0 } });
		const rigid = by.every(({ as, bs }) =>
			as.every(
				(ai, i) =>
					Math.abs(ai.x - a.x - (bs[i].x - b.x)) < RIGID &&
					Math.abs(ai.y - a.y - (bs[i].y - b.y)) < RIGID &&
					Math.abs(ai.width - a.width) < RIGID &&
					Math.abs(ai.height - a.height) < RIGID &&
					Math.abs(bs[i].width - b.width) < RIGID &&
					Math.abs(bs[i].height - b.height) < RIGID,
			),
		);
		// Carried whole by the layout; what motions do to one end is drawn on top
		if (rigid) {
			for (const { change, as } of by) {
				const carried = as.map((ai) => ({
					...box,
					x: box.x + ai.x - a.x,
					y: box.y + ai.y - a.y,
				}));
				follow(
					mark,
					change,
					followBox(box, carried, change.events, change.eases),
				);
			}
			if (!apart) continue;
		}
		if (!pathsOf) continue;
		// Its ends move apart, so it is redrawn between wherever they are
		const end = (
			home: LayoutBox,
			side: "as" | "bs",
			overlays: readonly Expanded[],
		) => {
			const tracks = (rigid ? [] : by)
				.flatMap((moved) => {
					const e = followBox(
						home,
						moved[side],
						moved.change.events,
						moved.change.eases,
						BOX,
					);
					return e ? tracksOf(played(moved.change, e)) : [];
				})
				.concat(overlays.flatMap(tracksOf));
			const rest = { x: 0, y: 0, width: home.width, height: home.height };
			const at = (t: number): LayoutBox => {
				const now = totalAt(tracks, rest, t);
				return {
					x: home.x + Number(now.x),
					y: home.y + Number(now.y),
					width: Number(now.width),
					height: Number(now.height),
				};
			};
			return { tracks, at };
		};
		const [endA, endB] = [end(a, "as", carried.from), end(b, "bs", carried.to)];
		const draw = (t: number) =>
			pathsOf(mark, { [from]: endA.at(t), [to]: endB.at(t) });
		const start = draw(0);
		const steps: Step[][] = start.map(() => []);
		const tracks = [...endA.tracks, ...endB.tracks];
		// A motion can be short or long, so it is sampled as finely as it is far
		const pieces = apart
			? piecesOf(tracks, (t0, t1) => piecesFor(farBetween(tracks, t0, t1)))
			: piecesOf(tracks);
		for (const { at, ...piece } of pieces)
			draw(at).forEach((el, k) => {
				steps[k]?.push({ ...piece, values: { d: el.d } });
			});
		// Motions bring as many keys as they have steps, so only the pieces the
		// path needs are kept; the still is then drawn rather than read off them
		const thin =
			apart ||
			tracks.some(({ keys }) => keys.some((k) => k.ease.kind === "stops"));
		const held = thin && still !== undefined ? draw(still) : undefined;
		morphs.set(
			mark.id,
			new Map(
				start.map((el, k) => [
					el.id,
					{
						initial: { d: el.d },
						steps: thin ? thinned(el.d, steps[k]) : steps[k],
						...(held?.[k] ? { still: held[k].d } : {}),
					},
				]),
			),
		);
	}

	// Where layout takes a motion's pivot: the centre of its target
	const origins = new Map<string, Expanded | undefined>();
	const centre = (b: LayoutBox): LayoutBox => ({
		x: b.x + b.width / 2,
		y: b.y + b.height / 2,
		width: 0,
		height: 0,
	});
	const originOf = (id: string): Expanded | undefined => {
		if (origins.has(id)) return origins.get(id);
		const box = layout[id];
		const moves = changesOf(id).flatMap((change) => {
			const e = followBox(
				centre(box),
				boxesIn(change, box).map(centre),
				change.events,
				change.eases,
			);
			return e ? [played(change, e)] : [];
		});
		const origin =
			moves.length < 2
				? moves[0]
				: sampled(moves.flatMap(tracksOf), { x: 0, y: 0 });
		origins.set(id, origin);
		return origin;
	};

	for (const m of motions) {
		const found = expansionOf(m);
		if (!found) continue;
		const { clocks, expanded } = found;
		if (clocks.length === 0) pastEnd(m.id, expanded);
		for (const target of m.targets ?? []) {
			const box = layout[target.id];
			const pivot = {
				x: box.x + box.width / 2 + offset.x,
				y: box.y + box.height / 2 + offset.y,
			};
			const origin = originOf(target.id);
			for (const mark of target.marks) {
				const node = byId.get(mark);
				if (!node || !layout[mark]) continue;
				perform(node, clocks, {
					motion: m.id,
					expanded,
					pivot,
					...(origin ? { origin } : {}),
				});
			}
		}
	}

	// Outermost phrases first, in the order they start: each merges what plays
	// on a lane in its time, then plays that as one into the time around it. A
	// lane nothing inside has set starts from what the time around left it at
	for (const [markId, byClock] of phrased) {
		const mark = byId.get(markId) as NodeRecord;
		const inside = new Map<string | undefined, Phrase[]>();
		const known = new Set<string>();
		for (const id of byClock.keys())
			chainOf(id).forEach((clock, i, chain) => {
				if (known.has(clock.id)) return;
				known.add(clock.id);
				const outer = chain[i + 1]?.id;
				inside.set(outer, [...(inside.get(outer) ?? []), clock]);
			});
		const phrasesIn = (id: string | undefined): Phrase[] =>
			[...(inside.get(id) ?? [])].sort((a, b) => a.start - b.start);
		const play = (
			clock: Phrase,
			until: number,
			around: readonly Performed[],
			before: (c: Channel) => number | string,
		): Performed => {
			const rest = (c: Channel) =>
				valueBefore(around, c, clock.start) ?? before(c);
			const playing = [...(byClock.get(clock.id) ?? [])];
			for (const inner of phrasesIn(clock.id))
				playing.push(play(inner, clock.length, playing, rest));
			const lanes = [...replacedLanes(markId, playing).values()];
			return {
				motion: [...new Set(lanes.flatMap((l) => l.owners))].join(", "),
				expanded: retime(
					{
						initial: Object.assign({}, ...lanes.map((l) => l.initial)),
						steps: lanes.flatMap((l) => l.segments),
					},
					clock,
					until,
					rest,
				),
			};
		};
		const around: Performed[] = [...(contributions.get(markId) ?? [])];
		for (const clock of phrasesIn(undefined)) {
			const played = play(clock, period, around, (c) =>
				restValue(c, mark, layout[markId]),
			);
			pastEnd(played.motion, played.expanded);
			around.push(played);
			contribute(markId, { ...played, pivot: { x: 0, y: 0 } });
		}
	}

	const rules: string[] = [];
	const keyframeNames = new Map<string, string>();
	const classNames = new Map<string, string>();
	const nameKeyframes = (body: string): string => {
		const known = keyframeNames.get(body);
		if (known) return known;
		const name = `${TOKEN}k${keyframeNames.size}`;
		keyframeNames.set(body, name);
		rules.push(`@keyframes ${name}{${body}}`);
		return name;
	};
	const nameClass = (body: string): string => {
		const known = classNames.get(body);
		if (known) return known;
		const name = `${TOKEN}c${classNames.size}`;
		classNames.set(body, name);
		rules.push(`.${name}{${body}}`);
		return name;
	};
	const classFor = (lanes: readonly Lane[], extra = ""): string =>
		`${TOKEN}a ${nameClass(`animation-name:${lanes.map((l) => nameKeyframes(keyframes(l, period))).join(",")}${extra}`)}`;

	let twins = false;

	const marks = new Map<string, MarkAnimation>();
	const ownLanes = new Map<string, Lane[]>();
	for (const [markId, list] of contributions) {
		const mark = byId.get(markId);
		const box = layout[markId];
		if (!mark || !box) continue;
		const check = (c: Channel) => {
			const allowed = CHANNELS[c].marks;
			if (allowed && !allowed.includes(mark.type ?? ""))
				throw new Error(`A ${mark.type} (${markId}) cannot animate ${c}`);
		};

		// Nesting lanes: one wrapper per motion, so stacked motions compose. The
		// one following the layout is innermost: a motion on a group then turns
		// or scales its members from where the layout has them
		const shells: { class: string }[] = [];
		for (const { expanded, pivot, origin } of [
			...list.filter((c) => !c.layout),
			...list.filter((c) => c.layout),
		]) {
			const lanes: Lane[] = [];
			for (const [name, channels] of lanesOf(touched(expanded))) {
				if (!CHANNELS[channels[0]].nest) continue;
				channels.forEach(check);
				// x and y share a lane, so both start from rest unless given
				const all: Channel[] = name === "translate" ? ["x", "y"] : channels;
				const initial = Object.fromEntries(
					all.map((c) => [c, expanded.initial[c] ?? CHANNELS[c].identity ?? 0]),
				);
				const segments = expanded.steps
					.filter((s) => all.some((c) => c in s.values))
					.map((s) => ({ ...s, values: pick(s.values, all) }));
				lanes.push({
					name,
					channels: all,
					keys: keysOf(initial, segments, period),
				});
			}
			if (lanes.length === 0) continue;
			const pivots = lanes.some(
				(l) => l.name === "scale" || l.name === "rotate",
			);
			const at = (v: Values) =>
				`transform-origin:${num(pivot.x + Number(v.x ?? 0))}px ${num(pivot.y + Number(v.y ?? 0))}px`;
			if (pivots && origin)
				lanes.push({
					name: "transform-origin",
					channels: ["x", "y"],
					keys: keysOf(
						{ x: origin.initial.x ?? 0, y: origin.initial.y ?? 0 },
						origin.steps,
						period,
					),
					declare: at,
				});
			shells.push({
				class: classFor(
					lanes,
					pivots ? `;transform-box:view-box;${at(origin?.initial ?? {})}` : "",
				),
			});
		}

		// Replacing lanes: merged across motions on the element itself
		const own = replacedLanes(markId, list);
		for (const { channels } of own.values()) channels.forEach(check);
		const attrs: Record<string, string | number> = {};
		const smils: SmilAnimate[] = [];
		let stillD: string | undefined;
		const cssLanes: Lane[] = [];
		for (const [name, entry] of own) {
			const initial = Object.fromEntries(
				entry.channels.map((c) => [
					c,
					entry.initial[c] ?? restValue(c, mark, box),
				]),
			);
			const lane: Lane = {
				name,
				channels: entry.channels,
				keys: keysOf(initial, entry.segments, period),
			};
			if (name === "d") {
				if (
					new Set(lane.keys.map((k) => commandsOf(String(k.values.d)))).size > 1
				)
					throw new Error(
						`d on ${markId} moves between paths with different commands, so it would jump`,
					);
				// SMIL reaches every browser, but runs on a clock of its own. The
				// same lane in CSS wins where the browser animates `d`, and keeps
				// time with everything else
				smils.push(smil(lane, period, !!opts.loop));
				if (still !== undefined) stillD = String(valueAt(lane.keys, still).d);
			}
			if (name === "draw") {
				attrs.pathLength = 1;
				attrs["stroke-dasharray"] = 1;
			}
			cssLanes.push(lane);
		}
		if (cssLanes.length > 0) attrs.class = classFor(cssLanes);
		ownLanes.set(markId, cssLanes);
		if (stillD !== undefined) twins = true;
		marks.set(markId, {
			attrs,
			smil: smils,
			shells,
			...(stillD !== undefined
				? {
						still: {
							d: stillD,
							movingClass: `${TOKEN}dm`,
							stillClass: `${TOKEN}ds`,
						},
					}
				: {}),
		});
	}

	// Connectors redrawn between layouts: each element's path moves in CSS,
	// and in SMIL for browsers that do not animate `d`
	for (const [markId, elements] of morphs) {
		const paths: NonNullable<MarkAnimation["paths"]> = {};
		for (const [elementId, drawn] of elements) {
			const lane: Lane = {
				name: "d",
				channels: ["d"],
				keys: keysOf(drawn.initial, drawn.steps, period),
			};
			if (still !== undefined) twins = true;
			paths[elementId] = {
				class: classFor([...(ownLanes.get(markId) ?? []), lane]),
				smil: smil(lane, period, !!opts.loop),
				...(still !== undefined
					? {
							still: {
								d: drawn.still ?? String(valueAt(lane.keys, still).d),
								movingClass: `${TOKEN}dm`,
								stillClass: `${TOKEN}ds`,
							},
						}
					: {}),
			};
		}
		marks.set(markId, {
			...(marks.get(markId) ?? { attrs: {}, smil: [], shells: [] }),
			paths,
		});
	}

	const css = [
		`.${TOKEN}a{animation-duration:${num(period)}s;animation-iteration-count:${opts.loop ? "infinite" : 1};animation-fill-mode:both;animation-timing-function:linear}`,
		...rules,
		twins ? `.${TOKEN}ds{display:none}` : "",
		still !== undefined
			? `@media (prefers-reduced-motion:reduce){.${TOKEN}a{animation-delay:-${num(still)}s!important;animation-play-state:paused!important}${twins ? `.${TOKEN}dm{display:none}.${TOKEN}ds{display:inline}` : ""}}`
			: "",
	]
		.filter(Boolean)
		.join("\n");

	// Name everything after the content, so two graphics on a page never collide
	const prefix = `ms${hash(css)}-`;
	const named = (s: string) => s.replaceAll(TOKEN, prefix);
	for (const m of marks.values()) {
		if (m.attrs.class) m.attrs.class = named(String(m.attrs.class));
		for (const s of m.shells) s.class = named(s.class);
		for (const path of Object.values(m.paths ?? {}))
			path.class = named(path.class);
		for (const twin of [m, ...Object.values(m.paths ?? {})])
			if (twin.still)
				twin.still = {
					...twin.still,
					movingClass: named(twin.still.movingClass),
					stillClass: named(twin.still.stillClass),
				};
	}
	return { duration: period, css: named(css), marks };
}

const center = (b: LayoutResult[string]) => ({
	x: b.x + b.width / 2,
	y: b.y + b.height / 2,
});

/** The polyline a mark draws, in layout coordinates; undefined for a mark with no path. */
function drawnRoute(
	mark: NodeRecord,
	layout: LayoutResult,
	offset: { x: number; y: number },
	pathsOf: PathsOf | undefined,
): { points: Point[]; closed: boolean } | undefined {
	const box = layout[mark.id];
	if (mark.type === "path" && box) {
		const { points, closed } = flattenPath(mark.d ?? "");
		const [dx, dy] = [
			box.x - (mark.dOrigin?.x ?? 0),
			box.y - (mark.dOrigin?.y ?? 0),
		];
		return {
			points: points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
			closed,
		};
	}
	if (mark.type === "arc" && box) {
		const r = mark.r ?? box.width / 2;
		const [start, end] = [mark.startAngle ?? 0, mark.endAngle ?? 360];
		return {
			points: arcPoints(box.x + r, box.y + r, r, start, end),
			closed: Math.abs(end - start) >= 360 - 1e-6,
		};
	}
	if (!isConnector(mark) || !pathsOf) return undefined;
	const [shaft, head] = pathsOf(mark, layout);
	if (!shaft) return undefined;
	const points = flattenPath(shaft.d).points;
	// An arrow runs on to the tip of its head
	const tip = head && flattenPath(head.d).points[0];
	return {
		points: [...points, ...(tip ? [tip] : [])].map((p) => ({
			x: p.x - offset.x,
			y: p.y - offset.y,
		})),
		closed: false,
	};
}

// Travel's waypoints are refs: their offsets come from the solved layout
function resolveTravel(
	m: NodeRecord,
	layout: LayoutResult,
	byId: ReadonlyMap<string, NodeRecord>,
	offset: { x: number; y: number },
	pathsOf: PathsOf | undefined,
): MotionSpec {
	const spec = m.motion as MotionSpec;
	if (spec.kind !== "travel") return spec;
	const mover = m.targets?.[0];
	if (!mover || spec.via.length === 0)
		throw new Error(`${m.id}: Travel needs a mover and at least one waypoint`);
	const from = center(layout[mover.id]);
	const home = (p: Point): Point => ({ x: p.x - from.x, y: p.y - from.y });
	const centres = spec.via.map((id) => home(center(layout[id])));
	const route = spec.route ?? "straight";
	const pace = spec.pace ?? (route === "straight" ? "leg" : "trip");
	if (route === "straight" && pace === "leg" && spec.orient === undefined)
		return { ...spec, points: centres };
	if (route === "along") {
		const points: Point[] = [];
		let closed = false;
		for (const id of spec.via) {
			const mark = byId.get(id);
			const drawn = mark && drawnRoute(mark, layout, offset, pathsOf);
			closed = spec.via.length === 1 && drawn?.closed === true;
			// A gap to the next mark is crossed in a straight run
			for (const p of drawn?.points ?? [center(layout[id])]) {
				const last = points[points.length - 1];
				if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6)
					points.push(p);
			}
		}
		return { ...spec, path: routeOf(points.map(home), undefined, closed) };
	}
	const through = [{ x: 0, y: 0 }, ...centres];
	// Through a single waypoint the smooth curve is the straight leg
	if (route === "smooth" && through.length > 2) {
		const curve = smoothThrough(through);
		return {
			...spec,
			path: routeOf(
				curve.points,
				pace === "leg" ? curve.marks : undefined,
				curve.closed,
			),
		};
	}
	const straight = routeOf(through);
	return {
		...spec,
		path: pace === "leg" ? { ...straight, marks: straight.lengths } : straight,
	};
}

function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++)
		h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(36);
}
