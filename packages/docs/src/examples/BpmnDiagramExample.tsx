import {
	BpmnDiagram,
	type BpmnNode,
	type Flow,
	type Lane,
} from "./BpmnDiagram";

const lanes: Lane[] = [
	{ id: "employee", label: "Employee" },
	{ id: "finance", label: "Finance" },
];

// column places a node left to right, lane places it top to bottom
const nodes: BpmnNode[] = [
	{
		id: "incurred",
		type: "event",
		kind: "start",
		column: 0,
		lane: "employee",
		label: "Expense\nincurred",
	},
	{
		id: "submit",
		type: "task",
		column: 1,
		lane: "employee",
		label: "Submit\nclaim",
		marker: "user",
	},
	{
		id: "logged",
		type: "event",
		kind: "intermediate",
		column: 2,
		lane: "finance",
		label: "Claim\nlogged",
	},
	{
		id: "review",
		type: "task",
		column: 3,
		lane: "finance",
		label: "Review\nreceipts",
		marker: "user",
	},
	{
		id: "approved",
		type: "gateway",
		kind: "exclusive",
		column: 4,
		lane: "finance",
		label: "Approved?",
	},
	{
		id: "revise",
		type: "task",
		column: 5,
		lane: "employee",
		label: "Revise\nclaim",
		marker: "script",
	},
	{
		id: "pay",
		type: "task",
		column: 6,
		lane: "finance",
		label: "Reimburse",
		marker: "service",
	},
	{
		id: "settled",
		type: "event",
		kind: "end",
		column: 7,
		lane: "finance",
		label: "Claim\nsettled",
	},
];

const flows: Flow[] = [
	{ from: "incurred", to: "submit" },
	{ from: "submit", to: "logged" },
	{ from: "logged", to: "review" },
	{ from: "review", to: "approved" },
	{ from: "approved", to: "pay", label: "yes" },
	{ from: "approved", to: "revise", kind: "default" },
	// a flow to an earlier column is a rework loop, routed under the pool
	{ from: "revise", to: "submit", label: "resubmit" },
	{ from: "pay", to: "settled" },
];

// The same component without lanes: a bare process with a parallel split
// and join, where both branches must finish before the flow continues
const buildNodes: BpmnNode[] = [
	{ id: "push", type: "event", kind: "start", column: 0, label: "Push" },
	{ id: "fork", type: "gateway", kind: "parallel", column: 1 },
	{
		id: "unit",
		type: "task",
		column: 2,
		label: "Run unit\ntests",
		marker: "script",
	},
	{
		id: "lint",
		type: "task",
		column: 2,
		lane: "second",
		label: "Lint &\ntypecheck",
		marker: "script",
	},
	{ id: "join", type: "gateway", kind: "parallel", column: 3 },
	{
		id: "publish",
		type: "task",
		column: 4,
		label: "Publish\nartifact",
		marker: "service",
	},
	{ id: "green", type: "event", kind: "end", column: 5, label: "Build green" },
];

const buildFlows: Flow[] = [
	{ from: "push", to: "fork" },
	{ from: "fork", to: "unit" },
	{ from: "fork", to: "lint" },
	{ from: "unit", to: "join" },
	{ from: "lint", to: "join" },
	{ from: "join", to: "publish" },
	{ from: "publish", to: "green" },
];

export function BpmnDiagramExample() {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>Pool with lanes</h3>
				<BpmnDiagram
					lanes={lanes}
					poolLabel="Expense claim"
					nodes={nodes}
					flows={flows}
				/>
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>Bare process, no pool</h3>
				<BpmnDiagram
					lanes={[
						{ id: "first", label: "" },
						{ id: "second", label: "" },
					]}
					showPool={false}
					nodes={buildNodes}
					flows={buildFlows}
				/>
			</div>
		</div>
	);
}
