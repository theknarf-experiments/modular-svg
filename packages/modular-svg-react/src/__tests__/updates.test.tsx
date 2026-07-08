import { solveLayout } from "@modular-svg/core";
import type * as React from "react";
import { describe, expect, it } from "vitest";
import { act, createRoot } from "../reconciler";

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			stackH: {
				key?: React.Key;
				spacing?: number;
				children?: React.ReactNode;
			};
			align: {
				key?: React.Key;
				axis?: string;
				alignment?: string;
				children?: React.ReactNode;
			};
			ref: { key?: React.Key; target: string };
		}
	}
}

function Scene({ target, label }: { target: string; label: string }) {
	return (
		<>
			<stackH key="planets" spacing={50}>
				<circle key="mercury" r={15} />
				<circle key="venus" r={36} />
			</stackH>
			<align key="al" axis="x" alignment="center">
				<text key="label">{label}</text>
				<ref target={target} />
			</align>
		</>
	);
}

describe("re-render updates", () => {
	it("text content and ref targets update on re-render", async () => {
		const root = createRoot();
		await act(async () => {
			await root.render(<Scene target="mercury" label="Mercury" />);
		});
		let scene = root.getScene();
		expect(scene.nodes.find((n) => n.id === "label")?.text).toBe("Mercury");

		await act(async () => {
			await root.render(<Scene target="venus" label="Venus" />);
		});
		scene = root.getScene();
		expect(scene.nodes.find((n) => n.id === "label")?.text).toBe("Venus");

		// the align ref now anchors on venus: label centered over it
		const layout = solveLayout(scene);
		const venus = layout.venus;
		const label = layout.label;
		expect(label.x + label.width / 2).toBeCloseTo(venus.x + venus.width / 2, 3);
	});
});
