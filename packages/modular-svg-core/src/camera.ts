// The camera: which part of the canvas fills the viewport, over time. A
// Camera node frames what it refs from its start on; the view is one group
// whose transform is keyframed, so it keeps time with everything else in CSS.

import {
	type Expanded,
	easeAt,
	type ResolvedEase,
	ramerDouglasPeucker,
	type Step,
} from "./motion.ts";
import type { NodeRecord } from "./solver/operators.ts";
import type { LayoutBox } from "./solver/phases.ts";

/** The size the document is shown at; what is left out follows the canvas. */
export type ViewOptions = { width?: number; height?: number; aspect?: number };

/** The canvas the scene is laid out on (`home`) and the viewport it is seen through. */
export type Stage = {
	home: { width: number; height: number };
	width: number;
	height: number;
};

/** The part of the canvas that fills the viewport; it has the viewport's aspect. */
export type View = LayoutBox;

export type Fit = "contain" | "cover";

/** The viewport for a canvas: the canvas itself unless `view` says otherwise. */
export function stageOf(
	canvas: { width: number; height: number },
	view: ViewOptions = {},
): Stage {
	for (const side of ["width", "height", "aspect"] as const) {
		const v = view[side];
		if (v !== undefined && !(v > 0 && Number.isFinite(v)))
			throw new Error(`view.${side} must be above 0`);
	}
	const home = { width: canvas.width, height: canvas.height };
	const { width, height } = view;
	const aspect =
		view.aspect ??
		(home.width > 0 && home.height > 0 ? home.width / home.height : 1);
	if (width !== undefined && height !== undefined)
		return { home, width, height };
	if (width !== undefined) return { home, width, height: width / aspect };
	if (height !== undefined) return { home, width: height * aspect, height };
	if (view.aspect === undefined) return { home, ...home };
	// The smallest viewport of that aspect that holds the canvas
	return home.width >= home.height * aspect
		? { home, width: home.width, height: home.width / aspect }
		: { home, width: home.height * aspect, height: home.height };
}

/**
 * The view that shows `box` with `padding` round it: all of it (contain) or
 * as much as fills the viewport (cover). Undefined for a box with no extent.
 */
export function fitView(
	box: LayoutBox,
	padding: number,
	fit: Fit,
	stage: Stage,
): View | undefined {
	const [w, h] = [box.width + padding * 2, box.height + padding * 2];
	if (!(w > 0) && !(h > 0)) return undefined;
	const ratio = stage.width / stage.height;
	const [across, down] = [Math.max(w, 0), Math.max(h, 0) * ratio];
	const [wide, narrow] = [Math.max(across, down), Math.min(across, down)];
	// Covering a box with one side has nothing to fill the viewport with
	const width = fit === "cover" && narrow > 0 ? narrow : wide;
	const height = width / ratio;
	return {
		x: box.x + box.width / 2 - width / 2,
		y: box.y + box.height / 2 - height / 2,
		width,
		height,
	};
}

/** The view with no camera: the whole canvas, centred. */
export const everything = (stage: Stage): View =>
	fitView({ x: 0, y: 0, ...stage.home }, 0, "contain", stage) ?? {
		x: 0,
		y: 0,
		width: stage.width,
		height: stage.height,
	};

/**
 * Between two views at progress p. The rect moves on the straight line from
 * one to the other, as an animated viewBox would, but the zoom is geometric,
 * so a long push-in has an even pace instead of rushing at its end.
 */
export function mixViews(a: View, b: View, p: number): View {
	const r = b.width / a.width;
	const q = Math.abs(r - 1) < 1e-6 ? p : (r ** p - 1) / (r - 1);
	return {
		x: a.x + (b.x - a.x) * q,
		y: a.y + (b.y - a.y) * q,
		width: a.width + (b.width - a.width) * q,
		height: a.height + (b.height - a.height) * q,
	};
}

/** The transform that shows a view: scale about the origin, then translate. */
export function viewTransform(
	view: View,
	stage: Stage,
): { x: number; y: number; scale: number } {
	const scale = stage.width / view.width;
	return { x: -view.x * scale + 0, y: -view.y * scale + 0, scale };
}

export type CameraEvent = { id: string; start: number; over: number };

/**
 * The cameras of each clock in the order they start (ties in document
 * order), each settling until the next one starts at the latest.
 */
export function foldCameras(
	nodes: readonly NodeRecord[],
	spanOf: (id: string) => { start: number; duration: number } | undefined,
): { clock: string | undefined; events: CameraEvent[] }[] {
	const byClock = new Map<string | undefined, CameraEvent[]>();
	for (const node of nodes) {
		const span = node.camera && spanOf(node.id);
		if (!span) continue;
		const event = { id: node.id, start: span.start, over: span.duration };
		const list = byClock.get(node.clock);
		if (list) list.push(event);
		else byClock.set(node.clock, [event]);
	}
	return [...byClock].map(([clock, list]) => ({
		clock,
		events: compressed([...list].sort((a, b) => a.start - b.start)),
	}));
}

// Rounded like the spans it comes from, which feed keyframe percentages
const compressed = <T extends { start: number; over: number }>(
	sorted: readonly T[],
): T[] =>
	sorted.map((e, i) => {
		const next = sorted[i + 1];
		const until = next ? Math.min(e.over, next.start - e.start) : e.over;
		return { ...e, over: Math.max(0, Math.round(until * 1e6) / 1e6) };
	});

/** On a step's `x`: the framing the time around the phrase left. */
export const INHERIT = -1;

/** The view goes to a framing (by index; "everything" is no camera's) over a span. */
export type CameraStep = {
	start: number;
	over: number;
	ease: ResolvedEase;
	framing: number | "everything";
};

/**
 * Every clock's camera steps, played into scene time, as one list: by start,
 * each cut short by the next. A step that hands the view back (INHERIT, at
 * the start of a phrase's pass or the end of a backward one) goes to what
 * the last step of another clock set, so a phrase's passes begin from the
 * framing the scene had.
 */
export function mergeCameraSteps(
	perClock: readonly {
		clock: string | undefined;
		steps: readonly Step[];
	}[],
): CameraStep[] {
	// Array sort is stable: equal starts keep clock order, then the clock's own
	const all = perClock
		.flatMap(({ clock, steps }) => steps.map((step) => ({ clock, step })))
		.sort((a, b) => a.step.start - b.step.start);
	const resolved: CameraStep["framing"][] = [];
	all.forEach(({ clock, step }, i) => {
		const index = Number(step.values.x);
		if (index !== INHERIT) {
			resolved.push(index);
			return;
		}
		let j = i - 1;
		while (j >= 0 && all[j].clock === clock) j--;
		resolved.push(j >= 0 ? resolved[j] : "everything");
	});
	return compressed(
		all.map(({ step }, i) => ({
			start: step.start,
			over: step.over,
			ease: step.ease,
			framing: resolved[i],
		})),
	);
}

/** What a camera frames at each moment, and the times at which that turns. */
export type Framing = { at: (t: number) => View; breaks: readonly number[] };

/** The view at t: on its way from the framing before to the one that last started. */
export function viewAt(
	steps: readonly CameraStep[],
	framings: readonly Framing[],
	stage: Stage,
	t: number,
): View {
	let lo = -1;
	let hi = steps.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (steps[mid].start <= t) lo = mid;
		else hi = mid - 1;
	}
	const of = (i: number): View => {
		const framing = steps[i]?.framing ?? "everything";
		return framing === "everything"
			? everything(stage)
			: framings[framing].at(t);
	};
	if (lo < 0) return everything(stage);
	const { start, over, ease } = steps[lo];
	const to = of(lo);
	if (!(over > 0) || t >= start + over) return to;
	const x = (t - start) / over;
	// On a jump of a stepped ease this is the view after it, as sampleAt has it
	return mixViews(
		of(lo - 1),
		to,
		easeAt(ease, ease.kind === "steps" ? x + 1e-9 : x),
	);
}

// How far a sampled view may stray from the exact one before a stretch is
// halved, and how far thinning may move it again, in px on screen
const MISS = 0.3;
const THIN = 0.15;
// The most halvings of one stretch between two breaks: 32 pieces
const DEPTH = 5;
// A stretch is not cut finer than this part of the timeline, so no two
// keyframes share a percentage
const FINEST = 1e-4;

type Sample = { t: number; v: [x: number, y: number, scale: number] };

/**
 * The view as keyframes of its transform (`x`, `y`, `scale`): CSS moves
 * linearly between two keys, which gets neither the geometric zoom nor a
 * framing that itself moves, so each moving stretch is sampled into straight
 * pieces (32 at most) that stay within half a pixel of the exact view on
 * screen wherever that many can.
 */
export function viewKeys(
	steps: readonly CameraStep[],
	framings: readonly Framing[],
	stage: Stage,
	period: number,
): Expanded {
	const finest = period * FINEST;
	const times = new Set<number>([0, period]);
	steps.forEach((s, i) => {
		const until = Math.min(period, steps[i + 1]?.start ?? period);
		const settled = Math.min(until, s.start + s.over);
		times.add(s.start);
		times.add(settled);
		// An ease turns at its stops and jumps at its steps
		const { ease } = s;
		const turns =
			ease.kind === "stops"
				? ease.stops.map(([x]) => x)
				: ease.kind === "steps"
					? Array.from({ length: ease.count + 1 }, (_, j) => j / ease.count)
					: [];
		if (s.over > 0) for (const x of turns) times.add(s.start + s.over * x);
		const within = (i: number, end: number): void => {
			const framing = steps[i]?.framing ?? "everything";
			if (framing === "everything") return;
			for (const t of framings[framing].breaks)
				if (t > s.start && t < end) times.add(t);
		};
		within(i, until);
		within(i - 1, settled);
	});
	const breaks: number[] = [];
	for (const t of [...times].sort((a, b) => a - b))
		if (
			t >= 0 &&
			t <= period &&
			(breaks.length === 0 || t - breaks[breaks.length - 1] > 1e-9)
		)
			breaks.push(t);

	const at = (t: number): Sample => {
		const view = viewAt(steps, framings, stage, t);
		const { x, y, scale } = viewTransform(view, stage);
		return { t, v: [x, y, scale] };
	};
	// How far the corners of the exact view land from the viewport's, shown
	// by `v` instead
	const miss = (exact: View, v: Sample["v"]): number =>
		Math.max(
			Math.hypot(exact.x * v[2] + v[0], exact.y * v[2] + v[1]),
			Math.hypot(
				(exact.x + exact.width) * v[2] + v[0] - stage.width,
				(exact.y + exact.height) * v[2] + v[1] - stage.height,
			),
		);
	const between = (a: Sample, b: Sample, u: number): Sample["v"] => [
		a.v[0] + (b.v[0] - a.v[0]) * u,
		a.v[1] + (b.v[1] - a.v[1]) * u,
		a.v[2] + (b.v[2] - a.v[2]) * u,
	];
	// The samples strictly between a and b that straight pieces need
	const refine = (a: Sample, b: Sample, depth: number): Sample[] => {
		const half = (b.t - a.t) / 2;
		if (depth >= DEPTH || half < finest) return [];
		const far = [0.25, 0.5, 0.75].some(
			(u) =>
				miss(
					viewAt(steps, framings, stage, a.t + (b.t - a.t) * u),
					between(a, b, u),
				) > MISS,
		);
		if (!far) return [];
		const mid = at(a.t + half);
		return [...refine(a, mid, depth + 1), mid, ...refine(mid, b, depth + 1)];
	};
	// Where the far corners of the canvas (and half as much again around it)
	// land: everything nearer moves less, so thinning by these is safe
	const [left, top] = [-stage.home.width / 2, -stage.home.height / 2];
	const [right, bottom] = [stage.home.width * 1.5, stage.home.height * 1.5];
	const corners = ({ v }: Sample): number[] => [
		v[0] + v[2] * left,
		v[1] + v[2] * top,
		v[0] + v[2] * right,
		v[1] + v[2] * bottom,
	];
	const jumped = (a: Sample, b: Sample): boolean =>
		corners(a).some((c, i) => Math.abs(c - corners(b)[i]) > 1e-2);
	const values = ({ v }: Sample) => ({ x: v[0], y: v[1], scale: v[2] });

	const first = at(0);
	const out: Step[] = [];
	let run: Sample[] = [first];
	const flush = (): void => {
		const kept = ramerDouglasPeucker(
			run.map(corners),
			THIN,
			run.map((s) => s.t),
		);
		for (let k = 1; k < kept.length; k++) {
			const [a, b] = [run[kept[k - 1]], run[kept[k]]];
			if (b.v.every((n, c) => n === a.v[c])) continue;
			out.push({
				start: a.t,
				over: b.t - a.t,
				ease: { kind: "linear" },
				values: values(b),
			});
		}
	};
	for (let i = 0; i + 1 < breaks.length; i++) {
		const [t0, t1] = [breaks[i], breaks[i + 1]];
		const from = run[run.length - 1];
		// Just short of the break, where a cut has not happened yet
		const before = at(t1 - Math.min(1e-7, (t1 - t0) / 4));
		const after = at(t1);
		const cut = jumped(before, after);
		// A stretch too short to ramp over is a cut where it ends
		if (t1 - t0 >= finest) {
			const to = { ...(cut ? before : after), t: t1 };
			run.push(...refine(from, to, 0), to);
		} else run.push({ ...from, t: t1 });
		if (!cut && t1 - t0 >= finest) continue;
		if (!jumped(run[run.length - 1], after)) continue;
		flush();
		out.push({
			start: t1,
			over: 0,
			ease: { kind: "steps", count: 1 },
			values: values(after),
		});
		run = [after];
	}
	flush();
	return { initial: values(first), steps: out };
}
