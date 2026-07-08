import {
	layoutToAst,
	type SvgDocument,
	type SvgElement,
	solveLayout,
} from "@modular-svg/core";
import { FiberProvider, useContextBridge } from "its-fine";
import * as React from "react";
import {
	createRoot,
	getEventHandlers,
	type ReconcilerRoot,
} from "./reconciler";

export interface GraphicProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode;
	margin?: number;
	title?: string;
	/**
	 * Animate layout changes with native SVG animation (SMIL). Each mark carries
	 * <animate> elements on its geometry attributes, so when the scene re-renders
	 * with new state every mark — including connectors like arrows/lines/curves,
	 * whose endpoints reshape — tweens to its new geometry. Off by default.
	 */
	animate?: boolean;
	/** Animation duration in milliseconds (default 300). */
	duration?: number;
	/**
	 * SMIL keySplines easing (a cubic-bezier control string), used with
	 * calcMode="spline". Default "0.25 0.1 0.25 1" (ease).
	 */
	easing?: string;
}

// useLayoutEffect on the client (so we trigger SMIL before paint, no flash) but
// useEffect on the server to avoid the SSR "useLayoutEffect does nothing" warning.
const useIsoLayoutEffect =
	typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

// React DOM wants camelCase SVG attribute names (fontSize, strokeDasharray);
// scene attrs use the SVG spellings. data-* and aria-* stay as-is.
function reactifyAttrs(
	attrs: Record<string, string | number> | undefined,
): Record<string, string | number> | undefined {
	if (!attrs) return undefined;
	const out: Record<string, string | number> = {};
	for (const [k, v] of Object.entries(attrs)) {
		if (k.startsWith("data-") || k.startsWith("aria-") || !k.includes("-")) {
			out[k] = v;
		} else {
			out[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
		}
	}
	return out;
}

// Component to render a single SVG element with event handlers. Any children
// (e.g. <animate> nodes injected in animate mode) render inside the shape.
function SvgElementRenderer({
	element,
	children,
}: {
	element: SvgElement;
	children?: React.ReactNode;
}) {
	const handlers = element.id ? getEventHandlers(element.id) : undefined;
	const attrs = reactifyAttrs(element.attrs);

	if (element.type === "circle") {
		return (
			<circle
				id={element.id}
				cx={element.cx}
				cy={element.cy}
				r={element.r}
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...attrs}
				{...handlers}
			>
				{children}
			</circle>
		);
	}

	if (element.type === "rect") {
		return (
			<rect
				id={element.id}
				x={element.x}
				y={element.y}
				width={element.width}
				height={element.height}
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...attrs}
				{...handlers}
			>
				{children}
			</rect>
		);
	}

	if (element.type === "text") {
		return (
			<text
				id={element.id}
				x={element.x}
				y={element.y}
				dominantBaseline="hanging"
				fontFamily="sans-serif"
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...attrs}
				{...handlers}
			>
				{element.text}
				{children}
			</text>
		);
	}

	if (element.type === "line") {
		return (
			<line
				id={element.id}
				x1={element.x1}
				y1={element.y1}
				x2={element.x2}
				y2={element.y2}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...attrs}
				{...handlers}
			>
				{children}
			</line>
		);
	}

	if (element.type === "polygon") {
		return (
			<polygon
				id={element.id}
				points={element.points}
				transform={element.transform}
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...attrs}
				{...handlers}
			>
				{children}
			</polygon>
		);
	}

	if (element.type === "path") {
		return (
			<path
				id={element.id}
				d={element.d}
				transform={element.transform}
				fill={element.fill}
				stroke={element.stroke}
				strokeWidth={element.strokeWidth}
				{...attrs}
				{...handlers}
			>
				{children}
			</path>
		);
	}

	if (element.type === "image") {
		return (
			<image
				id={element.id}
				x={element.x}
				y={element.y}
				width={element.width}
				height={element.height}
				href={element.href}
				{...attrs}
				{...handlers}
			>
				{children}
			</image>
		);
	}

	return null;
}

// The geometry attributes to animate per mark, as (name, value) string pairs.
// Connectors expose the very attributes CSS/transform can't touch — a line's
// endpoints (x1..y2) and a polygon head's `points` — which is exactly what lets
// SMIL animate the arrow. Paths animate their `d`.
function animatableAttrs(el: SvgElement): { name: string; value: string }[] {
	const num = (name: string, v: number) => ({ name, value: String(v) });
	switch (el.type) {
		case "circle":
			return [num("cx", el.cx), num("cy", el.cy), num("r", el.r)];
		case "rect":
		case "image":
			return [
				num("x", el.x),
				num("y", el.y),
				num("width", el.width),
				num("height", el.height),
			];
		case "text":
			return [num("x", el.x), num("y", el.y)];
		case "line":
			return [
				num("x1", el.x1),
				num("y1", el.y1),
				num("x2", el.x2),
				num("y2", el.y2),
			];
		case "polygon":
			return [{ name: "points", value: el.points }];
		case "path":
			return [{ name: "d", value: el.d }];
		default:
			return [];
	}
}

// A mark plus the <animate> nodes that tween its geometry. Each element manages
// its own "previous values" so a new layout animates from where it currently is.
function AnimatedElement({
	element,
	duration,
	easing,
}: {
	element: SvgElement;
	duration: number;
	easing: string;
}) {
	const shapeRef = React.useRef<SVGGElement | null>(null);
	const attrs = animatableAttrs(element);
	// prevRef starts equal to the first render's values (so from == to: no motion
	// on mount) and is advanced to the committed values after each animation.
	const initial = React.useRef<Map<string, string>>(
		new Map(attrs.map((a) => [a.name, a.value])),
	);
	const prev = initial.current;

	useIsoLayoutEffect(() => {
		const changed = attrs.some((a) => prev.get(a.name) !== a.value);
		if (changed && shapeRef.current) {
			// begin="indefinite" means the animations only run when triggered; a
			// freshly rendered begin="0s" would resolve to a past time and snap.
			for (const node of shapeRef.current.querySelectorAll("animate")) {
				const anim = node as SVGAnimateElement;
				if (typeof anim.beginElement === "function") anim.beginElement();
			}
		}
		for (const a of attrs) prev.set(a.name, a.value);
	});

	return (
		<g ref={shapeRef}>
			<SvgElementRenderer element={element}>
				{attrs.map((a) => (
					<animate
						key={a.name}
						attributeName={a.name}
						begin="indefinite"
						dur={`${duration}ms`}
						fill="freeze"
						calcMode="spline"
						keyTimes="0;1"
						keySplines={easing}
						from={prev.get(a.name) ?? a.value}
						to={a.value}
					/>
				))}
			</SvgElementRenderer>
		</g>
	);
}

// Internal Graphic component that uses context bridge
function GraphicImpl({
	children,
	margin = 0,
	title,
	animate = false,
	duration = 300,
	easing = "0.25 0.1 0.25 1",
	...props
}: GraphicProps) {
	const rootRef = React.useRef<ReconcilerRoot | null>(null);
	const [ast, setAst] = React.useState<SvgDocument | null>(null);

	// Get context bridge - this must be called within FiberProvider
	const ContextBridge = useContextBridge();

	React.useEffect(() => {
		if (!rootRef.current) {
			rootRef.current = createRoot();
		}

		async function render() {
			if (!rootRef.current) return;

			// Wrap children with context bridge to forward contexts from react-dom
			const wrappedChildren = <ContextBridge>{children}</ContextBridge>;

			await rootRef.current.render(wrappedChildren);
			const scene = rootRef.current.getScene();

			// Only render if we have nodes
			if (scene.nodes.length > 0) {
				const layout = solveLayout(scene);
				const svgAst = layoutToAst(layout, scene.nodes, margin);
				setAst(svgAst);
			} else {
				setAst(null);
			}
		}

		render();
	}, [children, margin, ContextBridge]);

	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			if (rootRef.current) {
				rootRef.current.unmount();
			}
		};
	}, []);

	if (!ast) {
		return <div {...props} />;
	}

	return (
		<div {...props}>
			<svg
				width={ast.width}
				height={ast.height}
				xmlns="http://www.w3.org/2000/svg"
				role="img"
				aria-label={title || "Modular SVG diagram"}
			>
				{title && <title>{title}</title>}
				{ast.children.map((element, index) => {
					const key = element.id ?? `element-${index}`;
					// In animate mode each mark carries <animate> nodes; a stable key
					// keeps the same DOM element across state changes so SMIL can tween.
					return animate ? (
						<AnimatedElement
							key={key}
							element={element}
							duration={duration}
							easing={easing}
						/>
					) : (
						<SvgElementRenderer key={key} element={element} />
					);
				})}
			</svg>
		</div>
	);
}

// Public Graphic component that wraps GraphicImpl with FiberProvider
// This enables context forwarding from react-dom to our custom reconciler
export function Graphic(props: GraphicProps) {
	return (
		<FiberProvider>
			<GraphicImpl {...props} />
		</FiberProvider>
	);
}
