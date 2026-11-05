import {
	CHANNELS,
	type Channel,
	type Expanded,
	expandMotion,
	type Key,
	keysOf,
	type MotionSpec,
	moving,
	type ResolvedEase,
	resolveColorRefs,
	type Step,
	type Values,
} from "./motion.ts";
import type { LayoutResult, NodeRecord } from "./solver/index.ts";

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
};

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
	if (ease.kind === "steps") return `steps(${ease.count})`;
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
			points.push({ t: k.t, value, spline: "0 0 1 1" });
			points.push({ t: next.t - period * 1e-5, value, spline: "0 0 1 1" });
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
	// A connector's solved color is drawn as its stroke (see layoutToAst)
	const connector =
		mark.type === "line" || mark.type === "curve" || mark.type === "arrow";
	if (channel === "fill")
		return (
			(connector ? undefined : box.fill) ??
			mark.fill ??
			(mark.type === "text" ? "black" : "none")
		);
	if (channel === "stroke")
		return (
			(connector ? box.fill : undefined) ??
			mark.stroke ??
			(mark.type === "text" ? "none" : "black")
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

const pick = (values: Values, channels: readonly Channel[]): Values =>
	Object.fromEntries(
		channels.filter((c) => c in values).map((c) => [c, values[c]]),
	);

/**
 * Compile the solved motions of a scene into CSS keyframes, per-mark classes
 * and SMIL. Returns undefined when nothing animates.
 */
export function compileAnimation(
	layout: LayoutResult,
	nodes: readonly NodeRecord[],
	offset: { x: number; y: number },
	opts: AnimationOptions = {},
): CompiledAnimation | undefined {
	const motions = nodes.filter(
		(n) => n.type === "motion" && n.motion && layout[n.id]?.start !== undefined,
	);
	if (motions.length === 0) return undefined;
	const span = (id: string) => ({
		start: layout[id].start ?? 0,
		duration: layout[id].duration ?? 0,
	});

	const natural = Math.max(
		...motions.map((m) => {
			const { start, duration } = span(m.id);
			const loop = m.motion?.loop;
			return (
				start +
				duration *
					(typeof loop === "number" ? Math.max(1, Math.floor(loop)) : 1)
			);
		}),
		// Rests, bars and fermatas hold time too, so a trailing hold still plays
		...Object.values(layout).map((b) =>
			b.start !== undefined ? b.start + (b.duration ?? 0) : 0,
		),
	);
	const period = opts.duration ?? natural;
	if (!(period > 0)) return undefined;

	const byId = new Map(nodes.map((n) => [n.id, n]));
	const contributions = new Map<string, Contribution[]>();
	for (const m of motions) {
		const { start, duration } = span(m.id);
		const expanded = expandMotion(
			resolveColorRefs(resolveTravel(m, layout), (id) => {
				const node = byId.get(id);
				return layout[id]?.fill ?? node?.fill ?? node?.stroke;
			}),
			start,
			duration,
			period,
		);
		const last = Math.max(0, ...expanded.steps.map((s) => s.start + s.over));
		if (last > period + 1e-6)
			throw new Error(
				`${m.id} runs until ${num(last)}s, past the ${num(period)}s scene`,
			);
		for (const target of m.targets ?? []) {
			const box = layout[target.id];
			const pivot = {
				x: box.x + box.width / 2 + offset.x,
				y: box.y + box.height / 2 + offset.y,
			};
			for (const mark of target.marks) {
				contributions.set(mark, [
					...(contributions.get(mark) ?? []),
					{ motion: m.id, expanded, pivot },
				]);
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
				continue;
			}
			if (name === "draw") {
				attrs.pathLength = 1;
				attrs["stroke-dasharray"] = 1;
			}
			cssLanes.push(lane);
		}
		if (cssLanes.length > 0) attrs.class = classFor(cssLanes);
		marks.set(markId, { attrs, smil: smils, shells });
	}

	const still =
		opts.stillAt === false
			? undefined
			: (opts.stillAt ?? (opts.loop ? period * 0.85 : period));
	const css = [
		`.${TOKEN}a{animation-duration:${num(period)}s;animation-iteration-count:${opts.loop ? "infinite" : 1};animation-fill-mode:both;animation-timing-function:linear}`,
		...rules,
		still !== undefined
			? `@media (prefers-reduced-motion:reduce){.${TOKEN}a{animation-delay:-${num(Math.min(still, period))}s!important;animation-play-state:paused!important}}`
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
