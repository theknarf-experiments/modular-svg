import { buildSceneFromJson, solveLayout } from "@modular-svg/core";

// A normalized shape: x/y is always the top-left of the bounding box so
// circles and rects compare uniformly across both systems.
export type Shape = {
	kind: "circle" | "rect";
	x: number;
	y: number;
	width: number;
	height: number;
};

// ---------------------------------------------------------------------------
// Bluefish side
// ---------------------------------------------------------------------------

// bluefish-js touches the DOM at module scope, so it must be imported after
// the patches in bluefish-env.ts have run (setupFiles guarantee that).
export type BluefishModule = typeof import("bluefish-js");

let bluefishModule: BluefishModule | undefined;

export async function bluefish(): Promise<BluefishModule> {
	if (!bluefishModule) bluefishModule = await import("bluefish-js");
	return bluefishModule;
}

function parseTranslate(el: Element): { tx: number; ty: number } {
	const t = el.getAttribute("transform");
	if (!t) return { tx: 0, ty: 0 };
	const m = /translate\(\s*(-?[\d.eE+-]+)(?:[ ,]+(-?[\d.eE+-]+))?\s*\)/.exec(t);
	if (!m) return { tx: 0, ty: 0 };
	return {
		tx: Number.parseFloat(m[1]),
		ty: m[2] ? Number.parseFloat(m[2]) : 0,
	};
}

function collectShapes(el: Element, tx: number, ty: number, out: Shape[]) {
	const { tx: dx, ty: dy } = parseTranslate(el);
	const ax = tx + dx;
	const ay = ty + dy;
	const tag = el.tagName.toLowerCase();
	if (tag === "circle") {
		const cx = Number.parseFloat(el.getAttribute("cx") ?? "0") + ax;
		const cy = Number.parseFloat(el.getAttribute("cy") ?? "0") + ay;
		const r = Number.parseFloat(el.getAttribute("r") ?? "0");
		out.push({
			kind: "circle",
			x: cx - r,
			y: cy - r,
			width: r * 2,
			height: r * 2,
		});
	} else if (tag === "rect") {
		out.push({
			kind: "rect",
			x: Number.parseFloat(el.getAttribute("x") ?? "0") + ax,
			y: Number.parseFloat(el.getAttribute("y") ?? "0") + ay,
			width: Number.parseFloat(el.getAttribute("width") ?? "0"),
			height: Number.parseFloat(el.getAttribute("height") ?? "0"),
		});
	}
	for (const child of Array.from(el.children)) {
		collectShapes(child, ax, ay, out);
	}
}

// Render a Bluefish diagram headlessly and return its shapes in absolute
// coordinates (ancestor translate() transforms accumulated onto the leaves).
export async function renderBluefish(
	diagram: (bf: BluefishModule) => unknown,
): Promise<Shape[]> {
	const bf = await bluefish();
	const app = document.createElement("div");
	document.body.appendChild(app);
	// Layout is synchronous; the SVG is complete when render() returns.
	const dispose = bf.render(() => diagram(bf) as never, app);
	try {
		const svg = app.querySelector("svg");
		if (!svg) throw new Error("bluefish did not render an <svg>");
		const shapes: Shape[] = [];
		collectShapes(svg, 0, 0, shapes);
		return shapes;
	} finally {
		dispose();
		app.remove();
	}
}

// ---------------------------------------------------------------------------
// modular-svg side
// ---------------------------------------------------------------------------

// Solve a JSON scene and return its drawable shapes straight from the layout
// (bypassing SVG margin translation and stroke inflation, which are
// presentation concerns, not layout).
export function renderModular(json: Record<string, unknown>): Shape[] {
	const scene = buildSceneFromJson(json);
	const layout = solveLayout(scene);
	const shapes: Shape[] = [];
	for (const n of scene.nodes) {
		if (n.type !== "rect" && n.type !== "circle") continue;
		const box = layout[n.id];
		shapes.push({
			kind: n.type,
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
		});
	}
	return shapes;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

// Both systems anchor content differently (Bluefish keeps owned positions,
// modular-svg's solver has its own anchors), so compare geometry relative to
// the top-left corner of the union of all shapes.
export function normalize(shapes: Shape[]): Shape[] {
	const minX = Math.min(...shapes.map((s) => s.x));
	const minY = Math.min(...shapes.map((s) => s.y));
	return shapes
		.map((s) => ({ ...s, x: s.x - minX, y: s.y - minY }))
		.sort(
			(a, b) =>
				a.kind.localeCompare(b.kind) ||
				a.x - b.x ||
				a.y - b.y ||
				a.width - b.width,
		);
}

export function expectShapesToMatch(
	actual: Shape[],
	reference: Shape[],
	tolerance = 0.01,
): void {
	const a = normalize(actual);
	const b = normalize(reference);
	if (a.length !== b.length) {
		throw new Error(
			`shape count mismatch: modular-svg=${a.length} bluefish=${b.length}\n` +
				`modular-svg: ${JSON.stringify(a)}\nbluefish: ${JSON.stringify(b)}`,
		);
	}
	for (let i = 0; i < a.length; i++) {
		for (const key of ["kind", "x", "y", "width", "height"] as const) {
			const av = a[i][key];
			const bv = b[i][key];
			const ok =
				typeof av === "string"
					? av === bv
					: Math.abs((av as number) - (bv as number)) <= tolerance;
			if (!ok) {
				throw new Error(
					`shape ${i} differs on ${key}: modular-svg=${av} bluefish=${bv}\n` +
						`modular-svg: ${JSON.stringify(a[i])}\nbluefish: ${JSON.stringify(b[i])}`,
				);
			}
		}
	}
}
