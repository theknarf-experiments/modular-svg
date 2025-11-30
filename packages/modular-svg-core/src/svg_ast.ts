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
} from "./math";
import type { LayoutResult, NodeRecord } from "./solver";

// SVG AST Element Types
export type SvgElement =
	| RectElement
	| CircleElement
	| TextElement
	| LineElement
	| PolygonElement;

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
};

export type CircleElement = {
	type: "circle";
	id: string;
	cx: number;
	cy: number;
	r: number;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
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
};

export type PolygonElement = {
	type: "polygon";
	id?: string;
	points: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
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

// Build arrow elements (line + polygon)
function buildArrow(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
	shift: Vec2,
): (LineElement | PolygonElement)[] | undefined {
	const a = n.from ? layout[n.from] : undefined;
	const b = n.to ? layout[n.to] : undefined;
	if (!a || !b) return;

	const margin = 5;
	const start = vec(
		a.x + shift.x + a.width / 2,
		a.y + shift.y + a.height + margin,
	);
	const tip = vec(b.x + shift.x + b.width / 2, b.y + shift.y - margin);
	const dir = subVec(tip, start);
	const len = lengthVec(dir);
	const head = 6;
	const ratio = len > 0 ? (len - head) / len : 0;
	const shaftEnd = addVec(start, scaleVec(dir, ratio));
	const unit = len === 0 ? vec(0, 0) : scaleVec(dir, 1 / len);
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
	const offset = vec(
		(min.x < 0 ? -min.x : 0) + margin,
		(min.y < 0 ? -min.y : 0) + margin,
	);

	const children: SvgElement[] = [];

	for (const [id, box] of Object.entries(layout)) {
		const n = byId.get(id);
		if (!n?.type) continue;

		if (n.type === "circle") {
			children.push(buildCircle(id, box, n, offset));
		} else if (n.type === "text") {
			children.push(buildText(id, box, n, offset));
		} else if (n.type === "arrow") {
			const arrowElements = buildArrow(id, n, layout, offset);
			if (arrowElements) {
				children.push(...arrowElements);
			}
		} else {
			children.push(buildRect(id, box, n, offset));
		}
	}

	const width = max.x - min.x + margin * 2;
	const height = max.y - min.y + margin * 2;

	return {
		width,
		height,
		children,
	};
}
