import type { NodeRecord } from "./operators";
import type { LayoutResult } from "./solver";

export function layoutToSvg(
	layout: LayoutResult,
	nodes?: NodeRecord[],
): string {
	const byId = new Map<string, NodeRecord>();
	if (nodes) {
		for (const n of nodes) byId.set(n.id, n);
	}
	let body = "";
	for (const [id, box] of Object.entries(layout) as [
		string,
		LayoutResult[string],
	][]) {
		const node = byId.get(id);
		if (node?.type === "circle") {
			const r = (node.r ?? box.width / 2) as number;
			const cx = box.x + r;
			const cy = box.y + r;
			body += `<circle id="${id}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="black"/>\n`;
		} else {
			body += `<rect id="${id}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="black"/>\n`;
		}
	}
	const w = Math.max(...Object.values(layout).map((b) => b.x + b.width));
	const h = Math.max(...Object.values(layout).map((b) => b.y + b.height));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">\n${body}</svg>`;
}
