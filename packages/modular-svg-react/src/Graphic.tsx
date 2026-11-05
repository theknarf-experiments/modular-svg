import {
	type AnimationOptions,
	checkSolution,
	layoutToAst,
	type SvgDocument,
	type SvgElement,
	solveLayout,
} from "@modular-svg/core";
import { FiberProvider, useContextBridge } from "its-fine";
import * as React from "react";
import { animationTime, type Solution } from "./cues";
import {
	createRoot,
	getEventHandlers,
	type ReconcilerRoot,
} from "./reconciler";

export type GraphicProps = React.HTMLAttributes<HTMLDivElement> & {
	children?: React.ReactNode;
	margin?: number;
	title?: string;
	/** playback of motions in the scene (duration, loop, reduced-motion still); false renders them still */
	animation?: AnimationOptions | false;
	/**
	 * Hold the animation at this many seconds (scrubbing); undefined plays.
	 * Applies to the live DOM only; the scene's SVG output is unchanged.
	 */
	playhead?: number;
	/**
	 * Called with what the solver decided (spans, boxes, warnings) and a live
	 * animation clock, every time the scene is solved; see useCues.
	 */
	onSolve?: (solution: Solution) => void;
};

// Bundlers replace process.env.NODE_ENV; without one, assume development
const isProduction = (): boolean =>
	typeof process !== "undefined" && process.env?.NODE_ENV === "production";

// Layout effect in the browser; plain effect under SSR, which warns otherwise
const useIsomorphicLayoutEffect =
	typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

// Seek every CSS and SMIL animation in the graphic, or let them run again
function seek(svg: SVGSVGElement, playhead: number | undefined): void {
	const animations =
		typeof svg.getAnimations === "function"
			? svg.getAnimations({ subtree: true })
			: [];
	for (const a of animations) {
		if (playhead === undefined) {
			if (a.playState === "paused") a.play();
		} else {
			a.pause();
			a.currentTime = playhead * 1000;
		}
	}
	if (typeof svg.pauseAnimations !== "function") return;
	if (playhead === undefined) svg.unpauseAnimations();
	else {
		svg.pauseAnimations();
		svg.setCurrentTime(playhead);
	}
}

// React DOM wants camelCase SVG attribute names (fontSize, strokeDasharray);
// scene attrs use the SVG spellings. data-* and aria-* stay as-is.
function reactifyAttrs(
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

// Component to render a single SVG element with event handlers
function SvgElementRenderer({ element }: { element: SvgElement }) {
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
			/>
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
			/>
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
			/>
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
			/>
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
				{element.animate?.map((a) => (
					<animate key={a.attributeName} {...reactifyAttrs(a)} />
				))}
			</path>
		);
	}

	if (element.type === "g") {
		return (
			<g id={element.id} {...attrs}>
				{element.children.map((child, index) => (
					<SvgElementRenderer
						key={child.id ?? `element-${index}`}
						element={child}
					/>
				))}
			</g>
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
			/>
		);
	}

	return null;
}

// Internal Graphic component that uses context bridge
function GraphicImpl({
	children,
	margin = 0,
	title,
	animation,
	playhead,
	onSolve,
	...props
}: GraphicProps) {
	const svgRef = React.useRef<SVGSVGElement>(null);
	const solvedRef = React.useRef<Omit<Solution, "time"> | null>(null);
	// What was last committed; re-renders with an identical result are skipped
	const lastKeyRef = React.useRef<string | null>(null);
	const onSolveRef = React.useRef(onSolve);
	onSolveRef.current = onSolve;
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
				const svgAst = layoutToAst(layout, scene.nodes, margin, { animation });
				const spans: Solution["spans"] = {};
				for (const id of scene.timedIds) {
					const box = layout[id];
					spans[id] = { start: box.start ?? 0, duration: box.duration ?? 0 };
				}
				const solved = {
					spans,
					boxes: layout,
					duration: svgAst.duration ?? 0,
					loop: animation !== false && !!animation?.loop,
					warnings: [...scene.warnings, ...checkSolution(scene, layout)],
				};
				// An onSolve that sets parent state re-renders us with new children;
				// stopping on an unchanged result keeps that from looping forever
				const key = JSON.stringify([svgAst, solved]);
				if (key === lastKeyRef.current) return;
				lastKeyRef.current = key;
				if (solved.warnings.length > 0 && !isProduction())
					console.warn(`modular-svg: ${solved.warnings.join("\n")}`);
				solvedRef.current = solved;
				setAst(svgAst);
			} else {
				lastKeyRef.current = null;
				setAst(null);
			}
		}

		render();
	}, [children, margin, animation, ContextBridge]);

	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			if (rootRef.current) {
				rootRef.current.unmount();
			}
		};
	}, []);

	// After commit, so the solution's clock can read the rendered animations
	React.useEffect(() => {
		const solved = solvedRef.current;
		if (!ast || !solved) return;
		onSolveRef.current?.({
			...solved,
			time: () => (svgRef.current ? animationTime(svgRef.current) : undefined),
		});
	}, [ast]);

	// Before paint, so a scrubbed frame never flashes the live one
	useIsomorphicLayoutEffect(() => {
		if (svgRef.current && ast) seek(svgRef.current, playhead);
	}, [playhead, ast]);

	if (!ast) {
		return <div {...props} />;
	}

	return (
		<div {...props}>
			<svg
				ref={svgRef}
				width={ast.width}
				height={ast.height}
				xmlns="http://www.w3.org/2000/svg"
				role="img"
				aria-label={title || "Modular SVG diagram"}
			>
				{title && <title>{title}</title>}
				{ast.css && <style>{ast.css}</style>}
				{ast.children.map((element, index) => (
					<SvgElementRenderer
						key={element.id ?? `element-${index}`}
						element={element}
					/>
				))}
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
