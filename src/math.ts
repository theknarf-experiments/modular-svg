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
