import type { LayoutResult, NodeRecord } from "./solver/index.ts";
import { layoutToAst, type SvgDocument, type SvgElement } from "./svg_ast.ts";

// Re-export for convenience
export { layoutBounds } from "./svg_ast.ts";

// Escape XML text content
export function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

// Escape XML attribute values (double-quoted)
function escapeAttr(value: string): string {
	return escapeXml(value).replaceAll('"', "&quot;");
}

// XML serialization helper; children strings must already be escaped or be
// serialized elements
export function xml(
	tag: string,
	args: Record<string, string | number | undefined>,
	children?: string | string[],
): string {
	const attr = Object.entries(args)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => ` ${k}="${typeof v === "string" ? escapeAttr(v) : v}"`)
		.join("");
	if (children === undefined) return `<${tag}${attr} />`;
	const body = Array.isArray(children) ? children.join("") : children;
	return `<${tag}${attr}>${body}</${tag}>`;
}

// Serialize a single SVG element to string
function serializeElement(element: SvgElement): string {
	if (element.type === "rect") {
		return xml("rect", {
			id: element.id,
			x: element.x,
			y: element.y,
			width: element.width,
			height: element.height,
			fill: element.fill,
			stroke: element.stroke,
			"stroke-width": element.strokeWidth,
		});
	}

	if (element.type === "circle") {
		return xml("circle", {
			id: element.id,
			cx: element.cx,
			cy: element.cy,
			r: element.r,
			fill: element.fill,
			stroke: element.stroke,
			"stroke-width": element.strokeWidth,
		});
	}

	if (element.type === "text") {
		return xml(
			"text",
			{
				id: element.id,
				x: element.x,
				y: element.y,
				"dominant-baseline": "hanging",
				"font-family": "sans-serif",
				fill: element.fill,
				stroke: element.stroke,
				"stroke-width": element.strokeWidth,
			},
			escapeXml(element.text),
		);
	}

	if (element.type === "line") {
		return xml("line", {
			id: element.id,
			x1: element.x1,
			y1: element.y1,
			x2: element.x2,
			y2: element.y2,
			fill: element.fill,
			stroke: element.stroke,
			"stroke-width": element.strokeWidth,
		});
	}

	if (element.type === "polygon") {
		return xml("polygon", {
			id: element.id,
			points: element.points,
			fill: element.fill,
			stroke: element.stroke,
			"stroke-width": element.strokeWidth,
		});
	}

	return "";
}

// Serialize SVG AST to string
export function serializeToSvg(ast: SvgDocument): string {
	const body = ast.children.map(serializeElement);
	return xml(
		"svg",
		{
			xmlns: "http://www.w3.org/2000/svg",
			width: ast.width,
			height: ast.height,
		},
		body,
	);
}

// Convenience function: layout -> string (uses AST internally)
export function layoutToSvg(
	layout: LayoutResult,
	nodes?: NodeRecord[],
	margin = 0,
): string {
	const ast = layoutToAst(layout, nodes, margin);
	return serializeToSvg(ast);
}
