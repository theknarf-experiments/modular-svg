import { PieChart } from "./PieChart";

// The same component renders any breakdown - only the data changes.
export function PieChartExample() {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "2rem" }}>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>Language use</h3>
				<PieChart
					data={[
						{ label: "TypeScript", value: 62 },
						{ label: "Rust", value: 18 },
						{ label: "Python", value: 12 },
						{ label: "Shell", value: 8 },
					]}
				/>
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>Traffic source (donut)</h3>
				<PieChart
					donut={0.55}
					data={[
						{ label: "Direct", value: 40 },
						{ label: "Search", value: 35 },
						{ label: "Social", value: 25 },
					]}
				/>
			</div>
		</div>
	);
}
