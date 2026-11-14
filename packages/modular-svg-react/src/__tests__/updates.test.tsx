import { solveLayout } from "@modular-svg/core";
import { describe, expect, it } from "vitest";
import { act, createRoot } from "../reconciler";

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

function Reorder({ order }: { order: string[] }) {
	return (
		<>
			<stackH key="row" spacing={10}>
				<rect key="a" width={20} height={10} />
				<rect key="b" width={30} height={10} />
				<rect key="c" width={40} height={10} />
			</stackH>
			<modulate key="m" at={1} over={1}>
				<stackH key="o" spacing={10}>
					{order.map((o) => (
						<ref key={o} target={o} />
					))}
				</stackH>
			</modulate>
		</>
	);
}

function Row({ order }: { order: string[] }) {
	return (
		<stackH key="row" spacing={10}>
			{order.map((o) => (
				<rect key={o} width={20} height={10} />
			))}
		</stackH>
	);
}

describe("reordering keyed children", () => {
	it("moves refs inside a Modulate instead of duplicating them", async () => {
		const root = createRoot();
		await act(async () => {
			await root.render(<Reorder order={["c", "b", "a"]} />);
		});
		await act(async () => {
			await root.render(<Reorder order={["b", "c", "a"]} />);
		});
		const fresh = createRoot();
		await act(async () => {
			await fresh.render(<Reorder order={["b", "c", "a"]} />);
		});
		const [updated, expected] = [root.getScene(), fresh.getScene()];
		expect(updated.warnings).toEqual([]);
		expect(solveLayout(updated)).toEqual(solveLayout(expected));
	});

	it("moves keyed marks in a home stack", async () => {
		const root = createRoot();
		await act(async () => {
			await root.render(<Row order={["a", "b", "c"]} />);
		});
		await act(async () => {
			await root.render(<Row order={["c", "a", "b"]} />);
		});
		const layout = solveLayout(root.getScene());
		expect(layout.c.x).toBeLessThan(layout.a.x);
		expect(layout.a.x).toBeLessThan(layout.b.x);
	});

	it("moves keyed top-level nodes", async () => {
		const root = createRoot();
		const top = (order: string[]) =>
			order.map((o) => <rect key={o} width={20} height={10} />);
		await act(async () => {
			await root.render(top(["a", "b", "c"]));
		});
		await act(async () => {
			await root.render(top(["c", "a", "b"]));
		});
		const ids = root
			.getScene()
			.nodes.map((n) => n.id)
			.filter((id) => ["a", "b", "c"].includes(id));
		expect(ids).toEqual(["c", "a", "b"]);
	});
});
