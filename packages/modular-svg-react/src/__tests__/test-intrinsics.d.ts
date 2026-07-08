// Shared JSX intrinsics for reconciler tests (merged program-wide, so they
// must be declared exactly once)
import type * as React from "react";

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			stackH: {
				key?: React.Key;
				spacing?: number;
				children?: React.ReactNode;
			};
			stackV: {
				key?: React.Key;
				spacing?: number;
				children?: React.ReactNode;
			};
			arrow: { key?: React.Key; children?: React.ReactNode };
			ref: { key?: React.Key; target: string };
			background: {
				key?: React.Key;
				padding?: number;
				children?: React.ReactNode;
			};
			align: {
				key?: React.Key;
				axis?: "x" | "y";
				alignment?: string;
				children?: React.ReactNode;
			};
			distribute: {
				key?: React.Key;
				axis?: "x" | "y";
				spacing?: number;
				children?: React.ReactNode;
			};
		}
	}
}
