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
import {
	diffTransitions,
	type Transition,
	type TransitionOptions,
	timingAttributes,
} from "./transitions";

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
	/**
	 * Tween marks from their previous solved geometry and color whenever the
	 * scene is solved again (true for the defaults).
	 */
	transition?: boolean | TransitionOptions;
};

// Bundlers replace process.env.NODE_ENV; without one, assume development
const isProduction = (): boolean =>
	typeof process !== "undefined" && process.env?.NODE_ENV === "production";

// Viewers who ask for reduced motion get state changes without tweens
const prefersReducedMotion = (): boolean =>
	typeof matchMedia === "function" &&
	matchMedia("(prefers-reduced-motion: reduce)").matches;

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

// Transitions for the current render, by element id
const TweenContext = React.createContext<{
	byId: Map<string, Transition[]>;
	timing: Record<string, string>;
	generation: number;
} | null>(null);

// SMIL children tweening an element from its previous geometry; keyed by
// generation so each change mounts fresh animations that start on commit
function useTweens(id: string | undefined): React.ReactNode {
	const tweens = React.useContext(TweenContext);
	const list = id ? tweens?.byId.get(id) : undefined;
	if (!tweens || !list) return null;
	return list.map((t) =>
		React.createElement(
			t.kind === "translate" ? "animateTransform" : "animate",
			{
				key: `${tweens.generation}-${t.attributeName}`,
				"data-transition": "",
				attributeName: t.attributeName,
				...(t.kind === "translate" ? { type: "translate" } : {}),
				values: `${t.from};${t.to}`,
				...tweens.timing,
			},
		),
	);
}

// Component to render a single SVG element with event handlers
function SvgElementRenderer({ element }: { element: SvgElement }) {
	const handlers = element.id ? getEventHandlers(element.id) : undefined;
	const attrs = reactifyAttrs(element.attrs);
	const tweens = useTweens(element.id);

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
				{tweens}
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
				{tweens}
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
				{tweens}
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
				{tweens}
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
				{tweens}
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
				{element.animate?.map((a) => (
					<animate key={a.attributeName} {...reactifyAttrs(a)} />
				))}
				{tweens}
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
			>
				{tweens}
			</image>
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
	transition,
	...props
}: GraphicProps) {
	const [tweens, setTweens] = React.useState<{
		byId: Map<string, Transition[]>;
		timing: Record<string, string>;
		generation: number;
	} | null>(null);
	const committedRef = React.useRef<SvgDocument | null>(null);
	// While marks tween, the canvas keeps room for where they come from
	const [room, setRoom] = React.useState<{
		width: number;
		height: number;
	} | null>(null);
	const transitionRef = React.useRef(transition);
	transitionRef.current = transition;
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
				const tween = transitionRef.current;
				if (tween && committedRef.current && !prefersReducedMotion()) {
					const options = tween === true ? {} : tween;
					const svg = svgRef.current;
					const prev = committedRef.current;
					setRoom({
						width: Math.max(prev.width, svgAst.width),
						height: Math.max(prev.height, svgAst.height),
					});
					setTweens((prev) => ({
						byId: diffTransitions(committedRef.current, svgAst, (id, name) => {
							// Mid-transition, start from what is on screen, not the old target
							const el = svg?.querySelector(`[id="${id}"]`) as
								| (SVGElement &
										Record<string, { animVal?: { value?: number } }>)
								| null;
							const value = el?.[name]?.animVal?.value;
							return typeof value === "number" ? value : undefined;
						}),
						timing: timingAttributes(options),
						generation: (prev?.generation ?? 0) + 1,
					}));
				} else {
					// Frozen tweens from an earlier change would hold their old targets
					setTweens(null);
				}
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

	// Give the room back once the transition is over
	React.useEffect(() => {
		if (!room) return;
		const options = transitionRef.current === true ? {} : transitionRef.current;
		const timer = setTimeout(
			() => setRoom(null),
			((options || undefined)?.duration ?? 0.3) * 1000,
		);
		return () => clearTimeout(timer);
	}, [room]);

	// Start the new transitions once their elements are in the DOM
	useIsomorphicLayoutEffect(() => {
		committedRef.current = ast;
		const svg = svgRef.current;
		if (!svg || !tweens) return;
		for (const a of svg.querySelectorAll("[data-transition]")) {
			(a as SVGAnimationElement).beginElement?.();
		}
	}, [ast, tweens]);

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
				width={Math.max(ast.width, room?.width ?? 0)}
				height={Math.max(ast.height, room?.height ?? 0)}
				xmlns="http://www.w3.org/2000/svg"
				role="img"
				aria-label={title || "Modular SVG diagram"}
			>
				{title && <title>{title}</title>}
				{ast.css && <style>{ast.css}</style>}
				<TweenContext.Provider value={tweens}>
					{ast.children.map((element, index) => (
						<SvgElementRenderer
							key={element.id ?? `element-${index}`}
							element={element}
						/>
					))}
				</TweenContext.Provider>
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
