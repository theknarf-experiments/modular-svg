import { NavLink, Route, Routes } from "react-router";
import { ExampleSection } from "./ExampleSection";
import { BakingRecipe } from "./examples/BakingRecipe";
import bakingRecipeCode from "./examples/BakingRecipe.tsx?raw";
import { BarChart } from "./examples/BarChart";
import barChartCode from "./examples/BarChart.tsx?raw";
import { ContextForwarding } from "./examples/ContextForwarding";
import contextForwardingCode from "./examples/ContextForwarding.tsx?raw";
import { ContrastExample } from "./examples/ContrastExample";
import contrastExampleCode from "./examples/ContrastExample.tsx?raw";
import { CustomStyling } from "./examples/CustomStyling";
import customStylingCode from "./examples/CustomStyling.tsx?raw";
import { DistinctColorsExample } from "./examples/DistinctColorsExample";
import distinctColorsExampleCode from "./examples/DistinctColorsExample.tsx?raw";
import { EventHandlers } from "./examples/EventHandlers";
import eventHandlersCode from "./examples/EventHandlers.tsx?raw";
import gitGraphCode from "./examples/GitGraph.tsx?raw";
import { GitGraphExample } from "./examples/GitGraphExample";
import gitGraphExampleCode from "./examples/GitGraphExample.tsx?raw";
import { InteractiveState } from "./examples/InteractiveState";
import interactiveStateCode from "./examples/InteractiveState.tsx?raw";
import packetDiagramCode from "./examples/PacketDiagram.tsx?raw";
import { PacketDiagramExample } from "./examples/PacketDiagramExample";
import packetDiagramExampleCode from "./examples/PacketDiagramExample.tsx?raw";
import { PlanetExample } from "./examples/PlanetExample";
import planetExampleCode from "./examples/PlanetExample.tsx?raw";
import { PulleyDiagram } from "./examples/PulleyDiagram";
import pulleyDiagramCode from "./examples/PulleyDiagram.tsx?raw";
import { QuantumCircuit } from "./examples/QuantumCircuit";
import quantumCircuitCode from "./examples/QuantumCircuit.tsx?raw";
import { ReactComponents } from "./examples/ReactComponents";
import reactComponentsCode from "./examples/ReactComponents.tsx?raw";
import { SameColorExample } from "./examples/SameColorExample";
import sameColorExampleCode from "./examples/SameColorExample.tsx?raw";
import sequenceDiagramCode from "./examples/SequenceDiagram.tsx?raw";
import { SequenceDiagramExample } from "./examples/SequenceDiagramExample";
import sequenceDiagramExampleCode from "./examples/SequenceDiagramExample.tsx?raw";
import { ShapesAndStacks } from "./examples/ShapesAndStacks";
import shapesAndStacksCode from "./examples/ShapesAndStacks.tsx?raw";
import "./modular-svg.d.ts";

type Section = {
	title: string;
	description: string;
	code: string;
	element?: React.ReactNode;
};

type Page = { path: string; title: string; sections: Section[] };

const pages: Page[] = [
	{
		path: "/",
		title: "Basics",
		sections: [
			{
				title: "Shapes and Stacks",
				description:
					"Circles and rectangles arranged with stackH and stackV - stacks nest to build up larger layouts",
				code: shapesAndStacksCode,
				element: <ShapesAndStacks />,
			},
			{
				title: "React Components",
				description: "Using React components to create reusable shapes",
				code: reactComponentsCode,
				element: <ReactComponents />,
			},
			{
				title: "Custom Styling",
				description:
					"Canvas accepts standard div props like className and style",
				code: customStylingCode,
				element: <CustomStyling />,
			},
			{
				title: "Distinct Colors",
				description:
					"DistinctColors spreads the children's hues evenly around the wheel, so a set of shapes picks distinct colors automatically - none are chosen in the markup",
				code: distinctColorsExampleCode,
				element: <DistinctColorsExample />,
			},
			{
				title: "Same Color",
				description:
					"SameColor copies one source color onto every follower - the color analogue of a span. Change the source and they all follow",
				code: sameColorExampleCode,
				element: <SameColorExample />,
			},
			{
				title: "Readable Contrast",
				description:
					"Contrast adjusts a label's lightness to meet a WCAG ratio against its background, so text stays legible over any color",
				code: contrastExampleCode,
				element: <ContrastExample />,
			},
		],
	},
	{
		path: "/interactive",
		title: "Interactivity",
		sections: [
			{
				title: "Interactive with React State",
				description:
					"Adjust the controls to see the layout update in real-time - including the margin the Canvas reserves around the content",
				code: interactiveStateCode,
				element: <InteractiveState />,
			},
			{
				title: "Interactive Event Handlers",
				description: "Click on circles to see event handlers in action",
				code: eventHandlersCode,
				element: <EventHandlers />,
			},
			{
				title: "React Context Forwarding",
				description:
					"React contexts automatically flow into Canvas children - no special setup required",
				code: contextForwardingCode,
				element: <ContextForwarding />,
			},
		],
	},
	{
		path: "/diagrams",
		title: "Diagrams",
		sections: [
			{
				title: "Planet Example",
				description:
					"A complete adaptation of examples/planet.json using Background, StackH, Text, Align, Distribute, Arrow, and Ref",
				code: planetExampleCode,
				element: <PlanetExample />,
			},
			{
				title: "Interactive Bar Chart",
				description:
					"Bars bottom-aligned in a stackH, with align, distribute, and an arrow pointing out the tallest bar - adjust scale and spacing",
				code: barChartCode,
				element: <BarChart />,
			},
		],
	},
	{
		path: "/sequence",
		title: "Sequence Diagram",
		sections: [
			{
				title: "Sequence diagrams from data",
				description:
					"A reusable SequenceDiagram component renders any conversation - only the actors, messages, and activations arrays change",
				code: sequenceDiagramExampleCode,
				element: <SequenceDiagramExample />,
			},
			{
				title: "How the SequenceDiagram component works",
				description:
					"The diagram class itself: actors in a stackH, dashed lifelines, messages as arrows between anchors positioned by align and distribute, and activation bars spanned to their message range",
				code: sequenceDiagramCode,
			},
		],
	},
	{
		path: "/packet",
		title: "Packet Diagram",
		sections: [
			{
				title: "Packet diagrams from data",
				description:
					"RFC-style header layouts from a flat field list - fields flow across 32-bit rows, and a field without a bit count fills the rest of its row via the stack's total sizing mode",
				code: packetDiagramExampleCode,
				element: <PacketDiagramExample />,
			},
			{
				title: "How the PacketDiagram component works",
				description:
					"Rows are stackHs with a fixed total width; sized cells take bits x bitWidth, unsized cells share the leftover; names and bit ranges are aligned onto each cell",
				code: packetDiagramCode,
			},
		],
	},
	{
		path: "/gitgraph",
		title: "Git Graph",
		sections: [
			{
				title: "Git graphs from data",
				description:
					"Branches become lanes, commits chain left to right on their branch's lane, and parent edges draw straight lines - two parents make a merge",
				code: gitGraphExampleCode,
				element: <GitGraphExample />,
			},
			{
				title: "How the GitGraph component works",
				description:
					"Branch pills define lane rows; invisible commit anchors chain horizontally with distribute and align to their lane; edges reference the anchors (painted under), then circles, ids, and tags go on top",
				code: gitGraphCode,
			},
		],
	},
	{
		path: "/baking-recipe",
		title: "Baking Recipe",
		sections: [
			{
				title: "Baking Recipe",
				description:
					"The Bluefish gallery brownie example: a recipe table built from padded cells, groups of refs as row/column guides, and span relations drawing the cell borders",
				code: bakingRecipeCode,
				element: <BakingRecipe />,
			},
		],
	},
	{
		path: "/quantum-circuit",
		title: "Quantum Circuit",
		sections: [
			{
				title: "Quantum Circuit",
				description:
					"The Bluefish gallery circuit-equivalence example: wires, boxed gates in fixed-size frames, control dots connected by lines, and highlight backgrounds over refs",
				code: quantumCircuitCode,
				element: <QuantumCircuit />,
			},
		],
	},
	{
		path: "/pulley",
		title: "Pulley System",
		sections: [
			{
				title: "Pulley System",
				description:
					"The Bluefish gallery pulley example: distributed pulleys, path-based weights, and fractional line anchors for the ropes",
				code: pulleyDiagramCode,
				element: <PulleyDiagram />,
			},
		],
	},
];

function PageContent({ page }: { page: Page }) {
	return (
		<main style={{ minWidth: 0 }}>
			{page.sections.map((s) => (
				<ExampleSection
					key={s.title}
					title={s.title}
					description={s.description}
					code={s.code}
				>
					{s.element}
				</ExampleSection>
			))}
		</main>
	);
}

function App() {
	return (
		<div
			style={{
				fontFamily: "system-ui, sans-serif",
				padding: "2rem",
				display: "grid",
				gridTemplateColumns: "220px minmax(0, 1fr)",
				gap: "2rem",
				alignItems: "start",
			}}
		>
			<nav style={{ position: "sticky", top: "2rem" }}>
				<h1 style={{ fontSize: "1.2rem", marginTop: 0 }}>Modular SVG</h1>
				<p style={{ color: "#666", fontSize: "13px" }}>
					Declarative SVG layouts with automatic constraint solving
				</p>
				<ul style={{ listStyle: "none", padding: 0, lineHeight: 2 }}>
					{pages.map((p) => (
						<li key={p.path}>
							<NavLink
								to={p.path}
								style={({ isActive }) => ({
									color: isActive ? "#111" : "#555",
									fontWeight: isActive ? 600 : 400,
									textDecoration: "none",
								})}
							>
								{p.title}
							</NavLink>
						</li>
					))}
				</ul>
			</nav>
			<Routes>
				{pages.map((p) => (
					<Route
						key={p.path}
						path={p.path}
						element={<PageContent page={p} />}
					/>
				))}
			</Routes>
		</div>
	);
}

export default App;
