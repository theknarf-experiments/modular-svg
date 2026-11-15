import {
	type AnimationOptions,
	compileAnimation,
	hash,
	type MarkAnimation,
	type PathsOf,
	type SmilAnimate,
} from "./animation.ts";
import {
	everything,
	stageOf,
	type ViewOptions,
	viewTransform,
} from "./camera.ts";
import {
	addVec,
	type BoundingBox2d,
	boundingBoxFromPoints,
	boundingBoxFromRect,
	lengthVec,
	perpVec,
	scaleVec,
	subVec,
	unionBoundingBox2d,
	type Vec2,
	vec,
} from "./math.ts";
import type { LayoutResult, Matte, NodeRecord } from "./solver/index.ts";
import { lineEndpoints } from "./solver/index.ts";

// Extra SVG attributes passed through from the scene
export type PassthroughAttrs = Record<string, string | number>;

// SVG AST Element Types
export type SvgElement =
	| RectElement
	| CircleElement
	| TextElement
	| LineElement
	| PolygonElement
	| PathElement
	| ImageElement
	| GroupElement;

/** A wrapper group; animation uses one per stacked motion. */
export type GroupElement = {
	type: "g";
	id?: string;
	attrs?: PassthroughAttrs;
	children: SvgElement[];
};

export type RectElement = {
	type: "rect";
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	attrs?: PassthroughAttrs;
};

export type CircleElement = {
	type: "circle";
	id?: string;
	cx: number;
	cy: number;
	r: number;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	attrs?: PassthroughAttrs;
};

export type TextElement = {
	type: "text";
	id: string;
	x: number;
	y: number;
	text: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	attrs?: PassthroughAttrs;
};

export type LineElement = {
	type: "line";
	id: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	attrs?: PassthroughAttrs;
};

export type PolygonElement = {
	type: "polygon";
	id?: string;
	points: string;
	transform?: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	attrs?: PassthroughAttrs;
};

export type PathElement = {
	type: "path";
	id?: string;
	d: string;
	/** translation from the path's parsed origin to its layout position */
	transform?: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	attrs?: PassthroughAttrs;
	/** SMIL animations rendered as children */
	animate?: SmilAnimate[];
};

export type ImageElement = {
	type: "image";
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	href?: string;
	attrs?: PassthroughAttrs;
};

/**
 * What a Clip or Mask shows its content through: the shape's elements, in the
 * user space of the group that names it. Clips are masks too, since a
 * `clipPath` drops the groups that motions on its shape need.
 */
export type MaskElement = {
	type: "mask";
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	by: "alpha" | "luminance";
	children: SvgElement[];
};

export type SvgDocument = {
	width: number;
	height: number;
	children: SvgElement[];
	/** the mattes of the scene's clips and masks, which their groups name by id */
	defs?: MaskElement[];
	/** stylesheet for animated scenes */
	css?: string;
	/** seconds the animation runs */
	duration?: number;
	/** set when the scene is seen through a viewport: a `view` or a camera */
	viewBox?: string;
};

// A matte blurred by `feather` still shows this many feathers past its edge
const FEATHER_REACH = 2;

/** Nodes that only exist in time take no space. */
const isTimeOnly = (n: NodeRecord | undefined): boolean =>
	n?.type === "motion" || n?.type === "timing";

// Helper to compute layout bounds including stroke widths
export function layoutBounds(
	layout: LayoutResult,
	nodes?: NodeRecord[],
	/** also cover where modulations move things, so no phase is clipped */
	opts: { phases?: boolean } = {},
): BoundingBox2d {
	// A Modulate's relations draw nothing and rest on what they ref
	const timeOnly = new Set(
		nodes
			?.filter((n) => isTimeOnly(n) || n.scope !== undefined)
			.map((n) => n.id),
	);
	const byId = new Map(nodes?.map((n) => [n.id, n]));
	const clipped = nodes?.some((n) => n.matte) ?? false;
	const everywhere = (id: string, box: LayoutResult[string]) =>
		opts.phases && box.phases
			? [box, ...Object.values(box.phases)].map((b) => [id, b] as const)
			: [[id, box] as const];
	const placed = Object.entries(layout).flatMap(([id, box]) =>
		everywhere(id, box),
	);
	// Where a clip can show anything: round the marks of its shape wherever
	// layout has them, strokes and the reach of a feather included (the clip's
	// own box carries the solver's residue). Undefined for a clip that only hides
	const windows = new Map<string, BoundingBox2d | undefined>();
	const windowOf = (clip: NodeRecord): BoundingBox2d | undefined => {
		if (windows.has(clip.id)) return windows.get(clip.id);
		const found = clip.matte?.inverse
			? undefined
			: (clip.matte?.shapes ?? [])
					.flatMap((id) => {
						const [n, box] = [byId.get(id), layout[id]];
						const grow =
							(n?.strokeWidth ?? (n?.type === "arrow" ? 3 : 0)) / 2 +
							(clip.matte?.feather ?? 0) * FEATHER_REACH;
						return box
							? everywhere(id, box).map(([, b]) =>
									boundingBoxFromRect({
										x: b.x - grow,
										y: b.y - grow,
										width: b.width + grow * 2,
										height: b.height + grow * 2,
									}),
								)
							: [];
					})
					.reduce<BoundingBox2d | undefined>(
						(acc, bb) => (acc ? unionBoundingBox2d(acc, bb) : bb),
						undefined,
					);
		windows.set(clip.id, found);
		return found;
	};
	// A shape is not drawn, and content only shows inside every clip round it
	const shown = (id: string, bb: BoundingBox2d): BoundingBox2d | undefined => {
		const n = byId.get(id);
		if (n?.shapes !== undefined) return undefined;
		// A box round other things may reach round a shape, or round what a
		// clip hides: in a scene with clips only what is drawn counts
		if (clipped && !n?.type) return undefined;
		let seen = bb;
		for (
			let clip = byId.get(n?.within ?? ""), depth = 0;
			clip && depth <= byId.size;
			clip = byId.get(clip.within ?? ""), depth++
		) {
			if (clip.matte?.inverse) continue;
			const window = windowOf(clip);
			if (!window) return undefined;
			seen = {
				start: vec(
					Math.max(seen.start.x, window.start.x),
					Math.max(seen.start.y, window.start.y),
				),
				end: vec(
					Math.min(seen.end.x, window.end.x),
					Math.min(seen.end.y, window.end.y),
				),
			};
			if (seen.end.x < seen.start.x || seen.end.y < seen.start.y)
				return undefined;
		}
		return seen;
	};
	const boxes = placed
		.filter(([id]) => !timeOnly.has(id))
		.flatMap(([id, box]) => shown(id, boundingBoxFromRect(box)) ?? [])
		.reduce<BoundingBox2d | undefined>(
			(acc, bb) => (acc ? unionBoundingBox2d(acc, bb) : bb),
			undefined,
		);

	const withStroke = placed.reduce<BoundingBox2d | undefined>(
		(acc, [id, box]) => {
			const n = byId.get(id);
			const sw = n?.strokeWidth ?? (n?.type === "arrow" ? 3 : 0);
			if (!sw) return acc;
			const bb = shown(
				id,
				boundingBoxFromRect({
					x: box.x - sw / 2,
					y: box.y - sw / 2,
					width: box.width + sw,
					height: box.height + sw,
				}),
			);
			if (!bb) return acc;
			return acc ? unionBoundingBox2d(acc, bb) : bb;
		},
		boxes,
	);

	const fallback = boundingBoxFromPoints(vec(0, 0), vec(0, 0));
	return withStroke ?? fallback;
}

// Helper to get common attributes
function getAttrs(n?: NodeRecord): {
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	attrs?: PassthroughAttrs;
} {
	if (!n) return {};
	const fill =
		n.fill !== undefined ? n.fill : n.type === "text" ? "black" : "none";
	// Text is filled, not stroked; a default black stroke would outline every
	// glyph (a 1px outline, invisible only while the fill is also dark).
	const stroke = n.stroke ?? (n.type === "text" ? "none" : "black");
	const sw = n.strokeWidth ?? (n.type === "arrow" ? 3 : undefined);
	return {
		fill,
		stroke,
		...(sw !== undefined ? { strokeWidth: sw } : {}),
		...(n.attrs ? { attrs: n.attrs } : {}),
	};
}

// Build rect element
function buildRect(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord | undefined,
	offset: Vec2,
): RectElement {
	const sw = n?.strokeWidth ?? 0;
	const attrs = getAttrs(n);
	return {
		type: "rect",
		id,
		x: box.x + offset.x - sw / 2,
		y: box.y + offset.y - sw / 2,
		width: box.width + sw,
		height: box.height + sw,
		...attrs,
	};
}

// Build circle element
function buildCircle(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	offset: Vec2,
): CircleElement {
	const r = (n.r ?? box.width / 2) as number;
	const cx = box.x + offset.x + r;
	const cy = box.y + offset.y + r;
	const attrs = getAttrs(n);
	return {
		type: "circle",
		id,
		cx,
		cy,
		r,
		...attrs,
	};
}

// Build text element
function buildText(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	offset: Vec2,
): TextElement {
	const t = n.text ?? "";
	const attrs = getAttrs(n);
	return {
		type: "text",
		id,
		x: box.x + offset.x,
		y: box.y + offset.y,
		text: t,
		...attrs,
	};
}

// Build image element
function buildImage(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	offset: Vec2,
): ImageElement {
	return {
		type: "image",
		id,
		x: box.x + offset.x,
		y: box.y + offset.y,
		width: box.width,
		height: box.height,
		...(n.href !== undefined ? { href: n.href } : {}),
		...(n.attrs ? { attrs: n.attrs } : {}),
	};
}

type Box = { left: number; top: number; right: number; bottom: number };

function toBox(b: LayoutResult[string], offset: Vec2): Box {
	return {
		left: b.x + offset.x,
		top: b.y + offset.y,
		right: b.x + offset.x + b.width,
		bottom: b.y + offset.y + b.height,
	};
}

// Build line element connecting two boxes (see lineEndpoints in the solver)
function buildLine(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
	offset: Vec2,
): LineElement | undefined {
	const a = n.from ? layout[n.from] : undefined;
	const b = n.to ? layout[n.to] : undefined;
	if (!a || !b) return;
	const { fromX, fromY, toX, toY } = lineEndpoints(
		toBox(a, offset),
		toBox(b, offset),
		n.source,
		n.target,
	);
	return {
		type: "line",
		id,
		x1: fromX,
		y1: fromY,
		x2: toX,
		y2: toY,
		stroke: n.stroke ?? "black",
		strokeWidth: n.strokeWidth ?? 3,
		...(n.attrs ? { attrs: n.attrs } : {}),
	};
}

// A point on a circle at an angle in degrees, 0 = top, clockwise positive
function polar(
	cx: number,
	cy: number,
	r: number,
	deg: number,
): [number, number] {
	const rad = ((deg - 90) * Math.PI) / 180;
	return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

const round = (n: number) => Number(n.toFixed(3));

// SVG path for a wedge (pie slice) or annular sector between two angles.
// innerR 0 = full slice to the center; a full 360 sweep draws a ring.
export function arcPath(
	cx: number,
	cy: number,
	r: number,
	innerR: number,
	startAngle: number,
	endAngle: number,
): string {
	const sweep = endAngle - startAngle;
	const full = Math.abs(sweep) >= 360 - 1e-6;
	const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
	const f = round;
	if (full) {
		// full circle/ring via two 180 arcs; inner reversed so nonzero fill
		// leaves a hole
		const outer = `M ${f(cx)},${f(cy - r)} A ${f(r)},${f(r)} 0 1 1 ${f(cx)},${f(cy + r)} A ${f(r)},${f(r)} 0 1 1 ${f(cx)},${f(cy - r)} Z`;
		if (innerR <= 0) return outer;
		const inner = `M ${f(cx)},${f(cy - innerR)} A ${f(innerR)},${f(innerR)} 0 1 0 ${f(cx)},${f(cy + innerR)} A ${f(innerR)},${f(innerR)} 0 1 0 ${f(cx)},${f(cy - innerR)} Z`;
		return `${outer} ${inner}`;
	}
	const [ox0, oy0] = polar(cx, cy, r, startAngle);
	const [ox1, oy1] = polar(cx, cy, r, endAngle);
	if (innerR <= 0) {
		return `M ${f(cx)},${f(cy)} L ${f(ox0)},${f(oy0)} A ${f(r)},${f(r)} 0 ${largeArc} 1 ${f(ox1)},${f(oy1)} Z`;
	}
	const [ix0, iy0] = polar(cx, cy, innerR, startAngle);
	const [ix1, iy1] = polar(cx, cy, innerR, endAngle);
	return `M ${f(ix0)},${f(iy0)} L ${f(ox0)},${f(oy0)} A ${f(r)},${f(r)} 0 ${largeArc} 1 ${f(ox1)},${f(oy1)} L ${f(ix1)},${f(iy1)} A ${f(innerR)},${f(innerR)} 0 ${largeArc} 0 ${f(ix0)},${f(iy0)} Z`;
}

// Build an arc mark: a wedge within the node's 2r box (center-anchored like
// a circle), painted as a path
function buildArc(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	offset: Vec2,
): PathElement {
	const r = (n.r ?? box.width / 2) as number;
	const cx = box.x + offset.x + r;
	const cy = box.y + offset.y + r;
	const attrs = getAttrs(n);
	return {
		type: "path",
		id,
		d: arcPath(cx, cy, r, n.innerR ?? 0, n.startAngle ?? 0, n.endAngle ?? 360),
		fill: attrs.fill,
		stroke: attrs.stroke,
		strokeWidth: attrs.strokeWidth,
		...(attrs.attrs ? { attrs: attrs.attrs } : {}),
	};
}

// Build a smooth cubic between two boxes: same endpoints as a Line, with
// control points at the midpoint along the control axis (d3-style link)
function buildCurve(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
	offset: Vec2,
): PathElement | undefined {
	const a = n.from ? layout[n.from] : undefined;
	const b = n.to ? layout[n.to] : undefined;
	if (!a || !b) return;
	const { fromX, fromY, toX, toY } = lineEndpoints(
		toBox(a, offset),
		toBox(b, offset),
		n.source,
		n.target,
	);
	const dir =
		n.curveDirection === "auto" || n.curveDirection === undefined
			? Math.abs(toX - fromX) >= Math.abs(toY - fromY)
				? "horizontal"
				: "vertical"
			: n.curveDirection;
	const d =
		dir === "horizontal"
			? `M ${fromX},${fromY} C ${(fromX + toX) / 2},${fromY} ${(fromX + toX) / 2},${toY} ${toX},${toY}`
			: `M ${fromX},${fromY} C ${fromX},${(fromY + toY) / 2} ${toX},${(fromY + toY) / 2} ${toX},${toY}`;
	return {
		type: "path",
		id,
		d,
		fill: "none",
		stroke: n.stroke ?? "black",
		strokeWidth: n.strokeWidth ?? 3,
		...(n.attrs ? { attrs: n.attrs } : {}),
	};
}

// Build path element: the stored d is emitted with a translation from its
// parsed origin to wherever layout placed the node
function buildPath(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	offset: Vec2,
): PathElement {
	const dx = box.x + offset.x - (n.dOrigin?.x ?? 0);
	const dy = box.y + offset.y - (n.dOrigin?.y ?? 0);
	const transform = dx !== 0 || dy !== 0 ? `translate(${dx},${dy})` : undefined;
	return {
		type: "path",
		id,
		d: n.d ?? "",
		...(transform ? { transform } : {}),
		fill: n.fill ?? "none",
		stroke: n.stroke ?? "black",
		strokeWidth: n.strokeWidth,
		...(n.attrs ? { attrs: n.attrs } : {}),
	};
}

// Build arrow elements (straight line + polygon head). Deliberately NOT
// Bluefish's perfect-arrows curves — straight arrows are preferred here.
// The line runs between the boxes' facing edges with padStart/padEnd gaps.
function buildArrow(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
	offset: Vec2,
): SvgElement[] | undefined {
	const a = n.from ? layout[n.from] : undefined;
	const b = n.to ? layout[n.to] : undefined;
	if (!a || !b) return;

	const padStart = n.arrow?.padStart ?? 5;
	const padEnd = n.arrow?.padEnd ?? 5;

	// Straight segment between the box centers, clipped to each box's
	// boundary and padded along the direction of travel.
	const centerA = vec(
		a.x + offset.x + a.width / 2,
		a.y + offset.y + a.height / 2,
	);
	const centerB = vec(
		b.x + offset.x + b.width / 2,
		b.y + offset.y + b.height / 2,
	);
	const dir = subVec(centerB, centerA);
	const len = lengthVec(dir);
	const unit = len === 0 ? vec(0, 1) : scaleVec(dir, 1 / len);

	// Distance from a box center to its boundary along the direction
	const boundaryDistance = (w: number, h: number, u: Vec2): number => {
		const dx = u.x === 0 ? Infinity : Math.abs(w / 2 / u.x);
		const dy = u.y === 0 ? Infinity : Math.abs(h / 2 / u.y);
		return Math.min(dx, dy);
	};

	const start = addVec(
		centerA,
		scaleVec(unit, boundaryDistance(a.width, a.height, unit) + padStart),
	);
	const tip = addVec(
		centerB,
		scaleVec(unit, -(boundaryDistance(b.width, b.height, unit) + padEnd)),
	);

	const shaft = subVec(tip, start);
	const shaftLen = lengthVec(shaft);
	const head = 6;
	const ratio = shaftLen > 0 ? (shaftLen - head) / shaftLen : 0;
	const shaftEnd = addVec(start, scaleVec(shaft, ratio));
	const perp = perpVec(unit);
	const w = head * 0.6;
	const left = addVec(shaftEnd, scaleVec(perp, w * 0.5));
	const right = addVec(shaftEnd, scaleVec(perp, -w * 0.5));

	const attrs = getAttrs(n);

	const line: LineElement = {
		type: "line",
		id,
		x1: start.x,
		y1: start.y,
		x2: shaftEnd.x,
		y2: shaftEnd.y,
		...attrs,
	};

	const poly: PolygonElement = {
		type: "polygon",
		// Its own id, so the head can be told apart (and tweened) across renders
		id: `${id}-head`,
		points: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`,
		...attrs,
	};

	return [line, poly];
}

// Main function: convert layout to SVG AST
export function layoutToAst(
	layout: LayoutResult,
	nodes?: NodeRecord[],
	margin = 0,
	opts: {
		animation?: AnimationOptions | false;
		/** the size the document is shown at; the canvas is fitted into it */
		view?: ViewOptions;
		/**
		 * what the ids of mattes start with. By default they are named after
		 * their content; two live copies of one scene need a prefix each
		 */
		idPrefix?: string;
	} = {},
): SvgDocument {
	const byId = new Map<string, NodeRecord>();
	if (nodes) for (const n of nodes) byId.set(n.id, n);

	const bounds = layoutBounds(layout, nodes, {
		phases: opts.animation !== false,
	});
	const min = bounds.start;
	const max = bounds.end;
	// Translate the layout so its bounds start at the margin; otherwise
	// content with a positive minimum would sit outside the viewport.
	const offset = vec(-min.x + margin, -min.y + margin);
	const pathsOf: PathsOf = (mark, ends) => {
		const drawn =
			mark.type === "arc"
				? [buildArc(mark.id, ends[mark.id], mark, offset)]
				: mark.type === "arrow"
					? buildArrow(mark.id, mark, ends, offset)
					: mark.type === "curve"
						? [buildCurve(mark.id, mark, ends, offset)]
						: [buildLine(mark.id, mark, ends, offset)];
		return (drawn ?? []).flatMap((el) => {
			const path = el && asPath(el);
			return path?.id !== undefined ? [{ id: path.id, d: path.d }] : [];
		});
	};
	const width = max.x - min.x + margin * 2;
	const height = max.y - min.y + margin * 2;
	// A viewport: asked for, or needed by a camera. A canvas with no extent
	// has nothing to fit into one
	const fitted =
		opts.view || nodes?.some((n) => n.camera)
			? stageOf({ width, height }, opts.view)
			: undefined;
	const stage =
		fitted && fitted.width > 0 && fitted.height > 0 ? fitted : undefined;
	const animation =
		nodes && opts.animation !== false
			? compileAnimation(layout, nodes, offset, opts.animation, pathsOf, stage)
			: undefined;

	// Elements grouped per node so multi-element marks (arrows) sort together.
	// What a clip shows, and what shapes it, is kept apart for its group and matte
	type Painted = { zOrder: number; i: number; elements: SvgElement[] };
	const groups: Painted[] = [];
	const contents = new Map<string, Painted[]>();
	const shapes = new Map<string, Painted[]>();
	const clips: { node: NodeRecord; matte: Matte; i: number }[] = [];
	const listed = (lists: Map<string, Painted[]>, clip: string): Painted[] => {
		const list = lists.get(clip) ?? [];
		lists.set(clip, list);
		return list;
	};
	const applied = (id: string | undefined): string | undefined =>
		id !== undefined && byId.get(id)?.matte ? id : undefined;

	for (const [i, [id, box]] of Object.entries(layout).entries()) {
		const raw = byId.get(id);
		if (raw?.matte) clips.push({ node: raw, matte: raw.matte, i });
		if (!raw?.type || isTimeOnly(raw)) continue;
		const shaping = applied(raw.shapes);
		const cut = shaping && byId.get(shaping)?.matte?.kind === "clip";
		// Solved constraint colors replace what the node set, but a clip is cut
		// by its shape whatever that is painted with
		const n = {
			...raw,
			...(box.fill !== undefined && !cut ? { fill: box.fill } : {}),
			...(box.stroke !== undefined && !cut ? { stroke: box.stroke } : {}),
		};

		let elements: SvgElement[] | undefined;
		if (n.type === "circle") {
			elements = [buildCircle(id, box, n, offset)];
		} else if (n.type === "text") {
			elements = [buildText(id, box, n, offset)];
		} else if (n.type === "image") {
			elements = [buildImage(id, box, n, offset)];
		} else if (n.type === "line") {
			const line = buildLine(id, n, layout, offset);
			elements = line ? [line] : undefined;
		} else if (n.type === "curve") {
			const curve = buildCurve(id, n, layout, offset);
			elements = curve ? [curve] : undefined;
		} else if (n.type === "arc") {
			elements = [buildArc(id, box, n, offset)];
		} else if (n.type === "path") {
			elements = [buildPath(id, box, n, offset)];
		} else if (n.type === "arrow") {
			elements = buildArrow(id, n, layout, offset);
		} else {
			elements = [buildRect(id, box, n, offset)];
		}
		const animated = animation?.marks.get(id);
		if (elements && animated) elements = animateElements(elements, animated);
		if (!elements) continue;
		const inside = applied(raw.within);
		const into = shaping
			? listed(shapes, shaping)
			: inside
				? listed(contents, inside)
				: groups;
		into.push({ zOrder: n.zOrder ?? 0, i, elements });
	}

	// Stable sort by zOrder: higher paints later (on top), matching Bluefish
	const painted = (list: readonly Painted[]): SvgElement[] =>
		[...list]
			.sort((a, b) => a.zOrder - b.zOrder || a.i - b.i)
			.flatMap((g) => g.elements);

	// A matte spans three canvases, so a shape or content that a motion takes
	// off the canvas and back is not cut at its edge
	const region = {
		x: -Math.max(width, 1),
		y: -Math.max(height, 1),
		width: Math.max(width, 1) * 3,
		height: Math.max(height, 1) * 3,
	};
	const mattes = clips.map(({ node, matte }) => {
		const drawn = painted(shapes.get(node.id) ?? []);
		return {
			by: matte.by,
			inverse: matte.inverse,
			children:
				matte.feather > 0
					? [
							{
								type: "g" as const,
								attrs: { filter: `blur(${matte.feather}px)` },
								children: drawn,
							},
						]
					: drawn,
		};
	});
	const prefix =
		opts.idPrefix ??
		(clips.length > 0 ? `ms${hash(JSON.stringify([region, mattes]))}-` : "");
	const defs = mattes.map(
		({ by, inverse, children }, k): MaskElement => ({
			type: "mask",
			id: `${prefix}m${k}`,
			...region,
			by,
			children: inverse
				? [
						// What a black shape hides is cut out of this
						{
							type: "rect",
							id: `${prefix}m${k}-bg`,
							...region,
							fill: "white",
							stroke: "none",
						},
						...children,
					]
				: children,
		}),
	);
	// Inner clips first: each is one group where the clip stands in paint
	// order, inside the clip round it
	for (const [k, { node, i }] of [...clips.entries()].reverse()) {
		const group: SvgElement = {
			type: "g",
			id: node.id,
			attrs: { mask: `url(#${prefix}m${k})` },
			children: painted(contents.get(node.id) ?? []),
		};
		const animated = animation?.marks.get(node.id);
		const inside = applied(node.within);
		(inside ? listed(contents, inside) : groups).push({
			zOrder: node.zOrder ?? 0,
			i,
			elements: animated ? animateElements([group], animated) : [group],
		});
	}
	const children = painted(groups);

	const timed = {
		...(animation ? { css: animation.css, duration: animation.duration } : {}),
		...(defs.length > 0 ? { defs } : {}),
	};
	if (!stage) return { width, height, children, ...timed };

	// The default view is the still frame: what shows without CSS
	const fit = viewTransform(everything(stage), stage);
	const [x, y, scale] = [
		round(fit.x),
		round(fit.y),
		Number(fit.scale.toFixed(6)),
	];
	const still = x !== 0 || y !== 0 || scale !== 1;
	const group: SvgElement = {
		type: "g",
		attrs: {
			"data-camera": "",
			...(animation?.camera ? { class: animation.camera.class } : {}),
			...(still ? { transform: `translate(${x},${y}) scale(${scale})` } : {}),
		},
		children,
	};
	return {
		width: stage.width,
		height: stage.height,
		viewBox: `0 0 ${stage.width} ${stage.height}`,
		// Motions on a camera wrap the view, so they move it in screen px
		children: (animation?.camera?.shells ?? []).reduceRight<SvgElement[]>(
			(inner, shell) => [
				{ type: "g", attrs: { class: shell.class }, children: inner },
			],
			[group],
		),
		...timed,
	};
}

// Path data is animated as text, so long fractions are cut to what shows
const tidy = (d: string): string =>
	d.replace(/-?\d+\.\d{3,}(?:e[-+]?\d+)?/gi, (n) =>
		String(Number(Number(n).toFixed(2))),
	);

/** A line or polygon as the path that draws the same thing, so its `d` can animate. */
export function asPath(el: SvgElement): PathElement | undefined {
	if (el.type === "path") return { ...el, d: tidy(el.d) };
	if (el.type !== "line" && el.type !== "polygon") return undefined;
	const d =
		el.type === "line"
			? `M ${el.x1},${el.y1} L ${el.x2},${el.y2}`
			: `M ${el.points.trim().split(/\s+/).join(" L ")} Z`;
	return {
		type: "path",
		...(el.id !== undefined ? { id: el.id } : {}),
		d: tidy(d),
		...(el.type === "polygon" && el.transform
			? { transform: el.transform }
			: {}),
		fill: el.fill,
		stroke: el.stroke,
		strokeWidth: el.strokeWidth,
		...(el.attrs ? { attrs: el.attrs } : {}),
	};
}

// The mark's own elements take its class, pins and SMIL; its shells wrap them.
// A morphing path also gets a still copy that reduced motion shows instead.
function animateElements(
	elements: SvgElement[],
	animation: MarkAnimation,
): SvgElement[] {
	const withClass = (
		el: SvgElement,
		extra?: string,
		own = animation.attrs.class,
	) => {
		const cls = [el.attrs?.class, own, extra].filter(Boolean).join(" ");
		return { ...el.attrs, ...animation.attrs, ...(cls ? { class: cls } : {}) };
	};
	const own = elements.flatMap((el): SvgElement[] => {
		if (el.type === "g") return [el];
		// A connector redrawn between layouts: the element becomes its path
		const morph = el.id !== undefined ? animation.paths?.[el.id] : undefined;
		const path = morph && asPath(el);
		if (morph && path) {
			const redrawn: PathElement = {
				...path,
				attrs: withClass(path, morph.still?.movingClass, morph.class),
				animate: [morph.smil],
			};
			if (!morph.still) return [redrawn];
			return [
				redrawn,
				{
					...path,
					id: `${path.id}-still`,
					d: morph.still.d,
					attrs: withClass(path, morph.still.stillClass),
				},
			];
		}
		if (el.type !== "path" || animation.smil.length === 0)
			return [{ ...el, attrs: withClass(el) }];
		const moving: SvgElement = {
			...el,
			attrs: withClass(el, animation.still?.movingClass),
			animate: animation.smil,
		};
		if (!animation.still) return [moving];
		return [
			moving,
			{
				...el,
				id: el.id ? `${el.id}-still` : undefined,
				d: animation.still.d,
				attrs: withClass(el, animation.still.stillClass),
			},
		];
	});
	return animation.shells.reduceRight<SvgElement[]>(
		(inner, shell) => [
			{ type: "g", attrs: { class: shell.class }, children: inner },
		],
		own,
	);
}
