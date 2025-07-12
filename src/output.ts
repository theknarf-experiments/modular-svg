import type { NodeRecord } from "./operators";
import type { LayoutResult } from "./solver";

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
	dx: number,
	dy: number,
): string {
	const sw = n?.strokeWidth ?? 0;
	return `${xml("rect", {
		id,
		x: box.x + dx - sw / 2,
		y: box.y + dy - sw / 2,
		width: box.width + sw,
		height: box.height + sw,
		...attrs(n),
	})}\n`;
}

function circle(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	dx: number,
	dy: number,
): string {
	const r = (n.r ?? box.width / 2) as number;
	const cx = box.x + dx + r;
	const cy = box.y + dy + r;
	return `${xml("circle", {
		id,
		cx,
		cy,
		r,
		...attrs(n),
	})}\n`;
}

function textNode(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
	dx: number,
	dy: number,
): string {
	const t = n.text ?? "";
	return `${xml(
		"text",
		{
			id,
			x: box.x + dx,
			y: box.y + dy,
			"dominant-baseline": "hanging",
			...attrs(n),
		},
		t,
	)}\n`;
}

function arrow(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
	dx: number,
	dy: number,
): string | undefined {
	const a = n.from ? layout[n.from] : undefined;
	const b = n.to ? layout[n.to] : undefined;
	if (!a || !b) return;
	const margin = 5;
	const x1 = a.x + dx + a.width / 2;
	const y1 = a.y + dy + a.height + margin;
	const x2 = b.x + dx + b.width / 2;
	const y2 = b.y + dy - margin;
	const dxv = x2 - x1;
	const dyv = y2 - y1;
	const len = Math.hypot(dxv, dyv);
	const head = 6;
	const ratio = len > 0 ? (len - head) / len : 0;
	const sx2 = x1 + dxv * ratio;
	const sy2 = y1 + dyv * ratio;
	const ux = len === 0 ? 0 : dxv / len;
	const uy = len === 0 ? 0 : dyv / len;
	const perpX = -uy;
	const perpY = ux;
	const w = head * 0.6;
	const bx = sx2;
	const by = sy2;
	const leftX = bx + perpX * w * 0.5;
	const leftY = by + perpY * w * 0.5;
	const rightX = bx - perpX * w * 0.5;
	const rightY = by - perpY * w * 0.5;
	const line = xml("line", {
		id,
		x1,
		y1,
		x2: sx2,
		y2: sy2,
		...attrs(n),
	});
	const poly = xml("polygon", {
		points: `${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}`,
		...attrs(n),
	});
	return `${line}\n${poly}\n`;
}

export function layoutToSvg(
	layout: LayoutResult,
	nodes?: NodeRecord[],
): string {
	const byId = new Map<string, NodeRecord>();
	if (nodes) for (const n of nodes) byId.set(n.id, n);
	const boxes = Object.values(layout);
	let minX = Math.min(...boxes.map((b) => b.x));
	let minY = Math.min(...boxes.map((b) => b.y));
	let maxX = Math.max(...boxes.map((b) => b.x + b.width));
	let maxY = Math.max(...boxes.map((b) => b.y + b.height));
	for (const [id, box] of Object.entries(layout)) {
		const n = nodes?.find((m) => m.id === id);
		const sw = n?.strokeWidth ?? (n?.type === "arrow" ? 3 : 0);
		if (sw) {
			minX = Math.min(minX, box.x - sw / 2);
			minY = Math.min(minY, box.y - sw / 2);
			maxX = Math.max(maxX, box.x + box.width + sw / 2);
			maxY = Math.max(maxY, box.y + box.height + sw / 2);
		}
	}
	// account for arrow endpoints which may lie outside node boxes
	for (const n of nodes ?? []) {
		if (n.type === "arrow" && n.from && n.to) {
			const a = layout[n.from];
			const b = layout[n.to];
			if (a && b) {
				const margin = 5;
				const x1 = a.x + a.width / 2;
				const y1 = a.y + a.height + margin;
				const x2 = b.x + b.width / 2;
				const y2 = b.y - margin;
				const dxv = x2 - x1;
				const dyv = y2 - y1;
				const len = Math.hypot(dxv, dyv);
				const head = 6;
				const ratio = len > 0 ? (len - head) / len : 0;
				const sx2 = x1 + dxv * ratio;
				const sy2 = y1 + dyv * ratio;
				const ux = len === 0 ? 0 : dxv / len;
				const uy = len === 0 ? 0 : dyv / len;
				const perpX = -uy;
				const perpY = ux;
				const w = head * 0.6;
				const leftX = sx2 + perpX * w * 0.5;
				const leftY = sy2 + perpY * w * 0.5;
				const rightX = sx2 - perpX * w * 0.5;
				const rightY = sy2 - perpY * w * 0.5;
				minX = Math.min(minX, x1, x2, leftX, rightX);
				minY = Math.min(minY, y1, y2, leftY, rightY);
				maxX = Math.max(maxX, x1, x2, leftX, rightX);
				maxY = Math.max(maxY, y1, y2, leftY, rightY);
			}
		}
	}
	const dx = minX < 0 ? -minX : 0;
	const dy = minY < 0 ? -minY : 0;
	const body = Object.entries(layout)
		.map(([id, box]) => {
			const n = byId.get(id);
			if (!n?.type) return "";
			if (n.type === "circle") return circle(id, box, n, dx, dy);
			if (n.type === "text") return textNode(id, box, n, dx, dy);
			if (n.type === "arrow") return arrow(id, n, layout, dx, dy) ?? "";
			return rect(id, box, n, dx, dy);
		})
		.join("");
	const w = maxX - minX;
	const h = maxY - minY;
	return xml(
		"svg",
		{ xmlns: "http://www.w3.org/2000/svg", width: w, height: h },
		`\n${body}`,
	);
}
