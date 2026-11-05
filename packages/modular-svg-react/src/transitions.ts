import {
	type Ease,
	resolveEase,
	type SvgDocument,
	type SvgElement,
} from "@modular-svg/core";

export type TransitionOptions = {
	/** seconds a change takes (default 0.3) */
	duration?: number;
	ease?: Ease;
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

/** Every element in a document, groups flattened, by id. */
export function elementsById(doc: SvgDocument | null): Map<string, SvgElement> {
	const out = new Map<string, SvgElement>();
	const walk = (els: readonly SvgElement[]) => {
		for (const el of els) {
			if (el.type === "g") walk(el.children);
			else if (el.id) out.set(el.id, el);
		}
	};
	if (doc) walk(doc.children);
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
): Map<string, Transition[]> {
	const old = elementsById(before);
	const out = new Map<string, Transition[]>();
	for (const [id, el] of elementsById(after)) {
		const prev = old.get(id);
		if (!prev || prev.type !== el.type) continue;
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

/** SMIL timing attributes for a transition's duration and ease. */
export function timingAttributes(
	opts: TransitionOptions,
): Record<string, string> {
	const ease = resolveEase(opts.ease ?? "out");
	const timing = {
		dur: `${opts.duration ?? 0.3}s`,
		begin: "indefinite",
		fill: "freeze",
		keyTimes: "0;1",
	};
	if (ease.kind === "linear") return { ...timing, calcMode: "linear" };
	if (ease.kind === "steps") return { ...timing, calcMode: "discrete" };
	return { ...timing, calcMode: "spline", keySplines: ease.points.join(" ") };
}
