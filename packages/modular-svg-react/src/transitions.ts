import {
	clampEase,
	cssEase,
	type Ease,
	easeAt,
	mixNumbers,
	mixViews,
	overshoots,
	resolveEase,
	type Stage,
	type SvgDocument,
	type SvgElement,
	stopsOf,
	type View,
	viewTransform,
} from "@modular-svg/core";

export type TransitionOptions = {
	/** seconds a change takes (default 0.3) */
	duration?: number;
	ease?: Ease;
	/** fade marks in when they appear and out when they go (default true) */
	fade?: boolean;
};

/** One attribute moving from its previous solved value to the new one. */
export type Transition = {
	attributeName: string;
	from: string;
	to: string;
	/** `translate` moves the path's transform through animateTransform */
	kind: "attribute" | "translate";
};

type Attrs = Record<string, string | number | undefined>;

// What each element's geometry and paint are, by SVG attribute
function attributesOf(el: SvgElement): Attrs {
	const paint = "fill" in el ? { fill: el.fill, stroke: el.stroke } : {};
	switch (el.type) {
		case "rect":
		case "image":
			return { x: el.x, y: el.y, width: el.width, height: el.height, ...paint };
		case "circle":
			return { cx: el.cx, cy: el.cy, r: el.r, ...paint };
		case "text":
			return { x: el.x, y: el.y, ...paint };
		case "line":
			return { x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2, ...paint };
		case "polygon":
			return { points: el.points, ...paint };
		case "path":
			return { d: el.d, transform: el.transform, ...paint };
		case "g":
			return {};
	}
}

/** Every element in a document, groups and mattes flattened, by id. */
export function elementsById(doc: SvgDocument | null): Map<string, SvgElement> {
	const out = new Map<string, SvgElement>();
	const walk = (els: readonly SvgElement[]) => {
		for (const el of els) {
			if (el.type === "g") walk(el.children);
			else if (el.id) out.set(el.id, el);
		}
	};
	if (doc) walk(doc.children);
	for (const matte of doc?.defs ?? []) walk(matte.children);
	return out;
}

/** The ids of what a clip or mask shapes or shows: seen only through a matte. */
function matted(doc: SvgDocument | null): Set<string> {
	const out = new Set<string>();
	const walk = (els: readonly SvgElement[], inside: boolean) => {
		for (const el of els) {
			if (el.type === "g")
				walk(el.children, inside || el.attrs?.mask !== undefined);
			else if (inside && el.id) out.add(el.id);
		}
	};
	if (doc) walk(doc.children, false);
	for (const matte of doc?.defs ?? []) walk(matte.children, true);
	return out;
}

// Interpolating path data only works when both have the same commands
const shapeOf = (d: string): string =>
	d
		.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, "n")
		.replace(/[\s,]+/g, "");

const translateOf = (transform: string | undefined): string => {
	const m = transform && /translate\(([^,\s]+)[,\s]+([^)]+)\)/.exec(transform);
	return m ? `${m[1]} ${m[2]}` : "0 0";
};

/**
 * What changed for each element present in both documents. `live` may give
 * the value an attribute is showing right now (mid-transition), which then
 * becomes the starting point instead of the last committed value.
 */
export function diffTransitions(
	before: SvgDocument | null,
	after: SvgDocument,
	live?: (id: string, attribute: string) => number | undefined,
	opts: { fade?: boolean } = {},
): Map<string, Transition[]> {
	const old = elementsById(before);
	const out = new Map<string, Transition[]>();
	const fade = opts.fade ?? true;
	for (const [id, el] of elementsById(after)) {
		const prev = old.get(id);
		if (!prev) {
			// New marks fade up to their own opacity
			if (fade && el.type !== "g")
				out.set(id, [
					{
						attributeName: "opacity",
						from: "0",
						to: String(el.attrs?.opacity ?? 1),
						kind: "attribute",
					},
				]);
			continue;
		}
		if (prev.type !== el.type) continue;
		const a = attributesOf(prev);
		const b = attributesOf(el);
		const changes: Transition[] = [];
		for (const [name, to] of Object.entries(b)) {
			const from = a[name];
			if (to === undefined || from === undefined || from === to) continue;
			if (name === "transform") {
				const [f, t] = [translateOf(String(from)), translateOf(String(to))];
				if (f !== t)
					changes.push({
						attributeName: "transform",
						from: f,
						to: t,
						kind: "translate",
					});
				continue;
			}
			if (name === "d" && shapeOf(String(from)) !== shapeOf(String(to)))
				continue;
			// The timeline is already moving this path; a frozen tween would override it
			if (name === "d" && el.type === "path" && el.animate?.length) continue;
			if (
				name === "points" &&
				String(from).split(/\s+/).length !== String(to).split(/\s+/).length
			)
				continue;
			const now = typeof to === "number" ? live?.(id, name) : undefined;
			changes.push({
				attributeName: name,
				from: String(now ?? from),
				to: String(to),
				kind: "attribute",
			});
		}
		if (changes.length > 0) out.set(id, changes);
	}
	return out;
}

// What an attribute can show; an ease that leaves it is cut there
const RANGES: Record<string, readonly [number, number]> = {
	opacity: [0, 1],
	width: [0, Infinity],
	height: [0, Infinity],
	r: [0, Infinity],
};

const OUT = "0.23 1 0.32 1";

/**
 * SMIL attributes that tween one attribute over the transition's duration
 * and ease. A spring, or a bezier that overshoots, cannot be a keySpline (the
 * browser drops the animation), so it is spelled out as a list of values;
 * colors do not overshoot and ease out instead.
 */
export function tweenAttributes(
	t: Transition,
	opts: TransitionOptions,
): Record<string, string> {
	const ease = resolveEase(opts.ease ?? "out");
	const timing = {
		dur: `${opts.duration ?? 0.3}s`,
		begin: "indefinite",
		fill: "freeze",
	};
	const plain = { ...timing, values: `${t.from};${t.to}`, keyTimes: "0;1" };
	if (ease.kind === "linear") return { ...plain, calcMode: "linear" };
	if (ease.kind === "steps") return { ...plain, calcMode: "discrete" };
	if (ease.kind === "bezier" && !overshoots(ease))
		return { ...plain, calcMode: "spline", keySplines: ease.points.join(" ") };
	const paint = t.attributeName === "fill" || t.attributeName === "stroke";
	const range = RANGES[t.attributeName];
	const [a, b] = [Number(t.from), Number(t.to)];
	const window: readonly [number, number] =
		range && Number.isFinite(a) && Number.isFinite(b) && a !== b
			? ((range.map((r) => (r - a) / (b - a)) as [number, number]).sort(
					(x, y) => x - y,
				) as [number, number])
			: [-Infinity, Infinity];
	const shape = clampEase(
		ease.kind === "stops" ? ease : stopsOf((x) => easeAt(ease, x)),
		window,
	);
	const values =
		shape.kind === "stops" && !paint
			? shape.stops.map(([, y]) => mixNumbers(t.from, t.to, y))
			: [];
	if (shape.kind !== "stops" || paint || values.some((v) => v === undefined))
		return { ...plain, calcMode: "spline", keySplines: OUT };
	return {
		...timing,
		values: values.join(";"),
		keyTimes: shape.stops.map(([x]) => x).join(";"),
		calcMode: "linear",
	};
}

/**
 * Marks of the previous document that the new one no longer has, with a
 * fade out each: rendered on top until the transition ends. What sat in a
 * clip or mask, or shaped one, goes at once.
 */
export function exiting(
	before: SvgDocument | null,
	after: SvgDocument,
): { elements: SvgElement[]; fades: Map<string, Transition[]> } {
	const now = elementsById(after);
	const elements: SvgElement[] = [];
	const fades = new Map<string, Transition[]>();
	// Rendered on top, a shape would be drawn and clipped content shown whole
	const cut = matted(before);
	for (const [id, el] of elementsById(before)) {
		if (now.has(id) || el.type === "g" || cut.has(id)) continue;
		// Its own SMIL would keep morphing a mark that is on its way out
		elements.push(el.type === "path" ? { ...el, animate: undefined } : el);
		fades.set(id, [
			{
				attributeName: "opacity",
				from: String(el.attrs?.opacity ?? 1),
				to: "0",
				kind: "attribute",
			},
		]);
	}
	return { elements, fades };
}

/** An ease as a CSS easing function, for tweens the browser runs (default `out`). */
export const cssEasing = (ease: Ease | undefined): string =>
	cssEase(resolveEase(ease ?? "out"));

// Frames a view tween is written in: the zoom between them is geometric
const VIEW_FRAMES = 12;

const viewOf = (transform: string, stage: Stage): View | undefined => {
	if (transform === "none")
		return { x: 0, y: 0, width: stage.width, height: stage.height };
	const m = /^matrix\(([^)]+)\)$/.exec(transform);
	const [a, b, c, d, e, f] = (m?.[1] ?? "").split(",").map(Number);
	// Only a uniform scale and a translate is a view
	if (!(a > 0) || a !== d || b !== 0 || c !== 0) return undefined;
	return {
		x: -e / a,
		y: -f / a,
		width: stage.width / a,
		height: stage.height / a,
	};
};

/**
 * Keyframes that take the camera group from one computed `transform` to
 * another the way a camera moves: the view rect in a straight line, the zoom
 * at an even pace. Transforms that are not a view are tweened as they are.
 */
export function viewFrames(
	from: string,
	to: string,
	size: { width: number; height: number },
): { transform: string }[] {
	const stage = { home: size, ...size };
	const [a, b] = [viewOf(from, stage), viewOf(to, stage)];
	if (!a || !b) return [{ transform: from }, { transform: to }];
	return Array.from({ length: VIEW_FRAMES + 1 }, (_, i) => {
		const { x, y, scale } = viewTransform(
			mixViews(a, b, i / VIEW_FRAMES),
			stage,
		);
		return { transform: `translate(${x}px, ${y}px) scale(${scale})` };
	});
}
