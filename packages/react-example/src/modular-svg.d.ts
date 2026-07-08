// Type declarations for modular-svg elements
declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			// Layout containers
			stackH: {
				key?: React.Key;
				spacing?: number;
				alignment?: "top" | "center" | "bottom" | "centerY";
				children?: React.ReactNode;
			};
			stackV: {
				key?: React.Key;
				spacing?: number;
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
				children?: string;
			};
			arrow: {
				key?: React.Key;
				fill?: string;
				stroke?: string;
				"stroke-width"?: number;
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
				source?: number[];
				target?: number[];
				children?: React.ReactNode;
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
