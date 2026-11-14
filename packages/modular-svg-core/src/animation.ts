import {
	CHANNELS,
	type Channel,
	type Expanded,
	easeAt,
	expandMotion,
	type Key,
	keysOf,
	type MotionSpec,
	moving,
	type ResolvedEase,
	resolveColorRefs,
	resolveEase,
	type Step,
	type Values,
	valueAt,
} from "./motion.ts";
import { defaultPaint } from "./parser.ts";
import { type Clock, retime } from "./phrase.ts";
import type { LayoutResult, NodeRecord } from "./solver/index.ts";
import {
	foldPhases,
	type LayoutBox,
	lerpBoxes,
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
	 * becomes a path whose `d` follows the ends, with a still copy like above
	 */
	paths?: Record<
		string,
		{
			smil: SmilAnimate;
			still?: { d: string; movingClass: string; stillClass: string };
		}
	>;
};

/**
 * A connector's elements as path data, drawn between the given boxes of its
 * two ends (the only entries of `ends`).
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

type Lane = { name: string; channels: Channel[]; keys: Key[] };

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
			return `${lane}:${num(n(lane))}px`;
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
				? `;animation-timing-function:${timing(k.ease)}`
				: "";
			return `${at[i]}{${declarations(lane.name, k.values)}${ease}}`;
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
	if (channel === "d") return mark.d ?? "";
	throw new Error(
		`${channel} on ${mark.id} has no starting value; give the motion a from`,
	);
}

type Contribution = {
	motion: string;
	expanded: Expanded;
	pivot: { x: number; y: number };
};

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
// Linear pieces a connector's path is sampled into across one change of layout
const SAMPLES = 16;
// Ends that move within this of each other carry their connector along whole
const RIGID = 1e-2;

// A recorded move carries the solver's residue on the sides that stayed put
const differs = (a: number, b: number): boolean => Math.abs(a - b) > 1e-3;

const isConnector = (n: NodeRecord): boolean =>
	n.type === "line" || n.type === "curve" || n.type === "arrow";

/**
 * A mark following its box through a clock's changes of layout: x and y as
 * offsets from home, and (when `grow` is given) the element's width and height.
 */
function followBox(
	home: LayoutBox,
	boxes: readonly LayoutBox[],
	events: readonly { start: number; over: number }[],
	eases: readonly ResolvedEase[],
	grow?: number,
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
		if (grow !== undefined && differs(box.width, prev.width)) {
			values.width = box.width + grow;
			initial.width = home.width + grow;
		}
		if (grow !== undefined && differs(box.height, prev.height)) {
			values.height = box.height + grow;
			initial.height = home.height + grow;
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
			// Inside a phrase a loop stops where the phrase does
			const passes =
				typeof loop === "number" && m.clock === undefined
					? Math.max(1, Math.floor(loop))
					: 1;
			return start + duration * passes;
		}),
		// Rests, bars and fermatas hold time too, so a trailing hold still plays
		...Object.values(layout).map((b) =>
			b.start !== undefined ? b.start + (b.duration ?? 0) : 0,
		),
	);
	const period = opts.duration ?? natural;
	if (!(period > 0)) return undefined;

	const byId = new Map(nodes.map((n) => [n.id, n]));
	// The phrases a node plays in, innermost first
	const clocksOf = (n: NodeRecord): Clock[] => {
		const chain: Clock[] = [];
		for (
			let id = n.clock;
			id !== undefined && chain.length < nodes.length;
			id = byId.get(id)?.clock
		) {
			const box = layout[id];
			const phrase = byId.get(id)?.phrase;
			if (!box || !phrase) break;
			const own = box.local ?? span(id);
			chain.push({
				start: own.start,
				span: own.duration,
				length: box.length ?? 0,
				...phrase,
			});
		}
		return chain;
	};
	const pastEnd = (id: string, expanded: Expanded): void => {
		const last = Math.max(0, ...expanded.steps.map((s) => s.start + s.over));
		if (last > period + 1e-6)
			throw new Error(
				`${id} runs until ${num(last)}s, past the ${num(period)}s scene`,
			);
	};

	const contributions = new Map<string, Contribution[]>();
	const contribute = (mark: string, c: Contribution): void => {
		const list = contributions.get(mark);
		if (list) list.push(c);
		else contributions.set(mark, [c]);
	};

	// Layout in time. Every mark a clock's modulations move follows its box in
	// an outermost shell, so the motions on it keep their pivots
	const morphs = new Map<string, Map<string, Expanded[]>>();
	for (const { events } of phases) {
		const last = byId.get(events[events.length - 1].id);
		const clocks = last ? clocksOf(last) : [];
		if (clocks.some((c) => !(c.length > 0 && c.span > 0))) continue;
		const eases = events.map((e) =>
			resolveEase(byId.get(e.id)?.modulation?.ease),
		);
		const play = (e: Expanded, rest: (c: Channel) => number | string) => {
			const played = clocks.reduce(
				(inner, clock, i) =>
					retime(inner, clock, clocks[i + 1]?.length ?? period, rest),
				e,
			);
			pastEnd(events[events.length - 1].id, played);
			return played;
		};
		const moved = (id: string | undefined): boolean => {
			const moves = id === undefined ? undefined : layout[id]?.phases;
			return moves !== undefined && events.some((e) => e.id in moves);
		};
		const follow = (mark: NodeRecord, e: Expanded | undefined): void => {
			if (!e) return;
			const box = layout[mark.id];
			contribute(mark.id, {
				motion: events.find((x) => x.start === e.steps[0].start)?.id ?? "",
				expanded: play(e, (c) => restValue(c, mark, box)),
				pivot: { x: 0, y: 0 },
			});
		};
		for (const mark of nodes) {
			const box = layout[mark.id];
			if (
				!box ||
				!mark.type ||
				mark.type === "motion" ||
				mark.type === "timing"
			)
				continue;
			if (!isConnector(mark)) {
				if (!moved(mark.id)) continue;
				const sized = mark.type === "rect" || mark.type === "image";
				const grow = mark.type === "rect" ? (mark.strokeWidth ?? 0) : 0;
				follow(
					mark,
					followBox(
						box,
						phaseBoxes(box, events),
						events,
						eases,
						sized ? grow : undefined,
					),
				);
				continue;
			}
			const [from, to] = [mark.from, mark.to];
			if (from === undefined || to === undefined) continue;
			const [a, b] = [layout[from], layout[to]];
			if (!a || !b || !(moved(from) || moved(to))) continue;
			const [as, bs] = [phaseBoxes(a, events), phaseBoxes(b, events)];
			const rigid = as.every(
				(ai, i) =>
					Math.abs(ai.x - a.x - (bs[i].x - b.x)) < RIGID &&
					Math.abs(ai.y - a.y - (bs[i].y - b.y)) < RIGID &&
					Math.abs(ai.width - a.width) < RIGID &&
					Math.abs(ai.height - a.height) < RIGID &&
					Math.abs(bs[i].width - b.width) < RIGID &&
					Math.abs(bs[i].height - b.height) < RIGID,
			);
			if (rigid) {
				const carried = as.map((ai) => ({
					...box,
					x: box.x + ai.x - a.x,
					y: box.y + ai.y - a.y,
				}));
				follow(mark, followBox(box, carried, events, eases));
				continue;
			}
			if (!pathsOf) continue;
			// Its ends move apart, so it is redrawn: each element's path is
			// sampled between the two layouts along the ease
			const draw = (fa: LayoutBox, tb: LayoutBox) =>
				pathsOf(mark, { [from]: fa, [to]: tb });
			const rest = draw(a, b);
			const steps: Step[][] = rest.map(() => []);
			let [pa, pb] = [a as LayoutBox, b as LayoutBox];
			events.forEach((e, i) => {
				const [na, nb] = [as[i], bs[i]];
				if (na === pa && nb === pb) return;
				const pieces = e.over > 0 ? SAMPLES : 1;
				for (let j = 1; j <= pieces; j++) {
					const p = j === pieces ? 1 : easeAt(eases[i], j / pieces);
					draw(lerpBoxes(pa, na, p), lerpBoxes(pb, nb, p)).forEach((el, k) => {
						steps[k]?.push({
							start: e.start + (e.over * (j - 1)) / pieces,
							over: e.over / pieces,
							ease: e.over > 0 ? LINEAR : CUT,
							values: { d: el.d },
						});
					});
				}
				[pa, pb] = [na, nb];
			});
			const elements = morphs.get(mark.id) ?? new Map<string, Expanded[]>();
			rest.forEach((el, k) => {
				const played = play(
					{ initial: { d: el.d }, steps: steps[k] },
					() => el.d,
				);
				elements.set(el.id, [...(elements.get(el.id) ?? []), played]);
			});
			morphs.set(mark.id, elements);
		}
	}

	for (const m of motions) {
		const clocks = clocksOf(m);
		// A phrase with nothing to play has no time to map onto the scene
		if (clocks.some((c) => !(c.length > 0 && c.span > 0))) continue;
		const { start, duration } = layout[m.id].local ?? span(m.id);
		const expanded = expandMotion(
			resolveColorRefs(resolveTravel(m, layout), (id, paint) => {
				const node = byId.get(id);
				if (!node) return undefined;
				const which = paint ?? defaultPaint(node);
				return layout[id]?.[which] ?? node[which];
			}),
			start,
			duration,
			clocks[0]?.length ?? period,
		);
		if (clocks.length === 0) pastEnd(m.id, expanded);
		for (const target of m.targets ?? []) {
			const box = layout[target.id];
			const pivot = {
				x: box.x + box.width / 2 + offset.x,
				y: box.y + box.height / 2 + offset.y,
			};
			for (const mark of target.marks) {
				const node = byId.get(mark);
				if (!node || !layout[mark]) continue;
				// Each phrase plays the steps in the time of the one around it
				const played = clocks.reduce(
					(e, clock, i) =>
						retime(e, clock, clocks[i + 1]?.length ?? period, (channel) =>
							restValue(channel, node, layout[mark]),
						),
					expanded,
				);
				if (clocks.length > 0) pastEnd(m.id, played);
				contribute(mark, { motion: m.id, expanded: played, pivot });
			}
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

	const still =
		opts.stillAt === false
			? undefined
			: Math.min(opts.stillAt ?? (opts.loop ? period * 0.85 : period), period);
	let twins = false;

	const marks = new Map<string, MarkAnimation>();
	for (const [markId, list] of contributions) {
		const mark = byId.get(markId);
		const box = layout[markId];
		if (!mark || !box) continue;
		const check = (c: Channel) => {
			const allowed = CHANNELS[c].marks;
			if (allowed && !allowed.includes(mark.type ?? ""))
				throw new Error(`A ${mark.type} (${markId}) cannot animate ${c}`);
		};

		// Nesting lanes: one wrapper per motion, so stacked motions compose
		const shells: { class: string }[] = [];
		for (const { expanded, pivot } of list) {
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
			const origin = pivots
				? `;transform-box:view-box;transform-origin:${num(pivot.x)}px ${num(pivot.y)}px`
				: "";
			shells.push({ class: classFor(lanes, origin) });
		}

		// Replacing lanes: merged across motions on the element itself
		const own = new Map<
			string,
			{
				channels: Channel[];
				initial: Values;
				segments: Step[];
				owners: string[];
			}
		>();
		for (const { motion, expanded } of list) {
			for (const [name, channels] of lanesOf(touched(expanded))) {
				if (CHANNELS[channels[0]].nest) continue;
				channels.forEach(check);
				const entry = own.get(name) ?? {
					channels,
					initial: {},
					segments: [],
					owners: [],
				};
				const segments = expanded.steps
					.filter((s) => channels.some((c) => c in s.values))
					.map((s) => ({ ...s, values: pick(s.values, channels) }));
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
				// The motion that moves the lane first decides where it starts
				const first = Math.min(...segments.map((s) => s.start));
				const earliest = Math.min(
					Infinity,
					...entry.segments.map((s) => s.start),
				);
				if (first < earliest)
					entry.initial = {
						...entry.initial,
						...pick(expanded.initial, channels),
					};
				else
					entry.initial = {
						...pick(expanded.initial, channels),
						...entry.initial,
					};
				entry.segments.push(...segments);
				entry.owners.push(motion);
				own.set(name, entry);
			}
		}
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
				smils.push(smil(lane, period, !!opts.loop));
				if (still !== undefined) stillD = String(valueAt(lane.keys, still).d);
				continue;
			}
			if (name === "draw") {
				attrs.pathLength = 1;
				attrs["stroke-dasharray"] = 1;
			}
			cssLanes.push(lane);
		}
		if (cssLanes.length > 0) attrs.class = classFor(cssLanes);
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

	// Connectors redrawn between layouts: SMIL on each element's path
	for (const [markId, elements] of morphs) {
		const paths: NonNullable<MarkAnimation["paths"]> = {};
		for (const [elementId, played] of elements) {
			const lane: Lane = {
				name: "d",
				channels: ["d"],
				keys: keysOf(
					played[0].initial,
					played.flatMap((e) => e.steps),
					period,
				),
			};
			if (still !== undefined) twins = true;
			paths[elementId] = {
				smil: smil(lane, period, !!opts.loop),
				...(still !== undefined
					? {
							still: {
								d: String(valueAt(lane.keys, still).d),
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

// Travel's waypoints are refs: their offsets come from the solved layout
function resolveTravel(m: NodeRecord, layout: LayoutResult): MotionSpec {
	const spec = m.motion as MotionSpec;
	if (spec.kind !== "travel") return spec;
	const mover = m.targets?.[0];
	if (!mover || spec.via.length === 0)
		throw new Error(`${m.id}: Travel needs a mover and at least one waypoint`);
	const from = center(layout[mover.id]);
	const points = spec.via.map((id) => {
		const to = center(layout[id]);
		return { x: to.x - from.x, y: to.y - from.y };
	});
	return { ...spec, points };
}

function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++)
		h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(36);
}
