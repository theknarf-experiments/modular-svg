import { getBoxToBoxArrow } from "perfect-arrows";
import {
	type BoundingBox2d,
	boundingBoxFromPoints,
	boundingBoxFromRect,
	unionBoundingBox2d,
	type Vec2,
	vec,
} from "./math.ts";
import type { LayoutResult, NodeRecord } from "./solver/index.ts";

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

const clamp = (num: number, min: number, max: number) =>
	Math.min(Math.max(num, min), max);
const lerp = (num: number, min: number, max: number) => min + (max - min) * num;

// Build line element connecting two boxes, ported from Bluefish's Line:
// fractional source/target anchors; a missing endpoint is the other endpoint
// clamped into the box; with neither, center-biased boundary points.
function buildLine(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
	offset: Vec2,
): LineElement | undefined {
	const a = n.from ? layout[n.from] : undefined;
	const b = n.to ? layout[n.to] : undefined;
	if (!a || !b) return;
	const from = toBox(a, offset);
	const to = toBox(b, offset);

	let fromX: number;
	let fromY: number;
	let toX: number;
	let toY: number;
	if (n.source && n.target) {
		fromX = lerp(n.source[0], from.left, from.right);
		fromY = lerp(n.source[1], from.top, from.bottom);
		toX = lerp(n.target[0], to.left, to.right);
		toY = lerp(n.target[1], to.top, to.bottom);
	} else if (n.source) {
		fromX = lerp(n.source[0], from.left, from.right);
		fromY = lerp(n.source[1], from.top, from.bottom);
		toX = clamp(fromX, to.left, to.right);
		toY = clamp(fromY, to.top, to.bottom);
	} else if (n.target) {
		toX = lerp(n.target[0], to.left, to.right);
		toY = lerp(n.target[1], to.top, to.bottom);
		fromX = clamp(toX, from.left, from.right);
		fromY = clamp(toY, from.top, from.bottom);
	} else {
		// does not necessarily produce the shortest line between the boxes;
		// biased towards the center of each box's x and y axis (Bluefish quirk)
		const fromCX = (from.left + from.right) / 2;
		const fromCY = (from.top + from.bottom) / 2;
		const toCX = (to.left + to.right) / 2;
		const toCY = (to.top + to.bottom) / 2;
		fromX = clamp(clamp(fromCX, to.left, to.right), from.left, from.right);
		fromY = clamp(clamp(fromCY, to.top, to.bottom), from.top, from.bottom);
		toX = clamp(clamp(toCX, from.left, from.right), to.left, to.right);
		toY = clamp(clamp(toCY, from.top, from.bottom), to.top, to.bottom);
	}

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

// Build arrow elements using perfect-arrows, matching Bluefish's Arrow paint:
// a quadratic path, a stroke-width-scaled polygon head rotated to the end
// angle, and an optional start dot.
function buildArrow(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
	offset: Vec2,
): SvgElement[] | undefined {
	const a = n.from ? layout[n.from] : undefined;
	const b = n.to ? layout[n.to] : undefined;
	if (!a || !b) return;
	const opts = n.arrow ?? {
		bow: 0.2,
		stretch: 0.5,
		stretchMin: 40,
		stretchMax: 420,
		padStart: 5,
		padEnd: 20,
		flip: false,
		straights: true,
		start: false,
	};

	const [sx, sy, cx, cy, ex, ey, ae] = getBoxToBoxArrow(
		a.x + offset.x,
		a.y + offset.y,
		a.width,
		a.height,
		b.x + offset.x,
		b.y + offset.y,
		b.width,
		b.height,
		opts,
	);

	const stroke = n.stroke ?? "black";
	const sw = n.strokeWidth ?? 3;
	const endAngleAsDegrees = ae * (180 / Math.PI);
	const points = [
		[0, -2 * sw],
		[4 * sw, 0],
		[0, 2 * sw],
	]
		.map((p) => p.join(","))
		.join(" ");

	const elements: SvgElement[] = [];
	if (opts.start) {
		elements.push({
			type: "circle",
			cx: sx,
			cy: sy,
			r: (4 / 3) * sw,
			fill: stroke,
		});
	}
	elements.push({
		type: "path",
		id,
		d: `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`,
		fill: "none",
		stroke,
		strokeWidth: sw,
	});
	elements.push({
		type: "polygon",
		points,
		transform: `translate(${ex},${ey}) rotate(${endAngleAsDegrees})`,
		fill: stroke,
	});
	return elements;
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
