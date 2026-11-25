import {
	type AnimationOptions,
	checkSolution,
	cueSchedule,
	layoutToAst,
	type MaskElement,
	type SvgDocument,
	type SvgElement,
	solveLayout,
	type ViewOptions,
} from "@modular-svg/core";
import { FiberProvider, useContextBridge } from "its-fine";
import * as React from "react";
import { animationTime, type Solution, sceneAnimations } from "./cues";
import {
	createRoot,
	getEventHandlers,
	type ReconcilerRoot,
} from "./reconciler";
import { svgElement } from "./svgElement";
import {
	cssEasing,
	diffTransitions,
	exiting,
	type Transition,
	type TransitionOptions,
	tweenAttributes,
	viewFrames,
	viewSignature,
} from "./transitions";

export type GraphicProps = React.HTMLAttributes<HTMLDivElement> & {
	children?: React.ReactNode;
	margin?: number;
	title?: string;
	/** playback of motions in the scene (duration, loop, reduced-motion still); false renders them still */
	animation?: AnimationOptions | false;
	/**
	 * The size the graphic is shown at: the canvas is fitted into it, and a
	 * `camera` moves within it. One side alone keeps the canvas's aspect
	 */
	view?: ViewOptions;
	/**
	 * Hold the animation at this many seconds (scrubbing); undefined plays.
	 * Applies to the live DOM only; the scene's SVG output is unchanged.
	 * While it holds, `transition` changes apply at once.
	 */
	playhead?: number;
	/**
	 * Called with what the solver decided (spans, boxes, warnings) and a live
	 * animation clock, every time the scene is solved; see useCues.
	 */
	onSolve?: (solution: Solution) => void;
	/**
	 * Tween marks from their previous solved geometry and color whenever the
	 * scene is solved again (true for the defaults); the view tweens too when
	 * what a `camera` frames changes.
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

// Under reduced motion the stylesheet pauses an animation on its still frame;
// play() would override that for good
function heldByStyle(a: Animation): boolean {
	const target = (a.effect as KeyframeEffect | null)?.target;
	if (!target || typeof getComputedStyle !== "function") return false;
	return getComputedStyle(target)
		.animationPlayState.split(",")
		.some((state) => state.trim() === "paused");
}

/**
 * Hold every CSS and SMIL animation in the graphic at the playhead. With no
 * playhead, `wasHeld` says a hold is being let go: only then is there
 * anything to undo, so a graphic that was never held plays (or rests) as its
 * stylesheet says.
 */
function seek(
	svg: SVGSVGElement,
	playhead: number | undefined,
	wasHeld: boolean,
): void {
	if (playhead === undefined && !wasHeld) return;
	for (const a of sceneAnimations(svg)) {
		if (playhead !== undefined) {
			a.pause();
			a.currentTime = playhead * 1000;
		} else if (heldByStyle(a)) {
			// Its negative delay is the still frame
			a.currentTime = 0;
		} else if (a.playState === "paused") a.play();
	}
	if (typeof svg.pauseAnimations !== "function") return;
	if (playhead === undefined) svg.unpauseAnimations();
	else {
		svg.pauseAnimations();
		svg.setCurrentTime(playhead);
	}
}

// Two clocks further apart than this are worth a jump (seconds)
const IN_STEP = 0.002;

/**
 * SMIL starts counting when the svg is inserted, the scene's CSS with the
 * first frame after its stylesheet arrives, so SMIL lanes run ahead. Once
 * the CSS animations have started, the SMIL clock is set to theirs. Only
 * call this with no transition tweens mounted: they run on the SMIL clock,
 * so setting it back would skip one in flight and replay a finished one.
 * Returns a cancel.
 */
function align(svg: SVGSVGElement): () => void {
	const running = sceneAnimations(svg).filter((a) => a.playState === "running");
	if (running.length === 0 || typeof svg.setCurrentTime !== "function")
		return () => {};
	let live = true;
	Promise.all(running.map((a) => a.ready)).then(
		() => {
			const css = running[0].currentTime;
			if (!live || typeof css !== "number") return;
			if (Math.abs(svg.getCurrentTime() - css / 1000) > IN_STEP)
				svg.setCurrentTime(css / 1000);
		},
		// A cancelled animation has no clock to follow
		() => {},
	);
	return () => {
		live = false;
	};
}

// React DOM wants camelCase SVG attribute names (fontSize, strokeDasharray);
// scene attrs use the SVG spellings. data-* and aria-* stay as-is.
// The group every mark is in when the scene is seen through a viewport
const viewGroup = (svg: SVGSVGElement | null): SVGGElement | null =>
	svg?.querySelector<SVGGElement>("[data-camera]") ?? null;

/** `elements` put inside the view (through the shells round it), so they are seen as the marks are. */
function intoView(
	children: readonly SvgElement[],
	elements: readonly SvgElement[],
): SvgElement[] | undefined {
	for (const [i, child] of children.entries()) {
		if (child.type !== "g") continue;
		const inside =
			child.attrs?.["data-camera"] !== undefined
				? [...child.children, ...elements]
				: intoView(child.children, elements);
		if (inside)
			return [
				...children.slice(0, i),
				{ ...child, children: inside },
				...children.slice(i + 1),
			];
	}
	return undefined;
}

// Transitions for the current render, by element id
const TweenContext = React.createContext<{
	byId: Map<string, Transition[]>;
	options: TransitionOptions;
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
				...tweenAttributes(t, tweens.options),
			},
		),
	);
}

// One element with its event handlers and the tweens from its last solve
function SvgElementRenderer({ element }: { element: SvgElement }) {
	const tweens = useTweens(element.id);
	return svgElement(element, {
		props: (el) => (el.id ? getEventHandlers(el.id) : undefined),
		children: () => tweens,
		child: (child, index) => (
			<SvgElementRenderer
				key={child.id ?? `element-${index}`}
				element={child}
			/>
		),
	});
}

// The matte of a clip or mask: its shape's elements, which tween and play
// like any other
type Region = Pick<MaskElement, "x" | "y" | "width" | "height">;

function MaskRenderer({ mask, from }: { mask: MaskElement; from?: Region }) {
	// While its shape tweens, a matte also spans where the shape comes from
	const { x, y, width, height } = from ? regionAround(mask, from) : mask;
	return React.createElement(
		"mask",
		{
			id: mask.id,
			maskUnits: "userSpaceOnUse",
			x,
			y,
			width,
			height,
			...(mask.by === "alpha" ? { style: { maskType: "alpha" } } : {}),
		},
		mask.children.map((child, index) => (
			<SvgElementRenderer
				key={child.id ?? `element-${index}`}
				element={child}
			/>
		)),
	);
}

const regionAround = (a: Region, b: Region): Region => {
	const [x, y] = [Math.min(a.x, b.x), Math.min(a.y, b.y)];
	return {
		x,
		y,
		width: Math.max(a.x + a.width, b.x + b.width) - x,
		height: Math.max(a.y + a.height, b.y + b.height) - y,
	};
};

// Graphics mounted so far by this copy of the module
let mounted = 0;

// Internal Graphic component that uses context bridge
function GraphicImpl({
	children,
	margin = 0,
	title,
	animation,
	view,
	playhead,
	onSolve,
	transition,
	...props
}: GraphicProps) {
	const [tweens, setTweens] = React.useState<{
		byId: Map<string, Transition[]>;
		options: TransitionOptions;
		generation: number;
		/** marks that are gone from the solution but still fading out */
		leaving: SvgElement[];
	} | null>(null);
	// Where the animation clock was when the schedule changed, to carry on from
	const resumeRef = React.useRef<number | undefined>(undefined);
	const committedRef = React.useRef<SvgDocument | null>(null);
	// The view's transform as the scene changed, and the tween away from it
	const viewFromRef = React.useRef<string | undefined>(undefined);
	const viewTweenRef = React.useRef<Animation | null>(null);
	// By value: a `view` written inline is a new object on every render
	const { width, height, aspect } = view ?? {};
	const sized = view !== undefined;
	// While marks tween, the canvas keeps room for where they come from
	const [room, setRoom] = React.useState<{
		width: number;
		height: number;
		/** the regions the mattes had, by id */
		mattes: Map<string, Region>;
	} | null>(null);
	const transitionRef = React.useRef(transition);
	transitionRef.current = transition;
	const playheadRef = React.useRef(playhead);
	playheadRef.current = playhead;
	const heldRef = React.useRef(false);
	const svgRef = React.useRef<SVGSVGElement>(null);
	const solvedRef = React.useRef<Omit<Solution, "time"> | null>(null);
	// What was last committed; re-renders with an identical result are skipped
	const lastKeyRef = React.useRef<string | null>(null);
	const onSolveRef = React.useRef(onSolve);
	onSolveRef.current = onSolve;
	const rootRef = React.useRef<ReconcilerRoot | null>(null);
	const [ast, setAst] = React.useState<SvgDocument | null>(null);
	// Two mounted copies of one scene (one scrubbed, one playing) must not
	// share a matte, so each names its own. useId alone repeats across React
	// roots on one page, hence the count
	const id = React.useId().replace(/\W/g, "");
	const [idPrefix] = React.useState(() => `ms${id}n${mounted++}-`);

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
				const svgAst = layoutToAst(layout, scene.nodes, margin, {
					animation,
					idPrefix,
					...(sized ? { view: { width, height, aspect } } : {}),
				});
				const solved = {
					...cueSchedule(layout, scene.nodes),
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
				// A new schedule restarts every CSS animation; remember the clock
				// so the timeline carries on instead of jumping back to zero
				const previous = committedRef.current;
				resumeRef.current =
					previous?.css &&
					svgAst.css &&
					previous.css !== svgAst.css &&
					svgRef.current
						? animationTime(svgRef.current)
						: undefined;
				const tween = transitionRef.current;
				// Tweens run on the SMIL clock, which a playhead holds still
				const held = playheadRef.current !== undefined;
				if (tween && committedRef.current && !prefersReducedMotion() && !held) {
					const options = tween === true ? {} : tween;
					const svg = svgRef.current;
					const prev = committedRef.current;
					// A viewport is a fixed stage: nothing to make room in
					setRoom((last) => ({
						...(svgAst.viewBox
							? { width: svgAst.width, height: svgAst.height }
							: {
									width: Math.max(prev.width, svgAst.width),
									height: Math.max(prev.height, svgAst.height),
								}),
						// A change in the middle of a tween keeps the room it had too
						mattes: new Map(
							(prev.defs ?? []).map((mask) => {
								const before = last?.mattes.get(mask.id);
								return [mask.id, before ? regionAround(mask, before) : mask];
							}),
						),
					}));
					// Only a camera that changed is tweened to: one still playing
					// the same move would be held for the tween and then jump
					const group =
						viewSignature(prev) !== viewSignature(svgAst)
							? viewGroup(svg)
							: null;
					viewFromRef.current = group
						? getComputedStyle(group).transform
						: undefined;
					const byId = diffTransitions(
						prev,
						svgAst,
						(id, name) => {
							// Mid-transition, start from what is on screen, not the old target
							const el = svg?.querySelector(`[id="${id}"]`) as
								| (SVGElement &
										Record<string, { animVal?: { value?: number } }>)
								| null;
							const value = el?.[name]?.animVal?.value;
							return typeof value === "number" ? value : undefined;
						},
						{ fade: options.fade },
					);
					const gone =
						options.fade === false
							? { elements: [], fades: new Map<string, Transition[]>() }
							: exiting(prev, svgAst);
					for (const [id, fade] of gone.fades) byId.set(id, fade);
					setTweens((last) => ({
						byId,
						options,
						generation: (last?.generation ?? 0) + 1,
						leaving: gone.elements,
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
	}, [
		children,
		margin,
		animation,
		sized,
		width,
		height,
		aspect,
		idPrefix,
		ContextBridge,
	]);

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
			() => {
				setRoom(null);
				// Faded-out marks are done, and the tweens rest on their targets:
				// without them the SMIL clock is free to be lined up again
				setTweens(null);
			},
			((options || undefined)?.duration ?? 0.3) * 1000,
		);
		return () => clearTimeout(timer);
	}, [room]);

	// Continue a changed schedule where the old one was, then start the new
	// transitions (after the seek, so they begin at the new current time)
	useIsomorphicLayoutEffect(() => {
		committedRef.current = ast;
		const svg = svgRef.current;
		if (!svg) return;
		const resume = resumeRef.current;
		resumeRef.current = undefined;
		if (resume !== undefined && playhead === undefined) {
			for (const a of sceneAnimations(svg)) a.currentTime = resume * 1000;
			svg.setCurrentTime?.(resume);
		}
		// The view moves from where it was to where the new scene has it. Read
		// with the last tween gone, which would otherwise still be showing
		const from = viewFromRef.current;
		viewFromRef.current = undefined;
		const group = viewGroup(svg);
		if (from !== undefined && group && ast && tweens) {
			viewTweenRef.current?.cancel();
			const to = getComputedStyle(group).transform;
			const frames = viewFrames(from, to, ast);
			const duration = (tweens.options.duration ?? 0.3) * 1000;
			if (from !== to && typeof group.animate === "function")
				try {
					viewTweenRef.current = group.animate(frames, {
						duration,
						easing: cssEasing(tweens.options.ease),
					});
				} catch {
					// An easing this browser does not know (linear() for a spring)
					viewTweenRef.current = group.animate(frames, {
						duration,
						easing: "ease-out",
					});
				}
		}
		if (!tweens) return;
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
		const svg = svgRef.current;
		if (!svg || !ast) return;
		seek(svg, playhead, heldRef.current);
		heldRef.current = playhead !== undefined;
		// Lined up once no tween runs on the clock that would move
		if (playhead === undefined) return tweens ? undefined : align(svg);
		// A tween caught mid-flight would stay frozen there
		setTweens(null);
		viewTweenRef.current?.cancel();
	}, [playhead, ast, tweens]);

	if (!ast) {
		return <div {...props} />;
	}

	const leaving = tweens?.leaving ?? [];
	// Marks on their way out fade where they were: inside the view
	const framed = leaving.length > 0 && intoView(ast.children, leaving);

	return (
		<div {...props}>
			<svg
				ref={svgRef}
				width={Math.max(ast.width, room?.width ?? 0)}
				height={Math.max(ast.height, room?.height ?? 0)}
				viewBox={ast.viewBox}
				xmlns="http://www.w3.org/2000/svg"
				role="img"
				aria-label={title || "Modular SVG diagram"}
			>
				{title && <title>{title}</title>}
				{ast.css && <style>{ast.css}</style>}
				<TweenContext.Provider value={tweens}>
					{ast.defs && (
						<defs>
							{ast.defs.map((mask) => (
								<MaskRenderer
									key={mask.id}
									mask={mask}
									from={room?.mattes.get(mask.id)}
								/>
							))}
						</defs>
					)}
					{(framed || ast.children).map((element, index) => (
						<SvgElementRenderer
							key={element.id ?? `element-${index}`}
							element={element}
						/>
					))}
					{!framed &&
						leaving.map((element, index) => (
							<SvgElementRenderer
								key={`leaving-${element.id ?? index}`}
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
