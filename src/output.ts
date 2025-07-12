import type { LayoutResult } from "./solver";

export function layoutToSvg(layout: LayoutResult): string {
	let body = "";
	for (const [id, box] of Object.entries(layout) as [
		string,
		LayoutResult[string],
	][]) {
		body += `<rect id="${id}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="black"/>\n`;
	}
	const w = Math.max(...Object.values(layout).map((b) => b.x + b.width));
	const h = Math.max(...Object.values(layout).map((b) => b.y + b.height));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">\n${body}</svg>`;
}
