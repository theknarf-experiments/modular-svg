import type { SvgElement } from "@modular-svg/core";
import * as React from "react";

type Point = { x: number; y: number };

/** A solved element; its id may be left out, as for marks drawn in a group. */
export type AnySvgElement = SvgElement extends infer E
	? E extends { id: string }
		? Omit<E, "id"> & { id?: string }
		: E
	: never;

/** What svgElement returns; Dragology's `Svgx` is this same type. */
export type SvgReactElement = React.ReactElement<React.SVGProps<SVGElement>>;

export type SvgElementOptions = {
	/**
	 * Where positions go: x/y attributes, or a translate (what tools that move
	 * elements by their transform, like Dragology, track). Default attributes
	 */
	position?: "attributes" | "transform";
	/** subtracted from every position, to draw relative to a parent group */
	origin?: Point;
	/** false leaves ids off; default true */
	ids?: boolean;
	/** extra props per element, event handlers say */
	props?: (el: AnySvgElement) => Record<string, unknown> | undefined;
	/** extra children per element, tweens say */
	children?: (el: AnySvgElement) => React.ReactNode;
	/** how a group draws a child; default: svgElement with these options */
	child?: (el: SvgElement, index: number) => React.ReactNode;
};

/** SVG attribute names as React spells them. */
export function reactifyAttrs(
	attrs: Record<string, string | number> | undefined,
): Record<string, string | number> | undefined {
	if (!attrs) return undefined;
	const out: Record<string, string | number> = {};
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "class") {
			out.className = v;
		} else if (
			k.startsWith("data-") ||
			k.startsWith("aria-") ||
			!k.includes("-")
		) {
			out[k] = v;
		} else {
			out[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
		}
	}
	return out;
}

const ORIGIN: Point = { x: 0, y: 0 };

/**
 * One solved element as a React SVG element: pure, no hooks, so it also works
 * where a component would be opaque (inside another library's render tree).
 */
export function svgElement(
	element: AnySvgElement,
	options: SvgElementOptions = {},
): SvgReactElement {
	const origin = options.origin ?? ORIGIN;
	const byTransform = options.position === "transform";
	const at = (x: number, y: number) =>
		byTransform
			? { transform: `translate(${x - origin.x}, ${y - origin.y})` }
			: { x: x - origin.x, y: y - origin.y };
	const shifted = (transform: string | undefined) =>
		origin.x === 0 && origin.y === 0
			? transform
			: `translate(${-origin.x}, ${-origin.y})${transform ? ` ${transform}` : ""}`;
	const common = {
		...(options.ids === false ? {} : { id: element.id }),
		...reactifyAttrs(element.attrs),
		...options.props?.(element),
	};
	const extra = options.children?.(element);
	const paint = (el: {
		fill?: string;
		stroke?: string;
		strokeWidth?: number;
	}) => ({ fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth });

	switch (element.type) {
		case "circle":
			return (
				<circle
					{...(byTransform
						? at(element.cx, element.cy)
						: { cx: element.cx - origin.x, cy: element.cy - origin.y })}
					r={element.r}
					{...paint(element)}
					{...common}
				>
					{extra}
				</circle>
			);
		case "rect":
			return (
				<rect
					{...at(element.x, element.y)}
					width={element.width}
					height={element.height}
					{...paint(element)}
					{...common}
				>
					{extra}
				</rect>
			);
		case "text":
			return (
				<text
					{...at(element.x, element.y)}
					dominantBaseline="hanging"
					fontFamily="sans-serif"
					{...paint(element)}
					{...common}
				>
					{element.text}
					{extra}
				</text>
			);
		case "line":
			return (
				<line
					x1={element.x1 - origin.x}
					y1={element.y1 - origin.y}
					x2={element.x2 - origin.x}
					y2={element.y2 - origin.y}
					stroke={element.stroke}
					strokeWidth={element.strokeWidth}
					{...common}
				>
					{extra}
				</line>
			);
		case "polygon":
			return (
				<polygon
					points={element.points}
					transform={shifted(element.transform)}
					{...paint(element)}
					{...common}
				>
					{extra}
				</polygon>
			);
		case "path":
			return (
				<path
					d={element.d}
					transform={shifted(element.transform)}
					{...paint(element)}
					{...common}
				>
					{element.animate?.map((a) => (
						<animate key={a.attributeName} {...reactifyAttrs(a)} />
					))}
					{extra}
				</path>
			);
		case "image":
			return (
				<image
					{...at(element.x, element.y)}
					width={element.width}
					height={element.height}
					href={element.href}
					{...common}
				>
					{extra}
				</image>
			);
		case "g": {
			// Spread as arguments, not an array, so no keys are needed
			return React.createElement<React.SVGProps<SVGElement>>(
				"g",
				{
					...(options.ids === false ? {} : { id: element.id }),
					...reactifyAttrs(element.attrs),
				},
				...element.children.map((c, i) =>
					options.child ? options.child(c, i) : svgElement(c, options),
				),
			);
		}
	}
}
