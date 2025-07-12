import type { LayoutResult, NodeRecord } from "./solver";

export type Vec2 = { x: number; y: number };

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const addVec = (a: Vec2, b: Vec2): Vec2 => ({
	x: a.x + b.x,
	y: a.y + b.y,
});

export const subVec = (a: Vec2, b: Vec2): Vec2 => ({
	x: a.x - b.x,
	y: a.y - b.y,
});

export const scaleVec = (v: Vec2, s: number): Vec2 => ({
	x: v.x * s,
	y: v.y * s,
});

export const lengthVec = (v: Vec2): number => Math.hypot(v.x, v.y);

export const perpVec = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

export type BoundingBox2d = { start: Vec2; end: Vec2 };

export const boundingBoxFromPoints = (...pts: Vec2[]): BoundingBox2d => {
	const xs = pts.map((p) => p.x);
	const ys = pts.map((p) => p.y);
	return {
		start: { x: Math.min(...xs), y: Math.min(...ys) },
		end: { x: Math.max(...xs), y: Math.max(...ys) },
	};
};

export const boundingBoxFromRect = (rect: {
	x: number;
	y: number;
	width: number;
	height: number;
}): BoundingBox2d =>
	boundingBoxFromPoints(
		vec(rect.x, rect.y),
		vec(rect.x + rect.width, rect.y + rect.height),
	);

export function unionBoundingBox2d(
	a: BoundingBox2d,
	b: BoundingBox2d,
): BoundingBox2d {
	return {
		start: {
			x: Math.min(a.start.x, b.start.x),
			y: Math.min(a.start.y, b.start.y),
		},
		end: {
			x: Math.max(a.end.x, b.end.x),
			y: Math.max(a.end.y, b.end.y),
		},
	};
}

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

export function xml(
	tag: string,
	args: Record<string, string | number | undefined>,
	children?: string | string[],
): string {
	const attr = Object.entries(args)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => ` ${k}="${v}"`)
		.join("");
	if (children === undefined) return `<${tag}${attr} />`;
	const body = Array.isArray(children) ? children.join("") : children;
	return `<${tag}${attr}>${body}</${tag}>`;
}

function attrs(n?: NodeRecord): Record<string, string | number | undefined> {
	if (!n) return {};
	const fill =
		n.fill !== undefined ? n.fill : n.type === "text" ? "black" : "none";
	const stroke = n.stroke ?? "black";
	const sw = n.strokeWidth ?? (n.type === "arrow" ? 3 : undefined);
	return {
		fill,
		stroke,
		...(sw !== undefined ? { "stroke-width": sw } : {}),
	};
}

function rect(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord | undefined,
	offset: Vec2,
): string {
	const sw = n?.strokeWidth ?? 0;
	return xml("rect", {
		id,
		x: box.x + offset.x - sw / 2,
		y: box.y + offset.y - sw / 2,
		width: box.width + sw,
		height: box.height + sw,
		...attrs(n),
	});
}

function circle(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	offset: Vec2,
): string {
	const r = (n.r ?? box.width / 2) as number;
	const cx = box.x + offset.x + r;
	const cy = box.y + offset.y + r;
	return xml("circle", {
		id,
		cx,
		cy,
		r,
		...attrs(n),
	});
}

function textNode(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	offset: Vec2,
): string {
	const t = n.text ?? "";
	return xml(
		"text",
		{
			id,
			x: box.x + offset.x,
			y: box.y + offset.y,
			"dominant-baseline": "hanging",
			"font-family": "sans-serif",
			...attrs(n),
		},
		t,
	);
}

function arrow(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
	shift: Vec2,
): string | undefined {
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
	const line = xml("line", {
		id,
		x1: start.x,
		y1: start.y,
		x2: shaftEnd.x,
		y2: shaftEnd.y,
		...attrs(n),
	});
	const poly = xml("polygon", {
		points: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`,
		...attrs(n),
	});
	return `${line}\n${poly}`;
}

export function layoutToSvg(
	layout: LayoutResult,
	nodes?: NodeRecord[],
): string {
	const byId = new Map<string, NodeRecord>();
	if (nodes) for (const n of nodes) byId.set(n.id, n);
	const bounds = layoutBounds(layout, nodes);
	const min = bounds.start;
	const max = bounds.end;
	const offset = vec(min.x < 0 ? -min.x : 0, min.y < 0 ? -min.y : 0);
	const body = Object.entries(layout).map(([id, box]) => {
		const n = byId.get(id);
		if (!n?.type) return "";
		if (n.type === "circle") return circle(id, box, n, offset);
		if (n.type === "text") return textNode(id, box, n, offset);
		if (n.type === "arrow") return arrow(id, n, layout, offset) ?? "";
		return rect(id, box, n, offset);
	});
	const width = max.x - min.x;
	const height = max.y - min.y;
	return xml(
		"svg",
		{ xmlns: "http://www.w3.org/2000/svg", width, height },
		body,
	);
}
