// JSX types for the scene elements the reconciler understands. Shipped with
// the package (referenced from index.ts), so importing it is enough.
import type {
	AuthoredValues,
	Ease,
	MotionStep,
	Values,
} from "@modular-svg/core";

// Every motion and time-group node can be pinned (`at`) and sized (`over`)
type Timed = {
	key?: React.Key;
	at?: number;
	over?: number;
	children?: React.ReactNode;
};
type Motion = Timed & {
	ease?: Ease;
	/**
	 * repeat the span: true until the time around it ends, or a count. Every
	 * pass starts over from where the motion began (its `from`, else rest)
	 */
	loop?: boolean | number;
	/** with loop: every other pass runs backwards, with no cut at the turn */
	alternate?: boolean;
};

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			// Layout containers
			stackH: {
				key?: React.Key;
				spacing?: number;
				total?: number;
				alignment?: "top" | "center" | "bottom" | "centerY";
				children?: React.ReactNode;
			};
			stackV: {
				key?: React.Key;
				spacing?: number;
				total?: number;
				alignment?: "left" | "center" | "right" | "centerX";
				children?: React.ReactNode;
			};

			// Layout operators
			align: {
				key?: React.Key;
				axis?: "x" | "y";
				alignment?:
					| "left"
					| "center"
					| "right"
					| "top"
					| "bottom"
					| "centerX"
					| "centerY"
					| "topLeft"
					| "topCenter"
					| "topRight"
					| "centerLeft"
					| "centerRight"
					| "bottomLeft"
					| "bottomCenter"
					| "bottomRight";
				children?: React.ReactNode;
			};
			distribute: {
				key?: React.Key;
				axis?: "x" | "y";
				spacing?: number;
				children?: React.ReactNode;
			};
			/**
			 * a box round its children. Inside a `modulate` it draws nothing of
			 * its own: its first ref is the box it restates, the rest are what
			 * that box wraps (with this `padding`) while the modulate holds
			 */
			background: {
				key?: React.Key;
				padding?: number;
				width?: number;
				height?: number;
				rx?: number;
				opacity?: number;
				fill?: string;
				stroke?: string;
				"stroke-width"?: number;
				onClick?: React.MouseEventHandler<SVGElement>;
				children?: React.ReactNode;
			};
			/** in a `modulate`, a circle or arc it gives one side stays round */
			span: {
				key?: React.Key;
				axis?: "x" | "y";
				children?: React.ReactNode;
			};
			// Color constraints
			distinctColors: {
				key?: React.Key;
				/** OKLCH lightness of the generated colors (0..1, default 0.7) */
				lightness?: number;
				/** OKLCH chroma (about 0..0.3, default 0.14) */
				chroma?: number;
				/** @deprecated HSL-era; scaled to a chroma */
				saturation?: number;
				startHue?: number;
				children?: React.ReactNode;
			};
			sameColor: {
				key?: React.Key;
				children?: React.ReactNode;
			};
			lighten: {
				key?: React.Key;
				amount?: number;
				children?: React.ReactNode;
			};
			darken: {
				key?: React.Key;
				amount?: number;
				children?: React.ReactNode;
			};
			contrast: {
				key?: React.Key;
				ratio?: number;
				children?: React.ReactNode;
			};

			// Special elements
			text: {
				key?: React.Key;
				text?: string;
				x?: number;
				y?: number;
				width?: number;
				height?: number;
				"font-size"?: number;
				"font-family"?: string;
				"font-style"?: string;
				"font-weight"?: number;
				"pointer-events"?: string;
				dy?: string;
				fill?: string;
				stroke?: string;
				"stroke-width"?: number;
				onClick?: React.MouseEventHandler<SVGElement>;
				onMouseEnter?: React.MouseEventHandler<SVGElement>;
				onMouseLeave?: React.MouseEventHandler<SVGElement>;
				children?: string;
			};
			/**
			 * drawn between its two refs, and redrawn between wherever they are
			 * while a `modulate` or a motion's `x`/`y` (a `travel` too) moves one
			 */
			arrow: {
				key?: React.Key;
				fill?: string;
				stroke?: string;
				"stroke-width"?: number;
				"stroke-dasharray"?: string;
				padStart?: number;
				padEnd?: number;
				children?: React.ReactNode;
			};
			ref: {
				key?: React.Key;
				target: string;
				/** in a color relation: which of the node's colors (default: what it is drawn with) */
				paint?: "fill" | "stroke";
			};
			line: {
				key?: React.Key;
				stroke?: string;
				"stroke-width"?: number;
				"stroke-dasharray"?: string;
				source?: number[];
				target?: number[];
				children?: React.ReactNode;
			};
			curve: {
				key?: React.Key;
				stroke?: string;
				"stroke-width"?: number;
				"stroke-dasharray"?: string;
				source?: number[];
				target?: number[];
				direction?: "horizontal" | "vertical";
				children?: React.ReactNode;
			};
			arc: {
				key?: React.Key;
				r?: number;
				innerR?: number;
				startAngle?: number;
				endAngle?: number;
				cx?: number;
				cy?: number;
				fill?: string;
				stroke?: string;
				"stroke-width"?: number;
				onClick?: React.MouseEventHandler<SVGElement>;
				onMouseEnter?: React.MouseEventHandler<SVGElement>;
				onMouseLeave?: React.MouseEventHandler<SVGElement>;
			};
			path: {
				key?: React.Key;
				d?: string;
				fill?: string;
				stroke?: string;
				"stroke-width"?: number;
				"stroke-linecap"?: "butt" | "round" | "square";
				"stroke-linejoin"?: "miter" | "round" | "bevel";
				"stroke-dasharray"?: string;
				zOrder?: number;
			};
			group: {
				key?: React.Key;
				children?: React.ReactNode;
			};

			// Motions: animate the marks they ref over their solved span
			/** colors in from/steps may be { ref: id }: that node's solved color */
			motion: Motion & { from?: AuthoredValues; steps: MotionStep[] };
			enter: Motion & { from?: Values };
			exit: Motion & { to?: Values };
			draw: Motion;
			shake: Motion & { amplitude?: Values; rate?: number };
			wiggle: Motion & {
				amplitude?: Values;
				seed?: string | number;
				rate?: number;
				period?: number;
			};
			sampled: Motion & {
				fn: (t: number) => Values;
				tolerance: Record<string, number>;
				step?: number;
			};
			/** moves its first child through the rest, in order */
			travel: Motion;

			// Time relations: constrain the spans of what they ref
			sequence: Timed & { gap?: number };
			sameTime: Timed & { align?: "start" | "end" | "center" };
			stagger: Timed & { spacing?: number; total?: number; ease?: Ease };
			before: Timed & { gap?: number };
			after: { key?: React.Key; gap?: number; children?: React.ReactNode };
			during: { key?: React.Key; children?: React.ReactNode };
			/** with beats: only lengths, in multiples of the first child's */
			stretch: { key?: React.Key; beats?: number; children?: React.ReactNode };
			/** each member lasts until the next starts (times fraction) */
			legato: {
				key?: React.Key;
				fraction?: number;
				children?: React.ReactNode;
			};
			staccato: {
				key?: React.Key;
				fraction?: number;
				children?: React.ReactNode;
			};
			at: { key?: React.Key; time: number; children?: React.ReactNode };
			beat: {
				key?: React.Key;
				bpm?: number;
				period?: number;
				offset?: number;
				/** tempo change: reach toBpm (or toPeriod) over `ramp` beats */
				toBpm?: number;
				toPeriod?: number;
				ramp?: number;
			};
			/** a span on bar lines: `count` bars of `beats` beats of the beat it refs */
			bar: {
				key?: React.Key;
				beats?: number;
				count?: number;
				children?: React.ReactNode;
			};
			/**
			 * a clock: what it takes plays in the phrase's own time, as a unit that
			 * can be stretched, reversed and repeated. `over` is the whole span
			 * and must be above 0. Relations inside may read what plays around the
			 * phrase (an `onBeat` its beat) while the phrase's speed is its `rate`
			 */
			phrase: Timed & {
				/** speed, when nothing else sets the span */
				rate?: number;
				/** play backwards */
				retrograde?: boolean;
				/** passes; true repeats until the enclosing time ends */
				repeat?: number | boolean;
				/** every other pass runs the other way */
				alternate?: boolean;
			};
			/**
			 * a change of layout: from its start on, the relations inside hold
			 * instead of the home ones that placed the same things, and what moves
			 * gets there over its span. Put what stays first. A stack given both
			 * `spacing` and `total` also resizes what the stack it restates sized.
			 * Holds `stackV`, `stackH`, `align`, `distribute`, `span` and
			 * `background`; a `background` in here restates a box that is already
			 * there: its first ref is the box, the rest are what it wraps
			 */
			modulate: Timed & { ease?: Ease };
			/**
			 * lets the modulations it refs go (all of them when it refs none), in
			 * the time it plays in: a phrase's `modulate` is released in the phrase
			 */
			resolve: Timed & { ease?: Ease };
			/** an empty span: a silence to sequence */
			rest: { key?: React.Key; over?: number; at?: number };
			/** spans its members plus a hold */
			fermata: { key?: React.Key; hold?: number; children?: React.ReactNode };
			/** of[0] beats of the first in the time of of[1] beats of the second */
			polyrhythm: {
				key?: React.Key;
				of?: [number, number];
				children?: React.ReactNode;
			};
			onBeat: {
				key?: React.Key;
				every?: number;
				/** grid steps per beat (2 = eighths, 3 = triplets) */
				division?: number;
				/** shift the grid by steps (0.5 = offbeat) */
				offset?: number;
				/** where every second step falls in its pair (0.5 straight, 2/3 swung) */
				swing?: number;
				/** end lands on the grid: a pickup */
				align?: "start" | "end";
				snap?: "next" | "nearest";
				children?: React.ReactNode;
			};
		}
	}
}
