import type { NodeRecord } from "./operators";
import type { LayoutResult } from "./solver";

function attrs(n?: NodeRecord): string {
	const fill = n?.fill ?? "none";
	const stroke = n?.stroke ?? "black";
	const sw = n?.strokeWidth;
	return ` fill="${fill}" stroke="${stroke}"${
		sw !== undefined ? ` stroke-width="${sw}"` : ""
	}`;
}

function rect(id: string, box: LayoutResult[string], n?: NodeRecord): string {
	return `<rect id="${id}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"${attrs(n)}/>\n`;
}

function circle(id: string, box: LayoutResult[string], n: NodeRecord): string {
	const r = (n.r ?? box.width / 2) as number;
	const cx = box.x + r;
	const cy = box.y + r;
	return `<circle id="${id}" cx="${cx}" cy="${cy}" r="${r}"${attrs(n)}/>\n`;
}

function textNode(
	id: string,
	box: LayoutResult[string],
	n: NodeRecord,
): string {
	const t = n.text ?? "";
	return `<text id="${id}" x="${box.x}" y="${box.y}"${attrs(n)}>${t}</text>\n`;
}

function arrow(
	id: string,
	n: NodeRecord,
	layout: LayoutResult,
): string | undefined {
	const a = n.from ? layout[n.from] : undefined;
	const b = n.to ? layout[n.to] : undefined;
	if (!a || !b) return;
	const x1 = a.x + a.width / 2;
	const y1 = a.y + a.height / 2;
	const x2 = b.x + b.width / 2;
	const y2 = b.y + b.height / 2;
	return `<line id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${attrs(n)} marker-end="url(#arrowhead)"/>\n`;
}

export function layoutToSvg(
	layout: LayoutResult,
	nodes?: NodeRecord[],
): string {
	const byId = new Map<string, NodeRecord>();
	if (nodes) for (const n of nodes) byId.set(n.id, n);
	let body = "";
	let arrowUsed = false;
	for (const [id, box] of Object.entries(layout) as [
		string,
		LayoutResult[string],
	][]) {
		const n = byId.get(id);
		if (n?.type === "circle") body += circle(id, box, n);
		else if (n?.type === "text") body += textNode(id, box, n);
		else if (n?.type === "arrow") {
			const line = arrow(id, n, layout);
			if (line) {
				arrowUsed = true;
				body += line;
			}
		} else body += rect(id, box, n);
	}
	const w = Math.max(...Object.values(layout).map((b) => b.x + b.width));
	const h = Math.max(...Object.values(layout).map((b) => b.y + b.height));
	const defs = arrowUsed
		? '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="black"/></marker></defs>\n'
		: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">\n${defs}${body}</svg>`;
}
