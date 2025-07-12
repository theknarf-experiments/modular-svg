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
	let arrow = false;
	for (const [id, box] of Object.entries(layout) as [
		string,
		LayoutResult[string],
	][]) {
		const node = byId.get(id);
		const fill = node?.fill ? ` fill="${node.fill}"` : ' fill="none"';
		const stroke = node?.stroke
			? ` stroke="${node.stroke}"`
			: ' stroke="black"';
		const sw =
			node?.strokeWidth !== undefined
				? ` stroke-width="${node.strokeWidth}"`
				: "";
		if (node?.type === "circle") {
			const r = (node.r ?? box.width / 2) as number;
			const cx = box.x + r;
			const cy = box.y + r;
			body += `<circle id="${id}" cx="${cx}" cy="${cy}" r="${r}"${fill}${stroke}${sw}/>\n`;
		} else if (node?.type === "text") {
			const text = node.text ?? "";
			body += `<text id="${id}" x="${box.x}" y="${box.y}"${fill}${stroke}${sw}>${text}</text>\n`;
		} else if (node?.type === "arrow" && node.from && node.to) {
			const a = layout[node.from];
			const b = layout[node.to];
			if (a && b) {
				const x1 = a.x + a.width / 2;
				const y1 = a.y + a.height / 2;
				const x2 = b.x + b.width / 2;
				const y2 = b.y + b.height / 2;
				arrow = true;
				body += `<line id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${stroke}${sw} marker-end="url(#arrowhead)"/>\n`;
			}
		} else {
			body += `<rect id="${id}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"${fill}${stroke}${sw}/>\n`;
		}
	}
	const w = Math.max(...Object.values(layout).map((b) => b.x + b.width));
	const h = Math.max(...Object.values(layout).map((b) => b.y + b.height));
	const defs = arrow
		? '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="black"/></marker></defs>\n'
		: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">\n${defs}${body}</svg>`;
}
