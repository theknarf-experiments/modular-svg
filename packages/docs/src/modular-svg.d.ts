// Type declarations for modular-svg elements
import type { Ease, MotionStep, Values } from "@modular-svg/react";

// Every motion and time-group node can be pinned (`at`) and sized (`over`)
type Timed = {
	key?: React.Key;
	at?: number;
	over?: number;
	children?: React.ReactNode;
};
type Motion = Timed & { ease?: Ease; loop?: boolean | number };

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
				children?: React.ReactNode;
			};
			span: {
				key?: React.Key;
				axis?: "x" | "y";
				children?: React.ReactNode;
			};
			// Color constraints
			distinctColors: {
				key?: React.Key;
				saturation?: number;
				lightness?: number;
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
				dy?: string;
				fill?: string;
				stroke?: string;
				"stroke-width"?: number;
				onClick?: React.MouseEventHandler<SVGElement>;
				onMouseEnter?: React.MouseEventHandler<SVGElement>;
				onMouseLeave?: React.MouseEventHandler<SVGElement>;
				children?: string;
			};
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
			motion: Motion & { from?: Values; steps: MotionStep[] };
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
			stagger: Timed & { spacing?: number; total?: number };
			before: Timed & { gap?: number };
			after: { key?: React.Key; gap?: number; children?: React.ReactNode };
			during: { key?: React.Key; children?: React.ReactNode };
			stretch: { key?: React.Key; children?: React.ReactNode };
			at: { key?: React.Key; time: number; children?: React.ReactNode };
			beat: { key?: React.Key; bpm?: number; period?: number; offset?: number };
			onBeat: {
				key?: React.Key;
				every?: number;
				snap?: "next" | "nearest";
				children?: React.ReactNode;
			};
		}
	}
}
