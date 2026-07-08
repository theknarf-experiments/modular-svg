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
import type { LayoutResult, NodeRecord } from "./solver/index.ts";
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
	| ImageElement;

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

export type SvgDocument = {
	width: number;
	height: number;
	children: SvgElement[];
};

// Helper to compute layout bounds including stroke widths
export function layoutBounds(
	layout: LayoutResult,
	nodes?: NodeRecord[],
): BoundingBox2d {
	const boxes = Object.values(layout)
		.map(boundingBoxFromRect)
		.reduce<BoundingBox2d | undefined>(
			(acc, bb) => (acc ? unionBoundingBox2d(acc, bb) : bb),
			undefined,
		);

	const withStroke = Object.entries(layout).reduce<BoundingBox2d | undefined>(
		(acc, [id, box]) => {
			const n = nodes?.find((m) => m.id === id);
			const sw = n?.strokeWidth ?? (n?.type === "arrow" ? 3 : 0);
			if (!sw) return acc;
			const bb = boundingBoxFromRect({
				x: box.x - sw / 2,
				y: box.y - sw / 2,
				width: box.width + sw,
				height: box.height + sw,
			});
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
	const stroke = n.stroke ?? "black";
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
): SvgDocument {
	const byId = new Map<string, NodeRecord>();
	if (nodes) for (const n of nodes) byId.set(n.id, n);

	const bounds = layoutBounds(layout, nodes);
	const min = bounds.start;
	const max = bounds.end;
	// Translate the layout so its bounds start at the margin; otherwise
	// content with a positive minimum would sit outside the viewport.
	const offset = vec(-min.x + margin, -min.y + margin);

	// Elements grouped per node so multi-element marks (arrows) sort together
	const groups: { zOrder: number; elements: SvgElement[] }[] = [];

	for (const [id, box] of Object.entries(layout)) {
		const n = byId.get(id);
		if (!n?.type) continue;

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
		} else if (n.type === "path") {
			elements = [buildPath(id, box, n, offset)];
		} else if (n.type === "arrow") {
			elements = buildArrow(id, n, layout, offset);
		} else {
			elements = [buildRect(id, box, n, offset)];
		}
		if (elements) groups.push({ zOrder: n.zOrder ?? 0, elements });
	}

	// Stable sort by zOrder: higher paints later (on top), matching Bluefish
	const children = groups
		.map((g, i) => ({ ...g, i }))
		.sort((a, b) => a.zOrder - b.zOrder || a.i - b.i)
		.flatMap((g) => g.elements);

	const width = max.x - min.x + margin * 2;
	const height = max.y - min.y + margin * 2;

	return {
		width,
		height,
		children,
	};
}
