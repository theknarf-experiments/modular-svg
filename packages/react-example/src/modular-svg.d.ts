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
					| "centerY";
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
				fill?: string;
				stroke?: string;
				"stroke-width"?: number;
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
			group: {
				key?: React.Key;
				children?: React.ReactNode;
			};
		}
	}
}

export {};
