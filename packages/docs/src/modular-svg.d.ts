// Type declarations for modular-svg elements
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
			};
			group: {
				key?: React.Key;
				children?: React.ReactNode;
			};
		}
	}
}

export {};
